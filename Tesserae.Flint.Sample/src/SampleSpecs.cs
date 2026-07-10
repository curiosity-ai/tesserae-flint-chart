namespace Tesserae.Flint.Sample
{
    /// <summary>
    /// Growing-complexity flint-json sample specs rendered by the gallery.
    ///
    /// NOTE: when adding a new sample here, also add the same spec to
    /// Tesserae.Flint/test/specs so it is covered by the spec compile tests (Task 6).
    /// </summary>
    public static class SampleSpecs
    {
        public class Sample
        {
            public string Name;
            public string Json;
        }

        public static readonly Sample[] All = new[]
        {
            new Sample
            {
                Name = "01 Bar",
                Json = @"{
  ""data"": { ""values"": [
    { ""cat"": ""A"", ""val"": 30 },
    { ""cat"": ""B"", ""val"": 55 },
    { ""cat"": ""C"", ""val"": 43 }
  ]},
  ""semantic_types"": { ""cat"": ""Category"", ""val"": ""Quantity"" },
  ""chart_spec"": {
    ""chartType"": ""Bar Chart"",
    ""encodings"": { ""x"": { ""field"": ""cat"" }, ""y"": { ""field"": ""val"" } },
    ""baseSize"": { ""width"": 400, ""height"": 300 }
  }
}"
            },
            new Sample
            {
                Name = "02 Line",
                Json = @"{
  ""data"": { ""values"": [
    { ""month"": ""2025-01"", ""rev"": 12 },
    { ""month"": ""2025-02"", ""rev"": 18 },
    { ""month"": ""2025-03"", ""rev"": 15 },
    { ""month"": ""2025-04"", ""rev"": 24 }
  ]},
  ""semantic_types"": { ""month"": ""Month"", ""rev"": ""Price"" },
  ""chart_spec"": {
    ""chartType"": ""Line Chart"",
    ""encodings"": { ""x"": { ""field"": ""month"" }, ""y"": { ""field"": ""rev"" } },
    ""baseSize"": { ""width"": 400, ""height"": 300 }
  }
}"
            },
            new Sample
            {
                Name = "03 Scatter + color",
                Json = @"{
  ""data"": { ""values"": [
    { ""weight"": 2130, ""mpg"": 30.5, ""origin"": ""Japan"" },
    { ""weight"": 2670, ""mpg"": 27.2, ""origin"": ""Japan"" },
    { ""weight"": 1985, ""mpg"": 33.8, ""origin"": ""Japan"" },
    { ""weight"": 3563, ""mpg"": 16.0, ""origin"": ""USA"" },
    { ""weight"": 4100, ""mpg"": 13.5, ""origin"": ""USA"" },
    { ""weight"": 2950, ""mpg"": 21.4, ""origin"": ""USA"" },
    { ""weight"": 2190, ""mpg"": 29.0, ""origin"": ""Germany"" },
    { ""weight"": 2515, ""mpg"": 25.3, ""origin"": ""Germany"" },
    { ""weight"": 3020, ""mpg"": 20.1, ""origin"": ""Germany"" }
  ]},
  ""semantic_types"": { ""weight"": ""Quantity"", ""mpg"": ""Quantity"", ""origin"": ""Country"" },
  ""chart_spec"": {
    ""chartType"": ""Scatter Plot"",
    ""encodings"": {
      ""x"":     { ""field"": ""weight"" },
      ""y"":     { ""field"": ""mpg"" },
      ""color"": { ""field"": ""origin"" }
    },
    ""baseSize"": { ""width"": 400, ""height"": 300 }
  }
}"
            }
        };
    }
}
