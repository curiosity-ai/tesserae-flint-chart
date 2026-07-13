# Tesserae.Flint

A [Tesserae](https://github.com/curiosity-ai/tesserae) (H5 C# → JavaScript) component that renders [Flint](https://github.com/microsoft/flint-chart) chart specs via **Vega-Lite**, **ECharts**, or **Chart.js**.

All chart JavaScript (the flint-chart compiler and the renderer runtimes) is embedded in the NuGet package as resources with a `.dontload` suffix, so H5 extracts them to `assets/js/flint` without injecting them into `index.html`. They are lazy-loaded at runtime via `Require.LoadScriptAsync` — the host must strip the `.dontload` suffix at deploy time (Mosaik's `FrontEndWatcher` already does this).

## Usage

```csharp
var chart = Flint.Chart(flintJson)
                 .Backend(FlintBackend.ECharts)
                 .OnError((c, e) => console.error(e));
```
