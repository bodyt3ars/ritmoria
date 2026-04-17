window.currentUser = window.currentUser || {};

function canModerateProfileTracks() {
  return !window.currentProfileIsMine && String(window.currentViewer?.role || "").toLowerCase() === "admin";
}

let currentTags = [];

let trackListenState = {
  trackId: null,
  sessionId: 0,
  counted: false,
  threshold: 0,
  audioBound: false,
  listenedSeconds: 0,
  lastTime: 0,
  seekBlocked: false,
  wasPlaying: false,
  pendingRequest: false
};

function resetTrackListenState(trackId = null, currentTime = 0) {
  trackListenState.trackId = trackId;
  trackListenState.sessionId = 0;
  trackListenState.counted = false;
  trackListenState.threshold = 0;
  trackListenState.listenedSeconds = 0;
  trackListenState.lastTime = currentTime;
  trackListenState.seekBlocked = false;
  trackListenState.wasPlaying = false;
  trackListenState.pendingRequest = false;
}

function beginTrackListenSession(trackId, audio) {
  trackListenState.trackId = trackId;
  trackListenState.sessionId += 1;
  trackListenState.counted = false;
  trackListenState.listenedSeconds = 0;
  trackListenState.lastTime = audio?.currentTime || 0;
  trackListenState.seekBlocked = false;
  trackListenState.wasPlaying = !!audio && !audio.paused;
  trackListenState.pendingRequest = false;

  if (audio?.duration && isFinite(audio.duration)) {
    trackListenState.threshold = Math.min(30, audio.duration * 0.5);
  } else {
    trackListenState.threshold = 0;
  }
}

async function initTracks() {
  const container = document.getElementById("tracksContainer");
  if (!container) return;

  if (container.dataset.tracksInitialized === "true") return;
  container.dataset.tracksInitialized = "true";

  await loadCurrentUserForTracks();
setupGlobalTrackListenWatcher();

window.addEventListener("ritmoria:global-player-timeupdate", () => {
  syncProfileTrackCardsWithGlobalPlayer();
});

window.addEventListener("ritmoria:global-player-play", () => {
  syncProfileTrackCardsWithGlobalPlayer();
});

window.addEventListener("ritmoria:global-player-pause", () => {
  syncProfileTrackCardsWithGlobalPlayer();
});

window.addEventListener("ritmoria:global-player-track-change", () => {
  setTimeout(() => {
    syncProfileTrackCardsWithGlobalPlayer();
  }, 50);
});

window.addEventListener("ritmoria:global-player-stopped", () => {
  syncProfileTrackCardsWithGlobalPlayer();
});

window.addEventListener("ritmoria:track-like-updated", (e) => {
  const trackId = Number(e.detail?.trackId);
  if (!trackId) return;

  applyTrackLikeState(trackId, !!e.detail?.liked, e.detail?.likesCount);
});

await loadTracks();
}

