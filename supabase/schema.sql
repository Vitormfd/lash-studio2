-- Esquema do banco (Supabase, schema public) — gerado por scripts/dump-schema.mjs em 2026-11-18.
-- Não edite à mão: rode o script de novo depois de aplicar um SQL de supabase/sql/.
-- Ordem para recriar: tabelas, restrições, índices, funções, views, RLS, políticas, gatilhos.

-- ═══ Tabelas ═══

create table public.app_notifications (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  type text not null default 'public_booking'::text,
  title text not null,
  body text not null default ''::text,
  appointment_id uuid,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  operator_id uuid
);

create table public.appointments (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  client_id uuid,
  service_id uuid,
  date date not null,
  "time" time without time zone not null,
  value numeric(10,2),
  notes text,
  status text default 'confirmed'::text,
  blocked boolean default false,
  created_at timestamp with time zone default now(),
  duration_minutes integer default 60,
  reminder_enabled boolean not null default false,
  reminder_minutes_before integer not null default 60,
  notification_status text not null default 'none'::text,
  reminder_sent_at timestamp with time zone,
  payment_method text,
  payment_value numeric,
  payment_notes text,
  paid_at timestamp with time zone,
  start_time timestamp with time zone,
  reminder_sent boolean not null default false,
  owner_notified_at timestamp with time zone,
  recurrence_id uuid,
  recurrence_frequency text,
  whatsapp_reminder_sent_at timestamp with time zone,
  whatsapp_reminder_error text,
  deposit_amount numeric(10,2),
  deposit_status text
);

create table public.audit_log (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  operator_id uuid,
  operator_name text not null default 'Desconhecido'::text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  payload jsonb,
  created_at timestamp with time zone not null default now()
);

