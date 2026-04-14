window.initPlaylistsPage = async function () {
  const root = document.querySelector(".playlists-page");
  if (!root) return;

  const grid = root.querySelector(".playlists-grid");
  const createBtn = root.querySelector(".playlists-create-btn");

  const modal = document.getElementById("playlistModal");
  const overlay = root.querySelector(".playlists-modal-overlay");
  const saveBtn = root.querySelector(".playlists-save-btn");
  const cancelBtn = root.querySelector(".playlists-cancel-btn");
  const input = document.getElementById("playlistName");

  const playlistsScreen = document.getElementById("playlistsScreen");
  const playlistView = document.getElementById("playlistView");
  const backBtn = root.querySelector(".playlists-back-btn");

  const viewTitle = document.getElementById("viewTitle");
  const viewCount = document.getElementById("viewCount");
  const viewCover = document.getElementById("viewCover");
  const playlistCoverEditWrap = document.getElementById("playlistCoverEditWrap");
  const playlistRenameBtn = document.getElementById("playlistRenameBtn");
  const playlistCoverBtn = document.getElementById("playlistCoverBtn");
  const tracksBox = root.querySelector(".playlists-tracks-box");

  const coverInput = document.getElementById("coverInput");

  if (
    !grid ||
    !createBtn ||
    !modal ||
    !overlay ||
    !saveBtn ||
    !cancelBtn ||
    !input ||
    !playlistsScreen ||
    !playlistView ||
    !backBtn ||
    !viewTitle ||
    !viewCount ||
    !viewCover ||
    !playlistCoverEditWrap ||
    !playlistRenameBtn ||
    !playlistCoverBtn ||
    !tracksBox ||
    !coverInput
  ) {
    console.log("❌ playlists page elements not found");
    return;
  }

  let currentPlaylistIndex = null;
  let coverTargetIndex = null;
  const durationProbeCache = new Set();
  const favoritesCoverMarkup = `
    <div class="playlists-favorites-cover-core">
      <div class="playlists-favorites-heart-wrap">
        <i class="fa-solid fa-heart"></i>
      </div>
      <div class="playlists-favorites-glow"></div>
    </div>
  `;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatTime(sec) {
    const safe = Number(sec) || 0;
    const m = Math.floor(safe / 60);
    const s = Math.floor(safe % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  function formatAddedDate(value) {
    if (!value) return "Недавно";

    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "Недавно";

      const diffMs = Date.now() - date.getTime();
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffDays <= 0) return "Сегодня";
      if (diffDays === 1) return "Вчера";
      if (diffDays < 7) return `${diffDays} дн. назад`;

      return date.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    } catch {
      return "Недавно";
    }
  }

  function getTokenPayload() {
    try {
      const token = localStorage.getItem("token");
      if (!token) return null;

      const parts = token.split(".");
      if (parts.length < 2) return null;

      const payload = JSON.parse(atob(parts[1]));
      return payload || null;
    } catch (err) {
      console.log("token parse error", err);
      return null;
    }
  }

  function getCurrentUserId() {
    const payload = getTokenPayload();
    return payload?.id || "guest";
  }

  function getStorageKey() {
    return `ritmoria_playlists_user_${getCurrentUserId()}`;
  }

  function normalizeTrack(track) {
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

    const cover =
      track.cover
        ? (String(track.cover).startsWith("http")
            ? String(track.cover)
            : "/" + String(track.cover).replace(/^\/+/, ""))
        : "/images/default-cover.jpg";

    const audioSrc = track.audioSrc
      ? track.audioSrc
      : track.audio
        ? (String(track.audio).startsWith("http")
            ? String(track.audio)
            : "/" + String(track.audio).replace(/^\/+/, ""))
        : "";

    return {
      id: Number(track.id) || 0,
      title: track.title || "Без названия",
      artist: track.artist || "Unknown artist",
      cover,
      audioSrc,
      soundcloud: track.soundcloud || "",
      slug: track.slug || "",
      username_tag: track.username_tag || "",
      duration: Number(track.duration || track._duration || (sameAsCurrent ? currentDuration : 0) || 0) || 0,
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

    return [favorites, ...others.map((p) => ({
      id: p.id || `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: p.name || "Без названия",
      system: !!p.system,
      cover: p.cover || "",
      tracks: Array.isArray(p.tracks) ? p.tracks : []
    }))];
  }

  function getPlaylists() {
    try {
      const raw = JSON.parse(localStorage.getItem(getStorageKey()) || "[]");
      return ensureFavoritesPlaylist(raw);
    } catch (err) {
      console.log("playlists parse error", err);
      return ensureFavoritesPlaylist([]);
    }
  }

  function savePlaylists(playlists) {
    const safe = ensureFavoritesPlaylist(playlists);
    localStorage.setItem(getStorageKey(), JSON.stringify(safe));
    window.dispatchEvent(new CustomEvent("ritmoria:playlists-updated"));
    return safe;
  }

  function updateStoredTrackDuration(trackToMatch, duration) {
    const safeDuration = Math.max(0, Number(duration) || 0);
    if (!safeDuration) return false;

    const playlists = getPlaylists();
    let changed = false;

    playlists.forEach((playlist) => {
      if (!Array.isArray(playlist?.tracks)) return;

      playlist.tracks = playlist.tracks.map((track) => {
        const sameTrack =
          (trackToMatch?.id && track.id && Number(track.id) === Number(trackToMatch.id)) ||
          (trackToMatch?.audioSrc && track.audioSrc && String(track.audioSrc) === String(trackToMatch.audioSrc)) ||
          (trackToMatch?.soundcloud && track.soundcloud && String(track.soundcloud) === String(trackToMatch.soundcloud));

        if (!sameTrack) return track;
        if (Number(track.duration || 0) === safeDuration) return track;

        changed = true;
        return {
          ...track,
          duration: safeDuration
        };
      });
    });

    if (!changed) return false;

    savePlaylists(playlists);
    return true;
  }

  function hydrateTrackDuration(track) {
    const audioSrc = String(track?.audioSrc || "").trim();
    if (!audioSrc || Number(track?.duration || 0) > 0) return;
    if (durationProbeCache.has(audioSrc)) return;

    durationProbeCache.add(audioSrc);

    const probe = new Audio();
    probe.preload = "metadata";

    const cleanup = () => {
      probe.onloadedmetadata = null;
      probe.onerror = null;
      probe.removeAttribute("src");
    };

    probe.onloadedmetadata = () => {
      const duration = Number(probe.duration || 0) || 0;
      cleanup();

      if (!duration) return;

      const updated = updateStoredTrackDuration(track, duration);
      if (updated && currentPlaylistIndex !== null) {
        updatePlaylistView();
      }
    };

    probe.onerror = () => {
      cleanup();
    };

    probe.src = audioSrc;
  }

  function hydratePlaylistDurations(playlist) {
    if (!playlist || !Array.isArray(playlist.tracks)) return;
    playlist.tracks.forEach((track) => hydrateTrackDuration(track));
  }

  function getPlaylistById(playlistId) {
    return getPlaylists().find((p) => p.id === playlistId) || null;
  }

  function getFavoritesPlaylist() {
    return getPlaylistById("favorites");
  }

  function isTrackInPlaylist(playlistId, trackId) {
    const playlist = getPlaylistById(playlistId);
    if (!playlist) return false;
    return playlist.tracks.some((t) => Number(t.id) === Number(trackId));
  }

  function isTrackInFavorites(trackId) {
    return isTrackInPlaylist("favorites", trackId);
  }

  function createPlaylist(name) {
    const playlists = getPlaylists();
    const trimmed = String(name || "").trim();

    if (!trimmed) return null;

    const newPlaylist = {
      id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      system: false,
      cover: "",
      tracks: []
    };

    playlists.push(newPlaylist);
    savePlaylists(playlists);
    return newPlaylist;
  }

  function renamePlaylist(playlistId, newName) {
    const playlists = getPlaylists();
    const playlist = playlists.find((p) => p.id === playlistId);
    const trimmed = String(newName || "").trim();

    if (!playlist || playlist.system || !trimmed) return false;

    playlist.name = trimmed;
    savePlaylists(playlists);
    return true;
  }

  function deletePlaylist(playlistId) {
    if (playlistId === "favorites") return false;

    const playlists = getPlaylists();
    const next = playlists.filter((p) => p.id !== playlistId);
    savePlaylists(next);
    return true;
  }

  function addTrackToPlaylist(playlistId, track) {
    const playlists = getPlaylists();
    const playlist = playlists.find((p) => p.id === playlistId);
    const normalized = normalizeTrack(track);

    if (!playlist || !normalized || !normalized.id) return false;

    const exists = playlist.tracks.some((t) => Number(t.id) === Number(normalized.id));
    if (exists) return false;

    playlist.tracks.unshift(normalized);

    if (!playlist.cover && normalized.cover) {
      playlist.cover = normalized.cover;
    }

    savePlaylists(playlists);
    return true;
  }

  function removeTrackFromPlaylist(playlistId, trackId) {
    const playlists = getPlaylists();
    const playlist = playlists.find((p) => p.id === playlistId);
    if (!playlist) return false;

    const before = playlist.tracks.length;
    playlist.tracks = playlist.tracks.filter((t) => Number(t.id) !== Number(trackId));

    if (playlist.cover && playlist.tracks.length === 0 && !playlist.system) {
      playlist.cover = "";
    }

    savePlaylists(playlists);
    return playlist.tracks.length !== before;
  }

  function toggleTrackInFavorites(track) {
    const normalized = normalizeTrack(track);
    if (!normalized || !normalized.id) {
      return { added: false, removed: false };
    }

    if (isTrackInFavorites(normalized.id)) {
      removeTrackFromPlaylist("favorites", normalized.id);
      return { added: false, removed: true };
    }

    addTrackToPlaylist("favorites", normalized);
    return { added: true, removed: false };
  }

  function getPlaylistTrackCount(playlist) {
    return Array.isArray(playlist?.tracks) ? playlist.tracks.length : 0;
  }

  function getPlaylistDuration(playlist) {
    return (playlist?.tracks || []).reduce((sum, track) => {
      return sum + (Number(track?.duration) || 0);
    }, 0);
  }

  function formatPlaylistDuration(sec) {
    const safe = Number(sec) || 0;
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = Math.floor(safe % 60);

    if (hours > 0) {
      return `${hours} ч ${String(minutes).padStart(2, "0")} мин`;
    }

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function isCurrentPlaylistTrack(track, playlistId = "") {
    const current = window.getGlobalPlayerState?.()?.track;
    if (!current || !track) return false;
    if (playlistId && current.playlist_source_id && String(current.playlist_source_id) !== String(playlistId)) {
      return false;
    }

    if (current.id && track.id && Number(current.id) === Number(track.id)) return true;
    if (current.audioSrc && track.audioSrc && current.audioSrc === track.audioSrc) return true;
    if (current.soundcloud && track.soundcloud && current.soundcloud === track.soundcloud) return true;
    return false;
  }

  function isCurrentPlaylistTrackPlaying(track, playlistId = "") {
    if (!isCurrentPlaylistTrack(track, playlistId)) return false;
    return !!window.getGlobalPlayerState?.()?.isPlaying;
  }

  function getActivePlaylistTrack(playlist) {
    return (playlist?.tracks || []).find((track) => isCurrentPlaylistTrack(track, playlist?.id)) || null;
  }

  function toggleGlobalPlayerPlayback() {
    document.getElementById("gp-play")?.click();
  }

  function getCoverMarkup(playlist, extraClass = "") {
    if (playlist?.id === "favorites") {
      return `
        <div class="playlists-cover playlists-cover-favorites ${extraClass}">
          ${favoritesCoverMarkup}
        </div>
      `;
    }

    const style = playlist.cover
      ? `style="background-image:url('${playlist.cover}')"`
      : "";

    return `<div class="playlists-cover ${extraClass}" ${style}></div>`;
  }

  function closeAllMenus() {
    root.querySelectorAll(".playlist-menu.open").forEach((menu) => {
      menu.classList.remove("open");
      const dropdown = menu.querySelector(".playlists-menu-dropdown");
      if (dropdown) dropdown.classList.add("playlists-hidden");
    });
  }

  function renderTrackRow(track, playlistId, index) {
    const cover = track.cover || "/images/default-cover.jpg";
    const duration = formatTime(track.duration || 0);
    const addedDate = formatAddedDate(track.addedAt);
    const isActive = isCurrentPlaylistTrack(track, playlistId);
    const isPlaying = isCurrentPlaylistTrackPlaying(track, playlistId);

    return `
      <div class="playlist-track-row ${isActive ? "is-active" : ""}" data-track-id="${Number(track.id)}">
        <div class="playlist-track-index">
          <span class="playlist-track-index-number">${index + 1}</span>
          <button
            class="playlist-track-play-btn"
            type="button"
            onclick="window.__togglePlaylistTrackPlayback('${escapeHtml(playlistId)}', ${Number(track.id)})"
            aria-label="Слушать ${escapeHtml(track.title)}"
          >
            <i class="fa-solid ${isActive && isPlaying ? "fa-pause" : "fa-play"}"></i>
          </button>
        </div>

        <div class="playlist-track-main-cell" onclick="window.__playPlaylistTrack('${escapeHtml(playlistId)}', ${Number(track.id)})">
          <img class="playlist-track-cover" src="${cover}" alt="${escapeHtml(track.title)}">
          <div class="playlist-track-meta">
            <div
              class="playlist-track-title"
              onclick="event.stopPropagation(); window.__openPlaylistTrack('${escapeHtml(playlistId)}', ${Number(track.id)})"
            >
              ${escapeHtml(track.title)}
            </div>
            <div class="playlist-track-artist-line">
              <span
                class="playlist-track-artist"
                onclick="event.stopPropagation(); window.__openPlaylistAuthor('${escapeHtml(track.username_tag)}')"
              >
                ${escapeHtml(track.artist)}
              </span>
            </div>
          </div>
        </div>

        <div class="playlist-track-added">
          ${addedDate}
        </div>

        <div class="playlist-track-right">
          <div class="playlist-track-duration">${duration}</div>

          <button
            class="playlist-track-remove-btn"
            type="button"
            onclick="window.__removeTrackFromPlaylistView('${escapeHtml(playlistId)}', ${Number(track.id)})"
            aria-label="Удалить трек"
          >
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
      </div>
    `;
  }

  function renderPlaylistTracks(playlist) {
    if (!playlist) return;

    hydratePlaylistDurations(playlist);

    if (!playlist.tracks.length) {
      tracksBox.innerHTML = `
        <div class="playlists-empty-tracks">
          <p>Здесь пока нет треков</p>
        </div>
      `;
      return;
    }

    const totalDuration = formatPlaylistDuration(getPlaylistDuration(playlist));
    const activeTrack = getActivePlaylistTrack(playlist);
    const isPlaylistPlaying = !!activeTrack && !!window.getGlobalPlayerState?.()?.isPlaying;

    tracksBox.innerHTML = `
      <div class="playlists-toolbar">
        <div class="playlists-toolbar-left">
          <button
            class="playlists-play-btn ${isPlaylistPlaying ? "is-playing" : ""}"
            type="button"
            onclick="window.__togglePlaylistPlayback('${escapeHtml(playlist.id)}')"
          >
            <i class="fa-solid ${isPlaylistPlaying ? "fa-pause" : "fa-play"}"></i>
          </button>

          <button
            class="playlists-toolbar-icon"
            type="button"
            onclick="window.__playlistSecondaryAction('${escapeHtml(playlist.id)}')"
            title="Дополнительное действие"
          >
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>

        <div class="playlists-toolbar-meta">
          <span>${playlist.tracks.length} треков</span>
          <span>•</span>
          <span>${totalDuration}</span>
        </div>
      </div>

      <div class="playlist-tracks-table">
        <div class="playlist-tracks-head">
          <div>#</div>
          <div>Название</div>
          <div>Дата добавления</div>
          <div>Длительность</div>
        </div>

        <div class="playlist-tracks-list">
          ${playlist.tracks.map((track, index) => renderTrackRow(track, playlist.id, index)).join("")}
        </div>
      </div>
    `;
  }

  function updatePlaylistView() {
    const playlists = getPlaylists();
    const playlist = playlists[currentPlaylistIndex];

    if (!playlist) return;

    viewTitle.textContent = playlist.name;
    viewCount.textContent = `${getPlaylistTrackCount(playlist)} треков • ${formatPlaylistDuration(getPlaylistDuration(playlist))}`;
    playlistRenameBtn.classList.toggle("playlists-hidden", !!playlist.system);
    playlistCoverBtn.classList.toggle("playlists-hidden", !!playlist.system);
    playlistCoverEditWrap.classList.toggle("is-editable", !playlist.system);

    if (playlist.id === "favorites") {
      viewCover.className = "playlists-cover playlists-cover-large playlists-cover-favorites";
      viewCover.style.backgroundImage = "";
      viewCover.innerHTML = favoritesCoverMarkup;
    } else if (playlist.cover) {
      viewCover.className = "playlists-cover playlists-cover-large";
      viewCover.style.backgroundImage = `url("${playlist.cover}")`;
      viewCover.innerHTML = "";
    } else {
      viewCover.className = "playlists-cover playlists-cover-large";
      viewCover.style.backgroundImage = "";
      viewCover.innerHTML = "";
    }

    renderPlaylistTracks(playlist);
  }

  function renderEmptyState() {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M29,16.5A13.08,13.08,0,0,0,25.7,8l0.7-.73L26,6.92A14.42,14.42,0,0,0,16,3,14.42,14.42,0,0,0,6,6.92L5.6,7.26,6.3,8A13.08,13.08,0,0,0,3,16.5a10.57,10.57,0,0,0,3,7.69V27H8a2,2,0,0,0,4,0V19a2,2,0,0,0-4,0H6v3.67A9.7,9.7,0,0,1,4,16.5,12,12,0,0,1,7,8.72L7.67,9.43,8,9.08A11.25,11.25,0,0,1,16,6a11.25,11.25,0,0,1,8,3.08l0.36,0.35L25,8.72a12,12,0,0,1,3,7.78,9.7,9.7,0,0,1-2,6.17V19H24a2,2,0,0,0-4,0v8a2,2,0,0,0,4,0h2V24.19A10.57,10.57,0,0,0,29,16.5ZM10,18a1,1,0,0,1,1,1v8a1,1,0,0,1-2,0V19A1,1,0,0,1,10,18ZM7,20H8v6H7V20ZM24.29,8A12.26,12.26,0,0,0,16,5,12.26,12.26,0,0,0,7.71,8L7,7.3A13.47,13.47,0,0,1,16,4a13.47,13.47,0,0,1,9,3.3ZM22,28a1,1,0,0,1-1-1V19a1,1,0,0,1,2,0v8A1,1,0,0,1,22,28Zm3-2H24V20h1v6Z"></path>
          </svg>
        </div>
        <h3>У тебя пока нет плейлистов</h3>
        <p>Создай первый и добавляй любимые треки</p>
      </div>
    `;
  }

  function renderPlaylists() {
    const playlists = getPlaylists();
    grid.innerHTML = "";

    if (!playlists.length) {
      renderEmptyState();
      return;
    }

    playlists.forEach((playlist, index) => {
      const count = getPlaylistTrackCount(playlist);
      const activeTrack = getActivePlaylistTrack(playlist);
      const isPlaylistPlaying = !!activeTrack && !!window.getGlobalPlayerState?.()?.isPlaying;

      const card = document.createElement("article");
      card.className = `playlist-card ${isPlaylistPlaying ? "is-playing" : ""}`;
      card.style.animationDelay = `${index * 0.06}s`;

      card.innerHTML = `
        <div class="playlist-menu">
          <button class="playlists-menu-btn" type="button" aria-label="Настройки плейлиста">
            <span class="menu-dots">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </button>

          <div class="playlists-menu-dropdown playlists-hidden">
            ${
              playlist.system
                ? `
                  <button class="playlists-menu-item system-label" type="button" disabled>
                    <span class="menu-icon">⭐</span>
                    <span>Системный плейлист</span>
                  </button>
                `
                : `
                  <button class="playlists-menu-item rename" type="button">
                    <span class="menu-icon">✏️</span>
                    <span>Изменить название</span>
                  </button>

                  <button class="playlists-menu-item cover-action" type="button">
                    <span class="menu-icon">🖼</span>
                    <span>Изменить обложку</span>
                  </button>

                  <button class="playlists-menu-item delete" type="button">
                    <span class="menu-icon">🗑</span>
                    <span>Удалить</span>
                  </button>
                `
            }
          </div>
        </div>

        <div class="playlist-card-cover-wrap">
          ${getCoverMarkup(playlist)}
          <button
            class="playlist-card-play-btn ${isPlaylistPlaying ? "is-playing" : ""}"
            type="button"
            aria-label="Слушать плейлист ${escapeHtml(playlist.name)}"
          >
            <i class="fa-solid ${isPlaylistPlaying ? "fa-pause" : "fa-play"}"></i>
          </button>
        </div>
        <h3>${escapeHtml(playlist.name)}</h3>
        <p>${count} треков</p>
      `;

      const menu = card.querySelector(".playlist-menu");
      const menuBtn = card.querySelector(".playlists-menu-btn");
      const dropdown = card.querySelector(".playlists-menu-dropdown");
      const renameBtn = card.querySelector(".rename");
      const coverBtn = card.querySelector(".cover-action");
      const deleteBtn = card.querySelector(".delete");
      const coverPlayBtn = card.querySelector(".playlist-card-play-btn");

      card.addEventListener("click", () => {
        openPlaylist(index);
      });

      coverPlayBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        window.__togglePlaylistPlayback?.(playlist.id);
      });

      menuBtn?.addEventListener("click", (e) => {
        e.stopPropagation();

        const isOpen = menu.classList.contains("open");
        closeAllMenus();

        if (!isOpen) {
          menu.classList.add("open");
          dropdown?.classList.remove("playlists-hidden");
        }
      });

      dropdown?.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      renameBtn?.addEventListener("click", () => {
        const newName = prompt("Новое название плейлиста:", playlist.name);
        if (!newName) return;

        renamePlaylist(playlist.id, newName);
        renderPlaylists();

        if (currentPlaylistIndex === index) {
          updatePlaylistView();
        }
      });

      coverBtn?.addEventListener("click", () => {
        coverTargetIndex = index;
        coverInput.click();
      });

      deleteBtn?.addEventListener("click", () => {
        const confirmed = confirm(`Удалить плейлист "${playlist.name}"?`);
        if (!confirmed) return;

        deletePlaylist(playlist.id);
        closeAllMenus();

        if (currentPlaylistIndex === index) {
          currentPlaylistIndex = null;
          playlistView.classList.add("playlists-hidden");
          playlistsScreen.classList.remove("playlists-hidden");
        } else if (currentPlaylistIndex !== null && currentPlaylistIndex > index) {
          currentPlaylistIndex -= 1;
        }

        renderPlaylists();
      });

      grid.appendChild(card);
    });
  }

  function openPlaylist(index) {
    currentPlaylistIndex = index;
    updatePlaylistView();

    playlistsScreen.classList.add("playlists-hidden");
    playlistView.classList.remove("playlists-hidden");
    closeAllMenus();
  }

  function closePlaylistView() {
    currentPlaylistIndex = null;
    playlistView.classList.add("playlists-hidden");
    playlistsScreen.classList.remove("playlists-hidden");
  }

  function openModal() {
    modal.classList.add("active");
    input.value = "";
    setTimeout(() => input.focus(), 80);
  }

  function closeModal() {
    modal.classList.remove("active");
  }

  function handleCreatePlaylist() {
    const created = createPlaylist(input.value);
    if (!created) return;

    closeModal();
    renderPlaylists();
  }

  window.__removeTrackFromPlaylistView = function (playlistId, trackId) {
    removeTrackFromPlaylist(playlistId, trackId);

    const playlists = getPlaylists();
    const newIndex = playlists.findIndex((p) => p.id === playlistId);

    if (newIndex !== -1) {
      currentPlaylistIndex = newIndex;
      updatePlaylistView();
    }

    renderPlaylists();
  };

  function syncPlaylistRemainderToQueue(playlist, startTrackId) {
    if (!playlist?.tracks?.length || typeof window.setGlobalPlayerQueue !== "function") return;

    const startIndex = playlist.tracks.findIndex((track) => Number(track.id) === Number(startTrackId));
    const rest = playlist.tracks
      .slice(startIndex >= 0 ? startIndex + 1 : 1)
      .map((track) => ({
        ...track,
        playlist_source_id: playlist.id,
        play_context: "playlist"
      }));

    window.setGlobalPlayerQueue(rest, {
      playlist_source_id: playlist.id,
      play_context: "playlist",
      open: false
    });
  }

  window.__playPlaylistTrack = function (playlistId, trackId) {
    const playlist = getPlaylistById(playlistId);
    if (!playlist) return;

    const track = playlist.tracks.find((t) => Number(t.id) === Number(trackId));
    if (!track || typeof window.playTrackGlobal !== "function") return;

    window.playTrackGlobal({
      ...track,
      playlist_source_id: playlistId,
      play_context: "playlist"
    });
    syncPlaylistRemainderToQueue(playlist, track.id);
    updatePlaylistView();
    renderPlaylists();
  };

  window.__togglePlaylistTrackPlayback = function (playlistId, trackId) {
    const playlist = getPlaylistById(playlistId);
    const track = playlist?.tracks?.find((t) => Number(t.id) === Number(trackId));
    if (!track) return;

    if (isCurrentPlaylistTrack(track, playlistId)) {
      toggleGlobalPlayerPlayback();
      updatePlaylistView();
      renderPlaylists();
      return;
    }

    window.__playPlaylistTrack(playlistId, trackId);
  };

  window.__playPlaylistFromStart = function (playlistId) {
    const playlist = getPlaylistById(playlistId);
    const firstTrack = playlist?.tracks?.[0];
    if (!firstTrack || typeof window.playTrackGlobal !== "function") return;

    window.playTrackGlobal({
      ...firstTrack,
      playlist_source_id: playlistId,
      play_context: "playlist"
    });
    syncPlaylistRemainderToQueue(playlist, firstTrack.id);
    updatePlaylistView();
    renderPlaylists();
  };

  window.__togglePlaylistPlayback = function (playlistId) {
    const playlist = getPlaylistById(playlistId);
    if (!playlist?.tracks?.length) return;

    const activeTrack = getActivePlaylistTrack(playlist);
    if (activeTrack) {
      toggleGlobalPlayerPlayback();
      updatePlaylistView();
      return;
    }

    window.__playPlaylistFromStart(playlistId);
  };

  window.__playlistSecondaryAction = function () {
    alert("Эту кнопку докрутим следующим шагом.");
  };

  window.__togglePlaylistFavorites = function (playlistId) {
    const playlist = getPlaylistById(playlistId);
    const firstTrack = playlist?.tracks?.[0];
    if (!firstTrack || !window.RitmoriaPlaylists) return;

    window.RitmoriaPlaylists.toggleTrackInFavorites(firstTrack);
    updatePlaylistView();
    renderPlaylists();
  };

  window.__openPlaylistTrack = function (playlistId, trackId) {
    const playlist = getPlaylistById(playlistId);
    if (!playlist) return;

    const track = playlist.tracks.find((t) => Number(t.id) === Number(trackId));
    if (!track) return;

    if (track.username_tag && track.slug && typeof navigate === "function") {
      navigate(`/${track.username_tag}/${track.slug}`);
    }
  };

  window.__openPlaylistAuthor = function (tag) {
    if (!tag) return;
    if (typeof navigate === "function") {
      navigate(`/${tag}`);
    }
  };

  createBtn.onclick = openModal;
  overlay.onclick = closeModal;
  cancelBtn.onclick = closeModal;
  saveBtn.onclick = handleCreatePlaylist;
  backBtn.onclick = closePlaylistView;
  playlistRenameBtn.onclick = () => {
    const playlists = getPlaylists();
    const playlist = playlists[currentPlaylistIndex];
    if (!playlist || playlist.system) return;

    const newName = prompt("Новое название плейлиста:", playlist.name);
    if (!newName) return;

    renamePlaylist(playlist.id, newName);
    renderPlaylists();
    updatePlaylistView();
  };
  playlistCoverBtn.onclick = () => {
    const playlists = getPlaylists();
    const playlist = playlists[currentPlaylistIndex];
    if (!playlist || playlist.system) return;

    coverTargetIndex = currentPlaylistIndex;
    coverInput.click();
  };

  input.onkeydown = (e) => {
    if (e.key === "Enter") {
      handleCreatePlaylist();
    }

    if (e.key === "Escape") {
      closeModal();
    }
  };

  coverInput.onchange = () => {
    const file = coverInput.files?.[0];
    if (!file || coverTargetIndex === null) return;

    const reader = new FileReader();

    reader.onload = () => {
      const playlists = getPlaylists();
      const playlist = playlists[coverTargetIndex];

      if (!playlist || playlist.system) return;

      playlist.cover = String(reader.result || "");
      savePlaylists(playlists);

      renderPlaylists();

      if (currentPlaylistIndex === coverTargetIndex) {
        updatePlaylistView();
      }
    };

    reader.readAsDataURL(file);
    coverInput.value = "";
  };

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".playlist-menu")) {
      closeAllMenus();
    }
  });

  window.addEventListener("ritmoria:global-player-track-change", () => {
    renderPlaylists();
    if (currentPlaylistIndex !== null) {
      updatePlaylistView();
    }
  });

  window.addEventListener("ritmoria:global-player-play", () => {
    renderPlaylists();
    if (currentPlaylistIndex !== null) {
      updatePlaylistView();
    }
  });

  window.addEventListener("ritmoria:global-player-pause", () => {
    renderPlaylists();
    if (currentPlaylistIndex !== null) {
      updatePlaylistView();
    }
  });

  window.addEventListener("ritmoria:global-player-stopped", () => {
    renderPlaylists();
    if (currentPlaylistIndex !== null) {
      updatePlaylistView();
    }
  });

  savePlaylists(getPlaylists());
  renderPlaylists();

  const existingApi = window.RitmoriaPlaylists || {};

  window.RitmoriaPlaylists = {
    ...existingApi,
    
    getAll() {
      return getPlaylists();
    },

    getById(playlistId) {
      return getPlaylistById(playlistId);
    },

    getFavorites() {
      return getFavoritesPlaylist();
    },

    createPlaylist(name) {
      const created = createPlaylist(name);
      renderPlaylists();
      return created;
    },

    addTrackToPlaylist(playlistId, track) {
      const ok = addTrackToPlaylist(playlistId, track);
      renderPlaylists();

      if (currentPlaylistIndex !== null) {
        updatePlaylistView();
      }

      return ok;
    },

    removeTrackFromPlaylist(playlistId, trackId) {
      const ok = removeTrackFromPlaylist(playlistId, trackId);
      renderPlaylists();

      if (currentPlaylistIndex !== null) {
        updatePlaylistView();
      }

      return ok;
    },

    toggleTrackInFavorites(track) {
      const result = toggleTrackInFavorites(track);
      renderPlaylists();

      if (currentPlaylistIndex !== null) {
        updatePlaylistView();
      }

      return result;
    },

    isTrackInFavorites(trackId) {
      return isTrackInFavorites(trackId);
    },

    isTrackInPlaylist(playlistId, trackId) {
      return isTrackInPlaylist(playlistId, trackId);
    },

    isTrackInAnyPlaylist(trackId) {
      return getPlaylists().some((playlist) =>
        Array.isArray(playlist?.tracks) &&
        playlist.tracks.some((track) => Number(track.id) === Number(trackId))
      );
    },

    ensureInitialized() {
      savePlaylists(getPlaylists());
      renderPlaylists();
    }
  };
};
