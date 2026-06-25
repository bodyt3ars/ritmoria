using Ritmoria.Desktop.Models;
using Ritmoria.Desktop.Services;

namespace Ritmoria.Desktop.ViewModels;

public sealed class AppViewModel : ObservableViewModel
{
    private readonly RitmoriaApiClient _api;
    private UserSession? _currentUser;
    private string _playerTitle = "Ритмория";
    private string _playerArtist = "Выбери трек, чтобы начать";

    public event EventHandler? AuthChanged;

    public AppViewModel(RitmoriaApiClient api)
    {
        _api = api;
    }

    public UserSession? CurrentUser
    {
        get => _currentUser;
        private set
        {
            if (SetProperty(ref _currentUser, value))
            {
                RaisePropertyChanged(nameof(IsAuthenticated));
                RaisePropertyChanged(nameof(CurrentUserName));
                AuthChanged?.Invoke(this, EventArgs.Empty);
            }
        }
    }

    public bool IsAuthenticated => CurrentUser is not null;

    public string CurrentUserName => CurrentUser?.Username ?? "Гость";

    public string PlayerTitle
    {
        get => _playerTitle;
        set => SetProperty(ref _playerTitle, value);
    }

    public string PlayerArtist
    {
        get => _playerArtist;
        set => SetProperty(ref _playerArtist, value);
    }

    public async Task<bool> LoginAsync(string login, string password)
    {
        CurrentUser = await _api.LoginAsync(login, password);
        return CurrentUser is not null;
    }
}

