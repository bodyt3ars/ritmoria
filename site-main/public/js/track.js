function initTrackPage() {
  const params = new URLSearchParams(window.location.search);
  const pathParts = window.location.pathname.split("/").filter(Boolean);

  const trackId =
    window.__trackId ||
    pathParts[1] ||
    params.get("id") ||
    params.get("track");

  const audio = document.getElementById("trackAudio");
  const playBtn = document.getElementById("playBtn");
  const progress = document.getElementById("progress");
  const progressWrap = document.getElementById("progressWrap");
  const currentTimeEl = document.getElementById("current");
  const durationEl = document.getElementById("duration");
  const volume = document.getElementById("volume");
  const commentsList = document.getElementById("comments");
  const commentInput = document.getElementById("commentInput");
  const sendCommentBtn = document.getElementById("sendComment");
  const commentsCountEl = document.getElementById("trackCommentsCount");
  const replyBadgeEl = document.getElementById("trackCommentReplyBadge");
  const replyLabelEl = document.getElementById("trackCommentReplyLabel");
  const replyCancelEl = document.getElementById("trackCommentReplyCancel");

  const mp3Player = document.getElementById("mp3Player");
  const scWrapper = document.getElementById("scWrapper");
  const soundcloudIframe = document.getElementById("soundcloudPlayer");

  const likeBtn = document.getElementById("likeBtn");
  const dislikeBtn = document.getElementById("dislikeBtn");
  const playerCover = document.getElementById("playerCover");
  const playerTitle = document.getElementById("playerTitle");
  const playerArtist = document.getElementById("playerArtist");
  const customPlayer = document.querySelector(".custom-player");

  if (!trackId || !audio || !playBtn || !progressWrap || !volume) return;

  const pageRoot = document.querySelector(".track-page");
  if (pageRoot?.dataset.trackInitialized === "true") return;
  if (pageRoot) pageRoot.dataset.trackInitialized = "true";

  let isMP3 = false;
  let trackScWidget = null;
  let scIsPlaying = false;
  let scReady = false;
  let commentsController = null;
  let currentReaction = null;

  const criteria = [
    { key: "rhymes_avg", label: "Рифмы и образы" },
    { key: "structure_avg", label: "Структура и ритмика" },
    { key: "style_avg", label: "Реализация стиля" },
    { key: "charisma_avg", label: "Индивидуальность и харизма" },
    { key: "vibe_avg", label: "Атмосфера и вайб" },
    { key: "memory_avg", label: "Запоминаемость" }
  ];

  function formatTime(sec) {
    if (!sec || Number.isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" + s : s}`;
  }

  function resetPlayerUI() {
    playBtn.classList.remove("playing");
    progress.style.width = "0%";
    currentTimeEl.textContent = "0:00";
    durationEl.textContent = "0:00";
    customPlayer?.classList.remove("playing");
    playerCover?.classList.remove("playing");
  }

  function applyTrackReactionUi(action, likes, dislikes) {
    currentReaction = action || null;

    likeBtn?.classList.toggle("active", currentReaction === "like");
    dislikeBtn?.classList.toggle("active", currentReaction === "dislike");

    const likesEl = document.getElementById("likes");
    const dislikesEl = document.getElementById("dislikes");

    if (likesEl && Number.isFinite(Number(likes))) {
      likesEl.textContent = String(Number(likes) || 0);
    }

    if (dislikesEl && Number.isFinite(Number(dislikes))) {
      dislikesEl.textContent = String(Number(dislikes) || 0);
    }
  }

  function bindTrackArtistLink(track) {
    const tag = String(track?.username_tag || "").trim();
    const displayName = track?.artist || "Неизвестный артист";
    const targetPath = tag ? `/${tag}` : "";

    const applyTarget = (el) => {
      if (!el) return;

      el.textContent = displayName;
      el.classList.toggle("track-page-artist-linkable", !!targetPath);

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
    };

    applyTarget(document.getElementById("trackArtist"));
    applyTarget(playerArtist);
  }

  function applyCommentXp(data) {
    if (!data?.xp) return;
    if (typeof window.applyXPAndCheckRank === "function") {
      window.applyXPAndCheckRank(data.xp, data.newXP, data.xpState);
    } else if (typeof window.showXP === "function") {
      window.showXP(data.xp);
    }
  }

  function showMP3Player() {
    mp3Player.style.display = "flex";
    scWrapper.style.display = "none";
    isMP3 = true;
    scIsPlaying = false;
  }

  function showSCPlayer() {
    mp3Player.style.display = "flex";
    scWrapper.style.display = "block";
    isMP3 = false;
    scIsPlaying = false;
    scReady = false;

    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    resetPlayerUI();
  }

  function initSoundCloud(url) {
    if (typeof SC === "undefined" || !SC.Widget) {
      console.error("SoundCloud Widget API не загружен");
      return;
    }

    scReady = false;
    scIsPlaying = false;

    soundcloudIframe.src =
      `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}` +
      `&color=%23b07497&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false`;

    trackScWidget = SC.Widget(soundcloudIframe);

    trackScWidget.bind(SC.Widget.Events.READY, () => {
      scReady = true;

      progress.style.width = "0%";
      currentTimeEl.textContent = "0:00";

      trackScWidget.setVolume(Math.round(Number(volume.value) * 100));

      trackScWidget.getDuration((ms) => {
        durationEl.textContent = formatTime(ms / 1000);
      });

      if (window.__trackScInterval) {
        clearInterval(window.__trackScInterval);
      }

      window.__trackScInterval = setInterval(() => {
        if (!trackScWidget || !scReady) return;

        trackScWidget.getPosition((pos) => {
          trackScWidget.getDuration((dur) => {
            if (!dur) return;

            const percent = (pos / dur) * 100;
            progress.style.width = percent + "%";
            currentTimeEl.textContent = formatTime(pos / 1000);
          });
        });
      }, 300);
    });

    trackScWidget.bind(SC.Widget.Events.PLAY, () => {
  window.suspendGlobalPlayerForEmbedded?.("track");
  scIsPlaying = true;
  playBtn.classList.add("playing");
  customPlayer?.classList.add("playing");
  playerCover?.classList.add("playing");
});

    trackScWidget.bind(SC.Widget.Events.PAUSE, () => {
      scIsPlaying = false;
      playBtn.classList.remove("playing");
      customPlayer?.classList.remove("playing");
      playerCover?.classList.remove("playing");
    });

    trackScWidget.bind(SC.Widget.Events.FINISH, () => {
      scIsPlaying = false;
      playBtn.classList.remove("playing");
      progress.style.width = "0%";
      currentTimeEl.textContent = "0:00";
      customPlayer?.classList.remove("playing");
      playerCover?.classList.remove("playing");
    });
  }

  function renderCriteria(track) {
    const container = document.getElementById("criteriaList");
    if (!container) return;

    container.innerHTML = "";

    criteria.forEach((c) => {
      const value = Number(track[c.key] || 0);

      let percent;
      if (c.key === "vibe_avg" || c.key === "memory_avg") {
        percent = (value / 5) * 100;
      } else {
        percent = (value / 10) * 100;
      }

      percent = Math.max(0, Math.min(100, percent));

      const row = document.createElement("div");
      row.className = "track-page-criterion-row";

      row.innerHTML = `
        <div class="track-page-criterion-title">${c.label}</div>
        <div class="track-page-criterion-bar">
          <div class="track-page-criterion-fill" style="width:${percent}%"></div>
        </div>
        <div class="track-page-criterion-value">
          ${value ? (Math.round(value * 10) / 10).toFixed(1) : "—"}
        </div>
      `;

      container.appendChild(row);
    });
  }

  async function loadTrack() {
    try {
      const res = await fetch(`/api/tracks/${trackId}`, {
        headers: localStorage.getItem("token")
          ? { Authorization: "Bearer " + localStorage.getItem("token") }
          : {}
      });
      if (!res.ok) throw new Error("track load failed");

      const track = await res.json();

      document.getElementById("trackName").textContent =
        track.title || "Без названия";
      document.getElementById("trackCover").src =
        track.cover || "/images/cover-placeholder.jpg";
      bindTrackArtistLink(track);

      const judgeScore = track.judge_score;
      document.getElementById("judgeScore").textContent =
        judgeScore ? Number(judgeScore).toFixed(1) : "—";

      const userScore = track.user_score;
      document.getElementById("userScore").textContent =
        userScore ? Number(userScore).toFixed(1) : "—";

      applyTrackReactionUi(track.my_action || null, track.likes || 0, track.dislikes || 0);

      playerCover.src = track.cover || "/images/cover-placeholder.jpg";
      playerTitle.textContent = track.title || "Без названия";
      playerArtist.textContent = track.artist || "Неизвестный артист";

      renderCriteria(track);
      resetPlayerUI();

      if (!commentsController && typeof window.createTrackCommentsController === "function") {
        const commentTrackId = Number(track.comment_track_id || track.id || 0);
        commentsController = window.createTrackCommentsController({
          trackId: commentTrackId,
          listEl: commentsList,
          inputEl: commentInput,
          submitEl: sendCommentBtn,
          replyBadgeEl,
          replyLabelEl,
          replyCancelEl,
          countEls: [commentsCountEl],
          emptyText: "Комментариев пока нет.",
          errorText: "Не удалось загрузить комментарии.",
          onXp: applyCommentXp
        });
      }

      if (commentsList && !Number(track.comment_track_id || track.id || 0)) {
        commentsList.innerHTML = `<div class="track-thread-empty">Комментарии для этого трека пока недоступны.</div>`;
      }

      await commentsController?.loadComments?.();

      if (track.audio) {
        showMP3Player();
        audio.src = track.audio;
        audio.load();
      } else if (track.soundcloud) {
        showSCPlayer();
        initSoundCloud(track.soundcloud);
      } else {
        mp3Player.style.display = "none";
        scWrapper.style.display = "none";
      }
    } catch (err) {
      console.error("Ошибка загрузки трека:", err);
    }
  }

  async function initJudgeHover() {
    const container = document.getElementById("judgeHover");
    const rows = document.getElementById("judgeRows");

    if (!container || !rows) return;

    let loaded = false;

    container.addEventListener("mouseenter", async () => {
      if (loaded) return;

      try {
        const res = await fetch(`/api/tracks/${trackId}/judges`);
        const judges = await res.json();

        rows.innerHTML = "";

        if (!judges || !judges.length) {
          rows.innerHTML = "<div style='padding:10px'>Нет оценок</div>";
          loaded = true;
          return;
        }

        function safe(v) {
          const num = Number(v);
          return isNaN(num) ? 0 : num;
        }

        function getClass(v) {
          if (v >= 8.5) return "track-page-judge-cell track-page-judge-high";
          if (v >= 7) return "track-page-judge-cell track-page-judge-mid";
          return "track-page-judge-cell track-page-judge-low";
        }

        const prepared = judges.map(j => {
          const rhymes = safe(j.rhymes);
          const structure = safe(j.structure);
          const style = safe(j.style);
          const charisma = safe(j.charisma);
          const vibe = safe(j.vibe);
          const memory = safe(j.memory);

          const base = rhymes + structure + style + charisma;
          const k1 = 1 + vibe * 0.1;
          const k2 = 1 + memory * 0.1;
          const total = Math.round(base * k1 * k2 * 1.111111);

          return {
            username: j.username,
            rhymes,
            structure,
            style,
            charisma,
            vibe,
            memory,
            total
          };
        });

        const sorted = prepared.sort((a, b) => b.total - a.total);

        sorted.forEach(j => {
          const row = document.createElement("div");
          row.className = "track-page-judge-row";

          row.innerHTML = `
            <div class="track-page-judge-name">${j.username}</div>
            <div class="${getClass(j.rhymes)}">${j.rhymes.toFixed(1)}</div>
            <div class="${getClass(j.structure)}">${j.structure.toFixed(1)}</div>
            <div class="${getClass(j.style)}">${j.style.toFixed(1)}</div>
            <div class="${getClass(j.charisma)}">${j.charisma.toFixed(1)}</div>
            <div class="${getClass(j.vibe)}">${j.vibe.toFixed(1)}</div>
            <div class="${getClass(j.memory)}">${j.memory.toFixed(1)}</div>
            <div class="track-page-judge-avg">${j.total}</div>
          `;

          rows.appendChild(row);
        });

        loaded = true;
      } catch (err) {
        console.error("hover error", err);
      }
    });
  }

  playBtn.addEventListener("click", () => {
    if (isMP3) {
      if (!audio.src) return;
      if (audio.paused) audio.play();
      else audio.pause();
      return;
    }

    if (!trackScWidget || !scReady) return;

    if (scIsPlaying) trackScWidget.pause();
    else trackScWidget.play();
  });

  audio.addEventListener("play", () => {
  window.suspendGlobalPlayerForEmbedded?.("track");
  playBtn.classList.add("playing");
  customPlayer?.classList.add("playing");
  playerCover?.classList.add("playing");
});

  audio.addEventListener("pause", () => {
    playBtn.classList.remove("playing");
    customPlayer?.classList.remove("playing");
    playerCover?.classList.remove("playing");
  });

  audio.addEventListener("ended", () => {
    playBtn.classList.remove("playing");
    progress.style.width = "0%";
    currentTimeEl.textContent = "0:00";
    customPlayer?.classList.remove("playing");
    playerCover?.classList.remove("playing");
  });

  audio.addEventListener("loadedmetadata", () => {
    durationEl.textContent = formatTime(audio.duration);
  });

  audio.addEventListener("timeupdate", () => {
    if (!audio.duration) return;
    const percent = (audio.currentTime / audio.duration) * 100;
    progress.style.width = percent + "%";
    currentTimeEl.textContent = formatTime(audio.currentTime);
  });

  progressWrap.addEventListener("click", (e) => {
    const rect = progressWrap.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = clickX / rect.width;

    if (isMP3) {
      if (!audio.duration) return;
      audio.currentTime = percent * audio.duration;
      return;
    }

    if (trackScWidget) {
      trackScWidget.getDuration((durationMs) => {
        if (!durationMs) return;
        trackScWidget.seekTo(percent * durationMs);
      });
    }
  });

  volume.value = 0.5;
  audio.volume = 0.5;
  volume.style.setProperty("--vol", "50%");

  volume.addEventListener("input", () => {
    const value = Number(volume.value);

    audio.volume = value;
    if (trackScWidget) trackScWidget.setVolume(value * 100);

    const percent = value * 100;
    volume.style.setProperty("--vol", percent + "%");

    if (value === 0) volume.classList.add("muted");
    else volume.classList.remove("muted");
  });

  if (likeBtn && dislikeBtn) {
    const sendTrackReaction = async (action) => {
      const token = localStorage.getItem("token");
      if (!token) {
        alert("Нужно войти в аккаунт.");
        return;
      }

      try {
        const res = await fetch("/track-action", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token
          },
          body: JSON.stringify({ trackId, action })
        });

        if (!res.ok) {
          throw new Error(`track action failed: ${res.status}`);
        }

        const data = await res.json();
        applyTrackReactionUi(data.action || null, data.likes, data.dislikes);
      } catch (err) {
        console.error("track reaction error", err);
      }
    };

    likeBtn.onclick = () => {
      sendTrackReaction("like");
    };

    dislikeBtn.onclick = () => {
      sendTrackReaction("dislike");
    };
  }

  loadTrack();
  initJudgeHover();
}

window.initTrackPage = initTrackPage;
