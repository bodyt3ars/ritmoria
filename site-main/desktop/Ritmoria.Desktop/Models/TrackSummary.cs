using System.Text.Json.Serialization;

namespace Ritmoria.Desktop.Models;

public sealed class TrackSummary
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; } = "Без названия";

    [JsonPropertyName("artist")]
    public string Artist { get; set; } = "Артист";

    [JsonPropertyName("cover")]
    public string? Cover { get; set; }

    [JsonPropertyName("audioSrc")]
    public string? AudioSrc { get; set; }
}