create table public.cash_expenses (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  category text not null default 'materials'::text,
  amount numeric not null,
  payment_method text not null default 'cash'::text,
  notes text not null default ''::text,
  expense_date date not null default (timezone('America/Sao_Paulo'::text, now()))::date,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.client_photos (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  client_id uuid not null,
  path text not null,
  kind text not null default 'outro'::text,
  caption text,
  taken_on date not null default CURRENT_DATE,
  created_at timestamp with time zone not null default now()
);

create table public.client_records (
  client_id uuid not null,
  user_id uuid not null,
  anamnese jsonb not null default '{}'::jsonb,
  consent_text text,
  consent_name text,
  consent_signed_at timestamp with time zone,
  signature_path text,
  updated_at timestamp with time zone not null default now()
);

create table public.clients (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  name text not null,
  phone text,
  notes text,
  created_at timestamp with time zone default now(),
  is_fixed boolean not null default false,
  fixed_frequency text,
  fixed_weekday smallint,
  fixed_time time without time zone,
  maintenance_reminder_for date,
  maintenance_reminder_sent_at timestamp with time zone,
  maintenance_reminder_error text,
  maintenance_interval_days integer,
  birthday text
);

create table public.config (
  user_id uuid not null,
  avg_cost numeric(10,2) default 12.35,
  professional_whatsapp text,
  salary_percentage numeric(5,2) default 50,
  state_uf text,
  city text,
  work_hours jsonb default '{"fri": {"end": "18:00", "start": "08:00", "closed": false}, "mon": {"end": "18:00", "start": "08:00", "closed": false}, "sat": {"end": "14:00", "start": "08:00", "closed": false}, "sun": {"end": "18:00", "start": "08:00", "closed": true}, "thu": {"end": "18:00", "start": "08:00", "closed": false}, "tue": {"end": "18:00", "start": "08:00", "closed": false}, "wed": {"end": "18:00", "start": "08:00", "closed": false}}'::jsonb,
  whatsapp_reminder_template text,
  theme_id text,
  whatsapp_auto_enabled boolean not null default false,
  whatsapp_auto_hours_before integer not null default 24,
  whatsapp_instance text,
  whatsapp_auto_template text,
  whatsapp_maintenance_enabled boolean not null default false,
  whatsapp_maintenance_template text,
  business_whatsapp text,
  booking_confirm_template text,
  whatsapp_confirm_by_reply boolean not null default true,
  whatsapp_webhook_at timestamp with time zone,
  extras jsonb not null default '{}'::jsonb,
  booking_slug text
);

create table public.daily_summary_pushes (
  user_id uuid not null,
  day date not null,
  appointments integer not null default 0,
  sent_at timestamp with time zone not null default now()
);

create table public.inventory_items (
  id uuid not null,
  user_id uuid not null,
  name text not null,
  category text default ''::text,
  unit text default 'un'::text,
  cost_price numeric(12,2) not null default 0,
  sell_price numeric(12,2) not null default 0,
  stock numeric(12,3) not null default 0,
  min_stock numeric(12,3) not null default 0,
  supplier text default ''::text,
  notes text default ''::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.inventory_movements (
  id uuid not null,
  user_id uuid not null,
  item_id uuid not null,
  type text not null,
  qty numeric(12,3) not null,
  reason text default ''::text,
  created_at timestamp with time zone not null default now()
);

create table public.lash_simulations (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  source text not null,
  model_id text,
  original_path text,
  result_path text not null,
  technique text not null,
  volume_d smallint,
  curl text not null,
  thickness_mm numeric(4,2) not null,
  classic_thickness_mm numeric(4,2),
  mapping text not null,
  mapping_lengths jsonb not null,
  texture text,
  settings_version smallint not null default 1,
  created_at timestamp with time zone not null default now()
);

create table public.lash_simulator_ai_requests (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'pending'::text,
  model text,
  error text,
  duration_ms integer,
  created_at timestamp with time zone not null default now(),
  finished_at timestamp with time zone
);

create table public.lash_simulator_usage (
  user_id uuid not null,
  month date not null,
  saved_count integer not null default 0,
  updated_at timestamp with time zone not null default now()
);

create table public.loyalty_config (
  user_id uuid not null,
  goal_count integer not null default 10,
  reward_description text not null default ''::text,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  slug text
);

create table public.loyalty_scan_tokens (
  token uuid not null default gen_random_uuid(),
  user_id uuid not null,
  client_id uuid not null,
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null,
  used_at timestamp with time zone,
  used_by_team_member_id uuid
);

create table public.loyalty_stamps (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  client_id uuid not null,
  team_member_id uuid,
  source text not null default 'qr'::text,
  created_at timestamp with time zone not null default now(),
  redeemed_at timestamp with time zone
);

create table public.pix_payments (
  checkout_session_id text not null,
  user_id uuid not null,
  amount_cents integer not null,
  days integer not null,
  paid_at timestamp with time zone not null default now(),
  access_until timestamp with time zone not null
);

create table public.profiles (
  id uuid not null,
  plan text not null default 'free'::text,
  access_level text not null default 'demo'::text,
  subscription_expires_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  professional_type text not null default 'lash'::text,
  manual_grant boolean not null default false
);

create table public.push_subscriptions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null,
  keys_p256dh text not null,
  keys_auth text not null,
  morning_enabled boolean not null default true,
  reminder_minutes_before integer not null default 60,
  progress_enabled boolean not null default true,
  updated_at timestamp with time zone not null default now(),
  operator_id uuid
);

create table public.services (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  name text not null,
  price numeric(10,2) not null,
  color text,
  cost_per_client numeric,
  duration_minutes integer not null default 60
);

create table public.team_members (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  pin_hash text,
  color text,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.whatsapp_message_logs (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  appointment_id uuid,
  client_id uuid,
  phone text not null,
  message text not null,
  provider text not null default 'mock'::text,
  status text not null,
  error text,
  provider_message_id text,
  payload jsonb,
  created_at timestamp with time zone not null default now()
);

-- ═══ Restrições ═══

alter table public.app_notifications add constraint app_notifications_pkey PRIMARY KEY (id);
alter table public.app_notifications add constraint app_notifications_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;
alter table public.app_notifications add constraint app_notifications_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES team_members(id) ON DELETE CASCADE;
alter table public.app_notifications add constraint app_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.appointments add constraint appointments_pkey PRIMARY KEY (id);
alter table public.appointments add constraint appointments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
alter table public.appointments add constraint appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL;
alter table public.appointments add constraint appointments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.appointments add constraint appointments_deposit_status_check CHECK (((deposit_status IS NULL) OR (deposit_status = ANY (ARRAY['pending'::text, 'paid'::text, 'waived'::text]))));
alter table public.audit_log add constraint audit_log_pkey PRIMARY KEY (id);
alter table public.audit_log add constraint audit_log_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES team_members(id) ON DELETE SET NULL;
alter table public.audit_log add constraint audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.audit_log add constraint audit_log_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text])));
alter table public.cash_expenses add constraint cash_expenses_pkey PRIMARY KEY (id);
alter table public.cash_expenses add constraint cash_expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.cash_expenses add constraint cash_expenses_amount_check CHECK ((amount > (0)::numeric));
alter table public.client_photos add constraint client_photos_pkey PRIMARY KEY (id);
alter table public.client_photos add constraint client_photos_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public.client_photos add constraint client_photos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.client_photos add constraint client_photos_kind_check CHECK ((kind = ANY (ARRAY['antes'::text, 'depois'::text, 'outro'::text])));
alter table public.client_records add constraint client_records_pkey PRIMARY KEY (client_id);
alter table public.client_records add constraint client_records_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public.client_records add constraint client_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.clients add constraint clients_pkey PRIMARY KEY (id);
alter table public.clients add constraint clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.clients add constraint clients_birthday_format CHECK (((birthday IS NULL) OR (birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'::text)));
alter table public.clients add constraint clients_maintenance_interval_days_check CHECK (((maintenance_interval_days IS NULL) OR ((maintenance_interval_days >= 7) AND (maintenance_interval_days <= 120))));
alter table public.clients add constraint clients_phone_e164_check CHECK (((phone IS NULL) OR (phone ~ '^\+[1-9][0-9]{7,14}$'::text)));
alter table public.config add constraint config_pkey PRIMARY KEY (user_id);
alter table public.config add constraint config_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.config add constraint config_booking_slug_format CHECK (((booking_slug IS NULL) OR (booking_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'::text)));
alter table public.config add constraint config_professional_whatsapp_e164_check CHECK (((professional_whatsapp IS NULL) OR (professional_whatsapp ~ '^\\+[1-9]\\d{10,14}$'::text))) NOT VALID;
alter table public.daily_summary_pushes add constraint daily_summary_pushes_pkey PRIMARY KEY (user_id, day);
alter table public.daily_summary_pushes add constraint daily_summary_pushes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.inventory_items add constraint inventory_items_pkey PRIMARY KEY (id);
alter table public.inventory_items add constraint inventory_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.inventory_movements add constraint inventory_movements_pkey PRIMARY KEY (id);
alter table public.inventory_movements add constraint inventory_movements_item_id_fkey FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE;
alter table public.inventory_movements add constraint inventory_movements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.inventory_movements add constraint inventory_movements_qty_check CHECK ((qty >= (0)::numeric));
alter table public.inventory_movements add constraint inventory_movements_type_check CHECK ((type = ANY (ARRAY['in'::text, 'out'::text, 'adjust'::text])));
alter table public.lash_simulations add constraint lash_simulations_pkey PRIMARY KEY (id);
alter table public.lash_simulations add constraint lash_simulations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.lash_simulations add constraint lash_simulations_classic_thickness_mm_check CHECK (((classic_thickness_mm IS NULL) OR ((classic_thickness_mm > (0)::numeric) AND (classic_thickness_mm <= 0.5))));
alter table public.lash_simulations add constraint lash_simulations_curl_check CHECK (((char_length(curl) >= 1) AND (char_length(curl) <= 8)));
alter table public.lash_simulations add constraint lash_simulations_mapping_check CHECK (((char_length(mapping) >= 1) AND (char_length(mapping) <= 48)));
alter table public.lash_simulations add constraint lash_simulations_mapping_lengths_check CHECK (((jsonb_typeof(mapping_lengths) = 'array'::text) AND ((jsonb_array_length(mapping_lengths) >= 3) AND (jsonb_array_length(mapping_lengths) <= 30))));
alter table public.lash_simulations add constraint lash_simulations_model_id_check CHECK (((model_id IS NULL) OR (char_length(model_id) <= 64)));
alter table public.lash_simulations add constraint lash_simulations_original_path_check CHECK (((original_path IS NULL) OR (char_length(original_path) <= 300)));
alter table public.lash_simulations add constraint lash_simulations_result_path_check CHECK ((char_length(result_path) <= 300));
alter table public.lash_simulations add constraint lash_simulations_source_check CHECK ((source = ANY (ARRAY['upload'::text, 'model'::text])));
alter table public.lash_simulations add constraint lash_simulations_technique_check CHECK (((char_length(technique) >= 1) AND (char_length(technique) <= 48)));
alter table public.lash_simulations add constraint lash_simulations_texture_check CHECK (((texture IS NULL) OR (char_length(texture) <= 24)));
alter table public.lash_simulations add constraint lash_simulations_thickness_mm_check CHECK (((thickness_mm > (0)::numeric) AND (thickness_mm <= 0.5)));
alter table public.lash_simulations add constraint lash_simulations_volume_d_check CHECK (((volume_d IS NULL) OR ((volume_d >= 1) AND (volume_d <= 30))));
alter table public.lash_simulator_ai_requests add constraint lash_simulator_ai_requests_pkey PRIMARY KEY (id);
alter table public.lash_simulator_ai_requests add constraint lash_simulator_ai_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.lash_simulator_ai_requests add constraint lash_simulator_ai_requests_error_check CHECK (((error IS NULL) OR (char_length(error) <= 500)));
alter table public.lash_simulator_ai_requests add constraint lash_simulator_ai_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'done'::text, 'failed'::text])));
alter table public.lash_simulator_usage add constraint lash_simulator_usage_pkey PRIMARY KEY (user_id, month);
alter table public.lash_simulator_usage add constraint lash_simulator_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.loyalty_config add constraint loyalty_config_pkey PRIMARY KEY (user_id);
alter table public.loyalty_config add constraint loyalty_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.loyalty_config add constraint loyalty_config_goal_count_check CHECK ((goal_count > 0));
alter table public.loyalty_scan_tokens add constraint loyalty_scan_tokens_pkey PRIMARY KEY (token);
alter table public.loyalty_scan_tokens add constraint loyalty_scan_tokens_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public.loyalty_scan_tokens add constraint loyalty_scan_tokens_used_by_team_member_id_fkey FOREIGN KEY (used_by_team_member_id) REFERENCES team_members(id) ON DELETE SET NULL;
alter table public.loyalty_scan_tokens add constraint loyalty_scan_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.loyalty_stamps add constraint loyalty_stamps_pkey PRIMARY KEY (id);
alter table public.loyalty_stamps add constraint loyalty_stamps_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public.loyalty_stamps add constraint loyalty_stamps_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE SET NULL;
alter table public.loyalty_stamps add constraint loyalty_stamps_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.pix_payments add constraint pix_payments_pkey PRIMARY KEY (checkout_session_id);
alter table public.pix_payments add constraint pix_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_access_level_check CHECK ((access_level = ANY (ARRAY['demo'::text, 'full'::text])));
alter table public.profiles add constraint profiles_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'trial'::text, 'active'::text, 'canceled'::text])));
alter table public.profiles add constraint profiles_professional_type_check CHECK ((professional_type = ANY (ARRAY['lash'::text, 'nail'::text, 'sobrancelha'::text, 'estetica'::text, 'barbeiro'::text])));
alter table public.push_subscriptions add constraint push_subscriptions_user_id_endpoint_key UNIQUE (user_id, endpoint);
alter table public.push_subscriptions add constraint push_subscriptions_pkey PRIMARY KEY (id);
alter table public.push_subscriptions add constraint push_subscriptions_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES team_members(id) ON DELETE SET NULL;
alter table public.push_subscriptions add constraint push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.services add constraint services_pkey PRIMARY KEY (id);
alter table public.services add constraint services_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.team_members add constraint team_members_pkey PRIMARY KEY (id);
alter table public.team_members add constraint team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.whatsapp_message_logs add constraint whatsapp_message_logs_pkey PRIMARY KEY (id);
alter table public.whatsapp_message_logs add constraint whatsapp_message_logs_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;
alter table public.whatsapp_message_logs add constraint whatsapp_message_logs_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
alter table public.whatsapp_message_logs add constraint whatsapp_message_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.whatsapp_message_logs add constraint whatsapp_message_logs_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text])));

-- ═══ Índices ═══

