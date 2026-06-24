let discoverTracks = [];
let discoverCurrentTrack = 0;
let discoverHistory = [];
let seenTracks = [];

let discoverRoot = null;
let discoverCard = null;
let discoverNextCard = null;
let discoverAudio = null;
let discoverPlayBtn = null;
let discoverLikeBtn = null;
let discoverDislikeBtn = null;
let discoverBackBtn = null;
let discoverProgress = null;
let discoverProgressTrack = null;
let discoverVolumeRange = null;
let discoverVolumeIcon = null;
let discoverVolumeOn = null;
let discoverVolumeOff = null;
let discoverBgLeft = null;
let discoverBgRight = null;
let discoverPlaylistTrigger = null;
let discoverPlaylistPanel = null;
let discoverPlaylistLabel = null;
let discoverPlaylistList = null;
let discoverPlaylistClose = null;
let discoverPlaylistCreate = null;
let discoverToast = null;

let discoverDragging = false;
let discoverStartX = 0;
let discoverDeltaX = 0;
let discoverPointerId = null;
let discoverLastVolume = 30;
let discoverMuted = false;
let discoverInited = false;
let discoverSwipeLocked = false;
let discoverIsLoading = false;
let discoverAuthRequired = false;
let discoverPreloadAudio = null;
let discoverLastTrackId = null;
let discoverRenderToken = 0;
let discoverSwipeUnlockTimer = null;
let discoverPointerEventsBound = false;
let discoverDragSafetyTimer = null;
let discoverSwipeSequence = 0;
let discoverSeenPersistTimer = null;
let discoverPlaylistApiInitialized = false;
let discoverLoadAbortController = null;
let discoverActionQueue = [];
let discoverActionInFlight = false;
let discoverActionFlushTimer = null;

const DISCOVER_VOLUME_KEY = "discoverVolume";
const DISCOVER_MUTED_KEY = "discoverMuted";
const DISCOVER_PLAYLIST_KEY = "discoverSelectedPlaylist";
const DISCOVER_SEEN_KEY = "seenDiscoverTracks";
const DISCOVER_SEEN_LIMIT = 500;
const DISCOVER_HISTORY_LIMIT = 50;
const DISCOVER_TRACK_BUFFER_LIMIT = 160;

seenTracks = readDiscoverSeenTracks();

if (window.stopGlobalTrack) {
  window.stopGlobalTrack();
}

function readDiscoverSeenTracks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISCOVER_SEEN_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];

    const unique = [];
    const seen = new Set();

    parsed.slice(-DISCOVER_SEEN_LIMIT).forEach((trackId) => {
      if (!trackId || seen.has(trackId)) return;
      seen.add(trackId);
      unique.push(trackId);
    });

    return unique;
  } catch {
    return [];
  }
}

function persistSeenTracksNow() {
  clearTimeout(discoverSeenPersistTimer);
  discoverSeenPersistTimer = null;

  try {
    localStorage.setItem(DISCOVER_SEEN_KEY, JSON.stringify(seenTracks.slice(-DISCOVER_SEEN_LIMIT)));
  } catch {}
}

function scheduleSeenTracksPersist() {
  clearTimeout(discoverSeenPersistTimer);
  discoverSeenPersistTimer = setTimeout(persistSeenTracksNow, 350);
}

function discoverEscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function discoverT(value) {
  if (window.RitmoriaI18n?.getLanguage?.() !== "en") return value;
  return window.RitmoriaI18n?.translatePhrase?.(value) || value;
}

function formatDiscoverTrackCount(count) {
  return window.RitmoriaI18n?.getLanguage?.() === "en"
    ? `${count} tracks`
    : `${count} треков`;
}

function parseDiscoverTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map(v => String(v).trim()).filter(Boolean);
  }

  if (typeof tags === "string") {
    return tags
      .split(",")
      .map(v => v.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeDiscoverTrack(track) {
  const audioSrc = track.audioSrc || track.audio || "";
  const soundcloud = track.soundcloud || "";

  return {
    id: track.id,
    title: track.title || discoverT("Без названия"),
    artist: track.artist || track.username || discoverT("Неизвестный исполнитель"),
    username: track.username || "",
    username_tag: track.username_tag || "",
    genre: track.genre || "",
    tags: parseDiscoverTags(track.tags),
    cover: track.cover || "/images/default-avatar.jpg",
    audioSrc,
    soundcloud
  };
}

function ensureDiscoverPlaylistApi({ initialize = false } = {}) {
  const api = window.RitmoriaPlaylists || null;

  if (initialize && api?.ensureInitialized && !discoverPlaylistApiInitialized) {
    discoverPlaylistApiInitialized = true;

    try {
      const maybePromise = api.ensureInitialized();

      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise
          .then(() => {
            updateDiscoverPlaylistLabel();
            renderDiscoverPlaylistOptions();
          })
          .catch((err) => {
            console.error("discover playlist init error", err);
          });
      }
    } catch (err) {
      console.error("discover playlist init error", err);
    }
  }

  return api;
}

function getDiscoverAvailablePlaylists() {
  const api = ensureDiscoverPlaylistApi();
  let playlists = null;

  try {
    playlists = api?.getAll?.();
  } catch (err) {
    console.error("discover playlists read error", err);
  }

  if (!Array.isArray(playlists)) {
    try {
      playlists = window.RitmoriaPlaylistStore?.getLocal?.();
    } catch {}
  }

  return Array.isArray(playlists) ? playlists : [];
}

function getDefaultDiscoverPlaylistId() {
  const playlists = getDiscoverAvailablePlaylists();
  return playlists[0]?.id || "favorites";
}

function getSelectedDiscoverPlaylistId() {
  const playlists = getDiscoverAvailablePlaylists();
  const availableIds = new Set(playlists.map((playlist) => String(playlist.id)));
  const stored = String(localStorage.getItem(DISCOVER_PLAYLIST_KEY) || "").trim();

  if (stored && availableIds.has(stored)) {
    return stored;
  }

  const fallback = getDefaultDiscoverPlaylistId();
  localStorage.setItem(DISCOVER_PLAYLIST_KEY, fallback);
  return fallback;
}

function setSelectedDiscoverPlaylistId(playlistId) {
  const safeId = String(playlistId || "").trim() || getDefaultDiscoverPlaylistId();
  localStorage.setItem(DISCOVER_PLAYLIST_KEY, safeId);
  updateDiscoverPlaylistLabel();
  renderDiscoverPlaylistOptions();
}

function getSelectedDiscoverPlaylist() {
  const selectedId = getSelectedDiscoverPlaylistId();
  return getDiscoverAvailablePlaylists().find((playlist) => String(playlist.id) === selectedId) || null;
}

function updateDiscoverPlaylistLabel() {
  if (!discoverPlaylistLabel) return;
  const selected = getSelectedDiscoverPlaylist();
  discoverPlaylistLabel.textContent = selected?.id === "favorites"
    ? discoverT("Любимые треки")
    : (selected?.name || discoverT("Любимые треки"));
}

function renderDiscoverPlaylistOptions() {
  if (!discoverPlaylistList) return;
  if (discoverPlaylistPanel?.classList.contains("discover-hidden")) return;

  const playlists = getDiscoverAvailablePlaylists();
  const selectedId = getSelectedDiscoverPlaylistId();

  if (!playlists.length) {
    discoverPlaylistList.innerHTML = `<div class="discover-playlist-empty">${discoverT("Пока нет плейлистов.")}</div>`;
    return;
  }

  discoverPlaylistList.innerHTML = playlists.map((playlist) => {
    const count = Array.isArray(playlist?.tracks) ? playlist.tracks.length : 0;
    const isSelected = String(playlist.id) === selectedId;

    return `
      <button class="discover-playlist-option ${isSelected ? "is-selected" : ""}" type="button" data-discover-playlist-id="${discoverEscapeHtml(playlist.id)}">
        <div class="discover-playlist-option-main">
          <div class="discover-playlist-option-name">${discoverEscapeHtml(playlist.id === "favorites" ? discoverT("Любимые треки") : (playlist.name || discoverT("Без названия")))}</div>
          <div class="discover-playlist-option-meta">${formatDiscoverTrackCount(count)}</div>
        </div>
        <div class="discover-playlist-option-mark">✓</div>
      </button>
    `;
  }).join("");

  discoverPlaylistList.querySelectorAll("[data-discover-playlist-id]").forEach((button) => {
    button.onclick = () => {
      setSelectedDiscoverPlaylistId(button.dataset.discoverPlaylistId);
      closeDiscoverPlaylistPanel();
    };
  });
}

function openDiscoverPlaylistPanel() {
  discoverPlaylistPanel?.classList.remove("discover-hidden");
  renderDiscoverPlaylistOptions();
}

function closeDiscoverPlaylistPanel() {
  discoverPlaylistPanel?.classList.add("discover-hidden");
}

function toggleDiscoverPlaylistPanel() {
  if (!discoverPlaylistPanel) return;
  if (discoverPlaylistPanel.classList.contains("discover-hidden")) {
    openDiscoverPlaylistPanel();
  } else {
    closeDiscoverPlaylistPanel();
  }
}

function showDiscoverToast(message) {
  if (!discoverToast) return;
  discoverToast.textContent = message;
  discoverToast.classList.remove("discover-hidden");

  clearTimeout(window.__discoverToastTimer);
  window.__discoverToastTimer = setTimeout(() => {
    discoverToast?.classList.add("discover-hidden");
  }, 1800);
}

function shuffleArray(arr) {
  const copy = [...arr];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function getCurrentTrack() {
  return discoverTracks[discoverCurrentTrack] || null;
}

function getNextTrack() {
  if (!discoverTracks.length) return null;
  if (discoverTracks.length === 1) return discoverTracks[0] || null;

  const current = getCurrentTrack();
  const currentId = current?.id ?? null;

  let nextIndex = discoverCurrentTrack + 1;
  if (nextIndex >= discoverTracks.length) nextIndex = 0;

  let next = discoverTracks[nextIndex] || null;

  if (!next) return null;

  if (currentId && next.id === currentId) {
    const candidate = discoverTracks.find(t => t && t.id !== currentId);
    if (candidate) next = candidate;
  }

  if (
    discoverLastTrackId &&
    next &&
    next.id === discoverLastTrackId &&
    discoverTracks.length > 1
  ) {
    const candidate = discoverTracks.find(t => {
      return t && t.id !== discoverLastTrackId && t.id !== currentId;
    });

    if (candidate) next = candidate;
  }

  return next;
}

function buildTrackMeta(track) {
  const chips = [];

  if (track.genre) {
    chips.push(
      `<span class="discover-chip">${discoverEscapeHtml(track.genre)}</span>`
    );
  }

  for (const tag of track.tags.slice(0, 5)) {
    chips.push(
      `<span class="discover-chip">#${discoverEscapeHtml(tag)}</span>`
    );
  }

  return chips.join("");
}

function buildTrackCardMarkup(track, isNext = false) {
  if (!track) return "";

  const nickname = discoverEscapeHtml(track.artist || track.username || "Неизвестный исполнитель");

  return `
    <div class="discover-card-content">
      <div class="discover-cover-wrap">
        <div
          class="discover-cover"
          style="background-image:url('${discoverEscapeHtml(track.cover)}');"
        ></div>

        <div class="discover-card-badge ${isNext ? "discover-card-badge-soft" : ""}">
          ${isNext ? discoverT("Дальше") : discoverT("Сейчас играет")}
        </div>
      </div>

      <div class="discover-track-info">
        <h2>${discoverEscapeHtml(track.title)}</h2>
        <p class="discover-artist">${nickname}</p>
      </div>

      <div class="discover-meta">
        ${buildTrackMeta(track)}
      </div>
    </div>
  `;
}

function updateDiscoverPlayButton() {
  if (!discoverPlayBtn || !discoverAudio) return;
  discoverPlayBtn.textContent = discoverAudio.paused ? "▶" : "❚❚";
}

function syncVolumeIcons() {
  if (!discoverVolumeOn || !discoverVolumeOff) return;

  discoverVolumeOn.style.display = discoverMuted ? "none" : "block";
  discoverVolumeOff.style.display = discoverMuted ? "block" : "none";
}

function updateDiscoverFill() {
  if (!discoverVolumeRange || !discoverAudio) return;

  const value = Number(discoverVolumeRange.value || 0);

  discoverAudio.volume = value / 100;
  discoverVolumeRange.style.setProperty("--discover-volume", `${value}%`);

  try {
    localStorage.setItem(DISCOVER_VOLUME_KEY, String(value));
  } catch {}
}

function persistDiscoverMuteState() {
  try {
    localStorage.setItem(DISCOVER_MUTED_KEY, discoverMuted ? "1" : "0");
  } catch {}
}

function readDiscoverVolumeState() {
  let savedVolume = 30;
  let savedMuted = false;

  try {
    const rawVolume = Number(localStorage.getItem(DISCOVER_VOLUME_KEY));
    if (!Number.isNaN(rawVolume) && rawVolume >= 0 && rawVolume <= 100) {
      savedVolume = rawVolume;
    }

    savedMuted = localStorage.getItem(DISCOVER_MUTED_KEY) === "1";
  } catch {}

  if (savedVolume <= 0 && !savedMuted) {
    savedVolume = 30;
  }

  discoverLastVolume = savedVolume > 0 ? savedVolume : 30;
  discoverMuted = savedMuted;

  if (discoverVolumeRange) {
    discoverVolumeRange.value = discoverMuted ? 0 : savedVolume;
  }

  syncVolumeIcons();
  updateDiscoverFill();
}

function pauseAndClearDiscoverAudio() {
  if (!discoverAudio) return;

  discoverAudio.pause();
  discoverAudio.removeAttribute("src");
  discoverAudio.load();
}

function rememberSeenTrack(trackId) {
  if (!trackId) return;

  if (!seenTracks.includes(trackId)) {
    seenTracks.push(trackId);

    if (seenTracks.length > DISCOVER_SEEN_LIMIT) {
      seenTracks = seenTracks.slice(-DISCOVER_SEEN_LIMIT);
    }

    scheduleSeenTracksPersist();
  }
}

function resetSwipeBackgrounds() {
  if (discoverBgLeft) discoverBgLeft.style.opacity = "0";
  if (discoverBgRight) discoverBgRight.style.opacity = "0";

  if (discoverCard) {
    discoverCard.style.boxShadow =
      "0 22px 80px rgba(0, 0, 0, 0.48), 0 0 90px rgba(176, 116, 151, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.06)";
  }
}

function clearDiscoverDragSafetyTimer() {
  if (!discoverDragSafetyTimer) return;
  clearTimeout(discoverDragSafetyTimer);
  discoverDragSafetyTimer = null;
}

function clearDiscoverSwipeUnlockTimer() {
  if (!discoverSwipeUnlockTimer) return;
  clearTimeout(discoverSwipeUnlockTimer);
  discoverSwipeUnlockTimer = null;
}

function unlockDiscoverSwipe() {
  discoverSwipeLocked = false;
  discoverDragging = false;
  discoverPointerId = null;
  discoverDeltaX = 0;
  clearDiscoverDragSafetyTimer();
  clearDiscoverSwipeUnlockTimer();

  if (discoverCard) {
    discoverCard.style.pointerEvents = "";
  }
}

function releaseDiscoverPointerCapture(pointerId = discoverPointerId) {
  if (!discoverCard || pointerId === null || pointerId === undefined) return;

  try {
    if (discoverCard.hasPointerCapture?.(pointerId)) {
      discoverCard.releasePointerCapture(pointerId);
    }
  } catch {}
}

function cancelDiscoverDrag(reset = true) {
  clearDiscoverDragSafetyTimer();
  discoverDragging = false;
  const pointerId = discoverPointerId;
  discoverPointerId = null;
  discoverDeltaX = 0;
  releaseDiscoverPointerCapture(pointerId);

  if (reset) {
    resetDraggedCard();
  }
}

function setSwipeBackgroundByDelta(deltaX) {
  const strength = Math.min(Math.abs(deltaX) / 160, 1);

  if (!discoverCard) return;

  if (deltaX > 0) {
    if (discoverBgRight) discoverBgRight.style.opacity = String(strength);
    if (discoverBgLeft) discoverBgLeft.style.opacity = "0";

    discoverCard.style.boxShadow = `
      0 22px 80px rgba(0, 0, 0, 0.48),
      28px 0 80px rgba(43, 220, 120, ${0.10 + strength * 0.35}),
      0 0 90px rgba(176, 116, 151, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.06)
    `;
  } else if (deltaX < 0) {
    if (discoverBgLeft) discoverBgLeft.style.opacity = String(strength);
    if (discoverBgRight) discoverBgRight.style.opacity = "0";

    discoverCard.style.boxShadow = `
      0 22px 80px rgba(0, 0, 0, 0.48),
      -28px 0 80px rgba(255, 65, 92, ${0.10 + strength * 0.35}),
      0 0 90px rgba(176, 116, 151, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.06)
    `;
  } else {
    resetSwipeBackgrounds();
  }
}

function ensureDiscoverHasTracks() {
  if (!discoverTracks.length) return false;

  if (discoverCurrentTrack < 0 || discoverCurrentTrack >= discoverTracks.length) {
    discoverCurrentTrack = 0;
  }

  return !!getCurrentTrack();
}

function recycleDiscoverTracks() {
  if (!discoverTracks.length) return;

  const current = getCurrentTrack();
  const currentId = current?.id ?? null;
  const shuffled = shuffleArray(discoverTracks);

  if (currentId && shuffled.length > 1 && shuffled[0]?.id === currentId) {
    const swapIndex = shuffled.findIndex(t => t && t.id !== currentId);
    if (swapIndex > 0) {
      [shuffled[0], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[0]];
    }
  }

  if (
    discoverLastTrackId &&
    shuffled.length > 1 &&
    shuffled[0]?.id === discoverLastTrackId
  ) {
    const swapIndex = shuffled.findIndex(t => t && t.id !== discoverLastTrackId);
    if (swapIndex > 0) {
      [shuffled[0], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[0]];
    }
  }

  discoverTracks = shuffled;
  discoverCurrentTrack = 0;
}

function appendUniqueDiscoverTracks(tracks) {
  if (!Array.isArray(tracks) || !tracks.length) return;

  const existingIds = new Set(discoverTracks.map(t => t.id));
  const uniqueNew = [];

  for (const track of tracks) {
    if (!track?.id) continue;

    if (!existingIds.has(track.id)) {
      existingIds.add(track.id);
      uniqueNew.push(track);
    }
  }

  if (!uniqueNew.length) {
    return;
  }

  discoverTracks.push(...shuffleArray(uniqueNew));
  trimDiscoverTrackBuffer();
}

function reorderDiscoverTracksToAvoidImmediateRepeat() {
  if (!discoverTracks.length) return;

  const current = getCurrentTrack();
  const currentId = current?.id ?? null;
  const nextIndex = discoverCurrentTrack + 1;

  if (nextIndex >= discoverTracks.length) return;

  const next = discoverTracks[nextIndex];
  if (!next) return;

  if (currentId && next.id === currentId) {
    const swapIndex = discoverTracks.findIndex((track, index) => {
      return index > nextIndex && track?.id !== currentId;
    });

    if (swapIndex !== -1) {
      [discoverTracks[nextIndex], discoverTracks[swapIndex]] = [
        discoverTracks[swapIndex],
        discoverTracks[nextIndex]
      ];
    }
  }

  if (discoverLastTrackId && next?.id === discoverLastTrackId) {
    const swapIndex = discoverTracks.findIndex((track, index) => {
      return index > nextIndex &&
        track?.id !== discoverLastTrackId &&
        track?.id !== currentId;
    });

    if (swapIndex !== -1) {
      [discoverTracks[nextIndex], discoverTracks[swapIndex]] = [
        discoverTracks[swapIndex],
        discoverTracks[nextIndex]
      ];
    }
  }
}

function trimDiscoverTrackBuffer() {
  if (discoverTracks.length <= DISCOVER_TRACK_BUFFER_LIMIT) return;

  const currentTrackRef = discoverTracks[discoverCurrentTrack] || null;
  const startIndex = Math.max(0, discoverCurrentTrack - 2);
  const trimmed = discoverTracks.slice(startIndex, startIndex + DISCOVER_TRACK_BUFFER_LIMIT);
  const nextCurrentIndex = currentTrackRef ? trimmed.indexOf(currentTrackRef) : -1;

  discoverTracks = trimmed;
  discoverCurrentTrack = nextCurrentIndex >= 0 ? nextCurrentIndex : 0;
}

function clearDiscoverPreloadAudio() {
  if (!discoverPreloadAudio) return;

  try {
    discoverPreloadAudio.pause?.();
    discoverPreloadAudio.removeAttribute?.("src");
    discoverPreloadAudio.load?.();
  } catch {}

  discoverPreloadAudio = null;
}

function preloadNextDiscoverTrack() {
  const next = getNextTrack();
  if (!next?.audioSrc) {
    clearDiscoverPreloadAudio();
    return;
  }

  try {
    clearDiscoverPreloadAudio();

    discoverPreloadAudio = new Audio();
    discoverPreloadAudio.preload = "metadata";
    discoverPreloadAudio.src = next.audioSrc;
  } catch {}
}

function renderDiscoverCards() {
  const current = getCurrentTrack();
  const next = getNextTrack();
  const renderToken = ++discoverRenderToken;

  if (!discoverCard || !discoverNextCard) return;

  if (!current) {
    if (discoverTracks.length > 0) {
      discoverCurrentTrack = 0;
      return renderDiscoverCards();
    }

    discoverCard.innerHTML = discoverAuthRequired ? `
      <div class="discover-card-content discover-card-auth">
        <div class="discover-cover-wrap discover-auth-cover">
          <div class="discover-auth-icon">
            <i class="fa-solid fa-user-lock"></i>
          </div>
          <div class="discover-card-badge discover-card-badge-soft">${discoverT("Нужен аккаунт")}</div>
        </div>

        <div class="discover-track-info">
          <h2>${discoverT("Войди или зарегистрируйся")}</h2>
          <p class="discover-artist">${discoverT("Чтобы свайпать треки, сохранять лайки и собирать плейлисты")}</p>
        </div>

        <div class="discover-auth-actions">
          <button type="button" class="discover-auth-btn discover-auth-btn-primary" data-discover-auth="register">${discoverT("Регистрация")}</button>
          <button type="button" class="discover-auth-btn" data-discover-auth="login">${discoverT("Вход")}</button>
        </div>
      </div>
    ` : `
      <div class="discover-card-content">
        <div class="discover-cover-wrap">
          <div class="discover-cover discover-cover-loading"></div>
          <div class="discover-card-badge discover-card-badge-soft">${discoverT("Загрузка")}</div>
        </div>

        <div class="discover-track-info">
          <h2>${discoverT("Загружаем треки...")}</h2>
          <p class="discover-artist">${discoverT("Подожди секунду")}</p>
        </div>
      </div>
    `;

    discoverCard.style.transition = "none";
    discoverCard.style.transform = "translate3d(0,0,0) rotate(0deg)";
    discoverCard.style.opacity = "1";
    discoverCard.style.pointerEvents = "";
    discoverNextCard.innerHTML = "";
    discoverNextCard.classList.add("is-hidden");
    resetSwipeBackgrounds();
    pauseAndClearDiscoverAudio();

    if (!discoverAuthRequired && !discoverIsLoading) {
      loadDiscoverTracks({ silent: true });
    }
    return;
  }

  discoverCard.innerHTML = buildTrackCardMarkup(current, false);

  if (next) {
    discoverNextCard.innerHTML = buildTrackCardMarkup(next, true);
    discoverNextCard.classList.remove("is-hidden");
  } else {
    discoverNextCard.innerHTML = "";
    discoverNextCard.classList.add("is-hidden");
  }

  discoverCard.style.transition = "none";
  discoverCard.style.transform = "translate3d(0,0,0) rotate(0deg)";
  discoverCard.style.opacity = "1";
  discoverCard.style.pointerEvents = "";

  requestAnimationFrame(() => {
    if (!discoverCard || renderToken !== discoverRenderToken) return;

    discoverCard.style.transition =
      "transform 0.28s ease, opacity 0.28s ease, box-shadow 0.18s ease";
  });

  resetSwipeBackgrounds();

  if (discoverAudio) {
    if (current.audioSrc) {
      const currentSrc = discoverAudio.getAttribute("src") || "";
      if (currentSrc !== current.audioSrc) {
        discoverAudio.src = current.audioSrc;
        discoverAudio.load();
      }
    } else {
      pauseAndClearDiscoverAudio();
    }
  }

  preloadNextDiscoverTrack();
  updateDiscoverPlayButton();
}

function playCurrentDiscoverTrack() {
  const track = getCurrentTrack();
  if (!track || !discoverAudio) return;

  if (track.audioSrc) {
    discoverAudio.play().catch(() => {});
  }

  updateDiscoverPlayButton();
}

function runDiscoverIdleTask(callback) {
  const run = () => {
    try {
      callback();
    } catch (err) {
      console.error("discover idle task error", err);
    }
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 700 });
  } else {
    setTimeout(run, 0);
  }
}

