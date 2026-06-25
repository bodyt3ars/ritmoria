using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Ritmoria.Desktop.Models;

namespace Ritmoria.Desktop.Services;

public sealed class RitmoriaApiClient
{
    private readonly CookieContainer _cookies = new();
    private readonly HttpClient _http;
    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public RitmoriaApiClient(Uri baseUri)
    {
        var handler = new HttpClientHandler
        {
            CookieContainer = _cookies,
            UseCookies = true,
            AutomaticDecompression = DecompressionMethods.All
        };

        _http = new HttpClient(handler)
        {
            BaseAddress = baseUri
        };
    }

    public async Task<UserSession?> LoginAsync(string login, string password, CancellationToken cancellationToken = default)
    {
        var payload = JsonSerializer.Serialize(new { login, password });
        using var content = new StringContent(payload, Encoding.UTF8, "application/json");
        using var response = await _http.PostAsync("/login", content, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

        if (!document.RootElement.TryGetProperty("user", out var userElement))
        {
            return null;
        }

        return userElement.Deserialize<UserSession>(_jsonOptions);
    }

    public async Task<UserSession?> GetSessionAsync(CancellationToken cancellationToken = default)
    {
        using var response = await _http.GetAsync("/api/auth/session", cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

        if (!document.RootElement.TryGetProperty("user", out var userElement))
        {
            return null;
        }

        return userElement.Deserialize<UserSession>(_jsonOptions);
    }

    public async Task<IReadOnlyList<TrackSummary>> GetRatingTracksAsync(CancellationToken cancellationToken = default)
    {
        using var response = await _http.GetAsync("/api/rating/tracks?sort=judge&page=1&limit=20", cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return Array.Empty<TrackSummary>();
        }

        var payload = await response.Content.ReadFromJsonAsync<JsonElement>(_jsonOptions, cancellationToken);
        if (payload.TryGetProperty("tracks", out var tracksElement))
        {
            return tracksElement.Deserialize<List<TrackSummary>>(_jsonOptions) ?? [];
        }

        if (payload.ValueKind == JsonValueKind.Array)
        {
            return payload.Deserialize<List<TrackSummary>>(_jsonOptions) ?? [];
        }

        return Array.Empty<TrackSummary>();
    }
}

