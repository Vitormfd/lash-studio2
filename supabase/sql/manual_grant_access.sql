-- Protect manually activated users from Stripe/webhook downgrades.
-- Execute in Supabase SQL Editor.

alter table public.profiles
add column if not exists manual_grant boolean not null default false;

comment on column public.profiles.manual_grant is
  'When true, Stripe/payment webhooks must not downgrade plan/access_level.';

-- Lock the user that was being reverted weekly (manual activation).
update public.profiles
set
  plan = 'active',
  access_level = 'full',
  manual_grant = true,
  subscription_expires_at = null,
  updated_at = now()
where id = '4a50372b-add4-4145-89b3-cb86160ee40e';

-- Template for future manual activations:
-- update public.profiles
-- set plan = 'active', access_level = 'full', manual_grant = true, subscription_expires_at = null
-- where id = '<user-uuid>';
