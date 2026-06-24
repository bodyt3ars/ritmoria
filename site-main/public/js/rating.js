let ratingAbortController = null;
let ratingOffset = 0;
let ratingTotal = 0;
let ratingSearchTimer = null;
let ratingLimit = 20;
let ratingTracksById = new Map();
let ratingEventsAbortController = null;

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
    artistsCount: document.getElementById("ratingArtistsCount"),
    periodLabel: document.getElementById("ratingPeriodLabel"),
    tracksMeta: document.getElementById("ratingTracksMeta"),
    tracksList: document.getElementById("ratingTracksList"),
    artistsList: document.getElementById("ratingArtistsList"),
    loadMore: document.getElementById("ratingLoadMore")
  };
}

function ratingBuildQuery({ offset = 0 } = {}) {
  const els = ratingGetElements();
  const params = new URLSearchParams();

  params.set("limit", String(ratingLimit));
  params.set("offset", String(offset));
  params.set("sort", els.sort?.value || "score");

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

function ratingPlayTrack(track) {
  const playable = ratingBuildPlayableTrack(track);

  if (typeof window.playTrackGlobal === "function") {
    window.playTrackGlobal(playable);
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
        <span class="rating-score-pill is-main" title="Итоговый рейтинг">${ratingEscapeHtml(ratingFormatScore(track.rating_score || track.total_score))}</span>
        <span class="rating-score-pill is-judge" title="Судьи">${ratingEscapeHtml(ratingFormatScore(track.judge_score))}</span>
        <span class="rating-score-pill" title="Пользователи">${ratingEscapeHtml(ratingFormatScore(track.user_score))}</span>
        <button type="button" class="rating-play-btn" title="Слушать" data-rating-play="${Number(track.id)}">
          <i class="fa-solid fa-play"></i>
        </button>
      </div>
    </article>
  `;
}

function ratingRenderArtist(artist, index) {
  const avatar = ratingNormalizeMedia(artist.avatar, "/images/default-avatar.jpg");
  const name = artist.username || artist.username_tag || "Артист";

  return `
    <article class="rating-artist-row" data-rating-artist-tag="${ratingEscapeHtml(artist.username_tag || "")}">
      <img class="rating-artist-avatar" src="${ratingEscapeHtml(avatar)}" alt="">
      <div>
        <div class="rating-track-stats">
          <span>#${index + 1}</span>
          <span>${ratingFormatCount(artist.tracks_count)} треков</span>
          <span>${ratingFormatCount(artist.total_votes_count)} голосов</span>
        </div>
        <div class="rating-artist-name">${ratingEscapeHtml(name)}</div>
        <div class="rating-artist-meta">${artist.username_tag ? `@${ratingEscapeHtml(artist.username_tag)}` : "без тега"}</div>
      </div>
      <div class="rating-artist-score">${ratingEscapeHtml(ratingFormatScore(artist.avg_rating_score || artist.avg_total_score))}</div>
    </article>
  `;
}

function ratingSetLoading(append = false) {
  const els = ratingGetElements();
  if (!append && els.tracksList) {
    els.tracksList.innerHTML = `<div class="rating-empty">Загружаем рейтинг...</div>`;
  }
  if (!append && els.artistsList) {
    els.artistsList.innerHTML = `<div class="rating-empty">Загружаем артистов...</div>`;
  }
  if (els.tracksMeta) els.tracksMeta.textContent = "загрузка...";
}

function ratingApplyResponse(data, { append = false } = {}) {
  const els = ratingGetElements();
  const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
  const artists = Array.isArray(data?.artists) ? data.artists : [];
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
  if (els.artistsCount) els.artistsCount.textContent = ratingFormatCount(artists.length);
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
  }

  if (els.artistsList && !append) {
    els.artistsList.innerHTML = artists.map(ratingRenderArtist).join("") || `<div class="rating-empty">Артистов пока нет</div>`;
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
    if (els.artistsList) {
      els.artistsList.innerHTML = "";
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

  els.artistsList?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-rating-artist-tag]");
    const tag = row?.dataset.ratingArtistTag;
    if (!tag) return;

    if (typeof navigate === "function") {
      navigate(`/${tag}`);
    } else {
      window.location.href = `/${tag}`;
    }
  }, eventOptions);
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
