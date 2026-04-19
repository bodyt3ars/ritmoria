function homeEscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let homeQueueTimerInterval = null;
let homeQueueStateMeta = null;

function formatHomeCount(value) {
  return new Intl.NumberFormat("ru-RU").format(Math.max(0, Number(value || 0)));
}

function formatHomeElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days} д ${hours} ч`;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${Math.max(1, minutes)} мин`;
}

function formatHomeAbsoluteDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
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

function renderHomeMomentum(queueState, challenge) {
  const container = document.getElementById("homeMomentumHero");
  if (!container) return;

  const state = String(queueState?.state || "open");
  const stateLabel = queueState?.label || (state === "closed" ? "Закрыта" : state === "paused" ? "На паузе" : "Открыта");
  const changedAt = queueState?.changed_at || null;
  const challengeProgress = Math.max(0, Number(challenge?.progress || 0));
  const challengeGoal = Math.max(1, Number(challenge?.goal || 1));
  const challengePercent = Math.max(0, Math.min(100, Math.round((challengeProgress / challengeGoal) * 100)));

  homeQueueStateMeta = {
    state,
    label: stateLabel,
    changedAt
  };

  container.innerHTML = `
    <div class="home-momentum-shell">
      <div class="home-momentum-copy">
        <span class="home-momentum-kicker">
          <i class="fa-solid fa-wave-square"></i>
          Пульс платформы
        </span>
        <h2 class="home-momentum-title">Музыка, движение и азарт в одном потоке.</h2>
        <p class="home-momentum-text">
          Следи за стримом, лови еженедельный челлендж и возвращайся в момент, когда очередь снова взорвётся новыми именами.
        </p>

        <div class="home-signal-strip">
          <span class="home-signal-pill is-${homeEscapeHtml(state)}">
            <i class="fa-solid fa-radio"></i>
            Очередь: <strong>${homeEscapeHtml(stateLabel)}</strong>
          </span>
          <span class="home-signal-pill">
            <i class="fa-solid fa-stopwatch"></i>
            <strong id="homeQueueTimerLabel">Обновляем таймер...</strong>
          </span>
          <span class="home-signal-pill">
            <i class="fa-solid fa-fire"></i>
            Неделя уже в движении
          </span>
        </div>
      </div>

      <div class="home-hero-side">
        <article class="home-challenge-card">
          <div class="home-challenge-top">
            <div>
              <div class="home-challenge-label">Челлендж недели</div>
              <h3 class="home-challenge-title">${homeEscapeHtml(challenge?.title || "Поймай свой импульс")}</h3>
            </div>
            <span class="home-challenge-icon">
              <i class="fa-solid ${homeEscapeHtml(challenge?.icon || "fa-bolt")}"></i>
            </span>
          </div>
          <p class="home-challenge-copy">${homeEscapeHtml(challenge?.description || "Возвращайся чаще, чтобы держать темп и не выпадать из движухи.")}</p>
          <div class="home-progress-meta">
            <span>${formatHomeCount(challengeProgress)} из ${formatHomeCount(challengeGoal)}</span>
            <strong>${challengePercent}%</strong>
          </div>
          <div class="home-progress-track">
            <span style="width:${challengePercent}%"></span>
          </div>
        </article>

        <article class="home-focus-card">
          <h3 class="home-focus-title">Фокус недели</h3>
          <p class="home-focus-text">${homeEscapeHtml(challenge?.focus || "Лучше всего удерживает тех, кто не просто слушает, а регулярно оценивает, выкладывает и следит за движением в очереди.")}</p>
        </article>
      </div>
    </div>
  `;

  updateHomeQueueTimer();
  startHomeQueueTimer();
}

