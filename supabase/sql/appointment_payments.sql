-- Execute no Supabase SQL Editor após a tabela appointments existir.

alter table public.appointments
  add column if not exists payment_method text;

alter table public.appointments
  add column if not exists payment_value numeric;

alter table public.appointments
  add column if not exists payment_notes text;

alter table public.appointments
  add column if not exists paid_at timestamptz;

comment on column public.appointments.payment_method is 'Metodo de pagamento do atendimento: cash | pix | credit_card | debit_card.';
comment on column public.appointments.payment_value is 'Valor efetivamente pago no atendimento.';
comment on column public.appointments.payment_notes is 'Observacao opcional do pagamento.';
comment on column public.appointments.paid_at is 'Data/hora da confirmacao do pagamento.';