async function loadCurrentUserForTracks() {
  try {
    const res = await fetch("/me", {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (!res.ok) return;
    window.currentUser = await res.json();
  } catch (err) {
    console.error("loadCurrentUserForTracks error", err);
  }
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function applyTrackLikeState(trackId, liked, likesCount = null) {
  const numericTrackId = Number(trackId);
  if (!numericTrackId) return;

  document.querySelectorAll(`.like-btn[data-id="${numericTrackId}"]`).forEach((btn) => {
    const icon = btn.querySelector("i");
    const countEl = btn.querySelector(".like-count");

    btn.classList.toggle("liked", !!liked);

    if (icon) {
      icon.classList.toggle("fa-solid", !!liked);
      icon.classList.toggle("fa-regular", !liked);
    }

    if (countEl && likesCount !== null && likesCount !== undefined) {
      countEl.innerText = Math.max(0, Number(likesCount) || 0);
    }
  });

  if (Array.isArray(window.currentTracks)) {
    window.currentTracks = window.currentTracks.map((track) => {
      if (Number(track.id) !== numericTrackId) return track;

      return {
        ...track,
        liked: !!liked,
        likes_count: likesCount !== null && likesCount !== undefined
          ? Math.max(0, Number(likesCount) || 0)
          : Number(track.likes_count || 0)
      };
    });
  }
}

function escapeTrackHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTrackMentionMarkup(value) {
  if (typeof window.renderMentionMarkup === "function") {
    return window.renderMentionMarkup(value);
  }

  const source = String(value ?? "");
  const regex = /@([a-zA-Z0-9_]{2,50})/g;
  let lastIndex = 0;
  let html = "";
  let match;

  while ((match = regex.exec(source)) !== null) {
    html += escapeTrackHtml(source.slice(lastIndex, match.index));
    html += `<a href="/${encodeURIComponent(match[1])}" class="profile-mention-link">@${escapeTrackHtml(match[1])}</a>`;
    lastIndex = regex.lastIndex;
  }

  html += escapeTrackHtml(source.slice(lastIndex));
  return html;
}

function renderTrackArtistDisplay(track, { asHtml = false } = {}) {
  const artistValue = String(track?.artist || "Unknown");
  const mentions = Array.isArray(track?.artist_mentions) ? track.artist_mentions : [];

  if (!mentions.length) {
    return asHtml
      ? `<a href="/${encodeURIComponent(track?.username_tag || "")}" class="track-artist-link" onclick="goToTrackAuthorProfile(event, '${track?.username_tag || ""}')">${escapeTrackHtml(artistValue)}</a>`
      : artistValue;
  }

  const mentionMap = new Map(
    mentions.map((user) => [
      String(user.username_tag || "").toLowerCase(),
      user
    ])
  );

  const regex = /@([a-zA-Z0-9_]{2,50})/g;
  let lastIndex = 0;
  let html = "";
  let text = "";
  let match;

  while ((match = regex.exec(artistValue)) !== null) {
    const before = artistValue.slice(lastIndex, match.index);
    html += escapeTrackHtml(before);
    text += before;

    const tag = String(match[1] || "").toLowerCase();
    const mentionedUser = mentionMap.get(tag);

    if (mentionedUser) {
      const displayName = String(mentionedUser.username || mentionedUser.username_tag || match[1]);
      html += `<a href="/${encodeURIComponent(mentionedUser.username_tag)}" class="profile-mention-link" onclick="goToTrackAuthorProfile(event, '${escapeTrackHtml(mentionedUser.username_tag)}')">${escapeTrackHtml(displayName)}</a>`;
      text += displayName;
    } else {
      const rawMention = `@${match[1]}`;
      html += escapeTrackHtml(rawMention);
      text += rawMention;
    }

    lastIndex = regex.lastIndex;
  }

  const tail = artistValue.slice(lastIndex);
  html += escapeTrackHtml(tail);
  text += tail;

  return asHtml ? html : text;
}

function getAllKnownTracks() {
  return [
    ...(Array.isArray(window.currentTracks) ? window.currentTracks : []),
    ...(Array.isArray(window.currentRepostTracks) ? window.currentRepostTracks : []),
    ...(Array.isArray(window.currentMentionTracks) ? window.currentMentionTracks : [])
  ];
}

function hydrateTrackCards(root = document) {
  root.querySelectorAll(".like-btn").forEach((btn) => {
    const id = btn.dataset.id;
    if (!id || btn.dataset.likeBound === "true") return;

    btn.dataset.likeBound = "true";
    loadLikes(btn, id);

    btn.onclick = (e) => {
      e.stopPropagation();
      toggleLike(btn, id);
    };
  });
}

function renderTrack(track, options = {}) {
  const cover = track.cover
    ? (track.cover.startsWith("http") ? track.cover : "/" + track.cover.replace(/^\/+/, ""))
    : "/images/default-cover.jpg";

  const isMy = window.currentUser?.id === track.user_id;
  const isRepost = !!options.isRepost;
  const isMention = !!options.isMention;
  const isReposted = !!track.reposted;
  const showRepostButton = !window.currentProfileIsMine && !isMy;
  const canModerate = canModerateProfileTracks();
  const repostMeta = isRepost && track.reposted_at
    ? `
      <div class="track-repost-meta">
        <i class="fa-solid fa-retweet"></i>
        <span>${formatDate(track.reposted_at)}</span>
      </div>
    `
    : "";
  const mentionMeta = isMention && track.mentioned_at
    ? `
      <div class="track-mention-meta">
        <i class="fa-solid fa-at"></i>
        <span>${formatDate(track.mentioned_at)}</span>
      </div>
    `
    : "";
  const artistMarkup = renderTrackArtistDisplay(track, { asHtml: true });

  return `
    <div class="track-card" id="track-card-${track.id}" data-track-id="${track.id}">
      ${repostMeta}
      ${mentionMeta}
      <div class="track-cover-wrap">
        <img
          src="${cover}"
          class="track-cover"
          onclick="goToTrack(event, ${track.id})"
        >

        <button
          class="play-btn"
          type="button"
          onclick="playProfileTrack(event, ${track.id})"
        >
          <i class="fa-solid fa-play"></i>
        </button>
      </div>

      <div class="track-main">
        <div class="track-header">
          <div class="track-texts">
            <div class="track-title" onclick="goToTrack(event, ${track.id})">
              ${escapeTrackHtml(track.title || "Без названия")}
            </div>

            <div class="track-artist">
              ${artistMarkup}
            </div>
          </div>

          <div class="track-meta-right">
            <div class="track-meta-info">
              ${formatDate(track.created_at)}
              ${track.genre ? `<span class="genre-chip">#${escapeTrackHtml(track.genre)}</span>` : ""}
            </div>

            ${(isMy || canModerate) ? `
              <div class="track-menu">
                <button class="dots-btn" type="button">
                  <i class="fa-solid fa-ellipsis"></i>
                </button>

                <div class="dropdown profile-hidden">
                  ${isMy ? `
                    <div onclick="editTrack(${track.id})">
                      <i class="fa-solid fa-pen"></i>
                      <span>Редактировать</span>
                    </div>

                    <div onclick="pinTrack(${track.id})">
                      <i class="fa-solid fa-thumbtack"></i>
                      <span>Закрепить</span>
                    </div>

                    <div onclick="archiveTrack(${track.id})">
                      <i class="fa-solid fa-box-archive"></i>
                      <span>Архив</span>
                    </div>
                  ` : ""}

                  <div onclick="deleteTrack(${track.id})" class="danger">
                    <i class="fa-solid fa-trash"></i>
                    <span>Удалить</span>
                  </div>
                </div>
              </div>
            ` : ""}
          </div>
        </div>

        <div class="track-player">
          <div class="progress-bar" onclick="seekTrack(event, ${track.id})">
            <div class="progress-fill" id="progress-${track.id}"></div>
          </div>

          <div class="time-row">
            <span id="current-${track.id}">0:00</span>
            <span id="duration-${track.id}">0:00</span>
          </div>
        </div>

        <div class="track-actions">
          <button class="like-btn" data-id="${track.id}">
            <i class="fa-regular fa-heart"></i>
            <span class="like-count">0</span>
          </button>

          <button onclick="goToComments('${track.slug}', '${track.username_tag}')">
            <i class="fa-regular fa-comment"></i>
          </button>

          <button onclick="copyTrackLink('${track.slug}', '${track.username_tag}')">
            <i class="fa-solid fa-link"></i>
          </button>

          ${showRepostButton ? `
            <button class="track-repost-btn ${isReposted ? "active-repost" : ""}" onclick="toggleTrackRepost(event, ${track.id})" title="Репост">
              <i class="fa-solid fa-retweet"></i>
            </button>
          ` : ""}

          <button onclick="addProfileTrackToQueue(event, ${track.id})" title="Добавить в очередь">
            <i class="fa-solid fa-plus"></i>
          </button>

          <div class="track-stat-item">
            <i class="fa-solid fa-headphones"></i>
            <span id="track-listens-${track.id}">${Number(track.listens_count) || 0}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function loadTracks() {
  try {
    const params = new URLSearchParams(window.location.search);
    const tag = window.__profileTag || params.get("tag");

    let url = "/user-tracks";
    if (tag) url += "?tag=" + encodeURIComponent(tag);

    const res = await fetch(url, {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (!res.ok) {
      console.error("loadTracks bad response", res.status);
      return;
    }

    const tracks = await res.json();
    window.currentTracks = tracks.map((track) => ({
      ...track,
      reposted: !!track.reposted
    }));

    const container = document.getElementById("tracksContainer");
    if (!container) return;

    container.innerHTML = "";

    window.currentTracks.forEach((track) => {
      container.insertAdjacentHTML("beforeend", renderTrack(track));
    });

    hydrateTrackCards(container);

    syncProfileTrackCardsWithGlobalPlayer();
  } catch (err) {
    console.error("loadTracks error", err);
  }
}

async function registerTrackListen(trackId) {
  const token = localStorage.getItem("token");
  if (!token) return false;

  try {
    const res = await fetch(`/api/user-tracks/${trackId}/listen`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) return false;

    const data = await res.json();
    const countEl = document.getElementById(`track-listens-${trackId}`);

    if (countEl && typeof data.listens_count !== "undefined") {
      countEl.innerText = Number(data.listens_count) || 0;
    }

    return true;
  } catch (err) {
    console.error("registerTrackListen error", err);
    return false;
  }
}

function setupGlobalTrackListenWatcher() {
  if (trackListenState.audioBound) return;

  const globalAudio = document.getElementById("global-audio");
  if (!globalAudio) return;

  trackListenState.audioBound = true;

  globalAudio.addEventListener("play", () => {
    trackListenState.wasPlaying = true;
    trackListenState.lastTime = globalAudio.currentTime || 0;
  });

  globalAudio.addEventListener("pause", () => {
    trackListenState.wasPlaying = false;
  });

  globalAudio.addEventListener("loadedmetadata", () => {
    trackListenState.lastTime = globalAudio.currentTime || 0;

    if (globalAudio.duration && isFinite(globalAudio.duration)) {
      trackListenState.threshold = Math.min(30, globalAudio.duration * 0.5);
    }
  });

  window.addEventListener("ritmoria:global-player-seek", (e) => {
    if (!trackListenState.trackId) return;

    const audio = document.getElementById("global-audio");
    if (!audio) return;

    const newTime = Number(e.detail?.currentTime || 0);
    const previous = Number(trackListenState.lastTime || 0);

    // если ушли в самое начало — это НОВАЯ сессия
    if (newTime <= 1) {
      beginTrackListenSession(trackListenState.trackId, audio);
      trackListenState.lastTime = 0;
      return;
    }

    // если прыгнули вперёд — текущая сессия нечестная
    if (newTime > previous + 1.25) {
      trackListenState.seekBlocked = true;
    }

    trackListenState.lastTime = newTime;
  });

  globalAudio.addEventListener("timeupdate", async () => {
    if (!trackListenState.trackId) return;
    if (trackListenState.counted) return;
    if (trackListenState.pendingRequest) return;
    if (!trackListenState.wasPlaying) return;
    if (!globalAudio.duration || !isFinite(globalAudio.duration)) return;

    if (!trackListenState.threshold || !isFinite(trackListenState.threshold)) {
      trackListenState.threshold = Math.min(30, globalAudio.duration * 0.5);
    }

    const current = globalAudio.currentTime || 0;
    const previous = trackListenState.lastTime || 0;
    const delta = current - previous;

    if (delta > 0 && delta <= 1.25 && !trackListenState.seekBlocked) {
      trackListenState.listenedSeconds += delta;
    }

    trackListenState.lastTime = current;

    if (
      !trackListenState.seekBlocked &&
      trackListenState.listenedSeconds >= trackListenState.threshold
    ) {
      const sessionAtRequest = trackListenState.sessionId;

      trackListenState.counted = true;
      trackListenState.pendingRequest = true;

      const ok = await registerTrackListen(trackListenState.trackId);

      if (sessionAtRequest === trackListenState.sessionId) {
        trackListenState.pendingRequest = false;

        if (!ok) {
          trackListenState.counted = false;
        }
      }
    }
  });

  globalAudio.addEventListener("ended", () => {
    trackListenState.wasPlaying = false;
    trackListenState.lastTime = globalAudio.duration || 0;
  });

  globalAudio.addEventListener("emptied", () => {
    resetTrackListenState(null, 0);
  });

  window.addEventListener("ritmoria:global-player-timeupdate", () => {
    syncProfileTrackCardsWithGlobalPlayer();
  });

  window.addEventListener("ritmoria:global-player-play", () => {
    syncProfileTrackCardsWithGlobalPlayer();
  });

  window.addEventListener("ritmoria:global-player-pause", () => {
    syncProfileTrackCardsWithGlobalPlayer();
  });

  window.addEventListener("ritmoria:global-player-track-change", () => {
    setTimeout(() => {
      syncProfileTrackCardsWithGlobalPlayer();
    }, 50);
  });

  window.addEventListener("ritmoria:global-player-stopped", () => {
    syncProfileTrackCardsWithGlobalPlayer();
  });
}

function setTrackListenThreshold() {
  const audio = document.getElementById("global-audio");
  if (!audio) return;

  const applyThreshold = () => {
    if (!audio.duration || !isFinite(audio.duration)) return;
    trackListenState.threshold = Math.min(30, audio.duration * 0.5);
  };

  if (audio.duration && isFinite(audio.duration)) {
    applyThreshold();
    return;
  }

  audio.addEventListener("loadedmetadata", applyThreshold, { once: true });
}

async function loadLikes(btn, trackId) {
  const res = await fetch(`/api/track-likes/${trackId}`, {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  const data = await res.json();

  applyTrackLikeState(trackId, !!data.liked, Number(data.count) || 0);
}

function updateTrackRepostState(trackId, reposted) {
  const numericTrackId = Number(trackId);
  if (!numericTrackId) return;

  document.querySelectorAll(`.track-card[data-track-id="${numericTrackId}"] .track-repost-btn`).forEach((btn) => {
    btn.classList.toggle("active-repost", !!reposted);
  });

  if (Array.isArray(window.currentTracks)) {
    window.currentTracks = window.currentTracks.map((track) => (
      Number(track.id) === numericTrackId
        ? { ...track, reposted: !!reposted }
        : track
    ));
  }
}

async function toggleLike(btn, trackId) {
  const res = await fetch("/api/track-like", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify({ trackId })
  });

const data = await res.json();
if (data.xp && data.xp > 0) {
  if (typeof window.applyXPAndCheckRank === "function") {
    window.applyXPAndCheckRank(data.xp, data.newXP, data.xpState);
  } else {
    showXP(data.xp);
  }
}

  const countEl = btn.querySelector(".like-count");
  let count = Number(data?.count);

  if (!Number.isFinite(count)) {
    count = Number(countEl?.innerText || 0);
    count = data.liked ? count + 1 : count - 1;
  }

  count = Math.max(0, count);
  applyTrackLikeState(trackId, !!data.liked, count);

  window.dispatchEvent(
    new CustomEvent("ritmoria:track-like-updated", {
      detail: {
        trackId: Number(trackId),
        liked: !!data.liked,
        likesCount: count
      }
    })
  );
}

function playProfileTrack(event, id) {
  event.preventDefault();
  event.stopPropagation();

  const track = getAllKnownTracks().find((t) => t.id === id);
  if (!track) return;

  const nextAudioSrc = track.audio
    ? (track.audio.startsWith("http") ? track.audio : "/" + track.audio.replace(/^\/+/, ""))
    : "";

  const state = window.getGlobalPlayerState?.();
  const current = state?.track;
  const globalAudio = document.getElementById("global-audio");

  const isSameTrack =
    current &&
    (
      (current.audioSrc && current.audioSrc === nextAudioSrc) ||
      (current.soundcloud && current.soundcloud === (track.soundcloud || ""))
    );

  if (isSameTrack && globalAudio) {
    const atBeginning = (globalAudio.currentTime || 0) <= 1;

    // новую сессию создаём только если этот же трек реально начали заново с начала
    if (atBeginning && (trackListenState.counted || trackListenState.seekBlocked)) {
      beginTrackListenSession(id, globalAudio);
    }

    if (globalAudio.paused) {
      globalAudio.play().catch(() => {});
    } else {
      globalAudio.pause();
    }

    return;
  }

  window.playTrackGlobal({
    id: track.id,
    title: track.title,
    artist: renderTrackArtistDisplay(track, { asHtml: false }),
    artist_mentions: Array.isArray(track.artist_mentions) ? track.artist_mentions : [],
    cover: track.cover
      ? (track.cover.startsWith("http") ? track.cover : "/" + track.cover.replace(/^\/+/, ""))
      : "/images/default-cover.jpg",
    audioSrc: nextAudioSrc,
    soundcloud: track.soundcloud || "",
    slug: track.slug || "",
    username_tag: track.username_tag || "",
    profile_source_tag: track.username_tag || window.__profileTag || "",
    play_context: "profile"
  });

  setupGlobalTrackListenWatcher();

  setTimeout(() => {
    const audio = document.getElementById("global-audio");

    if (audio) {
      beginTrackListenSession(id, audio);
      setTrackListenThreshold();
    }

    syncProfileTrackCardsWithGlobalPlayer();
  }, 50);
}

function syncProfileTrackCardsWithGlobalPlayer() {
  const state = window.getGlobalPlayerState?.();
  const current = state?.track;
  const isPlaying = !!state?.isPlaying;
  const currentTime = state?.currentTime || 0;
  const duration = state?.duration || 0;

  document.querySelectorAll(".track-card").forEach((card) => {
    const playIcon = card.querySelector(".play-btn i");
    const currentEl = card.querySelector('[id^="current-"]');
    const durationEl = card.querySelector('[id^="duration-"]');
    const fill = card.querySelector(".progress-fill");

    if (playIcon) playIcon.className = "fa-solid fa-play";
    if (currentEl) currentEl.textContent = "0:00";
    if (durationEl) durationEl.textContent = "0:00";
    if (fill) fill.style.width = "0%";
  });

  if (!current) return;

  const matchedTrack = getAllKnownTracks().find((t) => {
    const audioSrc = t.audio
      ? (t.audio.startsWith("http") ? t.audio : "/" + t.audio.replace(/^\/+/, ""))
      : "";

    return (
      (current.audioSrc && current.audioSrc === audioSrc) ||
      (current.soundcloud && current.soundcloud === (t.soundcloud || ""))
    );
  });

  if (!matchedTrack) return;

  const card = document.getElementById(`track-card-${matchedTrack.id}`);
  if (!card) return;

  const playIcon = card.querySelector(".play-btn i");
  const currentEl = document.getElementById(`current-${matchedTrack.id}`);
  const durationEl = document.getElementById(`duration-${matchedTrack.id}`);
  const fill = document.getElementById(`progress-${matchedTrack.id}`);

  if (playIcon) {
    playIcon.className = isPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
  }

  if (currentEl) {
    currentEl.textContent = formatTime(currentTime);
  }

  if (durationEl) {
    durationEl.textContent = formatTime(duration);
  }

  if (fill && duration > 0) {
    fill.style.width = `${(currentTime / duration) * 100}%`;
  }
}

function seekTrack(event, id) {
  event.stopPropagation();

  const state = window.getGlobalPlayerState?.();
  const current = state?.track;
  if (!current) return;

  const track = getAllKnownTracks().find((t) => t.id === id);
  if (!track) return;

  const audioSrc = track.audio
    ? (track.audio.startsWith("http") ? track.audio : "/" + track.audio.replace(/^\/+/, ""))
    : "";

  const isSameTrack =
    (current.audioSrc && current.audioSrc === audioSrc) ||
    (current.soundcloud && current.soundcloud === (track.soundcloud || ""));

  if (!isSameTrack) return;

  const duration = state?.duration || 0;
  if (!duration) return;

  const rect = event.currentTarget.getBoundingClientRect();
  const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));

  if (typeof window.seekGlobalPlayer === "function") {
    window.seekGlobalPlayer(percent, "embedded");
  }
}

function goToTrack(event, id) {
  if (
    event.target.closest(".play-btn") ||
    event.target.closest(".track-actions") ||
    event.target.closest(".track-menu") ||
    event.target.closest(".dots-btn") ||
    event.target.closest(".dropdown") ||
    event.target.closest(".volume-row")
  ) return;

  const track = window.currentTracks.find((t) => t.id === id);
  if (!track) return;

  navigate(`/${track.username_tag}/${track.slug}`);
}

function editTrack(id) {
  const track = window.currentTracks?.find((t) => t.id === id);
  if (!track) return;

  const modal = document.getElementById("trackModal");
  if (!modal) return;

  resetTrackModal();

  modal.dataset.editId = id;

  const title = modal.querySelector(".profile-post-modal-title");
  if (title) title.innerText = "Редактирование трека";

  document.getElementById("trackTitle").value = track.title || "";
  document.getElementById("trackArtist").value = track.artist || "";
  document.getElementById("trackGenre").value = track.genre || "";
  document.getElementById("trackProducer").value = track.producer || "";
  document.getElementById("trackDescription").value = track.description || "";

  currentTags = track.tags ? track.tags.split(",") : [];
  renderTags();

  if (track.cover) {
    const preview = document.getElementById("trackCoverPreview");
    const placeholder = document.getElementById("trackCoverPlaceholder");

    preview.src = track.cover;
    preview.style.display = "block";
    placeholder.style.display = "none";
  }

  if (track.audio) {
    const player = document.getElementById("trackAudioPlayer");
    const preview = document.getElementById("trackPreview");

    player.src = track.audio;
    preview.style.display = "block";
  }

  const submitBtn = document.getElementById("trackSubmitBtn");
  if (submitBtn) {
    submitBtn.innerText = "Сохранить изменения";
  }

  modal.style.display = "flex";
  if (typeof window.setProfileComposerMode === "function") {
    window.setProfileComposerMode(true);
  } else {
    document.body.classList.add("profile-composer-open");
  }
}

async function deleteTrack(id) {
  const track = getAllKnownTracks().find((item) => Number(item.id) === Number(id));
  const isAdminModeration = canModerateProfileTracks() && Number(track?.user_id || 0) !== Number(window.currentViewer?.id || 0);
  let reason = "";

  if (isAdminModeration) {
    reason = String(prompt("Укажи причину удаления трека. Она придёт пользователю уведомлением:", "") || "").trim();
    if (!reason) {
      alert("Нужно указать причину удаления.");
      return;
    }
  } else {
    const ok = confirm("Удалить трек навсегда?");
    if (!ok) return;
  }

  const res = await fetch(`/delete-track/${id}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify(isAdminModeration ? { reason } : {})
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data?.error === "delete_reason_required") {
      alert("Нужно указать причину удаления.");
    } else {
      alert("Ошибка удаления");
    }
    return;
  }

  loadTracks();
}

function pinTrack(id) {
  console.log("pin", id);
}

async function archiveTrack(id) {
  const res = await fetch(`/archive-track/${id}`, {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  if (!res.ok) {
    alert("Ошибка архивации");
    return;
  }

  loadTracks();
}

function goToTrackAuthorProfile(event, tag) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
  }
  if (!tag) return;
  navigate(`/${tag}`);
}

function renderTags() {
  const container = document.getElementById("trackTagsContainer");
  const input = document.getElementById("trackTagsInput");

  if (!container || !input) return;

  container.innerHTML = "";

  currentTags.forEach((tag, index) => {
    const el = document.createElement("div");
    el.className = "tag-chip";
    el.innerHTML = `
      <span class="tag-text">${escapeTrackHtml(tag)}</span>
      <span class="tag-remove" onclick="removeTag(${index})">
        <i class="fa-solid fa-xmark"></i>
      </span>
    `;
    container.appendChild(el);
  });

  container.appendChild(input);
}

function removeTag(index) {
  currentTags.splice(index, 1);
  renderTags();
}

function formatDate(dateStr) {
  if (!dateStr) return "";

  const date = new Date(dateStr);
  const diff = (Date.now() - date) / 1000;

  if (diff < 60) return "только что";
  if (diff < 3600) return Math.floor(diff / 60) + " мин назад";
  if (diff < 86400) return Math.floor(diff / 3600) + " ч назад";
  if (diff < 604800) return Math.floor(diff / 86400) + " д назад";

  return date.toLocaleDateString();
}

function goToComments(slug, tag) {
  navigate(`/${tag}/${slug}#comments`);
}

function copyTrackLink(slug, tag) {
  const url = `${location.origin}/${tag}/${slug}`;

  navigator.clipboard.writeText(url);

  const toast = document.getElementById("copyToast");
  if (!toast) return;

  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}

function buildProfileTrackQueueItem(track) {
  if (!track) return null;

  const audioSrc = track.audio
    ? (track.audio.startsWith("http") ? track.audio : "/" + track.audio.replace(/^\/+/, ""))
    : "";

  return {
    id: track.id,
    title: track.title,
    artist: renderTrackArtistDisplay(track, { asHtml: false }),
    artist_mentions: Array.isArray(track.artist_mentions) ? track.artist_mentions : [],
    cover: track.cover
      ? (track.cover.startsWith("http") ? track.cover : "/" + track.cover.replace(/^\/+/, ""))
      : "/images/default-cover.jpg",
    audioSrc,
    soundcloud: track.soundcloud || "",
    slug: track.slug || "",
    username_tag: track.username_tag || "",
    profile_source_tag: track.username_tag || window.__profileTag || "",
    play_context: "queue"
  };
}

function addProfileTrackToQueue(event, id) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  const track = getAllKnownTracks().find((t) => Number(t.id) === Number(id));
  const queueItem = buildProfileTrackQueueItem(track);

  if (!queueItem || typeof window.addTrackToGlobalQueue !== "function") return;

  window.addTrackToGlobalQueue(queueItem, { open: true, allowDuplicate: true });
}

async function toggleTrackRepost(event, id) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  const token = localStorage.getItem("token");
  if (!token) {
    alert("Нужно войти в аккаунт.");
    return;
  }

  try {
    const res = await fetch(`/api/user-tracks/${id}/repost`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data?.error === "cannot_repost_own_track") {
        alert("Свой трек репостнуть нельзя.");
      } else {
        alert("Не удалось обновить репост трека");
      }
      return;
    }

    updateTrackRepostState(id, !!data.reposted);

    if (document.getElementById("repostsTab")?.classList.contains("active") && typeof window.loadReposts === "function") {
      await window.loadReposts();
    }
  } catch (err) {
    console.error("toggleTrackRepost error", err);
    alert("Не удалось обновить репост трека");
  }
}

function initTrackTags() {
  const container = document.getElementById("trackTagsContainer");
  const input = document.getElementById("trackTagsInput");

  if (!container || !input) return;
  if (input.dataset.tagsInitialized === "true") return;
  input.dataset.tagsInitialized = "true";

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();

      const value = input.value.trim().toLowerCase();
      if (!value || currentTags.includes(value)) return;

      currentTags.push(value);
      input.value = "";

      renderTags();
    }
  });
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".dots-btn");

  if (btn) {
    e.stopPropagation();

    const menu = btn.nextElementSibling;

    document.querySelectorAll(".dropdown").forEach((d) => {
      if (d !== menu) d.classList.add("profile-hidden");
    });

    document.querySelectorAll(".track-card").forEach((c) => {
      c.style.zIndex = 1;
    });

    const card = btn.closest(".track-card");
    if (card) {
      card.style.zIndex = 1000;
    }

    if (menu) menu.classList.toggle("profile-hidden");
    return;
  }

  if (!e.target.closest(".track-menu")) {
    document.querySelectorAll(".dropdown").forEach((d) => {
      d.classList.add("profile-hidden");
    });
  }
});

