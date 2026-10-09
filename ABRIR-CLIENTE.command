#!/bin/sh
cd "$(dirname "$0")" || exit 1
printf 'Dirección CasaCine de PC servidor (192.168.1.50:3210): '
IFS= read -r casacine_address
if ! command -v python3 >/dev/null 2>&1; then
  printf 'Necesitas Python 3 para este acceso; también puedes abrir dirección en navegador y elegir nombre.\n'
  exit 1
fi
python3 - "$casacine_address" <<'PY'
import ipaddress, pwd, os, sys, subprocess
from urllib.parse import urlsplit, quote
address = sys.argv[1].strip()
if '://' not in address: address = 'http://' + address
try:
    uri = urlsplit(address)
    ip = ipaddress.IPv4Address(uri.hostname)
    networks = ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','169.254.0.0/16')
    if uri.scheme != 'http' or not any(ip in ipaddress.ip_network(n) for n in networks) or uri.username or uri.password or uri.query or uri.fragment or uri.path not in ('','/'):
        raise ValueError()
    port = uri.port or 3210
    if not 1 <= port <= 65535: raise ValueError()
except (ValueError, TypeError):
    sys.exit('Usa IP privada de PC servidor, sin rutas ni parámetros.')
url = f'http://{ip}:{port}/#user={quote(pwd.getpwuid(os.getuid()).pw_name,safe="")}'
subprocess.run(['open' if sys.platform == 'darwin' else 'xdg-open', url], check=True)
PY
