(function () {
  const STORAGE_KEY = "ritmoria-language";
  const DEFAULT_LANGUAGE = "ru";
  const SUPPORTED_LANGUAGES = ["ru", "en"];

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
      "seo.defaultTitle": "Ritmoria — music platform for artists",
      "seo.defaultDescription": "Ritmoria is a music platform for artists, tracks, opens, streams, and community around new music.",
      "seo.keywords": "Ritmoria, music, tracks, artists, music platform, opens, streams, discover",
      "seo.siteName": "RITMORIA"
    }
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

    if (textKey) element.textContent = t(textKey, element.textContent);
    if (placeholderKey) element.setAttribute("placeholder", t(placeholderKey, element.getAttribute("placeholder") || ""));
    if (ariaKey) element.setAttribute("aria-label", t(ariaKey, element.getAttribute("aria-label") || ""));
    if (titleKey) element.setAttribute("title", t(titleKey, element.getAttribute("title") || ""));
  }

  function applyI18n(root = document) {
    document.documentElement.lang = currentLanguage;
    document.documentElement.dataset.language = currentLanguage;

    root.querySelectorAll("[data-i18n], [data-i18n-placeholder], [data-i18n-aria-label], [data-i18n-title]").forEach(translateElement);
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

  window.RitmoriaI18n = {
    apply: applyI18n,
    initSwitchers: initLanguageSwitcher,
    setLanguage,
    getLanguage: () => currentLanguage,
    t
  };

  applyI18n(document);
})();
