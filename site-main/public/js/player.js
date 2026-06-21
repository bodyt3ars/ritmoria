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
  const DEFAULT_PLAYER_VOLUME = 0.2;

  let playerReady = false;
  let audioEl = null;
  let scWidgetInstance = null;
  let currentMode = null;
  let lastScPosition = 0;
  let lastScDuration = 0;
  let remixEngine = null;
  let activeRemixPreset = "original";

  const REMIX_PRESETS = {
    original: {
      label: "Original",
      shortLabel: "AI Remix",
      description: "Без обработки",
      icon: "fa-wave-square",
      playbackRate: 1,
      preservePitch: true
    },
    aiMaster: {
      label: "AI Master",
      shortLabel: "Master",
      description: "Громче, чище, плотнее",
      icon: "fa-microchip",
      playbackRate: 1,
      preservePitch: true
    },
    neuralClub: {
      label: "Neural Club",
      shortLabel: "Club",
      description: "Саб и клубный пульс",
      icon: "fa-brain",
      playbackRate: 1.04,
      preservePitch: true
    },
    ghostVocal: {
      label: "Ghost Vocal",
      shortLabel: "Ghost",
      description: "Эхо вокруг вокала",
      icon: "fa-ghost",
      playbackRate: 0.98,
      preservePitch: true
    },
    hyperpopGlitch: {
      label: "Hyperpop Glitch",
      shortLabel: "Glitch",
      description: "Питч и резкая нарезка",
      icon: "fa-bolt",
      playbackRate: 1.18,
      preservePitch: false
    },
    phonkMutation: {
      label: "Phonk Mutation",
      shortLabel: "Phonk",
      description: "Темный низ и грязь",
      icon: "fa-skull",
      playbackRate: 0.82,
      preservePitch: false
    },
    orbitRoom: {
      label: "Orbit Room",
      shortLabel: "Orbit",
      description: "Широкая комната",
      icon: "fa-satellite",
      playbackRate: 0.96,
      preservePitch: true
    }
  };

  function hasPlayerSession() {
    if (typeof window.hasSessionCache === "function") {
      return window.hasSessionCache();
    }
    return !!localStorage.getItem("token");
  }

  function getCurrentUserId() {
    if (typeof window.getSessionUserId === "function") {
      return window.getSessionUserId();
    }
    return "guest";
  }

  function playerT(value) {
    if (window.RitmoriaI18n?.getLanguage?.() !== "en") return value;
    return window.RitmoriaI18n?.translatePhrase?.(value) || value;
  }

  function formatPlayerTrackCount(count) {
    return window.RitmoriaI18n?.getLanguage?.() === "en"
      ? `${count} tracks`
      : `${count} треков`;
  }

  function getPlaylistsStorageKey() {
    return `ritmoria_playlists_user_${getCurrentUserId()}`;
  }

  function getPlaylistAuthHeaders() {
    if (!hasPlayerSession()) return null;

    return {
      "Content-Type": "application/json"
    };
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
      title: track.title || playerT("Без названия"),
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
        public: false,
        cover: "",
        tracks: []
      };
      list.unshift(favorites);
    }

    favorites.name = "Любимые треки";
    favorites.system = true;
    favorites.public = false;
    favorites.tracks = Array.isArray(favorites.tracks) ? favorites.tracks : [];

    const others = list.filter((p) => p && p.id !== "favorites");

    return [
      favorites,
      ...others.map((p) => ({
        id: p.id || `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: p.name || playerT("Без названия"),
        system: !!p.system,
        public: p.system ? false : (p.public === true || p.is_public === true),
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

  function mergePlaylistCollections(primary, secondary) {
    const base = ensureFavoritesPlaylist(primary);
    const extra = ensureFavoritesPlaylist(secondary);
    const merged = new Map();

    const mergeTracks = (firstTracks = [], secondTracks = []) => {
      const next = [];
      const seen = new Set();

      [firstTracks, secondTracks].forEach((items) => {
        items.forEach((track) => {
          const normalized = normalizeTrackForPlaylist(track);
          if (!normalized) return;

          const trackKey = `${Number(normalized.id) || 0}|${normalized.audioSrc || ""}|${normalized.soundcloud || ""}`;
          if (seen.has(trackKey)) return;

          seen.add(trackKey);
          next.push(normalized);
        });
      });

      return next;
    };

    const upsertPlaylist = (playlist, secondaryPlaylist = null) => {
      if (!playlist) return;

      const playlistId = String(playlist.id || secondaryPlaylist?.id || "").trim() || `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const isFavorites = playlistId === "favorites";
      const preferredName = String(playlist.name || "").trim();
      const fallbackName = String(secondaryPlaylist?.name || "").trim();
      const preferredCover = String(playlist.cover || "").trim();
      const fallbackCover = String(secondaryPlaylist?.cover || "").trim();
      const isPublic = !isFavorites && (playlist.public === true || secondaryPlaylist?.public === true);

      merged.set(playlistId, {
        id: playlistId,
        name: isFavorites ? "Любимые треки" : (preferredName || fallbackName || playerT("Без названия")),
        system: isFavorites || !!playlist.system || !!secondaryPlaylist?.system,
        public: isPublic,
        cover: preferredCover || fallbackCover || "",
        tracks: mergeTracks(playlist.tracks, secondaryPlaylist?.tracks)
      });
    };

    base.forEach((playlist) => {
      const secondaryPlaylist = extra.find((candidate) => String(candidate?.id || "") === String(playlist?.id || ""));
      upsertPlaylist(playlist, secondaryPlaylist);
    });

    extra.forEach((playlist) => {
      const playlistId = String(playlist?.id || "").trim();
      if (!playlistId || merged.has(playlistId)) return;
      upsertPlaylist(playlist);
    });

    return ensureFavoritesPlaylist(Array.from(merged.values()));
  }

  const playlistSyncState = {
    syncPromise: null,
    syncedUserId: null,
    remoteSavePromise: null,
    lastSavedByUser: new Map()
  };

  async function loadRemotePlaylists() {
    const headers = getPlaylistAuthHeaders();
    if (!headers) {
      return null;
    }

    const response = await fetch("/api/playlists", {
      headers
    });

    if (!response.ok) {
      throw new Error(`playlists_load_${response.status}`);
    }

    const data = await response.json().catch(() => ({}));
    return ensureFavoritesPlaylist(data?.playlists || []);
  }

  async function saveRemotePlaylists(playlists) {
    const headers = getPlaylistAuthHeaders();
    if (!headers) {
      return ensureFavoritesPlaylist(playlists);
    }

    const safe = ensureFavoritesPlaylist(playlists);
    const userId = String(getCurrentUserId());
    const serialized = JSON.stringify(safe);
    const lastSerialized = playlistSyncState.lastSavedByUser.get(userId);

    if (serialized === lastSerialized) {
      return safe;
    }

    const savePromise = fetch("/api/playlists", {
      method: "PUT",
      headers,
      body: JSON.stringify({ playlists: safe })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`playlists_save_${response.status}`);
        }

        const data = await response.json().catch(() => ({}));
        const normalized = ensureFavoritesPlaylist(data?.playlists || safe);
        const normalizedSerialized = JSON.stringify(normalized);
        playlistSyncState.lastSavedByUser.set(userId, normalizedSerialized);
        saveAllPlaylistsRaw(normalized);
        return normalized;
      })
      .catch((error) => {
        console.error("playlist remote save error", error);
        throw error;
      })
      .finally(() => {
        if (playlistSyncState.remoteSavePromise === savePromise) {
          playlistSyncState.remoteSavePromise = null;
        }
      });

    playlistSyncState.remoteSavePromise = savePromise;
    return savePromise;
  }

  const playlistStore = window.RitmoriaPlaylistStore || {
    getLocal() {
      return getAllPlaylistsRaw();
    },

    saveLocal(playlists, { dispatch = true } = {}) {
      const safe = saveAllPlaylistsRaw(playlists);
      if (dispatch) {
        window.dispatchEvent(new CustomEvent("ritmoria:playlists-updated"));
      }
      return safe;
    },

    persist(playlists, { dispatch = true } = {}) {
      const safe = this.saveLocal(playlists, { dispatch });
      if (hasPlayerSession()) {
        saveRemotePlaylists(safe).catch(() => {});
      }
      return safe;
    },

    async ensureInitialized({ force = false, dispatch = false } = {}) {
      const userId = String(getCurrentUserId());
      const localPlaylists = this.saveLocal(this.getLocal(), { dispatch: false });

      if (!hasPlayerSession()) {
        playlistSyncState.syncedUserId = null;
        return localPlaylists;
      }

      if (!force && playlistSyncState.syncedUserId === userId) {
        return this.getLocal();
      }

      if (playlistSyncState.syncPromise) {
        return playlistSyncState.syncPromise;
      }

      const previousSerialized = JSON.stringify(localPlaylists);

      playlistSyncState.syncPromise = (async () => {
        try {
          const remotePlaylists = await loadRemotePlaylists();
          const merged = mergePlaylistCollections(remotePlaylists || [], localPlaylists);
          const mergedSerialized = JSON.stringify(merged);

          this.saveLocal(merged, { dispatch: dispatch || mergedSerialized !== previousSerialized });
          playlistSyncState.syncedUserId = userId;

          const remoteSerialized = JSON.stringify(remotePlaylists || ensureFavoritesPlaylist([]));
          if (mergedSerialized !== remoteSerialized) {
            playlistSyncState.lastSavedByUser.delete(userId);
            saveRemotePlaylists(merged).catch(() => {});
          } else {
            playlistSyncState.lastSavedByUser.set(userId, remoteSerialized);
          }

          return merged;
        } catch (error) {
          console.error("playlist sync error", error);
          playlistSyncState.syncedUserId = userId;
          return localPlaylists;
        } finally {
          playlistSyncState.syncPromise = null;
        }
      })();

      return playlistSyncState.syncPromise;
    }
  };

  window.RitmoriaPlaylistStore = playlistStore;

  function ensurePlaylistApi() {
    if (window.RitmoriaPlaylists) {
      try {
        window.RitmoriaPlaylists.ensureInitialized?.();
        return;
      } catch {}
    }

    window.RitmoriaPlaylists = {
      getAll() {
        return playlistStore.getLocal();
      },

      getById(playlistId) {
        return playlistStore.getLocal().find((p) => p.id === playlistId) || null;
      },

      getFavorites() {
        return playlistStore.getLocal().find((p) => p.id === "favorites") || null;
      },

      ensureInitialized() {
        return playlistStore.ensureInitialized({ dispatch: true });
      },

      createPlaylist(name) {
        const trimmed = String(name || "").trim();
        if (!trimmed) return null;

        const playlists = playlistStore.getLocal();
        const playlist = {
          id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: trimmed,
          system: false,
          cover: "",
          tracks: []
        };

        playlists.push(playlist);
        playlistStore.persist(playlists);
        return playlist;
      },

      isTrackInFavorites(trackId) {
        const favorites = playlistStore.getLocal().find((p) => p.id === "favorites");
        if (!favorites) return false;
        return favorites.tracks.some((t) => Number(t.id) === Number(trackId));
      },

      isTrackInPlaylist(playlistId, trackId) {
        const playlist = playlistStore.getLocal().find((p) => p.id === playlistId);
        if (!playlist) return false;
        return playlist.tracks.some((t) => Number(t.id) === Number(trackId));
      },

      isTrackInAnyPlaylist(trackId) {
        return playlistStore.getLocal().some((playlist) =>
          Array.isArray(playlist?.tracks) &&
          playlist.tracks.some((t) => Number(t.id) === Number(trackId))
        );
      },

      addTrackToPlaylist(playlistId, track) {
        const playlists = playlistStore.getLocal();
        const playlist = playlists.find((p) => p.id === playlistId);
        const normalized = normalizeTrackForPlaylist(track);

        if (!playlist || !normalized || !normalized.id) return false;

        const exists = playlist.tracks.some((t) => Number(t.id) === Number(normalized.id));
        if (exists) return false;

        playlist.tracks.unshift(normalized);

        if (!playlist.cover && normalized.cover) {
          playlist.cover = normalized.cover;
        }

        playlistStore.persist(playlists);
        return true;
      },

      removeTrackFromPlaylist(playlistId, trackId) {
        const playlists = playlistStore.getLocal();
        const playlist = playlists.find((p) => p.id === playlistId);
        if (!playlist) return false;

        const before = playlist.tracks.length;
        playlist.tracks = playlist.tracks.filter((t) => Number(t.id) !== Number(trackId));

        if (!playlist.system && playlist.tracks.length === 0) {
          playlist.cover = "";
        }

        playlistStore.persist(playlists);
        return before !== playlist.tracks.length;
      },

      toggleTrackInFavorites(track) {
        const normalized = normalizeTrackForPlaylist(track);
        if (!normalized || !normalized.id) return { added: false, removed: false };

        const playlists = playlistStore.getLocal();
        const favorites = playlists.find((p) => p.id === "favorites");
        if (!favorites) return { added: false, removed: false };

        const exists = favorites.tracks.some((t) => Number(t.id) === Number(normalized.id));

        if (exists) {
          favorites.tracks = favorites.tracks.filter((t) => Number(t.id) !== Number(normalized.id));
          playlistStore.persist(playlists);
          return { added: false, removed: true };
        }

        favorites.tracks.unshift(normalized);
        if (!favorites.cover && normalized.cover) {
          favorites.cover = normalized.cover;
        }

        playlistStore.persist(playlists);
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

  function renderRemixOptionsMarkup() {
    return Object.entries(REMIX_PRESETS)
      .map(([presetName, preset]) => `
            <button class="gp-remix-option${presetName === "original" ? " active" : ""}" type="button" role="menuitemradio" aria-checked="${presetName === "original" ? "true" : "false"}" data-remix-preset="${escapePlayerMetaHtml(presetName)}">
              <span class="gp-remix-option-icon">
                <i class="fa-solid ${escapePlayerMetaHtml(preset.icon || "fa-wand-magic-sparkles")}"></i>
              </span>
              <span class="gp-remix-option-main">
                <span class="gp-remix-option-name">${escapePlayerMetaHtml(preset.label)}</span>
                <span class="gp-remix-option-desc">${escapePlayerMetaHtml(preset.description || "")}</span>
              </span>
              <span class="gp-remix-option-check">
                <i class="fa-solid fa-check"></i>
              </span>
            </button>`)
      .join("");
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
      const res = await fetch(`/api/track-likes/${trackId}`);

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
      if (raw <= 0) {
        return DEFAULT_PLAYER_VOLUME;
      }
      return Math.max(0, Math.min(1, raw));
    }
    return DEFAULT_PLAYER_VOLUME;
  }

  function getLastAudibleVolume() {
    const raw = Number(localStorage.getItem(LAST_VOLUME_KEY));
    if (Number.isFinite(raw) && raw > 0) {
      return Math.max(0.05, Math.min(1, raw));
    }
    return DEFAULT_PLAYER_VOLUME;
  }

  function isRepeatEnabled() {
    return localStorage.getItem(REPEAT_KEY) === "1";
  }

  function canUseWebAudio() {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  function isSameOriginAudioSource(audioElement) {
    const src = audioElement?.currentSrc || audioElement?.src || audioElement?.getAttribute?.("src") || "";
    if (!src) return true;

    try {
      const url = new URL(src, window.location.href);
      return url.origin === window.location.origin || url.protocol === "blob:" || url.protocol === "data:";
    } catch {
      return true;
    }
  }

  function clearRemixNodes() {
    if (!remixEngine) return;

    remixEngine.nodes.forEach((node) => {
      try {
        if (typeof node.stop === "function") {
          node.stop(0);
        }
      } catch {}

      try {
        node.disconnect();
      } catch {}
    });

    remixEngine.nodes = [];
  }

  function updateRemixUi() {
    const remixButton = document.getElementById("gp-remix");
    const remixLabel = document.getElementById("gp-remix-label");
    const player = document.getElementById("global-player");
    const preset = REMIX_PRESETS[activeRemixPreset] || REMIX_PRESETS.original;

    if (player) {
      player.dataset.remix = activeRemixPreset;
    }

    if (remixButton) {
      remixButton.classList.toggle("active", activeRemixPreset !== "original");
      remixButton.setAttribute("aria-label", `AI Remix: ${preset.label}`);
      remixButton.setAttribute("title", `AI Remix: ${preset.label}`);
    }

    if (remixLabel) {
      remixLabel.textContent = preset.shortLabel || preset.label || "AI Remix";
    }

    document.querySelectorAll("[data-remix-preset]").forEach((button) => {
      const isActive = button.dataset.remixPreset === activeRemixPreset;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-checked", isActive ? "true" : "false");
    });
  }

  function initRemixEngine(audioElement) {
    if (!audioElement) return null;

    const remixWrap = document.getElementById("gp-remix-wrap");

    if (!canUseWebAudio()) {
      remixWrap?.classList.add("gp-hidden");
      console.warn("Ritmoria Remix: Web Audio API is not supported in this browser.");
      return null;
    }

    if (!isSameOriginAudioSource(audioElement)) {
      console.warn("Ritmoria Remix: audio source is cross-origin, so Web Audio effects are disabled for this track.");
      return null;
    }

    if (remixEngine?.audioElement === audioElement) {
      return remixEngine;
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;

    try {
      const context = remixEngine?.context || new AudioContextCtor();
      const source = remixEngine?.source || context.createMediaElementSource(audioElement);

      remixEngine = {
        audioElement,
        context,
        source,
        nodes: [],
        isAvailable: true
      };

      rebuildAudioChain();
      return remixEngine;
    } catch (error) {
      console.warn("Ritmoria Remix: audio could not be connected to Web Audio. Falling back to normal playback.", error);
      remixEngine = {
        audioElement,
        context: null,
        source: null,
        nodes: [],
        isAvailable: false
      };
      return null;
    }
  }

  function resetRemixPreset() {
    activeRemixPreset = "original";

    if (audioEl) {
      audioEl.playbackRate = 1;
      audioEl.preservesPitch = true;
      audioEl.mozPreservesPitch = true;
      audioEl.webkitPreservesPitch = true;
    }

    rebuildAudioChain();
    updateRemixUi();
  }

  function setAudioParamValue(param, value) {
    if (!param || !Number.isFinite(value)) return;
    param.value = value;
  }

  function buildSoftClipCurve(amount = 1.6, samples = 2048) {
    const curve = new Float32Array(samples);
    const limit = samples - 1;

    for (let i = 0; i < samples; i += 1) {
      const x = (i * 2) / limit - 1;
      curve[i] = Math.tanh(amount * x);
    }

    return curve;
  }

  function createFilterNode(context, type, frequency, gain = 0, q = 0.7) {
    const filter = context.createBiquadFilter();
    filter.type = type;
    setAudioParamValue(filter.frequency, frequency);
    setAudioParamValue(filter.gain, gain);
    setAudioParamValue(filter.Q, q);
    return filter;
  }

  function createCompressorNode(context, threshold = -18, ratio = 4, attack = 0.006, release = 0.18) {
    const compressor = context.createDynamicsCompressor();
    setAudioParamValue(compressor.threshold, threshold);
    setAudioParamValue(compressor.ratio, ratio);
    setAudioParamValue(compressor.attack, attack);
    setAudioParamValue(compressor.release, release);
    return compressor;
  }

  function createSaturationNode(context, amount = 1.8) {
    const shaper = context.createWaveShaper();
    shaper.curve = buildSoftClipCurve(amount);
    shaper.oversample = "2x";
    return shaper;
  }

  function createReverbNode(context, duration = 1.4, decay = 2.2, reverse = false) {
    const sampleRate = context.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const impulse = context.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const index = reverse ? length - i : i;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, decay);
      }
    }

    const convolver = context.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }

  function connectSeries(source, destination, nodes) {
    let previous = source;

    nodes.forEach((node) => {
      previous.connect(node);
      previous = node;
    });

    previous.connect(destination);
  }

  function rebuildAudioChain() {
    if (!remixEngine?.source || !remixEngine?.context || !remixEngine?.isAvailable) return;

    const { context, source } = remixEngine;
    const preset = REMIX_PRESETS[activeRemixPreset] || REMIX_PRESETS.original;

    try {
      source.disconnect();
    } catch {}

    clearRemixNodes();

    if (audioEl) {
      audioEl.playbackRate = preset.playbackRate || 1;
      audioEl.preservesPitch = preset.preservePitch !== false;
      audioEl.mozPreservesPitch = preset.preservePitch !== false;
      audioEl.webkitPreservesPitch = preset.preservePitch !== false;
    }

    try {
      if (activeRemixPreset === "aiMaster") {
        const highpass = createFilterNode(context, "highpass", 32, 0, 0.65);
        const bass = createFilterNode(context, "lowshelf", 92, 3.5);
        const body = createFilterNode(context, "peaking", 780, -1.4, 0.9);
        const presence = createFilterNode(context, "peaking", 2600, 2.6, 0.85);
        const air = createFilterNode(context, "highshelf", 7200, 2.2);
        const compressor = createCompressorNode(context, -19, 3.4, 0.005, 0.16);

        connectSeries(source, context.destination, [highpass, bass, body, presence, air, compressor]);
        remixEngine.nodes = [highpass, bass, body, presence, air, compressor];
        return;
      }

      if (activeRemixPreset === "neuralClub") {
        const bass = createFilterNode(context, "lowshelf", 82, 8.5);
        const punch = createFilterNode(context, "peaking", 155, 3.2, 1.1);
        const air = createFilterNode(context, "highshelf", 6800, 1.8);
        const compressor = createCompressorNode(context, -23, 5.5, 0.004, 0.11);
        const pump = context.createGain();
        const pumpOsc = context.createOscillator();
        const pumpDepth = context.createGain();

        pump.gain.value = 0.86;
        pumpOsc.type = "sine";
        pumpOsc.frequency.value = 2.15;
        pumpDepth.gain.value = 0.08;
        pumpOsc.connect(pumpDepth);
        pumpDepth.connect(pump.gain);
        pumpOsc.start();

        connectSeries(source, context.destination, [bass, punch, compressor, pump, air]);
        remixEngine.nodes = [bass, punch, compressor, pump, pumpOsc, pumpDepth, air];
        return;
      }

      if (activeRemixPreset === "ghostVocal") {
        const dryGain = context.createGain();
        const bandpass = createFilterNode(context, "bandpass", 1650, 0, 0.82);
        const delay = context.createDelay(0.4);
        const feedback = context.createGain();
        const reverb = createReverbNode(context, 1.2, 2.8);
        const wetGain = context.createGain();

        dryGain.gain.value = 0.78;
        delay.delayTime.value = 0.064;
        feedback.gain.value = 0.18;
        wetGain.gain.value = 0.34;

        source.connect(dryGain);
        dryGain.connect(context.destination);
        source.connect(bandpass);
        bandpass.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(reverb);
        reverb.connect(wetGain);
        wetGain.connect(context.destination);
        remixEngine.nodes = [dryGain, bandpass, delay, feedback, reverb, wetGain];
        return;
      }

      if (activeRemixPreset === "hyperpopGlitch") {
        const highpass = createFilterNode(context, "highpass", 78, 0, 0.72);
        const shine = createFilterNode(context, "highshelf", 5200, 6.8);
        const bite = createFilterNode(context, "peaking", 1800, 3.4, 1.4);
        const shaper = createSaturationNode(context, 2.9);
        const stutter = context.createGain();
        const stutterOsc = context.createOscillator();
        const stutterDepth = context.createGain();
        const compressor = createCompressorNode(context, -20, 4.8, 0.003, 0.09);
        const slap = context.createDelay(0.2);
        const slapGain = context.createGain();

        stutter.gain.value = 0.88;
        stutterOsc.type = "square";
        stutterOsc.frequency.value = 8.5;
        stutterDepth.gain.value = 0.055;
        stutterOsc.connect(stutterDepth);
        stutterDepth.connect(stutter.gain);
        stutterOsc.start();
        slap.delayTime.value = 0.082;
        slapGain.gain.value = 0.12;

        connectSeries(source, context.destination, [highpass, shaper, stutter, bite, shine, compressor]);
        source.connect(slap);
        slap.connect(slapGain);
        slapGain.connect(context.destination);
        remixEngine.nodes = [highpass, shine, bite, shaper, stutter, stutterOsc, stutterDepth, compressor, slap, slapGain];
        return;
      }

      if (activeRemixPreset === "phonkMutation") {
        const highpass = createFilterNode(context, "highpass", 28, 0, 0.65);
        const bass = createFilterNode(context, "lowshelf", 74, 10.5);
        const lowpass = createFilterNode(context, "lowpass", 4300, 0, 0.76);
        const shaper = createSaturationNode(context, 3.2);
        const compressor = createCompressorNode(context, -18, 5, 0.006, 0.18);
        const delay = context.createDelay(0.8);
        const feedback = context.createGain();
        const wetGain = context.createGain();

        delay.delayTime.value = 0.22;
        feedback.gain.value = 0.24;
        wetGain.gain.value = 0.18;

        connectSeries(source, context.destination, [highpass, bass, lowpass, shaper, compressor]);
        source.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wetGain);
        wetGain.connect(context.destination);
        remixEngine.nodes = [highpass, bass, lowpass, shaper, compressor, delay, feedback, wetGain];
        return;
      }

      if (activeRemixPreset === "orbitRoom") {
        const dryGain = context.createGain();
        const highpass = createFilterNode(context, "highpass", 94, 0, 0.64);
        const air = createFilterNode(context, "highshelf", 6200, 3.4);
        const reverb = createReverbNode(context, 2.8, 2.4);
        const wetGain = context.createGain();
        const delay = context.createDelay(1);
        const feedback = context.createGain();
        const echoGain = context.createGain();

        dryGain.gain.value = 0.64;
        wetGain.gain.value = 0.38;
        delay.delayTime.value = 0.34;
        feedback.gain.value = 0.2;
        echoGain.gain.value = 0.16;

        source.connect(dryGain);
        dryGain.connect(context.destination);
        source.connect(highpass);
        highpass.connect(air);
        air.connect(reverb);
        reverb.connect(wetGain);
        wetGain.connect(context.destination);
        air.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(echoGain);
        echoGain.connect(context.destination);
        remixEngine.nodes = [dryGain, highpass, air, reverb, wetGain, delay, feedback, echoGain];
        return;
      }

      source.connect(context.destination);
    } catch (error) {
      console.warn("Ritmoria Remix: failed to rebuild audio chain. Falling back to Original.", error);
      activeRemixPreset = "original";
      try {
        source.disconnect();
        source.connect(context.destination);
      } catch {}
    }
  }

  function applyRemixPreset(presetName) {
    const safePreset = REMIX_PRESETS[presetName] ? presetName : "original";

    if (!audioEl) return;

    const engine = initRemixEngine(audioEl);
    if (!engine?.isAvailable) {
      resetRemixPreset();
      return;
    }

    if (engine.context?.state === "suspended") {
      engine.context.resume().catch(() => {});
    }

    activeRemixPreset = safePreset;
    rebuildAudioChain();
    updateRemixUi();
  }

  function positionRemixMenu() {
    const remixButton = document.getElementById("gp-remix");
    const remixMenu = document.getElementById("gp-remix-menu");

    if (!remixButton || !remixMenu) return;

    const rect = remixButton.getBoundingClientRect();
    const menuRect = remixMenu.getBoundingClientRect();
    const margin = 10;
    const width = menuRect.width || 312;
    const height = menuRect.height || 420;
    const left = Math.max(margin, Math.min(window.innerWidth - width - margin, rect.left + rect.width / 2 - width / 2));
    let top = rect.top - height - 10;

    if (top < margin) {
      top = rect.bottom + 10;
    }

    top = Math.max(margin, Math.min(window.innerHeight - height - margin, top));
    remixMenu.style.left = `${left}px`;
    remixMenu.style.top = `${top}px`;
  }

  function openRemixMenu() {
    const remixMenu = document.getElementById("gp-remix-menu");
    const remixButton = document.getElementById("gp-remix");

    if (!remixMenu || !remixButton) return;

    remixMenu.classList.remove("gp-hidden");
    remixButton.setAttribute("aria-expanded", "true");
    updateRemixUi();
    requestAnimationFrame(positionRemixMenu);
  }

  function closeRemixMenu() {
    const remixMenu = document.getElementById("gp-remix-menu");
    const remixButton = document.getElementById("gp-remix");

    remixMenu?.classList.add("gp-hidden");
    remixButton?.setAttribute("aria-expanded", "false");
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

              <div id="gp-remix-wrap" class="gp-remix-wrap">
                <button id="gp-remix" class="gp-remix-btn" type="button" title="AI Remix" aria-haspopup="true" aria-expanded="false">
                  <i class="fa-solid fa-wand-magic-sparkles"></i>
                  <span id="gp-remix-label">AI Remix</span>
                </button>
              </div>
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

              <input id="gp-volume" class="gp-volume" type="range" min="0" max="1" step="0.01" value="0.2">
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

          <div id="gp-remix-menu" class="gp-remix-menu gp-hidden" role="menu" aria-label="AI Remix Lab">
            <div class="gp-remix-menu-head">
              <div class="gp-remix-head-copy">
                <div class="gp-remix-title">AI Remix</div>
                <div class="gp-remix-subtitle">Live-обработка трека</div>
              </div>
              <div class="gp-remix-live">LIVE</div>
            </div>
            <div class="gp-remix-options">
              ${renderRemixOptionsMarkup()}
            </div>
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
    const remixWrap = document.getElementById("gp-remix-wrap");
    const remixBtn = document.getElementById("gp-remix");
    const remixMenu = document.getElementById("gp-remix-menu");
    const remixOptions = Array.from(document.querySelectorAll("[data-remix-preset]"));
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

    function getCurrentTrackPath(track = getCurrentTrackFromStorage()) {
      if (!track) return "";

      if (track.username_tag && track.slug) {
        return `/${track.username_tag}/${track.slug}`;
      }

      if (track.id) {
        return `/track?id=${encodeURIComponent(track.id)}`;
      }

      return "";
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
      const title = escapeHtml(track?.title || playerT("Без названия"));
      const artist = renderPlayerArtistMarkup(track, { clickable: true });

      return `
        <div class="gp-queue-track ${current ? "is-current" : ""}" data-queue-mode="${mode}" data-queue-index="${index}">
          <button class="gp-queue-track-play" type="button" title="${current ? playerT("Сейчас играет") : playerT("Включить")}">
            <i class="fa-solid ${current ? "fa-volume-high" : "fa-play"}"></i>
          </button>

          <img class="gp-queue-track-cover" src="${cover}" alt="">

          <div class="gp-queue-track-meta">
            <div class="gp-queue-track-title">${title}</div>
            <div class="gp-queue-track-artist">${artist}</div>
          </div>

          ${mode === "queue" ? `
            <button class="gp-queue-track-remove" type="button" title="${playerT("Убрать из очереди")}">
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
              <div class="gp-queue-section-title">${playerT("Недавно слушали")}</div>
              ${recent.map((track, index) => renderQueueTrack(track, { index, mode: "recent" })).join("")}
            </div>
          `
          : `<div class="gp-queue-empty">${playerT("История появится после прослушивания нескольких треков.")}</div>`;
      } else {
        queueContent.innerHTML = `
          <div class="gp-queue-section">
            <div class="gp-queue-section-title">${playerT("Сейчас играет")}</div>
            ${current ? renderQueueTrack(current, { current: true, mode: "current" }) : `<div class="gp-queue-empty">${playerT("Пока ничего не играет.")}</div>`}
          </div>

          <div class="gp-queue-section">
            <div class="gp-queue-section-row">
              <div class="gp-queue-section-title">${playerT("Дальше")}</div>
              ${queue.length ? `<button id="gp-queue-clear" class="gp-queue-clear" type="button">${playerT("Очистить")}</button>` : ""}
            </div>
            ${queue.length
              ? queue.map((track, index) => renderQueueTrack(track, { index, mode: "queue" })).join("")
              : `<div class="gp-queue-empty">${playerT("Добавь треки через меню, и они появятся здесь.")}</div>`
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
    updateRemixUi();

    if (!canUseWebAudio()) {
      remixWrap?.classList.add("gp-hidden");
    }

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
            <div class="gp-playlist-item-title">${playerT("Любимые треки")}</div>
            <div class="gp-playlist-item-count">${formatPlayerTrackCount(count)}</div>
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
        playlistList.innerHTML = `<div class="gp-playlist-empty">${playerT("Система плейлистов не загружена")}</div>`;
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
        playlistList.innerHTML = `<div class="gp-playlist-empty">${playerT("Других плейлистов пока нет")}</div>`;
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
                <div class="gp-playlist-item-title">${escapeHtml(playlist.name)}</div>
                <div class="gp-playlist-item-count">${formatPlayerTrackCount(count)}</div>
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
      const hasSession = typeof window.hasActiveSession === "function"
        ? await window.hasActiveSession()
        : hasPlayerSession();

      if (!track?.id || !hasSession) {
        alert("Нужно войти в аккаунт.");
        return;
      }

      try {
        const res = await fetch("/api/track-like", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
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

    remixBtn?.addEventListener("click", (e) => {
      e.stopPropagation();

      if (!canUseWebAudio()) {
        console.warn("Ritmoria Remix: Web Audio API is not supported in this browser.");
        remixWrap?.classList.add("gp-hidden");
        return;
      }

      if (remixMenu?.classList.contains("gp-hidden")) {
        openRemixMenu();
      } else {
        closeRemixMenu();
      }
    });

    remixOptions.forEach((button) => {
      button.addEventListener("click", () => {
        applyRemixPreset(button.dataset.remixPreset);
        closeRemixMenu();
      });
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
      const targetPath = getCurrentTrackPath();
      if (!targetPath) return;

      closeContextMenu();
      navigateFromPlayer(targetPath);
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
      const targetPath = getCurrentTrackPath();
      if (!targetPath) return;

      closeContextMenu();
      navigateFromPlayer(targetPath);
    });

    coverWrap?.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openTrackContextMenu(e.clientX + 6, e.clientY - 8);
    });

    document.addEventListener("click", (e) => {
      if (!contextMenu?.classList.contains("gp-hidden") && !e.target.closest("#gp-context-menu")) {
        closeContextMenu();
      }

      if (
        !remixMenu?.classList.contains("gp-hidden") &&
        !e.target.closest("#gp-remix-menu") &&
        !e.target.closest("#gp-remix-wrap")
      ) {
        closeRemixMenu();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;

      closeContextMenu();
      closePlaylistModal();
      closeCreatePlaylistModal();
      closeQueuePanel();
      closeRemixMenu();
    });

    window.addEventListener("resize", () => {
      closeContextMenu();

      if (!playlistModal?.classList.contains("gp-hidden")) {
        positionPlaylistModal(playlistModalAnchor || addBtn);
      }

      if (!createPlaylistModal?.classList.contains("gp-hidden")) {
        positionCreatePlaylistModal(createPlaylistModalAnchor || openCreatePlaylistBtn || addBtn);
      }

      if (!remixMenu?.classList.contains("gp-hidden")) {
        positionRemixMenu();
      }
    });

    window.addEventListener("scroll", () => {
      closeContextMenu();
      closeRemixMenu();
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
      closeRemixMenu();
      syncAddButtonState();
      syncContextMenuState();
      syncRepeatButtonState();
      syncProgressFill(0);
      syncLikeButtonState();
      resetRemixPreset();
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
      closeRemixMenu();
      resetRemixPreset();
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
        if (activeRemixPreset !== "original") {
          const engine = initRemixEngine(audioEl);
          engine?.context?.resume?.().catch(() => {});
        }

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
      const res = await fetch(`/user-tracks?tag=${encodeURIComponent(safeTag)}`);

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

    const titleNode = document.getElementById("gp-title");
    const coverNode = document.getElementById("gp-cover-wrap");
    const metaNode = document.querySelector(".gp-meta");
    const targetPath =
      track?.username_tag && track?.slug
        ? `/${track.username_tag}/${track.slug}`
        : (track?.id ? `/track?id=${encodeURIComponent(track.id)}` : "");

    player.classList.remove("hidden");
    titleNode.textContent = track.title || "Unknown track";
    document.getElementById("gp-artist").innerHTML = renderStoredPlayerArtistMarkup(track, { clickable: true });
    document.getElementById("gp-cover").src = track.cover || "/images/default-avatar.jpg";
    titleNode?.classList.toggle("gp-track-linkable", !!targetPath);
    coverNode?.classList.toggle("gp-track-linkable", !!targetPath);
    metaNode?.classList.toggle("gp-track-linkable", !!targetPath);
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

  window.toggleGlobalPlayerPlayback = function () {
    ensurePlayerMarkup();

    if (currentMode === "audio" && audioEl) {
      if (audioEl.paused) {
        audioEl.play().catch(() => {});
      } else {
        audioEl.pause();
      }
      return;
    }

    if (currentMode === "soundcloud" && scWidgetInstance) {
      const isPlaying =
        document.getElementById("global-player")?.dataset.playing === "1";

      if (isPlaying) {
        scWidgetInstance.pause();
      } else {
        scWidgetInstance.play();
      }
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
