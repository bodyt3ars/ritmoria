using Microsoft.UI.Xaml;
using Ritmoria.Desktop.Services;
using Ritmoria.Desktop.ViewModels;

namespace Ritmoria.Desktop;

public partial class App : Application
{
    public static RitmoriaApiClient Api { get; } = new(new Uri("https://ritmoria.com"));
    public static AppViewModel State { get; } = new(Api);

    private Window? _window;

    public App()
    {
        InitializeComponent();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        _window = new MainWindow();
        _window.Activate();
    }
}

