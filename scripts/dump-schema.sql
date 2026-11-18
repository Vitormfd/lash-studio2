-- Gera o retrato do esquema "public" (tabelas, restrições, índices, RLS, funções, gatilhos e views).
-- Só leitura. Uso: node scripts/dump-schema.mjs  (grava supabase/schema.sql)
with
tbls as (
  select c.oid, c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
cols as (
  select t.relname,
         string_agg(
           format('  %I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                  case when a.attnotnull then ' not null' else '' end,
                  case when d.adbin is not null then ' default ' || pg_get_expr(d.adbin, d.adrelid) else '' end),
           E',\n' order by a.attnum) as body
  from tbls t
  join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  group by t.relname
),
part_tables as (
  select string_agg(format(E'create table public.%I (\n%s\n);', relname, body), E'\n\n' order by relname) s from cols
),
part_constraints as (
  select string_agg(format('alter table public.%I add constraint %I %s;', t.relname, co.conname, pg_get_constraintdef(co.oid)),
                    E'\n' order by t.relname, co.contype desc, co.conname) s
  from pg_constraint co join tbls t on t.oid = co.conrelid
),
part_indexes as (
  select string_agg(i.indexdef || ';', E'\n' order by i.tablename, i.indexname) s
  from pg_indexes i
  where i.schemaname = 'public'
    and not exists (select 1 from pg_constraint co where co.conname = i.indexname and co.connamespace = 'public'::regnamespace)
),
part_rls as (
  select string_agg(format('alter table public.%I enable row level security;', c.relname), E'\n' order by c.relname) s
  from pg_class c join tbls t on t.oid = c.oid where c.relrowsecurity
),
part_policies as (
  select string_agg(
           format('create policy %I on %s as %s for %s to %s%s%s;',
                  p.polname, p.polrelid::regclass,
                  case when p.polpermissive then 'permissive' else 'restrictive' end,
                  case p.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' else 'all' end,
                  coalesce((select string_agg(case when r = 0 then 'public' else quote_ident(pg_get_userbyid(r)) end, ', ') from unnest(p.polroles) r), 'public'),
                  case when p.polqual is not null then E'\n  using (' || pg_get_expr(p.polqual, p.polrelid) || ')' else '' end,
                  case when p.polwithcheck is not null then E'\n  with check (' || pg_get_expr(p.polwithcheck, p.polrelid) || ')' else '' end),
           E'\n\n' order by p.polrelid::regclass::text, p.polname) s
  from pg_policy p
  where p.polrelid in (select oid from tbls)
     or (p.polrelid = 'storage.objects'::regclass and p.polname ~ '^(client_files|lash_sim)')
),
part_views as (
  select string_agg(format(E'create or replace view public.%I as\n%s', c.relname, pg_get_viewdef(c.oid, true)), E'\n\n' order by c.relname) s
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
),
part_functions as (
  select string_agg(pg_get_functiondef(p.oid) || ';', E'\n' order by p.proname, p.oid) s
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
part_triggers as (
  select string_agg(pg_get_triggerdef(tg.oid) || ';', E'\n' order by tg.tgrelid::regclass::text, tg.tgname) s
  from pg_trigger tg where not tg.tgisinternal and tg.tgrelid in (select oid from tbls)
),
part_buckets as (
  select string_agg(format('-- bucket %s: public=%s, limite=%s, tipos=%s', id, public, file_size_limit, allowed_mime_types), E'\n' order by id) s
  from storage.buckets
)
select concat_ws(E'\n\n',
  '-- ═══ Tabelas ═══', (select s from part_tables),
  '-- ═══ Restrições ═══', (select s from part_constraints),
  '-- ═══ Índices ═══', (select s from part_indexes),
  '-- ═══ RLS ═══', (select s from part_rls),
  '-- ═══ Políticas ═══', (select s from part_policies),
  '-- ═══ Views ═══', (select s from part_views),
  '-- ═══ Funções ═══', (select s from part_functions),
  '-- ═══ Gatilhos ═══', (select s from part_triggers),
  '-- ═══ Armazenamento ═══', (select s from part_buckets)
) as schema_sql;
