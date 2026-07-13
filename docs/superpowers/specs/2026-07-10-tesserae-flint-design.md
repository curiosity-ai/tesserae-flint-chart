# Tesserae.Flint — Design

Linear: DEV-1714. Requested by Rafael (Slack, 2026-07-10).

## Goal

A Tesserae (C#/H5) component that takes a flint-json chart spec as input and
renders it, shipped as a `Tesserae.Flint` NuGet package. No Mosaik/assistant
integration yet — package first, integration later.

## Architecture

New project `Tesserae.Flint/` at the repo root of
`curiosity-ai/tesserae-flint-chart`, alongside the upstream `packages/`.
Structure mirrors `curiosity-ai/graph-kit`'s `Tesserae.GraphKit`:

- `Tesserae.Flint.csproj` — H5 SDK project (`h5.target` SDK, netstandard2.0,
  `GeneratePackageOnBuild`, NuGet metadata), references `h5`, `h5.core`,
  `Tesserae`. An MSBuild `BeforeBuild` target runs the npm bundle step
  (no-op-safe: committed bundles are used if node is unavailable).
- `build/bundle.mjs` — bundles `packages/flint-js` into a browser-global
  `flint-chart.js` (exposing `window.flint` with `assembleVegaLite`,
  `assembleECharts`, `assembleChartJs`), and vendors the renderer runtimes:
  vega + vega-lite + vega-embed, echarts, chart.js. Readable and `.min`
  variants of each, output under `assets/js/`.
- `h5.json` — embeds the compiled C# JS normally (with `.min` Release
  variants, per the graph-kit comments), and embeds every chart JS bundle as a
  resource named `<file>.js.dontload` with an `output` path so H5 never
  injects it into `index.html`. (Note: extension is `.dontload`, not
  `.donotload`.) Mosaik's `FrontEndWatcher` strips the suffix at deploy time;
  the sample app gets its own small strip step.

## Components

- `FlintChart` — Tesserae component. Input: flint-json as `string` or typed
  `ChartAssemblyInput` DTO (`[ObjectLiteral]` bindings for chart_spec,
  encodings, semantic_types, data). Backend via
  `enum FlintBackend { VegaLite, ECharts, ChartJs }`. Fluent API in Tesserae
  style (`.Width(...)`, `.Height(...)`, `.Backend(...)`, `.OnRendered(...)`).
  Renders an error state (message + spec excerpt) when compilation or
  rendering throws.
- `FlintLibraries` (internal) — per-backend lazy loaders using Tesserae's
  `Require.LoadScriptAsync`, one static method per bundle, memoized, modeled
  on Mosaik `ExternalLibraries.cs`. Only the flint compiler bundle plus the
  selected backend's runtime are ever fetched.
- `GoogleFontLoader` — small helper that injects a Google Fonts stylesheet
  link for requested font families and awaits `document.fonts.ready` before
  rendering, so text measurement in the renderers is correct.

## Data flow

flint-json → (lazy-load flint bundle) → `window.flint.assemble<Backend>(input)`
→ native spec object → (lazy-load backend runtime) → render into the
component's `div` (vega-embed / `echarts.init` + `setOption` /
`new Chart(canvas, spec)`). Re-render on input/backend change; dispose backend
instances on unmount.

## Error handling

- Invalid flint-json / compile errors: caught, shown as an inline error card,
  surfaced via an `OnError` callback.
- Script load failures: retried once, then error state.

## Testing

- `Tesserae.Flint.Sample` H5 app: gallery of test specs of growing complexity
  (bar → line → scatter → heatmap → donut → sankey…), each rendered across
  all three backends side by side. This is the visual iteration harness.
- Test spec files live under `Tesserae.Flint.Sample/specs/` as JSON and grow
  over time; basic charts must render correctly before exotic ones.
- JS-side: reuse upstream `packages/flint-js` tests; the bundle step gets a
  smoke test that the global exposes the three assemble functions.

## Out of scope

- Assistant/Mosaik integration (follow-up task).
- Publishing pipeline: copy graph-kit's `.azure-devops/build-nuget-h5.yml`;
  Rafael wires up Azure DevOps.

## Assumptions

- Third backend is Chart.js (Rafael's message trails off after two; flint
  supports exactly these three). To confirm with Rafael.
