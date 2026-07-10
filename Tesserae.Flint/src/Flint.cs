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
