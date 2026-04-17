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

function openHomeProfile(event, tag) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  const safeTag = String(tag || "").trim().replace(/^@+/, "");
  if (!safeTag) return;

  navigate(`/${safeTag}`);
}

function renderHomeTrackArtistLinks(track) {
  const profileTag = String(track.username_tag || track.username || "").trim().replace(/^@+/, "");

  if (Array.isArray(track.artist_mentions) && track.artist_mentions.length) {
    if (profileTag) {
      return `
        <button type="button" class="home-track-card-artist-link" onclick="openHomeProfile(event, '${homeEscapeHtml(profileTag)}')">
          ${homeEscapeHtml(track.username || track.username_tag || profileTag)}
        </button>
      `;
    }
  }

  if (profileTag) {
    return `
      <button type="button" class="home-track-card-artist-link" onclick="openHomeProfile(event, '${homeEscapeHtml(profileTag)}')">
        ${homeEscapeHtml(track.username || track.username_tag || profileTag)}
      </button>
    `;
  }

  return `<span class="home-track-card-artist-link">${homeEscapeHtml(formatHomeTrackArtists(track))}</span>`;
}

window.openHomeProfile = openHomeProfile;

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
      <button type="button" class="home-track-cover-btn" data-home-track-open="/track/${Number(track.id)}" aria-label="Открыть ${homeEscapeHtml(track.title || "трек")}">
        <img src="${homeEscapeHtml(track.cover || "/images/default-cover.jpg")}" alt="${homeEscapeHtml(track.title || "Track cover")}">
      </button>

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

function bindHomeInteractions(homeData) {
  if (typeof window.initPostUiBindings === "function") {
    window.initPostUiBindings();
  }

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
}

async function loadHomePageData() {
  const res = await fetch("/api/home", {
    headers: localStorage.getItem("token")
      ? { Authorization: `Bearer ${localStorage.getItem("token")}` }
      : {}
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
  } catch (err) {
    console.error("initHomePage error:", err);
    renderHomeNews([]);
    renderHomeTopTracks([]);
    renderHomePosts([]);
    renderHomeArtists([]);
  }
};
