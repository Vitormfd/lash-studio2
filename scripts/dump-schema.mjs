// Grava supabase/schema.sql com o retrato atual do banco (só leitura).
// Uso: node scripts/dump-schema.mjs   (precisa do projeto ligado: npx supabase link)
//
// Não substitui um backup: serve para ver o esquema no repositório, comparar mudanças
// e recriar um ambiente de teste. As tarefas agendadas (pg_cron) ficam de fora porque
// o comando delas leva o segredo das Edge Functions.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = execFileSync('npx', ['supabase', 'db', 'query', '--remote', '--read-only', '-o', 'json', '-f', 'scripts/dump-schema.sql'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  shell: process.platform === 'win32',
})

const json = JSON.parse(out.slice(out.indexOf('{')))
const rows = json.rows || []
const sql = rows[0]?.schema_sql
if (!sql) throw new Error('Consulta não devolveu o esquema. Saída: ' + out.slice(0, 500))

const header = `-- Esquema do banco (Supabase, schema public) — gerado por scripts/dump-schema.mjs em ${new Date().toISOString().slice(0, 10)}.
-- Não edite à mão: rode o script de novo depois de aplicar um SQL de supabase/sql/.
-- Ordem para recriar: tabelas, restrições, índices, funções, views, RLS, políticas, gatilhos.

`
writeFileSync(join(root, 'supabase', 'schema.sql'), header + sql.replace(/\r\n/g, '\n') + '\n')
console.log(`supabase/schema.sql: ${sql.split('\n').length} linhas`)
