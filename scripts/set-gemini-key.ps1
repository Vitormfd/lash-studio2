# Salva a chave do Google Gemini nos secrets das Edge Functions do Easy Studio.
# Uso: crie a chave em https://aistudio.google.com/apikey (com faturamento ativo),
# copie para a área de transferência e rode:
#   .\scripts\set-gemini-key.ps1
# A chave é lida da área de transferência (colar no terminal pode corromper o valor).

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))

$apiKey = [string](Get-Clipboard -Raw)
$apiKey = $apiKey.Trim()
$apiKey = $apiKey -replace '^\s*GEMINI_API_KEY\s*=\s*', ''
$apiKey = (($apiKey -replace '\x1b?\[20[01]~', '') -replace '[^\x21-\x7E]', '').Trim('"', "'")

if (-not $apiKey -or $apiKey.Length -lt 20) {
  Write-Host "Area de transferencia vazia ou invalida. Copie a chave do Gemini e rode de novo." -ForegroundColor Red
  exit 1
}

Write-Host "Chave lida: $($apiKey.Length) caracteres, termina em ...$($apiKey.Substring($apiKey.Length - 4))"
npx supabase secrets set "GEMINI_API_KEY=$apiKey"
if ($LASTEXITCODE -ne 0) { exit 1 }
Set-Clipboard -Value " "
Write-Host "Pronto! Chave salva (area de transferencia limpa)." -ForegroundColor Green