window.initTracks = initTracks;
window.loadTracks = loadTracks;
window.playProfileTrack = playProfileTrack;
window.addProfileTrackToQueue = addProfileTrackToQueue;
window.seekTrack = seekTrack;
window.goToTrack = goToTrack;
window.editTrack = editTrack;
window.deleteTrack = deleteTrack;
window.pinTrack = pinTrack;
window.archiveTrack = archiveTrack;
window.goToTrackAuthorProfile = goToTrackAuthorProfile;
window.goToComments = goToComments;
window.copyTrackLink = copyTrackLink;
window.initTrackTags = initTrackTags;
window.removeTag = removeTag;
window.toggleTrackRepost = toggleTrackRepost;
window.renderProfileTrackCard = renderTrack;
window.hydrateProfileTrackCards = hydrateTrackCards;
window.syncProfileTrackCardsWithGlobalPlayer = syncProfileTrackCardsWithGlobalPlayer;
window.renderTrackArtistDisplay = renderTrackArtistDisplay;

function initTrackModal() {
  const coverInput = document.getElementById("trackCoverInput");
  const coverPreview = document.getElementById("trackCoverPreview");
  const coverPlaceholder = document.getElementById("trackCoverPlaceholder");

  const audioInput = document.getElementById("trackAudioInput");
  const fileName = document.getElementById("trackFileName");
  const audioPlayer = document.getElementById("trackAudioPlayer");
  const preview = document.getElementById("trackPreview");

  const maxProfileTrackSize = 35 * 1024 * 1024;

  if (coverInput && !coverInput.dataset.trackModalInit) {
    coverInput.dataset.trackModalInit = "true";

    coverInput.addEventListener("click", () => {
      coverInput.value = "";
    });

    coverInput.addEventListener("change", () => {
      const file = coverInput.files[0];
      if (!file) return;

      coverPreview.src = URL.createObjectURL(file);
      coverPreview.style.display = "block";
      coverPlaceholder.style.display = "none";
    });
  }

  if (audioInput && !audioInput.dataset.trackAudioInit) {
    audioInput.dataset.trackAudioInit = "true";

    audioInput.addEventListener("click", () => {
      audioInput.value = "";
    });

    audioInput.addEventListener("change", () => {
      const file = audioInput.files[0];
      if (!file) return;

      if (file.size > maxProfileTrackSize) {
        alert("Для треков в профиле действует лимит 35 МБ.");
        audioInput.value = "";
        fileName.textContent = "Файл не выбран";
        audioPlayer.src = "";
        audioPlayer.load();
        preview.style.display = "none";
        return;
      }

      fileName.textContent = file.name;
      audioPlayer.src = URL.createObjectURL(file);
      preview.style.display = "block";
    });
  }
}

