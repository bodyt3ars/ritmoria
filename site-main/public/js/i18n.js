(function () {
  const STORAGE_KEY = "ritmoria-language";
  const DEFAULT_LANGUAGE = "ru";
  const SUPPORTED_LANGUAGES = ["ru", "en"];
  const textNodeOriginals = new WeakMap();
  const attrOriginals = new WeakMap();

  const dictionaries = {
    ru: {
      "nav.home": "Главная",
      "nav.mainNavigation": "Основная навигация",
      "nav.playlists": "Плейлисты",
      "nav.queue": "Очередь",
      "nav.opens": "Опены",
      "nav.discover": "Дискавер",
      "nav.submit": "+Трек на оценку",
      "nav.submitSidebar": "Загрузить трек в очередь",
      "nav.support": "Поддержка",
      "nav.login": "Вход",
      "nav.register": "Регистрация",
      "nav.messages": "Личные сообщения",
      "nav.notifications": "Уведомления",
      "nav.notificationsReadAll": "Прочитать все",
      "nav.profile": "Профиль",
      "nav.settings": "Настройки",
      "nav.admin": "Админ панель",
      "nav.logout": "Выйти",
      "nav.searchPlaceholder": "Поиск треков, пользователей...",
      "nav.mobileMenu": "Открыть меню",
      "nav.rankUp": "Rank up",
      "nav.empty": "Пока пусто",
      "nav.searchNothing": "Ничего не найдено",
      "nav.artist": "Исполнитель",
      "nav.track": "Трек",
      "rank.newbie": "Новичок",
      "rank.listener": "Слушатель",
      "rank.artist": "Артист",
      "rank.hitmaker": "Хитмейкер",
      "rank.legend": "Легенда",
      "rank.next": "Следующий ранг",
      "modal.confirmTitle": "Подтвердите действие",
      "modal.confirmText": "Вы уверены?",
      "modal.confirm": "Подтвердить",
      "modal.cancel": "Отмена",
      "modal.logoutTitle": "Выйти из аккаунта",
      "modal.logoutText": "Сессия завершится на этом устройстве.",
      "modal.logoutConfirm": "Выйти",
      "modal.logoutCancel": "Остаться",
      "home.seoTitle": "Ритмория — музыкальная платформа для артистов, треков, опенов и стримов",
      "home.topTracks": "Лучшие треки прошлого стрима",
      "home.news": "Новости",
      "home.discoverTracks": "Открывай треки",
      "home.prevTracks": "Показать предыдущие треки",
      "home.nextTracks": "Показать следующие треки",
      "home.recommendations": "Рекомендации",
      "home.artistTop": "Топ исполнители",
      "home.moreRecommendations": "Ещё рекомендации",
      "home.loadingTracks": "Загрузка треков...",
      "home.loadingNews": "Загрузка новостей...",
      "home.loadingSpotlight": "Загрузка подборки...",
      "home.loadingPosts": "Загрузка постов...",
      "queue.sections": "Разделы очереди",
      "queue.queue": "Очередь",
      "queue.battles": "Баттлы",
      "queue.title": "Очередь треков",
      "queue.loading": "загрузка...",
      "queue.open": "Открыть",
      "queue.pause": "Пауза",
      "queue.resume": "Возобновить",
      "queue.close": "Закрыть",
      "queue.totalTab": "Общие",
      "queue.judgesTab": "Судьи",
      "queue.usersTab": "Пользователи",
      "queue.totalScore": "Общее",
      "queue.judgesScore": "Судьи",
      "queue.usersScore": "Пользователи",
      "queue.rate": "Оценить",
      "queue.openStatus": "Открыта",
      "queue.closedStatus": "Закрыта",
      "queue.pausedStatus": "Приостановлена",
      "queue.scoreAria": "оценка",
      "queue.deleteConfirm": "Удалить трек?",
      "queue.deleteError": "Ошибка при удалении",
      "queue.openError": "Не удалось открыть очередь",
      "queue.pauseError": "Не удалось приостановить очередь",
      "queue.closeError": "Не удалось закрыть очередь",
      "profile.avatarAlt": "Аватар профиля",
      "profile.changeAvatar": "Изменить аватар",
      "profile.verified": "Подтвержденный профиль",
      "profile.topPlaces": "Места в топе стримов",
      "profile.editUsername": "Изменить ник",
      "profile.usernamePlaceholder": "Введите новый ник",
      "profile.save": "Сохранить",
      "profile.cancel": "Отмена",
      "profile.editProfile": "Редактировать профиль",
      "profile.settings": "Настройки",
      "profile.message": "Написать сообщение",
      "profile.followers": "подписчики",
      "profile.following": "подписки",
      "profile.posts": "Посты",
      "profile.tracks": "Треки",
      "profile.reposts": "Репосты",
      "profile.mentions": "Упоминания",
      "profile.post": "Пост",
      "profile.track": "Трек",
      "profile.editProfileTitle": "Редактировать профиль",
      "profile.nickPlaceholder": "Ник",
      "profile.tagPlaceholder": "Username (например: username)",
      "profile.bioPlaceholder": "Расскажите о себе",
      "profile.accountSettings": "Настройки аккаунта",
      "profile.close": "Закрыть",
      "profile.rateTrack": "Оценить трек",
      "profile.trackRating": "Оценка трека",
      "profile.follow": "Подписаться",
      "profile.unfollow": "Отписаться",
      "profile.loading": "Загрузка...",
      "profile.empty": "Пока пусто",
      "profile.rating": "Рейтинг",
      "profile.users": "Юзеры",
      "profile.judges": "Судьи",
      "profile.updateRating": "Обновить оценку",
      "profile.edit": "Редактировать",
      "profile.pin": "Закрепить",
      "profile.archive": "Архив",
      "profile.delete": "Удалить",
      "profile.deleteTrackConfirm": "Удалить трек навсегда?",
      "profile.noTitle": "Без названия",
      "seo.defaultTitle": "Ритмория — музыкальная платформа для артистов",
      "seo.defaultDescription": "Ритмория — музыкальная платформа для артистов, треков, опенов, стримов и общения вокруг новой музыки.",
      "seo.keywords": "Ритмория, РИТМОРИЯ, ritmoria, музыка, треки, артисты, музыкальная платформа, опены, стрим",
      "seo.siteName": "РИТМОРИЯ"
    },
    en: {
      "nav.home": "Home",
      "nav.mainNavigation": "Main navigation",
      "nav.playlists": "Playlists",
      "nav.queue": "Queue",
      "nav.opens": "Opens",
      "nav.discover": "Discover",
      "nav.submit": "+Submit track",
      "nav.submitSidebar": "Submit a track",
      "nav.support": "Support",
      "nav.login": "Log in",
      "nav.register": "Sign up",
      "nav.messages": "Direct messages",
      "nav.notifications": "Notifications",
      "nav.notificationsReadAll": "Mark all read",
      "nav.profile": "Profile",
      "nav.settings": "Settings",
      "nav.admin": "Admin panel",
      "nav.logout": "Log out",
      "nav.searchPlaceholder": "Search tracks, users...",
      "nav.mobileMenu": "Open menu",
      "nav.rankUp": "Rank up",
      "nav.empty": "Nothing here yet",
      "nav.searchNothing": "No results found",
      "nav.artist": "Artist",
      "nav.track": "Track",
      "rank.newbie": "Newcomer",
      "rank.listener": "Listener",
      "rank.artist": "Artist",
      "rank.hitmaker": "Hitmaker",
      "rank.legend": "Legend",
      "rank.next": "Next rank",
      "modal.confirmTitle": "Confirm action",
      "modal.confirmText": "Are you sure?",
      "modal.confirm": "Confirm",
      "modal.cancel": "Cancel",
      "modal.logoutTitle": "Log out",
      "modal.logoutText": "Your session will end on this device.",
      "modal.logoutConfirm": "Log out",
      "modal.logoutCancel": "Stay",
      "home.seoTitle": "Ritmoria — music platform for artists, tracks, opens, and streams",
      "home.topTracks": "Best tracks from the last stream",
      "home.news": "News",
      "home.discoverTracks": "Discover tracks",
      "home.prevTracks": "Show previous tracks",
      "home.nextTracks": "Show next tracks",
      "home.recommendations": "Recommendations",
      "home.artistTop": "Top artists",
      "home.moreRecommendations": "More recommendations",
      "home.loadingTracks": "Loading tracks...",
      "home.loadingNews": "Loading news...",
      "home.loadingSpotlight": "Loading selection...",
      "home.loadingPosts": "Loading posts...",
      "queue.sections": "Queue sections",
      "queue.queue": "Queue",
      "queue.battles": "Battles",
      "queue.title": "Track queue",
      "queue.loading": "loading...",
      "queue.open": "Open",
      "queue.pause": "Pause",
      "queue.resume": "Resume",
      "queue.close": "Close",
      "queue.totalTab": "Overall",
      "queue.judgesTab": "Judges",
      "queue.usersTab": "Users",
      "queue.totalScore": "Overall",
      "queue.judgesScore": "Judges",
      "queue.usersScore": "Users",
      "queue.rate": "Rate",
      "queue.openStatus": "Open",
      "queue.closedStatus": "Closed",
      "queue.pausedStatus": "Paused",
      "queue.scoreAria": "score",
      "queue.deleteConfirm": "Delete this track?",
      "queue.deleteError": "Could not delete the track",
      "queue.openError": "Could not open the queue",
      "queue.pauseError": "Could not pause the queue",
      "queue.closeError": "Could not close the queue",
      "profile.avatarAlt": "Profile avatar",
      "profile.changeAvatar": "Change avatar",
      "profile.verified": "Verified profile",
      "profile.topPlaces": "Top stream placements",
      "profile.editUsername": "Edit username",
      "profile.usernamePlaceholder": "Enter a new username",
      "profile.save": "Save",
      "profile.cancel": "Cancel",
      "profile.editProfile": "Edit profile",
      "profile.settings": "Settings",
      "profile.message": "Message",
      "profile.followers": "followers",
      "profile.following": "following",
      "profile.posts": "Posts",
      "profile.tracks": "Tracks",
      "profile.reposts": "Reposts",
      "profile.mentions": "Mentions",
      "profile.post": "Post",
      "profile.track": "Track",
      "profile.editProfileTitle": "Edit profile",
      "profile.nickPlaceholder": "Name",
      "profile.tagPlaceholder": "Username, for example: username",
      "profile.bioPlaceholder": "Tell people about yourself",
      "profile.accountSettings": "Account settings",
      "profile.close": "Close",
      "profile.rateTrack": "Rate track",
      "profile.trackRating": "Track rating",
      "profile.follow": "Follow",
      "profile.unfollow": "Unfollow",
      "profile.loading": "Loading...",
      "profile.empty": "Nothing here yet",
      "profile.rating": "Rating",
      "profile.users": "Users",
      "profile.judges": "Judges",
      "profile.updateRating": "Update rating",
      "profile.edit": "Edit",
      "profile.pin": "Pin",
      "profile.archive": "Archive",
      "profile.delete": "Delete",
      "profile.deleteTrackConfirm": "Delete this track permanently?",
      "profile.noTitle": "Untitled",
      "seo.defaultTitle": "Ritmoria — music platform for artists",
      "seo.defaultDescription": "Ritmoria is a music platform for artists, tracks, opens, streams, and community around new music.",
      "seo.keywords": "Ritmoria, music, tracks, artists, music platform, opens, streams, discover",
      "seo.siteName": "RITMORIA"
    }
  };

  const phraseTranslations = {
    "Главная": "Home",
    "Плейлисты": "Playlists",
    "Очередь": "Queue",
    "Баттлы": "Battles",
    "Опены": "Opens",
    "Дискавер": "Discover",
    "Поддержка": "Support",
    "Вход": "Log in",
    "Регистрация": "Sign up",
    "Выйти": "Log out",
    "Профиль": "Profile",
    "Настройки": "Settings",
    "Админ панель": "Admin panel",
    "Сообщения": "Messages",
    "Уведомления": "Notifications",
    "Прочитать все": "Mark all read",
    "Пока пусто": "Nothing here yet",
    "Файл не выбран": "No file selected",
    "Выбрать файл": "Choose file",
    "Выбрать фото": "Choose photo",
    "Сохранить": "Save",
    "Отмена": "Cancel",
    "Создать": "Create",
    "Закрыть": "Close",
    "Открыть": "Open",
    "Удалить": "Delete",
    "Редактировать": "Edit",
    "Ответить": "Reply",
    "Переслать": "Forward",
    "Информация": "Information",
    "Вложение": "Attachment",
    "Группа": "Group",
    "Новый чат": "New chat",
    "Название": "Name",
    "Название группы": "Group name",
    "Описание": "Description",
    "Пригласить": "Invite",
    "Пригласить по @username": "Invite by @username",
    "Новый трек": "New track",
    "Из профиля": "From profile",
    "Автор:": "Artist:",
    "Автор": "Artist",
    "Название трека:": "Track title:",
    "Название трека": "Track title",
    "Ссылка SoundCloud:": "SoundCloud link:",
    "Аудиофайл:": "Audio file:",
    "Аудио": "Audio",
    "Предпрослушивание:": "Preview:",
    "ПОДТЯНУТЬ": "FETCH",
    "ОТПРАВИТЬ ТРЕК": "SUBMIT TRACK",
    "посмотреть очередь": "view queue",
    "Трек на оценку": "Track for rating",
    "Выбери трек из профиля": "Choose a track from your profile",
    "Загружаем треки...": "Loading tracks...",
    "Обложка трека": "Track cover",
    "Нажми на обложку, чтобы загрузить изображение": "Click the cover to upload an image",
    "Выложить опен": "Post an open",
    "Название опена": "Open title",
    "Что это за опен и какой вайб нужен": "What is this open and what vibe do you need?",
    "Жанр": "Genre",
    "Кого ты ищешь на фит": "Who are you looking for on the feature?",
    "SoundCloud ссылка (необязательно)": "SoundCloud link (optional)",
    "Выбрать аудио": "Choose audio",
    "Опубликовать опен": "Publish open",
    "Недописанные треки, на которые можно залететь с фитом": "Unfinished tracks you can jump on with a feature",
    "Загрузка опенов...": "Loading opens...",
    "Мои заявки": "My applications",
    "Плейлист": "Playlist",
    "Мои плейлисты": "My playlists",
    "Публичные плейлисты": "Public playlists",
    "Разделы плейлистов": "Playlist sections",
    "Поиск плейлиста по названию": "Search playlist by name",
    "+ Создать плейлист": "+ Create playlist",
    "← Назад": "← Back",
    "Назад": "Back",
    "Переименовать плейлист": "Rename playlist",
    "Здесь пока нет треков": "No tracks here yet",
    "Новый плейлист": "New playlist",
    "Название плейлиста": "Playlist name",
    "Сообщения и уведомления": "Messages and notifications",
    "Конфиденциальность": "Privacy",
    "Внешний вид": "Appearance",
    "Сохранённые": "Saved",
    "Лайки": "Likes",
    "Музыкальные объединения": "Music collectives",
    "Достижения": "Achievements",
    "Выйти из аккаунта": "Log out",
    "Удалить аккаунт": "Delete account",
    "Архив": "Archive",
    "Заголовок": "Title",
    "Контент": "Content",
    "Пост": "Post",
    "Посты": "Posts",
    "Треки": "Tracks",
    "Репосты": "Reposts",
    "Упоминания": "Mentions",
    "Редактировать профиль": "Edit profile",
    "Написать сообщение": "Message",
    "подписчики": "followers",
    "подписки": "following",
    "Настройки аккаунта": "Account settings",
    "Оценка трека": "Track rating",
    "Оценить трек": "Rate track",
    "Оценить": "Rate",
    "Обновить оценку": "Update rating",
    "Рейтинг": "Rating",
    "Юзеры": "Users",
    "Судьи": "Judges",
    "Общие": "Overall",
    "Пользователи": "Users",
    "Открыта": "Open",
    "Закрыта": "Closed",
    "Приостановлена": "Paused",
    "Пауза": "Pause",
    "Возобновить": "Resume",
    "Очередь треков": "Track queue",
    "Разделы очереди": "Queue sections",
    "загрузка...": "loading...",
    "Найти по нику или @username": "Find by nickname or @username",
    "Загрузка диалогов...": "Loading conversations...",
    "Выбери диалог слева": "Choose a conversation on the left",
    "Здесь появится переписка": "Messages will appear here",
    "Прикрепить файл": "Attach file",
    "Напиши сообщение": "Write a message",
    "Отправить": "Send",
    "Переслать сообщение": "Forward message",
    "Введите название": "Enter a name",
    "Фото группы не выбрано": "No group photo selected",
    "Описание группы (необязательно)": "Group description (optional)",
    "Описание (необязательно)": "Description (optional)",
    "Публикация": "Publication",
    "Создать публикацию": "Create publication",
    "Что нового? Можно отметить @ник": "What's new? You can mention @username",
    "Перетащи фото или видео сюда": "Drop a photo or video here",
    "или": "or",
    "Изменить файл": "Change file",
    "Удалить файл": "Delete file",
    "Опубликовать": "Publish",
    "Загрузить трек": "Upload track",
    "Артист(ы)": "Artist(s)",
    "Продюсер": "Producer",
    "Тэги": "Tags",
    "Напиши что-то о треке...": "Write something about the track...",
    "Файл не выбран": "No file selected",
    "Сохранить аватар": "Save avatar",
    "Удалить аватар": "Delete avatar",
    "Настройте аватар": "Adjust avatar",
    "Масштаб": "Zoom",
    "Новая почта": "New email",
    "Текущий пароль": "Current password",
    "Новый пароль": "New password",
    "Изменить почту": "Change email",
    "Изменить пароль": "Change password",
    "Музыкальное объединение": "Music collective",
    "Состав": "Members",
    "Загружаем состав...": "Loading members...",
    "Итог": "Total",
    "Рифмы и образы": "Rhymes and imagery",
    "Структура и ритмика": "Structure and rhythm",
    "Реализация стиля": "Style execution",
    "Харизма": "Charisma",
    "Атмосфера": "Atmosphere",
    "Запоминаемость": "Memorability",
    "Сбросить": "Reset",
    "Сохранить оценку": "Save rating",
    "Открыть меню": "Open menu",
    "Подтвердите действие": "Confirm action",
    "Вы уверены?": "Are you sure?",
    "Подтвердить": "Confirm",
    "Остаться": "Stay",
    "Личные сообщения": "Direct messages",
    "Поиск треков, пользователей...": "Search tracks, users...",
    "Ничего не найдено": "No results found",
    "Топ исполнители": "Top artists",
    "Лучшие треки прошлого стрима": "Best tracks from the last stream",
    "Новости": "News",
    "Открывай треки": "Discover tracks",
    "Рекомендации": "Recommendations",
    "Ещё рекомендации": "More recommendations",
    "Загрузка треков...": "Loading tracks...",
    "Загрузка новостей...": "Loading news...",
    "Загрузка подборки...": "Loading selection...",
    "Загрузка постов...": "Loading posts..."
    ,
    "Войди по email, username или через Telegram": "Log in with email, username, or Telegram",
    "Email или @username": "Email or @username",
    "email или @username": "email or @username",
    "Пароль": "Password",
    "Введите пароль": "Enter password",
    "Войти": "Log in",
    "Нет аккаунта?": "No account?",
    "Зарегистрироваться": "Sign up",
    "Можно также через Telegram": "You can also use Telegram",
    "Войти через Telegram": "Log in with Telegram",
    "Продолжить через Telegram": "Continue with Telegram",
    "Открыть бота вручную": "Open bot manually",
    "Создай аккаунт вручную или войди через Telegram": "Create an account manually or log in with Telegram",
    "Имя": "Name",
    "Твоё имя": "Your name",
    "Введите email": "Enter email",
    "Минимум 8 символов": "At least 8 characters",
    "Повтори пароль": "Repeat password",
    "Уже есть аккаунт?": "Already have an account?",
    "Подтверждение": "Verification",
    "Мы отправили код на твой email. Введи его ниже.": "We sent a code to your email. Enter it below.",
    "СТРАНИЦА ТРЕКА": "TRACK PAGE",
    "ОЦЕНКА ТРЕКА": "TRACK RATING",
    "Судья": "Judge",
    "Рифмы": "Rhymes",
    "Структура": "Structure",
    "Стиль": "Style",
    "Вайб": "Vibe",
    "Память": "Memory",
    "Пользовательские оценки:": "User ratings:",
    "РИФМЫ И ОБРАЗЫ": "RHYMES AND IMAGERY",
    "СТРУКТУРА И РИТМИКА": "STRUCTURE AND RHYTHM",
    "РЕАЛИЗАЦИЯ СТИЛЯ": "STYLE EXECUTION",
    "ИНДИВИДУАЛЬНОСТЬ И ХАРИЗМА": "PERSONALITY AND CHARISMA",
    "АТМОСФЕРА И ВАЙБ": "ATMOSPHERE AND VIBE",
    "ЗАПОМИНАЕМОСТЬ": "MEMORABILITY",
    "Сначала база × (1 + вайб×0.1), потом × (1 + запоминаемость×0.1)": "Base first × (1 + vibe×0.1), then × (1 + memorability×0.1)",
    "БАЛЛОВ": "POINTS",
    "ОЧИСТИТЬ": "RESET",
    "ОЦЕНИТЬ": "RATE",
    "Выбрать плейлист": "Choose playlist",
    "Свайп вправо": "Swipe right",
    "Свайп влево": "Swipe left",
    "Любимые треки": "Favorite tracks",
    "Куда сохранять": "Where to save",
    "Плейлист для лайка": "Playlist for likes",
    "+ Новый плейлист": "+ New playlist",
    "Назад": "Back",
    "Громкость": "Volume",
    "Нужен аккаунт": "Account required",
    "Войди или зарегистрируйся": "Log in or sign up",
    "Чтобы свайпать треки, сохранять лайки и собирать плейлисты": "To swipe tracks, save likes, and build playlists",
    "Загрузка": "Loading",
    "Загружаем треки...": "Loading tracks...",
    "Подожди секунду": "Wait a second",
    "Дальше": "Next",
    "Сейчас играет": "Now playing",
    "Пока нет плейлистов.": "No playlists yet.",
    "Название плейлиста": "Playlist name"
    ,
    "Пользователи, онлайн, роли, блокировки и контент главной в одном месте.": "Users, online status, roles, blocks, and homepage content in one place.",
    "Зарегистрировано": "Registered",
    "Сейчас онлайн": "Online now",
    "Новости на главной": "Homepage news",
    "Добавить изображение или видео": "Add image or video",
    "Поиск по нику или @username_tag...": "Search by nickname or @username_tag...",
    "Заголовок новости": "News title",
    "Текст новости": "News text",
    "Турнирная зона": "Tournament zone",
    "Админ собирает сетку, участники занимают свободные слоты и заходят в баттл со своим треком.": "Admin builds the bracket, participants take open slots, and enter the battle with their own track.",
    "Заявка в баттл": "Battle application",
    "Занять слот": "Take slot",
    "Загрузить файл": "Upload file",
    "+Трек на оценку": "+Submit track",
    "Слушатель": "Listener",
    "Загрузка артистов...": "Loading artists...",
    "Показать предыдущие треки": "Show previous tracks",
    "Показать следующие треки": "Show next tracks",
    "0 треков": "0 tracks",
    "Переключатель рейтинга": "Rating switcher",
    "Нажми, чтобы загрузить обложку": "Click to upload cover art",
    "p.s. благодаря тэгам и жанрам,": "p.s. thanks to tags and genres,",
    "ваши треки попадают в рекомендации": "your tracks can appear in recommendations",
    "Подписчики": "Followers",
    "Ссылка скопирована": "Link copied",
    "Ссылка на SoundCloud": "SoundCloud link",
    "Ссылка на Instagram": "Instagram link",
    "Telegram username или ссылка": "Telegram username or link",
    "Ссылка на Website": "Website link",
    "Предпросмотр аватара": "Avatar preview",
    "@ник артиста или несколько через запятую": "@artist username or several separated by commas",
    "ник артиста или артистов": "artist username or artists",
    "Ник": "Name",
    "Username (например: username)": "Username, for example: username",
    "Расскажите о себе": "Tell people about yourself",
    "Артист": "Artist",
    "РИТМОРИЯ": "RITMORIA",
    "Основная навигация": "Main navigation",
    "Поддержка в Telegram": "Support on Telegram",
    "Добавить в очередь": "Add to queue",
    "Репост": "Repost",
    "Редактирование трека": "Edit track",
    "Сохранить изменения": "Save changes",
    "Укажи причину удаления трека. Она придёт пользователю уведомлением:": "Enter the reason for deleting the track. The user will receive it as a notification:",
    "Нужно указать причину удаления.": "You need to enter a deletion reason.",
    "Ошибка удаления": "Delete failed",
    "Ошибка архивации": "Archive failed",
    "только что": "just now",
    "Нельзя оценивать свой трек.": "You cannot rate your own track.",
    "Сохраняем оценку...": "Saving rating...",
    "Оценка сохранена": "Rating saved",
    "Нужно войти в аккаунт.": "You need to log in.",
    "Свой трек репостнуть нельзя.": "You cannot repost your own track.",
    "Не удалось обновить репост трека": "Could not update track repost",
    "Для треков в профиле действует лимит 35 МБ.": "Profile tracks have a 35 MB limit.",
    "Название обязательно": "Title is required",
    "Загрузите песню": "Upload a song",
    "Загрузите обложку": "Upload cover art",
    "Не удалось обновить трек": "Could not update track",
    "Не удалось загрузить трек": "Could not upload track"
    ,
    "Что-то пошло не так. Попробуй ещё раз.": "Something went wrong. Try again.",
    "Что-то пошло не так на сервере. Попробуй ещё раз чуть позже.": "Something went wrong on the server. Try again a bit later.",
    "Файл слишком большой. Попробуй выбрать файл поменьше.": "The file is too large. Try choosing a smaller file.",
    "Не удалось обработать выбранный файл. Попробуй загрузить его заново.": "Could not process the selected file. Try uploading it again.",
    "Укажи корректную почту.": "Enter a valid email.",
    "Эта почта уже занята.": "This email is already taken.",
    "Сначала подтверди почту кодом из письма.": "Confirm your email with the code first.",
    "Код подтверждения истёк. Запроси новый.": "The verification code has expired. Request a new one.",
    "Не удалось завершить регистрацию.": "Could not finish registration.",
    "Пароль должен быть минимум 8 символов.": "Password must be at least 8 characters.",
    "Имя должно быть минимум 3 символа.": "Name must be at least 3 characters.",
    "Не удалось отправить сообщение. Попробуй ещё раз.": "Could not send the message. Try again.",
    "Напиши сообщение или прикрепи файл.": "Write a message or attach a file.",
    "Этот пользователь отключил входящие сообщения.": "This user has disabled incoming messages.",
    "Этот пользователь ограничил тебе сообщения.": "This user has restricted messages from you.",
    "Ты отключил сообщения для этого пользователя.": "You disabled messages for this user.",
    "Не удалось открыть диалог.": "Could not open the conversation.",
    "Добавь название опена.": "Add an open title.",
    "Не удалось опубликовать опен.": "Could not publish the open.",
    "Не удалось загрузить файлы для опена. Проверь размер и формат.": "Could not upload open files. Check size and format.",
    "Не удалось отправить заявку.": "Could not send the application.",
    "Не удалось выбрать участника.": "Could not choose participant.",
    "Не удалось удалить опен.": "Could not delete the open.",
    "Ты уже отправил заявку в этот опен.": "You have already applied to this open.",
    "Опен не найден.": "Open not found.",
    "Некорректные данные. Проверь заполненные поля.": "Invalid data. Check the filled fields.",
    "Не удалось сохранить изменения.": "Could not save changes.",
    "Не удалось отправить трек.": "Could not submit the track.",
    "Очередь сейчас закрыта или на паузе.": "The queue is closed or paused right now.",
    "Этот трек уже добавлен в очередь.": "This track is already in the queue.",
    "Трек из профиля не найден.": "Profile track not found.",
    "Не удалось сохранить оценку трека.": "Could not save track rating.",
    "Не удалось загрузить твою прошлую оценку.": "Could not load your previous rating.",
    "Нельзя оценивать свой трек.": "You cannot rate your own track.",
    "Нельзя ставить оценку своему треку.": "You cannot rate your own track.",
    "Не удалось загрузить трек. Проверь файл и попробуй ещё раз.": "Could not upload the track. Check the file and try again.",
    "Не удалось загрузить изображение. Проверь файл и попробуй ещё раз.": "Could not upload the image. Check the file and try again.",
    "Не удалось загрузить медиафайл. Проверь файл и попробуй ещё раз.": "Could not upload the media file. Check the file and try again.",
    "Не удалось загрузить аватар.": "Could not upload avatar.",
    "Сначала выбери файл.": "Choose a file first.",
    "Неверный пароль.": "Wrong password.",
    "Неверный код. Проверь письмо и попробуй ещё раз.": "Wrong code. Check the email and try again.",
    "Нужно войти в аккаунт.": "You need to log in.",
    "Сессия устарела. Войди в аккаунт заново.": "Your session has expired. Log in again.",
    "Пользователь не найден.": "User not found.",
    "Трек не найден.": "Track not found.",
    "Публикация не найдена.": "Post not found.",
    "Комментарий не найден.": "Comment not found.",
    "Не удалось отправить код подтверждения.": "Could not send verification code.",
    "Не удалось удалить аккаунт.": "Could not delete account.",
    "Один из параметров передан в неверном формате. Обнови страницу и попробуй ещё раз.": "One of the parameters has an invalid format. Refresh the page and try again.",
    "Вы уже оценили (обновить)": "Already rated (update)",
    "Нельзя оценить свой трек": "You cannot rate your own track",
    "Ошибка оценки": "Rating failed",
    "Ошибка загрузки трека": "Track loading failed",
    "неизвестная ошибка": "unknown error",
    "Комментариев пока нет.": "No comments yet.",
    "Не удалось загрузить комментарии.": "Could not load comments.",
    "Комментарии для этого трека пока недоступны.": "Comments are not available for this track yet.",
    "Нет оценок": "No ratings",
    "В профиле пока нет треков для отправки на оценку.": "There are no profile tracks to submit for rating yet.",
    "Уже в очереди": "Already in queue",
    "Выбрано": "Selected",
    "Выбрать": "Choose",
    "Очередь закрыта": "Queue is closed",
    "Очередь временно приостановлена": "Queue is temporarily paused",
    "Отправка сейчас недоступна": "Submitting is unavailable right now",
    "Для очереди можно загрузить файл до 20 МБ": "Queue uploads are limited to 20 MB",
    "Вставь ссылку SoundCloud": "Paste a SoundCloud link",
    "Подтягиваю данные...": "Fetching data...",
    "Не удалось подтянуть данные из SoundCloud": "Could not fetch data from SoundCloud",
    "Данные подтянуты": "Data fetched",
    "Отправка...": "Submitting...",
    "Не удалось отправить трек из профиля": "Could not submit profile track",
    "Трек из профиля отправлен в очередь": "Profile track sent to queue",
    "Загрузите песню или вставьте ссылку SoundCloud": "Upload a song or paste a SoundCloud link",
    "Заполни автора и название": "Fill in artist and title",
    "Трек успешно отправлен": "Track submitted successfully",
    "Без текста": "No text",
    "Неизвестный артист": "Unknown artist",
    "Слушать": "Listen",
    "Обновление": "Update",
    "Без заголовка": "Untitled",
    "На паузе": "Paused",
    "Пульс платформы": "Platform pulse",
    "Музыка, движение и азарт в одном потоке.": "Music, motion, and energy in one flow.",
    "Следи за стримом, лови еженедельный челлендж и возвращайся в момент, когда очередь снова взорвётся новыми именами.": "Follow the stream, catch the weekly challenge, and come back when the queue lights up with new names.",
    "Обновляем таймер...": "Updating timer...",
    "Неделя уже в движении": "The week is already moving",
    "Челлендж недели": "Weekly challenge",
    "Поймай свой импульс": "Catch your impulse",
    "Возвращайся чаще, чтобы держать темп и не выпадать из движухи.": "Come back more often to keep the pace and stay in the movement.",
    "Фокус недели": "Weekly focus",
    "Для тебя": "For you",
    "Войди в аккаунт, чтобы лента стала личной.": "Log in to make the feed personal.",
    "Здесь появятся твой прогресс, streak, свежие уведомления и быстрые поводы вернуться в очередь.": "Your progress, streak, fresh notifications, and quick reasons to return to the queue will appear here.",
    "Твой прогресс": "Your progress",
    "Твой ранг": "Your rank",
    "XP сейчас": "Current XP",
    "Ты уже на максимальном ранге. Самое время удерживать статус и собирать достижения.": "You are already at max rank. Time to hold status and collect achievements.",
    "Серия": "Streak",
    "Возвращайся каждый день, чтобы серия не обнулилась и прогресс не остыл.": "Come back every day so the streak does not reset and progress stays warm.",
    "Оценки, посты, репосты и загрузки двигают тебя вверх быстрее всего.": "Ratings, posts, reposts, and uploads move you up the fastest.",
    "Сигналы для тебя": "Signals for you",
    "Новое событие в твоём профиле.": "New event in your profile.",
    "Пока тихо": "Quiet for now",
    "Как только тебя оценят, упомянут или заметят, всё появится здесь.": "When someone rates, mentions, or notices you, it will appear here.",
    "Открыть настройки": "Open settings",
    "Быстрый вход": "Quick entry",
    "Есть трек, который ждёт твою оценку": "There is a track waiting for your rating",
    "Очередь скоро заполнится": "The queue will fill up soon",
    "Открыть трек": "Open track",
    "Перейти в очередь": "Go to queue",
    "Новое движение": "New movement",
    "Активность": "Activity",
    "Идёт финальная витрина": "Final showcase is live",
    "Пауза в эфире": "Stream is paused",
    "Стрим в движении": "Stream is moving",
    "Пока нет треков для витрины.": "No showcase tracks yet.",
    "Судейская оценка": "Judge rating",
    "Общая оценка": "Overall rating",
    "Пользовательская оценка": "User rating",
    "Подборка треков скоро появится.": "Track selection will appear soon.",
    "Может зайти": "You may like this",
    "Загружаем": "Loading",
    "Постовой модуль ещё не загрузился.": "Post module has not loaded yet.",
    "Артисты скоро появятся.": "Artists will appear soon.",
    "Повторить": "Retry",
    "Пока никто не откликнулся": "No responses yet",
    "Выбран": "Chosen",
    "Без сообщения": "No message",
    "Воспроизвести": "Play",
    "Выключить звук": "Mute",
    "Включить звук": "Unmute",
    "Опен": "Open",
    "Участник уже выбран": "Participant already chosen",
    "Открыт для заявок": "Open for applications",
    "Без описания": "No description",
    "Удалить опен": "Delete open",
    "Напиши, почему именно ты залетишь сюда лучше всех": "Write why you are the best fit here",
    "Предложить кандидатуру": "Apply",
    "Пока опенов нет": "No opens yet",
    "Ты уже оставил заявку": "You have already applied",
    "Твой опен": "Your open",
    "Опен опубликован": "Open published",
    "Фото": "Photo",
    "Видео": "Video",
    "Диалог пуст": "Conversation is empty",
    "Отправка": "Sending",
    "Сообщений пока нет": "No messages yet",
    "Сообщения от этого пользователя отключены": "Messages from this user are disabled",
    "Ответ": "Reply",
    "Пересылка": "Forward",
    "Файл": "File",
    "Текущее фото группы": "Current group photo",
    "Создать группу": "Create group",
    "Можно закрепить максимум 5 чатов.": "You can pin up to 5 chats.",
    "Не удалось обновить закреп.": "Could not update pin.",
    "Пока без описания": "No description yet",
    "Участников": "Members",
    "Сообщений": "Messages",
    "Создан": "Created",
    "Приглашать участников в эту группу может только владелец.": "Only the owner can invite members to this group.",
    "Редактировать группу": "Edit group",
    "Введи название.": "Enter a name.",
    "Введи @username для приглашения.": "Enter @username to invite.",
    "Этот человек уже в группе.": "This person is already in the group.",
    "Приглашение уже отправлено.": "Invitation already sent.",
    "Не удалось отправить приглашение.": "Could not send invitation.",
    "Приглашение отправлено.": "Invitation sent.",
    "Удалить группу": "Delete group",
    "Это действие удалит чат и все сообщения без возможности восстановления.": "This will permanently delete the chat and all messages.",
    "Не удалось удалить чат": "Could not delete chat",
    "Ты перестанешь видеть новые сообщения этой группы.": "You will stop seeing new messages from this group.",
    "Не удалось выйти из группы": "Could not leave group",
    "Диалогов пока нет": "No conversations yet",
    "Приглашение в группу": "Group invitation",
    "Отклонить": "Decline",
    "Управление": "Manage",
    "Открепить": "Unpin",
    "Включить сообщения": "Enable messages",
    "Отключить сообщения": "Disable messages",
    "Не удалось удалить сообщение": "Could not delete message",
    "Не удалось обновить настройки диалога": "Could not update conversation settings",
    "Некуда пересылать, пока есть только этот диалог": "There is nowhere to forward while this is your only conversation",
    "Не удалось переслать сообщение": "Could not forward message",
    "Скачать файл": "Download file",
    "Участники": "Members",
    "Не удалось загрузить участников.": "Could not load members.",
    "В группе пока нет участников.": "There are no members in the group yet.",
    "Пользователь": "User",
    "владелец": "owner",
    "Скачать": "Download",
    "Недавно": "Recently",
    "Сегодня": "Today",
    "Вчера": "Yesterday",
    "Системный": "System",
    "Публичный": "Public",
    "Приватный": "Private",
    "Дата добавления": "Date added",
    "Длительность": "Duration",
    "Дополнительное действие": "More action",
    "Без названия": "Untitled",
    "У тебя пока нет плейлистов": "You do not have any playlists yet",
    "Создай первый и добавляй любимые треки": "Create the first one and add favorite tracks",
    "Загружаем публичные плейлисты": "Loading public playlists",
    "Собираем подборки пользователей": "Collecting user selections",
    "Попробуй другое название публичного плейлиста": "Try another public playlist name",
    "Попробуй другое название среди своих плейлистов": "Try another name among your playlists",
    "Настройки плейлиста": "Playlist settings",
    "Системный плейлист": "System playlist",
    "Сделать приватным": "Make private",
    "Сделать публичным": "Make public",
    "Изменить название": "Rename",
    "Изменить обложку": "Change cover",
    "Удалить": "Delete",
    "Удалить трек": "Delete track",
    "Слушать плейлист": "Listen to playlist",
    "от": "by",
    "Регистрация": "Sign up",
    "Вход": "Log in",
    "Смена пароля": "Change password",
    "Установка пароля": "Set password",
    "Повторите пароль": "Repeat password",
    "Сменить пароль": "Change password",
    "Установить пароль": "Set password",
    "У этого аккаунта пока нет пароля. Задай его один раз, и потом сможешь входить не только через Telegram.": "This account does not have a password yet. Set it once, then you can log in without Telegram too.",
    "Смена почты": "Change email",
    "Текущая почта:": "Current email:",
    "не привязана": "not connected",
    "Отправить код": "Send code",
    "Код": "Code",
    "Ошибка загрузки": "Loading failed",
    "Настройки сохранены.": "Settings saved.",
    "Настройки сохранены": "Settings saved",
    "Введи текущий пароль": "Enter current password",
    "Введи новый пароль": "Enter a new password",
    "Новый пароль должен быть минимум 8 символов": "New password must be at least 8 characters",
    "Неверный текущий пароль": "Wrong current password",
    "У этого аккаунта пока нет пароля. Сначала установи его.": "This account has no password yet. Set one first.",
    "Ошибка смены пароля": "Password change failed",
    "Введи новую почту": "Enter a new email",
    "Неверный формат почты": "Invalid email format",
    "Код отправлен на почту": "Code sent to email",
    "Профиль сохранён": "Profile saved"
    ,
    "Включить": "Play",
    "Убрать из очереди": "Remove from queue",
    "Недавно слушали": "Recently played",
    "История появится после прослушивания нескольких треков.": "History will appear after you listen to a few tracks.",
    "Пока ничего не играет.": "Nothing is playing yet.",
    "Добавь треки через меню, и они появятся здесь.": "Add tracks through the menu and they will appear here.",
    "Очистить": "Clear",
    "Система плейлистов не загружена": "Playlist system is not loaded",
    "Других плейлистов пока нет": "No other playlists yet"
  };

  function normalizeLanguage(language) {
    return SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
  }

  function getInitialLanguage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeLanguage(saved);
    const browserLanguage = String(navigator.language || "").slice(0, 2).toLowerCase();
    return normalizeLanguage(browserLanguage);
  }

  let currentLanguage = getInitialLanguage();

  function t(key, fallback = "") {
    return dictionaries[currentLanguage]?.[key] || dictionaries[DEFAULT_LANGUAGE]?.[key] || fallback || key;
  }

  function translateElement(element) {
    const textKey = element.dataset.i18n;
    const placeholderKey = element.dataset.i18nPlaceholder;
    const ariaKey = element.dataset.i18nAriaLabel;
    const titleKey = element.dataset.i18nTitle;
    const altKey = element.dataset.i18nAlt;
    const phrase = element.dataset.i18nPhrase;
    const placeholderPhrase = element.dataset.i18nPlaceholderPhrase;
    const titlePhrase = element.dataset.i18nTitlePhrase;
    const ariaPhrase = element.dataset.i18nAriaPhrase;

    if (textKey) element.textContent = t(textKey, element.textContent);
    if (placeholderKey) element.setAttribute("placeholder", t(placeholderKey, element.getAttribute("placeholder") || ""));
    if (ariaKey) element.setAttribute("aria-label", t(ariaKey, element.getAttribute("aria-label") || ""));
    if (titleKey) element.setAttribute("title", t(titleKey, element.getAttribute("title") || ""));
    if (altKey) element.setAttribute("alt", t(altKey, element.getAttribute("alt") || ""));
    if (phrase) element.textContent = currentLanguage === DEFAULT_LANGUAGE ? phrase : translatePhrase(phrase);
    if (placeholderPhrase) element.setAttribute("placeholder", currentLanguage === DEFAULT_LANGUAGE ? placeholderPhrase : translatePhrase(placeholderPhrase));
    if (titlePhrase) element.setAttribute("title", currentLanguage === DEFAULT_LANGUAGE ? titlePhrase : translatePhrase(titlePhrase));
    if (ariaPhrase) element.setAttribute("aria-label", currentLanguage === DEFAULT_LANGUAGE ? ariaPhrase : translatePhrase(ariaPhrase));
  }

  function translatePhrase(value) {
    const cleanValue = String(value || "").trim();
    if (!cleanValue) return value;
    if (currentLanguage === "en") {
      const dynamicPatterns = [
        [/^(\d+)\s+треков$/i, "$1 tracks"],
        [/^(\d+)\s+откликов$/i, "$1 responses"],
        [/^(\d+)\s+участников$/i, "$1 members"],
        [/^Доступно\s+(\d+)$/i, "$1 available"],
        [/^(\d+)\s+дн\.\s+назад$/i, "$1 days ago"],
        [/^(\d+)\s+мин\s+назад$/i, "$1 min ago"],
        [/^(\d+)\s+ч\s+назад$/i, "$1 h ago"],
        [/^(\d+)\s+д\s+назад$/i, "$1 d ago"],
        [/^(\d+)\s+дн\.$/i, "$1 days"],
        [/^(\d+)\s+действий за неделю$/i, "$1 actions this week"],
        [/^(\d+)\s+непрочитанных уведомлений$/i, "$1 unread notifications"],
        [/^До следующего ранга осталось\s+(\d+)\s+XP\.$/i, "$1 XP to the next rank."],
        [/^Ты в игре уже\s+(\d+)\s+дн\.$/i, "You have been in the game for $1 days."],
        [/^Очередь:\s*(.+)$/i, "Queue: $1"]
      ];
      for (const [pattern, replacement] of dynamicPatterns) {
        if (pattern.test(cleanValue)) {
          return cleanValue.replace(pattern, replacement);
        }
      }
    }
    return phraseTranslations[cleanValue] || value;
  }

  function rememberAttrOriginal(element, attr, value) {
    let originalAttrs = attrOriginals.get(element);
    if (!originalAttrs) {
      originalAttrs = {};
      attrOriginals.set(element, originalAttrs);
    }
    if (typeof originalAttrs[attr] === "undefined") {
      originalAttrs[attr] = value;
    }
    return originalAttrs[attr];
  }

  function translateTextNode(node) {
    let original = textNodeOriginals.get(node) || node.nodeValue;
    const translatedOriginal = translatePhrase(original);
    const currentValue = node.nodeValue;

    if (
      textNodeOriginals.has(node) &&
      currentLanguage !== DEFAULT_LANGUAGE &&
      currentValue !== translatedOriginal &&
      /[А-Яа-яЁё]/.test(String(currentValue || ""))
    ) {
      original = currentValue;
      textNodeOriginals.set(node, original);
    }

    if (!textNodeOriginals.has(node)) {
      textNodeOriginals.set(node, original);
    }

    if (currentLanguage === DEFAULT_LANGUAGE) {
      node.nodeValue = original;
      return;
    }

    const translated = translatePhrase(original);
    if (translated === original) return;

    const prefix = String(original).match(/^\s*/)?.[0] || "";
    const suffix = String(original).match(/\s*$/)?.[0] || "";
    node.nodeValue = `${prefix}${translated}${suffix}`;
  }

  function translatePlainAttribute(element, attr) {
    if (!element.hasAttribute(attr)) return;
    const original = rememberAttrOriginal(element, attr, element.getAttribute(attr));

    if (currentLanguage === DEFAULT_LANGUAGE) {
      element.setAttribute(attr, original);
      return;
    }

    element.setAttribute(attr, translatePhrase(original));
  }

  function autoTranslateTree(root = document) {
    const walkerRoot = root.nodeType === Node.TEXT_NODE ? root.parentElement : root;
    if (!walkerRoot) return;

    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root);
      return;
    }

    const textWalker = document.createTreeWalker(walkerRoot, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest("script, style, textarea, input, [data-i18n-skip], [data-i18n], [data-i18n-placeholder], [data-i18n-aria-label], [data-i18n-title], [data-i18n-alt]")) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!String(node.nodeValue || "").trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (textWalker.nextNode()) {
      translateTextNode(textWalker.currentNode);
    }

    const attrTargets = walkerRoot.querySelectorAll?.("input, textarea, button, a, img, [title], [aria-label], [placeholder]") || [];
    attrTargets.forEach((element) => {
      if (element.closest?.("[data-i18n-skip]")) return;
      if (
        element.hasAttribute("data-i18n-placeholder") ||
        element.hasAttribute("data-i18n-aria-label") ||
        element.hasAttribute("data-i18n-title") ||
        element.hasAttribute("data-i18n-alt")
      ) {
        return;
      }
      ["placeholder", "title", "aria-label", "alt"].forEach((attr) => {
        translatePlainAttribute(element, attr);
      });
    });
  }

  function applyI18n(root = document) {
    document.documentElement.lang = currentLanguage;
    document.documentElement.dataset.language = currentLanguage;

    root.querySelectorAll("[data-i18n], [data-i18n-placeholder], [data-i18n-aria-label], [data-i18n-title], [data-i18n-alt], [data-i18n-phrase], [data-i18n-placeholder-phrase], [data-i18n-title-phrase], [data-i18n-aria-phrase]").forEach(translateElement);
    root.querySelectorAll("[data-language-option]").forEach((button) => {
      const isActive = button.dataset.languageOption === currentLanguage;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    window.dispatchEvent(new CustomEvent("ritmoria:language-applied", {
      detail: { language: currentLanguage }
    }));
  }

  function setLanguage(language) {
    const nextLanguage = normalizeLanguage(language);
    if (nextLanguage === currentLanguage) {
      applyI18n(document);
      return;
    }
    currentLanguage = nextLanguage;
    localStorage.setItem(STORAGE_KEY, currentLanguage);
    applyI18n(document);
    window.dispatchEvent(new CustomEvent("ritmoria:language-change", {
      detail: { language: currentLanguage }
    }));
  }

  function initLanguageSwitcher(root = document) {
    root.querySelectorAll("[data-language-option]").forEach((button) => {
      if (button.dataset.languageInitialized === "true") return;
      button.dataset.languageInitialized = "true";
      button.addEventListener("click", () => setLanguage(button.dataset.languageOption));
    });
  }

  const nativeAlert = window.alert?.bind(window);
  const nativeConfirm = window.confirm?.bind(window);
  const nativePrompt = window.prompt?.bind(window);

  if (nativeAlert && !window.__ritmoriaAlertI18nWrapped) {
    window.__ritmoriaAlertI18nWrapped = true;
    window.alert = (message) => nativeAlert(currentLanguage === DEFAULT_LANGUAGE ? message : translatePhrase(message));
  }

  if (nativeConfirm && !window.__ritmoriaConfirmI18nWrapped) {
    window.__ritmoriaConfirmI18nWrapped = true;
    window.confirm = (message) => nativeConfirm(currentLanguage === DEFAULT_LANGUAGE ? message : translatePhrase(message));
  }

  if (nativePrompt && !window.__ritmoriaPromptI18nWrapped) {
    window.__ritmoriaPromptI18nWrapped = true;
    window.prompt = (message, defaultValue) => nativePrompt(
      currentLanguage === DEFAULT_LANGUAGE ? message : translatePhrase(message),
      defaultValue
    );
  }

  window.RitmoriaI18n = {
    apply: applyI18n,
    initSwitchers: initLanguageSwitcher,
    setLanguage,
    getLanguage: () => currentLanguage,
    t,
    translatePhrase
  };

  applyI18n(document);
})();
