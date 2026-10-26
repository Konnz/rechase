// Bündelt den Node-Server nach build/index.js, damit das Image nur "node build" starten muss.
import { build } from 'esbuild';

await build({
  entryPoints: ['apps/server/src/index.ts'],
  outfile: 'build/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  logLevel: 'info',
});
