import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'casacine-ui-'));
const child = spawn(process.execPath, [path.resolve('node_modules/@playwright/test/cli.js'), 'test', ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, CASACINE_TEST_DATA_DIR: dataDir }, shell: false,
});
const code = await new Promise(resolve => {
  child.once('error', () => resolve(1)); child.once('exit', code => resolve(code ?? 1));
});
await rm(dataDir, { recursive: true, force: true });
process.exitCode = code;
