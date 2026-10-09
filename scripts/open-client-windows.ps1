$ErrorActionPreference = 'Stop'
$address = Read-Host 'Direccion CasaCine de PC servidor (ejemplo: 192.168.1.50:3210)'
if ($address -notmatch '^http://') { $address = "http://$address" }
$uri = [Uri]$address
$ip = $null
if ($uri.Scheme -ne 'http' -or -not [System.Net.IPAddress]::TryParse($uri.Host, [ref]$ip) -or $ip.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
  throw 'Introduce IP privada de PC servidor.'
}
$octets = $ip.GetAddressBytes()
$private = $octets[0] -eq 10 -or ($octets[0] -eq 192 -and $octets[1] -eq 168) -or ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) -or ($octets[0] -eq 169 -and $octets[1] -eq 254)
if (-not $private -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -ne '/') { throw 'Usa IP privada sin rutas, credenciales ni parametros.' }
$port = if ($address -match ':([0-9]{1,5})/?$') { [int]$Matches[1] } else { 3210 }
if ($port -lt 1 -or $port -gt 65535) { throw 'Puerto invalido.' }
$user = [Uri]::EscapeDataString([Environment]::UserName)
Start-Process "http://$($uri.Host):$port/#user=$user"
