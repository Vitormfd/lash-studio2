-- P2 da auditoria (18/11/2026): recursos extras, todos opcionais e desligados por padrão.
--
-- 1. config.extras (jsonb): liga/desliga e ajustes de cada recurso extra.
--    config.booking_slug: apelido único do link (easystudio.com.br/agendar/<apelido>).
-- 2. Aniversário da cliente (clients.birthday, "MM-DD", sem o ano).
-- 3. Sinal via Pix no link público: o valor fica no agendamento (deposit_amount /
--    deposit_status). O dinheiro vai direto para a chave Pix da profissional.
-- 4. Ficha da cliente: anamnese + termo assinado (client_records) e fotos (client_photos),
--    arquivos no bucket privado client-files/<user_id>/<client_id>/...
-- 5. get_public_booking_profile: resolve o link (id ou apelido) e devolve só o que a
--    profissional ligou (perfil e dados do Pix do sinal).
--
-- Aplicar: npx supabase db query --linked -f supabase/sql/p2_extras.sql

begin;

-- ─── 1. Config ────────────────────────────────────────────────────────────────
alter table public.config add column if not exists extras jsonb not null default '{}'::jsonb;
alter table public.config add column if not exists booking_slug text;

alter table public.config drop constraint if exists config_booking_slug_format;
alter table public.config add constraint config_booking_slug_format
  check (booking_slug is null or booking_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$');

create unique index if not exists config_booking_slug_unique
  on public.config (lower(booking_slug))
  where booking_slug is not null;

-- ─── 2. Aniversário ───────────────────────────────────────────────────────────
alter table public.clients add column if not exists birthday text;
alter table public.clients drop constraint if exists clients_birthday_format;
alter table public.clients add constraint clients_birthday_format
  check (birthday is null or birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');

-- ─── 3. Sinal ─────────────────────────────────────────────────────────────────
alter table public.appointments add column if not exists deposit_amount numeric(10, 2);
alter table public.appointments add column if not exists deposit_status text;
alter table public.appointments drop constraint if exists appointments_deposit_status_check;
alter table public.appointments add constraint appointments_deposit_status_check
  check (deposit_status is null or deposit_status in ('pending', 'paid', 'waived'));

-- Reserva pelo link público: se a profissional ligou o sinal, grava o valor no agendamento.
-- Nunca derruba a reserva (qualquer erro aqui só deixa o agendamento sem sinal).
create or replace function public.set_public_booking_deposit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dep jsonb;
  v_val numeric;
  v_amount numeric;
begin
  if coalesce(current_setting('app.public_booking', true), '') <> 'true' then
    return new;
  end if;
  if coalesce(new.blocked, false) then
    return new;
  end if;

  begin
    select c.extras -> 'deposit' into v_dep from public.config c where c.user_id = new.user_id;
    if v_dep is null
      or coalesce(v_dep ->> 'enabled', 'false') <> 'true'
      or nullif(trim(coalesce(v_dep ->> 'pixKey', '')), '') is null then
      return new;
    end if;

    v_val := greatest(coalesce(nullif(v_dep ->> 'value', '')::numeric, 0), 0);
    if v_dep ->> 'type' = 'percent' then
      v_amount := round(coalesce(new.value, 0) * least(v_val, 100) / 100, 2);
    else
      v_amount := round(v_val, 2);
      if coalesce(new.value, 0) > 0 then
        v_amount := least(v_amount, new.value);
      end if;
    end if;

    if v_amount > 0 then
      new.deposit_amount := v_amount;
      new.deposit_status := 'pending';
    end if;
  exception when others then
    raise warning 'set_public_booking_deposit (profissional %): %', new.user_id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.set_public_booking_deposit() from public, anon, authenticated;

drop trigger if exists trg_appointments_public_deposit on public.appointments;
create trigger trg_appointments_public_deposit
  before insert on public.appointments
  for each row execute function public.set_public_booking_deposit();

-- ─── 4. Ficha da cliente ──────────────────────────────────────────────────────
create table if not exists public.client_records (
  client_id uuid primary key references public.clients (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  anamnese jsonb not null default '{}'::jsonb,
  consent_text text,
  consent_name text,
  consent_signed_at timestamptz,
  signature_path text,
  updated_at timestamptz not null default now()
);
create index if not exists client_records_user_idx on public.client_records (user_id);

create table if not exists public.client_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  path text not null,
  kind text not null default 'outro' check (kind in ('antes', 'depois', 'outro')),
  caption text,
  taken_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists client_photos_client_idx on public.client_photos (user_id, client_id, created_at desc);

alter table public.client_records enable row level security;
alter table public.client_photos enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['client_records', 'client_photos'] loop
    execute format('drop policy if exists %1$s_select_own on public.%1$I', tbl);
    execute format('drop policy if exists %1$s_insert_own on public.%1$I', tbl);
    execute format('drop policy if exists %1$s_update_own on public.%1$I', tbl);
    execute format('drop policy if exists %1$s_delete_own on public.%1$I', tbl);
    execute format('create policy %1$s_select_own on public.%1$I for select to authenticated using (auth.uid() = user_id)', tbl);
    -- Só grava ficha/foto de cliente da própria conta.
    execute format(
      'create policy %1$s_insert_own on public.%1$I for insert to authenticated with check (
         auth.uid() = user_id
         and exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()))', tbl);
    execute format(
      'create policy %1$s_update_own on public.%1$I for update to authenticated using (auth.uid() = user_id) with check (
         auth.uid() = user_id
         and exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()))', tbl);
    execute format('create policy %1$s_delete_own on public.%1$I for delete to authenticated using (auth.uid() = user_id)', tbl);
    -- Conta vencida não grava (mesma regra das outras tabelas).
    execute format('drop trigger if exists trg_%1$s_enforce_full_access on public.%1$I', tbl);
    execute format(
      'create trigger trg_%1$s_enforce_full_access before insert or update or delete on public.%1$I
         for each row execute function public.enforce_full_access_write()', tbl);
  end loop;
end;
$$;

revoke all on public.client_records, public.client_photos from anon;
grant select, insert, update, delete on public.client_records, public.client_photos to authenticated;

-- Arquivos (fotos e assinatura), privados: <user_id>/<client_id>/<arquivo>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-files', 'client-files', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists client_files_select on storage.objects;
create policy client_files_select
  on storage.objects for select to authenticated
  using (bucket_id = 'client-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists client_files_insert on storage.objects;
create policy client_files_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'client-files'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_full_access(auth.uid())
  );

drop policy if exists client_files_delete on storage.objects;
create policy client_files_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'client-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─── 5. Perfil público do link ────────────────────────────────────────────────
create or replace function public.get_public_booking_profile(p_identifier text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clean text := lower(trim(coalesce(p_identifier, '')));
  v_uid uuid;
  v_extras jsonb;
  v_slug text;
  v_profile jsonb;
  v_dep jsonb;
begin
  if v_clean = '' or length(v_clean) > 64 then
    return null;
  end if;

  if v_clean ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_uid := v_clean::uuid;
  else
    select c.user_id into v_uid from public.config c where lower(c.booking_slug) = v_clean limit 1;
  end if;
  if v_uid is null then
    return null;
  end if;

  select coalesce(c.extras, '{}'::jsonb), c.booking_slug into v_extras, v_slug
  from public.config c where c.user_id = v_uid;
  v_extras := coalesce(v_extras, '{}'::jsonb);

  if coalesce(v_extras #>> '{profile,enabled}', 'false') = 'true' then
    v_profile := jsonb_build_object(
      'business_name', left(coalesce(v_extras #>> '{profile,businessName}', ''), 60),
      'address', left(coalesce(v_extras #>> '{profile,address}', ''), 160),
      'instagram', left(coalesce(v_extras #>> '{profile,instagram}', ''), 40),
      'policy', left(coalesce(v_extras #>> '{profile,policy}', ''), 600)
    );
  end if;

  if coalesce(v_extras #>> '{deposit,enabled}', 'false') = 'true'
    and nullif(trim(coalesce(v_extras #>> '{deposit,pixKey}', '')), '') is not null then
    v_dep := jsonb_build_object(
      'type', coalesce(v_extras #>> '{deposit,type}', 'fixed'),
      'value', coalesce(v_extras #> '{deposit,value}', '0'::jsonb),
      'pix_key_type', coalesce(v_extras #>> '{deposit,pixKeyType}', 'phone'),
      'pix_key', v_extras #>> '{deposit,pixKey}',
      'holder_name', coalesce(v_extras #>> '{deposit,holderName}', ''),
      'city', coalesce(v_extras #>> '{deposit,city}', '')
    );
  end if;

  return jsonb_build_object('professional_id', v_uid, 'slug', v_slug, 'profile', v_profile, 'deposit', v_dep);
end;
$$;

revoke all on function public.get_public_booking_profile(text) from public;
grant execute on function public.get_public_booking_profile(text) to anon, authenticated;

commit;
notify pgrst, 'reload schema';
