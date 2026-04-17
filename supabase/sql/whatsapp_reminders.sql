-- Execute no Supabase SQL Editor.
-- Estrutura incremental para lembretes automáticos via WhatsApp (sem quebrar fluxo atual).

-- 1) Clientes: garantir coluna phone em formato internacional (+5511999999999)
alter table public.clients
  add column if not exists phone text;

create or replace function public.normalize_br_phone(raw_phone text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  if raw_phone is null then
    return null;
  end if;

  digits := regexp_replace(raw_phone, '\\D', '', 'g');

  if digits = '' then
    return null;
  end if;

  -- Ja veio com codigo do pais 55.
  if digits ~ '^55\\d{10,11}$' then
    return '+' || digits;
  end if;

  -- Telefone BR sem codigo de pais (DDD + numero).
  if digits ~ '^\\d{10,11}$' then
    return '+55' || digits;
  end if;

  -- Formato nao reconhecido.
  return null;
end;
$$;

update public.clients
set phone = public.normalize_br_phone(phone)
where coalesce(trim(phone), '') <> '';

-- Constraint em formato E.164. "not valid" evita quebra imediata por legado.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_phone_e164_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_phone_e164_check
      check (phone is null or phone ~ '^\\+[1-9]\\d{10,14}$')
      not valid;
  end if;
end;
$$;

comment on column public.clients.phone is 'Telefone em formato E.164. Ex.: +5511999999999.';

-- 2) Agendamentos: garantir start_time, status e controle de duplicacao
alter table public.appointments
  add column if not exists status text default 'confirmed';

alter table public.appointments
  add column if not exists start_time timestamptz;

alter table public.appointments
  add column if not exists reminder_sent boolean not null default false;

comment on column public.appointments.start_time is 'Data/hora do atendimento em timestamptz.';
comment on column public.appointments.reminder_sent is 'Controle de lembrete WhatsApp enviado para este agendamento.';

-- Backfill de start_time usando date/time ja existentes (America/Sao_Paulo).
update public.appointments
set start_time = ((date::timestamp + time) at time zone 'America/Sao_Paulo')
where start_time is null
  and date is not null
  and time is not null;

create or replace function public.sync_appointment_start_time()
returns trigger
language plpgsql
as $$
begin
  -- Compatibilidade: o app atual grava date/time.
  if new.date is not null and new.time is not null then
    new.start_time := ((new.date::timestamp + new.time) at time zone 'America/Sao_Paulo');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_appointment_start_time on public.appointments;
create trigger trg_sync_appointment_start_time
before insert or update of date, time
on public.appointments
for each row
execute function public.sync_appointment_start_time();

create index if not exists appointments_whatsapp_window_idx
  on public.appointments (start_time, user_id)
  where reminder_sent = false
    and status in ('pending', 'confirmed');

-- 3) Logs de envio para auditoria/diagnostico
create table if not exists public.whatsapp_message_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  appointment_id uuid null references public.appointments(id) on delete set null,
  client_id uuid null references public.clients(id) on delete set null,
  phone text not null,
  message text not null,
  provider text not null default 'mock',
  status text not null check (status in ('sent', 'failed')),
  error text null,
  provider_message_id text null,
  payload jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_message_logs_user_created_idx
  on public.whatsapp_message_logs (user_id, created_at desc);

create index if not exists whatsapp_message_logs_appointment_idx
  on public.whatsapp_message_logs (appointment_id);

alter table public.whatsapp_message_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'whatsapp_message_logs'
      and policyname = 'whatsapp_logs_own_select'
  ) then
    create policy whatsapp_logs_own_select
      on public.whatsapp_message_logs for select
      using (auth.uid() = user_id);
  end if;
end;
$$;
