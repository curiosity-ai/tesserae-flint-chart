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
                var link  = (HTMLLinkElement)document.createElement("link");
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
            document.fonts.ready.then((_) => tcs.SetResult(true));
            return tcs.Task;
        }
    }
}
