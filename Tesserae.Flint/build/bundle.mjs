/**
 * Builds the JS assets embedded by Tesserae.Flint:
 *   - flint-chart(.min).js  — packages/flint-js bundled as an IIFE exposing window.flint
 *   - vega/vega-lite/vega-embed/echarts/chart.js minified UMD builds, copied from node_modules
 *
 * All files land in Tesserae.Flint/assets/js and are embedded via h5.json with a
 * ".dontload" resource-name suffix so H5 does not inject them into index.html.
 *
 * Run with:  npm run bundle   (from the Tesserae.Flint/ folder)
 */
import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '../../packages/flint-js/src/index.ts');
const outDir = resolve(here, '../assets/js');
const nm = resolve(here, '../node_modules');

await mkdir(outDir, { recursive: true });

const common = {
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  globalName: 'window.flint',
  target: 'es2020',
  banner: { js: '/* flint-chart — bundled for Tesserae.Flint. Exposed as window.flint. */' },
  legalComments: 'none',
  // The renderer runtimes are peer deps of flint-chart and are loaded separately.
  external: ['vega', 'vega-lite', 'vega-embed', 'echarts', 'chart.js'],
};

await build({ ...common, outfile: resolve(outDir, 'flint-chart.js'), minify: false });
await build({ ...common, outfile: resolve(outDir, 'flint-chart.min.js'), minify: true });

const vendors = [
  ['vega/build/vega.min.js',             'vega.min.js'],
  ['vega-lite/build/vega-lite.min.js',   'vega-lite.min.js'],
  ['vega-embed/build/vega-embed.min.js', 'vega-embed.min.js'],
  ['echarts/dist/echarts.min.js',        'echarts.min.js'],
  ['chart.js/dist/chart.umd.min.js',     'chart.umd.min.js'],
];
for (const [from, to] of vendors) {
  await copyFile(resolve(nm, from), resolve(outDir, to));
}

console.log('flint bundled + renderers vendored -> Tesserae.Flint/assets/js/');
