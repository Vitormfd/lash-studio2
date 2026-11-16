-- Resumo do dia por push: 1h antes do primeiro atendimento, "Hoje você tem N atendimentos: horários".
-- Uma linha por conta e por dia garante que o resumo sai uma vez só, mesmo com o cron rodando a cada 5 min.
-- Sem políticas de RLS: só a função send-scheduled-pushes (service_role) lê e grava.

create table if not exists public.daily_summary_pushes (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  appointments integer not null default 0,
  sent_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.daily_summary_pushes enable row level security;
