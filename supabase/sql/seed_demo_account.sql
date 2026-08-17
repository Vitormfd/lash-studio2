-- =============================================================================
-- Conta de demonstração Easy Studio (Lash designer) — tudo preenchido
-- Cole no Supabase → SQL Editor → Run
-- Idempotente: pode rodar de novo; recria só os dados desta conta.
-- =============================================================================
-- Login:
--   E-mail....: demo.clientes@easystudio.com.br
--   Senha.....: DemoStudio2026!
--   Plano.....: full (manual_grant — o Stripe não rebaixa)
-- Operadores (PIN na tela de equipe):
--   Camila  → 1234
--   Beatriz → 5678
-- =============================================================================

create or replace function pg_temp.demo_seed_appt(
  p_user uuid,
  p_clients uuid[],
  p_services uuid[],
  p_date date,
  p_time time,
  p_svc_idx int,
  p_cli_idx int
) returns void
language plpgsql
as $$
declare
  v_svc uuid;
  v_cli uuid;
  v_price numeric;
  v_dur int;
  v_status text;
  v_pay text;
  v_notes text;
  v_paid_at timestamptz;
  v_hash int;
  v_durs int[] := array[150, 120, 180, 90, 75, 45, 75];
  v_ncli int := coalesce(array_length(p_clients, 1), 1);
  v_nsvc int := coalesce(array_length(p_services, 1), 1);
begin
  p_svc_idx := 1 + ((p_svc_idx - 1) % v_nsvc);
  p_cli_idx := 1 + ((p_cli_idx - 1) % v_ncli);
  v_svc := p_services[p_svc_idx];
  v_cli := p_clients[p_cli_idx];
  select price into v_price from public.services where id = v_svc;
  v_dur := coalesce(v_durs[p_svc_idx], 60);
  v_hash := abs(hashtext(p_date::text || p_time::text));

  if p_date < current_date then
    if v_hash % 12 = 0 then
      v_status := 'cancelled';
      v_pay := null;
      v_paid_at := null;
      v_notes := 'Cliente desmarcou no WhatsApp';
    else
      v_status := 'done';
      v_pay := (array['pix', 'pix', 'pix', 'cash', 'credit_card', 'debit_card'])[1 + (v_hash % 6)];
      v_paid_at := ((p_date + p_time + (v_dur || ' minutes')::interval) at time zone 'America/Sao_Paulo');
      v_notes := case v_hash % 5
        when 0 then 'Cliente confirmou pelo WhatsApp'
        when 1 then 'Retoque no canto externo'
        when 2 then ''
        when 3 then 'Usou cola hipoalergênica'
        else 'Pagamento no atendimento'
      end;
    end if;
  elsif p_date = current_date then
    if p_time < time '12:00' then
      v_status := 'done';
      v_pay := 'pix';
      v_paid_at := now();
      v_notes := 'Atendimento concluído';
    elsif p_time < time '15:00' then
      v_status := 'confirmed';
      v_pay := null;
      v_paid_at := null;
      v_notes := 'Cliente confirmou pelo WhatsApp';
    else
      v_status := 'pending';
      v_pay := null;
      v_paid_at := null;
      v_notes := '';
    end if;
  else
    if v_hash % 3 = 0 then
      v_status := 'pending';
      v_notes := '';
    else
      v_status := 'confirmed';
      v_notes := 'Cliente confirmou pelo WhatsApp';
    end if;
    v_pay := null;
    v_paid_at := null;
  end if;

  insert into public.appointments (
    id, user_id, client_id, service_id, date, time, value, notes,
    status, blocked, duration_minutes,
    reminder_enabled, reminder_minutes_before,
    notification_status, reminder_sent_at,
    payment_method, payment_value, payment_notes, paid_at
  ) values (
    gen_random_uuid(), p_user, v_cli, v_svc, p_date, p_time, v_price, v_notes,
    v_status, false, v_dur,
    (v_status in ('pending', 'confirmed') and p_date >= current_date),
    60,
    case when v_status = 'done' then 'sent' else 'none' end,
    case when v_status = 'done' then v_paid_at - interval '70 minutes' else null end,
    v_pay,
    case when v_status = 'done' then v_price else null end,
    case
      when v_pay = 'pix' then 'Pix na hora'
      when v_pay = 'cash' then 'Troco para 200'
      else null
    end,
    v_paid_at
  );
