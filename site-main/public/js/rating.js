let ratingAbortController = null;
let ratingOffset = 0;
let ratingTotal = 0;
let ratingSearchTimer = null;
let ratingLimit = 20;
let ratingTracksById = new Map();
let ratingEventsAbortController = null;

const RATING_DETAIL_CRITERIA = [
  { key: "rhymes_avg", label: "Рифмы" },
  { key: "structure_avg", label: "Структура" },
  { key: "style_avg", label: "Стиль" },
  { key: "charisma_avg", label: "Харизма" },
  { key: "vibe_avg", label: "Вайб" },
  { key: "memory_avg", label: "Память" }
];

function ratingEscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ratingFormatScore(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "—";
  return number.toFixed(number % 1 === 0 ? 0 : 1);
}

function ratingFormatCount(value) {
  const number = Math.max(0, Number(value || 0));
  return Number.isFinite(number) ? String(number) : "0";
}

function ratingHasDetailScores(track) {
  return RATING_DETAIL_CRITERIA.some((item) => Number(track?.[item.key] || 0) > 0);
}

function ratingRenderScoreTooltip(track) {
  if (!ratingHasDetailScores(track)) {
    return `
      <div class="rating-score-tooltip" role="tooltip" style="display:none">
        <div class="rating-score-tooltip-title">Подробные оценки</div>
        <div class="rating-score-tooltip-empty">Детальных критериев пока нет</div>
      </div>
    `;
  }

  return `
    <div class="rating-score-tooltip" role="tooltip" style="display:none">
      <div class="rating-score-tooltip-title">Средние оценки по критериям</div>
      <div class="rating-score-tooltip-sub">${ratingFormatCount(track.details_count)} рецензий от судей и пользователей</div>
      <div class="rating-score-tooltip-grid">
        ${RATING_DETAIL_CRITERIA.map((item) => `
          <div class="rating-score-tooltip-item">
            <span>${ratingEscapeHtml(item.label)}</span>
            <strong>${ratingEscapeHtml(ratingFormatScore(track[item.key]))}</strong>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function ratingRenderScoreTrigger(track, { className = "", value, label }) {
  return `
    <span class="rating-score-trigger" tabindex="0" aria-label="${ratingEscapeHtml(label)}">
      <span class="rating-score-pill ${ratingEscapeHtml(className)}">${ratingEscapeHtml(ratingFormatScore(value))}</span>
      ${ratingRenderScoreTooltip(track)}
    </span>
  `;
}

function ratingNormalizeMedia(value, fallback = "/images/default-cover.jpg") {
  const clean = String(value || "").trim();
  if (!clean) return fallback;
  if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
  return `/${clean.replace(/^\/+/, "")}`;
}

function ratingGetElements() {
  return {
    year: document.getElementById("ratingYear"),
    month: document.getElementById("ratingMonth"),
    sort: document.getElementById("ratingSort"),
    search: document.getElementById("ratingSearch"),
    refresh: document.getElementById("ratingRefreshBtn"),
    total: document.getElementById("ratingTotal"),
    periodLabel: document.getElementById("ratingPeriodLabel"),
    tracksMeta: document.getElementById("ratingTracksMeta"),
    tracksList: document.getElementById("ratingTracksList"),
    loadMore: document.getElementById("ratingLoadMore")
  };
}

function ratingBuildQuery({ offset = 0 } = {}) {
  const els = ratingGetElements();
  const params = new URLSearchParams();

  params.set("limit", String(ratingLimit));
  params.set("offset", String(offset));
  params.set("sort", els.sort?.value || "judge");

  const year = String(els.year?.value || "").trim();
  const month = String(els.month?.value || "").trim();
  const search = String(els.search?.value || "").trim();

  if (year) params.set("year", year);
  if (year && month) params.set("month", month);
  if (search) params.set("q", search);

  return params;
}

function ratingGetPeriodLabel() {
  const els = ratingGetElements();
  const year = String(els.year?.value || "").trim();
  const month = String(els.month?.value || "").trim();

  if (!year) return "Все";
  if (!month) return year;

  const monthOption = els.month?.querySelector(`option[value="${month}"]`);
  return `${monthOption?.textContent || month} ${year}`;
}

function ratingBuildPlayableTrack(track) {
  return {
    id: track.id,
    title: track.title || "Без названия",
    artist: track.artist || track.username || "Артист",
    cover: ratingNormalizeMedia(track.cover),
    audioSrc: ratingNormalizeMedia(track.audio, ""),
    audio: ratingNormalizeMedia(track.audio, ""),
    soundcloud: track.soundcloud || "",
    username_tag: track.username_tag || "",
    play_context: "rating"
  };
}

function ratingGetPlayerStateFromEvent(event) {
  const detail = event?.detail || null;

  if (detail?.track) return detail;
  if (detail?.id || detail?.audioSrc || detail?.soundcloud) {
    return {
      track: detail,
      isPlaying: detail.isPlaying !== false
    };
  }

  return window.getGlobalPlayerState?.() || null;
}

function ratingIsSamePlayableTrack(track, playerTrack) {
  if (!track || !playerTrack) return false;

  const trackId = Number(track.id || 0);
  const playerTrackId = Number(playerTrack.id || 0);
  if (trackId && playerTrackId && trackId === playerTrackId) return true;

  const playable = ratingBuildPlayableTrack(track);
  if (playable.audioSrc && playerTrack.audioSrc && playable.audioSrc === playerTrack.audioSrc) return true;
  if (playable.soundcloud && playerTrack.soundcloud && playable.soundcloud === playerTrack.soundcloud) return true;

  return false;
}

function ratingSyncPlayButtons(state = null) {
  const playerState = state || window.getGlobalPlayerState?.() || null;
  const playerTrack = playerState?.track || null;
  const isPlaying = !!playerState?.isPlaying;

  document.querySelectorAll("[data-rating-track-id]").forEach((row) => {
    const trackId = Number(row.dataset.ratingTrackId || 0);
    const track = ratingTracksById.get(trackId);
    const isCurrent = ratingIsSamePlayableTrack(track, playerTrack);
    const isCurrentPlaying = isCurrent && isPlaying;
    const button = row.querySelector("[data-rating-play]");

    row.classList.toggle("is-playing", isCurrentPlaying);

    if (button) {
      button.classList.toggle("is-playing", isCurrentPlaying);
      button.setAttribute("title", isCurrentPlaying ? "Пауза" : "Слушать");
      button.setAttribute("aria-label", isCurrentPlaying ? "Пауза" : "Слушать");
      button.innerHTML = isCurrentPlaying
        ? `<i class="fa-solid fa-pause"></i>`
        : `<i class="fa-solid fa-play"></i>`;
    }
  });
}

function ratingPlayTrack(track) {
  const playable = ratingBuildPlayableTrack(track);
  const playerState = window.getGlobalPlayerState?.() || null;

  if (ratingIsSamePlayableTrack(track, playerState?.track) && typeof window.toggleGlobalPlayerPlayback === "function") {
    window.toggleGlobalPlayerPlayback();
    ratingSyncPlayButtons({
      ...playerState,
      isPlaying: !playerState?.isPlaying
    });
    return;
  }

  if ((playable.audioSrc || playable.soundcloud) && typeof window.playTrackGlobal === "function") {
    window.playTrackGlobal(playable);
    ratingSyncPlayButtons({ track: playable, isPlaying: true });
    return;
  }

  if (typeof window.playTrackGlobal === "function") {
    window.playTrackGlobal(playable);
    ratingSyncPlayButtons({ track: playable, isPlaying: true });
    return;
  }

  if (typeof navigate === "function") {
    navigate(`/track/${track.id}`);
  }
}

function ratingOpenTrack(trackId) {
  if (!trackId) return;

  if (typeof navigate === "function") {
    navigate(`/track/${trackId}`);
  } else {
    window.location.href = `/track/${trackId}`;
  }
}

function ratingRenderTrack(track, index) {
  const place = ratingOffset + index + 1;
  const cover = ratingNormalizeMedia(track.cover);
  const totalVotes = Number(track.total_votes_count || 0);
  const userVotes = Number(track.user_votes_count || 0);
  const judgeVotes = Number(track.judge_votes_count || 0);

  return `
    <article class="rating-track-row" data-rating-track-id="${Number(track.id)}">
      <div class="rating-place ${place <= 3 ? "is-top" : ""}">${place}</div>
      <img class="rating-cover" src="${ratingEscapeHtml(cover)}" alt="">
      <div class="rating-track-main">
        <div class="rating-track-stats">
          <span><i class="fa-regular fa-message"></i> ${ratingFormatCount(totalVotes)}</span>
          <span>судьи ${ratingFormatCount(judgeVotes)}</span>
          <span>юзеры ${ratingFormatCount(userVotes)}</span>
        </div>
        <div class="rating-track-title">${ratingEscapeHtml(track.title || "Без названия")}</div>
        <div class="rating-track-artist">${ratingEscapeHtml(track.artist || track.username || "Артист")}</div>
      </div>
      <div class="rating-score-stack">
        <div class="rating-score-group" aria-label="Оценки">
          ${ratingRenderScoreTrigger(track, {
            className: "is-main",
            value: track.rating_score || track.total_score,
            label: "Итоговый рейтинг. Наведите, чтобы увидеть критерии"
          })}
          ${ratingRenderScoreTrigger(track, {
            className: "is-judge",
            value: track.judge_score,
            label: "Оценка судей. Наведите, чтобы увидеть критерии"
          })}
          ${ratingRenderScoreTrigger(track, {
            value: track.user_score,
            label: "Оценка пользователей. Наведите, чтобы увидеть критерии"
          })}
        </div>
        <button type="button" class="rating-play-btn" title="Слушать" aria-label="Слушать" data-rating-play="${Number(track.id)}">
          <i class="fa-solid fa-play"></i>
        </button>
      </div>
    </article>
  `;
}

function ratingSetLoading(append = false) {
  const els = ratingGetElements();
  if (!append && els.tracksList) {
    els.tracksList.innerHTML = `<div class="rating-empty">Загружаем рейтинг...</div>`;
  }
  if (els.tracksMeta) els.tracksMeta.textContent = "загрузка...";
}

function ratingApplyResponse(data, { append = false } = {}) {
  const els = ratingGetElements();
  const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
  const meta = data?.meta || {};

  ratingTotal = Number(meta.total || tracks[0]?.total_count || 0) || 0;

  if (!append) {
    ratingTracksById.clear();
  }
  tracks.forEach((track) => {
    const id = Number(track?.id || 0);
    if (id) ratingTracksById.set(id, track);
  });

  if (els.total) els.total.textContent = ratingFormatCount(ratingTotal);
  if (els.periodLabel) els.periodLabel.textContent = ratingGetPeriodLabel();

  if (els.tracksMeta) {
    const shown = Math.min(ratingOffset + tracks.length, ratingTotal);
    els.tracksMeta.textContent = ratingTotal ? `${shown} из ${ratingTotal}` : "пока пусто";
  }

  if (els.tracksList) {
    const markup = tracks.map(ratingRenderTrack).join("");
    if (append) {
      els.tracksList.insertAdjacentHTML("beforeend", markup);
    } else {
      els.tracksList.innerHTML = markup || `<div class="rating-empty">Оцененных треков пока нет</div>`;
    }
    ratingSyncPlayButtons();
  }

  ratingOffset += tracks.length;
  if (els.loadMore) {
    els.loadMore.classList.toggle("rating-hidden", ratingOffset >= ratingTotal || tracks.length === 0);
  }
}

async function loadRating({ append = false } = {}) {
  const els = ratingGetElements();

  if (!append) {
    ratingOffset = 0;
  }

  ratingAbortController?.abort();
  ratingAbortController = new AbortController();

  ratingSetLoading(append);

  try {
    const params = ratingBuildQuery({ offset: append ? ratingOffset : 0 });
    const res = await fetch(`/api/rating?${params.toString()}`, {
      signal: ratingAbortController.signal,
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error(`rating_load_${res.status}`);
    }

    const data = await res.json();
    ratingApplyResponse(data, { append });
  } catch (err) {
    if (err?.name === "AbortError") return;
    console.error("rating load error", err);

    if (els.tracksList) {
      els.tracksList.innerHTML = `<div class="rating-error">Не удалось загрузить рейтинг</div>`;
    }
    if (els.tracksMeta) els.tracksMeta.textContent = "ошибка";
  }
}

function ratingFillYears() {
  const yearSelect = document.getElementById("ratingYear");
  if (!yearSelect || yearSelect.dataset.filled === "1") return;

  const currentYear = new Date().getFullYear();
  const years = [];
  for (let year = currentYear; year >= currentYear - 5; year -= 1) {
    years.push(year);
  }

  yearSelect.insertAdjacentHTML(
    "beforeend",
    years.map((year) => `<option value="${year}">${year}</option>`).join("")
  );
  yearSelect.dataset.filled = "1";
}

function bindRatingEvents() {
  const els = ratingGetElements();
  ratingEventsAbortController?.abort();
  ratingEventsAbortController = new AbortController();
  const eventOptions = { signal: ratingEventsAbortController.signal };

  els.year?.addEventListener("change", () => {
    if (!els.year.value && els.month) els.month.value = "";
    loadRating();
  }, eventOptions);

  els.month?.addEventListener("change", () => {
    if (els.month.value && els.year && !els.year.value) {
      els.year.value = String(new Date().getFullYear());
    }
    loadRating();
  }, eventOptions);

  els.sort?.addEventListener("change", () => loadRating(), eventOptions);
  els.refresh?.addEventListener("click", () => loadRating(), eventOptions);
  els.loadMore?.addEventListener("click", () => loadRating({ append: true }), eventOptions);

  els.search?.addEventListener("input", () => {
    clearTimeout(ratingSearchTimer);
    ratingSearchTimer = setTimeout(() => loadRating(), 260);
  }, eventOptions);

  els.tracksList?.addEventListener("click", (event) => {
    const playButton = event.target.closest("[data-rating-play]");
    if (playButton) {
      event.preventDefault();
      event.stopPropagation();

      const row = playButton.closest("[data-rating-track-id]");
      const trackId = Number(row?.dataset.ratingTrackId || 0);
      if (!trackId) return;

      ratingPlayTrack(ratingTracksById.get(trackId) || { id: trackId });
      return;
    }

    const row = event.target.closest("[data-rating-track-id]");
    if (row) {
      ratingOpenTrack(Number(row.dataset.ratingTrackId || 0));
    }
  }, eventOptions);

  [
    "ritmoria:global-player-track-change",
    "ritmoria:global-player-play",
    "ritmoria:global-player-pause",
    "ritmoria:global-player-stopped"
  ].forEach((eventName) => {
    window.addEventListener(eventName, (event) => {
      if (eventName === "ritmoria:global-player-stopped") {
        ratingSyncPlayButtons({ track: null, isPlaying: false });
        return;
      }
      ratingSyncPlayButtons(ratingGetPlayerStateFromEvent(event));
    }, eventOptions);
  });
}

window.initRatingPage = function () {
  const page = document.querySelector(".rating-page");
  if (!page || page.dataset.ratingInitialized === "1") return;

  page.dataset.ratingInitialized = "1";
  ratingFillYears();
  bindRatingEvents();
  loadRating();
};

window.destroyRatingPage = function () {
  ratingAbortController?.abort();
  ratingAbortController = null;
  clearTimeout(ratingSearchTimer);
  ratingSearchTimer = null;
  ratingEventsAbortController?.abort();
  ratingEventsAbortController = null;
  ratingTracksById.clear();
  ratingOffset = 0;
  ratingTotal = 0;
};
