using Microsoft.UI.Xaml.Controls;
using Ritmoria.Desktop.Models;

namespace Ritmoria.Desktop.Views;

public sealed partial class ShellView : UserControl
{
    public ShellView()
    {
        InitializeComponent();
        DataContext = App.State;
        TrackRepeater.ItemsSource = GetPlaceholderTracks();
    }

    public void Navigate(string page)
    {
        var title = page switch
        {
            "rating" => "Рейтинг",
            "playlists" => "Плейлисты",
            "profile" => "Профиль",
            "beatRush" => "Beat Rush",
            _ => "Главная"
        };

        PageTitle.Text = title;
        HeroTitle.Text = page switch
        {
            "rating" => "Рейтинг треков",
            "playlists" => "Публичные и личные плейлисты",
            "profile" => "Профиль артиста",
            "beatRush" => "Beat Rush как нативная rhythm game",
            _ => "Добро пожаловать в Ритморию Desktop"
        };
        HeroSubtitle.Text = page switch
        {
            "rating" => "Здесь будет живой рейтинг с оценками судей, пользователей и playback.",
            "playlists" => "Здесь появятся системные месячные плейлисты и личные подборки.",
            "profile" => "Здесь будут аватар, медали, треки, посты и админские действия для роли admin.",
            "beatRush" => "Игровой слой будет отдельным desktop-модулем, а результат сохранится через сервер.",
            _ => "Это нативный Windows-клиент. Сайт остаётся отдельно и не ломается."
        };
    }

    private static IReadOnlyList<TrackSummary> GetPlaceholderTracks()
    {
        return
        [
            new TrackSummary { Title = "Рейтинг API", Artist = "будет подключён следующим шагом" },
            new TrackSummary { Title = "Глобальный плеер", Artist = "нативный слой Windows" },
            new TrackSummary { Title = "Beat Rush", Artist = "desktop-версия без web wrapper" }
        ];
    }
}

