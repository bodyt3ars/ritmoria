(() => {
  if (window.__ritmoriaPlayerLoaded) return;
  window.__ritmoriaPlayerLoaded = true;

  const STORAGE_KEY = "ritmoria_current_track";
  const AUTOPLAY_KEY = "ritmoria_autoplay";
  const FORCE_PAUSED_KEY = "ritmoria_force_paused";
  const REPEAT_KEY = "ritmoria_repeat_track";
  const VOLUME_KEY = "ritmoria_player_volume";
  const LAST_VOLUME_KEY = "ritmoria_player_last_volume";
  const PLAYER_QUEUE_KEY = "ritmoria_player_queue";
  const PLAYER_RECENT_KEY = "ritmoria_player_recent";
  const PLAYER_QUEUE_SOURCE_TAGS_KEY = "ritmoria_player_queue_source_tags";
  const MAX_RECENT_TRACKS = 30;

  let playerReady = false;
  let audioEl = null;
  let scWidgetInstance = null;
  let currentMode = null;
  let lastScPosition = 0;
  let lastScDuration = 0;

  function decodeTokenPayload() {
    try {
      const token = localStorage.getItem("token");
      if (!token) return null;
      const parts = token.split(".");
      if (parts.length < 2) return null;
      return JSON.parse(atob(parts[1]));
    } catch {
      return null;
    }
  }

  function getCurrentUserId() {
    return decodeTokenPayload()?.id || "guest";
  }

  function getPlaylistsStorageKey() {
    return `ritmoria_playlists_user_${getCurrentUserId()}`;
  }

  function normalizeTrackForPlaylist(track) {
    if (!track) return null;

    const globalState = window.getGlobalPlayerState?.();
    const currentTrack = globalState?.track || null;
    const currentDuration = Number(globalState?.duration || 0) || 0;
    const sameAsCurrent =
      currentTrack &&
      (
        (track.id && currentTrack.id && Number(track.id) === Number(currentTrack.id)) ||
        (track.audioSrc && currentTrack.audioSrc && track.audioSrc === currentTrack.audioSrc) ||
        (track.soundcloud && currentTrack.soundcloud && track.soundcloud === currentTrack.soundcloud)
      );

    return {
      id: Number(track.id) || 0,
      title: track.title || "Без названия",
      artist: track.artist || "Unknown artist",
      artist_mentions: Array.isArray(track.artist_mentions) ? track.artist_mentions : [],
      cover: track.cover || "/images/default-cover.jpg",
      audioSrc: track.audioSrc || "",
      soundcloud: track.soundcloud || "",
      slug: track.slug || "",
      username_tag: track.username_tag || "",
      playlist_source_id: track.playlist_source_id || "",
      duration: Number(track.duration || (sameAsCurrent ? currentDuration : 0) || 0) || 0,
      addedAt: track.addedAt || Date.now()
    };
  }

  function ensureFavoritesPlaylist(playlists) {
    let list = Array.isArray(playlists) ? [...playlists] : [];

    let favorites = list.find((p) => p && p.id === "favorites");

    if (!favorites) {
      favorites = {
        id: "favorites",
        name: "Любимые треки",
        system: true,
        cover: "",
        tracks: []
      };
      list.unshift(favorites);
    }

    favorites.name = "Любимые треки";
    favorites.system = true;
    favorites.tracks = Array.isArray(favorites.tracks) ? favorites.tracks : [];

    const others = list.filter((p) => p && p.id !== "favorites");

    return [
      favorites,
      ...others.map((p) => ({
        id: p.id || `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: p.name || "Без названия",
        system: !!p.system,
        cover: p.cover || "",
        tracks: Array.isArray(p.tracks) ? p.tracks : []
      }))
    ];
  }

  function getAllPlaylistsRaw() {
    try {
      const raw = JSON.parse(localStorage.getItem(getPlaylistsStorageKey()) || "[]");
      return ensureFavoritesPlaylist(raw);
    } catch {
      return ensureFavoritesPlaylist([]);
    }
  }

  function saveAllPlaylistsRaw(playlists) {
    const safe = ensureFavoritesPlaylist(playlists);
    localStorage.setItem(getPlaylistsStorageKey(), JSON.stringify(safe));
    return safe;
  }

  function ensurePlaylistApi() {
    if (window.RitmoriaPlaylists) {
      try {
        window.RitmoriaPlaylists.ensureInitialized?.();
        return;
      } catch {}
    }

    window.RitmoriaPlaylists = {
      getAll() {
        return getAllPlaylistsRaw();
      },

      getById(playlistId) {
        return getAllPlaylistsRaw().find((p) => p.id === playlistId) || null;
      },

      getFavorites() {
        return getAllPlaylistsRaw().find((p) => p.id === "favorites") || null;
      },

      ensureInitialized() {
        saveAllPlaylistsRaw(getAllPlaylistsRaw());
      },

      createPlaylist(name) {
        const trimmed = String(name || "").trim();
        if (!trimmed) return null;

        const playlists = getAllPlaylistsRaw();
        const playlist = {
          id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: trimmed,
          system: false,
          cover: "",
          tracks: []
        };

        playlists.push(playlist);
        saveAllPlaylistsRaw(playlists);
        window.dispatchEvent(new CustomEvent("ritmoria:playlists-updated"));
        return playlist;
      },

      isTrackInFavorites(trackId) {
        const favorites = getAllPlaylistsRaw().find((p) => p.id === "favorites");
        if (!favorites) return false;
        return favorites.tracks.some((t) => Number(t.id) === Number(trackId));
      },

      isTrackInPlaylist(playlistId, trackId) {
        const playlist = getAllPlaylistsRaw().find((p) => p.id === playlistId);
        if (!playlist) return false;
        return playlist.tracks.some((t) => Number(t.id) === Number(trackId));
      },

      isTrackInAnyPlaylist(trackId) {
        return getAllPlaylistsRaw().some((playlist) =>
          Array.isArray(playlist?.tracks) &&
          playlist.tracks.some((t) => Number(t.id) === Number(trackId))
        );
      },

      addTrackToPlaylist(playlistId, track) {
        const playlists = getAllPlaylistsRaw();
        const playlist = playlists.find((p) => p.id === playlistId);
        const normalized = normalizeTrackForPlaylist(track);

        if (!playlist || !normalized || !normalized.id) return false;

        const exists = playlist.tracks.some((t) => Number(t.id) === Number(normalized.id));
        if (exists) return false;

        playlist.tracks.unshift(normalized);

        if (!playlist.cover && normalized.cover) {
          playlist.cover = normalized.cover;
        }

        saveAllPlaylistsRaw(playlists);
        window.dispatchEvent(new CustomEvent("ritmoria:playlists-updated"));
        return true;
      },

      removeTrackFromPlaylist(playlistId, trackId) {
        const playlists = getAllPlaylistsRaw();
        const playlist = playlists.find((p) => p.id === playlistId);
        if (!playlist) return false;

        const before = playlist.tracks.length;
        playlist.tracks = playlist.tracks.filter((t) => Number(t.id) !== Number(trackId));

        if (!playlist.system && playlist.tracks.length === 0) {
          playlist.cover = "";
        }

        saveAllPlaylistsRaw(playlists);
        window.dispatchEvent(new CustomEvent("ritmoria:playlists-updated"));
        return before !== playlist.tracks.length;
      },

      toggleTrackInFavorites(track) {
        const normalized = normalizeTrackForPlaylist(track);
        if (!normalized || !normalized.id) return { added: false, removed: false };

        const playlists = getAllPlaylistsRaw();
        const favorites = playlists.find((p) => p.id === "favorites");
        if (!favorites) return { added: false, removed: false };

        const exists = favorites.tracks.some((t) => Number(t.id) === Number(normalized.id));

        if (exists) {
          favorites.tracks = favorites.tracks.filter((t) => Number(t.id) !== Number(normalized.id));
          saveAllPlaylistsRaw(playlists);
          window.dispatchEvent(new CustomEvent("ritmoria:playlists-updated"));
          return { added: false, removed: true };
        }

        favorites.tracks.unshift(normalized);
        if (!favorites.cover && normalized.cover) {
          favorites.cover = normalized.cover;
        }

        saveAllPlaylistsRaw(playlists);
        window.dispatchEvent(new CustomEvent("ritmoria:playlists-updated"));
        return { added: true, removed: false };
      }
    };

    window.RitmoriaPlaylists.ensureInitialized();
  }

  function getCurrentTrackFromStorage() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch {
      return null;
    }
  }

  function safeParseList(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function normalizePlayableTrack(track, extra = {}) {
    if (!track) return null;

    const audioSrc = track.audioSrc || (
      track.audio ? `/${String(track.audio).replace(/^\/+/, "")}` : ""
    );

    const cover = track.cover
      ? (String(track.cover).startsWith("http") ? track.cover : `/${String(track.cover).replace(/^\/+/, "")}`)
      : "/images/default-cover.jpg";

    return {
      id: Number(track.id) || 0,
      title: track.title || "Unknown track",
      artist: track.artist || "Unknown artist",
      artist_mentions: Array.isArray(track.artist_mentions) ? track.artist_mentions : [],
      cover,
      audioSrc,
      soundcloud: track.soundcloud || "",
      slug: track.slug || "",
      username_tag: track.username_tag || track.tag || "",
      playlist_source_id: track.playlist_source_id || extra.playlist_source_id || "",
      profile_source_tag: track.profile_source_tag || extra.profile_source_tag || track.username_tag || "",
      play_context: track.play_context || extra.play_context || (
        track.playlist_source_id || extra.playlist_source_id ? "playlist" : ""
      ),
      duration: Number(track.duration || extra.duration || 0) || 0,
      addedAt: track.addedAt || Date.now()
    };
  }

  function escapePlayerMetaHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderStoredPlayerArtistMarkup(track, { clickable = true } = {}) {
    const artistValue = String(track?.artist || "Unknown artist");
    const mentions = Array.isArray(track?.artist_mentions) ? track.artist_mentions : [];

    if (!mentions.length) {
      if (!clickable || !track?.username_tag) {
        return escapePlayerMetaHtml(artistValue);
      }

      return `<a href="/${encodeURIComponent(track.username_tag)}" class="gp-artist-link" data-player-artist-tag="${escapePlayerMetaHtml(track.username_tag)}">${escapePlayerMetaHtml(artistValue)}</a>`;
    }

    const mentionMap = new Map(
      mentions.map((user) => [
        String(user?.username_tag || "").toLowerCase(),
        user
      ])
    );

    const regex = /@([a-zA-Z0-9_]{2,50})/g;
    let lastIndex = 0;
    let html = "";
    let match;
    let matchedMentions = 0;

    while ((match = regex.exec(artistValue)) !== null) {
      html += escapePlayerMetaHtml(artistValue.slice(lastIndex, match.index));

      const tag = String(match[1] || "").toLowerCase();
      const mentionedUser = mentionMap.get(tag);

      if (mentionedUser) {
        const safeTag = String(mentionedUser.username_tag || "");
        const displayName = String(mentionedUser.username || mentionedUser.username_tag || match[1]);

        if (clickable && safeTag) {
          html += `<a href="/${encodeURIComponent(safeTag)}" class="gp-artist-link" data-player-artist-tag="${escapePlayerMetaHtml(safeTag)}">${escapePlayerMetaHtml(displayName)}</a>`;
        } else {
          html += escapePlayerMetaHtml(displayName);
        }
        matchedMentions += 1;
      } else {
        html += escapePlayerMetaHtml(match[0]);
      }

      lastIndex = regex.lastIndex;
    }

    if (matchedMentions === 0 && mentions.length) {
      return mentions.map((mentionedUser) => {
        const safeTag = String(mentionedUser.username_tag || "");
        const displayName = String(mentionedUser.username || mentionedUser.username_tag || "user");

        if (clickable && safeTag) {
          return `<a href="/${encodeURIComponent(safeTag)}" class="gp-artist-link" data-player-artist-tag="${escapePlayerMetaHtml(safeTag)}">${escapePlayerMetaHtml(displayName)}</a>`;
        }

        return escapePlayerMetaHtml(displayName);
      }).join(", ");
    }

    html += escapePlayerMetaHtml(artistValue.slice(lastIndex));
    return html;
  }

  function isSamePlayableTrack(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id && Number(a.id) === Number(b.id)) return true;
    if (a.audioSrc && b.audioSrc && a.audioSrc === b.audioSrc) return true;
    if (a.soundcloud && b.soundcloud && a.soundcloud === b.soundcloud) return true;
    return false;
  }

  function getPlayerQueue() {
    return safeParseList(PLAYER_QUEUE_KEY).map((track) => normalizePlayableTrack(track)).filter(Boolean);
  }

  function savePlayerQueue(queue) {
    localStorage.setItem(
      PLAYER_QUEUE_KEY,
      JSON.stringify((Array.isArray(queue) ? queue : []).map((track) => normalizePlayableTrack(track)).filter(Boolean))
    );
    window.dispatchEvent(new CustomEvent("ritmoria:player-queue-updated"));
  }

  function popNextQueuedTrack() {
    const queue = getPlayerQueue();
    const next = queue.shift();
    savePlayerQueue(queue);
    return next || null;
  }

  function getRecentTracks() {
    return safeParseList(PLAYER_RECENT_KEY).map((track) => normalizePlayableTrack(track)).filter(Boolean);
  }

  function saveRecentTracks(tracks) {
    localStorage.setItem(
      PLAYER_RECENT_KEY,
      JSON.stringify((Array.isArray(tracks) ? tracks : []).slice(0, MAX_RECENT_TRACKS))
    );
  }

  function pushRecentTrack(track) {
    const normalized = normalizePlayableTrack(track);
    if (!normalized?.id && !normalized?.audioSrc && !normalized?.soundcloud) return;

    const recent = getRecentTracks().filter((item) => !isSamePlayableTrack(item, normalized));
    recent.unshift({
      ...normalized,
      playedAt: Date.now()
    });
    saveRecentTracks(recent);
    window.dispatchEvent(new CustomEvent("ritmoria:player-queue-updated"));
  }

  function getStoredQueueSourceTags() {
    return safeParseList(PLAYER_QUEUE_SOURCE_TAGS_KEY)
      .map((tag) => String(tag || "").trim())
      .filter(Boolean);
  }

  function rememberQueueSourceTag(track) {
    const tag = String(track?.username_tag || track?.profile_source_tag || "").trim();
    if (!tag) return;

    const tags = getStoredQueueSourceTags().filter((item) => item !== tag);
    tags.unshift(tag);
    localStorage.setItem(PLAYER_QUEUE_SOURCE_TAGS_KEY, JSON.stringify(tags.slice(0, 12)));
  }

  function setLikeButtonVisual(button, liked) {
    if (!button) return;

    button.classList.toggle("active", !!liked);
    button.innerHTML = liked
      ? `<i class="fa-solid fa-heart"></i>`
      : `<i class="fa-regular fa-heart"></i>`;
  }

  async function fetchTrackLikeState(trackId) {
    if (!trackId) return null;

    try {
      const res = await fetch(`/api/track-likes/${trackId}`, {
        headers: localStorage.getItem("token")
          ? { Authorization: "Bearer " + localStorage.getItem("token") }
          : {}
      });

      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.log("like state sync error", e);
      return null;
    }
  }

  function getStoredVolume() {
    const raw = Number(localStorage.getItem(VOLUME_KEY));
    if (Number.isFinite(raw)) {
      return Math.max(0, Math.min(1, raw));
    }
    return 0.78;
  }

  function getLastAudibleVolume() {
    const raw = Number(localStorage.getItem(LAST_VOLUME_KEY));
    if (Number.isFinite(raw) && raw > 0) {
      return Math.max(0.05, Math.min(1, raw));
    }
    return 0.78;
  }

  function isRepeatEnabled() {
    return localStorage.getItem(REPEAT_KEY) === "1";
  }

  function ensurePlayerMarkup() {
    let host = document.getElementById("player");

    if (!host) {
      host = document.createElement("div");
      host.id = "player";
      document.body.appendChild(host);
    }

    if (!document.getElementById("global-player")) {
      host.innerHTML = `
        <div id="global-player" class="global-player hidden">
          <div class="gp-left">
            <div id="gp-cover-wrap" class="gp-cover-wrap">
              <img id="gp-cover" class="gp-cover" src="/images/default-avatar.jpg" alt="cover">
            </div>

            <div class="gp-meta-row">
              <div class="gp-meta">
                <div id="gp-title" class="gp-title">Ничего не играет</div>
                <div id="gp-artist" class="gp-artist">—</div>
              </div>

              <button id="gp-add" class="gp-icon-btn gp-add-btn" type="button" title="Добавить в плейлист">
                <i class="fa-solid fa-plus"></i>
              </button>
            </div>
          </div>

          <div class="gp-center">
            <div class="gp-controls">
              <button id="gp-prev" class="gp-control-btn gp-transport-btn" type="button" title="Предыдущий трек">
                <i class="fa-solid fa-backward-step"></i>
              </button>

              <button id="gp-play" class="gp-btn gp-btn-play" type="button" title="Воспроизвести">
                <i class="fa-solid fa-play"></i>
              </button>

              <button id="gp-next" class="gp-control-btn gp-transport-btn" type="button" title="Следующий трек">
                <i class="fa-solid fa-forward-step"></i>
              </button>

              <button id="gp-repeat" class="gp-control-btn gp-repeat-btn" type="button" title="Повтор текущего трека">
                <i class="fa-solid fa-repeat"></i>
              </button>
            </div>

            <div class="gp-progress-row">
              <span id="gp-current" class="gp-time">0:00</span>
              <input id="gp-progress" class="gp-progress" type="range" min="0" max="100" value="0">
              <span id="gp-duration" class="gp-time">0:00</span>
            </div>
          </div>

          <div class="gp-right">
            <div class="gp-actions">
              <button id="gp-like" class="gp-icon-btn" type="button" title="Лайк">
                <i class="fa-regular fa-heart"></i>
              </button>

              <button id="gp-queue" class="gp-icon-btn" type="button" title="Очередь">
                <i class="fa-solid fa-list"></i>
              </button>
            </div>

            <div class="gp-volume-wrap">
              <button id="gp-volume-toggle" class="gp-icon-btn gp-volume-toggle" type="button" title="Включить или выключить звук">
                <i class="fa-solid fa-volume-high"></i>
              </button>

              <input id="gp-volume" class="gp-volume" type="range" min="0" max="1" step="0.01" value="0.78">
            </div>

            <button id="gp-hide" class="gp-hide" type="button" title="Скрыть плеер">✕</button>
          </div>
        </div>

          <div id="gp-playlist-modal" class="gp-playlist-modal gp-hidden">
  <div class="gp-playlist-modal-card">
    <div class="gp-playlist-modal-fixed">
      <div class="gp-playlist-modal-title">Добавить в плейлист</div>

      <input
        id="gp-playlist-search"
        class="gp-playlist-search"
        type="text"
        placeholder="Поиск плейлиста"
      >

      <button id="gp-open-create-playlist" class="gp-playlist-create-btn" type="button">
        + Новый плейлист
      </button>

      <div id="gp-favorites-shortcut" class="gp-playlist-favorites-shortcut"></div>

      <div class="gp-playlist-divider"></div>
    </div>

    <div id="gp-playlist-list" class="gp-playlist-list"></div>

    <div class="gp-playlist-footer">
      <button id="gp-playlist-cancel" class="gp-playlist-cancel" type="button">
        Отмена
      </button>
    </div>
  </div>
</div>

          <div id="gp-create-playlist-modal" class="gp-playlist-modal gp-hidden">
            <div class="gp-playlist-modal-card gp-playlist-modal-card-small">
              <div class="gp-playlist-modal-title">Новый плейлист</div>

              <input
                id="gp-create-playlist-input"
                class="gp-playlist-search"
                type="text"
                placeholder="Название плейлиста"
                maxlength="40"
              >

              <div class="gp-create-actions">
                <button id="gp-create-playlist-save" class="gp-playlist-create-btn" type="button">
                  Создать
                </button>

                <button id="gp-create-playlist-cancel" class="gp-playlist-cancel" type="button">
                  Отмена
                </button>
              </div>
            </div>
          </div>

          <aside id="gp-queue-panel" class="gp-queue-panel gp-hidden" aria-label="Очередь плеера">
            <div class="gp-queue-head">
              <div>
                <div class="gp-queue-kicker">Плеер</div>
                <div class="gp-queue-title">Очередь</div>
              </div>

              <button id="gp-queue-close" class="gp-queue-close" type="button" title="Закрыть очередь">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div class="gp-queue-tabs">
              <button class="gp-queue-tab active" type="button" data-queue-tab="queue">Очередь</button>
              <button class="gp-queue-tab" type="button" data-queue-tab="recent">Недавно</button>
            </div>

            <div class="gp-queue-toolbar">
              <button id="gp-queue-add-current" class="gp-queue-add-current" type="button">
                <i class="fa-solid fa-plus"></i>
                <span>Добавить текущий трек</span>
              </button>
            </div>

            <div id="gp-queue-content" class="gp-queue-content"></div>
          </aside>

          <div id="gp-context-menu" class="gp-context-menu gp-hidden">
            <button id="gp-context-add-to-playlist" class="gp-context-item" type="button">
              <i class="fa-solid fa-plus"></i>
              <span>Добавить в плейлист</span>
            </button>

            <button id="gp-context-favorites-toggle" class="gp-context-item" type="button">
              <i class="fa-solid fa-star"></i>
              <span id="gp-context-favorites-label">Добавить в любимые треки</span>
            </button>

            <button id="gp-context-queue" class="gp-context-item" type="button">
              <i class="fa-solid fa-list"></i>
              <span>Добавить в очередь</span>
            </button>

            <div class="gp-context-submenu-wrap">
              <button id="gp-context-share-trigger" class="gp-context-item gp-context-item-trigger" type="button">
                <i class="fa-solid fa-share-nodes"></i>
                <span>Поделиться</span>
                <i class="fa-solid fa-chevron-right gp-context-arrow"></i>
              </button>

              <div class="gp-context-submenu">
                <button id="gp-context-copy-link" class="gp-context-item gp-context-subitem" type="button">
                  <i class="fa-solid fa-link"></i>
                  <span>Копировать ссылку</span>
                </button>
              </div>
            </div>

            <button id="gp-context-view-author" class="gp-context-item" type="button">
              <i class="fa-solid fa-user"></i>
              <span>Посмотреть автора</span>
            </button>
          </div>

          <audio id="global-audio"></audio>
          <div id="gp-sc-host" class="gp-sc-host"></div>
      `;
    }

    audioEl = document.getElementById("global-audio");

    if (playerReady) return;
    playerReady = true;

    ensurePlaylistApi();

    const playBtn = document.getElementById("gp-play");
    const prevBtn = document.getElementById("gp-prev");
    const nextBtn = document.getElementById("gp-next");
    const repeatBtn = document.getElementById("gp-repeat");
    const progress = document.getElementById("gp-progress");
    const volume = document.getElementById("gp-volume");
    const volumeToggleBtn = document.getElementById("gp-volume-toggle");
    const hideBtn = document.getElementById("gp-hide");

    const addBtn = document.getElementById("gp-add");
    const likeBtn = document.getElementById("gp-like");
    const queueBtn = document.getElementById("gp-queue");

    const playlistModal = document.getElementById("gp-playlist-modal");
    const playlistModalCard = playlistModal?.querySelector(".gp-playlist-modal-card");
    const playlistList = document.getElementById("gp-playlist-list");
    const playlistSearch = document.getElementById("gp-playlist-search");
    const playlistCancel = document.getElementById("gp-playlist-cancel");
    const favoritesShortcut = document.getElementById("gp-favorites-shortcut");

    const openCreatePlaylistBtn = document.getElementById("gp-open-create-playlist");
    const createPlaylistModal = document.getElementById("gp-create-playlist-modal");
    const createPlaylistModalCard = createPlaylistModal?.querySelector(".gp-playlist-modal-card");
    const createPlaylistInput = document.getElementById("gp-create-playlist-input");
    const createPlaylistSave = document.getElementById("gp-create-playlist-save");
    const createPlaylistCancel = document.getElementById("gp-create-playlist-cancel");

    const contextMenu = document.getElementById("gp-context-menu");
    const contextAddToPlaylist = document.getElementById("gp-context-add-to-playlist");
    const contextFavoritesToggle = document.getElementById("gp-context-favorites-toggle");
    const contextFavoritesLabel = document.getElementById("gp-context-favorites-label");
    const contextQueue = document.getElementById("gp-context-queue");
    const contextCopyLink = document.getElementById("gp-context-copy-link");
    const contextViewAuthor = document.getElementById("gp-context-view-author");
    const queuePanel = document.getElementById("gp-queue-panel");
    const queueCloseBtn = document.getElementById("gp-queue-close");
    const queueAddCurrentBtn = document.getElementById("gp-queue-add-current");
    const queueContent = document.getElementById("gp-queue-content");
    const queueTabs = Array.from(document.querySelectorAll("[data-queue-tab]"));

    const coverWrap = document.getElementById("gp-cover-wrap");
    const titleEl = document.getElementById("gp-title");
    const artistEl = document.getElementById("gp-artist");
    let playlistModalAnchor = addBtn || null;
    let createPlaylistModalAnchor = openCreatePlaylistBtn || addBtn || null;
    let activeQueueTab = "queue";

    if (volume) {
      volume.value = String(getStoredVolume());
    }

    function getCurrentTrackUrl(track = getCurrentTrackFromStorage()) {
      if (!track?.username_tag || !track?.slug) return "";
      return `${location.origin}/${track.username_tag}/${track.slug}`;
    }

    function navigateFromPlayer(path) {
      const target = String(path || "").trim();
      if (!target) return;

      if (typeof window.navigate === "function") {
        window.navigate(target);
        return;
      }

      window.location.href = target;
    }

    function closeContextMenu() {
      contextMenu?.classList.add("gp-hidden");
    }

    function closePlaylistModal() {
      playlistModal?.classList.add("gp-hidden");
      playlistModalAnchor = addBtn || null;
    }

    function positionPopupNearAnchor(card, anchorEl, options = {}) {
      if (!card || !anchorEl) return;

      const gap = Number(options.gap || 12);
      const margin = 12;

      card.style.left = `${margin}px`;
      card.style.top = `${margin}px`;

      const anchorRect = anchorEl.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const anchorCenter = anchorRect.left + anchorRect.width / 2;

      let left = anchorRect.right - cardRect.width;
      left = Math.max(margin, Math.min(left, viewportWidth - cardRect.width - margin));

      let top = anchorRect.top - cardRect.height - gap;
      let placement = "top";
      const minTop = margin;
      const maxTop = viewportHeight - cardRect.height - margin;

      if (top < minTop) {
        top = Math.min(anchorRect.bottom + gap, maxTop);
        placement = "bottom";
      }

      top = Math.max(minTop, Math.min(top, maxTop));

      card.dataset.popPlacement = placement;
      card.style.setProperty(
        "--gp-pop-anchor-x",
        `${Math.max(28, Math.min(cardRect.width - 28, anchorCenter - left))}px`
      );
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
    }

    function positionPlaylistModal(anchorEl = addBtn) {
      positionPopupNearAnchor(playlistModalCard, anchorEl || addBtn, { gap: 12 });
    }

    function positionCreatePlaylistModal(anchorEl = openCreatePlaylistBtn || addBtn) {
      positionPopupNearAnchor(createPlaylistModalCard, anchorEl || addBtn, { gap: 10 });
    }

    function openPlaylistModal(anchorEl = addBtn) {
      const track = getCurrentTrackFromStorage();
      if (!track || !track.title) return;

      closeContextMenu();
      playlistModalAnchor = anchorEl || addBtn || null;
      renderPlaylistPicker("");
      if (playlistSearch) playlistSearch.value = "";
      playlistModal?.classList.remove("gp-hidden");
      requestAnimationFrame(() => {
        positionPlaylistModal(playlistModalAnchor || addBtn);
        playlistSearch?.focus();
      });
    }

    function closeCreatePlaylistModal() {
      createPlaylistModal?.classList.add("gp-hidden");
      if (createPlaylistInput) createPlaylistInput.value = "";
      createPlaylistModalAnchor = openCreatePlaylistBtn || addBtn || null;
    }

    function openCreatePlaylistModal(anchorEl = openCreatePlaylistBtn || addBtn) {
      closeContextMenu();
      createPlaylistModalAnchor = anchorEl || openCreatePlaylistBtn || addBtn || null;
      createPlaylistModal?.classList.remove("gp-hidden");
      requestAnimationFrame(() => {
        positionCreatePlaylistModal(createPlaylistModalAnchor || openCreatePlaylistBtn || addBtn);
        createPlaylistInput?.focus();
      });
    }

    function positionContextMenu(x, y) {
      if (!contextMenu) return;

      contextMenu.style.left = "12px";
      contextMenu.style.top = "12px";
      contextMenu.classList.remove("gp-hidden");

      const rect = contextMenu.getBoundingClientRect();
      const safeLeft = Math.max(12, Math.min(x, window.innerWidth - rect.width - 12));
      const safeTop = Math.max(12, Math.min(y, window.innerHeight - rect.height - 12));

      contextMenu.style.left = `${safeLeft}px`;
      contextMenu.style.top = `${safeTop}px`;
    }

    function syncContextMenuState(track = getCurrentTrackFromStorage()) {
      if (!contextFavoritesLabel || !window.RitmoriaPlaylists) return;

      const inFavorites = track?.id
        ? window.RitmoriaPlaylists.isTrackInFavorites?.(track.id)
        : false;

      contextFavoritesLabel.textContent = inFavorites
        ? "Удалить из любимых треков"
        : "Добавить в любимые треки";
    }

    function openTrackContextMenu(x, y) {
      const track = getCurrentTrackFromStorage();
      if (!track?.id) return;

      closePlaylistModal();
      closeCreatePlaylistModal();
      syncContextMenuState(track);
      positionContextMenu(x, y);
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function renderPlayerArtistMarkup(track, { clickable = true } = {}) {
      const artistValue = String(track?.artist || "Unknown artist");
      const mentions = Array.isArray(track?.artist_mentions) ? track.artist_mentions : [];

      if (!mentions.length) {
        if (!clickable || !track?.username_tag) {
          return escapeHtml(artistValue);
        }

        return `<a href="/${encodeURIComponent(track.username_tag)}" class="gp-artist-link" data-player-artist-tag="${escapeHtml(track.username_tag)}">${escapeHtml(artistValue)}</a>`;
      }

      const mentionMap = new Map(
        mentions.map((user) => [
          String(user?.username_tag || "").toLowerCase(),
          user
        ])
      );

      const regex = /@([a-zA-Z0-9_]{2,50})/g;
      let lastIndex = 0;
      let html = "";
      let match;

      while ((match = regex.exec(artistValue)) !== null) {
        html += escapeHtml(artistValue.slice(lastIndex, match.index));

        const tag = String(match[1] || "").toLowerCase();
        const mentionedUser = mentionMap.get(tag);

        if (mentionedUser) {
          const safeTag = String(mentionedUser.username_tag || "");
          const displayName = String(mentionedUser.username || mentionedUser.username_tag || match[1]);

          if (clickable && safeTag) {
            html += `<a href="/${encodeURIComponent(safeTag)}" class="gp-artist-link" data-player-artist-tag="${escapeHtml(safeTag)}">${escapeHtml(displayName)}</a>`;
          } else {
            html += escapeHtml(displayName);
          }
        } else {
          html += escapeHtml(match[0]);
        }

        lastIndex = regex.lastIndex;
      }

      html += escapeHtml(artistValue.slice(lastIndex));
      return html;
    }

    function closeQueuePanel() {
      queuePanel?.classList.add("gp-hidden");
    }

    function openQueuePanel(tab = activeQueueTab) {
      activeQueueTab = tab === "recent" ? "recent" : "queue";
      closeContextMenu();
      closePlaylistModal();
      closeCreatePlaylistModal();
      renderQueuePanel();
      queuePanel?.classList.remove("gp-hidden");
    }

    function toggleQueuePanel(tab = activeQueueTab) {
      if (!queuePanel) return;

      if (!queuePanel.classList.contains("gp-hidden")) {
        closeQueuePanel();
        return;
      }

      openQueuePanel(tab);
    }

    function addTrackToQueue(track, options = {}) {
      const normalized = normalizePlayableTrack(track || getCurrentTrackFromStorage(), {
        play_context: "queue"
      });

      if (!normalized?.id && !normalized?.audioSrc && !normalized?.soundcloud) return false;

      const queue = getPlayerQueue();
      const allowDuplicate = !!options.allowDuplicate;
      const exists = queue.some((item) => isSamePlayableTrack(item, normalized));

      if (!allowDuplicate && exists) return false;

      queue.push({
        ...normalized,
        play_context: normalized.play_context || "queue",
        queuedAt: Date.now()
      });
      rememberQueueSourceTag(normalized);
      savePlayerQueue(queue);
      return true;
    }

    function removeQueuedTrack(index) {
      const queue = getPlayerQueue();
      if (index < 0 || index >= queue.length) return;
      queue.splice(index, 1);
      savePlayerQueue(queue);
      renderQueuePanel();
    }

    function playQueuedTrack(index) {
      const queue = getPlayerQueue();
      const track = queue[index];
      if (!track) return;
      queue.splice(index, 1);
      savePlayerQueue(queue);
      window.playTrackGlobal({
        ...track,
        play_context: track.play_context || "queue"
      });
      renderQueuePanel();
    }

    function playRecentTrack(index) {
      const track = getRecentTracks()[index];
      if (!track) return;
      window.playTrackGlobal(track, { skipHistory: true });
      renderQueuePanel();
    }

    function renderQueueTrack(track, options = {}) {
      const { index = 0, mode = "queue", current = false } = options;
      const cover = escapeHtml(track?.cover || "/images/default-cover.jpg");
      const title = escapeHtml(track?.title || "Без названия");
      const artist = renderPlayerArtistMarkup(track, { clickable: true });

      return `
        <div class="gp-queue-track ${current ? "is-current" : ""}" data-queue-mode="${mode}" data-queue-index="${index}">
          <button class="gp-queue-track-play" type="button" title="${current ? "Сейчас играет" : "Включить"}">
            <i class="fa-solid ${current ? "fa-volume-high" : "fa-play"}"></i>
          </button>

          <img class="gp-queue-track-cover" src="${cover}" alt="">

          <div class="gp-queue-track-meta">
            <div class="gp-queue-track-title">${title}</div>
            <div class="gp-queue-track-artist">${artist}</div>
          </div>

          ${mode === "queue" ? `
            <button class="gp-queue-track-remove" type="button" title="Убрать из очереди">
              <i class="fa-solid fa-xmark"></i>
            </button>
          ` : ""}
        </div>
      `;
    }

    function renderQueuePanel() {
      if (!queueContent) return;

      queueTabs.forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.queueTab === activeQueueTab);
      });

      const current = getCurrentTrackFromStorage();
      const queue = getPlayerQueue();
      const recent = getRecentTracks();

      if (activeQueueTab === "recent") {
        queueContent.innerHTML = recent.length
          ? `
            <div class="gp-queue-section">
              <div class="gp-queue-section-title">Недавно слушали</div>
              ${recent.map((track, index) => renderQueueTrack(track, { index, mode: "recent" })).join("")}
            </div>
          `
          : `<div class="gp-queue-empty">История появится после прослушивания нескольких треков.</div>`;
      } else {
        queueContent.innerHTML = `
          <div class="gp-queue-section">
            <div class="gp-queue-section-title">Сейчас играет</div>
            ${current ? renderQueueTrack(current, { current: true, mode: "current" }) : `<div class="gp-queue-empty">Пока ничего не играет.</div>`}
          </div>

          <div class="gp-queue-section">
            <div class="gp-queue-section-row">
              <div class="gp-queue-section-title">Дальше</div>
              ${queue.length ? `<button id="gp-queue-clear" class="gp-queue-clear" type="button">Очистить</button>` : ""}
            </div>
            ${queue.length
              ? queue.map((track, index) => renderQueueTrack(track, { index, mode: "queue" })).join("")
              : `<div class="gp-queue-empty">Добавь треки через меню, и они появятся здесь.</div>`
            }
          </div>
        `;
      }

      queueContent.querySelectorAll(".gp-queue-track").forEach((row) => {
        const mode = row.dataset.queueMode;
        const index = Number(row.dataset.queueIndex || 0);

        row.querySelectorAll("[data-player-artist-tag]").forEach((link) => {
          link.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeContextMenu();
            navigateFromPlayer(`/${link.dataset.playerArtistTag}`);
          });
        });

        row.querySelector(".gp-queue-track-play")?.addEventListener("click", () => {
          if (mode === "queue") playQueuedTrack(index);
          if (mode === "recent") playRecentTrack(index);
        });

        row.querySelector(".gp-queue-track-remove")?.addEventListener("click", (event) => {
          event.stopPropagation();
          removeQueuedTrack(index);
        });
      });

      queueContent.querySelector("#gp-queue-clear")?.addEventListener("click", () => {
        savePlayerQueue([]);
        renderQueuePanel();
      });
    }

    window.addTrackToGlobalQueue = function (track, options = {}) {
      const added = addTrackToQueue(track, {
        allowDuplicate: options.allowDuplicate !== false
      });

      if (added && options.open !== false) {
        activeQueueTab = "queue";
        openQueuePanel("queue");
      } else if (added) {
        renderQueuePanel();
      }

      return added;
    };

    window.setGlobalPlayerQueue = function (tracks = [], options = {}) {
      const normalized = (Array.isArray(tracks) ? tracks : [])
        .map((track) => normalizePlayableTrack(track, {
          play_context: options.play_context || track?.play_context || "queue",
          playlist_source_id: options.playlist_source_id || track?.playlist_source_id || ""
        }))
        .filter((track) => track?.audioSrc || track?.soundcloud);

      normalized.forEach((track) => rememberQueueSourceTag(track));
      savePlayerQueue(normalized);

      if (options.open === true) {
        activeQueueTab = "queue";
        openQueuePanel("queue");
      } else {
        renderQueuePanel();
      }

      return normalized.length;
    };

    function setRangeFill(input, percent) {
      if (!input) return;
      input.style.setProperty("--gp-range-fill", `${Math.max(0, Math.min(100, percent))}%`);
    }

    function syncProgressFill(percent = Number(progress?.value || 0)) {
      setRangeFill(progress, percent);
    }

    function syncVolumeButtonState(value = Number(volume?.value || 0)) {
      if (!volumeToggleBtn) return;

      const safe = Math.max(0, Math.min(1, Number(value) || 0));
      let iconClass = "fa-solid fa-volume-high";

      if (safe <= 0.001) {
        iconClass = "fa-solid fa-volume-xmark";
      } else if (safe < 0.5) {
        iconClass = "fa-solid fa-volume-low";
      }

      volumeToggleBtn.innerHTML = `<i class="${iconClass}"></i>`;
      volumeToggleBtn.classList.toggle("active", safe > 0.001);
      volumeToggleBtn.classList.toggle("muted", safe <= 0.001);
    }

    function applyVolume(nextValue, options = {}) {
      const { persist = true, remember = true } = options;
      const safe = Math.max(0, Math.min(1, Number(nextValue) || 0));

      if (volume) {
        volume.value = String(safe);
        setRangeFill(volume, safe * 100);
      }

      if (audioEl) {
        audioEl.volume = safe;
      }

      if (scWidgetInstance) {
        scWidgetInstance.setVolume(Math.round(safe * 100));
      }

      if (persist) {
        localStorage.setItem(VOLUME_KEY, String(safe));
      }

      if (remember && safe > 0) {
        localStorage.setItem(LAST_VOLUME_KEY, String(safe));
      }

      syncVolumeButtonState(safe);
    }

    function toggleMute() {
      const current = Number(volume?.value || getStoredVolume());

      if (current > 0.001) {
        localStorage.setItem(LAST_VOLUME_KEY, String(current));
        applyVolume(0, { persist: true, remember: false });
        return;
      }

      applyVolume(getLastAudibleVolume(), { persist: true, remember: true });
    }

    function syncRepeatButtonState() {
      if (!repeatBtn) return;

      const enabled = isRepeatEnabled();
      repeatBtn.classList.toggle("active", enabled);
      repeatBtn.setAttribute(
        "title",
        enabled ? "Повтор текущего трека включен" : "Повтор текущего трека"
      );
    }

    function skipCurrentTrack(deltaSeconds) {
      const state = window.getGlobalPlayerState?.();
      const duration = Number(state?.duration || 0);
      const current = Number(state?.currentTime || 0);

      if (currentMode === "audio" && audioEl) {
        const maxDuration = Number(audioEl.duration || duration || current);
        const nextTime = Math.max(0, Math.min(maxDuration, current + deltaSeconds));
        audioEl.currentTime = nextTime;
        saveCurrentState(!audioEl.paused);
        syncProgressFill((audioEl.duration || 0) > 0 ? (nextTime / audioEl.duration) * 100 : 0);
        return;
      }

      if (currentMode === "soundcloud" && duration > 0) {
        const nextTime = Math.max(0, Math.min(duration, current + deltaSeconds));
        window.seekGlobalPlayer(nextTime / duration, "transport");
      }
    }

    applyVolume(getStoredVolume(), { persist: false, remember: true });
    syncRepeatButtonState();
    syncProgressFill();

    function renderFavoritesShortcut(track) {
      if (!favoritesShortcut || !window.RitmoriaPlaylists) return;

      const favorites = window.RitmoriaPlaylists.getFavorites?.();
      const count = Array.isArray(favorites?.tracks) ? favorites.tracks.length : 0;
      const inFav = track?.id ? window.RitmoriaPlaylists.isTrackInFavorites?.(track.id) : false;

      favoritesShortcut.innerHTML = `
        <button
          class="gp-playlist-item gp-playlist-item-favorites gp-playlist-item-fixed ${inFav ? "active" : ""}"
          type="button"
          data-playlist-id="favorites"
        >
          <div class="gp-playlist-item-left">
            <div class="gp-playlist-item-title">Любимые треки</div>
            <div class="gp-playlist-item-count">${count} треков</div>
          </div>
        </button>
      `;

      favoritesShortcut.querySelector("[data-playlist-id='favorites']")?.addEventListener("click", () => {
        toggleCurrentTrackFavorites();
        closePlaylistModal();
      });
    }

    function renderPlaylistPicker(query = "") {
      if (!playlistList) return;

      ensurePlaylistApi();

      if (!window.RitmoriaPlaylists) {
        playlistList.innerHTML = `<div class="gp-playlist-empty">Система плейлистов не загружена</div>`;
        return;
      }

      const track = getCurrentTrackFromStorage();
      const all = window.RitmoriaPlaylists.getAll?.() || [];
      const safeQuery = String(query || "").trim().toLowerCase();

      renderFavoritesShortcut(track);

      const filtered = all.filter((playlist) => {
        if (playlist.id === "favorites") return false;
        if (!safeQuery) return true;
        return String(playlist.name || "").toLowerCase().includes(safeQuery);
      });

      if (!filtered.length) {
        playlistList.innerHTML = `<div class="gp-playlist-empty">Других плейлистов пока нет</div>`;
        return;
      }

      playlistList.innerHTML = filtered
        .map((playlist) => {
          const count = Array.isArray(playlist.tracks) ? playlist.tracks.length : 0;
          const isAdded = track?.id
            ? window.RitmoriaPlaylists.isTrackInPlaylist?.(playlist.id, track.id)
            : false;

          return `
            <button
              class="gp-playlist-item ${isAdded ? "active" : ""}"
              type="button"
              data-playlist-id="${playlist.id}"
            >
              <div class="gp-playlist-item-left">
                <div class="gp-playlist-item-title">${playlist.name}</div>
                <div class="gp-playlist-item-count">${count} треков</div>
              </div>
            </button>
          `;
        })
        .join("");

      playlistList.querySelectorAll("[data-playlist-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const playlistId = btn.dataset.playlistId;
          const currentTrack = getCurrentTrackFromStorage();

          if (!playlistId || !currentTrack || !window.RitmoriaPlaylists) return;

          if (window.RitmoriaPlaylists.isTrackInPlaylist?.(playlistId, currentTrack.id)) {
            window.RitmoriaPlaylists.removeTrackFromPlaylist?.(playlistId, currentTrack.id);
          } else {
            window.RitmoriaPlaylists.addTrackToPlaylist?.(playlistId, currentTrack);
          }

          closePlaylistModal();
        });
      });

      if (!playlistModal?.classList.contains("gp-hidden")) {
        requestAnimationFrame(() => {
          positionPlaylistModal(playlistModalAnchor || addBtn);
        });
      }
    }

    function syncAddButtonState() {
      const track = getCurrentTrackFromStorage();

      if (!addBtn || !window.RitmoriaPlaylists || !track?.id) {
        addBtn?.classList.remove("active");
        return;
      }

      const inAnyPlaylist = window.RitmoriaPlaylists.isTrackInAnyPlaylist?.(track.id);
      addBtn.classList.toggle("active", !!inAnyPlaylist);
    }

    async function syncLikeButtonState() {
      const track = getCurrentTrackFromStorage();
      if (!likeBtn) return;

      setLikeButtonVisual(likeBtn, false);

      if (!track?.id) return;

      const data = await fetchTrackLikeState(track.id);
      setLikeButtonVisual(likeBtn, !!data?.liked);
    }

    async function toggleCurrentTrackLike() {
      const track = getCurrentTrackFromStorage();
      const token = localStorage.getItem("token");

      if (!track?.id || !token) {
        alert("Нужно войти в аккаунт.");
        return;
      }

      try {
        const res = await fetch("/api/track-like", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token
          },
          body: JSON.stringify({ trackId: track.id })
        });

        if (!res.ok) return;

        const data = await res.json();
        const likesCount = Math.max(
          0,
          Number(
            data?.count
            ?? track?.likes_count
            ?? track?.likesCount
            ?? 0
          ) || 0
        );

        setLikeButtonVisual(likeBtn, !!data.liked);

        if (track && typeof track === "object") {
          track.likes_count = likesCount;
          track.likesCount = likesCount;
        }

        if (data?.xp && typeof window.applyXPAndCheckRank === "function") {
          window.applyXPAndCheckRank(data.xp, data.newXP, data.xpState);
        } else if (data?.xp && typeof window.showXP === "function") {
          window.showXP(data.xp);
        }

        window.dispatchEvent(
          new CustomEvent("ritmoria:track-like-updated", {
            detail: { trackId: track.id, liked: !!data.liked, likesCount }
          })
        );
      } catch (e) {
        console.log("toggle like error", e);
      }
    }

    function toggleCurrentTrackFavorites() {
      const track = getCurrentTrackFromStorage();
      ensurePlaylistApi();

      if (!track?.id || !window.RitmoriaPlaylists) return false;

      if (window.RitmoriaPlaylists.isTrackInFavorites?.(track.id)) {
        window.RitmoriaPlaylists.removeTrackFromPlaylist?.("favorites", track.id);
        return true;
      }

      window.RitmoriaPlaylists.addTrackToPlaylist?.("favorites", track);
      return true;
    }

    hideBtn?.addEventListener("click", () => {
      closeContextMenu();
      closePlaylistModal();
      closeCreatePlaylistModal();
      closeQueuePanel();
      window.stopGlobalTrack();
    });

    addBtn?.addEventListener("click", () => {
      ensurePlaylistApi();

      const track = getCurrentTrackFromStorage();
      if (!track?.id || !window.RitmoriaPlaylists) return;

      openPlaylistModal(addBtn);
    });

    likeBtn?.addEventListener("click", () => {
      toggleCurrentTrackLike();
    });

    queueBtn?.addEventListener("click", () => {
      toggleQueuePanel("queue");
    });

    queueCloseBtn?.addEventListener("click", () => {
      closeQueuePanel();
    });

    queueTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        activeQueueTab = tab.dataset.queueTab === "recent" ? "recent" : "queue";
        renderQueuePanel();
      });
    });

    queueAddCurrentBtn?.addEventListener("click", () => {
      const added = addTrackToQueue(getCurrentTrackFromStorage(), { allowDuplicate: true });
      if (!added) return;
      activeQueueTab = "queue";
      renderQueuePanel();
    });

    playlistCancel?.addEventListener("click", () => {
      closePlaylistModal();
    });

    playlistSearch?.addEventListener("input", () => {
      renderPlaylistPicker(playlistSearch.value);
    });

    openCreatePlaylistBtn?.addEventListener("click", () => {
      openCreatePlaylistModal(openCreatePlaylistBtn);
    });

    createPlaylistCancel?.addEventListener("click", () => {
      closeCreatePlaylistModal();
    });

    createPlaylistSave?.addEventListener("click", () => {
      ensurePlaylistApi();

      const name = createPlaylistInput?.value?.trim();
      if (!name || !window.RitmoriaPlaylists) return;

      const created = window.RitmoriaPlaylists.createPlaylist?.(name);
      if (!created) return;

      closeCreatePlaylistModal();
      renderPlaylistPicker(playlistSearch?.value || "");
    });

    createPlaylistInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        createPlaylistSave?.click();
      }
    });

    playlistModal?.addEventListener("click", (e) => {
      if (e.target === playlistModal) {
        closePlaylistModal();
      }
    });

    createPlaylistModal?.addEventListener("click", (e) => {
      if (e.target === createPlaylistModal) {
        closeCreatePlaylistModal();
      }
    });

    contextAddToPlaylist?.addEventListener("click", () => {
      openPlaylistModal(addBtn);
    });

    contextFavoritesToggle?.addEventListener("click", () => {
      if (!toggleCurrentTrackFavorites()) return;
      closeContextMenu();
    });

    contextQueue?.addEventListener("click", () => {
      closeContextMenu();
      const added = addTrackToQueue(getCurrentTrackFromStorage(), { allowDuplicate: true });
      if (added) openQueuePanel("queue");
    });

    contextCopyLink?.addEventListener("click", async () => {
      const url = getCurrentTrackUrl();
      if (!url) return;

      try {
        await navigator.clipboard.writeText(url);
      } catch (e) {
        console.log("copy link error", e);
      }

      closeContextMenu();
    });

    contextViewAuthor?.addEventListener("click", () => {
      const track = getCurrentTrackFromStorage();
      if (!track?.username_tag) return;

      closeContextMenu();
      navigateFromPlayer(`/${track.username_tag}`);
    });

    titleEl?.addEventListener("click", () => {
      const track = getCurrentTrackFromStorage();
      if (!track?.username_tag || !track?.slug) return;

      closeContextMenu();
      navigateFromPlayer(`/${track.username_tag}/${track.slug}`);
    });

    artistEl?.addEventListener("click", (e) => {
      const link = e.target.closest("[data-player-artist-tag]");
      const track = getCurrentTrackFromStorage();

      if (link) {
        e.preventDefault();
        e.stopPropagation();
        closeContextMenu();
        navigateFromPlayer(`/${link.dataset.playerArtistTag}`);
        return;
      }

      if (!track?.username_tag) return;

      closeContextMenu();
      navigateFromPlayer(`/${track.username_tag}`);
    });

    coverWrap?.addEventListener("click", () => {
      const track = getCurrentTrackFromStorage();
      if (!track?.username_tag || !track?.slug) return;

      closeContextMenu();
      navigateFromPlayer(`/${track.username_tag}/${track.slug}`);
    });

    coverWrap?.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openTrackContextMenu(e.clientX + 6, e.clientY - 8);
    });

    document.addEventListener("click", (e) => {
      if (!contextMenu?.classList.contains("gp-hidden") && !e.target.closest("#gp-context-menu")) {
        closeContextMenu();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;

      closeContextMenu();
      closePlaylistModal();
      closeCreatePlaylistModal();
      closeQueuePanel();
    });

    window.addEventListener("resize", () => {
      closeContextMenu();

      if (!playlistModal?.classList.contains("gp-hidden")) {
        positionPlaylistModal(playlistModalAnchor || addBtn);
      }

      if (!createPlaylistModal?.classList.contains("gp-hidden")) {
        positionCreatePlaylistModal(createPlaylistModalAnchor || openCreatePlaylistBtn || addBtn);
      }
    });

    window.addEventListener("scroll", () => {
      closeContextMenu();
    }, true);

    window.addEventListener("ritmoria:playlists-updated", () => {
      syncAddButtonState();
      syncContextMenuState();
      renderQueuePanel();

      if (!playlistModal?.classList.contains("gp-hidden")) {
        renderPlaylistPicker(playlistSearch?.value || "");
      }
    });

    window.addEventListener("ritmoria:global-player-track-change", () => {
      closeContextMenu();
      syncAddButtonState();
      syncContextMenuState();
      syncRepeatButtonState();
      syncProgressFill(0);
      syncLikeButtonState();
      renderQueuePanel();
    });

    window.addEventListener("ritmoria:player-queue-updated", () => {
      if (!queuePanel?.classList.contains("gp-hidden")) {
        renderQueuePanel();
      }
    });

    window.addEventListener("ritmoria:track-like-updated", async (e) => {
      const currentTrack = getCurrentTrackFromStorage();
      const updatedTrackId = Number(e.detail?.trackId);

      if (!currentTrack?.id || Number(currentTrack.id) !== updatedTrackId) return;
      await syncLikeButtonState();
    });

    window.addEventListener("ritmoria:global-player-stopped", () => {
      closeContextMenu();
      closePlaylistModal();
      closeCreatePlaylistModal();
      syncProgressFill(0);
    });

    if (audioEl) {
      audioEl.volume = Number(volume.value);

      audioEl.addEventListener("timeupdate", () => {
        const duration = audioEl.duration || 0;
        const current = audioEl.currentTime || 0;

        document.getElementById("gp-current").textContent = formatTime(current);
        document.getElementById("gp-duration").textContent = formatTime(duration);

        if (duration > 0) {
          progress.value = (current / duration) * 100;
        } else {
          progress.value = 0;
        }

        syncProgressFill(progress.value);

        saveCurrentState(!audioEl.paused);

        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");

        window.dispatchEvent(
          new CustomEvent("ritmoria:global-player-timeupdate", {
            detail: {
              currentTime: audioEl.currentTime || 0,
              duration: audioEl.duration || 0,
              track: saved
            }
          })
        );
      });

      audioEl.addEventListener("ended", () => {
        if (isRepeatEnabled()) {
          audioEl.currentTime = 0;
          audioEl.play().catch(() => {});
          saveCurrentState(true);
          return;
        }

        playAdjacentTrack(1, { stopWhenMissing: true });
      });

      audioEl.addEventListener("play", () => {
        setPlayingUI(true);
        window.dispatchEvent(
          new CustomEvent("ritmoria:global-player-play", {
            detail: window.getGlobalPlayerState()
          })
        );
        saveCurrentState(true);
        localStorage.setItem(AUTOPLAY_KEY, "1");
        localStorage.setItem(FORCE_PAUSED_KEY, "0");
      });

      audioEl.addEventListener("pause", () => {
        setPlayingUI(false);
        window.dispatchEvent(
          new CustomEvent("ritmoria:global-player-pause", {
            detail: window.getGlobalPlayerState()
          })
        );
        saveCurrentState(false);
        localStorage.setItem(AUTOPLAY_KEY, "0");
        localStorage.setItem(FORCE_PAUSED_KEY, "1");
      });
    }

    playBtn.addEventListener("click", () => {
      if (currentMode === "audio" && audioEl) {
        if (audioEl.paused) {
          audioEl.play().catch(() => {});
          saveCurrentState(!audioEl.paused);
        } else {
          audioEl.pause();
          saveCurrentState(false);
        }
        return;
      }

      if (currentMode === "soundcloud" && scWidgetInstance) {
        const isPlaying =
          document.getElementById("global-player")?.dataset.playing === "1";

        if (isPlaying) {
          scWidgetInstance.pause();
          saveCurrentState(false);
        } else {
          scWidgetInstance.play();
          saveCurrentState(true);
        }
      }
    });

    prevBtn?.addEventListener("click", () => {
      playAdjacentTrack(-1);
    });

    nextBtn?.addEventListener("click", () => {
      playAdjacentTrack(1);
    });

    repeatBtn?.addEventListener("click", () => {
      localStorage.setItem(REPEAT_KEY, isRepeatEnabled() ? "0" : "1");
      syncRepeatButtonState();
    });

    progress.addEventListener("input", () => {
      syncProgressFill(progress.value);
      window.seekGlobalPlayer(Number(progress.value) / 100, "global");
    });

    volume.addEventListener("input", () => {
      applyVolume(Number(volume.value), { persist: true, remember: true });
    });

    volumeToggleBtn?.addEventListener("click", () => {
      toggleMute();
    });

    restoreTrack();

    if (localStorage.getItem("playerHidden") === "1") {
      document.getElementById("global-player")?.classList.add("hidden");
    }
  }

  async function fetchTracksByProfileTag(tag) {
    const safeTag = String(tag || "").trim();
    if (!safeTag) return [];

    try {
      const res = await fetch(`/user-tracks?tag=${encodeURIComponent(safeTag)}`, {
        headers: localStorage.getItem("token")
          ? { Authorization: "Bearer " + localStorage.getItem("token") }
          : {}
      });

      if (!res.ok) return [];

      const tracks = await res.json();
      return Array.isArray(tracks)
        ? tracks.map((track) => normalizePlayableTrack(track, {
            play_context: "profile",
            profile_source_tag: safeTag
          })).filter((track) => track?.audioSrc || track?.soundcloud)
        : [];
    } catch (e) {
      console.log("fetch profile tracks error", e);
      return [];
    }
  }

  function shuffleTracks(tracks) {
    const list = [...(Array.isArray(tracks) ? tracks : [])];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  async function fetchRandomFromTags(tags, excludeTrackIds = []) {
    const uniqueTags = [...new Set((Array.isArray(tags) ? tags : []).map((tag) => String(tag || "").trim()).filter(Boolean))];
    const excluded = new Set(excludeTrackIds.map((id) => Number(id)).filter(Boolean));
    const batches = await Promise.all(uniqueTags.map((tag) => fetchTracksByProfileTag(tag)));
    const tracks = batches.flat().filter((track) => !excluded.has(Number(track.id)));
    return shuffleTracks(tracks)[0] || null;
  }

  function getPlaylistTrackList(playlistId) {
    ensurePlaylistApi();
    const playlist = window.RitmoriaPlaylists?.getById?.(playlistId);
    if (!playlist || !Array.isArray(playlist.tracks)) return [];

    return playlist.tracks
      .map((track) => normalizePlayableTrack(track, {
        playlist_source_id: playlistId,
        play_context: "playlist"
      }))
      .filter((track) => track?.audioSrc || track?.soundcloud);
  }

  async function getNextFromPlaylist(currentTrack, direction = 1) {
    const playlistId = currentTrack?.playlist_source_id;
    if (!playlistId) return null;

    const tracks = getPlaylistTrackList(playlistId);
    if (!tracks.length) return null;

    const index = tracks.findIndex((track) => isSamePlayableTrack(track, currentTrack));
    const nextIndex = index + direction;

    if (nextIndex >= 0 && nextIndex < tracks.length) {
      return tracks[nextIndex];
    }

    if (direction < 0) return null;

    const tags = tracks.map((track) => track.username_tag || track.profile_source_tag);
    return fetchRandomFromTags(tags, tracks.map((track) => track.id));
  }

  async function getNextFromProfile(currentTrack, direction = 1) {
    const tag = currentTrack?.profile_source_tag || currentTrack?.username_tag;
    if (!tag) return null;

    const tracks = await fetchTracksByProfileTag(tag);
    if (!tracks.length) return null;

    const index = tracks.findIndex((track) => isSamePlayableTrack(track, currentTrack));
    const nextIndex = index + direction;

    if (nextIndex >= 0 && nextIndex < tracks.length) {
      return tracks[nextIndex];
    }

    if (direction < 0) return null;

    return shuffleTracks(tracks.filter((track) => !isSamePlayableTrack(track, currentTrack)))[0] || null;
  }

  async function getFallbackFromQueueArtists(currentTrack) {
    const tags = [
      currentTrack?.username_tag,
      currentTrack?.profile_source_tag,
      ...getStoredQueueSourceTags(),
      ...getRecentTracks()
        .filter((track) => track.play_context === "queue")
        .map((track) => track.username_tag || track.profile_source_tag)
    ];

    return fetchRandomFromTags(tags, [currentTrack?.id]);
  }

  async function getNextTrackForCurrentContext(direction = 1) {
    const currentTrack = getCurrentTrackFromStorage();

    if (direction > 0) {
      const queued = popNextQueuedTrack();
      if (queued) {
        return {
          ...queued,
          play_context: queued.play_context || "queue"
        };
      }
    }

    if (currentTrack?.playlist_source_id) {
      const playlistTrack = await getNextFromPlaylist(currentTrack, direction);
      if (playlistTrack) return playlistTrack;
    }

    if (currentTrack?.play_context === "queue" && direction > 0) {
      const queueFallback = await getFallbackFromQueueArtists(currentTrack);
      if (queueFallback) {
        return {
          ...queueFallback,
          play_context: "queue"
        };
      }
    }

    const profileTrack = await getNextFromProfile(currentTrack, direction);
    if (profileTrack) return profileTrack;

    if (direction < 0) {
      const recent = getRecentTracks();
      const previous = recent[0] || null;
      if (previous) {
        saveRecentTracks(recent.slice(1));
        window.dispatchEvent(new CustomEvent("ritmoria:player-queue-updated"));
        return previous;
      }
    }

    if (direction > 0) {
      return fetchRandomFromTags([currentTrack?.username_tag || currentTrack?.profile_source_tag], [currentTrack?.id]);
    }

    return null;
  }

  async function playAdjacentTrack(direction = 1, options = {}) {
    const nextTrack = await getNextTrackForCurrentContext(direction);

    if (!nextTrack) {
      if (options.stopWhenMissing) {
        setPlayingUI(false);
        saveCurrentState(false);
      }
      return false;
    }

    window.playTrackGlobal(nextTrack, { skipHistory: direction < 0 });
    return true;
  }

  function setPlayingUI(isPlaying) {
    const player = document.getElementById("global-player");
    const playBtn = document.getElementById("gp-play");

    if (!player || !playBtn) return;

    player.dataset.playing = isPlaying ? "1" : "0";
    playBtn.classList.toggle("playing", !!isPlaying);
    playBtn.setAttribute("title", isPlaying ? "Пауза" : "Воспроизвести");
    playBtn.innerHTML = isPlaying
      ? `<i class="fa-solid fa-pause"></i>`
      : `<i class="fa-solid fa-play"></i>`;
  }

  function formatTime(sec) {
    if (!sec || Number.isNaN(sec)) return "0:00";
    const minutes = Math.floor(sec / 60);
    const seconds = Math.floor(sec % 60);
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function stopAudioOnly() {
    if (audioEl) {
      audioEl.pause();
      audioEl.currentTime = 0;
      audioEl.removeAttribute("src");
      audioEl.load();
    }
  }

  function stopSoundCloudOnly() {
    if (scWidgetInstance) {
      try {
        scWidgetInstance.pause();
      } catch (e) {}
    }

    const scHost = document.getElementById("gp-sc-host");
    if (scHost) {
      scHost.innerHTML = "";
    }

    scWidgetInstance = null;
    lastScPosition = 0;
    lastScDuration = 0;
  }

  function updateMeta(track) {
    const player = document.getElementById("global-player");
    if (!player) return;

    player.classList.remove("hidden");
    document.getElementById("gp-title").textContent = track.title || "Unknown track";
    document.getElementById("gp-artist").innerHTML = renderStoredPlayerArtistMarkup(track, { clickable: true });
    document.getElementById("gp-cover").src = track.cover || "/images/default-avatar.jpg";
  }

  function saveTrackObject(track, isPlaying) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        id: track.id || 0,
        title: track.title || "",
        artist: track.artist || "",
        artist_mentions: Array.isArray(track.artist_mentions) ? track.artist_mentions : [],
        cover: track.cover || "",
        audioSrc: track.audioSrc || "",
        soundcloud: track.soundcloud || "",
        slug: track.slug || "",
        username_tag: track.username_tag || "",
        playlist_source_id: track.playlist_source_id || "",
        profile_source_tag: track.profile_source_tag || "",
        play_context: track.play_context || "",
        duration: Number(track.duration || 0) || 0,
        currentTime: track.currentTime || 0,
        isPlaying: !!isPlaying
      })
    );
  }

  function saveCurrentState(isPlaying) {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved) return;

    if (currentMode === "audio" && audioEl) {
      saved.currentTime = audioEl.currentTime || 0;
      saved.isPlaying = !!isPlaying;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      return;
    }

    if (currentMode === "soundcloud") {
      saved.currentTime = lastScPosition || 0;
      saved.isPlaying = !!isPlaying;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    }
  }

  function bindSoundCloudEvents(track) {
    if (!scWidgetInstance) return;

    scWidgetInstance.bind(SC.Widget.Events.READY, () => {
      scWidgetInstance.setVolume(
        Math.round(Number(document.getElementById("gp-volume").value) * 100)
      );

      if (track.currentTime) {
        scWidgetInstance.seekTo(track.currentTime * 1000);
      }

      if (track.isPlaying) {
        scWidgetInstance.play();
      } else {
        scWidgetInstance.pause();
      }
    });

    scWidgetInstance.bind(SC.Widget.Events.PLAY, () => {
      currentMode = "soundcloud";
      setPlayingUI(true);
      window.dispatchEvent(new CustomEvent("ritmoria:global-player-play"));
      saveCurrentState(true);
    });

    scWidgetInstance.bind(SC.Widget.Events.PAUSE, () => {
      setPlayingUI(false);
      window.dispatchEvent(new CustomEvent("ritmoria:global-player-pause"));
      saveCurrentState(false);
    });

    scWidgetInstance.bind(SC.Widget.Events.FINISH, () => {
      if (isRepeatEnabled()) {
        scWidgetInstance.seekTo(0);
        scWidgetInstance.play();
        saveCurrentState(true);
        return;
      }

      playAdjacentTrack(1, { stopWhenMissing: true });
    });

    scWidgetInstance.bind(SC.Widget.Events.PLAY_PROGRESS, (e) => {
      lastScPosition = (e.currentPosition || 0) / 1000;

      const duration =
        e.relativePosition > 0
          ? e.currentPosition / e.relativePosition
          : lastScDuration;

      if (duration && Number.isFinite(duration)) {
        lastScDuration = duration;
        document.getElementById("gp-current").textContent = formatTime(lastScPosition);
        document.getElementById("gp-duration").textContent = formatTime(duration / 1000);
        document.getElementById("gp-progress").value =
          (e.relativePosition || 0) * 100;
        document.getElementById("gp-progress")?.style.setProperty(
          "--gp-range-fill",
          `${(e.relativePosition || 0) * 100}%`
        );
      }

      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");

      window.dispatchEvent(
        new CustomEvent("ritmoria:global-player-timeupdate", {
          detail: {
            currentTime: lastScPosition || 0,
            duration: (lastScDuration || 0) / 1000,
            track: saved
          }
        })
      );

      saveCurrentState(true);
    });
  }

  function playSoundCloud(track) {
    if (!window.SC || !SC.Widget) {
      window.open(track.soundcloud, "_blank");
      return;
    }

    stopAudioOnly();
    stopSoundCloudOnly();

    const scHost = document.getElementById("gp-sc-host");
    if (!scHost) return;

    scHost.innerHTML = `
      <iframe
        id="gp-sc-frame"
        width="0"
        height="0"
        allow="autoplay"
        frameborder="no"
        src="https://w.soundcloud.com/player/?url=${encodeURIComponent(track.soundcloud)}&auto_play=${track.isPlaying ? "true" : "false"}">
      </iframe>
    `;

    const iframe = document.getElementById("gp-sc-frame");
    scWidgetInstance = SC.Widget(iframe);
    currentMode = "soundcloud";
    bindSoundCloudEvents(track);
  }

  function playAudio(track) {
    stopSoundCloudOnly();
    currentMode = "audio";

    if (!audioEl) return;

    const isSameTrack = audioEl.src.includes(track.audioSrc);

    if (!isSameTrack) {
      audioEl.src = track.audioSrc;
    }

    audioEl.currentTime = track.currentTime || 0;
    document.getElementById("gp-current").textContent = formatTime(track.currentTime || 0);

    const syncAudioProgressUi = () => {
      const duration = Number(audioEl.duration || 0);
      const currentTime = Number(audioEl.currentTime || 0);
      const percent = duration > 0 ? (currentTime / duration) * 100 : 0;

      document.getElementById("gp-progress").value = percent;
      document.getElementById("gp-progress")?.style.setProperty(
        "--gp-range-fill",
        `${percent}%`
      );
      document.getElementById("gp-duration").textContent = formatTime(duration);
      document.getElementById("gp-current").textContent = formatTime(currentTime);
    };

    if (audioEl.readyState >= 1) {
      syncAudioProgressUi();
    } else {
      audioEl.addEventListener("loadedmetadata", syncAudioProgressUi, { once: true });
    }

    if (track.isPlaying === true) {
      audioEl.play().catch(() => {});
    } else {
      audioEl.pause();
    }
  }

  window.playTrackGlobal = function (track, options = {}) {
    if (!playerReady) ensurePlayerMarkup();
    ensurePlaylistApi();

    const baseTrack = normalizePlayableTrack(track);
    if (!baseTrack) return;

    const previousTrack = getCurrentTrackFromStorage();
    const normalizedTrack = {
      ...baseTrack,
      currentTime: 0,
      isPlaying: true
    };

    if (previousTrack && !options.skipHistory && !isSamePlayableTrack(previousTrack, normalizedTrack)) {
      pushRecentTrack(previousTrack);
    }

    localStorage.setItem(FORCE_PAUSED_KEY, "0");
    localStorage.setItem(AUTOPLAY_KEY, "1");

    updateMeta(normalizedTrack);
    saveTrackObject(normalizedTrack, true);
    window.RitmoriaPlaylists.ensureInitialized?.();

    const player = document.getElementById("global-player");
    if (player) {
      player.classList.remove("hidden");
      player.dataset.embeddedHidden = "0";
    }

    localStorage.removeItem("playerHidden");

    window.dispatchEvent(
      new CustomEvent("ritmoria:global-player-track-change", {
        detail: normalizedTrack
      })
    );

    if (normalizedTrack.audioSrc) {
      playAudio(normalizedTrack);
    } else if (normalizedTrack.soundcloud) {
      playSoundCloud(normalizedTrack);
    }
  };

  window.stopGlobalTrack = function () {
    ensurePlayerMarkup();

    stopAudioOnly();
    stopSoundCloudOnly();
    setPlayingUI(false);

    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(AUTOPLAY_KEY);
    localStorage.removeItem(FORCE_PAUSED_KEY);
    localStorage.removeItem("playerHidden");

    const player = document.getElementById("global-player");
    if (player) {
      player.classList.add("hidden");
      player.dataset.embeddedHidden = "0";
    }

    window.dispatchEvent(new CustomEvent("ritmoria:global-player-stopped"));
  };

  window.getGlobalPlayerState = function () {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    const isSoundCloud = currentMode === "soundcloud";

    return {
      track: saved,
      mode: currentMode,
      isPlaying: isSoundCloud
        ? document.getElementById("global-player")?.dataset.playing === "1"
        : !!(audioEl && !audioEl.paused),
      currentTime: isSoundCloud
        ? (lastScPosition || 0)
        : (audioEl?.currentTime || 0),
      duration: isSoundCloud
        ? ((lastScDuration || 0) / 1000)
        : (audioEl?.duration || 0)
    };
  };

  window.seekGlobalPlayer = function (progress, source = "unknown") {
    const safeProgress = Math.max(0, Math.min(1, Number(progress) || 0));
    let currentTime = 0;
    let duration = 0;

    if (currentMode === "audio" && audioEl && audioEl.duration) {
      duration = audioEl.duration || 0;
      currentTime = safeProgress * duration;
      audioEl.currentTime = currentTime;
      saveCurrentState(!audioEl.paused);

      window.dispatchEvent(
        new CustomEvent("ritmoria:global-player-seek", {
          detail: {
            source,
            currentTime,
            duration,
            progress: safeProgress,
            restarted: currentTime <= 1
          }
        })
      );

      window.dispatchEvent(
        new CustomEvent("ritmoria:global-player-timeupdate", {
          detail: window.getGlobalPlayerState()
        })
      );
      return;
    }

    if (currentMode === "soundcloud" && scWidgetInstance && lastScDuration > 0) {
      const nextMs = safeProgress * lastScDuration;
      currentTime = nextMs / 1000;
      duration = (lastScDuration || 0) / 1000;

      scWidgetInstance.seekTo(nextMs);
      lastScPosition = currentTime;

      window.dispatchEvent(
        new CustomEvent("ritmoria:global-player-seek", {
          detail: {
            source,
            currentTime,
            duration,
            progress: safeProgress,
            restarted: currentTime <= 1
          }
        })
      );

      window.dispatchEvent(
        new CustomEvent("ritmoria:global-player-timeupdate", {
          detail: window.getGlobalPlayerState()
        })
      );
    }
  };

  window.suspendGlobalPlayerForEmbedded = function (source = "") {
    ensurePlayerMarkup();

    if (audioEl && !audioEl.paused) {
      audioEl.pause();
    }

    if (scWidgetInstance) {
      try {
        scWidgetInstance.pause();
      } catch (e) {}
    }

    setPlayingUI(false);

    const player = document.getElementById("global-player");
    if (player) {
      player.classList.add("hidden");
      player.dataset.embeddedHidden = "1";
      player.dataset.embeddedSource = source;
    }

    localStorage.setItem(AUTOPLAY_KEY, "0");
    localStorage.setItem(FORCE_PAUSED_KEY, "1");
  };

  window.syncGlobalPlayerVisibilityByRoute = function (
    pathname = location.pathname
  ) {
    ensurePlayerMarkup();

    const player = document.getElementById("global-player");
    const hasTrack = !!localStorage.getItem(STORAGE_KEY);

    if (!player) return;

    if (pathname.startsWith("/discover")) {
      player.classList.add("hidden");
      return;
    }

    if (pathname.startsWith("/track") || pathname.startsWith("/judge")) {
      player.classList.add("hidden");
      return;
    }

    if (!hasTrack) {
      player.classList.add("hidden");
      return;
    }

    if (localStorage.getItem("playerHidden") === "1") {
      player.classList.add("hidden");
      return;
    }

    player.classList.remove("hidden");
  };

  function restoreTrack() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const track = JSON.parse(raw);
    ensurePlayerMarkup();
    ensurePlaylistApi();
    updateMeta(track);
    window.RitmoriaPlaylists.ensureInitialized?.();
    window.dispatchEvent(
      new CustomEvent("ritmoria:global-player-track-change", {
        detail: track
      })
    );

    const autoplay = localStorage.getItem(AUTOPLAY_KEY) === "1";
    const forcePaused = localStorage.getItem(FORCE_PAUSED_KEY) === "1";

    if (track.audioSrc) {
      const shouldPlay = forcePaused ? false : autoplay;

      playAudio({
        ...track,
        isPlaying: shouldPlay
      });

      setPlayingUI(shouldPlay);
      return;
    }

    if (track.soundcloud) {
      const shouldPlay = forcePaused ? false : autoplay;

      playSoundCloud({
        ...track,
        isPlaying: shouldPlay
      });

      setPlayingUI(shouldPlay);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (!playerReady) ensurePlayerMarkup();
    });
  } else {
    if (!playerReady) ensurePlayerMarkup();
  }

  ensurePlaylistApi();
})();

window.togglePlayer = function () {
  const player = document.getElementById("global-player");
  if (!player) return;

  const hidden = player.classList.contains("hidden");

  if (hidden) {
    player.classList.remove("hidden");
    localStorage.removeItem("playerHidden");
  } else {
    player.classList.add("hidden");
    localStorage.setItem("playerHidden", "1");
  }
};

window.addEventListener("load", () => {
  if (localStorage.getItem("ritmoria_current_track")) {
    const player = document.getElementById("global-player");
    if (player) player.classList.remove("hidden");
  }
});

window.playTrack = function (track) {
  const path = location.pathname;

  if (path.startsWith("/track") || path.startsWith("/discover")) {
    return;
  }

  window.playTrackGlobal(track);
};