function scheduleDiscoverActionFlush() {
  if (discoverActionFlushTimer || discoverActionInFlight) return;

  discoverActionFlushTimer = setTimeout(() => {
    discoverActionFlushTimer = null;
    flushDiscoverActionQueue();
  }, 80);
}

function flushDiscoverActionQueue() {
  if (discoverActionInFlight) return;

  const nextAction = discoverActionQueue.shift();
  if (!nextAction) return;

  discoverActionInFlight = true;

  sendTrackAction(nextAction.trackId, nextAction.action)
    .catch((err) => {
      console.error("discover queued action error", err);
    })
    .finally(() => {
      discoverActionInFlight = false;
      if (discoverActionQueue.length) {
        scheduleDiscoverActionFlush();
      }
    });
}

function queueDiscoverTrackAction(trackId, action) {
  if (!trackId || !["like", "dislike"].includes(action)) return;

  discoverActionQueue.push({ trackId, action });
  scheduleDiscoverActionFlush();
}

function runDiscoverPostSwipeTasks(direction, track, options = {}) {
  const {
    skipAction = false,
    skipPlaylistSave = false
  } = options;

  runDiscoverIdleTask(() => {
    if (!skipAction) {
      queueDiscoverTrackAction(track?.id, direction === "right" ? "like" : "dislike");
    }

    if (direction === "right" && !skipPlaylistSave) {
      saveLikedDiscoverTrack(track).catch((err) => {
        console.error("discover playlist save error", err);
      });
    }
  });
}

