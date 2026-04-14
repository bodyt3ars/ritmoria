let opensState = {
  items: [],
  myUserId: null
};

function opensEscapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatOpenPlayerTime(seconds) {
  const safe = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

async function loadCurrentUserForOpens() {
  const token = localStorage.getItem("token");
  if (!token) {
    opensState.myUserId = null;
    return null;
  }

  const res = await fetch("/me", {
    headers: { Authorization: "Bearer " + token }
  });
  if (!res.ok) return null;
  const me = await res.json();
  opensState.myUserId = Number(me.id || 0) || null;
  return me;
}

function renderOpenCandidates(openItem) {
  if (!openItem.is_mine) return "";
  const candidates = Array.isArray(openItem.candidates) ? openItem.candidates : [];
  if (!candidates.length) {
    return `<div class="opens-empty">Пока никто не откликнулся</div>`;
  }

  return `
    <div class="opens-candidates-list">
      ${candidates.map((candidate) => `
        <div class="opens-candidate-card">
          <div class="opens-candidate-head">
            <div class="opens-candidate-user">
              <a href="/${opensEscapeHtml(candidate.username_tag || "")}" class="opens-candidate-link" data-opens-profile="${opensEscapeHtml(candidate.username_tag || "")}">${opensEscapeHtml(candidate.username || candidate.username_tag || "user")}</a>
              <div class="opens-candidate-meta">@${opensEscapeHtml(candidate.username_tag || "")}</div>
            </div>
            ${candidate.status === "selected"
              ? `<div class="opens-candidate-selected">Выбран</div>`
              : `<button type="button" class="opens-select-btn" data-open-id="${openItem.id}" data-candidate-id="${candidate.user_id}">Выбрать</button>`}
          </div>
          <div class="opens-candidate-message">${opensEscapeHtml(candidate.message || "Без сообщения")}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderOpenCard(openItem) {
  const isMine = Number(openItem.user_id) === Number(opensState.myUserId || 0);
  openItem.is_mine = isMine;
  const media = openItem.cover_url
    ? `<div class="opens-card-media"><img src="${opensEscapeHtml(openItem.cover_url)}" alt="${opensEscapeHtml(openItem.title || "cover")}"></div>`
    : "";
  const audio = openItem.audio_url
    ? `
      <div class="opens-card-media">
        <div class="opens-audio-player" data-open-audio-player>
          <audio class="opens-audio-element" preload="metadata" src="${opensEscapeHtml(openItem.audio_url)}"></audio>
          <button type="button" class="opens-audio-play" data-open-audio-play aria-label="Воспроизвести">
            <i class="fa-solid fa-play"></i>
          </button>
          <div class="opens-audio-main">
            <div class="opens-audio-time">
              <span data-open-audio-current>0:00</span>
              <span>/</span>
              <span data-open-audio-duration>0:00</span>
            </div>
            <input type="range" class="opens-audio-progress" data-open-audio-progress min="0" max="100" value="0">
            <div class="opens-audio-volume-row">
              <i class="fa-solid fa-volume-low"></i>
              <input type="range" class="opens-audio-volume" data-open-audio-volume min="0" max="1" step="0.01" value="0.3">
            </div>
          </div>
        </div>
      </div>`
    : "";

  return `
    <article class="opens-card" data-open-id="${openItem.id}">
      <div class="opens-card-head">
        <div>
          <h3 class="opens-card-title">${opensEscapeHtml(openItem.title || "Опен")}</h3>
          <div class="opens-card-owner">от <a href="/${opensEscapeHtml(openItem.username_tag || "")}" class="opens-card-owner-link" data-opens-profile="${opensEscapeHtml(openItem.username_tag || "")}">${opensEscapeHtml(openItem.username || openItem.username_tag || "user")}</a></div>
          <div class="opens-card-meta">${openItem.status === "matched" ? "Участник уже выбран" : "Открыт для заявок"} · ${Number(openItem.candidates_count || 0)} откликов</div>
        </div>
      </div>
      <div class="opens-card-description">${opensEscapeHtml(openItem.description || "Без описания")}</div>
      ${media}
      ${audio}
      <div class="opens-card-tags">
        ${openItem.genre ? `<span class="opens-chip">${opensEscapeHtml(openItem.genre)}</span>` : ""}
        ${openItem.looking_for ? `<span class="opens-chip">${opensEscapeHtml(openItem.looking_for)}</span>` : ""}
      </div>
      <div class="opens-card-actions">
        ${isMine ? `<button type="button" class="opens-delete-btn" data-open-delete="${openItem.id}">Удалить опен</button>` : ""}
        ${!isMine && openItem.status === "open" ? `
          <textarea class="opens-apply-message" placeholder="Напиши, почему именно ты залетишь сюда лучше всех"></textarea>
          <button type="button" class="opens-apply-btn" data-open-apply="${openItem.id}">Предложить кандидатуру</button>
        ` : ""}
      </div>
      ${renderOpenCandidates(openItem)}
    </article>
  `;
}

async function loadOpenCandidates(openId) {
  const token = localStorage.getItem("token");
  if (!token) return [];
  const res = await fetch(`/api/opens/${openId}/candidates`, {
    headers: { Authorization: "Bearer " + token }
  });
  if (!res.ok) return [];
  return res.json();
}

async function loadOpens() {
  const feed = document.getElementById("opensFeed");
  const side = document.getElementById("opensMyActivity");
  if (!feed || !side) return;

  const res = await fetch("/api/opens", {
    headers: localStorage.getItem("token")
      ? { Authorization: "Bearer " + localStorage.getItem("token") }
      : {}
  });
  const opens = res.ok ? await res.json() : [];

  opensState.items = Array.isArray(opens) ? opens : [];

  for (const openItem of opensState.items) {
    if (Number(openItem.user_id) === Number(opensState.myUserId || 0)) {
      openItem.candidates = await loadOpenCandidates(openItem.id);
    }
  }

  feed.innerHTML = opensState.items.length
    ? opensState.items.map(renderOpenCard).join("")
    : `<div class="opens-empty">Пока опенов нет</div>`;

  const myActivity = opensState.items.filter((item) => item.has_applied || Number(item.user_id) === Number(opensState.myUserId || 0));
  side.innerHTML = myActivity.length
    ? myActivity.map((item) => `
        <div class="opens-candidate-card">
          <div><strong>${opensEscapeHtml(item.title || "Опен")}</strong></div>
          <div class="opens-candidate-meta">${item.has_applied ? "Ты уже оставил заявку" : "Твой опен"}</div>
        </div>
      `).join("")
    : `<div class="opens-empty">Пока пусто</div>`;

  bindOpensInteractions();
}

async function createOpen() {
  const token = localStorage.getItem("token");
  if (!token) {
    navigate("/login");
    return;
  }

  const status = document.getElementById("opensCreateStatus");
  const formData = new FormData();
  formData.append("title", document.getElementById("openTitle")?.value.trim() || "");
  formData.append("description", document.getElementById("openDescription")?.value.trim() || "");
  formData.append("genre", document.getElementById("openGenre")?.value.trim() || "");
  formData.append("looking_for", document.getElementById("openLookingFor")?.value.trim() || "");
  formData.append("soundcloud_url", document.getElementById("openSoundcloud")?.value.trim() || "");
  const audioFile = document.getElementById("openAudio")?.files?.[0];
  if (audioFile) formData.append("audio", audioFile);

  const res = await fetch("/api/opens", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: formData
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (status) status.textContent = window.getApiErrorMessage?.(data, "Не удалось опубликовать опен") || "Не удалось опубликовать опен";
    return;
  }

  if (status) status.textContent = "Опен опубликован";
  ["openTitle", "openDescription", "openGenre", "openLookingFor", "openSoundcloud"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const audio = document.getElementById("openAudio");
  if (audio) audio.value = "";
  updateSelectedOpenFiles();
  await loadOpens();
}

async function applyToOpen(openId, button) {
  const token = localStorage.getItem("token");
  if (!token) {
    navigate("/login");
    return;
  }

  const card = button.closest(".opens-card");
  const textarea = card?.querySelector(".opens-apply-message");
  const message = textarea?.value.trim() || "";
  const res = await fetch(`/api/opens/${openId}/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify({ message })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(window.getApiErrorMessage?.(data, "Не удалось отправить заявку") || "Не удалось отправить заявку");
    return;
  }

  await loadOpens();
  await window.loadNavbarNotifications?.();
}

async function selectCandidate(openId, candidateUserId) {
  const token = localStorage.getItem("token");
  if (!token) return;
  const res = await fetch(`/api/opens/${openId}/select-candidate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify({ candidateUserId })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(window.getApiErrorMessage?.(data, "Не удалось выбрать участника") || "Не удалось выбрать участника");
    return;
  }
  await loadOpens();
  await window.loadNavbarNotifications?.();
  if (data.conversationId) {
    navigate(`/messages?conversation=${data.conversationId}`);
  }
}

async function deleteOpen(openId) {
  const token = localStorage.getItem("token");
  if (!token) return;

  const res = await fetch(`/api/opens/${openId}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(window.getApiErrorMessage?.(data, "Не удалось удалить опен") || "Не удалось удалить опен");
    return;
  }

  await loadOpens();
}

function bindOpensInteractions() {
  document.querySelectorAll("[data-opens-profile]").forEach((link) => {
    if (link.dataset.bound === "1") return;
    link.dataset.bound = "1";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      navigate(`/${link.dataset.opensProfile}`);
    });
  });

  document.querySelectorAll("[data-open-apply]").forEach((button) => {
    if (button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => applyToOpen(button.dataset.openApply, button));
  });

  document.querySelectorAll(".opens-select-btn").forEach((button) => {
    if (button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => selectCandidate(button.dataset.openId, button.dataset.candidateId));
  });

  document.querySelectorAll("[data-open-delete]").forEach((button) => {
    if (button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => deleteOpen(button.dataset.openDelete));
  });

  document.querySelectorAll("[data-open-audio-player]").forEach((player) => {
    if (player.dataset.bound === "1") return;
    player.dataset.bound = "1";

    const audio = player.querySelector(".opens-audio-element");
    const playBtn = player.querySelector("[data-open-audio-play]");
    const progress = player.querySelector("[data-open-audio-progress]");
    const volume = player.querySelector("[data-open-audio-volume]");
    const current = player.querySelector("[data-open-audio-current]");
    const duration = player.querySelector("[data-open-audio-duration]");

    if (!audio || !playBtn || !progress || !volume || !current || !duration) return;

    const syncPlayState = () => {
      const icon = playBtn.querySelector("i");
      if (icon) {
        icon.className = audio.paused
          ? "fa-solid fa-play"
          : "fa-solid fa-pause";
      }
      player.classList.toggle("is-playing", !audio.paused);
    };

    audio.volume = 0.3;
    volume.value = "0.3";
    duration.textContent = formatOpenPlayerTime(audio.duration || 0);

    audio.addEventListener("loadedmetadata", () => {
      duration.textContent = formatOpenPlayerTime(audio.duration || 0);
    });

    audio.addEventListener("timeupdate", () => {
      current.textContent = formatOpenPlayerTime(audio.currentTime || 0);
      const ratio = audio.duration > 0 ? ((audio.currentTime || 0) / audio.duration) * 100 : 0;
      progress.value = String(ratio);
    });

    audio.addEventListener("play", syncPlayState);
    audio.addEventListener("pause", syncPlayState);
    audio.addEventListener("ended", () => {
      audio.currentTime = 0;
      progress.value = "0";
      current.textContent = "0:00";
      syncPlayState();
    });

    playBtn.addEventListener("click", () => {
      if (audio.paused) {
        document.querySelectorAll(".opens-audio-element").forEach((otherAudio) => {
          if (otherAudio !== audio) otherAudio.pause();
        });
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    });

    progress.addEventListener("input", () => {
      const ratio = Number(progress.value || 0) / 100;
      if (audio.duration > 0) {
        audio.currentTime = audio.duration * ratio;
      }
    });

    volume.addEventListener("input", () => {
      audio.volume = Math.max(0, Math.min(1, Number(volume.value || 0.3)));
    });

    syncPlayState();
  });
}

function updateSelectedOpenFiles() {
  const audioInput = document.getElementById("openAudio");
  const audioName = document.getElementById("openAudioName");

  if (audioName) {
    audioName.textContent = audioInput?.files?.[0]?.name || "Файл не выбран";
  }
}

window.initOpensPage = async function initOpensPage() {
  await loadCurrentUserForOpens();
  document.getElementById("publishOpenBtn")?.addEventListener("click", createOpen);
  document.getElementById("openAudio")?.addEventListener("change", updateSelectedOpenFiles);
  updateSelectedOpenFiles();
  await loadOpens();
};
