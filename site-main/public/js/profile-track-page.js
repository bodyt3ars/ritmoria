window.__profileTrackWaveSurfer = window.__profileTrackWaveSurfer || null;
window.__profileTrackPageState = window.__profileTrackPageState || {
  track: null,
  eventsBound: false,
  audioBound: false,
  listenedSeconds: 0,
  lastTime: 0,
  threshold: 0,
  counted: false,
  pendingListen: false,
  wasPlaying: false,
  sessionId: 0,
  waveSyncLocked: false
};

function getProfileTrackPageState() {
  return window.__profileTrackPageState;
}

function formatProfileTrackTime(t) {
  const safeTime = Number.isFinite(t) ? t : 0;
  const m = Math.floor(safeTime / 60);
  const s = Math.floor(safeTime % 60);
  return m + ":" + (s < 10 ? "0" + s : s);
}

function formatProfileTrackDate(value) {
  if (!value) return "";

  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function escapeProfileTrackHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getProfileTrackArtistDisplay(track) {
  if (typeof window.renderTrackArtistDisplay === "function") {
    return {
      html: window.renderTrackArtistDisplay(track, { asHtml: true }),
      text: window.renderTrackArtistDisplay(track, { asHtml: false })
    };
  }

  const artist = String(track?.artist || "Неизвестный артист");
  return {
    html: escapeProfileTrackHtml(artist),
    text: artist
  };
}

function buildProfileTrackCoverSrc(track) {
  return track?.cover
    ? "/" + String(track.cover).replace(/^\/+/, "")
    : "/images/default-cover.jpg";
}

function buildProfileTrackAudioSrc(track) {
  return track?.audio
    ? "/" + String(track.audio).replace(/^\/+/, "")
    : "";
}

function buildProfileTrackUrl(track) {
  if (!track?.username_tag || !track?.slug) return location.href;
  return `${location.origin}/${track.username_tag}/${track.slug}`;
}

function isSameProfileTrack(track, current) {
  if (!track || !current) return false;

  if (track.id && current.id && Number(track.id) === Number(current.id)) {
    return true;
  }

  const thisAudioSrc = buildProfileTrackAudioSrc(track);

  return (
    (thisAudioSrc && current.audioSrc === thisAudioSrc) ||
    (!!track.soundcloud && current.soundcloud === track.soundcloud)
  );
}

function resetProfileTrackListenSession() {
  const state = getProfileTrackPageState();
  state.listenedSeconds = 0;
  state.lastTime = 0;
  state.threshold = 0;
  state.counted = false;
  state.pendingListen = false;
  state.wasPlaying = false;
}

function beginProfileTrackListenSession(track, audio) {
  const state = getProfileTrackPageState();

  state.track = track || state.track;
  state.sessionId += 1;
  state.listenedSeconds = 0;
  state.lastTime = audio?.currentTime || 0;
  state.threshold = audio?.duration && isFinite(audio.duration)
    ? Math.min(30, audio.duration * 0.5)
    : 0;
  state.counted = false;
  state.pendingListen = false;
  state.wasPlaying = !!audio && !audio.paused;
}

function destroyProfileTrackWave() {
  const state = getProfileTrackPageState();
  if (window.__profileTrackWaveSurfer) {
    try {
      window.__profileTrackWaveSurfer.destroy();
    } catch (e) {
      console.log("WaveSurfer destroy error:", e);
    }
    window.__profileTrackWaveSurfer = null;
  }
  state.waveSyncLocked = false;
}

window.loadProfileTrackPage = async function (tag, slug) {
  const pageState = getProfileTrackPageState();
  let track = null;
  let trackId = null;

  const titleEl = document.getElementById("profileTrackTitle");
  const artistEl = document.getElementById("profileTrackArtist");
  const artistLinkEl = document.getElementById("profileTrackArtistLink");
  const producerEl = document.getElementById("profileTrackProducer");
  const genreEl = document.getElementById("profileTrackGenre");
  const releaseEl = document.getElementById("profileTrackRelease");
  const descriptionEl = document.getElementById("profileTrackDescription");
  const bodyDescriptionEl = document.getElementById("profileTrackBodyDescription");
  const bodyTagsEl = document.getElementById("profileTrackBodyTags");
  const descriptionToggleEl = document.getElementById("profileTrackDescriptionToggle");
  const tagsEl = document.getElementById("profileTrackTags");
  const coverEl = document.getElementById("profileTrackCover");
  const playBtn = document.getElementById("profileTrackPlayBtn");
  const likeBtn = document.getElementById("profileTrackLikeButton");
  const queueBtn = document.getElementById("profileTrackQueueButton");
  const likesCountEl = document.getElementById("profileTrackLikesCount");
  const listensCountEl = document.getElementById("profileTrackListensCount");
  const commentsCountEl = document.getElementById("profileTrackCommentsCount");
  const commentsCountMirrorEl = document.getElementById("profileTrackCommentsCountMirror");
  const copyLinkBtn = document.getElementById("profileTrackCopyLinkBtn");
  const commentsJumpBtn = document.getElementById("profileTrackCommentsJumpBtn");
  const currentTimeEl = document.getElementById("profileTrackCurrentTime");
  const durationEl = document.getElementById("profileTrackDuration");
  const waveformEl = document.getElementById("profileTrackWaveform");
  const waveformStatusEl = document.getElementById("profileTrackWaveStatus");
  const commentsBlockEl = document.getElementById("profileTrackCommentsBlock");
  const commentsList = document.getElementById("profileTrackCommentsList");
  const commentInput = document.getElementById("profileTrackCommentInput");
  const commentButton = document.getElementById("profileTrackCommentButton");
  const commentAvatarEl = document.getElementById("profileTrackCommentAvatar");

  if (
    !titleEl ||
    !artistEl ||
    !producerEl ||
    !genreEl ||
    !descriptionEl ||
    !bodyDescriptionEl ||
    !bodyTagsEl ||
    !tagsEl ||
    !coverEl ||
    !playBtn ||
    !likeBtn ||
    !likesCountEl ||
    !listensCountEl ||
    !commentsCountEl ||
    !currentTimeEl ||
    !durationEl ||
    !waveformEl ||
    !commentsList
  ) {
    console.log("❌ profile track page elements not found");
    return;
  }

  pageState.track = null;
  resetProfileTrackListenSession();
  destroyProfileTrackWave();

  try {
    const res = await fetch(`/api/track/${encodeURIComponent(tag)}/${encodeURIComponent(slug)}`);

    if (!res.ok) {
      throw new Error(`Track request failed: ${res.status}`);
    }

    track = await res.json();
  } catch (err) {
    console.log("❌ FETCH FAILED:", err);
    waveformEl.innerHTML = `<div class="profile-track-error">Не удалось загрузить трек.</div>`;
    commentsList.innerHTML = "";
    playBtn.disabled = true;
    return;
  }

  if (!track || !track.id) {
    waveformEl.innerHTML = `<div class="profile-track-error">Трек не найден.</div>`;
    commentsList.innerHTML = "";
    playBtn.disabled = true;
    return;
  }

  trackId = track.id;

  pageState.track = track;

  if (commentAvatarEl) {
    const currentAvatar = window.currentProfile?.avatar || localStorage.getItem("userAvatar") || "";
    commentAvatarEl.src = currentAvatar
      ? "/" + String(currentAvatar).replace(/^\/+/, "")
      : "/images/default-avatar.jpg";
  }

  function setCommentsCount(count) {
    const safeCount = String(Number(count) || 0);
    commentsCountEl.textContent = safeCount;
    if (commentsCountMirrorEl) {
      commentsCountMirrorEl.textContent = safeCount;
    }
  }

  function applyLikeState(data) {
    const liked = !!data?.liked;
    const count = Number(data?.count) || 0;
    const icon = likeBtn.querySelector("i");

    likeBtn.classList.toggle("is-active", liked);
    likesCountEl.textContent = String(count);

    if (icon) {
      icon.className = liked ? "fa-solid fa-heart" : "fa-regular fa-heart";
    }
  }

  async function fetchTrackLikeState() {
    try {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: "Bearer " + token } : {};
      const res = await fetch(`/api/track-likes/${trackId}`, { headers });

      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.log("profile track like state error:", err);
      return null;
    }
  }

  async function refreshTrackLikeState() {
    const data = await fetchTrackLikeState();
    if (!data) return null;
    applyLikeState(data);
    return data;
  }

  window.refreshCurrentProfileTrackLike = refreshTrackLikeState;

  async function registerTrackListen() {
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
      listensCountEl.textContent = String(Number(data.listens_count) || 0);
      return true;
    } catch (err) {
      console.log("profile track listen error:", err);
      return false;
    }
  }

  window.registerCurrentProfileTrackListen = registerTrackListen;

  const artistDisplay = getProfileTrackArtistDisplay(track);

  titleEl.textContent = track.title || "Без названия";
  artistEl.innerHTML = artistDisplay.html;
  producerEl.textContent = track.producer ? `Produced by ${track.producer}` : "";
  genreEl.textContent = track.genre || "Original release";
  tagsEl.innerHTML = "";

  const tags = String(track.tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (tags.length) {
    const tagsHtml = tags.map((t) => `<span>#${escapeProfileTrackHtml(t)}</span>`).join("");
    tagsEl.innerHTML = tagsHtml;
    bodyTagsEl.innerHTML = tagsHtml;
    bodyTagsEl.style.display = "flex";
  } else {
    bodyTagsEl.innerHTML = "";
    bodyTagsEl.style.display = "none";
  }

  titleEl.textContent = track.title || "Без названия";
  artistEl.innerHTML = artistDisplay.html;
  if (artistLinkEl) {
    artistLinkEl.textContent = track.username_tag ? `@${track.username_tag}` : `@${tag}`;
  }
  producerEl.textContent = track.producer ? `Produced by ${track.producer}` : "Independent drop on Ritmoria";
  genreEl.textContent = track.genre || "Open format";
  if (releaseEl) {
    const formattedDate = formatProfileTrackDate(track.created_at);
    releaseEl.textContent = formattedDate || "Свежий релиз";
  }
  if (descriptionEl) {
    const safeDescription = String(track.description || "").trim();
    descriptionEl.textContent = "";
    descriptionEl.style.display = "none";

    bodyDescriptionEl.textContent = safeDescription;
    bodyDescriptionEl.classList.toggle("is-muted", !safeDescription);

    const hasLongDescription = safeDescription.length > 260 || safeDescription.split("\n").length > 8;
    bodyDescriptionEl.classList.toggle("is-collapsed", hasLongDescription);

    if (descriptionToggleEl) {
      descriptionToggleEl.style.display = hasLongDescription ? "inline-flex" : "none";
      descriptionToggleEl.textContent = hasLongDescription ? "Show more" : "";
      descriptionToggleEl.dataset.expanded = "false";
      descriptionToggleEl.onclick = () => {
        const isExpanded = descriptionToggleEl.dataset.expanded === "true";
        descriptionToggleEl.dataset.expanded = isExpanded ? "false" : "true";
        descriptionToggleEl.textContent = isExpanded ? "Show more" : "Show less";
        bodyDescriptionEl.classList.toggle("is-collapsed", isExpanded);
      };
    }
  }

  if (!tags.length) {
    tagsEl.innerHTML = `<span>#ritmoria</span>${track.genre ? `<span>#${escapeProfileTrackHtml(track.genre)}</span>` : `<span>#freshdrop</span>`}`;
  }

  coverEl.src = track.cover
    ? "/" + String(track.cover).replace(/^\/+/, "")
    : "/images/default-cover.jpg";
  coverEl.alt = track.title || "Track cover";

  coverEl.src = buildProfileTrackCoverSrc(track);
  listensCountEl.textContent = String(Number(track.listens_count) || 0);
  setCommentsCount(track.comments_count);
  applyLikeState({ liked: false, count: Number(track.likes_count) || 0 });

  const audioSrc = buildProfileTrackAudioSrc(track);

  let wavesurfer = null;

  if (!audioSrc || typeof WaveSurfer === "undefined") {
    waveformEl.innerHTML = `<div class="profile-track-empty">Аудио недоступно.</div>`;
    playBtn.disabled = true;
  } else {
    playBtn.disabled = false;

    wavesurfer = WaveSurfer.create({
      container: waveformEl,
      waveColor: "rgba(255,255,255,0.16)",
      progressColor: "#d99abc",
      cursorColor: "#fff",
      height: 104,
      barWidth: 3,
      barGap: 2,
      barRadius: 999,
      responsive: true,
      normalize: true
    });

    window.__profileTrackWaveSurfer = wavesurfer;
    wavesurfer.load(audioSrc);

    wavesurfer.on("ready", () => {
      pageState.waveSyncLocked = false;
      durationEl.textContent = formatProfileTrackTime(wavesurfer.getDuration());
      if (waveformStatusEl) {
        waveformStatusEl.textContent = "MP3 waveform ready";
      }
    });

    wavesurfer.on("seek", (progress) => {
  if (pageState.waveSyncLocked) return;
  const state = window.getGlobalPlayerState?.();
  const current = state?.track;
  const globalAudio = document.getElementById("global-audio");

  const thisAudioSrc = track.audio
    ? "/" + String(track.audio).replace(/^\/+/, "")
    : "";

  const isSameTrack =
    current &&
    (
      (current.audioSrc && current.audioSrc === thisAudioSrc) ||
      (current.soundcloud && current.soundcloud === (track.soundcloud || ""))
    );

  if (!isSameTrack) return;
  if (!globalAudio || !globalAudio.duration) return;

  globalAudio.currentTime = progress * globalAudio.duration;
});

    playBtn.onclick = () => {
      const state = window.getGlobalPlayerState?.();
      const current = state?.track;

      const thisAudioSrc = buildProfileTrackAudioSrc(track);

      const isSameTrack =
        current &&
        (
          (current.audioSrc && current.audioSrc === thisAudioSrc) ||
          (current.soundcloud && current.soundcloud === (track.soundcloud || ""))
        );

      const globalAudio = document.getElementById("global-audio");

      if (isSameTrack && globalAudio) {
        const atBeginning = (globalAudio.currentTime || 0) <= 1;

        if (atBeginning && pageState.counted) {
          beginProfileTrackListenSession(track, globalAudio);
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
        title: track.title || "Без названия",
        artist: artistDisplay.text,
        cover: buildProfileTrackCoverSrc(track),
        audioSrc: thisAudioSrc,
        soundcloud: track.soundcloud || "",
        slug: track.slug || "",
        username_tag: track.username_tag || tag,
        profile_source_tag: track.username_tag || tag,
        play_context: "profile"
      });

      setTimeout(() => {
        const audio = document.getElementById("global-audio");
        if (audio && thisAudioSrc) {
          beginProfileTrackListenSession(track, audio);
        }
      }, 60);
    };
  }

  function syncProfileTrackPageWithGlobalPlayer() {
    const state = window.getGlobalPlayerState?.();
    const current = state?.track;
    const isPlaying = !!state?.isPlaying;
    const currentTime = state?.currentTime || 0;
    const duration = state?.duration || 0;

    const thisAudioSrc = track.audio
      ? "/" + String(track.audio).replace(/^\/+/, "")
      : "";

    const isSameTrack =
      current &&
      (
        (current.audioSrc && current.audioSrc === thisAudioSrc) ||
        (current.soundcloud && current.soundcloud === (track.soundcloud || ""))
      );

    if (!isSameTrack) {
      playBtn.classList.remove("is-playing");
      playBtn.innerHTML = `<i class="fa-solid fa-play"></i><span>Слушать</span>`;
      currentTimeEl.textContent = "0:00";

      if (duration > 0) {
        durationEl.textContent = formatProfileTrackTime(duration);
      }

      if (wavesurfer) {
        try {
          pageState.waveSyncLocked = true;
          wavesurfer.seekTo(0);
        } catch (e) {}
        requestAnimationFrame(() => {
          pageState.waveSyncLocked = false;
        });
      }
      return;
    }

    playBtn.classList.toggle("is-playing", isPlaying);
    playBtn.innerHTML = isPlaying
      ? `<i class="fa-solid fa-pause"></i><span>Пауза</span>`
      : `<i class="fa-solid fa-play"></i><span>Слушать</span>`;

    currentTimeEl.textContent = formatProfileTrackTime(currentTime);

    if (duration > 0) {
      durationEl.textContent = formatProfileTrackTime(duration);

      if (wavesurfer) {
        try {
          const progress = currentTime / duration;
          pageState.waveSyncLocked = true;
          wavesurfer.seekTo(Math.max(0, Math.min(1, progress)));
        } catch (e) {}
        requestAnimationFrame(() => {
          pageState.waveSyncLocked = false;
        });
      }
    }
  }

  window.syncCurrentProfileTrackPage = syncProfileTrackPageWithGlobalPlayer;

  async function loadComments() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/track-comments/${trackId}`, {
        headers: token ? { Authorization: "Bearer " + token } : {}
      });

      if (!res.ok) {
        throw new Error(`Comments request failed: ${res.status}`);
      }

      const comments = await res.json();
      setCommentsCount(Array.isArray(comments) ? comments.length : 0);

      if (!Array.isArray(comments) || !comments.length) {
        commentsList.innerHTML = `<div class="profile-track-empty">Комментариев пока нет.</div>`;
        return;
      }

      commentsList.innerHTML = comments
        .map((c) => {
          const username = escapeProfileTrackHtml(c.username || "user");
          const userTag = c.username_tag ? `@${escapeProfileTrackHtml(c.username_tag)}` : "";
          const text = escapeProfileTrackHtml(c.text || "");
          const likes = Number(c.likes || 0);
          const avatar = c.avatar
            ? "/" + String(c.avatar).replace(/^\/+/, "")
            : "/images/default-avatar.jpg";
          const createdAt = formatProfileTrackDate(c.created_at);

          return `
            <div class="profile-track-comment">
              <div class="profile-track-comment-top">
                <img class="profile-track-comment-avatar" src="${avatar}" alt="${username}">
                <div class="profile-track-comment-meta">
                  <b>${username}</b>
                  <span>${userTag || "слушатель"}</span>
                </div>
                ${createdAt ? `<time class="profile-track-comment-date">${createdAt}</time>` : ""}
              </div>

              <div class="profile-track-comment-text">${text}</div>

              <div class="profile-track-comment-actions">
                <button type="button" onclick="toggleProfileTrackCommentLike(${Number(c.id)}, this)">
                  <i class="fa-regular fa-heart"></i>
                  <span>${likes}</span>
                </button>
              </div>
            </div>
          `;
        })
        .join("");
    } catch (err) {
      console.log("❌ COMMENTS LOAD FAILED:", err);
      commentsList.innerHTML = `<div class="profile-track-error">Не удалось загрузить комментарии.</div>`;
    }
  }

  window.toggleProfileTrackCommentLike = async function (commentId, btn) {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        alert("Нужно войти в аккаунт.");
        return;
      }

      const res = await fetch("/comment-like", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({ commentId })
      });

      if (!res.ok) {
        throw new Error(`Like request failed: ${res.status}`);
      }

      const data = await res.json();

      const icon = btn.querySelector("i");
      const countEl = btn.querySelector("span");

      let count = Number(countEl.textContent || 0);

      if (data.liked) {
        count++;
        icon.classList.remove("fa-regular");
        icon.classList.add("fa-solid");
      } else {
        count = Math.max(0, count - 1);
        icon.classList.remove("fa-solid");
        icon.classList.add("fa-regular");
      }

      countEl.textContent = String(count);
    } catch (err) {
      console.log("❌ COMMENT LIKE FAILED:", err);
    }
  };

  window.sendProfileTrackComment = async function () {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        alert("Нужно войти в аккаунт.");
        return;
      }

      if (!commentInput) return;

      const text = commentInput.value.trim();
      if (!text || !trackId) return;

      const res = await fetch("/add-track-comment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({ trackId, text })
      });

      if (!res.ok) {
        throw new Error(`Add comment failed: ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      if (data?.xp && typeof window.applyXPAndCheckRank === "function") {
        window.applyXPAndCheckRank(data.xp, data.newXP, data.xpState);
      } else if (data?.xp && typeof window.showXP === "function") {
        window.showXP(data.xp);
      }

      commentInput.value = "";
      await loadComments();
    } catch (err) {
      console.log("❌ ADD COMMENT FAILED:", err);
    }
  };

  likeBtn.onclick = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
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
        body: JSON.stringify({ trackId })
      });

      if (!res.ok) {
        throw new Error(`Track like failed: ${res.status}`);
      }

      const toggled = await res.json();

      if (toggled?.xp && typeof window.applyXPAndCheckRank === "function") {
        window.applyXPAndCheckRank(toggled.xp, toggled.newXP, toggled.xpState);
      } else if (toggled?.xp && typeof window.showXP === "function") {
        window.showXP(toggled.xp);
      }

      const fresh = await refreshTrackLikeState();

      window.dispatchEvent(
        new CustomEvent("ritmoria:track-like-updated", {
          detail: {
            trackId,
            liked: typeof fresh?.liked === "boolean" ? fresh.liked : !!toggled?.liked
          }
        })
      );
    } catch (err) {
      console.log("profile track like toggle error:", err);
    }
  };

  if (artistLinkEl) {
    artistLinkEl.onclick = () => {
      if (typeof navigate !== "function") return;
      navigate(`/${track.username_tag || tag}`);
    };
  }

  if (copyLinkBtn) {
    copyLinkBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(buildProfileTrackUrl(track));
      } catch (err) {
        console.log("profile track copy error:", err);
      }
    };
  }

  if (queueBtn) {
    queueBtn.onclick = () => {
      if (typeof window.addTrackToGlobalQueue !== "function") return;

      window.addTrackToGlobalQueue({
        id: track.id,
        title: track.title || "Без названия",
        artist: artistDisplay.text,
        cover: buildProfileTrackCoverSrc(track),
        audioSrc: buildProfileTrackAudioSrc(track),
        soundcloud: track.soundcloud || "",
        slug: track.slug || "",
        username_tag: track.username_tag || tag,
        profile_source_tag: track.username_tag || tag,
        play_context: "queue"
      }, { open: true, allowDuplicate: true });
    };
  }

  if (commentsJumpBtn) {
    commentsJumpBtn.onclick = () => {
      commentsBlockEl?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }

  if (commentButton) {
    commentButton.onclick = window.sendProfileTrackComment;
  }

  if (!pageState.eventsBound) {
    pageState.eventsBound = true;

    window.addEventListener("ritmoria:global-player-track-change", () => {
      const current = window.getGlobalPlayerState?.()?.track;
      const audio = document.getElementById("global-audio");

      if (audio && isSameProfileTrack(pageState.track, current) && buildProfileTrackAudioSrc(pageState.track)) {
        beginProfileTrackListenSession(pageState.track, audio);
      } else {
        resetProfileTrackListenSession();
      }

      setTimeout(() => {
        window.syncCurrentProfileTrackPage?.();
      }, 50);
    });

    window.addEventListener("ritmoria:global-player-play", () => {
      window.syncCurrentProfileTrackPage?.();
    });
    window.addEventListener("ritmoria:global-player-pause", () => {
      window.syncCurrentProfileTrackPage?.();
    });
    window.addEventListener("ritmoria:global-player-timeupdate", () => {
      window.syncCurrentProfileTrackPage?.();
    });
    window.addEventListener("ritmoria:global-player-stopped", () => {
      window.syncCurrentProfileTrackPage?.();
    });
    window.addEventListener("ritmoria:track-like-updated", async (e) => {
      if (Number(e.detail?.trackId) !== Number(pageState.track?.id)) return;
      await window.refreshCurrentProfileTrackLike?.();
    });
  }

  if (!pageState.audioBound) {
    const globalAudio = document.getElementById("global-audio");

    if (globalAudio) {
      pageState.audioBound = true;

      globalAudio.addEventListener("play", () => {
        pageState.wasPlaying = true;
        pageState.lastTime = globalAudio.currentTime || 0;
      });

      globalAudio.addEventListener("pause", () => {
        pageState.wasPlaying = false;
      });

      globalAudio.addEventListener("loadedmetadata", () => {
        if (!globalAudio.duration || !isFinite(globalAudio.duration)) return;
        pageState.threshold = Math.min(30, globalAudio.duration * 0.5);
      });

      globalAudio.addEventListener("timeupdate", async () => {
        if (!pageState.track?.id) return;
        if (!isSameProfileTrack(pageState.track, window.getGlobalPlayerState?.()?.track)) return;
        if (pageState.counted || pageState.pendingListen || !pageState.wasPlaying) return;
        if (!globalAudio.duration || !isFinite(globalAudio.duration)) return;

        if (!pageState.threshold || !isFinite(pageState.threshold)) {
          pageState.threshold = Math.min(30, globalAudio.duration * 0.5);
        }

        const currentTime = globalAudio.currentTime || 0;
        const delta = currentTime - (pageState.lastTime || 0);

        if (delta > 0 && delta <= 1.25) {
          pageState.listenedSeconds += delta;
        }

        pageState.lastTime = currentTime;

        if (pageState.listenedSeconds >= pageState.threshold) {
          const sessionAtRequest = pageState.sessionId;

          pageState.counted = true;
          pageState.pendingListen = true;

          const ok = await window.registerCurrentProfileTrackListen?.();

          if (sessionAtRequest === pageState.sessionId) {
            pageState.pendingListen = false;

            if (!ok) {
              pageState.counted = false;
            }
          }
        }
      });

      globalAudio.addEventListener("emptied", () => {
        resetProfileTrackListenSession();
      });
    }
  }

  syncProfileTrackPageWithGlobalPlayer();
  await refreshTrackLikeState();
  await loadComments();
};

