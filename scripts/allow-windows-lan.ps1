# Execute from an Administrator PowerShell only when Windows blocks LAN access.
param()
$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Abre PowerShell como administrador para crear regla de firewall.'
}
$port = 3210
$envFile = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
if (Test-Path $envFile) {
  $line = Get-Content $envFile | Where-Object { $_ -match '^PORT=\d+$' } | Select-Object -Last 1
  if ($line) { $port = [int]($line -replace '^PORT=', '') }
}
if ($port -lt 1 -or $port -gt 65535) { throw 'PORT debe estar entre 1 y 65535.' }
$name = "CasaCine-LAN-$port"
if (-not (Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -Name $name -DisplayName "Guarida (red privada, puerto $port)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile Private -RemoteAddress LocalSubnet
}
if (-not (Get-NetFirewallRule -Name 'CasaCine-Discovery' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -Name 'CasaCine-Discovery' -DisplayName 'Guarida TV discovery (red privada)' -Direction Inbound -Action Allow -Protocol UDP -LocalPort 3211 -Profile Private -RemoteAddress LocalSubnet
}
Write-Host "Guarida permitida en red privada y subred local, puerto $port." -ForegroundColor Green