function renderHomeForYou(forYou) {
  const container = document.getElementById("homeForYouGrid");
  if (!container) return;

  if (!forYou || !forYou.user) {
    container.innerHTML = `
      <article class="home-for-you-card">
        <span class="home-for-you-chip"><i class="fa-solid fa-door-open"></i>Для тебя</span>
        <h3 class="home-for-you-title">Войди в аккаунт, чтобы лента стала личной.</h3>
        <p class="home-for-you-text">Здесь появятся твой прогресс, streak, свежие уведомления и быстрые поводы вернуться в очередь.</p>
        <a class="home-for-you-action" href="/login" data-home-track-link>
          <i class="fa-solid fa-right-to-bracket"></i>
          Войти
        </a>
      </article>
    `;
    return;
  }

  const rankState = forYou.user.rank_state || {};
  const streakDays = Math.max(0, Number(forYou.streak_days || 0));
  const unreadCount = Math.max(0, Number(forYou.unread_notifications || 0));
  const tracksToRate = Array.isArray(forYou.tracks_to_rate) ? forYou.tracks_to_rate : [];
  const latestNotifications = Array.isArray(forYou.latest_notifications) ? forYou.latest_notifications.slice(0, 2) : [];
  const nextTrack = tracksToRate[0] || null;

  container.innerHTML = `
    <article class="home-for-you-card">
      <span class="home-for-you-chip"><i class="fa-solid fa-sparkles"></i>Твой прогресс</span>
      <h3 class="home-for-you-title">${homeEscapeHtml(rankState.rankName || "Твой ранг")}</h3>
      <div class="home-for-you-stat">
        <strong>${formatHomeCount(rankState.xp || 0)}</strong>
        <span>XP сейчас</span>
      </div>
      <p class="home-for-you-text">
        ${rankState.isMaxRank
          ? "Ты уже на максимальном ранге. Самое время удерживать статус и собирать достижения."
          : `До следующего ранга осталось ${formatHomeCount(rankState.xpForNextRank || 0)} XP.`}
      </p>
      <div class="home-progress-track">
        <span style="width:${Math.max(0, Math.min(100, Number(rankState.progress || 0)))}%"></span>
      </div>
    </article>

    <article class="home-for-you-card">
      <span class="home-for-you-chip"><i class="fa-solid fa-fire-flame-curved"></i>Серия</span>
      <h3 class="home-for-you-title">Ты в игре уже ${formatHomeCount(streakDays)} дн.</h3>
      <p class="home-for-you-text">${homeEscapeHtml(forYou.streak_hint || "Возвращайся каждый день, чтобы серия не обнулилась и прогресс не остыл.")}</p>
      <div class="home-for-you-list">
        <div class="home-notification-mini">
          <strong>${formatHomeCount(forYou.weekly_actions || 0)} действий за неделю</strong>
          <span>${homeEscapeHtml(forYou.weekly_actions_hint || "Оценки, посты, репосты и загрузки двигают тебя вверх быстрее всего.")}</span>
        </div>
      </div>
    </article>

    <article class="home-for-you-card">
      <span class="home-for-you-chip"><i class="fa-solid fa-bell"></i>Сигналы для тебя</span>
      <h3 class="home-for-you-title">${formatHomeCount(unreadCount)} непрочитанных уведомлений</h3>
      <div class="home-for-you-list">
        ${latestNotifications.length
          ? latestNotifications.map((item) => `
            <div class="home-notification-mini">
              <strong>${homeEscapeHtml(item.actor_username || item.actor_username_tag || "РИТМОРИЯ")}</strong>
              <span>${homeEscapeHtml(item.text || "Новое событие в твоём профиле.")}</span>
            </div>
          `).join("")
          : `<div class="home-notification-mini"><strong>Пока тихо</strong><span>Как только тебя оценят, упомянут или заметят, всё появится здесь.</span></div>`}
      </div>
      <a class="home-for-you-action" href="/settings" data-home-track-link>
        <i class="fa-solid fa-sliders"></i>
        Открыть настройки
      </a>
    </article>

    <article class="home-for-you-card">
      <span class="home-for-you-chip"><i class="fa-solid fa-headphones"></i>Быстрый вход</span>
      <h3 class="home-for-you-title">${nextTrack ? "Есть трек, который ждёт твою оценку" : "Очередь скоро заполнится"}</h3>
      <p class="home-for-you-text">
        ${nextTrack
          ? `${homeEscapeHtml(nextTrack.artist || nextTrack.username || "Артист")} — ${homeEscapeHtml(nextTrack.title || "Без названия")}`
          : "Как только появятся новые треки для оценки, этот блок сразу подкинет тебе лучший вход в движ."}
      </p>
      ${nextTrack
        ? `<a class="home-for-you-action" href="/track/${Number(nextTrack.id)}" data-home-track-link><i class="fa-solid fa-play"></i>Открыть трек</a>`
        : `<a class="home-for-you-action" href="/queue" data-home-track-link><i class="fa-solid fa-wave-square"></i>Перейти в очередь</a>`}
    </article>
  `;
}

