import { createApplication } from './app.mjs';
import { localUrls } from './network.mjs';
import { startDiscovery } from './discovery.mjs';
import { createServer } from 'node:https';
import { readFile } from 'node:fs/promises';

const server = await createApplication({ dev: process.argv.includes('--dev') });
let https;
if (server.config.tlsCert && server.config.tlsKey) {
  const [cert,key] = await Promise.all([readFile(server.config.tlsCert),readFile(server.config.tlsKey)]);
  https = createServer({ cert,key },server.app);
  https.listen(server.config.tlsPort,server.config.host,() => {
    console.log(`  Gaming HTTPS: https://localhost:${server.config.tlsPort}/gaming`);
    if (server.config.host !== '127.0.0.1') for (const url of localUrls(server.config.tlsPort)) console.log(`  Gaming casa:  ${url.replace('http:','https:')}/gaming`);
  });
}
const discovery = process.env.DISCOVERY === 'off' ? null : startDiscovery(server.config.port, server.config.host);
const http = server.app.listen(server.config.port, server.config.host, () => {
  console.log('\n  ◉ Guarida · Tu casa conectada\n');
  console.log(`  En esta PC: http://localhost:${server.config.port}`);
  if (server.config.host !== '127.0.0.1') for (const url of localUrls(server.config.port)) console.log(`  En casa:    ${url}`);
  console.log(`\n  Datos guardados en: ${server.config.dataDir}`);
  console.log('  Mantén esta ventana abierta. Ctrl+C para detener.\n');
});
// Uploads may take hours over Wi-Fi. Socket inactivity still has a bounded timeout.
for (const listener of [http,https].filter(Boolean)) {
listener.requestTimeout = 0;
listener.headersTimeout = 60_000;
listener.timeout = 10 * 60_000;
listener.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'Puerto ocupado. Cierra otra instancia o cambia PORT en .env.' : 'No pudimos iniciar Guarida. Revisa configuración.');
  void server.close().then(() => process.exit(1));
});
}
let closing = false;
async function close() {
  if (closing) return; closing = true;
  http.close();
  http.closeAllConnections();
  https?.close(); https?.closeAllConnections();
  discovery?.close();
  await server.close();
  process.exit(0);
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
