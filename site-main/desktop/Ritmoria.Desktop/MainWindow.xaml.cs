using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Ritmoria.Desktop;

public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        ExtendsContentIntoTitleBar = true;
        DataContext = App.State;
        App.State.AuthChanged += OnAuthChanged;
        RootNavigation.SelectedItem = RootNavigation.MenuItems[0];
    }

    private void OnAuthChanged(object? sender, EventArgs e)
    {
        LoginView.Visibility = App.State.IsAuthenticated ? Visibility.Collapsed : Visibility.Visible;
        ShellView.Visibility = App.State.IsAuthenticated ? Visibility.Visible : Visibility.Collapsed;
    }

    private void RootNavigation_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItem is not NavigationViewItem item) return;
        ShellView.Navigate(StringComparer.OrdinalIgnoreCase.Equals(item.Tag?.ToString(), "home") ? "home" : item.Tag?.ToString() ?? "home");
    }
}

