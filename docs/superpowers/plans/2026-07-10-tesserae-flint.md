# Tesserae.Flint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `Tesserae.Flint` NuGet package (C#/H5) with a `FlintChart` component that compiles flint-json via the flint-chart JS library and renders it with Vega-Lite, ECharts, or Chart.js — all JS lazy-loaded via the `.dontload` pattern.

**Architecture:** New `Tesserae.Flint/` H5 project at repo root (mirrors `curiosity-ai/graph-kit`'s `Tesserae.GraphKit`). An esbuild step bundles `packages/flint-js` into a browser-global `window.flint` and vendors the three renderer runtimes; `h5.json` embeds all chart JS as `*.js.dontload` resources so H5 never injects them; a C# `FlintLibraries` helper lazy-loads them with `Require.LoadScriptAsync`. A `Tesserae.Flint.Sample` app renders growing-complexity spec files across all backends. Spec: `docs/superpowers/specs/2026-07-10-tesserae-flint-design.md`. Linear: DEV-1714.

**Tech Stack:** C# / H5 (netstandard2.0, `h5.target` SDK 26.3.64912), Tesserae 2026.6.67480, esbuild, flint-chart (local `packages/flint-js`), vega 6 + vega-lite 6 + vega-embed 7, echarts 6, chart.js 4, vitest (spec compile tests).

**Key facts for someone with zero context:**
- H5 compiles C# to JS. `h5.json` `resources` entries are embedded into the NuGet and extracted into consuming apps at their `output` path. H5 auto-injects every emitted `.js` resource into the generated `index.html` — UNLESS the resource *name* doesn't end in `.js`. That's the trick: name resources `foo.min.js.dontload` and they're extracted but not injected. Mosaik's server strips the `.dontload` suffix at deploy time (`mosaik/Library/Curiosity.Shared.Library/FrontEndWatcher.cs:475-516`); the sample app uses a small node script to do the same after build.
- Tesserae provides `Require.LoadScriptAsync(string url)` (awaitable, dedupes repeat loads) — the runtime lazy loader.
- flint-chart exposes `assembleVegaLite(input)`, `assembleECharts(input)`, `assembleChartjs(input)` (note lowercase `js` in `Chartjs`), each returning the backend-native spec object from the same `ChartAssemblyInput`.
- Renderer browser globals after loading their UMD builds: `vega`, `vegaLite`, `vegaEmbed`, `echarts`, `Chart`.

---

### Task 1: Scaffold the Tesserae.Flint project

**Files:**
- Create: `Tesserae.Flint/Tesserae.Flint.csproj`
- Create: `Tesserae.Flint/h5.json`
- Create: `Tesserae.Flint/h5.Debug.json`
- Create: `Tesserae.Flint/h5.Release.json`
- Create: `Tesserae.Flint/package.json`
- Create: `Tesserae.Flint/src/Flint.cs`
- Create: `Tesserae.Flint/README.md`
- Create: `Tesserae.Flint/.gitignore`

- [ ] **Step 1: Create the csproj**

`Tesserae.Flint/Tesserae.Flint.csproj`:

```xml
<Project Sdk="h5.target/26.3.64912">
  <PropertyGroup>
    <TargetFramework>netstandard2.0</TargetFramework>
    <DefineConstants>H5</DefineConstants>
    <AssemblyName>Tesserae.Flint</AssemblyName>
    <RootNamespace>Tesserae.Flint</RootNamespace>
    <LangVersion>7.2</LangVersion>
    <GeneratePackageOnBuild>true</GeneratePackageOnBuild>
    <DebugType>None</DebugType>
    <DebugSymbols>false</DebugSymbols>
    <SkipResourcesExtraction>true</SkipResourcesExtraction>
    <MinifyLocalVariables>true</MinifyLocalVariables>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="h5" Version="26.2.64514" />
    <PackageReference Include="h5.core" Version="26.4.580" />
    <PackageReference Include="Tesserae" Version="2026.6.67480" />
  </ItemGroup>

  <PropertyGroup>
    <PackageRequireLicenseAcceptance>false</PackageRequireLicenseAcceptance>
    <Copyright>(c) Copyright 2026 Curiosity GmbH - all right reserved</Copyright>
    <Company>Curiosity GmbH</Company>
    <Authors>Curiosity GmbH</Authors>
    <PackageProjectUrl>https://github.com/curiosity-ai/tesserae-flint-chart</PackageProjectUrl>
    <PackageId>Tesserae.Flint</PackageId>
    <Description>Tesserae (H5 C# to JavaScript) component that renders Flint chart specs via Vega-Lite, ECharts or Chart.js, with lazy-loaded renderer runtimes.</Description>
    <PackageTags>h5, HTML, UI, components, charts, visualization, flint, vega-lite, echarts, chartjs, tesserae</PackageTags>
    <NoWarn>1701;1702;1591</NoWarn>
    <PackageLicenseExpression>MIT</PackageLicenseExpression>
    <PackageReadmeFile>README.md</PackageReadmeFile>
  </PropertyGroup>

  <ItemGroup>
    <None Include="README.md" Pack="true" PackagePath="\" />
  </ItemGroup>

  <!-- Bundle flint-chart (../packages/flint-js) and vendor the renderer runtimes
       into assets/js before the H5 build embeds them. No-op-safe: if node/npm are
       unavailable, the previously generated committed bundles are used. -->
  <Target Name="BundleFlintJs" BeforeTargets="BeforeBuild">
    <Exec Command="npm install --no-audit --no-fund" WorkingDirectory="$(MSBuildProjectDirectory)" ContinueOnError="true" />
    <Exec Command="npm run bundle" WorkingDirectory="$(MSBuildProjectDirectory)" ContinueOnError="true" />
  </Target>
</Project>
```

- [ ] **Step 2: Create h5.json**

`Tesserae.Flint/h5.json` — note the compiled-C# resources are plain (auto-injected), the chart bundles all carry `.dontload`:

```json
{
    "outputFormatting": "Both",
    "resources": [
        {
            "name": "Tesserae.Flint.js",
            "files": [ "$(OutDir)h5/Tesserae.Flint.js" ]
        },
        {
            "name": "Tesserae.Flint.meta.js",
            "files": [ "$(OutDir)h5/Tesserae.Flint.meta.js" ]
        },
        {
            "name": "Tesserae.Flint.min.js",
            "files": [ "$(OutDir)h5/Tesserae.Flint.min.js" ]
        },
        {
            "name": "Tesserae.Flint.meta.min.js",
            "files": [ "$(OutDir)h5/Tesserae.Flint.meta.min.js" ]
        },
        // The flint-chart compiler, bundled by build/bundle.mjs into a browser global
        // (window.flint). The ".dontload" suffix keeps H5 from injecting these into
        // index.html; they're extracted to assets/js/flint and loaded on demand via
        // Require.LoadScriptAsync after the suffix is stripped (Mosaik FrontEndWatcher
        // in production, scripts/strip-dontload.mjs for the sample app).
        {
            "name": "flint-chart.min.js.dontload",
            "files": [ "assets/js/flint-chart.min.js" ],
            "output": "assets/js/flint"
        },
        // Renderer runtimes (vendored UMD builds, minified only — see build/bundle.mjs).
        {
            "name": "vega.min.js.dontload",
            "files": [ "assets/js/vega.min.js" ],
            "output": "assets/js/flint"
        },
        {
            "name": "vega-lite.min.js.dontload",
            "files": [ "assets/js/vega-lite.min.js" ],
            "output": "assets/js/flint"
        },
        {
            "name": "vega-embed.min.js.dontload",
            "files": [ "assets/js/vega-embed.min.js" ],
            "output": "assets/js/flint"
        },
        {
            "name": "echarts.min.js.dontload",
            "files": [ "assets/js/echarts.min.js" ],
            "output": "assets/js/flint"
        },
        {
            "name": "chart.umd.min.js.dontload",
            "files": [ "assets/js/chart.umd.min.js" ],
            "output": "assets/js/flint"
        }
    ],
    "cleanOutputFolderBeforeBuildPattern": "*.*",
    "loader": { "type": "Global" },
    "generateTypeScript": false,
    "generateDocumentation": "None",
    "rules": {
        "anonymousType": "Plain",
        "arrayIndex": "Managed",
        "autoProperty": "Plain",
        "boxing": "Managed",
        "externalCast": "Plain",
        "inlineComment": "Plain",
        "integer": "Managed",
        "lambda": "Plain",
        "useShortForms": true
    },
    "sourceMap": { "enabled": false }
}
```

`h5.Debug.json` and `h5.Release.json`: copy them verbatim from graph-kit's `Tesserae.GraphKit/h5.Debug.json` / `h5.Release.json` (clone at `curiosity-ai/graph-kit`), replacing every `Tesserae.GraphKit` string with `Tesserae.Flint`.

- [ ] **Step 3: Create package.json**

`Tesserae.Flint/package.json`:

```json
{
  "name": "tesserae-flint-bundle",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "description": "Build tooling that bundles flint-chart and vendors the renderer runtimes for the Tesserae.Flint wrapper.",
  "scripts": {
    "bundle": "node build/bundle.mjs",
    "test": "node build/bundle.test.mjs"
  },
  "devDependencies": {
    "esbuild": "^0.25.0",
    "vega": "^6.1.2",
    "vega-lite": "^6.1.0",
    "vega-embed": "^7.0.2",
    "echarts": "^6.0.0",
    "chart.js": "^4.4.9"
  }
}
```

(If an exact version is unavailable at install time, use the latest patch of the same major.)

- [ ] **Step 4: Create the static entry point and README**

`Tesserae.Flint/src/Flint.cs`:

```csharp
namespace Tesserae.Flint
{
    /// <summary>
    /// Static entry point / factory for Flint components, mirroring Tesserae's <c>UI</c> class.
    /// </summary>
    public static class Flint
    {
        /// <summary>Creates a chart component from a flint-json spec string.</summary>
        public static FlintChart Chart(string flintJson) => new FlintChart(flintJson);
    }
}
```

(`FlintChart` comes in Task 4 — the project won't compile until then; that's fine, we don't build in this task.)

`Tesserae.Flint/README.md`: short usage README:

```markdown
# Tesserae.Flint

Tesserae (H5 C# → JavaScript) component that renders
[Flint](https://github.com/curiosity-ai/tesserae-flint-chart) chart specs
using Vega-Lite, ECharts, or Chart.js.

All chart JavaScript (the flint compiler and the renderer runtimes) is
embedded in this package with a `.dontload` suffix and lazy-loaded on demand
with `Require.LoadScriptAsync` — nothing is added to your page until a chart
is actually rendered. The host must strip the `.dontload` suffix from the
extracted `assets/js/flint/*` files at deploy time (Mosaik's FrontEndWatcher
already does this).

```csharp
var chart = Flint.Chart(flintJson)
                 .Backend(FlintBackend.ECharts)
                 .OnError((c, e) => console.error(e));
```
```

`Tesserae.Flint/.gitignore`:

```
node_modules/
bin/
obj/
```

- [ ] **Step 5: Commit**

```bash
git add Tesserae.Flint
git commit -m "feat(tesserae-flint): scaffold Tesserae.Flint H5 project (DEV-1714)"
```

---

### Task 2: JS bundling — flint compiler bundle + vendored renderers

**Files:**
- Create: `Tesserae.Flint/build/bundle.mjs`
- Create: `Tesserae.Flint/build/bundle.test.mjs`
- Create (generated, committed): `Tesserae.Flint/assets/js/*.js`

- [ ] **Step 1: Write the failing test**

`Tesserae.Flint/build/bundle.test.mjs` — asserts the bundle exposes the three assemble functions and every vendored runtime file exists and is non-trivial:

```js
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
for (const fn of ['assembleVegaLite', 'assembleECharts', 'assembleChartjs']) {
  const spec = window.flint[fn](structuredClone(input));
  assert.equal(typeof spec, 'object', `${fn} returned no spec`);
}

// 3. Vendored runtimes are present and non-trivial (> 50 KB each).
for (const f of ['vega.min.js', 'vega-lite.min.js', 'vega-embed.min.js', 'echarts.min.js', 'chart.umd.min.js']) {
  const s = await stat(resolve(js, f));
  assert.ok(s.size > 50_000, `${f} too small (${s.size} bytes)`);
}

console.log('bundle.test.mjs: all assertions passed');
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd Tesserae.Flint && npm install && npm test
```

Expected: FAIL with ENOENT for `assets/js/flint-chart.min.js`.

- [ ] **Step 3: Write bundle.mjs**

`Tesserae.Flint/build/bundle.mjs`:

```js
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
  globalName: 'flint',
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
```

Caveats to resolve while implementing (check `node_modules` after install and adjust the vendor paths — these vary by version): chart.js may ship `chart.umd.js` without a pre-minified variant (if so, minify it with esbuild `transform` instead of copying); vega-embed's minified build may be named `vega-embed.min.js` or only `vega-embed.js`. The test only cares that the output files exist and load.

- [ ] **Step 4: Run bundle + test to verify pass**

```bash
cd Tesserae.Flint && npm run bundle && npm test
```

Expected: `bundle.test.mjs: all assertions passed`. If `assembleECharts`/`assembleChartjs` fail because the flint backends `import` their peer libraries at module top level, remove those libs from `external` for the compile-only bundle OR stub them — inspect the actual error; flint's assemble functions produce plain spec objects and should not require the runtimes.

- [ ] **Step 5: Commit (including generated assets)**

```bash
git add Tesserae.Flint/build Tesserae.Flint/assets Tesserae.Flint/package.json Tesserae.Flint/package-lock.json
git commit -m "feat(tesserae-flint): bundle flint-chart + vendor renderer runtimes"
```

---

### Task 3: FlintLibraries lazy loader + GoogleFontLoader (C#)

**Files:**
- Create: `Tesserae.Flint/src/FlintBackend.cs`
- Create: `Tesserae.Flint/src/FlintLibraries.cs`
- Create: `Tesserae.Flint/src/GoogleFontLoader.cs`

- [ ] **Step 1: Create FlintBackend enum**

`Tesserae.Flint/src/FlintBackend.cs`:

```csharp
namespace Tesserae.Flint
{
    /// <summary>Rendering backend used by <see cref="FlintChart"/>.</summary>
    public enum FlintBackend
    {
        VegaLite,
        ECharts,
        ChartJs
    }
}
```

- [ ] **Step 2: Create FlintLibraries**

`Tesserae.Flint/src/FlintLibraries.cs` — mirrors Mosaik's `ExternalLibraries.cs`; `Require.LoadScriptAsync` dedupes, so no extra memoization needed:

```csharp
using System.Threading.Tasks;
using Tesserae;

namespace Tesserae.Flint
{
    /// <summary>
    /// Lazy loaders for the JS embedded by this package under assets/js/flint.
    /// The files are packaged with a ".dontload" suffix (see h5.json) so H5 does not
    /// inject them into index.html; the host strips the suffix at deploy time and the
    /// methods below fetch them on first use.
    /// </summary>
    internal static class FlintLibraries
    {
        private const string BasePath = "./assets/js/flint/";

        internal static Task LoadFlintAsync()    => Require.LoadScriptAsync(BasePath + "flint-chart.min.js");

        internal static async Task LoadVegaLiteAsync()
        {
            await Require.LoadScriptAsync(BasePath + "vega.min.js");
            await Require.LoadScriptAsync(BasePath + "vega-lite.min.js");
            await Require.LoadScriptAsync(BasePath + "vega-embed.min.js");
        }

        internal static Task LoadEChartsAsync()  => Require.LoadScriptAsync(BasePath + "echarts.min.js");

        internal static Task LoadChartJsAsync()  => Require.LoadScriptAsync(BasePath + "chart.umd.min.js");

        internal static Task LoadBackendAsync(FlintBackend backend)
        {
            switch (backend)
            {
                case FlintBackend.ECharts: return LoadEChartsAsync();
                case FlintBackend.ChartJs: return LoadChartJsAsync();
                default:                   return LoadVegaLiteAsync();
            }
        }
    }
}
```

(While implementing, check the exact `Require.LoadScriptAsync` signature in the referenced Tesserae package — Mosaik calls it with a single relative URL exactly like this. If it takes `params string[]`, the sequential awaits above still work.)

- [ ] **Step 3: Create GoogleFontLoader**

`Tesserae.Flint/src/GoogleFontLoader.cs`:

```csharp
using System.Collections.Generic;
using System.Threading.Tasks;
using H5;
using static H5.Core.dom;

namespace Tesserae.Flint
{
    /// <summary>
    /// Loads Google Fonts on demand and waits until they are usable, so chart
    /// renderers measure text with the correct font instead of a fallback.
    /// </summary>
    public static class GoogleFontLoader
    {
        private static readonly HashSet<string> _requested = new HashSet<string>();

        /// <summary>
        /// Injects a Google Fonts stylesheet for <paramref name="family"/> (e.g. "Inter",
        /// "Roboto Condensed") and resolves when the document's fonts are ready.
        /// </summary>
        public static async Task LoadAsync(string family, string weights = "400;700")
        {
            if (_requested.Add(family))
            {
                var link = (HTMLLinkElement)document.createElement("link");
                link.rel  = "stylesheet";
                link.href = "https://fonts.googleapis.com/css2?family="
                          + family.Replace(" ", "+") + ":wght@" + weights
                          + "&display=swap";
                document.head.appendChild(link);
            }

            await WaitFontsReadyAsync();
        }

        private static Task WaitFontsReadyAsync()
        {
            var tcs = new TaskCompletionSource<bool>();
            Script.Write("document.fonts.ready.then(function() {{ {0}.setResult(true); }});", tcs);
            return tcs.Task;
        }
    }
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd Tesserae.Flint && dotnet build -c Debug
```

Expected: build fails ONLY on the missing `FlintChart` type referenced by `Flint.cs` (comes next task). If other errors appear (H5 API names, `HTMLLinkElement` casing, `TaskCompletionSource` availability in H5), fix them now — compare against Mosaik/Tesserae sources for the correct H5 idioms. Alternatively comment out `Flint.cs`'s body temporarily to get a clean build, then restore it in Task 4.

- [ ] **Step 5: Commit**

```bash
git add Tesserae.Flint/src
git commit -m "feat(tesserae-flint): lazy library loaders and Google Fonts loader"
```

---

### Task 4: FlintChart component

**Files:**
- Create: `Tesserae.Flint/src/Components/FlintChart.cs`

- [ ] **Step 1: Create the component**

`Tesserae.Flint/src/Components/FlintChart.cs`:

```csharp
using System;
using System.Threading.Tasks;
using H5;
using Tesserae;
using static H5.Core.dom;
using static Tesserae.UI;

namespace Tesserae.Flint
{
    /// <summary>
    /// Renders a Flint chart spec (flint-json) using one of the three supported
    /// backends. The flint compiler and the selected backend runtime are
    /// lazy-loaded on first render via <see cref="FlintLibraries"/>.
    /// </summary>
    [H5.Name("tss.FlintChart")]
    public class FlintChart : IComponent, ISpecialCaseStyling
    {
        private readonly HTMLElement _container;
        private string       _flintJson;
        private FlintBackend _backend = FlintBackend.VegaLite;
        private string       _fontFamily;   // optional Google Font to load before rendering
        private object       _instance;     // echarts instance / Chart instance / vega-embed result
        private Action<FlintChart, object> _onRendered;
        private Action<FlintChart, string> _onError;
        private int _renderVersion;         // guards against out-of-order async renders

        public HTMLElement StylingContainer => _container;
        public bool PropagateToStackItemParent => false;

        public FlintChart(string flintJson)
        {
            _flintJson = flintJson;
            _container = Div(_("tss-flintchart"));
            _container.style.position = "relative";
            _container.style.width  = "100%";
            _container.style.height = "100%";
            _container.style.minHeight = "240px";

            DomObserver.WhenMounted(_container, () => { var _ = RenderChartAsync(); });
        }

        // ── Fluent configuration ────────────────────────────────────────────

        public FlintChart Backend(FlintBackend backend)          { _backend = backend; Refresh(); return this; }
        public FlintChart Spec(string flintJson)                 { _flintJson = flintJson; Refresh(); return this; }
        public FlintChart Font(string googleFontFamily)          { _fontFamily = googleFontFamily; return this; }
        public FlintChart OnRendered(Action<FlintChart, object> handler) { _onRendered = handler; return this; }
        public FlintChart OnError(Action<FlintChart, string> handler)    { _onError = handler; return this; }

        /// <summary>Re-compiles and re-renders (no-op until the component is mounted).</summary>
        public void Refresh()
        {
            if (_container.isConnected) { var _ = RenderChartAsync(); }
        }

        // ── Rendering ───────────────────────────────────────────────────────

        private async Task RenderChartAsync()
        {
            var version = ++_renderVersion;
            try
            {
                if (_fontFamily != null) await GoogleFontLoader.LoadAsync(_fontFamily);

                await FlintLibraries.LoadFlintAsync();
                await FlintLibraries.LoadBackendAsync(_backend);
                if (version != _renderVersion) return; // superseded by a newer render

                var input = Script.Write<object>("JSON.parse({0})", _flintJson);
                DisposeInstance();
                ClearChildren(_container);

                switch (_backend)
                {
                    case FlintBackend.ECharts:
                    {
                        var option = Script.Write<object>("window.flint.assembleECharts({0})", input);
                        var chart  = Script.Write<object>("window.echarts.init({0})", _container);
                        Script.Write("{0}.setOption({1})", chart, option);
                        _instance = chart;
                        break;
                    }
                    case FlintBackend.ChartJs:
                    {
                        var config = Script.Write<object>("window.flint.assembleChartjs({0})", input);
                        var canvas = (HTMLCanvasElement)document.createElement("canvas");
                        _container.appendChild(canvas);
                        _instance = Script.Write<object>("new window.Chart({0}, {1})", canvas, config);
                        break;
                    }
                    default: // VegaLite
                    {
                        var spec   = Script.Write<object>("window.flint.assembleVegaLite({0})", input);
                        var result = await Script.Write<Task<object>>(
                            "window.vegaEmbed({0}, {1}, {{ actions: false }})", _container, spec);
                        _instance = result;
                        break;
                    }
                }

                _onRendered?.Invoke(this, _instance);
            }
            catch (Exception ex)
            {
                if (version != _renderVersion) return;
                ShowError(ex.Message);
                _onError?.Invoke(this, ex.Message);
            }
        }

        private void ShowError(string message)
        {
            DisposeInstance();
            ClearChildren(_container);
            var card = Div(_("tss-flintchart-error"));
            card.style.padding = "12px";
            card.style.color = "var(--tss-danger-color, #a4262c)";
            card.style.fontFamily = "monospace";
            card.style.whiteSpace = "pre-wrap";
            card.textContent = "Flint chart error: " + message;
            _container.appendChild(card);
        }

        private void DisposeInstance()
        {
            if (_instance == null) return;
            switch (_backend)
            {
                case FlintBackend.ECharts: Script.Write("try {{ {0}.dispose(); }} catch(e) {{}}", _instance); break;
                case FlintBackend.ChartJs: Script.Write("try {{ {0}.destroy(); }} catch(e) {{}}", _instance); break;
                default:                   Script.Write("try {{ {0}.finalize && {0}.finalize(); }} catch(e) {{}}", _instance); break;
            }
            _instance = null;
        }

        private static void ClearChildren(HTMLElement el)
        {
            while (el.firstChild != null) el.removeChild(el.firstChild);
        }

        public HTMLElement Render() => _container;
    }
}
```

Implementation caveats: check Tesserae for the exact `DomObserver.WhenMounted` signature (Mosaik/graph-kit use it — graph-kit's `GraphView.cs` is the template); check whether `ISpecialCaseStyling` members match the referenced Tesserae version; `element.isConnected` may need `Script.Write<bool>("{0}.isConnected", _container)` if not on the H5 DOM binding. The dispose-switch uses the current `_backend`, which may have changed since the instance was created — if you keep backend switching, store the backend alongside `_instance`.

- [ ] **Step 2: Build and fix until clean**

```bash
cd Tesserae.Flint && dotnet build -c Debug && dotnet build -c Release
```

Expected: both succeed; `bin/Release/Tesserae.Flint.*.nupkg` produced. Unzip the nupkg (`unzip -l bin/Release/*.nupkg`) and verify the `.dontload` resources are embedded in the DLL-carrying package (H5 embeds resources into the assembly — verify by building the sample in Task 5 and seeing the files extracted).

- [ ] **Step 3: Commit**

```bash
git add Tesserae.Flint/src
git commit -m "feat(tesserae-flint): FlintChart component with three lazy-loaded backends"
```

---

### Task 5: Sample app + growing-complexity spec files

**Files:**
- Create: `Tesserae.Flint.Sample/Tesserae.Flint.Sample.csproj`
- Create: `Tesserae.Flint.Sample/h5.json`
- Create: `Tesserae.Flint.Sample/src/App.cs`
- Create: `Tesserae.Flint.Sample/src/SampleSpecs.cs`
- Create: `scripts/strip-dontload.mjs`
- Create: `TesseraeFlint.sln` (repo root; includes both projects)

- [ ] **Step 1: Create the sample project**

`Tesserae.Flint.Sample/Tesserae.Flint.Sample.csproj`:

```xml
<Project Sdk="h5.target/26.3.64912">
  <PropertyGroup>
    <TargetFramework>netstandard2.0</TargetFramework>
    <DefineConstants>H5</DefineConstants>
    <AssemblyName>app</AssemblyName>
    <RootNamespace>Tesserae.Flint.Sample</RootNamespace>
    <LangVersion>7.2</LangVersion>
    <MinifyLocalVariables>true</MinifyLocalVariables>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="h5" Version="26.2.64514" />
    <PackageReference Include="h5.core" Version="26.4.580" />
    <PackageReference Include="Tesserae" Version="2026.6.67480" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\Tesserae.Flint\Tesserae.Flint.csproj" />
  </ItemGroup>

  <!-- The .dontload resources are extracted verbatim; rename them so the dev
       server can serve the real .js files (Mosaik does this server-side). -->
  <Target Name="StripDontload" AfterTargets="Build">
    <Exec Command="node ../scripts/strip-dontload.mjs $(OutDir)h5" ContinueOnError="true" />
  </Target>
</Project>
```

`Tesserae.Flint.Sample/h5.json` (same as graph-kit's sample):

```json
{
  "output": "$(OutDir)/h5/",
  "fileName": "app.js",
  "html": { "disabled": false, "title": "Tesserae.Flint Sample" },
  "cleanOutputFolderBeforeBuildPattern": "*.js|*.css",
  "console": { "enabled": false },
  "loader": { "type": "Global" },
  "sourceMap": { "enabled": true },
  "reflection": { "disabled": false, "target": "inline" }
}
```

- [ ] **Step 2: Create strip-dontload.mjs**

`scripts/strip-dontload.mjs`:

```js
/**
 * Recursively renames *.dontload files to their real names (drops the suffix),
 * mirroring what Mosaik's FrontEndWatcher does at deploy time.
 * Usage: node scripts/strip-dontload.mjs <dir>
 */
import { readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) { console.error('usage: strip-dontload.mjs <dir>'); process.exit(1); }

async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.name.endsWith('.dontload')) {
      const target = p.slice(0, -'.dontload'.length);
      await rm(target, { force: true });
      await rename(p, target);
      console.log(`stripped: ${target}`);
    }
  }
}
await walk(root);
```

- [ ] **Step 3: Create the sample specs (growing complexity)**

`Tesserae.Flint.Sample/src/SampleSpecs.cs` — flint-json strings, ordered simple → complex. Chart types and encodings must match flint's template registry (check `packages/flint-js/src/*/templates` for exact `chartType` names before finalizing):

```csharp
namespace Tesserae.Flint.Sample
{
    public static class SampleSpecs
    {
        public class Sample { public string Name; public string Json; }

        public static readonly Sample[] All = new[]
        {
            new Sample { Name = "01 Bar", Json = @"{
              ""data"": { ""values"": [ {""cat"":""A"",""val"":30}, {""cat"":""B"",""val"":55}, {""cat"":""C"",""val"":43} ] },
              ""semantic_types"": { ""cat"": ""Category"", ""val"": ""Quantity"" },
              ""chart_spec"": {
                ""chartType"": ""Bar Chart"",
                ""encodings"": { ""x"": { ""field"": ""cat"" }, ""y"": { ""field"": ""val"" } },
                ""baseSize"": { ""width"": 400, ""height"": 300 }
              }
            }" },
            new Sample { Name = "02 Line", Json = @"{
              ""data"": { ""values"": [ {""month"":""2025-01"",""rev"":12}, {""month"":""2025-02"",""rev"":18}, {""month"":""2025-03"",""rev"":15}, {""month"":""2025-04"",""rev"":24} ] },
              ""semantic_types"": { ""month"": ""Month"", ""rev"": ""Price"" },
              ""chart_spec"": {
                ""chartType"": ""Line Chart"",
                ""encodings"": { ""x"": { ""field"": ""month"" }, ""y"": { ""field"": ""rev"" } },
                ""baseSize"": { ""width"": 400, ""height"": 300 }
              }
            }" },
            new Sample { Name = "03 Scatter + color", Json = @"{
              ""data"": { ""values"": [ {""weight"":2100,""mpg"":31,""origin"":""Japan""}, {""weight"":3400,""mpg"":19,""origin"":""USA""}, {""weight"":2600,""mpg"":26,""origin"":""Germany""}, {""weight"":3900,""mpg"":15,""origin"":""USA""} ] },
              ""semantic_types"": { ""weight"": ""Quantity"", ""mpg"": ""Quantity"", ""origin"": ""Country"" },
              ""chart_spec"": {
                ""chartType"": ""Scatter Plot"",
                ""encodings"": { ""x"": { ""field"": ""weight"" }, ""y"": { ""field"": ""mpg"" }, ""color"": { ""field"": ""origin"" } },
                ""baseSize"": { ""width"": 400, ""height"": 300 }
              }
            }" },
            // Extend over time: grouped bar, heatmap, donut, boxplot, sankey, treemap…
            // Reuse inputs from packages/flint-js/src/test-data and the gallery module.
        };
    }
}
```

- [ ] **Step 4: Create the sample app**

`Tesserae.Flint.Sample/src/App.cs` — every sample rendered across all three backends side by side (the visual iteration harness):

```csharp
using Tesserae;
using Tesserae.Flint;
using static Tesserae.UI;
using static H5.Core.dom;

namespace Tesserae.Flint.Sample
{
    internal static class App
    {
        private static void Main()
        {
            var page = VStack().S().Padding(16.px()).ScrollY();

            foreach (var sample in SampleSpecs.All)
            {
                page.Add(TextBlock(sample.Name).SemiBold().MediumPlus());
                var row = HStack().WS().H(340.px());
                row.Add(Cell("Vega-Lite", sample.Json, FlintBackend.VegaLite));
                row.Add(Cell("ECharts",   sample.Json, FlintBackend.ECharts));
                row.Add(Cell("Chart.js",  sample.Json, FlintBackend.ChartJs));
                page.Add(row);
            }

            document.body.appendChild(page.Render());
        }

        private static IComponent Cell(string label, string json, FlintBackend backend)
            => VStack().W(33.percent()).H(100.percent()).Children(
                   TextBlock(label).Tiny(),
                   Flint.Chart(json)
                        .Backend(backend)
                        .OnError((c, e) => console.error(label + ": " + e)));
    }
}
```

(Adjust Tesserae fluent API calls — `.S()`, `.WS()`, `.W(...)`, `.Children(...)` — to the ones that exist in the referenced Tesserae version; graph-kit's sample is the reference.)

- [ ] **Step 5: Create the solution, build, run**

```bash
dotnet new sln -n TesseraeFlint
dotnet sln TesseraeFlint.sln add Tesserae.Flint/Tesserae.Flint.csproj Tesserae.Flint.Sample/Tesserae.Flint.Sample.csproj
dotnet build TesseraeFlint.sln -c Debug
```

Expected: build succeeds; `Tesserae.Flint.Sample/bin/Debug/.../h5/` contains `index.html`, `app.js`, and `assets/js/flint/*.js` (post-strip, no `.dontload` remaining). Then serve and eyeball:

```bash
npx serve Tesserae.Flint.Sample/bin/Debug/netstandard2.0/h5
```

Verify in the browser: all three columns render each sample; the network tab shows the renderer JS loading lazily (echarts.min.js only fetched when an ECharts chart renders); an intentionally broken spec shows the inline error card.

- [ ] **Step 6: Commit**

```bash
git add Tesserae.Flint.Sample scripts TesseraeFlint.sln
git commit -m "feat(tesserae-flint): sample gallery app with dontload strip step"
```

---

### Task 6: Spec compile tests (vitest, growing-complexity harness)

**Files:**
- Create: `Tesserae.Flint/test/specs/*.json` (one file per sample, same JSON as `SampleSpecs.cs`)
- Create: `Tesserae.Flint/test/specs.test.mjs`
- Modify: `Tesserae.Flint/package.json` (test script)

- [ ] **Step 1: Extract the sample specs as JSON files**

Create `Tesserae.Flint/test/specs/01-bar.json`, `02-line.json`, `03-scatter-color.json` containing exactly the JSON payloads from `SampleSpecs.cs` (unescaped). These files are the source of truth for the growing-complexity suite; when a new sample is added to the sample app, its JSON is added here too.

- [ ] **Step 2: Write the test**

`Tesserae.Flint/test/specs.test.mjs`:

```js
/**
 * Compiles every test spec with all three flint backends through the SAME
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

const specsDir = resolve(here, 'specs');
const files = (await readdir(specsDir)).filter(f => f.endsWith('.json')).sort();
assert.ok(files.length > 0, 'no spec files found');

let failures = 0;
for (const file of files) {
  const input = JSON.parse(await readFile(resolve(specsDir, file), 'utf8'));
  for (const fn of ['assembleVegaLite', 'assembleECharts', 'assembleChartjs']) {
    try {
      const spec = window.flint[fn](structuredClone(input));
      assert.equal(typeof spec, 'object');
    } catch (e) {
      failures++;
      console.error(`FAIL ${file} / ${fn}: ${e.message}`);
    }
  }
}
if (failures) { console.error(`${failures} failures`); process.exit(1); }
console.log(`specs.test.mjs: ${files.length} specs x 3 backends compiled OK`);
```

- [ ] **Step 3: Wire into npm test and run**

In `Tesserae.Flint/package.json` change the test script to:

```json
"test": "node build/bundle.test.mjs && node test/specs.test.mjs"
```

```bash
cd Tesserae.Flint && npm test
```

Expected: both test files pass. If a backend rejects a spec, fix the spec (chart type / semantic type names) — check `packages/flint-js/src/core` for valid semantic type names and each backend's template registry for supported chart types.

- [ ] **Step 4: Commit**

```bash
git add Tesserae.Flint/test Tesserae.Flint/package.json
git commit -m "test(tesserae-flint): compile all sample specs with all three backends"
```

---

### Task 7: CI pipeline yml + repo README note

**Files:**
- Create: `.azure-devops/build-nuget-h5.yml`
- Modify: `README.md` (repo root — add a short "Tesserae.Flint" section)

- [ ] **Step 1: Copy and adapt graph-kit's pipeline**

Copy `curiosity-ai/graph-kit`'s `.azure-devops/build-nuget-h5.yml` and replace: trigger paths → `Tesserae.Flint/*`, `packages/flint-js/*`, `.azure-devops/build-nuget-h5.yml`; project paths `Tesserae.GraphKit` → `Tesserae.Flint`; the bundle step's working directory → `Tesserae.Flint/`. Keep the CalVer versioning, `h5-compiler` install, and NuGet push steps unchanged (Rafael wires the service connection).

- [ ] **Step 2: Add a Tesserae.Flint section to the fork's README**

Append after the Install section of the root `README.md`:

```markdown
## Tesserae.Flint (this fork)

This fork adds [`Tesserae.Flint`](Tesserae.Flint/README.md), a NuGet package
with a Tesserae (H5 C#) component that renders flint-json across all three
backends with lazy-loaded, package-embedded JS. See
`Tesserae.Flint.Sample/` for a gallery app.
```

- [ ] **Step 3: Commit and push**

```bash
git add .azure-devops README.md
git commit -m "ci(tesserae-flint): azure devops nuget pipeline + README section"
git push -u origin heni/dev-1714-tesserae-flint
```

---

## Verification checklist (end-to-end)

- `cd Tesserae.Flint && npm run bundle && npm test` — bundle + spec tests green.
- `dotnet build TesseraeFlint.sln -c Debug && dotnet build TesseraeFlint.sln -c Release` — both configurations build; Release produces the nupkg.
- Sample app in a browser: 3 samples × 3 backends all render; lazy loading visible in the network tab; broken spec → inline error card; no `.dontload` files served.
- Update DEV-1714 with status + screenshot of the gallery.
