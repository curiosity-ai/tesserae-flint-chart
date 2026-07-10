using System.Threading.Tasks;

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
        // NOTE: Tesserae's Require.LoadScriptAsync caches by URL and, on a 404, the dead
        // <script> tag stays in the DOM — so a retry resolves successfully even though the
        // library's global was never defined. Consumers must verify the expected window.*
        // global after awaiting (FlintChart adds that guard).
        private const string BasePath = "./assets/js/flint/";

        internal static Task LoadFlintAsync() => Require.LoadScriptAsync(BasePath + "flint-chart.min.js");

        internal static async Task LoadVegaLiteAsync()
        {
            await Require.LoadScriptAsync(BasePath + "vega.min.js");
            await Require.LoadScriptAsync(BasePath + "vega-lite.min.js");
            await Require.LoadScriptAsync(BasePath + "vega-embed.min.js");
        }

        internal static Task LoadEChartsAsync() => Require.LoadScriptAsync(BasePath + "echarts.min.js");

        internal static Task LoadChartJsAsync() => Require.LoadScriptAsync(BasePath + "chart.umd.min.js");

        internal static Task LoadBackendAsync(FlintBackend backend)
        {
            switch (backend)
            {
                case FlintBackend.VegaLite: return LoadVegaLiteAsync();
                case FlintBackend.ECharts:  return LoadEChartsAsync();
                case FlintBackend.ChartJs:  return LoadChartJsAsync();
                default: throw new System.ArgumentOutOfRangeException(nameof(backend), "Unknown Flint backend: " + backend);
            }
        }
    }
}
