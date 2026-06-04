(function () {
  const STORAGE_KEY = "ritmoria_theme";
  const DEFAULT_THEME = "rose";
  const THEMES = [
    {
      id: "rose",
      nameRu: "Розовая ночь",
      nameEn: "Rose night",
      descriptionRu: "Классический стиль Ритмории",
      descriptionEn: "Classic Ritmoria style",
      swatches: ["#f0b5cc", "#bd7196", "#07080c"]
    },
    {
      id: "ocean",
      nameRu: "Океан",
      nameEn: "Ocean",
      descriptionRu: "Холодный синий акцент",
      descriptionEn: "Cool blue accent",
      swatches: ["#7dd3fc", "#2563eb", "#06111d"]
    },
    {
      id: "mint",
      nameRu: "Мята",
      nameEn: "Mint",
      descriptionRu: "Зеленый неон без перегруза",
      descriptionEn: "Green neon without overload",
      swatches: ["#86efac", "#10b981", "#06130d"]
    },
    {
      id: "ember",
      nameRu: "Янтарь",
      nameEn: "Ember",
      descriptionRu: "Теплый концертный оттенок",
      descriptionEn: "Warm stage-light tone",
      swatches: ["#fbbf24", "#f97316", "#120b05"]
    },
    {
      id: "mono",
      nameRu: "Моно",
      nameEn: "Mono",
      descriptionRu: "Строгий черно-белый режим",
      descriptionEn: "Clean black-and-white mode",
      swatches: ["#f8fafc", "#94a3b8", "#07080c"]
    }
  ];

  function normalizeTheme(themeId) {
    return THEMES.some((theme) => theme.id === themeId) ? themeId : DEFAULT_THEME;
  }

  function getTheme() {
    try {
      return normalizeTheme(localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME);
    } catch {
      return DEFAULT_THEME;
    }
  }

  function applyTheme(themeId, { persist = true } = {}) {
    const safeTheme = normalizeTheme(themeId);
    document.documentElement.dataset.theme = safeTheme;

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      const colors = {
        rose: "#07080c",
        ocean: "#06111d",
        mint: "#06130d",
        ember: "#120b05",
        mono: "#07080c"
      };
      metaTheme.setAttribute("content", colors[safeTheme] || colors.rose);
    }

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, safeTheme);
      } catch {}
    }

    window.dispatchEvent(new CustomEvent("ritmoria:theme-changed", {
      detail: { theme: safeTheme }
    }));

    return safeTheme;
  }

  window.RitmoriaTheme = {
    themes: THEMES,
    getTheme,
    setTheme: applyTheme,
    defaultTheme: DEFAULT_THEME
  };

  applyTheme(getTheme(), { persist: false });
})();
