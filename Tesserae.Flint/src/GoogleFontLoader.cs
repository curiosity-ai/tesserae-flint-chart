using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using H5;
using static H5.Core.dom;

namespace Tesserae.Flint
{
    /// <summary>
    /// Loads Google Fonts on demand and waits until they are actually usable, so chart
    /// renderers measure text with the correct font instead of a fallback. "Usable"
    /// means the injected stylesheet has been fetched and parsed AND each requested
    /// weight has been explicitly loaded via <c>document.fonts.load</c> (fonts declared
    /// by @font-face are otherwise only fetched on first use, so waiting on
    /// <c>document.fonts.ready</c> alone would resolve before the font exists).
    /// </summary>
    public static class GoogleFontLoader
    {
        // Keyed on family + ":" + weights so requesting additional weights for an
        // already-loaded family still injects a stylesheet for the new weights.
        private static readonly Dictionary<string, Task> _stylesheets = new Dictionary<string, Task>();

        /// <summary>
        /// Injects a Google Fonts stylesheet for <paramref name="family"/> (e.g. "Inter",
        /// "Roboto Condensed") with the given semicolon-separated <paramref name="weights"/>,
        /// waits for it to be fetched and parsed, then loads each weight and resolves once
        /// the font faces are available for rendering. Never hangs: a failed stylesheet
        /// fetch (e.g. offline) logs a warning and resolves anyway.
        /// </summary>
        public static async Task LoadAsync(string family, string weights = "400;700")
        {
            var key = family + ":" + weights;

            if (!_stylesheets.TryGetValue(key, out var stylesheetLoaded))
            {
                var tcs   = new TaskCompletionSource<bool>();
                var link  = (HTMLLinkElement)document.createElement("link");
                link.rel  = "stylesheet";
                link.href = "https://fonts.googleapis.com/css2?family="
                          + family.Replace(" ", "+") + ":wght@" + weights
                          + "&display=swap";
                link.onload  = _ => tcs.SetResult(true);
                link.onerror = _ =>
                {
                    console.warn("GoogleFontLoader: failed to load stylesheet for '" + family + "'");
                    tcs.SetResult(false); // resolve anyway so callers never hang
                };
                document.head.appendChild(link);

                stylesheetLoaded  = tcs.Task;
                _stylesheets[key] = stylesheetLoaded;
            }

            await stylesheetLoaded;

            // Explicitly request each weight: @font-face fonts are lazy and only start
            // downloading when first used, so we force the load and wait for it.
            foreach (var weight in weights.Split(';'))
            {
                await LoadFontFaceAsync(weight.Trim() + " 1em \"" + family + "\"");
            }
        }

        private static Task LoadFontFaceAsync(string font)
        {
            var tcs = new TaskCompletionSource<bool>();
            var resolve = (Action)(() => tcs.SetResult(true));
            // FontFaceSet.load returns a promise; it resolves (possibly with an empty
            // list) when no matching face exists, and rejects only on a syntax error —
            // resolve the task in both cases so callers never hang.
            Script.Write("document.fonts.load({0}).then({1}, {1});", font, resolve);
            return tcs.Task;
        }
    }
}
