/**
 * Compiles every sample spec (Tesserae.Flint.Sample/specs/*.json — the same
 * files the gallery renders) with all three flint backends through the SAME
 * bundle that ships in the NuGet package. Failures here mean the packaged
 * compiler cannot handle the spec — before any rendering is involved.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const src = await readFile(resolve(here, '../assets/js/flint-chart.min.js'), 'utf8');
const window = {};
new Function('window', 'self', 'globalThis', src)(window, window, window);

const specsDir = resolve(here, '../../Tesserae.Flint.Sample/specs');
const files = (await readdir(specsDir)).filter((f) => f.endsWith('.json')).sort();
assert.ok(files.length > 0, 'no spec files found');

// Per-backend shape checks (same idea as build/bundle.test.mjs) so a
// degenerate-but-object result still fails.
const shapeKeys = {
  assembleVegaLite: ['mark', 'layer'], // single-view vs layered spec
  assembleECharts: ['series'],
  assembleChartjs: ['type', 'data'],
};

let failures = 0;
for (const file of files) {
  const input = JSON.parse(await readFile(resolve(specsDir, file), 'utf8'));
  for (const [fn, keys] of Object.entries(shapeKeys)) {
    try {
      const spec = window.flint[fn](structuredClone(input));
      assert.ok(spec && typeof spec === 'object', 'no spec object returned');
      assert.ok(keys.some((k) => k in spec), `spec missing all of: ${keys.join(', ')}`);
    } catch (e) {
      failures++;
      console.error(`FAIL ${file} / ${fn}: ${e.message}`);
    }
  }
}
if (failures) {
  console.error(`${failures} failures`);
  process.exit(1);
}
console.log(`specs.test.mjs: ${files.length} specs x 3 backends compiled OK`);
