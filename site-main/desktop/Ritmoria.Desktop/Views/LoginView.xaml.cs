using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Ritmoria.Desktop.Views;

public sealed partial class LoginView : UserControl
{
    public LoginView()
    {
        InitializeComponent();
    }

    private async void LoginButton_Click(object sender, RoutedEventArgs e)
    {
        StatusText.Text = "";
        var login = LoginInput.Text.Trim();
        var password = PasswordInput.Password;

        if (string.IsNullOrWhiteSpace(login) || string.IsNullOrWhiteSpace(password))
        {
            StatusText.Text = "Заполни логин и пароль";
            return;
        }

        var ok = await App.State.LoginAsync(login, password);
        if (!ok)
        {
            StatusText.Text = "Не удалось войти. Проверь логин и пароль.";
        }
    }
}