function renderHomeActivity(items = []) {
  const container = document.getElementById("homeActivityList");
  const block = document.getElementById("homeActivityBlock");
  if (!container || !block) return;

  if (!Array.isArray(items) || !items.length) {
    block.style.display = "none";
    container.innerHTML = "";
    return;
  }

  block.style.removeProperty("display");
  container.innerHTML = items.map((item) => `
    <article class="home-activity-card">
      <img
        class="home-activity-avatar"
        src="${homeEscapeHtml(item.avatar || "/images/default-avatar.jpg")}"
        alt="${homeEscapeHtml(item.username || "user")}"
      >
      <div class="home-activity-body">
        <h3 class="home-activity-title">${homeEscapeHtml(item.title || "Новое движение")}</h3>
        <p class="home-activity-text">${homeEscapeHtml(item.text || "")}</p>
        <div class="home-activity-meta">
          <span class="home-activity-type">
            <i class="fa-solid ${homeEscapeHtml(item.icon || "fa-bolt")}"></i>
            ${homeEscapeHtml(item.type_label || "Активность")}
          </span>
          <span class="home-activity-time">${homeEscapeHtml(formatHomeRelativeDate(item.created_at))}</span>
        </div>
      </div>
      ${item.href ? `
        <a class="home-activity-link" href="${homeEscapeHtml(item.href)}" data-home-track-link>
          <i class="fa-solid fa-arrow-up-right-from-square"></i>
          Открыть
        </a>
      ` : ""}
    </article>
  `).join("");
}

function updateHomeQueueTimer() {
  const timer = document.getElementById("homeQueueTimerLabel");
  if (!timer) return;

  const state = homeQueueStateMeta?.state || "open";
  const stateLabel = homeQueueStateMeta?.label || "Открыта";
  const changedAt = homeQueueStateMeta?.changedAt ? new Date(homeQueueStateMeta.changedAt) : null;
  const validDate = changedAt && !Number.isNaN(changedAt.getTime()) ? changedAt : null;

  if (!validDate) {
    timer.textContent = state === "closed"
      ? "Идёт финальная витрина"
      : state === "paused"
        ? "Пауза в эфире"
        : "Стрим в движении";
    return;
  }

  const elapsed = formatHomeElapsed(Date.now() - validDate.getTime());
  timer.textContent = state === "closed"
    ? `Итоги держатся уже ${elapsed}`
    : state === "paused"
      ? `Пауза уже ${elapsed}`
      : `Открыта уже ${elapsed}`;
}

function startHomeQueueTimer() {
  if (homeQueueTimerInterval) {
    window.clearInterval(homeQueueTimerInterval);
  }

  updateHomeQueueTimer();
  homeQueueTimerInterval = window.setInterval(() => {
    if (!document.querySelector(".home-page")) {
      window.clearInterval(homeQueueTimerInterval);
      homeQueueTimerInterval = null;
      return;
    }
    updateHomeQueueTimer();
  }, 1000);
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
  renderHomeMomentum(data.queueState || null, data.weeklyChallenge || null);
  renderHomeForYou(data.forYou || null);
  renderHomeNews(data.news || []);
  renderHomeActivity(data.liveActivity || []);
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
      renderHomeMomentum(data.queueState || null, data.weeklyChallenge || null);
    } catch (err) {
      console.error("renderHomeMomentum error:", err);
    }

    try {
      renderHomeForYou(data.forYou || null);
    } catch (err) {
      console.error("renderHomeForYou error:", err);
    }

    try {
      renderHomeNews(data.news || []);
    } catch (err) {
      console.error("renderHomeNews error:", err);
    }

    try {
      renderHomeActivity(data.liveActivity || []);
    } catch (err) {
      console.error("renderHomeActivity error:", err);
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
    renderHomeMomentum(null, null);
    renderHomeForYou(null);
    renderHomeNews([]);
    renderHomeActivity([]);
    renderHomeTopTracks([]);
    renderHomeSpotlightTracks([]);
    renderHomePosts([]);
    renderHomeArtists([]);
  }
};