function resetTrackModal() {
  const modal = document.getElementById("trackModal");

  const title = document.getElementById("trackTitle");
  const artist = document.getElementById("trackArtist");
  const genre = document.getElementById("trackGenre");
  const producer = document.getElementById("trackProducer");
  const description = document.getElementById("trackDescription");

  const coverInput = document.getElementById("trackCoverInput");
  const coverPreview = document.getElementById("trackCoverPreview");
  const coverPlaceholder = document.getElementById("trackCoverPlaceholder");

  const audioInput = document.getElementById("trackAudioInput");
  const fileName = document.getElementById("trackFileName");
  const audioPlayer = document.getElementById("trackAudioPlayer");
  const preview = document.getElementById("trackPreview");

  const titleEl = modal?.querySelector(".profile-post-modal-title");
  const submitBtn = document.getElementById("trackSubmitBtn");

  if (modal) {
    delete modal.dataset.editId;
  }

  if (title) title.value = "";
  if (artist) artist.value = "";
  if (genre) genre.value = "";
  if (producer) producer.value = "";
  if (description) description.value = "";

  currentTags = [];
  renderTags();

  if (coverInput) coverInput.value = "";
  if (coverPreview) {
    coverPreview.src = "";
    coverPreview.style.display = "none";
  }
  if (coverPlaceholder) {
    coverPlaceholder.style.display = "flex";
  }

  if (audioInput) audioInput.value = "";
  if (fileName) fileName.textContent = "Файл не выбран";
  if (audioPlayer) {
    audioPlayer.src = "";
    audioPlayer.load();
  }
  if (preview) preview.style.display = "none";

  if (titleEl) titleEl.innerText = "Загрузить трек";
  if (submitBtn) submitBtn.innerText = "Загрузить трек";
}

