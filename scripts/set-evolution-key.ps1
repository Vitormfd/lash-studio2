# Salva a API key da Evolution nos secrets das Edge Functions do Easy Studio.
# Uso: copie a AUTHENTICATION_API_KEY (Easypanel > evolution-api > Ambiente) e rode:
#   .\scripts\set-evolution-key.ps1
# A chave é lida da área de transferência (colar no terminal do VS Code corrompe o valor).

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))

$apiKey = [string](Get-Clipboard -Raw)
$apiKey = $apiKey.Trim()
# Aceita a linha inteira do Easypanel (AUTHENTICATION_API_KEY=...).
$apiKey = $apiKey -replace '^\s*AUTHENTICATION_API_KEY\s*=\s*', ''
# Remove aspas, marcadores de colagem do terminal e caracteres invisiveis.
$apiKey = (($apiKey -replace '\x1b?\[20[01]~', '') -replace '[^\x21-\x7E]', '').Trim('"', "'")

if (-not $apiKey -or $apiKey.Length -lt 8) {
  Write-Host "Area de transferencia vazia ou invalida. Copie a AUTHENTICATION_API_KEY e rode de novo." -ForegroundColor Red
  exit 1
}

Write-Host "Chave lida da area de transferencia: $($apiKey.Length) caracteres, termina em ...$($apiKey.Substring($apiKey.Length - 4))"
npx supabase secrets set "EVOLUTION_API_KEY=$apiKey"
if ($LASTEXITCODE -ne 0) { exit 1 }
Set-Clipboard -Value " "
Write-Host "Pronto! Chave salva (area de transferencia limpa)." -ForegroundColor Green
