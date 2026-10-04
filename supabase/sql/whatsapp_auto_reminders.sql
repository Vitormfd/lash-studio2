-- Lembrete automático pelo WhatsApp (Evolution API)
-- Execute no SQL Editor do Supabase.

alter table public.config
  add column if not exists whatsapp_auto_enabled boolean not null default false;

alter table public.config
  add column if not exists whatsapp_auto_hours_before integer not null default 24;

comment on column public.config.whatsapp_auto_enabled is
  'Se true, a função whatsapp-reminders envia o lembrete para a cliente pelo WhatsApp conectado.';
comment on column public.config.whatsapp_auto_hours_before is
  'Antecedência (em horas) do lembrete automático pelo WhatsApp.';

alter table public.appointments
  add column if not exists whatsapp_reminder_sent_at timestamptz;

alter table public.appointments
  add column if not exists whatsapp_reminder_error text;

comment on column public.appointments.whatsapp_reminder_sent_at is
  'Quando o lembrete automático do WhatsApp foi enviado para a cliente.';

create index if not exists appointments_whatsapp_reminder_pending_idx
  on public.appointments (user_id, date)
  where whatsapp_reminder_sent_at is null;

-- Se a data/horário mudar, o lembrete volta a ficar pendente.
create or replace function public.reset_whatsapp_reminder_on_reschedule()
returns trigger
language plpgsql
as $$
begin
  if new.date is distinct from old.date or new.time is distinct from old.time then
    new.whatsapp_reminder_sent_at := null;
    new.whatsapp_reminder_error := null;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_reset_whatsapp_reminder on public.appointments;
create trigger appointments_reset_whatsapp_reminder
  before update of date, time on public.appointments
  for each row execute function public.reset_whatsapp_reminder_on_reschedule();

-- ─── Cron a cada 5 minutos ───────────────────────────────────────────────────
-- Reaproveita o comando (e o CRON_SECRET) do cron de push já existente.
-- Remove também o job antigo "send-whatsapp-reminders", que apontava para uma função inexistente.
do $cron$
declare
  cmd text;
begin
  select command into cmd from cron.job where jobname = 'send-scheduled-pushes-every-5m';
  if cmd is null then
    raise exception 'Cron send-scheduled-pushes-every-5m não encontrado. Rode setup_push_cron.sql antes.';
  end if;

  cmd := replace(cmd, '/functions/v1/send-scheduled-pushes', '/functions/v1/whatsapp-reminders');
  cmd := replace(cmd, $q$'{}'::jsonb$q$, $q$'{"action":"send_reminders"}'::jsonb, timeout_milliseconds := 120000$q$);

  if exists (select 1 from cron.job where jobname = 'send-whatsapp-reminders-every-5m') then
    perform cron.unschedule('send-whatsapp-reminders-every-5m');
  end if;
  if exists (select 1 from cron.job where jobname = 'whatsapp-reminders-every-5m') then
    perform cron.unschedule('whatsapp-reminders-every-5m');
  end if;

  perform cron.schedule('whatsapp-reminders-every-5m', '*/5 * * * *', cmd);
end
$cron$;

-- Para checar: select jobname, schedule, active from cron.job;
-- Para remover: select cron.unschedule('whatsapp-reminders-every-5m');