window.initProfileTrackPage = function () {
  const container = document.getElementById("profileTracksPage");

  if (!container) {
    console.log("❌ profileTracksPage container not found");
    return;
  }

  const tag = window.__trackTag;
  const slug = window.__trackSlug;

  if (!tag || !slug) {
    container.innerHTML = `
      <div class="profile-track-page-wrapper">
        <div class="profile-track-page">
          <div class="profile-track-error">Неверная ссылка на трек.</div>
        </div>
      </div>
    `;
    console.log("❌ no tag/slug", tag, slug);
    return;
  }

  container.innerHTML = `
    <div class="profile-track-page-wrapper">
      <div class="profile-track-page">
        <div class="profile-track-main">
          <div class="profile-track-hero">
            <div class="profile-track-hero-top">
              <div class="profile-track-cover-column">
                <div class="profile-track-cover-card">
                  <img id="profileTrackCover" src="/images/default-cover.jpg" alt="Track cover">
                  <button id="profileTrackPlayBtn" class="profile-track-play-btn" type="button">
                    <i class="fa-solid fa-play"></i>
                  </button>
                </div>

                <div class="profile-track-cover-meta">
                  <span id="profileTrackRelease" class="profile-track-release-pill">Свежий релиз</span>
                  <span id="profileTrackGenre" class="profile-track-genre-badge"></span>
                </div>
              </div>

              <div class="profile-track-content-column">
                <div class="profile-track-content-top">
                  <div class="profile-track-info">
                    <div class="profile-track-kicker-row">
                      <span class="profile-track-kicker">Track</span>
                    </div>

                    <h1 id="profileTrackTitle"></h1>

                    <div class="profile-track-sub">
                      <span id="profileTrackArtist"></span>
                      <button id="profileTrackArtistLink" class="profile-track-author-link" type="button"></button>
                    </div>

                    <div id="profileTrackProducer" class="profile-track-producer"></div>
                    <p id="profileTrackDescription" class="profile-track-description"></p>
                  </div>

                  <div class="profile-track-side-meta"></div>
                </div>

              <div class="profile-track-wave-shell">
                <div class="profile-track-wave-head">
                  <div id="profileTrackTags" class="profile-track-tags"></div>
                  <span id="profileTrackWaveStatus">Ready for playback</span>
                </div>

                  <div id="profileTrackWaveform" class="profile-track-waveform"></div>

                  <div class="profile-track-time-row">
                    <span id="profileTrackCurrentTime">0:00</span>
                    <span id="profileTrackDuration">0:00</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div id="profileTrackCommentsBlock" class="profile-track-comments-block">
          <div class="profile-track-social-bar">
            <div class="profile-track-comment-inline">
              <div class="profile-track-comment-avatar-shell">
                <img id="profileTrackCommentAvatar" src="/images/default-avatar.jpg" alt="avatar">
              </div>

              <div class="profile-track-comment-input-wrap">
                <textarea id="profileTrackCommentInput" placeholder="Написать комментарий..."></textarea>
                <button id="profileTrackCommentButton" type="button" class="profile-track-send-btn">
                  <i class="fa-regular fa-paper-plane"></i>
                </button>
              </div>
            </div>

            <div class="profile-track-social-actions">
              <button id="profileTrackCopyLinkBtn" class="profile-track-secondary-btn" type="button" aria-label="Копировать ссылку">
                <i class="fa-solid fa-link"></i>
              </button>

              <button id="profileTrackQueueButton" class="profile-track-secondary-btn" type="button" aria-label="Добавить в очередь">
                <i class="fa-solid fa-plus"></i>
              </button>

              <button id="profileTrackLikeButton" class="profile-track-secondary-btn profile-track-like-pill" type="button" aria-label="Лайкнуть трек">
                <i class="fa-regular fa-heart"></i>
                <span id="profileTrackLikesCount">0</span>
              </button>

              <button id="profileTrackCommentsJumpBtn" class="profile-track-secondary-btn" type="button" aria-label="Перейти к комментариям">
                <i class="fa-regular fa-comment"></i>
                <span id="profileTrackCommentsCount">0</span>
              </button>

              <div class="profile-track-inline-stat">
                <i class="fa-solid fa-headphones"></i>
                <span id="profileTrackListensCount">0</span>
              </div>
            </div>
          </div>

          <div class="profile-track-description-block">
            <div class="profile-track-section-label">Описание</div>
            <div id="profileTrackBodyDescription" class="profile-track-body-description"></div>
            <div id="profileTrackBodyTags" class="profile-track-body-tags"></div>
            <button id="profileTrackDescriptionToggle" class="profile-track-description-toggle" type="button" style="display:none;"></button>
          </div>

          <div class="profile-track-comments-head">
            <div class="profile-track-comments-total">
              <i class="fa-regular fa-comment"></i>
              <span class="profile-track-comments-label">Комментарии</span>
              <span id="profileTrackCommentsCountMirror">0</span>
            </div>
          </div>

          <div id="profileTrackCommentsList"></div>
        </div>
      </div>
    </div>
  `;

  window.loadProfileTrackPage(tag, slug);
};