async function sendTrackAction(trackId, action) {
  try {
    await fetch("/track-action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify({ trackId, action, entityType: "profile" })
    });
  } catch (err) {
    console.error("track action error", err);
  }
}

async function saveLikedDiscoverTrack(track) {
  const current = track || getCurrentTrack();
  const selectedPlaylistId = getSelectedDiscoverPlaylistId();
  const api = ensureDiscoverPlaylistApi();

  if (!api || !current || !selectedPlaylistId) return false;

  const added = !!api.addTrackToPlaylist?.(selectedPlaylistId, current);
  const selectedPlaylist = getSelectedDiscoverPlaylist();

  if (added) {
    showDiscoverToast(`Добавлено в плейлист "${selectedPlaylist?.name || "Без названия"}"`);
  } else {
    showDiscoverToast(`Трек уже есть в "${selectedPlaylist?.name || "этом плейлисте"}"`);
  }

  renderDiscoverPlaylistOptions();
  return added;
}

async function loadDiscoverTracks(options = {}) {
  const { append = false, preserveIndex = false, silent = false } = options;

  if (discoverIsLoading) return;
  discoverIsLoading = true;
  const controller = new AbortController();
  discoverLoadAbortController = controller;

  try {
    const res = await fetch("/discover-tracks", {
      signal: controller.signal,
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (!res.ok) {
      console.error("discover status", res.status);
      if (res.status === 401 || res.status === 403) {
        discoverAuthRequired = true;
        discoverTracks = [];
        discoverCurrentTrack = 0;
        renderDiscoverCards();
        return;
      }

      if (!silent && discoverTracks.length === 0) {
        renderDiscoverCards();
      }
      return;
    }

    const data = await res.json();
    discoverAuthRequired = false;

    const normalized = shuffleArray(
      (Array.isArray(data) ? data : [])
        .map(normalizeDiscoverTrack)
        .filter(track => !!track.id)
        .filter(track => !!track.audioSrc || !!track.soundcloud)
    );

    if (append) {
      appendUniqueDiscoverTracks(normalized);
      reorderDiscoverTracksToAvoidImmediateRepeat();
    } else if (normalized.length > 0) {
      discoverTracks = normalized;

      if (!preserveIndex) {
        discoverCurrentTrack = 0;
      } else if (discoverCurrentTrack >= discoverTracks.length) {
        discoverCurrentTrack = 0;
      }

      trimDiscoverTrackBuffer();
      reorderDiscoverTracksToAvoidImmediateRepeat();
    } else {
      if (discoverTracks.length > 0) {
        recycleDiscoverTracks();
      } else {
        console.warn("discover пуст, повторная загрузка...");
        setTimeout(() => {
          loadDiscoverTracks({ silent: true });
        }, 1000);
      }
    }

    if (!append && !silent) {
      renderDiscoverCards();
      playCurrentDiscoverTrack();
    }

    if (append && discoverTracks.length > 0) {
      reorderDiscoverTracksToAvoidImmediateRepeat();
    }
  } catch (err) {
    if (err?.name === "AbortError") return;

    console.error("discover load error", err);

    if (discoverTracks.length === 0 && !silent) {
      renderDiscoverCards();
    }
  } finally {
    if (discoverLoadAbortController === controller) {
      discoverLoadAbortController = null;
    }
    discoverIsLoading = false;
  }
}

function maybeLoadMoreDiscoverTracks() {
  if (discoverAuthRequired) return;
  const remaining = discoverTracks.length - discoverCurrentTrack - 1;

  if (remaining <= 3) {
    loadDiscoverTracks({ append: true, preserveIndex: true, silent: true });
  }
}

function goToNextDiscoverTrack() {
  const current = getCurrentTrack();

  if (current) {
    rememberSeenTrack(current.id);
    discoverHistory.push({
      index: discoverCurrentTrack,
      track: current
    });

    if (discoverHistory.length > DISCOVER_HISTORY_LIMIT) {
      discoverHistory = discoverHistory.slice(-DISCOVER_HISTORY_LIMIT);
    }

    discoverLastTrackId = current.id;
  }

  discoverCurrentTrack += 1;

  if (discoverCurrentTrack >= discoverTracks.length) {
    if (discoverTracks.length < 5) {
      loadDiscoverTracks({ append: true, preserveIndex: true, silent: true });
    }

    if (discoverTracks.length > 1) {
      recycleDiscoverTracks();
    } else {
      discoverCurrentTrack = 0;
    }
  }

  ensureDiscoverHasTracks();
  maybeLoadMoreDiscoverTracks();
  reorderDiscoverTracksToAvoidImmediateRepeat();
  renderDiscoverCards();
  playCurrentDiscoverTrack();
}

async function swipeCurrentTrack(direction, options = {}) {
  const current = getCurrentTrack();
  if (!current || !discoverCard || discoverSwipeLocked) return;
  const {
    skipAction = false,
    skipPlaylistSave = false
  } = options;

  clearDiscoverDragSafetyTimer();
  discoverDragging = false;
  const swipePointerId = discoverPointerId;
  discoverPointerId = null;
  discoverDeltaX = 0;
  releaseDiscoverPointerCapture(swipePointerId);
  discoverSwipeLocked = true;
  const swipeToken = ++discoverSwipeSequence;
  clearDiscoverSwipeUnlockTimer();

  discoverCard.style.pointerEvents = "none";
  discoverCard.style.transition = "transform 0.30s ease, opacity 0.30s ease";
  discoverCard.style.transform =
    direction === "right"
      ? "translate3d(1400px, 0, 0) rotate(28deg)"
      : "translate3d(-1400px, 0, 0) rotate(-28deg)";
  discoverCard.style.opacity = "0";

  setTimeout(() => {
    if (swipeToken !== discoverSwipeSequence) return;

    try {
      goToNextDiscoverTrack();
    } catch (err) {
      console.error("discover swipe transition error", err);
      resetDraggedCard();
      renderDiscoverCards();
      playCurrentDiscoverTrack();
    } finally {
      unlockDiscoverSwipe();
    }

    runDiscoverPostSwipeTasks(direction, current, { skipAction, skipPlaylistSave });
  }, 260);

  discoverSwipeUnlockTimer = setTimeout(() => {
    if (!discoverSwipeLocked || swipeToken !== discoverSwipeSequence) return;

    console.warn("discover swipe fallback unlock");
    unlockDiscoverSwipe();
    cancelDiscoverDrag(false);
    renderDiscoverCards();
  }, 900);
}

function resetDraggedCard() {
  if (!discoverCard) return;

  discoverCard.style.pointerEvents = "";
  discoverCard.style.opacity = "1";
  discoverCard.style.transition = "transform 0.22s ease, box-shadow 0.18s ease";
  discoverCard.style.transform = "translate3d(0,0,0) rotate(0deg)";
  resetSwipeBackgrounds();
}

function handlePointerDown(e) {
  if (!discoverCard || !getCurrentTrack() || discoverSwipeLocked) return;

  const target = e.target;

  if (
    target.closest(".discover-btn") ||
    target.closest(".discover-volume") ||
    target.closest(".discover-progress") ||
    target.closest(".discover-playlist-wrap")
  ) {
    return;
  }

  e.preventDefault();
  discoverDragging = true;
  discoverPointerId = e.pointerId;
  discoverStartX = e.clientX;
  discoverDeltaX = 0;
  discoverCard.style.transition = "none";

  try {
    discoverCard.setPointerCapture?.(e.pointerId);
  } catch {}

  clearDiscoverDragSafetyTimer();
  discoverDragSafetyTimer = setTimeout(() => {
    if (!discoverDragging) return;

    if (discoverDeltaX > 150) {
      swipeCurrentTrack("right");
    } else if (discoverDeltaX < -150) {
      swipeCurrentTrack("left");
    } else {
      cancelDiscoverDrag();
    }
  }, 3500);
}

function handlePointerMove(e) {
  if (discoverSwipeLocked || !discoverDragging || e.pointerId !== discoverPointerId || !discoverCard) return;

  e.preventDefault();
  discoverDeltaX = e.clientX - discoverStartX;

  discoverCard.style.transform = `translate3d(${discoverDeltaX}px, 0, 0) rotate(${discoverDeltaX * 0.06}deg)`;

  setSwipeBackgroundByDelta(discoverDeltaX);
}

function handlePointerEnd(e) {
  if (!discoverDragging) return;
  if (e?.pointerId !== undefined && discoverPointerId !== null && e.pointerId !== discoverPointerId) return;

  clearDiscoverDragSafetyTimer();
  discoverDragging = false;
  const pointerId = discoverPointerId;
  discoverPointerId = null;
  releaseDiscoverPointerCapture(e?.pointerId ?? pointerId);

  if (discoverDeltaX > 150) {
    swipeCurrentTrack("right");
  } else if (discoverDeltaX < -150) {
    swipeCurrentTrack("left");
  } else {
    resetDraggedCard();
  }
}

function bindDiscoverCardEvents() {
  if (!discoverCard || discoverCard.dataset.bound === "1") return;

  discoverCard.dataset.bound = "1";
  discoverCard.addEventListener("pointerdown", handlePointerDown);
  discoverCard.addEventListener("lostpointercapture", handlePointerEnd);
}

function bindDiscoverPointerEvents() {
  if (discoverPointerEventsBound) return;

  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerEnd);
  window.addEventListener("pointercancel", handlePointerEnd);
  window.addEventListener("blur", cancelDiscoverDrag);
  discoverPointerEventsBound = true;
}

function unbindDiscoverCardEvents() {
  if (!discoverCard || discoverCard.dataset.bound !== "1") return;

  discoverCard.removeEventListener("pointerdown", handlePointerDown);
  discoverCard.removeEventListener("lostpointercapture", handlePointerEnd);
  delete discoverCard.dataset.bound;
}

function unbindDiscoverPointerEvents() {
  if (!discoverPointerEventsBound) return;

  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerup", handlePointerEnd);
  window.removeEventListener("pointercancel", handlePointerEnd);
  window.removeEventListener("blur", cancelDiscoverDrag);
  discoverPointerEventsBound = false;
}

function bindDiscoverProgressSeek() {
  if (!discoverProgressTrack || !discoverAudio) return;

  discoverProgressTrack.onclick = (e) => {
    if (!discoverAudio.duration) return;

    const rect = discoverProgressTrack.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.min(Math.max(x / rect.width, 0), 1);

    discoverAudio.currentTime = discoverAudio.duration * ratio;
  };
}

function bindDiscoverAudioEvents() {
  if (!discoverAudio) return;

  discoverAudio.ontimeupdate = () => {
    const percent = discoverAudio.duration
      ? (discoverAudio.currentTime / discoverAudio.duration) * 100
      : 0;

    if (discoverProgress) {
      discoverProgress.style.width = `${percent}%`;
    }
  };

  discoverAudio.onplay = updateDiscoverPlayButton;
  discoverAudio.onpause = updateDiscoverPlayButton;
  discoverAudio.onended = () => {
    if (discoverSwipeLocked || discoverDragging) return;
    goToNextDiscoverTrack();
  };

  discoverAudio.onloadedmetadata = () => {
    if (discoverProgress) {
      const percent = discoverAudio.duration
        ? (discoverAudio.currentTime / discoverAudio.duration) * 100
        : 0;

      discoverProgress.style.width = `${percent}%`;
    }
  };
}

function bindDiscoverVolumeEvents() {
  if (!discoverVolumeRange || !discoverVolumeIcon) return;

  discoverVolumeRange.oninput = () => {
    updateDiscoverFill();

    if (Number(discoverVolumeRange.value) === 0) {
      discoverMuted = true;
    } else {
      discoverMuted = false;
      discoverLastVolume = Number(discoverVolumeRange.value);
    }

    syncVolumeIcons();
    persistDiscoverMuteState();
  };

  discoverVolumeIcon.onclick = () => {
    if (!discoverMuted) {
      discoverLastVolume = Number(discoverVolumeRange.value || 30);
      discoverVolumeRange.value = 0;
      discoverMuted = true;
    } else {
      discoverVolumeRange.value = discoverLastVolume || 30;
      discoverMuted = false;
    }

    updateDiscoverFill();
    syncVolumeIcons();
    persistDiscoverMuteState();
  };
}

function bindDiscoverButtonEvents() {
  if (discoverPlayBtn) {
    discoverPlayBtn.onclick = () => {
      if (!discoverAudio) return;

      if (discoverAudio.paused) {
        discoverAudio.play().catch(() => {});
      } else {
        discoverAudio.pause();
      }

      updateDiscoverPlayButton();
    };
  }

  if (discoverLikeBtn) {
    discoverLikeBtn.onclick = () => {
      if (discoverSwipeLocked) return;
      swipeCurrentTrack("right");
    };
  }

  if (discoverDislikeBtn) {
    discoverDislikeBtn.onclick = () => {
      if (discoverSwipeLocked) return;
      swipeCurrentTrack("left");
    };
  }

  if (discoverBackBtn) {
    discoverBackBtn.onclick = () => {
      const prev = discoverHistory.pop();
      if (!prev) return;

      discoverCurrentTrack = prev.index;
      discoverLastTrackId = null;

      renderDiscoverCards();
      playCurrentDiscoverTrack();
    };
  }

  if (discoverPlaylistTrigger) {
    discoverPlaylistTrigger.onclick = () => {
      toggleDiscoverPlaylistPanel();
    };
  }

  if (discoverPlaylistClose) {
    discoverPlaylistClose.onclick = () => {
      closeDiscoverPlaylistPanel();
    };
  }

  if (discoverPlaylistCreate) {
    discoverPlaylistCreate.onclick = () => {
      const name = prompt("Название плейлиста");
      const trimmed = String(name || "").trim();
      if (!trimmed) return;

      const api = ensureDiscoverPlaylistApi();
      const created = api?.createPlaylist?.(trimmed);
      if (!created?.id) return;

      setSelectedDiscoverPlaylistId(created.id);
      showDiscoverToast(`Плейлист "${created.name}" создан`);
    };
  }
}

window.initDiscoverPage = function () {
  if (discoverInited) {
    window.destroyDiscoverPage?.();
  }

  document.body.classList.add("discover-mode");

  discoverRoot = document.querySelector(".discover-page");
  if (!discoverRoot) return;

  discoverCard = discoverRoot.querySelector(".discover-track-card-active");
  discoverNextCard = discoverRoot.querySelector(".discover-track-card-next");
  discoverAudio = discoverRoot.querySelector("#audioPlayer");
  discoverPlayBtn = discoverRoot.querySelector(".discover-btn-play");
  discoverLikeBtn = discoverRoot.querySelector(".discover-btn-like");
  discoverDislikeBtn = discoverRoot.querySelector(".discover-btn-dislike");
  discoverBackBtn = discoverRoot.querySelector(".discover-btn-back");
  discoverProgress = discoverRoot.querySelector("#progressFill");
  discoverProgressTrack = discoverRoot.querySelector("#discoverProgressTrack");
  discoverVolumeRange = discoverRoot.querySelector("#volumeRange");
  discoverVolumeIcon = discoverRoot.querySelector("#volumeIcon");
  discoverVolumeOn = discoverRoot.querySelector("#volumeOn");
  discoverVolumeOff = discoverRoot.querySelector("#volumeOff");
  discoverBgLeft = discoverRoot.querySelector(".discover-bg-left");
  discoverBgRight = discoverRoot.querySelector(".discover-bg-right");
  discoverPlaylistTrigger = discoverRoot.querySelector("#discoverPlaylistTrigger");
  discoverPlaylistPanel = discoverRoot.querySelector("#discoverPlaylistPanel");
  discoverPlaylistLabel = discoverRoot.querySelector("#discoverPlaylistLabel");
  discoverPlaylistList = discoverRoot.querySelector("#discoverPlaylistList");
  discoverPlaylistClose = discoverRoot.querySelector("#discoverPlaylistClose");
  discoverPlaylistCreate = discoverRoot.querySelector("#discoverPlaylistCreate");
  discoverToast = discoverRoot.querySelector("#discoverToast");

  if (
    !discoverCard ||
    !discoverNextCard ||
    !discoverAudio ||
    !discoverPlayBtn ||
    !discoverLikeBtn ||
    !discoverDislikeBtn ||
    !discoverBackBtn ||
    !discoverProgress ||
    !discoverProgressTrack ||
    !discoverVolumeRange ||
    !discoverVolumeIcon ||
    !discoverVolumeOn ||
    !discoverVolumeOff ||
    !discoverBgLeft ||
    !discoverBgRight ||
    !discoverPlaylistTrigger ||
    !discoverPlaylistPanel ||
    !discoverPlaylistLabel ||
    !discoverPlaylistList ||
    !discoverPlaylistClose ||
    !discoverPlaylistCreate ||
    !discoverToast
  ) {
    console.log("discover init: missing elements");
    return;
  }

  discoverSwipeLocked = false;
  discoverDragging = false;
  discoverPointerId = null;
  discoverDeltaX = 0;
  discoverPlaylistApiInitialized = false;

  bindDiscoverCardEvents();
  bindDiscoverPointerEvents();
  bindDiscoverProgressSeek();
  bindDiscoverAudioEvents();
  bindDiscoverVolumeEvents();
  bindDiscoverButtonEvents();

  ensureDiscoverPlaylistApi({ initialize: true });
  readDiscoverVolumeState();
  updateDiscoverFill();
  updateDiscoverPlaylistLabel();
  renderDiscoverPlaylistOptions();

  discoverRoot.onclick = (event) => {
    const authButton = event.target.closest("[data-discover-auth]");
    if (authButton) {
      const target = authButton.dataset.discoverAuth === "register" ? "/register" : "/login";
      if (typeof navigate === "function") {
        navigate(target);
      } else {
        window.location.href = target;
      }
      return;
    }

    if (!event.target.closest(".discover-playlist-wrap")) {
      closeDiscoverPlaylistPanel();
    }
  };

  window.addEventListener(
    "ritmoria:playlists-updated",
    window.__discoverPlaylistsUpdatedHandler = () => {
      updateDiscoverPlaylistLabel();
      renderDiscoverPlaylistOptions();
    }
  );

  loadDiscoverTracks();

  window.addEventListener(
    "beforeunload",
    window.__discoverBeforeUnloadHandler = () => {
      persistSeenTracksNow();
      document.body.classList.remove("discover-mode");
    },
    { once: true }
  );

  discoverInited = true;
};

window.destroyDiscoverPage = function () {
  cancelDiscoverDrag(false);
  unbindDiscoverCardEvents();
  unbindDiscoverPointerEvents();
  persistSeenTracksNow();
  clearDiscoverPreloadAudio();

  if (discoverLoadAbortController) {
    try {
      discoverLoadAbortController.abort();
    } catch {}
    discoverLoadAbortController = null;
  }

  if (discoverAudio) {
    discoverAudio.pause();
    discoverAudio.ontimeupdate = null;
    discoverAudio.onplay = null;
    discoverAudio.onpause = null;
    discoverAudio.onended = null;
    discoverAudio.onloadedmetadata = null;
  }

  if (discoverPlayBtn) discoverPlayBtn.onclick = null;
  if (discoverLikeBtn) discoverLikeBtn.onclick = null;
  if (discoverDislikeBtn) discoverDislikeBtn.onclick = null;
  if (discoverBackBtn) discoverBackBtn.onclick = null;
  if (discoverVolumeRange) discoverVolumeRange.oninput = null;
  if (discoverVolumeIcon) discoverVolumeIcon.onclick = null;
  if (discoverProgressTrack) discoverProgressTrack.onclick = null;
  if (discoverPlaylistTrigger) discoverPlaylistTrigger.onclick = null;
  if (discoverPlaylistClose) discoverPlaylistClose.onclick = null;
  if (discoverPlaylistCreate) discoverPlaylistCreate.onclick = null;
  if (discoverRoot) discoverRoot.onclick = null;

  if (window.__discoverPlaylistsUpdatedHandler) {
    window.removeEventListener("ritmoria:playlists-updated", window.__discoverPlaylistsUpdatedHandler);
    delete window.__discoverPlaylistsUpdatedHandler;
  }

  if (window.__discoverBeforeUnloadHandler) {
    window.removeEventListener("beforeunload", window.__discoverBeforeUnloadHandler);
    delete window.__discoverBeforeUnloadHandler;
  }

  document.body.classList.remove("discover-mode");

  discoverRoot = null;
  discoverCard = null;
  discoverNextCard = null;
  discoverAudio = null;
  discoverPlayBtn = null;
  discoverLikeBtn = null;
  discoverDislikeBtn = null;
  discoverBackBtn = null;
  discoverProgress = null;
  discoverProgressTrack = null;
  discoverVolumeRange = null;
  discoverVolumeIcon = null;
  discoverVolumeOn = null;
  discoverVolumeOff = null;
  discoverBgLeft = null;
  discoverBgRight = null;
  discoverPlaylistTrigger = null;
  discoverPlaylistPanel = null;
  discoverPlaylistLabel = null;
  discoverPlaylistList = null;
  discoverPlaylistClose = null;
  discoverPlaylistCreate = null;
  discoverToast = null;

  discoverDragging = false;
  discoverStartX = 0;
  discoverDeltaX = 0;
  discoverPointerId = null;
  discoverSwipeLocked = false;
  clearDiscoverSwipeUnlockTimer();
  clearDiscoverDragSafetyTimer();
  discoverPreloadAudio = null;
  discoverIsLoading = false;
  discoverInited = false;
};
