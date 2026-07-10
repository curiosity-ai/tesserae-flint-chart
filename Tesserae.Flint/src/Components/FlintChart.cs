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
    [H5.Name("flint.FlintChart")]
    public class FlintChart : IComponent, ISpecialCaseStyling
    {
        private readonly HTMLElement _container;
        private string       _flintJson;
        private FlintBackend _backend = FlintBackend.VegaLite;
        private string       _fontFamily;      // optional Google Font to load before rendering
        private object       _instance;        // echarts instance / Chart instance / vega-embed result
        private FlintBackend _instanceBackend; // backend the live instance was created with (for correct dispose)
        private Action<FlintChart, object> _onRendered;
        private Action<FlintChart, string> _onError;
        private int _renderVersion;             // guards against out-of-order async renders

        /// <summary>The DOM element styling helpers (<c>.W()</c>, <c>.S()</c>, …) write to.</summary>
        public HTMLElement StylingContainer => _container;

        /// <summary>Sizing extensions write directly onto the container, not a wrapper.</summary>
        public bool PropagateToStackItemParent => false;

        /// <summary>Creates a chart component from a flint-json spec string.</summary>
        public FlintChart(string flintJson)
        {
            _flintJson = flintJson;
            _container = Div(_("tss-flintchart"));
            _container.style.position  = "relative";
            _container.style.width     = "100%";
            _container.style.height    = "100%";
            _container.style.minHeight = "240px";

            DomObserver.WhenMounted(_container, () => { var _ = RenderChartAsync(); });
        }

        // ── Fluent configuration ────────────────────────────────────────────

        /// <summary>Selects the rendering backend (default <see cref="FlintBackend.VegaLite"/>).</summary>
        public FlintChart Backend(FlintBackend backend)          { _backend = backend; Refresh(); return this; }

        /// <summary>Replaces the flint-json spec and re-renders if mounted.</summary>
        public FlintChart Spec(string flintJson)                 { _flintJson = flintJson; Refresh(); return this; }

        /// <summary>Loads the given Google Font family before the first render.</summary>
        public FlintChart Font(string googleFontFamily)          { _fontFamily = googleFontFamily; return this; }

        /// <summary>Registers a callback invoked after each successful render with the backend instance.</summary>
        public FlintChart OnRendered(Action<FlintChart, object> handler) { _onRendered = handler; return this; }

        /// <summary>Registers a callback invoked with the error message when a render fails.</summary>
        public FlintChart OnError(Action<FlintChart, string> handler)    { _onError = handler; return this; }

        /// <summary>Re-compiles and re-renders (no-op until the component is mounted).</summary>
        public void Refresh()
        {
            if (Script.Write<bool>("{0}.isConnected === true", _container)) { var _ = RenderChartAsync(); }
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

                // Require.LoadScriptAsync can resolve after a failed fetch (the dead <script>
                // tag dedups the retry), so verify the globals actually exist before using them.
                EnsureGlobal("flint", "the flint compiler");
                switch (_backend)
                {
                    case FlintBackend.ECharts: EnsureGlobal("echarts",   "the ECharts backend");   break;
                    case FlintBackend.ChartJs: EnsureGlobal("Chart",     "the Chart.js backend");  break;
                    default:                   EnsureGlobal("vegaEmbed", "the Vega-Lite backend"); break;
                }

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
                        _instance = chart; _instanceBackend = _backend;
                        break;
                    }
                    case FlintBackend.ChartJs:
                    {
                        var config = Script.Write<object>("window.flint.assembleChartjs({0})", input);
                        var canvas = (HTMLCanvasElement)document.createElement("canvas");
                        _container.appendChild(canvas);
                        _instance = Script.Write<object>("new window.Chart({0}, {1})", canvas, config);
                        _instanceBackend = _backend;
                        break;
                    }
                    default: // VegaLite
                    {
                        var spec   = Script.Write<object>("window.flint.assembleVegaLite({0})", input);
                        var result = await VegaEmbedAsync(_container, spec);
                        if (version != _renderVersion)
                        {
                            // Superseded while awaiting: finalize the orphaned view and bail.
                            Script.Write("try { {0}.finalize && {0}.finalize(); } catch(e) {}", result);
                            return;
                        }
                        _instance = result; _instanceBackend = _backend;
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

        /// <summary>Throws with a clear message when the expected window global is missing after a load.</summary>
        private static void EnsureGlobal(string globalName, string what)
        {
            if (!Script.Write<bool>("typeof window[{0}] !== 'undefined'", globalName))
            {
                throw new Exception(
                    "window." + globalName + " is missing after loading " + what +
                    " — the script failed to load (check that the .dontload suffix was stripped at deploy time).");
            }
        }

        /// <summary>Awaits the vega-embed Promise via a TaskCompletionSource so a rejection surfaces as a C# exception.</summary>
        private static Task<object> VegaEmbedAsync(HTMLElement container, object spec)
        {
            var tcs = new TaskCompletionSource<object>();
            var resolve = (Action<object>)(result => tcs.SetResult(result));
            var reject  = (Action<object>)(error  => tcs.SetException(new Exception(
                Script.Write<string>("String({0} && ({0}.message || {0}))", error))));
            Script.Write("window.vegaEmbed({0}, {1}, { actions: false }).then({2}, {3});", container, spec, resolve, reject);
            return tcs.Task;
        }

        private void ShowError(string message)
        {
            DisposeInstance();
            ClearChildren(_container);
            var card = Div(_("tss-flintchart-error"));
            card.style.padding    = "12px";
            card.style.color      = "var(--tss-danger-color, #a4262c)";
            card.style.fontFamily = "monospace";
            card.style.whiteSpace = "pre-wrap";
            card.textContent      = "Flint chart error: " + message;
            _container.appendChild(card);
        }

        private void DisposeInstance()
        {
            if (_instance == null) return;
            switch (_instanceBackend)
            {
                case FlintBackend.ECharts: Script.Write("try { {0}.dispose(); } catch(e) {}", _instance); break;
                case FlintBackend.ChartJs: Script.Write("try { {0}.destroy(); } catch(e) {}", _instance); break;
                default:                   Script.Write("try { {0}.finalize && {0}.finalize(); } catch(e) {}", _instance); break;
            }
            _instance = null;
        }

        private static void ClearChildren(HTMLElement el)
        {
            while (el.firstChild != null) el.removeChild(el.firstChild);
        }

        /// <summary>Renders the component's root element.</summary>
        public HTMLElement Render() => _container;
    }
}
