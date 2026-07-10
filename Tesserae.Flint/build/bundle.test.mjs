import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const js = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/js');

// 1. flint-chart bundle defines window.flint with the three assemble functions.
const src = await readFile(resolve(js, 'flint-chart.min.js'), 'utf8');
const window = {};
new Function('window', 'self', 'globalThis', src)(window, window, window);
for (const fn of ['assembleVegaLite', 'assembleECharts', 'assembleChartjs']) {
  assert.equal(typeof window.flint?.[fn], 'function', `window.flint.${fn} missing`);
}

// 2. flint compiles a trivial bar chart for each backend.
const input = {
  data: { values: [{ cat: 'a', val: 1 }, { cat: 'b', val: 2 }] },
  semantic_types: { cat: 'Category', val: 'Quantity' },
  chart_spec: {
    chartType: 'Bar Chart',
    encodings: { x: { field: 'cat' }, y: { field: 'val' } },
    baseSize: { width: 400, height: 300 },
  },
};
const shapeKeys = {
  assembleVegaLite: ['mark', 'layer'], // single-view vs layered spec
  assembleECharts: ['series'],
  assembleChartjs: ['type', 'data'],
};
for (const [fn, keys] of Object.entries(shapeKeys)) {
  const spec = window.flint[fn](structuredClone(input));
  assert.ok(spec && typeof spec === 'object', `${fn} returned no spec`);
  assert.ok(keys.some((k) => k in spec), `${fn} spec missing all of: ${keys.join(', ')}`);
}

// 2b. The compiler bundle must stay lean — a lost `external` entry would inline
// a renderer runtime and blow well past this ceiling (currently ~380 KB).
{
  const s = await stat(resolve(js, 'flint-chart.min.js'));
  assert.ok(s.size < 1_500_000, `flint-chart.min.js too large (${s.size} bytes) — renderer runtime inlined?`);
}

// 3. Vendored runtimes are present and non-trivial (> 50 KB each).
for (const f of ['vega.min.js', 'vega-lite.min.js', 'vega-embed.min.js', 'echarts.min.js', 'chart.umd.min.js']) {
  const s = await stat(resolve(js, f));
  assert.ok(s.size > 50_000, `${f} too small (${s.size} bytes)`);
}

console.log('bundle.test.mjs: all assertions passed');
