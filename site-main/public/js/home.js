function homeEscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatHomeRelativeDate(value) {
  if (!value) return "";

  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMinutes < 60) return `${diffMinutes} мин назад`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} дн назад`;

  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function formatHomeDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  if (!total) return "—";
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}

function formatHomePostSnippet(content) {
  const text = String(content || "").trim();
  if (!text) return "Без текста";
  return homeEscapeHtml(text.length > 150 ? `${text.slice(0, 147)}...` : text);
}

function formatHomeTrackArtists(track) {
  if (Array.isArray(track.artist_mentions) && track.artist_mentions.length) {
    return track.artist_mentions.map((item) => item.username || `@${item.username_tag}`).join(", ");
  }

  return String(track.artist || "").trim() || (track.username || "Неизвестный артист");
}

function renderHomeTrackArtistLinks(track) {
  const profileTag = String(track.username_tag || track.username || "").trim().replace(/^@+/, "");
  const profileLabel = homeEscapeHtml(track.username || track.username_tag || profileTag);

  if (Array.isArray(track.artist_mentions) && track.artist_mentions.length) {
    if (profileTag) {
      return `
        <span class="home-track-card-artist-link home-track-card-artist-linkable" data-home-artist-tag="${homeEscapeHtml(profileTag)}">
          ${profileLabel}
        </span>
      `;
    }
  }

  if (profileTag) {
    return `
      <span class="home-track-card-artist-link home-track-card-artist-linkable" data-home-artist-tag="${homeEscapeHtml(profileTag)}">
        ${profileLabel}
      </span>
    `;
  }

  return `<span class="home-track-card-artist-link">${homeEscapeHtml(formatHomeTrackArtists(track))}</span>`;
}

function normalizeHomePlayableTrack(track, context = "home") {
  if (!track) return null;

  const audioSrc = track.audioSrc
    || (track.audio ? `/${String(track.audio).replace(/^\/+/, "")}` : "");
  const soundcloud = String(track.soundcloud || "").trim();

  if (!audioSrc && !soundcloud) return null;

  return {
    id: Number(track.id) || 0,
    title: String(track.title || "Без названия"),
    artist: String(track.artist || formatHomeTrackArtists(track) || "Неизвестный артист"),
    artist_mentions: Array.isArray(track.artist_mentions) ? track.artist_mentions : [],
    cover: track.cover || "/images/default-cover.jpg",
    audioSrc,
    soundcloud,
    slug: String(track.slug || "").trim(),
    username_tag: String(track.username_tag || "").trim(),
    profile_source_tag: String(track.username_tag || "").trim(),
    play_context: context,
    duration: Number(track.duration || 0) || 0
  };
}

function isSameHomeTrack(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id && Number(a.id) === Number(b.id)) return true;
  if (a.audioSrc && b.audioSrc && a.audioSrc === b.audioSrc) return true;
  if (a.soundcloud && b.soundcloud && a.soundcloud === b.soundcloud) return true;
  return false;
}

function getHomeCurrentTrack() {
  return window.getGlobalPlayerState?.().track || null;
}

function getHomePlayIcon(isPlaying) {
  return `<i class="fa-solid fa-${isPlaying ? "pause" : "play"}"></i>`;
}

function buildHomePreviewButton(track, dataAttribute, className = "") {
  const playable = normalizeHomePlayableTrack(track);
  if (!playable) return "";

  const playerState = window.getGlobalPlayerState?.();
  const currentTrack = playerState?.track || null;
  const isPlaying = isSameHomeTrack(playable, currentTrack) && !!playerState?.isPlaying;
  const baseClass = dataAttribute === "data-home-spotlight-preview"
    ? "home-spotlight-play"
    : "home-track-preview-btn";
  const classes = [baseClass, className, isPlaying ? "is-playing" : ""]
    .filter(Boolean)
    .join(" ");

  return `
    <button
      type="button"
      class="${classes}"
      ${dataAttribute}="${homeEscapeHtml(JSON.stringify(playable))}"
      aria-label="${isPlaying ? "Пауза" : "Слушать"} ${homeEscapeHtml(playable.title)}"
      title="${isPlaying ? "Пауза" : "Слушать"}"
    >
      ${getHomePlayIcon(isPlaying)}
    </button>
  `;
}

function renderHomeNews(news = []) {
  const container = document.getElementById("homeNewsList");
  const block = document.getElementById("homeNewsBlock");
  if (!container || !block) return;

  if (!Array.isArray(news) || !news.length) {
    block.classList.add("home-news-empty");
    block.style.display = "none";
    container.innerHTML = "";
    return;
  }

  block.classList.remove("home-news-empty");
  block.style.removeProperty("display");
  container.innerHTML = news.map((item) => `
    <article class="home-news-card">
      <div class="home-news-top">
        <div class="home-news-label">Обновление</div>
        <div class="home-news-date">${formatHomeRelativeDate(item.created_at)}</div>
      </div>
      <h3 class="home-news-title">${homeEscapeHtml(item.title || "Без заголовка")}</h3>
      <p class="home-news-text">${homeEscapeHtml(item.content || "")}</p>
      ${item.media_url ? `
        <div class="home-news-media">
          ${item.media_type === "video"
            ? `<video src="${homeEscapeHtml(item.media_url)}" controls preload="metadata"></video>`
            : `<img src="${homeEscapeHtml(item.media_url)}" alt="${homeEscapeHtml(item.title || "news media")}">`}
        </div>
      ` : ""}
    </article>
  `).join("");
}

function renderHomeTopTracks(tracks = []) {
  const container = document.getElementById("homeTopTracks");
  if (!container) return;
  container.closest(".home-left-panel")?.style.removeProperty("display");

  if (!Array.isArray(tracks) || !tracks.length) {
    container.innerHTML = `<div class="home-loading-card">Пока нет треков для витрины.</div>`;
    return;
  }

  container.innerHTML = tracks.map((track, index) => `
    <article class="home-track-card" data-track-id="${Number(track.id)}">
      <div class="home-track-cover-shell">
        <button type="button" class="home-track-cover-btn" data-home-track-open="/track/${Number(track.id)}" aria-label="Открыть ${homeEscapeHtml(track.title || "трек")}">
          <img src="${homeEscapeHtml(track.cover || "/images/default-cover.jpg")}" alt="${homeEscapeHtml(track.title || "Track cover")}">
        </button>
        ${buildHomePreviewButton(track, "data-home-track-preview")}
      </div>

      <div class="home-track-card-body">
        <div class="home-track-rank">#${index + 1}</div>
        <a href="/track/${Number(track.id)}" class="home-track-card-title" data-home-track-link>
          ${homeEscapeHtml(track.title || "Без названия")}
        </a>
        <div class="home-track-card-artist">
          ${renderHomeTrackArtistLinks(track)}
        </div>

        <div class="home-track-card-stats">
          <span title="Судейская оценка">
            <i class="fa-solid fa-scale-balanced" title="Судейская оценка"></i>${Number(track.judge_score || 0).toFixed(1)}
          </span>
          <span title="Общая оценка">
            <i class="fa-solid fa-star" title="Общая оценка"></i>${Number(track.total_score || 0).toFixed(1)}
          </span>
          <span title="Пользовательская оценка">
            <i class="fa-solid fa-user-check" title="Пользовательская оценка"></i>${Number(track.user_score || 0).toFixed(1)}
          </span>
          <span>${formatHomeDuration(track.duration || 0)}</span>
        </div>
      </div>
    </article>
  `).join("");
}

function renderHomeSpotlightTracks(tracks = []) {
  const container = document.getElementById("homeSpotlightTracks");
  if (!container) return;
  const playerState = window.getGlobalPlayerState?.();
  const currentTrack = playerState?.track || null;
  const isPlayerPlaying = !!playerState?.isPlaying;

  if (!Array.isArray(tracks) || !tracks.length) {
    container.innerHTML = `<div class="home-loading-card">Подборка треков скоро появится.</div>`;
    return;
  }

  container.innerHTML = tracks.map((track) => `
    <article class="home-spotlight-item">
      <div
        class="home-spotlight-cover ${isSameHomeTrack(normalizeHomePlayableTrack(track), currentTrack) && isPlayerPlaying ? "is-playing" : ""}"
      >
        <button
          type="button"
          class="home-spotlight-cover-hit"
          data-home-spotlight-open="/${encodeURIComponent(track.username_tag || "")}/${encodeURIComponent(track.slug || "")}"
          aria-label="Открыть ${homeEscapeHtml(track.title || "трек")}"
        >
          <img src="${homeEscapeHtml(track.cover || "/images/default-cover.jpg")}" alt="${homeEscapeHtml(track.title || "Track cover")}">
          <span class="home-spotlight-glow" aria-hidden="true"></span>
        </button>
        ${buildHomePreviewButton(track, "data-home-spotlight-preview")}
      </div>
      <button
        type="button"
        class="home-spotlight-copy"
        data-home-spotlight-open="/${encodeURIComponent(track.username_tag || "")}/${encodeURIComponent(track.slug || "")}"
      >
        <span class="home-spotlight-title">${homeEscapeHtml(track.title || "Без названия")}</span>
        <span class="home-spotlight-artist">${homeEscapeHtml(track.username || track.username_tag || "Артист")}</span>
      </button>
    </article>
  `).join("");
}

function renderHomePosts(posts = []) {
  const container = document.getElementById("homeFeedPosts");
  if (!container) return;

  if (typeof window.setPostsRenderContext !== "function") {
    container.innerHTML = `<div class="home-loading-card">Постовой модуль ещё не загрузился.</div>`;
    return;
  }

  window.setPostsRenderContext({
    containerId: "homeFeedPosts",
    posts,
    isMyProfile: false
  });
}

function renderHomeArtists(artists = []) {
  const container = document.getElementById("homeTopArtists");
  if (!container) return;
  container.closest(".home-right-panel")?.style.removeProperty("display");

  if (!Array.isArray(artists) || !artists.length) {
    container.innerHTML = `<div class="home-loading-card">Артисты скоро появятся.</div>`;
    return;
  }

  container.innerHTML = artists.map((artist, index) => `
    <a href="/${encodeURIComponent(artist.username_tag || "")}" class="home-artist-card" data-home-profile-link="${homeEscapeHtml(artist.username_tag || "")}">
      <div class="home-artist-left">
        <div class="home-artist-rank">#${index + 1}</div>
        <img src="${homeEscapeHtml(artist.avatar || "/images/default-avatar.jpg")}" alt="${homeEscapeHtml(artist.username || "Artist")}">

        <div class="home-artist-info">
          <span class="home-artist-name">${homeEscapeHtml(artist.username || "Артист")}</span>
          <span class="home-artist-meta"><i class="fa-solid fa-heart"></i>${Number(artist.total_likes || 0)} <span class="home-artist-meta-dot"></span> <i class="fa-solid fa-headphones"></i>${Number(artist.total_listens || 0)}</span>
        </div>
      </div>

      <div class="home-artist-status home-artist-status-online"></div>
    </a>
  `).join("");
}

function syncHomePlaybackUi() {
  const playerState = window.getGlobalPlayerState?.();
  const currentTrack = playerState?.track || null;
  const playerIsPlaying = !!playerState?.isPlaying;

  document.querySelectorAll("[data-home-track-preview], [data-home-spotlight-preview]").forEach((button) => {
    const raw = button.dataset.homeTrackPreview || button.dataset.homeSpotlightPreview;
    if (!raw) return;

    let track = null;
    try {
      track = JSON.parse(raw);
    } catch {
      track = null;
    }

    const isPlaying = !!track && isSameHomeTrack(track, currentTrack) && playerIsPlaying;
    button.classList.toggle("is-playing", isPlaying);
    button.innerHTML = getHomePlayIcon(isPlaying);
    button.setAttribute("title", isPlaying ? "Пауза" : "Слушать");
    button.setAttribute("aria-label", `${isPlaying ? "Пауза" : "Слушать"} ${track?.title || "трек"}`);

    const spotlightCover = button.closest(".home-spotlight-cover");
    spotlightCover?.classList.toggle("is-playing", isPlaying);
  });
}

function bindHomePreviewButtons(selector, datasetName) {
  document.querySelectorAll(selector).forEach((button) => {
    if (button.dataset.previewBound === "1") return;
    button.dataset.previewBound = "1";

    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      let track = null;
      try {
        track = JSON.parse(button.dataset[datasetName] || "null");
      } catch {
        track = null;
      }

      if (!track) return;

      const playerState = window.getGlobalPlayerState?.();
      const currentTrack = playerState?.track || null;
      const isCurrent = isSameHomeTrack(track, currentTrack);
      const isPlaying = !!playerState?.isPlaying;

      if (isCurrent && isPlaying) {
        const audio = document.getElementById("global-audio");
        if (playerState.mode === "audio" && audio) {
          audio.pause();
        } else if (typeof window.toggleGlobalPlayerPlayback === "function") {
          window.toggleGlobalPlayerPlayback();
        }
      } else if (isCurrent && !isPlaying) {
        if (typeof window.toggleGlobalPlayerPlayback === "function") {
          window.toggleGlobalPlayerPlayback();
        } else if (typeof window.playTrackGlobal === "function") {
          window.playTrackGlobal(track);
        }
      } else if (typeof window.playTrackGlobal === "function") {
        window.playTrackGlobal(track);
      }

      window.setTimeout(syncHomePlaybackUi, 40);
    });
  });
}

function bindHomeSpotlightCarousel() {
  const row = document.getElementById("homeSpotlightTracks");
  const prevBtn = document.getElementById("homeSpotlightPrev");
  const nextBtn = document.getElementById("homeSpotlightNext");

  if (!row || !prevBtn || !nextBtn) return;

  if (row.dataset.carouselBound !== "1") {
    row.dataset.carouselBound = "1";

    const updateArrows = () => {
      const maxScroll = Math.max(0, row.scrollWidth - row.clientWidth);
      prevBtn.disabled = row.scrollLeft <= 6;
      nextBtn.disabled = row.scrollLeft >= maxScroll - 6;
    };

    const scrollByPage = (direction) => {
      const firstItem = row.querySelector(".home-spotlight-item");
      const itemWidth = firstItem ? firstItem.getBoundingClientRect().width + 14 : 140;
      row.scrollBy({
        left: direction * itemWidth * 3,
        behavior: "smooth"
      });
      window.setTimeout(updateArrows, 260);
    };

    prevBtn.addEventListener("click", () => scrollByPage(-1));
    nextBtn.addEventListener("click", () => scrollByPage(1));
    row.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    row._updateHomeSpotlightArrows = updateArrows;
  }

  row._updateHomeSpotlightArrows?.();
}

function bindHomeInteractions(homeData) {
  if (typeof window.initPostUiBindings === "function") {
    window.initPostUiBindings();
  }

  document.querySelectorAll("[data-home-artist-tag]").forEach((el) => {
    if (el.dataset.artistBound === "1") return;
    el.dataset.artistBound = "1";

    const safeTag = String(el.dataset.homeArtistTag || "").trim().replace(/^@+/, "");
    const targetPath = safeTag ? `/${safeTag}` : "";

    el.onclick = null;
    if (!targetPath) return;

    el.onclick = (e) => {
      e.preventDefault?.();
      e.stopPropagation?.();
      if (typeof window.navigate === "function") {
        window.navigate(targetPath);
      } else {
        window.location.href = targetPath;
      }
    };
  });

  document.querySelectorAll("[data-home-profile-link]").forEach((link) => {
    if (link.dataset.spaBound === "1") return;
    link.dataset.spaBound = "1";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tag = link.dataset.homeProfileLink;
      if (tag) navigate(`/${tag}`);
    });
  });

  document.querySelectorAll("[data-home-track-link]").forEach((link) => {
    if (link.dataset.spaBound === "1") return;
    link.dataset.spaBound = "1";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const href = link.getAttribute("href");
      if (href) navigate(href);
    });
  });

  document.querySelectorAll("[data-home-track-open]").forEach((button) => {
    if (button.dataset.openBound === "1") return;
    button.dataset.openBound = "1";
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const href = button.dataset.homeTrackOpen;
      if (href) navigate(href);
    });
  });

  document.querySelectorAll("[data-home-spotlight-open]").forEach((button) => {
    if (button.dataset.openBound === "1") return;
    button.dataset.openBound = "1";
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const href = button.dataset.homeSpotlightOpen;
      if (href) navigate(href);
    });
  });

  bindHomePreviewButtons("[data-home-track-preview]", "homeTrackPreview");
  bindHomePreviewButtons("[data-home-spotlight-preview]", "homeSpotlightPreview");
  bindHomeSpotlightCarousel();
  syncHomePlaybackUi();

  if (!window.__homePlaybackUiBound) {
    window.__homePlaybackUiBound = true;
    [
      "ritmoria:global-player-track-change",
      "ritmoria:global-player-play",
      "ritmoria:global-player-pause",
      "ritmoria:global-player-stopped"
    ].forEach((eventName) => {
      window.addEventListener(eventName, () => {
        syncHomePlaybackUi();
      });
    });
  }
}

async function refreshHomeTracksOnly() {
  const root = document.querySelector(".home-page");
  if (!root) return;

  const data = await loadHomePageData();
  renderHomeNews(data.news || []);
  renderHomeTopTracks(data.topTracks || []);
  renderHomeSpotlightTracks(data.spotlightTracks || []);
  renderHomePosts(data.recommendedPosts || []);
  renderHomeArtists(data.topArtists || []);
  bindHomeInteractions({
    topTracks: Array.isArray(data.topTracks) ? data.topTracks : []
  });
}

function ensureHomeAutoRefresh() {
  const REFRESH_MS = 5 * 60 * 1000;

  if (window.__homeTrackRefreshTimeout) {
    window.clearTimeout(window.__homeTrackRefreshTimeout);
  }

  const scheduleNextRefresh = () => {
    window.__homeTrackRefreshTimeout = window.setTimeout(runRefresh, REFRESH_MS);
  };

  const runRefresh = async () => {
    if (!document.querySelector(".home-page")) {
      if (window.__homeTrackRefreshTimeout) {
        window.clearTimeout(window.__homeTrackRefreshTimeout);
      }
      window.__homeTrackRefreshTimeout = null;
      return;
    }

    try {
      await refreshHomeTracksOnly();
      window.__homeLastRefreshAt = Date.now();
    } catch (err) {
      console.error("home track refresh error:", err);
    }

    scheduleNextRefresh();
  };

  scheduleNextRefresh();

  if (!window.__homeVisibilityRefreshBound) {
    window.__homeVisibilityRefreshBound = true;

    const refreshOnReturn = async () => {
      if (!document.querySelector(".home-page")) return;

      const lastRefreshAt = Number(window.__homeLastRefreshAt || 0);
      if (Date.now() - lastRefreshAt < REFRESH_MS) return;

      try {
        await refreshHomeTracksOnly();
        window.__homeLastRefreshAt = Date.now();
      } catch (err) {
        console.error("home return refresh error:", err);
      }
    };

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        refreshOnReturn();
      }
    });

    window.addEventListener("focus", refreshOnReturn);
  }
}

async function loadHomePageData() {
  const headers = localStorage.getItem("token")
    ? { Authorization: `Bearer ${localStorage.getItem("token")}` }
    : {};

  const res = await fetch(`/api/home?_ts=${Date.now()}`, {
    cache: "no-store",
    headers
  });

  if (!res.ok) {
    throw new Error("home_data_failed");
  }

  return res.json();
}

window.initHomePage = async function initHomePage() {
  const root = document.querySelector(".home-page");
  if (!root) return;
  root.querySelector(".home-left-panel")?.style.removeProperty("display");
  root.querySelector(".home-right-panel")?.style.removeProperty("display");

  try {
    const data = await loadHomePageData();
    try {
      renderHomeNews(data.news || []);
    } catch (err) {
      console.error("renderHomeNews error:", err);
    }

    try {
      renderHomeTopTracks(data.topTracks || []);
    } catch (err) {
      console.error("renderHomeTopTracks error:", err);
    }

    try {
      renderHomeSpotlightTracks(data.spotlightTracks || []);
    } catch (err) {
      console.error("renderHomeSpotlightTracks error:", err);
    }

    try {
      renderHomePosts(data.recommendedPosts || []);
    } catch (err) {
      console.error("renderHomePosts error:", err);
    }

    try {
      renderHomeArtists(data.topArtists || []);
    } catch (err) {
      console.error("renderHomeArtists error:", err);
    }

    bindHomeInteractions({
      topTracks: Array.isArray(data.topTracks) ? data.topTracks : []
    });
    window.__homeLastRefreshAt = Date.now();
    ensureHomeAutoRefresh();
  } catch (err) {
    console.error("initHomePage error:", err);
    renderHomeNews([]);
    renderHomeTopTracks([]);
    renderHomeSpotlightTracks([]);
    renderHomePosts([]);
    renderHomeArtists([]);
  }
};
