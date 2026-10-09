import dgram from 'node:dgram';
import { isLocalAddress } from './network.mjs';

export function startDiscovery(httpPort, host = '0.0.0.0', discoveryPort = 3211) {
  const socket = dgram.createSocket('udp4');
  const request = Buffer.from('CASACINE_DISCOVER_V1');
  const response = Buffer.from(JSON.stringify({ app: 'CasaCine', version: 1, port: httpPort }));
  let bound = false;
  socket.on('message', (message, remote) => {
    if (isLocalAddress(remote.address) && message.equals(request)) socket.send(response, remote.port, remote.address, () => {});
  });
  socket.on('error', () => {
    console.warn('DISCOVERY_UNAVAILABLE: conexión manual sigue disponible.');
    try { socket.close(); } catch { /* Socket may already be closed. */ }
  });
  socket.on('close', () => { bound = false; });
  socket.bind(discoveryPort, host === '127.0.0.1' ? host : '0.0.0.0', () => { bound = true; });
  return { socket, close() { if (bound) socket.close(); } };
}
