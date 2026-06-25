using System.Text.Json.Serialization;

namespace Ritmoria.Desktop.Models;

public sealed class UserSession
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("username")]
    public string Username { get; set; } = "";

    [JsonPropertyName("username_tag")]
    public string UsernameTag { get; set; } = "";

    [JsonPropertyName("avatar")]
    public string? Avatar { get; set; }

    [JsonPropertyName("role")]
    public string Role { get; set; } = "user";

    public bool IsAdmin => StringComparer.OrdinalIgnoreCase.Equals(Role, "admin");
}

