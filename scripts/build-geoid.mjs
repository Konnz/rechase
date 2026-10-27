// Erzeugt packages/core/data/egm96-1deg.bin: Geoidhöhe (EGM96) über dem WGS84-Ellipsoid im 1°-Raster.
// Zeilen von 90° N bis 90° S, Spalten von 0° bis 359° O, je ein Int16 in Dezimetern (little endian).
// Einmalig ausführen: npm i --no-save egm96-universal && node scripts/build-geoid.mjs
import { writeFileSync } from 'node:fs';
import * as egm96 from 'egm96-universal';

const rows = 181;
const cols = 360;
const grid = new Int16Array(rows * cols);
for (let i = 0; i < rows; i++)
  for (let j = 0; j < cols; j++) grid[i * cols + j] = Math.round(egm96.meanSeaLevel(90 - i, j) * 10);
writeFileSync(new URL('../packages/core/data/egm96-1deg.bin', import.meta.url), Buffer.from(grid.buffer));
console.log('egm96-1deg.bin', grid.byteLength, 'Bytes');