CREATE UNIQUE INDEX app_notifications_booking_operator_unique_idx ON public.app_notifications USING btree (user_id, operator_id, appointment_id) WHERE ((appointment_id IS NOT NULL) AND (operator_id IS NOT NULL));
CREATE INDEX app_notifications_operator_idx ON public.app_notifications USING btree (user_id, operator_id, created_at DESC);
CREATE INDEX app_notifications_user_created_idx ON public.app_notifications USING btree (user_id, created_at DESC);
CREATE INDEX app_notifications_user_unread_idx ON public.app_notifications USING btree (user_id) WHERE (read_at IS NULL);
CREATE INDEX appointments_user_id_date_idx ON public.appointments USING btree (user_id, date, "time");
CREATE INDEX appointments_whatsapp_reminder_pending_idx ON public.appointments USING btree (user_id, date) WHERE (whatsapp_reminder_sent_at IS NULL);
CREATE INDEX appointments_whatsapp_window_idx ON public.appointments USING btree (start_time, user_id) WHERE ((reminder_sent = false) AND (status = ANY (ARRAY['pending'::text, 'confirmed'::text])));
CREATE INDEX audit_log_user_id_created_idx ON public.audit_log USING btree (user_id, created_at DESC);
CREATE INDEX cash_expenses_user_date_idx ON public.cash_expenses USING btree (user_id, expense_date DESC, created_at DESC);
CREATE INDEX client_photos_client_idx ON public.client_photos USING btree (user_id, client_id, created_at DESC);
CREATE INDEX client_records_user_idx ON public.client_records USING btree (user_id);
CREATE INDEX clients_user_id_name_idx ON public.clients USING btree (user_id, name);
CREATE UNIQUE INDEX config_booking_slug_unique ON public.config USING btree (lower(booking_slug)) WHERE (booking_slug IS NOT NULL);
CREATE INDEX inventory_items_name_idx ON public.inventory_items USING btree (name);
CREATE INDEX inventory_items_updated_at_idx ON public.inventory_items USING btree (updated_at DESC);
CREATE INDEX inventory_items_user_id_idx ON public.inventory_items USING btree (user_id);
CREATE INDEX inventory_movements_created_at_idx ON public.inventory_movements USING btree (created_at DESC);
CREATE INDEX inventory_movements_item_id_idx ON public.inventory_movements USING btree (item_id);
CREATE INDEX inventory_movements_user_id_idx ON public.inventory_movements USING btree (user_id);
CREATE INDEX lash_simulations_user_created_idx ON public.lash_simulations USING btree (user_id, created_at DESC);
CREATE INDEX lash_simulator_ai_requests_user_created_idx ON public.lash_simulator_ai_requests USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX loyalty_config_slug_unique ON public.loyalty_config USING btree (lower(slug)) WHERE (slug IS NOT NULL);
CREATE INDEX loyalty_scan_tokens_lookup_idx ON public.loyalty_scan_tokens USING btree (token, user_id);
CREATE INDEX loyalty_stamps_client_idx ON public.loyalty_stamps USING btree (user_id, client_id, redeemed_at);
CREATE INDEX pix_payments_user_paid_idx ON public.pix_payments USING btree (user_id, paid_at DESC);
CREATE INDEX push_subscriptions_operator_idx ON public.push_subscriptions USING btree (user_id, operator_id);
CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions USING btree (user_id);
CREATE INDEX team_members_user_id_idx ON public.team_members USING btree (user_id);
CREATE INDEX whatsapp_message_logs_appointment_idx ON public.whatsapp_message_logs USING btree (appointment_id);
CREATE INDEX whatsapp_message_logs_user_created_idx ON public.whatsapp_message_logs USING btree (user_id, created_at DESC);

-- ═══ RLS ═══

alter table public.app_notifications enable row level security;
alter table public.appointments enable row level security;
alter table public.audit_log enable row level security;
alter table public.cash_expenses enable row level security;
alter table public.client_photos enable row level security;
alter table public.client_records enable row level security;
alter table public.clients enable row level security;
alter table public.config enable row level security;
alter table public.daily_summary_pushes enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.lash_simulations enable row level security;
alter table public.lash_simulator_ai_requests enable row level security;
alter table public.lash_simulator_usage enable row level security;
alter table public.loyalty_config enable row level security;
alter table public.loyalty_scan_tokens enable row level security;
alter table public.loyalty_stamps enable row level security;
alter table public.pix_payments enable row level security;
alter table public.profiles enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.services enable row level security;
alter table public.team_members enable row level security;
alter table public.whatsapp_message_logs enable row level security;

-- ═══ Políticas ═══

create policy app_notifications_own_delete on app_notifications as permissive for delete to public
  using ((auth.uid() = user_id));

create policy app_notifications_own_insert on app_notifications as permissive for insert to public
  with check ((auth.uid() = user_id));

create policy app_notifications_own_select on app_notifications as permissive for select to public
  using ((auth.uid() = user_id));

create policy app_notifications_own_update on app_notifications as permissive for update to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy own on appointments as permissive for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy audit_log_own_insert on audit_log as permissive for insert to public
  with check ((auth.uid() = user_id));

create policy audit_log_own_select on audit_log as permissive for select to public
  using ((auth.uid() = user_id));

create policy cash_expenses_own_delete on cash_expenses as permissive for delete to public
  using ((auth.uid() = user_id));

create policy cash_expenses_own_insert on cash_expenses as permissive for insert to public
  with check ((auth.uid() = user_id));

create policy cash_expenses_own_select on cash_expenses as permissive for select to public
  using ((auth.uid() = user_id));

create policy cash_expenses_own_update on cash_expenses as permissive for update to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy client_photos_delete_own on client_photos as permissive for delete to authenticated
  using ((auth.uid() = user_id));

create policy client_photos_insert_own on client_photos as permissive for insert to authenticated
  with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_photos.client_id) AND (c.user_id = auth.uid()))))));

create policy client_photos_select_own on client_photos as permissive for select to authenticated
  using ((auth.uid() = user_id));

create policy client_photos_update_own on client_photos as permissive for update to authenticated
  using ((auth.uid() = user_id))
  with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_photos.client_id) AND (c.user_id = auth.uid()))))));

create policy client_records_delete_own on client_records as permissive for delete to authenticated
  using ((auth.uid() = user_id));

create policy client_records_insert_own on client_records as permissive for insert to authenticated
  with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_records.client_id) AND (c.user_id = auth.uid()))))));

create policy client_records_select_own on client_records as permissive for select to authenticated
  using ((auth.uid() = user_id));

create policy client_records_update_own on client_records as permissive for update to authenticated
  using ((auth.uid() = user_id))
  with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_records.client_id) AND (c.user_id = auth.uid()))))));

create policy own on clients as permissive for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy own on config as permissive for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy inventory_items_delete_own on inventory_items as permissive for delete to authenticated
  using ((auth.uid() = user_id));

create policy inventory_items_insert_own on inventory_items as permissive for insert to authenticated
  with check ((auth.uid() = user_id));

create policy inventory_items_select_own on inventory_items as permissive for select to authenticated
  using ((auth.uid() = user_id));

create policy inventory_items_update_own on inventory_items as permissive for update to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy inventory_movements_delete_own on inventory_movements as permissive for delete to authenticated
  using ((auth.uid() = user_id));

create policy inventory_movements_insert_own on inventory_movements as permissive for insert to authenticated
  with check ((auth.uid() = user_id));

create policy inventory_movements_select_own on inventory_movements as permissive for select to authenticated
  using ((auth.uid() = user_id));

create policy inventory_movements_update_own on inventory_movements as permissive for update to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy lash_simulations_delete_own on lash_simulations as permissive for delete to public
  using ((auth.uid() = user_id));

create policy lash_simulations_insert_own on lash_simulations as permissive for insert to public
  with check (((auth.uid() = user_id) AND is_lash_designer(auth.uid())));

create policy lash_simulations_select_own on lash_simulations as permissive for select to public
  using (((auth.uid() = user_id) AND is_lash_designer(auth.uid())));

create policy lash_simulator_ai_requests_select_own on lash_simulator_ai_requests as permissive for select to public
  using ((auth.uid() = user_id));

create policy lash_simulator_usage_select_own on lash_simulator_usage as permissive for select to public
  using ((auth.uid() = user_id));

create policy loyalty_config_owner_all on loyalty_config as permissive for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy loyalty_stamps_owner_select on loyalty_stamps as permissive for select to public
  using ((auth.uid() = user_id));

create policy pix_payments_own_select on pix_payments as permissive for select to public
  using ((auth.uid() = user_id));

create policy profiles_own_insert on profiles as permissive for insert to public
  with check ((auth.uid() = id));

create policy profiles_own_select on profiles as permissive for select to public
  using ((auth.uid() = id));

