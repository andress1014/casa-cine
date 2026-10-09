param([string[]]$Address = @())
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoPath '.env'
if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
    throw 'Instala mkcert desde https://github.com/FiloSottile/mkcert y vuelve a ejecutar este script. No desactives seguridad del navegador.'
}
if (-not $Address.Count) {
    $Address = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
        $_.AddressState -eq 'Preferred' -and $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)'
    } | Select-Object -ExpandProperty IPAddress -Unique)
}
if (-not $Address.Count) { throw 'No encontramos IPv4 de red local. Usa -Address 192.168.1.13 (IP real de tu Windows).' }
foreach ($ipAddress in $Address) {
    $parsedAddress = $null
    if (-not [System.Net.IPAddress]::TryParse($ipAddress,[ref]$parsedAddress) -or
        $parsedAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or
        $ipAddress -notmatch '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)') { throw "IP privada inválida: $ipAddress" }
}
$content = if (Test-Path $envPath) { Get-Content $envPath -Raw } else { '' }
$dataPath = Join-Path $repoPath 'data'
$dataMatch = [regex]::Match($content,'(?m)^DATA_DIR\s*=\s*(.+?)\s*$')
if ($dataMatch.Success) {
    $configuredPath = $dataMatch.Groups[1].Value.Trim().Trim('"').Trim("'")
    $dataPath = if ([System.IO.Path]::IsPathRooted($configuredPath)) { $configuredPath } else { Join-Path $repoPath $configuredPath }
}
$tlsPath = Join-Path $dataPath 'tls'
New-Item -ItemType Directory -Path $tlsPath -Force | Out-Null
$certPath = Join-Path $tlsPath 'guarida.pem'
$keyPath = Join-Path $tlsPath 'guarida-key.pem'
& mkcert -install
if ($LASTEXITCODE -ne 0) { throw 'mkcert no pudo instalar autoridad local.' }
& mkcert -cert-file $certPath -key-file $keyPath localhost 127.0.0.1 ::1 @Address
if ($LASTEXITCODE -ne 0) { throw 'mkcert no pudo crear certificado.' }
$caPath = (& mkcert -CAROOT | Select-Object -Last 1).Trim()
Copy-Item (Join-Path $caPath 'rootCA.pem') (Join-Path $tlsPath 'Guarida-CA.crt') -Force
foreach ($setting in @(@('TLS_PORT','3443'),@('TLS_CERT',$certPath.Replace('\','/')),@('TLS_KEY',$keyPath.Replace('\','/')))) {
    $pattern = '(?m)^' + [regex]::Escape($setting[0]) + '=.*$'
    $entry = $setting[0] + '=' + '"' + $setting[1] + '"'
    if ([regex]::IsMatch($content,$pattern)) { $content = [regex]::Replace($content,$pattern,[System.Text.RegularExpressions.MatchEvaluator]{ param($match) $entry }) }
    else { $content = $content.TrimEnd() + "`r`n" + $entry + "`r`n" }
}
[System.IO.File]::WriteAllText($envPath,$content,[System.Text.UTF8Encoding]::new($false))
$rule = Get-NetFirewallRule -Name 'Guarida-Gaming-HTTPS' -ErrorAction SilentlyContinue
if ($rule) { Remove-NetFirewallRule -Name 'Guarida-Gaming-HTTPS' }
New-NetFirewallRule -Name 'Guarida-Gaming-HTTPS' -DisplayName 'Guarida Gaming HTTPS (casa)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3443 -Profile Private -RemoteAddress LocalSubnet | Out-Null
Write-Host 'HTTPS configurado. Reinicia servidor o tarea CasaCine.'
foreach ($ipAddress in $Address) { Write-Host "Gaming: https://${ipAddress}:3443/gaming" }
Write-Host "Instala certificado público $tlsPath\Guarida-CA.crt en dispositivos donde juegues."
Write-Host 'Certificado debe ser de confianza. No basta omitir aviso HTTPS. No compartas claves privadas.'
