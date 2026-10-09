$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
Write-Host "`n  Guarida - Tu casa conectada`n" -ForegroundColor Green

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  Write-Host 'Instala Node.js LTS (version 24 o superior) desde https://nodejs.org/' -ForegroundColor Yellow
  Write-Host 'Despues vuelve a abrir INICIAR-WINDOWS.cmd.'
  exit 1
}
$nodeVersion = & node.exe -p "Number(process.versions.node.split('.')[0])"
if ([int]$nodeVersion -lt 24) {
  Write-Host 'Necesitas Node.js 24 o superior. Instala version LTS desde https://nodejs.org/.' -ForegroundColor Yellow
  exit 1
}
if (-not (Test-Path '.env')) { Copy-Item '.env.example' '.env' }
if (-not (Test-Path 'node_modules/.package-lock.json')) {
  Write-Host 'Preparando Guarida. Primera vez necesita internet y puede tardar unos minutos...'
  & npm.cmd ci --registry=https://registry.npmjs.org/
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar dependencias. Revisa conexion a internet.' }
}
# Rebuild on every launch so updates from GitHub never use an outdated interface.
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar interfaz. Revisa mensajes anteriores.' }
Write-Host "`nPermite Node.js en redes privadas si Windows muestra aviso de firewall." -ForegroundColor Yellow
Write-Host 'Servidor mostrara direcciones para otros equipos de casa.'
& npm.cmd start
exit $LASTEXITCODE