create policy profiles_own_update on profiles as permissive for update to public
  using ((auth.uid() = id))
  with check ((auth.uid() = id));

create policy push_own_delete on push_subscriptions as permissive for delete to public
  using ((auth.uid() = user_id));

create policy push_own_insert on push_subscriptions as permissive for insert to public
  with check ((auth.uid() = user_id));

create policy push_own_select on push_subscriptions as permissive for select to public
  using ((auth.uid() = user_id));

create policy push_own_update on push_subscriptions as permissive for update to public
  using ((auth.uid() = user_id));

create policy own on services as permissive for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy client_files_delete on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'client-files'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

create policy client_files_insert on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'client-files'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND is_full_access(auth.uid())));

create policy client_files_select on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'client-files'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

create policy lash_sim_storage_delete on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'lash-simulations'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

create policy lash_sim_storage_insert on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'lash-simulations'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND is_lash_designer(auth.uid()) AND is_full_access(auth.uid())));

create policy lash_sim_storage_select on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'lash-simulations'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND is_lash_designer(auth.uid())));

create policy team_members_own_delete on team_members as permissive for delete to public
  using ((auth.uid() = user_id));

create policy team_members_own_insert on team_members as permissive for insert to public
  with check ((auth.uid() = user_id));

create policy team_members_own_select on team_members as permissive for select to public
  using ((auth.uid() = user_id));

create policy team_members_own_update on team_members as permissive for update to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy whatsapp_logs_own_select on whatsapp_message_logs as permissive for select to public
  using ((auth.uid() = user_id));

-- ═══ Views ═══

create or replace view public.v_inventory_critical as
 SELECT user_id,
    id AS item_id,
    name,
    COALESCE(category, ''::text) AS category,
    COALESCE(unit, 'un'::text) AS unit,
    stock,
    min_stock,
    min_stock - stock AS shortage,
    cost_price,
    sell_price,
    updated_at
   FROM inventory_items i
  WHERE stock <= min_stock;

create or replace view public.v_inventory_item_value as
 SELECT user_id,
    id AS item_id,
    name,
    COALESCE(category, ''::text) AS category,
    COALESCE(unit, 'un'::text) AS unit,
    stock,
    cost_price,
    sell_price,
    stock * cost_price AS stock_cost_value,
    stock * sell_price AS stock_sell_value
   FROM inventory_items i;

create or replace view public.v_inventory_monthly_turnover as
 SELECT user_id,
    date_trunc('month'::text, created_at)::date AS month_ref,
    sum(
        CASE
            WHEN type = 'in'::text THEN qty
            ELSE 0::numeric
        END) AS qty_in,
    sum(
        CASE
            WHEN type = 'out'::text THEN qty
            ELSE 0::numeric
        END) AS qty_out,
    sum(
        CASE
            WHEN type = 'adjust'::text THEN qty
            ELSE 0::numeric
        END) AS qty_adjust,
    count(*) AS movements_count
   FROM inventory_movements m
  GROUP BY user_id, (date_trunc('month'::text, created_at)::date)
  ORDER BY (date_trunc('month'::text, created_at)::date) DESC;

create or replace view public.v_inventory_summary as
 SELECT user_id,
    count(*) AS total_items,
    count(*) FILTER (WHERE stock <= min_stock) AS low_stock_items,
    sum(stock * cost_price) AS total_cost_value,
    sum(stock * sell_price) AS total_sell_value,
    sum(stock) AS total_qty
   FROM inventory_items i
  GROUP BY user_id;

create or replace view public.v_inventory_value_by_category as
 SELECT user_id,
    COALESCE(NULLIF(TRIM(BOTH FROM category), ''::text), 'Sem categoria'::text) AS category,
    count(*) AS items_count,
    sum(stock) AS total_stock_qty,
    sum(stock * cost_price) AS total_cost_value,
    sum(stock * sell_price) AS total_sell_value
   FROM inventory_items i
  GROUP BY user_id, (COALESCE(NULLIF(TRIM(BOTH FROM category), ''::text), 'Sem categoria'::text));

-- ═══ Funções ═══