end;
$$;

do $$
declare
  v_email text := 'demo.clientes@easystudio.com.br';
  v_password text := 'DemoStudio2026!';
  v_name text := 'Ana Luna';
  v_user_id uuid;
  v_identity_id uuid;
  v_client uuid[];
  v_service uuid[];
  v_cola uuid;
  v_fios uuid;
  v_pads uuid;
  v_removedor uuid;
  v_pinca uuid;
  v_primer uuid;
  v_member_camila uuid := gen_random_uuid();
  v_member_beatriz uuid := gen_random_uuid();
  v_date date;
  v_dow int;
  v_i int;
  v_n int;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('app.public_booking', 'true', true);

  -- ── 1) Usuário ────────────────────────────────────────────────────────────
  select id into v_user_id from auth.users where email = v_email;

  if v_user_id is null then
    v_user_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, recovery_sent_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', v_name, 'professional_type', 'lash'),
      now(), now(),
      '', '', '', ''
    );

    v_identity_id := gen_random_uuid();
    begin
      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) values (
        v_identity_id,
        v_user_id,
        v_user_id::text,
        jsonb_build_object(
          'sub', v_user_id::text,
          'email', v_email,
          'email_verified', true,
          'phone_verified', false
        ),
        'email',
        now(), now(), now()
      );
    exception when others then
      insert into auth.identities (
        id, user_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) values (
        v_identity_id,
        v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email),
        'email',
        now(), now(), now()
      );
    end;
  else
    update auth.users
    set
      encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_user_meta_data = jsonb_build_object('name', v_name, 'professional_type', 'lash'),
      updated_at = now()
    where id = v_user_id;
  end if;

  -- ── 2) Plano completo ─────────────────────────────────────────────────────
  insert into public.profiles (
    id, plan, access_level, professional_type, manual_grant, subscription_expires_at
  ) values (
    v_user_id, 'active', 'full', 'lash', true, null
  )
  on conflict (id) do update set
    plan = 'active',
    access_level = 'full',
    professional_type = 'lash',
    manual_grant = true,
    subscription_expires_at = null,
    updated_at = now();

  -- ── 3) Limpa dados anteriores desta conta ─────────────────────────────────
  delete from public.appointments where user_id = v_user_id;
  delete from public.inventory_movements where user_id = v_user_id;
  delete from public.inventory_items where user_id = v_user_id;
  delete from public.audit_log where user_id = v_user_id;
  delete from public.team_members where user_id = v_user_id;
  delete from public.clients where user_id = v_user_id;
  delete from public.services where user_id = v_user_id;
  delete from public.config where user_id = v_user_id;

  -- ── 4) Configuração ───────────────────────────────────────────────────────
  insert into public.config (
    user_id, avg_cost, salary_percentage, state_uf, city, work_hours
  ) values (
    v_user_id,
    18.50,
    60,
    'SP',
    'São Paulo',
    '{
      "mon": {"closed": false, "start": "08:00", "end": "18:00"},
      "tue": {"closed": false, "start": "08:00", "end": "18:00"},
      "wed": {"closed": false, "start": "08:00", "end": "18:00"},
      "thu": {"closed": false, "start": "08:00", "end": "18:00"},
      "fri": {"closed": false, "start": "08:00", "end": "18:00"},
      "sat": {"closed": false, "start": "08:00", "end": "14:00"},
      "sun": {"closed": true,  "start": "08:00", "end": "18:00"}
    }'::jsonb
  );

  -- ── 5) Serviços ───────────────────────────────────────────────────────────
  with src(ord, name, price, color, cost_per_client) as (
    values
      (1, 'Volume brasileiro', 180.00, '#C17B82', 22.00),
      (2, 'Fio a fio',         140.00, '#9B8FB8', 16.00),
      (3, 'Volume russo',      230.00, '#6B9AC4', 28.00),
      (4, 'Manutenção',        100.00, '#7BAF9A', 12.00),
      (5, 'Lash lifting',      120.00, '#D4A574', 14.00),
      (6, 'Remoção',            50.00, '#B5838D',  6.00),
      (7, 'Brow lamination',   130.00, '#8B7E74', 15.00)
  )
  insert into public.services (id, user_id, name, price, color, cost_per_client)
  select gen_random_uuid(), v_user_id, name, price, color, cost_per_client
  from src
  order by ord;

  select array_agg(id order by
    case name
      when 'Volume brasileiro' then 1
      when 'Fio a fio' then 2
      when 'Volume russo' then 3
      when 'Manutenção' then 4
      when 'Lash lifting' then 5
      when 'Remoção' then 6
      else 7
    end
  )
  into v_service
  from public.services
  where user_id = v_user_id;

  -- ── 6) Clientes ───────────────────────────────────────────────────────────
  with src(name, phone, notes) as (
    values
      ('Marina Costa',      '+5511988810001', 'Prefere efeito mais marcado. Alérgica a cola comum — usar hipoalergênica.'),
      ('Bianca Lima',       '+5511988810002', 'Sensibilidade leve na região dos olhos. Evitar horário muito cedo.'),
      ('Patricia Rocha',    '+5511988810003', 'Retorna a cada 15 dias. Gosta de volume médio.'),
      ('Camila Ferreira',   '+5511988810004', 'Noiva em outubro. Quer efeito natural para o dia a dia.'),
      ('Juliana Mendes',    '+5511988810005', 'Prefere agenda no começo da manhã. Paga sempre no Pix.'),
      ('Fernanda Alves',    '+5511988810006', 'Faz volume russo. Trazer referência de foto no celular.'),
      ('Amanda Souza',      '+5511988810007', 'Primeira vez no estúdio. Explicar manutenção de 15–20 dias.'),
      ('Larissa Oliveira',  '+5511988810008', 'Gosta de conversar. Oferecer brow lamination no retorno.'),
      ('Beatriz Santos',    '+5511988810009', 'Lash lifting de manutenção mensal. Não usa extensão.'),
      ('Carolina Ribeiro',  '+5511988810010', 'Mora longe — confirmar sempre no dia anterior.'),
      ('Gabriela Martins',  '+5511988810011', 'Indicação da Marina. Quer o mesmo efeito dela.'),
      ('Isabela Nunes',     '+5511988810012', 'Usa cílios curtos. Mapear bem o canto interno.'),
      ('Vanessa Cardoso',   '+5511988810013', 'Agenda quinzenal fixa às quintas.'),
      ('Renata Moreira',    '+5511988810014', 'Prefere cartão. Às vezes atrasa 10 minutos.')
  )
  insert into public.clients (id, user_id, name, phone, notes, created_at)
  select
    gen_random_uuid(),
    v_user_id,
    name,
    phone,
    notes,
    now() - (row_number() over ()) * interval '4 days'
  from src;

  select array_agg(id order by name) into v_client
  from public.clients
  where user_id = v_user_id;

  -- ── 7) Equipe ─────────────────────────────────────────────────────────────
  insert into public.team_members (id, user_id, name, color, pin_hash, active, created_at, updated_at)
  values
    (
      v_member_camila, v_user_id, 'Camila', '#9B8FB8',
      '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
      true, now() - interval '40 days', now()
    ),
    (
      v_member_beatriz, v_user_id, 'Beatriz', '#C17B82',
      'f8638b979b2f4f793ddb6dbd197e0ee25a7a6ea32b0ae22f5e3c5d119d839e75',
      true, now() - interval '20 days', now()
    );

  -- ── 8) Estoque ────────────────────────────────────────────────────────────
  insert into public.inventory_items (
    id, user_id, name, category, unit, cost_price, sell_price, stock, min_stock,
    supplier, notes, created_at, updated_at
  ) values
    (gen_random_uuid(), v_user_id, 'Cola Pro Fix', 'Fixação', 'un', 58, 0, 8, 3, 'BeautyLab', 'Validade 6 meses após aberto. Geladeira.', now() - interval '35 days', now()),
    (gen_random_uuid(), v_user_id, 'Fios 0.07 C mix', 'Fios', 'cx', 42, 0, 12, 4, 'BeautyLab', 'Curvatura C, mix 8–13 mm.', now() - interval '35 days', now()),
    (gen_random_uuid(), v_user_id, 'Pads de hidrogel', 'Descartáveis', 'pct', 18, 0, 2, 5, 'LashStore', 'ESTOQUE BAIXO — repor esta semana.', now() - interval '35 days', now()),
    (gen_random_uuid(), v_user_id, 'Removedor em gel', 'Remoção', 'un', 32, 0, 5, 2, 'BeautyLab', '', now() - interval '35 days', now()),
    (gen_random_uuid(), v_user_id, 'Pinça curva Precision', 'Ferramentas', 'un', 89, 0, 3, 1, 'LashStore', 'Uso exclusivo da Ana.', now() - interval '35 days', now()),
    (gen_random_uuid(), v_user_id, 'Primer cílios', 'Preparação', 'un', 27, 0, 6, 2, 'BeautyLab', '', now() - interval '35 days', now());

  select id into v_cola from public.inventory_items where user_id = v_user_id and name = 'Cola Pro Fix';
  select id into v_fios from public.inventory_items where user_id = v_user_id and name = 'Fios 0.07 C mix';
  select id into v_pads from public.inventory_items where user_id = v_user_id and name = 'Pads de hidrogel';
  select id into v_removedor from public.inventory_items where user_id = v_user_id and name = 'Removedor em gel';
  select id into v_pinca from public.inventory_items where user_id = v_user_id and name = 'Pinça curva Precision';
  select id into v_primer from public.inventory_items where user_id = v_user_id and name = 'Primer cílios';

  insert into public.inventory_movements (id, user_id, item_id, type, qty, reason, created_at) values
    (gen_random_uuid(), v_user_id, v_cola, 'in', 10, 'Compra inicial', now() - interval '32 days'),
    (gen_random_uuid(), v_user_id, v_cola, 'out', 2, 'Uso da semana', now() - interval '7 days'),
    (gen_random_uuid(), v_user_id, v_fios, 'in', 15, 'Pedido BeautyLab', now() - interval '28 days'),
    (gen_random_uuid(), v_user_id, v_fios, 'out', 3, 'Atendimentos da quinzena', now() - interval '5 days'),
    (gen_random_uuid(), v_user_id, v_pads, 'in', 10, 'Compra LashStore', now() - interval '25 days'),
    (gen_random_uuid(), v_user_id, v_pads, 'out', 8, 'Uso diário (pads)', now() - interval '2 days'),
    (gen_random_uuid(), v_user_id, v_removedor, 'in', 6, 'Reposição removedor', now() - interval '18 days'),
    (gen_random_uuid(), v_user_id, v_removedor, 'out', 1, 'Remoção da Fernanda', now() - interval '9 days'),
    (gen_random_uuid(), v_user_id, v_pinca, 'in', 3, 'Kit de pinças novo', now() - interval '30 days'),
    (gen_random_uuid(), v_user_id, v_primer, 'in', 8, 'Pedido mensal', now() - interval '21 days'),
    (gen_random_uuid(), v_user_id, v_primer, 'out', 2, 'Uso da semana', now() - interval '3 days');

  -- ── 9) Agenda: 42 dias atrás até 14 dias à frente (pula domingo) ──────────
  for v_i in 0..56 loop
    v_date := (current_date - 42) + v_i;
    v_dow := extract(dow from v_date)::int;
    if v_dow = 0 then
      continue;
    end if;

    v_n := abs(hashtext(v_date::text)) % 3;

    if v_dow = 6 then
      perform pg_temp.demo_seed_appt(v_user_id, v_client, v_service, v_date, time '08:30', 1,
        1 + abs(hashtext(v_date::text || 'a')) % 14);
      perform pg_temp.demo_seed_appt(v_user_id, v_client, v_service, v_date, time '11:00', 4,
        1 + abs(hashtext(v_date::text || 'b')) % 14);
    elsif v_n = 0 then
      perform pg_temp.demo_seed_appt(v_user_id, v_client, v_service, v_date, time '09:00', 1,
        1 + abs(hashtext(v_date::text || '1')) % 14);
      perform pg_temp.demo_seed_appt(v_user_id, v_client, v_service, v_date, time '12:00', 4,
        1 + abs(hashtext(v_date::text || '2')) % 14);
      perform pg_temp.demo_seed_appt(v_user_id, v_client, v_service, v_date, time '14:30', 2,
        1 + abs(hashtext(v_date::text || '3')) % 14);
    elsif v_n = 1 then
      perform pg_temp.demo_seed_appt(v_user_id, v_client, v_service, v_date, time '08:30', 5,
        1 + abs(hashtext(v_date::text || '1')) % 14);
      perform pg_temp.demo_seed_appt(v_user_id, v_client, v_service, v_date, time '10:30', 3,
        1 + abs(hashtext(v_date::text || '2')) % 14);
      perform pg_temp.demo_seed_appt(v_user_id, v_client, v_service, v_date, time '14:00', 4,
        1 + abs(hashtext(v_date::text || '3')) % 14);
      perform pg_temp.demo_seed_appt(v_user_id, v_client, v_service, v_date, time '16:00', 6,
        1 + abs(hashtext(v_date::text || '4')) % 14);
    else
      perform pg_temp.demo_seed_appt(v_user_id, v_client, v_service, v_date, time '09:00', 2,
        1 + abs(hashtext(v_date::text || '1')) % 14);
      perform pg_temp.demo_seed_appt(v_user_id, v_client, v_service, v_date, time '11:30', 7,
        1 + abs(hashtext(v_date::text || '2')) % 14);
      perform pg_temp.demo_seed_appt(v_user_id, v_client, v_service, v_date, time '14:00', 1,
        1 + abs(hashtext(v_date::text || '3')) % 14);
    end if;
  end loop;

  insert into public.appointments (
    id, user_id, client_id, service_id, date, time, value, notes,
    status, blocked, duration_minutes, reminder_enabled, reminder_minutes_before,
    notification_status
  ) values (
    gen_random_uuid(), v_user_id, null, null, current_date, time '17:30', null,
    'Organização da estação / encaixe',
    'blocked', true, 30, false, 60, 'none'
  );

  -- ── 10) Histórico ─────────────────────────────────────────────────────────
  insert into public.audit_log (
    id, user_id, operator_id, operator_name, action, entity_type, entity_id, summary, payload, created_at
  ) values
    (gen_random_uuid(), v_user_id, null, v_name, 'update', 'config', null,
      'Atualizou configurações', '{"city":"São Paulo","stateUf":"SP"}'::jsonb, now() - interval '40 days'),
    (gen_random_uuid(), v_user_id, null, v_name, 'create', 'team_member', v_member_camila,
      'Criou operador: Camila', null, now() - interval '40 days'),
    (gen_random_uuid(), v_user_id, null, v_name, 'create', 'team_member', v_member_beatriz,
      'Criou operador: Beatriz', null, now() - interval '20 days'),
    (gen_random_uuid(), v_user_id, v_member_camila, 'Camila', 'create', 'client', v_client[1],
      'Criou cliente: Amanda Souza', null, now() - interval '18 days'),
    (gen_random_uuid(), v_user_id, v_member_camila, 'Camila', 'create', 'appointment', null,
      'Criou agendamento: Patricia Rocha', '{"status":"confirmed"}'::jsonb, now() - interval '10 days'),
    (gen_random_uuid(), v_user_id, v_member_beatriz, 'Beatriz', 'update', 'appointment', null,
      'Atualizou agendamento: Marina Costa', '{"status":"done"}'::jsonb, now() - interval '2 days'),
    (gen_random_uuid(), v_user_id, v_member_beatriz, 'Beatriz', 'create', 'inventory_movement', v_pads,
      'Registrou saída de estoque: Pads de hidrogel', '{"type":"out","qty":8}'::jsonb, now() - interval '2 days'),
    (gen_random_uuid(), v_user_id, v_member_camila, 'Camila', 'update', 'client', null,
      'Atualizou cliente: Marina Costa', null, now() - interval '1 day');

  raise notice 'Conta demo pronta.';
  raise notice 'E-mail: %', v_email;
  raise notice 'Senha: %', v_password;
  raise notice 'user_id: %', v_user_id;
end;
$$;
