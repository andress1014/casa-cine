import { createApplication } from './app.mjs';
import { localUrls } from './network.mjs';
import { startDiscovery } from './discovery.mjs';

const server = await createApplication({ dev: process.argv.includes('--dev') });
const discovery = process.env.DISCOVERY === 'off' ? null : startDiscovery(server.config.port, server.config.host);
const http = server.app.listen(server.config.port, server.config.host, () => {
  console.log('\n  ◉ CasaCine · El mejor plan está en casa\n');
  console.log(`  En esta PC: http://localhost:${server.config.port}`);
  for (const url of localUrls(server.config.port)) console.log(`  En casa:    ${url}`);
  console.log(`\n  Videos guardados en: ${server.config.dataDir}`);
  console.log('  Mantén esta ventana abierta. Ctrl+C para detener.\n');
});
// Uploads may take hours over Wi-Fi. Socket inactivity still has a bounded timeout.
http.requestTimeout = 0;
http.headersTimeout = 60_000;
http.timeout = 10 * 60_000;
http.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'Puerto ocupado. Cierra otra instancia o cambia PORT en .env.' : 'No pudimos iniciar CasaCine. Revisa configuración.');
  void server.close().then(() => process.exit(1));
});
let closing = false;
async function close() {
  if (closing) return; closing = true;
  http.close();
  http.closeAllConnections();
  discovery?.close();
  await server.close();
  process.exit(0);
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
