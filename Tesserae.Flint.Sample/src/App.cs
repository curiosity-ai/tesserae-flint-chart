using Tesserae;
using static Tesserae.UI;
using static H5.Core.dom;

namespace Tesserae.Flint.Sample
{
    /// <summary>
    /// Gallery app: renders every <see cref="SampleSpecs"/> entry across all three
    /// Flint backends (Vega-Lite, ECharts, Chart.js) side by side.
    /// </summary>
    internal static class App
    {
        private static void Main()
        {
            var page = VStack().S().Padding(16.px()).ScrollY();

            foreach (var sample in SampleSpecs.All)
            {
                page.Add(TextBlock(sample.Name).SemiBold().MediumPlus().PT(16).PB(8));

                page.Add(HStack().WS().H(340.px()).Children(
                    Cell("Vega-Lite", sample.Json, FlintBackend.VegaLite),
                    Cell("ECharts",   sample.Json, FlintBackend.ECharts),
                    Cell("Chart.js",  sample.Json, FlintBackend.ChartJs)));
            }

            document.body.appendChild(page.Render());
        }

        private static IComponent Cell(string label, string json, FlintBackend backend)
            => VStack().W(33.percent()).H(100.percent()).Children(
                   TextBlock(label).Tiny(),
                   Flint.Chart(json)
                        .Backend(backend)
                        .OnError((c, e) => console.error(label + ": " + e))
                        .H(300.px()));
    }
}
