# Salva a API key da Evolution nos secrets das Edge Functions do Easy Studio.
# Uso: .\scripts\set-evolution-key.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))

Write-Host "Cole a AUTHENTICATION_API_KEY da Evolution (Easypanel > evolution-api > Ambiente)." -ForegroundColor Yellow
$secure = Read-Host "API Key" -AsSecureString
$apiKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if (-not $apiKey) {
  Write-Host "API Key vazia, abortando." -ForegroundColor Red
  exit 1
}

npx supabase secrets set "EVOLUTION_API_KEY=$apiKey"
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "Pronto! Lembretes automaticos do WhatsApp configurados." -ForegroundColor Green
