(() => {
  if (window.__beatRushLoaded) return;
  window.__beatRushLoaded = true;

  const DIFFICULTIES = {
    easy: {
      label: "Легкая",
      stars: "⭐",
      speed: 0.86,
      travelMs: 1900
    },
    medium: {
      label: "Средняя",
      stars: "⭐⭐",
      speed: 1,
      travelMs: 1550
    },
    hard: {
      label: "Тяжелая",
      stars: "⭐⭐⭐",
      speed: 1.18,
      travelMs: 1180
    }
  };
  const RUN_DURATION_MS = 40000;

  const LANES = [
    { key: "w", code: "KeyW", label: "W" },
    { key: "a", code: "KeyA", label: "A" },
    { key: "s", code: "KeyS", label: "S" },
    { key: "d", code: "KeyD", label: "D" }
  ];

  let game = null;

  function getState() {
    return window.getGlobalPlayerState?.() || null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getAuthHeaders() {
    const headers = {
      "Content-Type": "application/json"
    };
    const token = localStorage.getItem("token");
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  function formatScore(value) {
    return new Intl.NumberFormat("ru-RU").format(Math.max(0, Math.round(Number(value || 0))));
  }

  function createShell() {
    closeBeatRush();

    const overlay = document.createElement("div");
    overlay.className = "beat-rush-overlay";
    overlay.innerHTML = `
      <div class="beat-rush-backdrop"></div>
      <section class="beat-rush-modal" role="dialog" aria-modal="true" aria-label="Beat Rush">
        <button class="beat-rush-close" type="button" aria-label="Закрыть Beat Rush">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="beat-rush-content"></div>
      </section>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add("beat-rush-open");
    overlay.tabIndex = -1;
    overlay.focus({ preventScroll: true });

    overlay.querySelector(".beat-rush-close")?.addEventListener("click", closeBeatRush);
    overlay.querySelector(".beat-rush-backdrop")?.addEventListener("click", closeBeatRush);

    return {
      overlay,
      content: overlay.querySelector(".beat-rush-content")
    };
  }

  function renderMessage(content, title, text) {
    content.innerHTML = `
      <div class="beat-rush-empty">
        <div class="beat-rush-empty-icon"><i class="fa-solid fa-gamepad"></i></div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(text)}</p>
        <button class="beat-rush-primary" type="button" data-close-beat-rush>Понятно</button>
      </div>
    `;
    content.querySelector("[data-close-beat-rush]")?.addEventListener("click", closeBeatRush);
  }

  function hasPlayableAudio(state) {
    return Boolean(
      state?.track?.id &&
      state?.track?.audioSrc &&
      state?.mode === "audio" &&
      state?.isPlaying
    );
  }

  function renderDifficulty(content, state) {
    const track = state.track || {};
    content.innerHTML = `
      <div class="beat-rush-start">
        <div class="beat-rush-hero">
          <div class="beat-rush-kicker">Ritmoria Arcade</div>
          <h2>Beat Rush</h2>
          <p>Попадай по ритму текущего трека. Ноты летят к нижним кнопкам, клавиши W A S D.</p>
        </div>
        <div class="beat-rush-track-card">
          <img src="${escapeHtml(track.cover || "/images/default-cover.jpg")}" alt="">
          <div>
            <span>Сейчас играет</span>
            <strong>${escapeHtml(track.title || "Без названия")}</strong>
            <small>${escapeHtml(track.artist || "Артист")}</small>
          </div>
        </div>
        <div class="beat-rush-difficulty-grid">
          ${Object.entries(DIFFICULTIES).map(([id, item]) => `
            <button class="beat-rush-difficulty" type="button" data-difficulty="${id}">
              <span>${item.stars}</span>
              <strong>${item.label}</strong>
              <small>${id === "easy" ? "Меньше нот, мягкий темп" : id === "medium" ? "Баланс скорости и ритма" : "Быстро, плотно, дерзко"}</small>
            </button>
          `).join("")}
        </div>
      </div>
    `;

    content.querySelectorAll("[data-difficulty]").forEach((button) => {
      button.addEventListener("click", () => startGame(content, button.dataset.difficulty));
    });
  }

  async function fetchBeatmap(difficulty) {
    const state = getState();
    const sourceDuration = Math.max(0, Number(state?.duration || state?.track?.duration || 0));
    const runDuration = sourceDuration ? Math.min(60, sourceDuration) : 60;
    const params = new URLSearchParams({
      difficulty,
      duration: String(runDuration)
    });
    const res = await fetch(`/api/beat-rush/beatmap/${encodeURIComponent(state.track.id)}?${params.toString()}`, {
      cache: "no-store",
      credentials: "same-origin"
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "beatmap_failed");
    }

    return res.json();
  }

  function renderGame(content, payload) {
    const difficulty = DIFFICULTIES[payload.difficulty] || DIFFICULTIES.medium;
    const state = getState();
    const track = state?.track || payload.track || {};

    content.innerHTML = `
      <div class="beat-rush-game">
        <header class="beat-rush-game-head">
          <div class="beat-rush-game-track">
            <img src="${escapeHtml(track.cover || payload.track?.cover || "/images/default-cover.jpg")}" alt="">
            <div>
              <span>Beat Rush</span>
              <strong>${escapeHtml(track.title || payload.track?.title || "Без названия")}</strong>
              <small>${escapeHtml(difficulty.label)} · ${Number(payload.beatmap?.bpm || 120)} BPM</small>
            </div>
          </div>
          <div class="beat-rush-stats">
            <div><span>Score</span><strong data-br-score>0</strong></div>
            <div><span>Combo</span><strong data-br-combo>0</strong></div>
            <div><span>Accuracy</span><strong data-br-accuracy>100%</strong></div>
            <div><span>XP preview</span><strong data-br-xp>+0</strong></div>
          </div>
        </header>

        <div class="beat-rush-progress"><span data-br-progress></span></div>

        <div class="beat-rush-stage">
          <div class="beat-rush-lanes">
            ${LANES.map((lane, index) => `
              <div class="beat-rush-lane" data-lane="${index}">
                <div class="beat-rush-lane-line"></div>
                <div class="beat-rush-key">${lane.label}</div>
              </div>
            `).join("")}
          </div>
          <div class="beat-rush-hitline"></div>
          <div class="beat-rush-feedback" data-br-feedback></div>
        </div>
      </div>
    `;
  }

  function getLaneIndexFromKeyboardEvent(event) {
    const code = String(event.code || "");
    const key = String(event.key || "").toLowerCase();
    const cyrillicKeyMap = {
      "ц": "w",
      "ф": "a",
      "ы": "s",
      "в": "d"
    };

    return LANES.findIndex((lane) =>
      lane.code === code ||
      lane.key === key ||
      lane.key === cyrillicKeyMap[key]
    );
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function setGlobalPlayback(shouldPlay) {
    const state = getState();
    if (!state?.track?.id || state.isPlaying === shouldPlay) return;
    window.toggleGlobalPlayerPlayback?.();
  }

  async function runCountdown(content, payload) {
    const difficulty = DIFFICULTIES[payload.difficulty] || DIFFICULTIES.medium;
    const track = getState()?.track || payload.track || {};

    content.innerHTML = `
      <div class="beat-rush-countdown">
        <div class="beat-rush-track-card">
          <img src="${escapeHtml(track.cover || payload.track?.cover || "/images/default-cover.jpg")}" alt="">
          <div>
            <span>Beat Rush</span>
            <strong>${escapeHtml(track.title || payload.track?.title || "Без названия")}</strong>
            <small>${escapeHtml(difficulty.label)} · старт с начала трека</small>
          </div>
        </div>
        <div class="beat-rush-count-number" data-countdown-number>3</div>
        <p>Приготовь пальцы: W A S D</p>
      </div>
    `;

    setGlobalPlayback(false);
    const numberEl = content.querySelector("[data-countdown-number]");
    const values = ["3", "2", "1", "GO"];

    for (const value of values) {
      if (!document.body.classList.contains("beat-rush-open")) return false;
      if (numberEl) {
        numberEl.textContent = value;
        numberEl.classList.remove("pop");
        void numberEl.offsetWidth;
        numberEl.classList.add("pop");
      }
      await sleep(value === "GO" ? 420 : 760);
    }

    window.seekGlobalPlayer?.(0, "beat-rush-start");
    await sleep(80);
    setGlobalPlayback(true);
    await sleep(120);
    return true;
  }

  function calculateXpPreview(difficulty, score, accuracy) {
    const maxXp = difficulty === "easy" ? 20 : difficulty === "hard" ? 70 : 40;
    const scoreFactor = Math.min(1, Math.max(0, score) / RUN_DURATION_MS);
    const accuracyFactor = Math.max(0, Math.min(100, accuracy)) / 100;
    return Math.max(0, Math.min(maxXp, Math.round(maxXp * (0.35 * scoreFactor + 0.65 * accuracyFactor))));
  }

  function startLoop(content, payload) {
    const difficulty = payload.difficulty;
    const difficultyConfig = DIFFICULTIES[difficulty] || DIFFICULTIES.medium;
    const notes = (payload.beatmap?.notes || []).map((note) => ({
      ...note,
      hit: false,
      missed: false,
      el: null
    }));
    const startState = getState();
    const startMs = Math.max(0, Number(startState?.currentTime || 0) * 1000);
    const playableNotes = notes.filter((note) => {
      const noteTime = Number(note.time || 0);
      return noteTime >= startMs - 180 && noteTime <= RUN_DURATION_MS + 300;
    });
    const lanes = Array.from(content.querySelectorAll(".beat-rush-lane"));
    const stage = content.querySelector(".beat-rush-stage");
    const feedback = content.querySelector("[data-br-feedback]");
    const scoreEl = content.querySelector("[data-br-score]");
    const comboEl = content.querySelector("[data-br-combo]");
    const accuracyEl = content.querySelector("[data-br-accuracy]");
    const xpEl = content.querySelector("[data-br-xp]");
    const progressEl = content.querySelector("[data-br-progress]");

    game = {
      payload,
      notes: playableNotes,
      playableTotal: Math.max(1, playableNotes.length),
      score: 0,
      combo: 0,
      maxCombo: 0,
      perfect: 0,
      good: 0,
      miss: 0,
      running: true,
      raf: 0,
      keyHandler: null,
      keyListenerTarget: document
    };

    const showFeedback = (text, type) => {
      if (!feedback) return;
      feedback.textContent = text;
      feedback.className = `beat-rush-feedback show ${type}`;
      window.setTimeout(() => {
        feedback?.classList.remove("show");
      }, 180);
    };

    const updateHud = () => {
      const judged = game.perfect + game.good + game.miss;
      const weightedHits = game.perfect + game.good * 0.62;
      const accuracy = judged ? (weightedHits / judged) * 100 : 100;
      scoreEl.textContent = formatScore(game.score);
      comboEl.textContent = String(game.combo);
      accuracyEl.textContent = `${Math.max(0, Math.min(100, accuracy)).toFixed(1)}%`;
      xpEl.textContent = `+${calculateXpPreview(difficulty, game.score, accuracy)}`;
    };

    const createNoteEl = (note) => {
      if (note.el || !lanes[note.lane]) return;
      const el = document.createElement("div");
      el.className = "beat-rush-note";
      el.dataset.noteId = String(note.id);
      lanes[note.lane].appendChild(el);
      note.el = el;
    };

    const getLaneTargetTop = (laneIndex, noteEl) => {
      const lane = lanes[laneIndex];
      const key = lane?.querySelector(".beat-rush-key");
      const stageRect = stage?.getBoundingClientRect();
      const keyRect = key?.getBoundingClientRect();

      if (!stageRect?.height || !keyRect?.height) {
        return 0;
      }

      const noteHeight = Number(noteEl?.offsetHeight || 42);
      const keyCenterY = keyRect.top - stageRect.top + keyRect.height / 2;
      return keyCenterY - noteHeight / 2;
    };

    const judgeNote = (laneIndex) => {
      if (!game?.running) return;
      const nowMs = Number(getState()?.currentTime || 0) * 1000;
      const candidates = game.notes
        .filter((note) => !note.hit && !note.missed && Number(note.lane) === laneIndex)
        .map((note) => ({ note, delta: Math.abs(Number(note.time || 0) - nowMs) }))
        .filter((item) => item.delta <= 170)
        .sort((a, b) => a.delta - b.delta);

      const best = candidates[0];
      const lane = lanes[laneIndex];
      const keyEl = lane?.querySelector(".beat-rush-key");
      const flashKey = (state) => {
        if (!keyEl) return;
        keyEl.classList.remove("pressed", "hit", "miss");
        void keyEl.offsetWidth;
        keyEl.classList.add("pressed", state);
        window.setTimeout(() => {
          keyEl.classList.remove("pressed", state);
        }, 220);
      };

      lane?.classList.add("pressed");
      window.setTimeout(() => {
        lane?.classList.remove("pressed");
      }, 170);

      if (!best) {
        flashKey("miss");
        game.combo = 0;
        game.miss += 1;
        showFeedback("MISS", "miss");
        updateHud();
        return;
      }

      flashKey("hit");

      best.note.hit = true;
      best.note.el?.classList.add("hit");
      window.setTimeout(() => best.note.el?.remove(), 160);

      if (best.delta <= 80) {
        game.score += Math.round(1000 * difficultyConfig.speed * (1 + Math.min(50, game.combo) / 100));
        game.combo += 1;
        game.perfect += 1;
        showFeedback("PERFECT", "perfect");
      } else {
        game.score += Math.round(520 * difficultyConfig.speed);
        game.combo += 1;
        game.good += 1;
        showFeedback("GOOD", "good");
      }

      game.maxCombo = Math.max(game.maxCombo, game.combo);
      updateHud();
    };

    game.keyHandler = (event) => {
      const target = event.target;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      const laneIndex = getLaneIndexFromKeyboardEvent(event);
      if (laneIndex < 0) return;
      event.preventDefault();
      event.stopPropagation();
      judgeNote(laneIndex);
    };
    document.addEventListener("keydown", game.keyHandler, true);

    const finish = () => finishGame(content);

    const tick = () => {
      if (!game?.running) return;

      const state = getState();
      if (!state?.track?.id || (!state.audioSrc && !state.track?.audioSrc)) {
        finish();
        return;
      }

      const nowMs = Number(state.currentTime || 0) * 1000;
      const trackDurationMs = Math.max(0, Number(state.duration || state.track?.duration || 0) * 1000);
      const runDurationMs = trackDurationMs > 0 ? Math.min(RUN_DURATION_MS, trackDurationMs) : RUN_DURATION_MS;
      const travelMs = difficultyConfig.travelMs;

      progressEl.style.width = `${Math.max(0, Math.min(100, (nowMs / runDurationMs) * 100))}%`;

      game.notes.forEach((note) => {
        if (note.hit || note.missed) return;
        const delta = Number(note.time || 0) - nowMs;

        if (delta <= travelMs && delta >= -220) {
          createNoteEl(note);
          if (note.el) {
            const progress = Math.max(0, Math.min(1.12, 1 - (delta / travelMs)));
            const targetTop = getLaneTargetTop(note.lane, note.el);
            const startTop = -Number(note.el.offsetHeight || 42) - 12;
            const y = startTop + (targetTop - startTop) * progress;
            note.el.style.transform = `translate(-50%, ${y}px) scale(${Math.abs(delta) < 120 ? 1.08 : 1})`;
            note.el.style.opacity = delta < -120 ? "0.25" : "1";
          }
        }

        if (delta < -180) {
          note.missed = true;
          note.el?.classList.add("missed");
          window.setTimeout(() => note.el?.remove(), 160);
          game.combo = 0;
          game.miss += 1;
          showFeedback("MISS", "miss");
          updateHud();
        }
      });

      const lastNoteTime = Math.max(0, ...game.notes.map((note) => Number(note.time || 0)));
      const finishMs = Math.max(1000, runDurationMs - 120);

      if (nowMs >= finishMs || (!state.isPlaying && nowMs > startMs + 1200)) {
        finish();
        return;
      }

      game.raf = requestAnimationFrame(tick);
    };

    updateHud();
    game.raf = requestAnimationFrame(tick);
  }

  async function startGame(content, difficulty) {
    try {
      content.innerHTML = `
        <div class="beat-rush-empty">
          <div class="beat-rush-empty-icon pulse"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
          <h2>Собираем ритм</h2>
          <p>Генерируем карту под текущий трек и выбранную сложность.</p>
        </div>
      `;

      const payload = await fetchBeatmap(difficulty);
      const countdownDone = await runCountdown(content, payload);
      if (!countdownDone) return;
      renderGame(content, payload);
      startLoop(content, payload);
    } catch (err) {
      const message = err.message === "audio_track_required"
        ? "Beat Rush пока работает только с mp3-треками из глобального плеера."
        : "Не удалось подготовить Beat Rush для этого трека.";
      renderMessage(content, "Не вышло запустить игру", message);
    }
  }

  async function finishGame(content) {
    if (!game) return;

    const finishedGame = game;
    cleanupGameOnly();
    setGlobalPlayback(false);

    const judged = finishedGame.perfect + finishedGame.good + finishedGame.miss;
    const weightedHits = finishedGame.perfect + finishedGame.good * 0.62;
    const accuracy = judged ? Math.max(0, Math.min(100, (weightedHits / judged) * 100)) : 0;
    let result = {
      xp_earned: 0,
      xp_already_claimed_today: false
    };
    let boards = null;

    try {
      const res = await fetch("/api/beat-rush/score", {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({
          trackId: finishedGame.payload.track?.id || getState()?.track?.id,
          difficulty: finishedGame.payload.difficulty,
          score: finishedGame.score,
          accuracy,
          combo: finishedGame.maxCombo
        })
      });

      if (res.ok) {
        result = await res.json();
        if (result.xp && typeof window.applyXPAndCheckRank === "function") {
          window.applyXPAndCheckRank(result.xp, result.newXP, result.xpState);
        } else if (result.xp && typeof window.showXP === "function") {
          window.showXP(result.xp);
        }
      }
    } catch (err) {
      console.error("Beat Rush score save error", err);
    }

    try {
      const resultTrackId = result.track_id || finishedGame.payload.track?.id || getState()?.track?.id;
      const params = new URLSearchParams({ difficulty: finishedGame.payload.difficulty });
      const boardsRes = await fetch(`/api/beat-rush/results/${encodeURIComponent(resultTrackId)}?${params.toString()}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: getAuthHeaders()
      });
      if (boardsRes.ok) {
        boards = await boardsRes.json();
      }
    } catch (err) {
      console.error("Beat Rush results load error", err);
    }

    renderResult(content, finishedGame, accuracy, result, boards);
  }

  function formatResultDate(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  }

  function renderScoreRows(rows = [], { showUser = false } = {}) {
    if (!rows.length) {
      return `<div class="beat-rush-board-empty">Пока нет результатов</div>`;
    }

    return rows.map((row, index) => `
      <div class="beat-rush-board-row">
        <div class="beat-rush-board-place">#${index + 1}</div>
        <div class="beat-rush-board-main">
          <strong>${showUser ? escapeHtml(row.user?.username || row.user?.username_tag || "Игрок") : formatScore(row.score)}</strong>
          <span>${showUser ? formatScore(row.score) : formatResultDate(row.created_at)} · ${Number(row.accuracy || 0).toFixed(1)}% · combo ${Number(row.combo || 0)}</span>
        </div>
        <div class="beat-rush-board-xp">+${Number(row.xp_earned || 0)} XP</div>
      </div>
    `).join("");
  }

  function renderResult(content, finishedGame, accuracy, result, boards = null) {
    const track = getState()?.track || finishedGame.payload.track || {};
    const personalBest = boards?.personal?.best ? [boards.personal.best] : [];
    const personalRecent = Array.isArray(boards?.personal?.recent) ? boards.personal.recent : [];
    const personalRows = [
      ...personalBest.map((row) => ({ ...row, isBest: true })),
      ...personalRecent.filter((row) => row.created_at !== boards?.personal?.best?.created_at)
    ].slice(0, 9);
    const globalRows = Array.isArray(boards?.global) ? boards.global : [];

    content.innerHTML = `
      <div class="beat-rush-result">
        <div class="beat-rush-kicker">Beat Rush Complete</div>
        <h2>${accuracy >= 90 ? "Чистое попадание" : accuracy >= 70 ? "Хороший забег" : "Разогрев принят"}</h2>
        <p class="beat-rush-result-subtitle">${escapeHtml(track.title || finishedGame.payload.track?.title || "Трек")} · 40 секунд ритма</p>
        <div class="beat-rush-result-grid">
          <div><span>Score</span><strong>${formatScore(finishedGame.score)}</strong></div>
          <div><span>Accuracy</span><strong>${accuracy.toFixed(1)}%</strong></div>
          <div><span>Max combo</span><strong>${finishedGame.maxCombo}</strong></div>
          <div><span>XP earned</span><strong>+${Number(result.xp_earned || 0)}</strong></div>
        </div>
        ${result.xp_already_claimed_today ? `<p class="beat-rush-note-text">XP за этот трек и сложность сегодня уже получен, но результат сохранён.</p>` : ""}
        <div class="beat-rush-boards">
          <section class="beat-rush-board">
            <div class="beat-rush-board-head">
              <span>Твои забеги</span>
              <strong>Лучший и последние</strong>
            </div>
            ${renderScoreRows(personalRows)}
          </section>
          <section class="beat-rush-board">
            <div class="beat-rush-board-head">
              <span>Топ трека</span>
              <strong>Все игроки</strong>
            </div>
            ${renderScoreRows(globalRows, { showUser: true })}
          </section>
        </div>
        <div class="beat-rush-result-actions">
          <button class="beat-rush-primary" type="button" data-play-again>Играть еще</button>
          <button class="beat-rush-secondary" type="button" data-open-track>Открыть трек</button>
          <button class="beat-rush-secondary" type="button" data-close-beat-rush>Закрыть</button>
        </div>
      </div>
    `;

    content.querySelector("[data-play-again]")?.addEventListener("click", () => {
      const state = getState();
      if (state?.track?.id && typeof window.seekGlobalPlayer === "function") {
        window.seekGlobalPlayer(0, "beat-rush-restart");
      }
      renderDifficulty(content, getState());
    });

    content.querySelector("[data-close-beat-rush]")?.addEventListener("click", closeBeatRush);
    content.querySelector("[data-open-track]")?.addEventListener("click", () => {
      closeBeatRush();
      const path = track.username_tag && track.slug
        ? `/${track.username_tag}/${track.slug}`
        : `/track/${encodeURIComponent(track.id || finishedGame.payload.track?.id || "")}`;
      if (typeof window.navigate === "function") {
        window.navigate(path);
      } else {
        window.location.href = path;
      }
    });
  }

  function cleanupGameOnly() {
    if (!game) return;
    game.running = false;
    if (game.raf) cancelAnimationFrame(game.raf);
    if (game.keyHandler) {
      (game.keyListenerTarget || document).removeEventListener("keydown", game.keyHandler, true);
    }
    game.notes?.forEach((note) => note.el?.remove?.());
    game = null;
  }

  function closeBeatRush() {
    cleanupGameOnly();
    document.querySelector(".beat-rush-overlay")?.remove();
    document.body.classList.remove("beat-rush-open");
  }

  window.closeBeatRush = closeBeatRush;
  window.openBeatRush = function () {
    const shell = createShell();
    const state = getState();

    if (!hasPlayableAudio(state)) {
      renderMessage(shell.content, "Сначала включи трек, чтобы запустить Beat Rush", "Игра синхронизируется с текущим mp3 в глобальном плеере.");
      return;
    }

    renderDifficulty(shell.content, state);
  };
})();