function openTrackModal() {
  const modal = document.getElementById("trackModal");
  if (!modal) return;

  resetTrackModal();
  modal.style.display = "flex";
  if (typeof window.setProfileComposerMode === "function") {
    window.setProfileComposerMode(true);
  } else {
    document.body.classList.add("profile-composer-open");
  }
}

function closeTrackModal() {
  const modal = document.getElementById("trackModal");
  if (!modal) return;

  modal.style.display = "none";
  resetTrackModal();
  if (typeof window.setProfileComposerMode === "function") {
    window.setProfileComposerMode(false);
  } else {
    document.body.classList.remove("profile-composer-open");
  }
}

async function submitUserTrack() {
  const modal = document.getElementById("trackModal");
  const editId = modal?.dataset?.editId;

  const title = document.getElementById("trackTitle")?.value.trim() || "";
  const artist = document.getElementById("trackArtist")?.value.trim() || "";
  const genre = document.getElementById("trackGenre")?.value.trim() || "";
  const producer = document.getElementById("trackProducer")?.value.trim() || "";
  const description = document.getElementById("trackDescription")?.value.trim() || "";

  const coverFile = document.getElementById("trackCoverInput")?.files?.[0];
  const audioFile = document.getElementById("trackAudioInput")?.files?.[0];

  if (!title) {
    alert("Название обязательно");
    return;
  }

  if (!editId && !audioFile) {
    alert("Загрузите песню");
    return;
  }

  if (!editId && !coverFile) {
    alert("Загрузите обложку");
    return;
  }

  const formData = new FormData();
  formData.append("title", title);
  formData.append("artist", artist);
  formData.append("genre", genre);
  formData.append("producer", producer);
  formData.append("description", description);
  formData.append("tags", currentTags.join(","));

  if (coverFile) formData.append("cover", coverFile);
  if (audioFile) formData.append("audio", audioFile);

  let url = "/add-user-track";
  let method = "POST";

  if (editId) {
    url = `/update-track/${editId}`;
    method = "PUT";
  }

  const res = await fetch(url, {
  method,
  headers: {
    Authorization: "Bearer " + localStorage.getItem("token")
  },
  body: formData
});

const data = await res.json();

if (!res.ok) {
  alert(window.getApiErrorMessage?.(data, editId ? "Не удалось обновить трек" : "Не удалось загрузить трек") || (editId ? "Не удалось обновить трек" : "Не удалось загрузить трек"));
  return;
}

if (!editId && data.xp && typeof window.applyXPAndCheckRank === "function") {
  window.applyXPAndCheckRank(data.xp, data.newXP, data.xpState);
} else if (!editId && data.xp) {
  showXP(data.xp);
}

closeTrackModal();
loadTracks();
}

window.initTrackModal = initTrackModal;
window.openTrackModal = openTrackModal;
window.closeTrackModal = closeTrackModal;
window.submitUserTrack = submitUserTrack;