CREATE OR REPLACE FUNCTION public.account_owner_id(p_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.id
  from public.team_members m
  where m.user_id = p_user_id
    and m.active = true
  order by m.created_at asc, m.id asc
  limit 1;
$function$
;
CREATE OR REPLACE FUNCTION public.create_public_booking(p_professional_id uuid, p_service_id uuid, p_date date, p_time time without time zone, p_client_name text, p_client_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_service record;
  v_duration int;
  v_name text;
  v_phone_digits text;
  v_phone_candidates text[];
  v_client_id uuid;
  v_appointment_id uuid;
  v_conflict boolean;
  v_win record;
  v_start_mins int;
  v_end_mins int;
  v_slot_mins int;
  v_lunch_start_mins int;
  v_lunch_end_mins int;
  v_notif_body text;
  v_today date;
  v_recent int;
begin
  -- Marca a transação como agendamento público para passar pelo gatilho de acesso.
  perform set_config('app.public_booking', 'true', true);

  if p_professional_id is null or p_service_id is null or p_date is null or p_time is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  -- Agenda online só para contas com acesso completo (assinatura ativa, liberação manual ou teste em dia).
  if not public.is_full_access(p_professional_id) then
    return jsonb_build_object('ok', false, 'reason', 'plan_required');
  end if;

  v_name := left(regexp_replace(trim(coalesce(p_client_name, '')), '\s+', ' ', 'g'), 80);
  if char_length(v_name) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;

  v_phone_digits := regexp_replace(coalesce(p_client_phone, ''), '[^0-9]', '', 'g');
  v_phone_digits := regexp_replace(v_phone_digits, '^0+', '', 'g');
  if char_length(v_phone_digits) < 10 or char_length(v_phone_digits) > 13 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;

  v_phone_candidates := array_remove(array[
    case when left(v_phone_digits, 2) = '55' and char_length(v_phone_digits) >= 12 then '+' || v_phone_digits else null end,
    case when char_length(v_phone_digits) <= 11 then '+55' || v_phone_digits else null end
  ], null);
  if coalesce(array_length(v_phone_candidates, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;

  -- "Hoje" pelo fuso mais a oeste do Brasil, para não recusar ninguém do Acre ou do Amazonas.
  -- Horário de hoje que já passou é barrado na tela.
  v_today := (now() at time zone 'America/Rio_Branco')::date;
  if p_date < v_today then
    return jsonb_build_object('ok', false, 'reason', 'past_date');
  end if;
  if p_date > v_today + 365 then
    return jsonb_build_object('ok', false, 'reason', 'too_far');
  end if;

  -- Uma reserva por vez na agenda desta profissional (evita duas pessoas no mesmo horário).
  perform pg_advisory_xact_lock(hashtextextended('public_booking:' || p_professional_id::text, 0));

  -- Limites contra reservas em massa (o pico real é de 5 por hora numa conta).
  select count(*) into v_recent
  from public.appointments a
  where a.user_id = p_professional_id
    and a.notes = 'Agendamento público'
    and a.created_at > now() - interval '1 hour';
  if v_recent >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select count(*) into v_recent
  from public.appointments a
  where a.user_id = p_professional_id
    and a.notes = 'Agendamento público'
    and a.created_at > now() - interval '1 day';
  if v_recent >= 60 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select count(*) into v_recent
  from public.appointments a
  join public.clients c on c.id = a.client_id
  where a.user_id = p_professional_id
    and c.phone = any (v_phone_candidates)
    and a.notes = 'Agendamento público'
    and a.date >= v_today
    and coalesce(a.status, 'pending') in ('pending', 'confirmed');
  if v_recent >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_bookings');
  end if;

  select
    s.id,
    s.name,
    s.price,
    coalesce(nullif(to_jsonb(s) ->> 'duration_minutes', '')::int, 60) as duration_minutes
  into v_service
  from public.services s
  where s.id = p_service_id
    and s.user_id = p_professional_id
  limit 1;

  if v_service.id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_service');
  end if;

  v_duration := coalesce(v_service.duration_minutes, 60);

  -- Valida horário de trabalho do dia
  select *
  into v_win
  from public.get_public_booking_window(p_professional_id, p_date)
  limit 1;

  if coalesce(v_win.closed, false) then
    return jsonb_build_object('ok', false, 'reason', 'outside_hours');
  end if;

  if v_win.start_time is not null and v_win.end_time is not null then
    v_start_mins := (split_part(v_win.start_time, ':', 1)::int * 60)
      + split_part(v_win.start_time, ':', 2)::int;
    v_end_mins := (split_part(v_win.end_time, ':', 1)::int * 60)
      + split_part(v_win.end_time, ':', 2)::int;
    v_slot_mins := extract(hour from p_time)::int * 60 + extract(minute from p_time)::int;
    if v_slot_mins < v_start_mins or (v_slot_mins + v_duration) > v_end_mins then
      return jsonb_build_object('ok', false, 'reason', 'outside_hours');
    end if;

    if coalesce(v_win.has_lunch, false) and v_win.lunch_start is not null and v_win.lunch_end is not null then
      v_lunch_start_mins := (split_part(v_win.lunch_start, ':', 1)::int * 60)
        + split_part(v_win.lunch_start, ':', 2)::int;
      v_lunch_end_mins := (split_part(v_win.lunch_end, ':', 1)::int * 60)
        + split_part(v_win.lunch_end, ':', 2)::int;
      if v_slot_mins < v_lunch_end_mins and (v_slot_mins + v_duration) > v_lunch_start_mins then
        return jsonb_build_object('ok', false, 'reason', 'outside_hours');
      end if;
    end if;
  end if;

  select exists (
    select 1
    from public.appointments a
    where a.user_id = p_professional_id
      and a.date = p_date
      and coalesce(a.status, 'pending') not in ('cancelled', 'no_show')
      and (
        (extract(hour from p_time) * 60 + extract(minute from p_time))
          < (extract(hour from a.time) * 60 + extract(minute from a.time) + coalesce(a.duration_minutes, 60))
        and
        (extract(hour from a.time) * 60 + extract(minute from a.time))
          < (extract(hour from p_time) * 60 + extract(minute from p_time) + v_duration)
      )
  ) into v_conflict;

  if v_conflict then
    return jsonb_build_object('ok', false, 'reason', 'conflict');
  end if;

  select c.id
  into v_client_id
  from public.clients c
  where c.user_id = p_professional_id
    and c.phone = any (v_phone_candidates)
  limit 1;

  if v_client_id is null then
    v_client_id := gen_random_uuid();
    insert into public.clients (id, user_id, name, phone, notes, created_at)
    values (
      v_client_id,
      p_professional_id,
      v_name,
      v_phone_candidates[1],
      'Criado via agendamento público.',
      now()
    );
  end if;

  v_appointment_id := gen_random_uuid();

  insert into public.appointments (
    id,
    user_id,
    client_id,
    service_id,
    date,
    time,
    value,
    notes,
    status,
    blocked,
    duration_minutes
  )
  values (
    v_appointment_id,
    p_professional_id,
    v_client_id,
    p_service_id,
    p_date,
    p_time,
    v_service.price,
    'Agendamento público',
    'pending',
    false,
    v_duration
  );

  -- Inbox do sininho: um aviso por perfil da equipe (best-effort)
  v_notif_body :=
    case
      when nullif(trim(coalesce(v_service.name, '')), '') is not null then
        v_name || ' agendou ' || trim(v_service.name)
        || ' para ' || to_char(p_date, 'DD/MM') || ' às ' || to_char(p_time, 'HH24:MI')
      else
        v_name || ' agendou para ' || to_char(p_date, 'DD/MM') || ' às ' || to_char(p_time, 'HH24:MI')
    end;

  begin
    perform public.insert_team_app_notifications(
      p_professional_id,
      'public_booking',
      'Novo agendamento',
      v_notif_body,
      v_appointment_id,
      jsonb_build_object(
        'date', p_date,
        'time', to_char(p_time, 'HH24:MI'),
        'clientName', v_name,
        'serviceName', coalesce(v_service.name, '')
      )
    );
  exception
    when others then
      null;
  end;

  -- Avisa a profissional (best-effort). Falha de push não cancela o agendamento.
  begin
    perform
      net.http_post(
        url := 'https://mbxfswxjrdikdyzpukmw.supabase.co/functions/v1/send-scheduled-pushes',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'mode', 'new_booking',
          'appointment_id', v_appointment_id
        )
      );
  exception
    when others then
      null;
  end;

  return jsonb_build_object('ok', true, 'appointment_id', v_appointment_id);
exception
  when others then
    if sqlerrm ilike '%full plan required%' then
      return jsonb_build_object('ok', false, 'reason', 'plan_required');
    end if;
    if sqlerrm ilike '%horario_ocupado%' then
      return jsonb_build_object('ok', false, 'reason', 'conflict');
    end if;
    -- O detalhe fica só no log do banco; quem agenda vê uma mensagem genérica.
    raise warning 'create_public_booking falhou (profissional %): %', p_professional_id, sqlerrm;
    return jsonb_build_object('ok', false, 'reason', 'unexpected_error');
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_full_access_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_user_id uuid;
  role_claim text;
begin
  role_claim := current_setting('request.jwt.claim.role', true);

  if role_claim = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- Allow inserts from public booking RPC (anon users booking appointments)
  if current_setting('app.public_booking', true) = 'true' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  target_user_id := case
    when tg_op = 'DELETE' then old.user_id
    else new.user_id
  end;

  if target_user_id is null or target_user_id <> auth.uid() then
    raise exception 'Unauthorized user context for write operation.';
  end if;

  if not public.is_full_access(target_user_id) then
    raise exception 'Access denied: full plan required for this operation.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_public_booking_active(p_professional_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_full_access(p_professional_id);
$function$
;
CREATE OR REPLACE FUNCTION public.get_public_booking_contact(p_professional_id uuid)
 RETURNS TABLE(whatsapp text, confirm_template text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    nullif(regexp_replace(coalesce(c.business_whatsapp, ''), '[^0-9]', '', 'g'), '') as whatsapp,
    nullif(trim(c.booking_confirm_template), '') as confirm_template
  from public.config c
  where c.user_id = p_professional_id
  limit 1;
$function$
;
CREATE OR REPLACE FUNCTION public.get_public_booking_occupied_slots(p_professional_id uuid, p_date date)
 RETURNS TABLE(slot_time time without time zone, duration_minutes integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    a.time as slot_time,
    coalesce(a.duration_minutes, 60) as duration_minutes
  from public.appointments a
  where a.user_id = p_professional_id
    and a.date = p_date
    and coalesce(a.status, 'pending') not in ('cancelled', 'no_show');
$function$
;
CREATE OR REPLACE FUNCTION public.get_public_booking_profile(p_identifier text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.get_public_booking_services(p_professional_id uuid)
 RETURNS TABLE(id uuid, name text, price numeric, duration_minutes integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    s.id,
    s.name,
    s.price,
    coalesce(nullif(to_jsonb(s) ->> 'duration_minutes', '')::int, 60) as duration_minutes
  from public.services s
  where s.user_id = p_professional_id
  order by s.name;
$function$
;
CREATE OR REPLACE FUNCTION public.get_public_booking_window(p_professional_id uuid, p_date date DEFAULT NULL::date)
 RETURNS TABLE(start_time text, end_time text, closed boolean, state_uf text, city text, has_lunch boolean, lunch_start text, lunch_end text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cfg jsonb;
  v_hours jsonb;
  v_day jsonb;
  v_key text;
  v_dow int;
  v_closed boolean;
  v_start text;
  v_end text;
  v_state text;
  v_city text;
  v_has_lunch boolean;
  v_lunch_start text;
  v_lunch_end text;
begin
  select to_jsonb(c)
  into v_cfg
  from public.config c
  where c.user_id = p_professional_id
  limit 1;

  if v_cfg is null then
    start_time := '08:00';
    end_time := '18:00';
    closed := false;
    state_uf := null;
    city := null;
    has_lunch := false;
    lunch_start := null;
    lunch_end := null;
    return next;
    return;
  end if;

  v_state := nullif(v_cfg ->> 'state_uf', '');
  v_city := nullif(v_cfg ->> 'city', '');
  v_hours := v_cfg -> 'work_hours';

  v_dow := extract(dow from coalesce(p_date, current_date))::int;
  v_key := case v_dow
    when 0 then 'sun'
    when 1 then 'mon'
    when 2 then 'tue'
    when 3 then 'wed'
    when 4 then 'thu'
    when 5 then 'fri'
    else 'sat'
  end;

  if v_hours is not null and jsonb_typeof(v_hours) = 'object' then
    v_day := v_hours -> v_key;
  end if;

  v_has_lunch := false;
  v_lunch_start := null;
  v_lunch_end := null;

  if v_day is not null and jsonb_typeof(v_day) = 'object' then
    v_closed := coalesce((v_day ->> 'closed')::boolean, false);
    v_start := nullif(v_day ->> 'start', '');
    v_end := nullif(v_day ->> 'end', '');

    v_has_lunch := coalesce((v_day ->> 'hasLunch')::boolean, false);
    if v_has_lunch then
      v_lunch_start := nullif(v_day ->> 'lunchStart', '');
      v_lunch_end := nullif(v_day ->> 'lunchEnd', '');
      if v_lunch_start is null or v_lunch_end is null then
        v_has_lunch := false;
      end if;
    end if;
  else
    -- fallback legado: janela única
    v_closed := false;
    v_start := coalesce(
      nullif(v_cfg ->> 'start_time', ''),
      nullif(v_cfg ->> 'start_hour', ''),
      nullif(v_cfg ->> 'work_start', ''),
      '08:00'
    );
    v_end := coalesce(
      nullif(v_cfg ->> 'end_time', ''),
      nullif(v_cfg ->> 'end_hour', ''),
      nullif(v_cfg ->> 'work_end', ''),
      '18:00'
    );
  end if;

  if v_closed then
    start_time := null;
    end_time := null;
    closed := true;
    state_uf := v_state;
    city := v_city;
    has_lunch := false;
    lunch_start := null;
    lunch_end := null;
    return next;
    return;
  end if;

  start_time := coalesce(v_start, '08:00');
  end_time := coalesce(v_end, '18:00');
  closed := false;
  state_uf := v_state;
  city := v_city;
  has_lunch := v_has_lunch;
  lunch_start := v_lunch_start;
  lunch_end := v_lunch_end;
  return next;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_public_loyalty_card(p_professional_id uuid, p_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client record;
  v_cfg record;
  v_count int;
  v_token uuid;
  v_expires timestamptz;
  v_professional_name text;
begin
  if p_professional_id is null or p_client_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  if not public.loyalty_public_available(p_professional_id) then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;

  select id, name into v_client
  from public.clients
  where id = p_client_id and user_id = p_professional_id
  limit 1;

  if v_client.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select goal_count, reward_description, active
  into v_cfg
  from public.loyalty_config
  where user_id = p_professional_id
  limit 1;

  if v_cfg.goal_count is null then
    v_cfg.goal_count := 10;
    v_cfg.reward_description := '';
    v_cfg.active := true;
  end if;

  select count(*) into v_count
  from public.loyalty_stamps
  where user_id = p_professional_id
    and client_id = p_client_id
    and redeemed_at is null;

  select u.raw_user_meta_data ->> 'name'
  into v_professional_name
  from auth.users u
  where u.id = p_professional_id
  limit 1;

  -- O cartão se renova a cada poucos minutos: apaga os códigos vencidos e não usados desta cliente.
  delete from public.loyalty_scan_tokens
  where user_id = p_professional_id
    and client_id = p_client_id
    and used_at is null
    and expires_at < now();

  v_expires := now() + interval '5 minutes';

  insert into public.loyalty_scan_tokens (user_id, client_id, expires_at)
  values (p_professional_id, p_client_id, v_expires)
  returning token into v_token;

  return jsonb_build_object(
    'ok', true,
    'client_id', v_client.id,
    -- Só o primeiro nome: o link é público.
    'client_name', split_part(trim(coalesce(v_client.name, '')), ' ', 1),
    'professional_name', coalesce(nullif(trim(v_professional_name), ''), 'Seu salão'),
    'goal', v_cfg.goal_count,
    'reward_description', v_cfg.reward_description,
    'active', v_cfg.active,
    'stamped_count', v_count,
    'qr_token', v_token,
    'qr_expires_at', v_expires
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_public_loyalty_lookup(p_professional_id uuid, p_phone text, p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_phone_digits text;
  v_phone_candidates text[];
  v_count int;
  v_single_id uuid;
begin
  if p_professional_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  if not public.loyalty_public_available(p_professional_id) then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;

  v_phone_digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_phone_digits := regexp_replace(v_phone_digits, '^0+', '', 'g');

  -- Telefone com DDD: 10 ou 11 dígitos, ou 12/13 com o 55 na frente.
  if char_length(v_phone_digits) < 10 or char_length(v_phone_digits) > 13 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;

  v_phone_candidates := array_remove(array[
    case when left(v_phone_digits, 2) = '55' and char_length(v_phone_digits) >= 12 then '+' || v_phone_digits else null end,
    case when char_length(v_phone_digits) <= 11 then '+55' || v_phone_digits else null end
  ], null);
  if coalesce(array_length(v_phone_candidates, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;

  select count(*) into v_count
  from public.clients c
  where c.user_id = p_professional_id and c.phone = any (v_phone_candidates);

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_count = 1 then
    select c.id into v_single_id
    from public.clients c
    where c.user_id = p_professional_id and c.phone = any (v_phone_candidates)
    limit 1;
    return jsonb_build_object('ok', true, 'mode', 'card') || public.get_public_loyalty_card(p_professional_id, v_single_id);
  end if;

  -- Mesmo telefone para mais de uma pessoa (ex.: mãe e filha): só o primeiro nome, sem telefone.
  return jsonb_build_object(
    'ok', true,
    'mode', 'choice',
    'candidates', (
      select jsonb_agg(jsonb_build_object('client_id', x.id, 'name', x.first_name))
      from (
        select c.id, split_part(trim(coalesce(c.name, '')), ' ', 1) as first_name
        from public.clients c
        where c.user_id = p_professional_id and c.phone = any (v_phone_candidates)
        order by c.name
        limit 8
      ) x
    )
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_public_loyalty_professional_id(p_identifier text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_clean text;
  v_uid uuid;
begin
  v_clean := nullif(trim(coalesce(p_identifier, '')), '');
  if v_clean is null then
    return null;
  end if;

  if v_clean ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_clean::uuid;
  end if;

  select user_id into v_uid
  from public.loyalty_config
  where lower(slug) = lower(v_clean)
  limit 1;

  return v_uid;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_public_theme_id(p_professional_id uuid)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select nullif(trim(c.theme_id), '')
  from public.config c
  where c.user_id = p_professional_id
  limit 1;
$function$
;
CREATE OR REPLACE FUNCTION public.grant_pix_access(p_session_id text, p_user_id uuid, p_amount_cents integer, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_profile record;
  v_base timestamptz;
  v_until timestamptz;
begin
  if p_session_id is null or p_user_id is null or coalesce(p_days, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  -- Mesmo pagamento já processado: não soma de novo.
  if exists (select 1 from public.pix_payments where checkout_session_id = p_session_id) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  select plan, access_level, subscription_expires_at
    into v_profile
    from public.profiles
   where id = p_user_id
   for update;

  -- Conta paga sem data de fim (cartão antigo ou liberação manual): só registra o Pix.
  if found and v_profile.plan = 'active' and v_profile.access_level = 'full'
     and v_profile.subscription_expires_at is null then
    insert into public.pix_payments (checkout_session_id, user_id, amount_cents, days, access_until)
    values (p_session_id, p_user_id, p_amount_cents, p_days, now());
    return jsonb_build_object('ok', true, 'unchanged', true, 'reason', 'unlimited_access');
  end if;

  v_base := now();
  if found and v_profile.plan = 'active' and v_profile.access_level = 'full'
     and v_profile.subscription_expires_at > now() then
    v_base := v_profile.subscription_expires_at;
  end if;
  v_until := v_base + make_interval(days => p_days);

  insert into public.pix_payments (checkout_session_id, user_id, amount_cents, days, access_until)
  values (p_session_id, p_user_id, p_amount_cents, p_days, v_until);

  -- manual_grant = true: um evento antigo de cartão recusado/expirado não derruba o acesso pago no Pix.
  -- O vencimento continua valendo (is_full_access respeita subscription_expires_at).
  insert into public.profiles (id, plan, access_level, subscription_expires_at, manual_grant)
  values (p_user_id, 'active', 'full', v_until, true)
  on conflict (id) do update
    set plan = 'active',
        access_level = 'full',
        subscription_expires_at = v_until,
        manual_grant = true;

  return jsonb_build_object('ok', true, 'access_until', v_until);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.guard_profile_billing_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- O app só insere perfil quando ele não existe (fallback); nunca com acesso pago.
    new.plan := 'free';
    new.access_level := 'demo';
    new.subscription_expires_at := null;
    new.manual_grant := false;
    return new;
  end if;

  new.plan := old.plan;
  new.access_level := old.access_level;
  new.subscription_expires_at := old.subscription_expires_at;
  new.manual_grant := old.manual_grant;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, plan, access_level, professional_type, subscription_expires_at)
  values (
    new.id,
    'trial',
    'full',
    case
      when coalesce(new.raw_user_meta_data ->> 'professional_type', '') in ('lash', 'nail', 'sobrancelha', 'estetica', 'barbeiro')
        then new.raw_user_meta_data ->> 'professional_type'
      else 'lash'
    end,
    now() + interval '7 days'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.insert_team_app_notifications(p_user_id uuid, p_type text, p_title text, p_body text, p_appointment_id uuid, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count int;
begin
  begin
    insert into public.app_notifications (
      user_id, operator_id, type, title, body, appointment_id, payload
    )
    select
      p_user_id,
      m.id,
      coalesce(nullif(trim(p_type), ''), 'public_booking'),
      p_title,
      coalesce(p_body, ''),
      p_appointment_id,
      coalesce(p_payload, '{}'::jsonb)
    from public.team_members m
    where m.user_id = p_user_id
      and m.active = true
    on conflict do nothing;

    get diagnostics v_count = row_count;

    if v_count = 0 then
      insert into public.app_notifications (
        user_id, type, title, body, appointment_id, payload
      )
      values (
        p_user_id,
        coalesce(nullif(trim(p_type), ''), 'public_booking'),
        p_title,
        coalesce(p_body, ''),
        p_appointment_id,
        coalesce(p_payload, '{}'::jsonb)
      )
      on conflict do nothing;
    end if;
  exception
    when undefined_column then
      insert into public.app_notifications (
        user_id, type, title, body, appointment_id, payload
      )
      values (
        p_user_id,
        coalesce(nullif(trim(p_type), ''), 'public_booking'),
        p_title,
        coalesce(p_body, ''),
        p_appointment_id,
        coalesce(p_payload, '{}'::jsonb)
      )
      on conflict do nothing;
    when others then
      null;
  end;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.is_full_access(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.access_level = 'full'
      and (
        p.subscription_expires_at is null
        or p.subscription_expires_at > now()
      )
  );
$function$
;
CREATE OR REPLACE FUNCTION public.is_lash_designer(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.professional_type = 'lash'
  );
$function$
;
CREATE OR REPLACE FUNCTION public.lash_simulations_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_month date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_limit integer;
  v_used integer;
  v_recent integer;
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  if new.user_id is distinct from auth.uid() then
    raise exception 'lash_sim_unauthorized' using errcode = '42501';
  end if;

  if not public.is_lash_designer(new.user_id) then
    raise exception 'lash_sim_not_lash' using errcode = '42501';
  end if;

  if not public.is_full_access(new.user_id) then
    raise exception 'lash_sim_full_access_required' using errcode = '42501';
  end if;

  -- Arquivos precisam estar na pasta da própria profissional.
  if split_part(new.result_path, '/', 1) <> new.user_id::text
     or (new.original_path is not null and split_part(new.original_path, '/', 1) <> new.user_id::text) then
    raise exception 'lash_sim_bad_path' using errcode = '42501';
  end if;

  select count(*) into v_recent
  from public.lash_simulations
  where user_id = new.user_id and created_at > now() - interval '1 minute';
  if v_recent >= 6 then
    raise exception 'lash_sim_rate_limited' using errcode = 'P0001';
  end if;

  v_limit := public.lash_simulator_monthly_limit(new.user_id);
  select coalesce(saved_count, 0) into v_used
  from public.lash_simulator_usage
  where user_id = new.user_id and month = v_month;
  if coalesce(v_used, 0) >= v_limit then
    raise exception 'lash_sim_monthly_limit' using errcode = 'P0001';
  end if;

  insert into public.lash_simulator_usage (user_id, month, saved_count, updated_at)
  values (new.user_id, v_month, 1, now())
  on conflict (user_id, month)
  do update set saved_count = public.lash_simulator_usage.saved_count + 1, updated_at = now();

  new.created_at := now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.lash_simulator_ai_finish(p_id uuid, p_ok boolean, p_error text DEFAULT NULL::text, p_duration_ms integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.lash_simulator_ai_requests
     set status = case when p_ok then 'done' else 'failed' end,
         error = left(p_error, 500),
         duration_ms = p_duration_ms,
         finished_at = now()
   where id = p_id and status = 'pending';
$function$
;
CREATE OR REPLACE FUNCTION public.lash_simulator_ai_monthly_limit(p_user_id uuid DEFAULT auth.uid())
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when not public.is_lash_designer(p_user_id) then 0
    when public.is_full_access(p_user_id) then 100
    else 3 -- conta em teste: algumas gerações para conhecer o recurso
  end;
$function$
;
CREATE OR REPLACE FUNCTION public.lash_simulator_ai_reserve(p_user_id uuid, p_model text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_limit integer;
  v_used integer;
  v_recent integer;
  v_id uuid;
begin
  -- Serializa reservas da mesma profissional (evita corrida entre abas).
  perform pg_advisory_xact_lock(hashtext('lash_ai_' || p_user_id::text));

  if not public.is_lash_designer(p_user_id) then
    return json_build_object('ok', false, 'reason', 'not_lash');
  end if;

  -- Pendentes antigas (função caiu) viram falha e não contam.
  update public.lash_simulator_ai_requests
     set status = 'failed', error = 'stale', finished_at = now()
   where user_id = p_user_id and status = 'pending' and created_at < now() - interval '3 minutes';

  if exists (
    select 1 from public.lash_simulator_ai_requests
    where user_id = p_user_id and status = 'pending'
  ) then
    return json_build_object('ok', false, 'reason', 'in_progress');
  end if;

  select count(*) into v_recent
  from public.lash_simulator_ai_requests
  where user_id = p_user_id and created_at > now() - interval '10 minutes';
  if v_recent >= 8 then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  v_limit := public.lash_simulator_ai_monthly_limit(p_user_id);
  v_used := public.lash_simulator_ai_used(p_user_id);
  if v_used >= v_limit then
    return json_build_object('ok', false, 'reason', 'monthly_limit', 'limit', v_limit);
  end if;

  insert into public.lash_simulator_ai_requests (user_id, model)
  values (p_user_id, left(p_model, 80))
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id, 'used', v_used + 1, 'limit', v_limit);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.lash_simulator_ai_used(p_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::integer
  from public.lash_simulator_ai_requests
  where user_id = p_user_id
    and status in ('pending', 'done')
    and created_at >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
$function$
;
CREATE OR REPLACE FUNCTION public.lash_simulator_monthly_limit(p_user_id uuid DEFAULT auth.uid())
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when public.is_full_access(p_user_id) then 300
    else 0
  end;
$function$
;
CREATE OR REPLACE FUNCTION public.lash_simulator_quota()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select json_build_object(
    'used', coalesce((
      select saved_count from public.lash_simulator_usage
      where user_id = auth.uid()
        and month = date_trunc('month', now() at time zone 'America/Sao_Paulo')::date
    ), 0),
    'limit', public.lash_simulator_monthly_limit(auth.uid()),
    'ai_used', public.lash_simulator_ai_used(auth.uid()),
    'ai_limit', public.lash_simulator_ai_monthly_limit(auth.uid())
  )
  where public.is_lash_designer(auth.uid());
$function$
;
CREATE OR REPLACE FUNCTION public.loyalty_public_available(p_professional_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_full_access(p_professional_id)
     and coalesce((select lc.active from public.loyalty_config lc where lc.user_id = p_professional_id limit 1), true);
$function$
;
CREATE OR REPLACE FUNCTION public.normalize_br_phone(raw_phone text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.prevent_appointment_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_new_start int;
  v_new_end int;
begin
  -- Cancelado ou falta não ocupa horário.
  if coalesce(new.status, 'pending') in ('cancelled', 'no_show') then
    return new;
  end if;

  -- Na edição, só confere quando muda dia, hora, duração ou quando volta a ocupar o horário.
  if tg_op = 'UPDATE'
     and new.date is not distinct from old.date
     and new.time is not distinct from old.time
     and coalesce(new.duration_minutes, 60) = coalesce(old.duration_minutes, 60)
     and coalesce(old.status, 'pending') not in ('cancelled', 'no_show') then
    return new;
  end if;

  if new.date is null or new.time is null then
    return new;
  end if;

  -- Uma gravação por vez no mesmo dia da mesma conta.
  perform pg_advisory_xact_lock(hashtextextended('appt_day:' || new.user_id::text || ':' || new.date::text, 0));

  v_new_start := extract(hour from new.time)::int * 60 + extract(minute from new.time)::int;
  v_new_end := v_new_start + coalesce(nullif(new.duration_minutes, 0), 60);

  if exists (
    select 1
    from public.appointments a
    where a.user_id = new.user_id
      and a.date = new.date
      and a.id <> new.id
      and coalesce(a.status, 'pending') not in ('cancelled', 'no_show')
      and v_new_start < (extract(hour from a.time)::int * 60 + extract(minute from a.time)::int + coalesce(nullif(a.duration_minutes, 0), 60))
      and (extract(hour from a.time)::int * 60 + extract(minute from a.time)::int) < v_new_end
  ) then
    raise exception 'horario_ocupado: já existe um agendamento ou bloqueio nesse horário'
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.redeem_loyalty_scan_token(p_token uuid, p_team_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  v_row record;
  v_count int;
  v_goal int;
  v_reward text;
  v_client_name text;
  v_unlocked boolean := false;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_row
  from public.loyalty_scan_tokens
  where token = p_token
    and user_id = v_uid
    and used_at is null
    and expires_at > now()
  limit 1;

  if v_row.token is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_or_expired');
  end if;

  update public.loyalty_scan_tokens
  set used_at = now(), used_by_team_member_id = p_team_member_id
  where token = p_token;

  insert into public.loyalty_stamps (user_id, client_id, team_member_id, source)
  values (v_uid, v_row.client_id, p_team_member_id, 'qr');

  select goal_count, reward_description
  into v_goal, v_reward
  from public.loyalty_config
  where user_id = v_uid
  limit 1;

  if v_goal is null then
    v_goal := 10;
    v_reward := '';
  end if;

  select count(*) into v_count
  from public.loyalty_stamps
  where user_id = v_uid and client_id = v_row.client_id and redeemed_at is null;

  if v_count >= v_goal then
    update public.loyalty_stamps
    set redeemed_at = now()
    where id in (
      select id from public.loyalty_stamps
      where user_id = v_uid and client_id = v_row.client_id and redeemed_at is null
      order by created_at asc
      limit v_goal
    );
    v_unlocked := true;
    v_count := v_count - v_goal;
  end if;

  select name into v_client_name from public.clients where id = v_row.client_id;

  return jsonb_build_object(
    'ok', true,
    'client_id', v_row.client_id,
    'client_name', v_client_name,
    'stamped_count', v_count,
    'goal', v_goal,
    'reward_unlocked', v_unlocked,
    'reward_description', v_reward
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.reset_whatsapp_reminder_on_reschedule()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.date is distinct from old.date or new.time is distinct from old.time then
    new.whatsapp_reminder_sent_at := null;
    new.whatsapp_reminder_error := null;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_loyalty_config_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_profiles_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_public_booking_deposit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.set_team_members_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_appointment_start_time()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- Compatibilidade: o app atual grava date/time.
  if new.date is not null and new.time is not null then
    new.start_time := ((new.date::timestamp + new.time) at time zone 'America/Sao_Paulo');
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.trg_fanout_public_booking_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client_name text;
  v_service_name text;
  v_body text;
  v_hhmm text;
begin
  if coalesce(new.notes, '') is distinct from 'Agendamento público' then
    return new;
  end if;

  select coalesce(nullif(trim(name), ''), 'Cliente')
  into v_client_name
  from public.clients
  where id = new.client_id;

  select coalesce(nullif(trim(name), ''), '')
  into v_service_name
  from public.services
  where id = new.service_id;

  v_hhmm := to_char(new.time, 'HH24:MI');
  v_body :=
    case
      when coalesce(v_service_name, '') <> '' then
        coalesce(v_client_name, 'Cliente')
        || ' agendou '
        || v_service_name
        || ' para '
        || to_char(new.date, 'DD/MM')
        || ' às '
        || v_hhmm
      else
        coalesce(v_client_name, 'Cliente')
        || ' agendou para '
        || to_char(new.date, 'DD/MM')
        || ' às '
        || v_hhmm
    end;

  perform public.insert_team_app_notifications(
    new.user_id,
    'public_booking',
    'Novo agendamento',
    v_body,
    new.id,
    jsonb_build_object(
      'date', new.date,
      'time', v_hhmm,
      'clientName', coalesce(v_client_name, 'Cliente'),
      'serviceName', coalesce(v_service_name, '')
    )
  );

  delete from public.app_notifications
  where appointment_id = new.id
    and user_id = new.user_id
    and operator_id is null;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.trg_skip_unscoped_public_booking_inbox()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.operator_id is null
     and new.appointment_id is not null
     and exists (
       select 1
       from public.app_notifications n
       where n.user_id = new.user_id
         and n.appointment_id = new.appointment_id
         and n.operator_id is not null
         and n.id is distinct from new.id
     )
  then
    return null;
  end if;
  return new;
end;
$function$
;

-- ═══ Gatilhos ═══

CREATE TRIGGER trg_skip_unscoped_public_booking_inbox BEFORE INSERT ON public.app_notifications FOR EACH ROW EXECUTE FUNCTION trg_skip_unscoped_public_booking_inbox();
CREATE TRIGGER appointments_reset_whatsapp_reminder BEFORE UPDATE OF date, "time" ON public.appointments FOR EACH ROW EXECUTE FUNCTION reset_whatsapp_reminder_on_reschedule();
CREATE TRIGGER trg_appointments_enforce_full_access BEFORE INSERT OR DELETE OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION enforce_full_access_write();
CREATE TRIGGER trg_appointments_prevent_overlap BEFORE INSERT OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION prevent_appointment_overlap();
CREATE TRIGGER trg_appointments_public_deposit BEFORE INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION set_public_booking_deposit();
CREATE TRIGGER trg_fanout_public_booking_notifications AFTER INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION trg_fanout_public_booking_notifications();
CREATE TRIGGER trg_sync_appointment_start_time BEFORE INSERT OR UPDATE OF date, "time" ON public.appointments FOR EACH ROW EXECUTE FUNCTION sync_appointment_start_time();
CREATE TRIGGER trg_cash_expenses_enforce_full_access BEFORE INSERT OR DELETE OR UPDATE ON public.cash_expenses FOR EACH ROW EXECUTE FUNCTION enforce_full_access_write();
CREATE TRIGGER trg_client_photos_enforce_full_access BEFORE INSERT OR DELETE OR UPDATE ON public.client_photos FOR EACH ROW EXECUTE FUNCTION enforce_full_access_write();
CREATE TRIGGER trg_client_records_enforce_full_access BEFORE INSERT OR DELETE OR UPDATE ON public.client_records FOR EACH ROW EXECUTE FUNCTION enforce_full_access_write();
CREATE TRIGGER trg_clients_enforce_full_access BEFORE INSERT OR DELETE OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION enforce_full_access_write();
CREATE TRIGGER trg_config_enforce_full_access BEFORE INSERT OR DELETE OR UPDATE ON public.config FOR EACH ROW EXECUTE FUNCTION enforce_full_access_write();
CREATE TRIGGER trg_inventory_items_enforce_full_access BEFORE INSERT OR DELETE OR UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION enforce_full_access_write();
CREATE TRIGGER trg_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_inventory_movements_enforce_full_access BEFORE INSERT OR DELETE OR UPDATE ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION enforce_full_access_write();
CREATE TRIGGER trg_lash_simulations_before_insert BEFORE INSERT ON public.lash_simulations FOR EACH ROW EXECUTE FUNCTION lash_simulations_before_insert();
CREATE TRIGGER loyalty_config_set_updated_at BEFORE UPDATE ON public.loyalty_config FOR EACH ROW EXECUTE FUNCTION set_loyalty_config_updated_at();
CREATE TRIGGER profiles_guard_billing_fields BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_billing_fields();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_profiles_updated_at();
CREATE TRIGGER trg_services_enforce_full_access BEFORE INSERT OR DELETE OR UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION enforce_full_access_write();
CREATE TRIGGER team_members_set_updated_at BEFORE UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION set_team_members_updated_at();
CREATE TRIGGER trg_team_members_enforce_full_access BEFORE INSERT OR DELETE OR UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION enforce_full_access_write();

-- ═══ Armazenamento ═══

-- bucket client-files: public=f, limite=8388608, tipos={image/jpeg,image/png,image/webp}
-- bucket lash-simulations: public=f, limite=6291456, tipos={image/jpeg,image/png,image/webp}
