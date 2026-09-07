// Copies the tfjs WASM backend binaries into `public/`, where `setWasmPaths('/')`
// in src/index.jsx expects to find them at runtime.
//
// tfjs ships three variants and picks one by feature-detecting the browser, so
// all three have to be present or the backend silently fails to initialise.
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, '..', 'node_modules', '@tensorflow', 'tfjs-backend-wasm', 'dist');
const to = join(here, '..', 'public');

await mkdir(to, { recursive: true });
const wasmFiles = (await readdir(from)).filter((name) => name.endsWith('.wasm'));
if (wasmFiles.length === 0) {
  throw new Error(`No .wasm files found in ${from} — is @tensorflow/tfjs-backend-wasm installed?`);
}
for (const name of wasmFiles) {
  await copyFile(join(from, name), join(to, name));
}
console.log(`copied ${wasmFiles.length} tfjs wasm binaries -> public/`);
