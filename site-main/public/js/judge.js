function initJudgePage() {
  const rateBtn = document.getElementById("rateBtn");
  const resetBtn = document.getElementById("resetBtn");

  const sliders = ["s1", "s2", "s3", "s4"];

  const audio = document.getElementById("judgeAudio");
  const playBtn = document.getElementById("playBtn");
  const progress = document.getElementById("progress");
  const progressWrap = document.getElementById("progressWrap");
  const currentTimeEl = document.getElementById("current");
  const durationEl = document.getElementById("duration");
  const volume = document.getElementById("volume");

  const mp3Player = document.getElementById("mp3Player");
  const scWrapper = document.getElementById("scWrapper");
  const soundcloudIframe = document.getElementById("soundcloudPlayer");

  const trackName = document.getElementById("trackName");
  const trackArtist = document.getElementById("trackArtist");
  const trackCover = document.getElementById("trackCover");
  const playerCover = document.getElementById("playerCover");
  const playerTitle = document.getElementById("playerTitle");
  const playerArtist = document.getElementById("playerArtist");
  const judgePlayerRoot = document.querySelector(".judge-custom-player");

  if (!rateBtn || !audio || !playBtn || !volume) return;
  if (document.body.dataset.judgeInitialized === "true") return;
  document.body.dataset.judgeInitialized = "true";

  let isMP3 = false;
  let scWidget = null;
  let scIsPlaying = false;
  let scReady = false;
  let judgeCurrentUser = null;

  async function loadJudgeCurrentUser() {
    const token = localStorage.getItem("token");
    if (!token) {
      judgeCurrentUser = null;
      return null;
    }

    try {
      const res = await fetch("/me", {
        headers: {
          Authorization: "Bearer " + token
        }
      });

      if (!res.ok) {
        judgeCurrentUser = null;
        return null;
      }

      const user = await res.json();
      judgeCurrentUser = user;
      return user;
    } catch (err) {
      console.error("loadJudgeCurrentUser error", err);
      judgeCurrentUser = null;
      return null;
    }
  }

  function getTrackId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("track");
  }

  function setFill(el) {
    const min = Number(el.min);
    const max = Number(el.max);
    const val = Number(el.value);
    const pct = ((val - min) / (max - min)) * 100;
    el.style.setProperty("--fill", pct + "%");
  }

  function animateValue(el, start, end, duration = 400) {
    let startTime = null;

    function step(time) {
      if (!startTime) startTime = time;

      const progressValue = Math.min((time - startTime) / duration, 1);
      const value = Math.floor(start + (end - start) * progressValue);

      el.textContent = value;

      if (progressValue < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  function recalc() {
    const vals = sliders.map(id => Number(document.getElementById(id).value));
    const base = vals.reduce((a, b) => a + b, 0);

    const vibe = Number(document.getElementById("b1").value);
    const mem = Number(document.getElementById("b2").value);

    const k1 = 1 + vibe * 0.1;
    const k2 = 1 + mem * 0.1;

    const total = Math.round(base * k1 * k2 * 1.111111);

    document.getElementById("baseExpr").textContent = vals.join(" + ");
    document.getElementById("bonusExpr1").textContent = "× " + k1.toFixed(1);
    document.getElementById("bonusExpr2").textContent = "× " + k2.toFixed(1);

    const totalEl = document.getElementById("total");
    const currentValue = Number(totalEl.textContent) || 0;
    animateValue(totalEl, currentValue, total);

    sliders.forEach((id, i) => {
      const el = document.getElementById(id);
      document.getElementById("v" + (i + 1)).textContent = el.value;
      setFill(el);
    });

    const b1 = document.getElementById("b1");
    const b2 = document.getElementById("b2");

    document.getElementById("bv1").textContent = b1.value;
    document.getElementById("bv2").textContent = b2.value;

    setFill(b1);
    setFill(b2);
  }

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

    judgePlayerRoot?.classList.remove("playing");
    playerCover?.classList.remove("playing");
  }

  function showMP3Player() {
    mp3Player.style.display = "flex";
    isMP3 = true;
    scIsPlaying = false;
  }

  function showSCPlayer() {
    mp3Player.style.display = "flex";
    isMP3 = false;
    scIsPlaying = false;
    scReady = false;

    audio.pause();
    audio.src = "";
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
      `&color=%238b5cf6&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false`;

    scWidget = SC.Widget(soundcloudIframe);

    scWidget.bind(SC.Widget.Events.READY, () => {
      scReady = true;

      progress.style.width = "0%";
      currentTimeEl.textContent = "0:00";

      scWidget.setVolume(Math.round(Number(volume.value) * 100));

      scWidget.getDuration((ms) => {
        durationEl.textContent = formatTime(ms / 1000);
      });

      if (window.scInterval) clearInterval(window.scInterval);

      window.scInterval = setInterval(() => {
        if (!scWidget || !scReady) return;

        scWidget.getPosition((pos) => {
          scWidget.getDuration((dur) => {
            if (!dur) return;

            const percent = (pos / dur) * 100;
            progress.style.width = percent + "%";
            currentTimeEl.textContent = formatTime(pos / 1000);
          });
        });
      }, 300);
    });

    scWidget.bind(SC.Widget.Events.PLAY, () => {
  window.suspendGlobalPlayerForEmbedded?.("judge");
  scIsPlaying = true;
  playBtn.classList.add("playing");
  judgePlayerRoot?.classList.add("playing");
  playerCover?.classList.add("playing");
});

    scWidget.bind(SC.Widget.Events.PAUSE, () => {
      scIsPlaying = false;
      playBtn.classList.remove("playing");
      judgePlayerRoot?.classList.remove("playing");
      playerCover?.classList.remove("playing");
    });

    scWidget.bind(SC.Widget.Events.FINISH, () => {
      scIsPlaying = false;
      playBtn.classList.remove("playing");
      progress.style.width = "0%";
      currentTimeEl.textContent = "0:00";
      judgePlayerRoot?.classList.remove("playing");
      playerCover?.classList.remove("playing");
    });

    scWidget.bind(SC.Widget.Events.PLAY_PROGRESS, (e) => {
      if (!e || !e.duration) return;

      const currentSec = e.currentPosition / 1000;
      const durationSec = e.duration / 1000;

      currentTimeEl.textContent = formatTime(currentSec);

      const percent = (currentSec / durationSec) * 100;
      progress.style.width = percent + "%";
    });
  }

  async function checkIfRated() {
    const trackId = getTrackId();
    const token = localStorage.getItem("token");
    if (!token || !trackId || rateBtn.disabled) return;

    try {
      const res = await fetch(`/api/rate/check/${trackId}`, {
        headers: {
          Authorization: "Bearer " + token
        }
      });

      const data = await res.json();

      if (data.rated) {
        rateBtn.textContent = "Вы уже оценили (обновить)";
        rateBtn.style.opacity = "0.7";
      }
    } catch (err) {
      console.error("CHECK RATE ERROR:", err);
    }
  }

  async function loadMyRating() {
    const trackId = getTrackId();
    const token = localStorage.getItem("token");
    if (!token || !trackId) return;

    try {
      const res = await fetch(`/api/rate/my/${trackId}`, {
        headers: {
          Authorization: "Bearer " + token
        }
      });

      if (!res.ok) return;

      const data = await res.json();
      if (!data) return;

      document.getElementById("s1").value = data.rhymes ?? 1;
      document.getElementById("s2").value = data.structure ?? 1;
      document.getElementById("s3").value = data.style ?? 1;
      document.getElementById("s4").value = data.charisma ?? 1;

      document.getElementById("b1").value = data.vibe ?? 1;
      document.getElementById("b2").value = data.memory ?? 1;
    } catch (err) {
      console.error("loadMyRating error", err);
    }
  }

  async function loadTrackPlayer() {
    const trackId = getTrackId();
    if (!trackId) return;

    try {
      const res = await fetch(`/api/tracks/${trackId}`);
      if (!res.ok) throw new Error("Ошибка загрузки трека");

      const track = await res.json();
      const isOwnTrack =
        judgeCurrentUser &&
        String(judgeCurrentUser.role || "") === "user" &&
        Number(track.user_id || 0) === Number(judgeCurrentUser.id || 0);

      const judgeEl = document.getElementById("judgeScore");
      const userEl = document.getElementById("userScore");

      if (judgeEl) {
        judgeEl.textContent = track.judge_score ?? "—";
      }

      if (userEl) {
        userEl.textContent = track.user_score ?? "—";
      }

      trackName.textContent = track.title || "Без названия";
      trackArtist.textContent = track.artist || "Unknown artist";
      trackCover.src = track.cover || "/images/cover-placeholder.jpg";

      playerCover.src = track.cover || "/images/cover-placeholder.jpg";
      playerTitle.textContent = track.title || "Без названия";
      playerArtist.textContent = track.artist || "Unknown artist";

      if (isOwnTrack) {
        rateBtn.disabled = true;
        rateBtn.textContent = "Нельзя оценить свой трек";
        rateBtn.style.opacity = "0.6";
      } else {
        rateBtn.disabled = false;
        rateBtn.textContent = "ОЦЕНИТЬ";
        rateBtn.style.opacity = "";
      }

      resetPlayerUI();

      if (track.audio) {
        showMP3Player();
        audio.src = track.audio;
        audio.load();
        return;
      }

      if (track.soundcloud) {
        showSCPlayer();
        initSoundCloud(track.soundcloud);
        return;
      }

      mp3Player.style.display = "none";
      scWrapper.style.display = "none";
    } catch (err) {
      console.error("Ошибка загрузки трека:", err);
    }
  }

  rateBtn.addEventListener("click", async () => {
    const trackId = getTrackId();
    if (!trackId) return;

    const total = Number(document.getElementById("total").textContent);

    try {
      const token = localStorage.getItem("token");

      const meRes = await fetch("/me", {
        headers: {
          Authorization: "Bearer " + token
        }
      });

      const me = await meRes.json();

      let endpoint = "/api/rate/user";

      if (me.role === "judge" || me.role === "admin") {
        endpoint = "/api/rate/judge";
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({
          track_id: trackId,
          score: total,
          rhymes: Number(document.getElementById("s1").value),
          structure: Number(document.getElementById("s2").value),
          style: Number(document.getElementById("s3").value),
          charisma: Number(document.getElementById("s4").value),
          vibe: Number(document.getElementById("b1").value),
          memory: Number(document.getElementById("b2").value)
        })
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("RATE ERROR:", data);
        alert("Ошибка: " + (data.error || "неизвестная ошибка"));
        return;
      }

      if (data?.xp && typeof window.applyXPAndCheckRank === "function") {
        window.applyXPAndCheckRank(data.xp, data.newXP, data.xpState);
      } else if (data?.xp && typeof window.showXP === "function") {
        window.showXP(data.xp);
      }

      const updated = await fetch(`/api/tracks/${trackId}`);
      const updatedTrack = await updated.json();

      if (document.getElementById("judgeScore")) {
        document.getElementById("judgeScore").textContent = updatedTrack.judge_score ?? "—";
      }

      if (document.getElementById("userScore")) {
        document.getElementById("userScore").textContent = updatedTrack.user_score ?? "—";
      }

      const popup = document.createElement("div");
      popup.className = "rate-popup";
      popup.textContent = "Оценка сохранена";

      document.body.appendChild(popup);

      setTimeout(() => popup.classList.add("show"), 10);

      setTimeout(() => {
        popup.classList.remove("show");
        setTimeout(() => popup.remove(), 300);
      }, 2000);

      setTimeout(() => {
        navigate("/queue");
      }, 1500);
    } catch (err) {
      console.error(err);
      alert("Ошибка оценки");
    }
  });

  document.querySelectorAll('.judge-page input[type="range"]').forEach(el => {
    el.addEventListener("input", () => {
      const row = el.closest(".judge-row");
      if (row) {
        row.classList.add("judge-row-active");
        setTimeout(() => row.classList.remove("judge-row-active"), 300);
      }

      recalc();
    });

    setFill(el);
  });

  if (resetBtn) {
    resetBtn.onclick = () => {
      document.querySelectorAll('.judge-page input[type="range"]').forEach(el => {
        if (
          el.id === "s1" ||
          el.id === "s2" ||
          el.id === "s3" ||
          el.id === "s4" ||
          el.id === "b1" ||
          el.id === "b2"
        ) {
          el.value = el.min;
          setFill(el);
        }
      });

      recalc();
    };
  }

  volume.value = 0.5;
  volume.style.setProperty("--vol", "50%");
  audio.volume = 0.5;

  playBtn.addEventListener("click", () => {
    if (isMP3) {
      if (!audio.src) return;

      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }
      return;
    }

    if (!scWidget || !scReady) return;

    if (scIsPlaying) {
      scWidget.pause();
    } else {
      scWidget.play();
    }
  });

  audio.addEventListener("play", () => {
  window.suspendGlobalPlayerForEmbedded?.("judge");
  playBtn.classList.add("playing");
  judgePlayerRoot?.classList.add("playing");
  playerCover?.classList.add("playing");
});

  audio.addEventListener("pause", () => {
    playBtn.classList.remove("playing");
    judgePlayerRoot?.classList.remove("playing");
    playerCover?.classList.remove("playing");
  });

  audio.addEventListener("ended", () => {
    playBtn.classList.remove("playing");
    progress.style.width = "0%";
    currentTimeEl.textContent = "0:00";
    judgePlayerRoot?.classList.remove("playing");
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

  progressWrap.addEventListener("click", e => {
    const rect = progressWrap.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = clickX / rect.width;

    if (isMP3) {
      if (!audio.duration) return;
      audio.currentTime = percent * audio.duration;
      return;
    }

    if (scWidget) {
      scWidget.getDuration(durationMs => {
        if (!durationMs) return;
        scWidget.seekTo(percent * durationMs);
      });
    }
  });

  volume.addEventListener("input", () => {
    const value = Number(volume.value);

    audio.volume = value;
    if (scWidget) scWidget.setVolume(value * 100);

    const percent = value * 100;
    volume.style.setProperty("--vol", percent + "%");

    if (value === 0) {
      volume.classList.add("muted");
    } else {
      volume.classList.remove("muted");
    }
  });

  (async () => {
    await loadJudgeCurrentUser();
    await loadMyRating();

    document.querySelectorAll('.judge-page input[type="range"]').forEach(el => {
      setFill(el);
    });

    recalc();
    await loadTrackPlayer();
    await checkIfRated();
  })();
}

window.initJudgePage = initJudgePage;
