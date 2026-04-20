const battlesState = {
  battle: null,
  viewer: null,
  openSlots: [],
  entriesBySlot: new Map(),
  profileTracks: null,
  selectedSlot: null,
  submitMode: "file"
};

function battleEscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getBattleToken() {
  return localStorage.getItem("token") || "";
}

function getBattleAuthHeaders() {
  const token = getBattleToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function isBattleAdmin() {
  return String(battlesState.viewer?.role || "") === "admin";
}

function canBattleJoin() {
  return Boolean(getBattleToken() && battlesState.viewer?.canJoin);
}

function battleStatusLabel(status) {
  if (status === "filled") return "Сетка собрана";
  if (status === "archived") return "Архив";
  return "Набор открыт";
}

function getBattleRoundTitle(roundIndex) {
  if (roundIndex === 0) return "Раунд 1";
  if (roundIndex === 1) return "Полуфинал";
  if (roundIndex === 2) return "Финал";
  return `Раунд ${roundIndex + 1}`;
}

function buildBattleRounds(slotsCount) {
  const rounds = [];
  let matchesCount = Math.max(1, Number(slotsCount || 0) / 2);
  let roundIndex = 0;

  while (matchesCount >= 1) {
    const matches = [];
    for (let matchIndex = 0; matchIndex < matchesCount; matchIndex += 1) {
      const slotStart = roundIndex === 0 ? matchIndex * 2 + 1 : null;
      matches.push({
        id: `${roundIndex + 1}-${matchIndex + 1}`,
        slotNumbers: slotStart ? [slotStart, slotStart + 1] : []
      });
    }
    rounds.push({
      title: getBattleRoundTitle(roundIndex),
      matches
    });
    matchesCount = Math.floor(matchesCount / 2);
    roundIndex += 1;
  }

  return rounds;
}

function getBattleEntry(slotNumber) {
  return battlesState.entriesBySlot.get(Number(slotNumber || 0)) || null;
}

function isSlotBusy(slotNumber) {
  return Boolean(getBattleEntry(slotNumber));
}

function canTakeSlot(slotNumber) {
  if (!battlesState.battle) return false;
  if (!canBattleJoin()) return false;
  if (battlesState.viewer?.entrySlot) return false;
  return battlesState.openSlots.includes(Number(slotNumber || 0)) && !isSlotBusy(slotNumber);
}

function renderBattleSlot(slotNumber) {
  const entry = getBattleEntry(slotNumber);
  const isOpen = canTakeSlot(slotNumber);

  if (entry) {
    return `
      <div class="battle-slot-card is-filled">
        <div class="battle-slot-index">#${Number(slotNumber || 0)}</div>
        <div class="battle-slot-main">
          <img class="battle-slot-cover" src="${battleEscapeHtml(entry.cover || "/images/logo.png")}" alt="${battleEscapeHtml(entry.title || "track cover")}">
          <div class="battle-slot-copy">
            <div class="battle-slot-title">${battleEscapeHtml(entry.title || "Без названия")}</div>
            <div class="battle-slot-artist">${battleEscapeHtml(entry.artist || entry.username || "Артист")}</div>
            <div class="battle-slot-owner">@${battleEscapeHtml(entry.username_tag || "user")}</div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="battle-slot-card ${isOpen ? "is-open" : ""}">
      <div class="battle-slot-index">#${Number(slotNumber || 0)}</div>
      <div class="battle-slot-empty-copy">
        <div class="battle-slot-title">Свободное место</div>
        <div class="battle-slot-artist">${isOpen ? "Можно залететь со своим треком" : "Ожидает участника"}</div>
      </div>
      ${isOpen ? `
        <button type="button" class="battle-slot-cta" onclick="openBattleSubmitModal(${Number(slotNumber || 0)})">
          Занять слот
        </button>
      ` : ``}
    </div>
  `;
}

function renderBattleBracket() {
  const container = document.getElementById("battlesCurrentWrap");
  if (!container) return;

  if (!battlesState.battle) {
    container.innerHTML = `
      <div class="battles-empty">
        <div class="battles-empty-label">Пока без баттла</div>
        <h2>Активная сетка ещё не создана</h2>
        <p>${isBattleAdmin() ? "Собери новую турнирную таблицу сверху, и участники сразу смогут занимать свободные места." : "Как только админ создаст новую сетку, она появится здесь автоматически."}</p>
      </div>
    `;
    return;
  }

  const rounds = buildBattleRounds(battlesState.battle.slots_count);
  container.innerHTML = `
    <section class="battles-board">
      <div class="battles-board-head">
        <div>
          <div class="battles-board-kicker">Текущий баттл</div>
          <h2>${battleEscapeHtml(battlesState.battle.title || "Баттл")}</h2>
          <p>
            ${battleStatusLabel(battlesState.battle.status)} · ${Number(battlesState.battle.participants_count || 0)} / ${Number(battlesState.battle.slots_count || 0)} участников
          </p>
        </div>

        <div class="battles-board-badges">
          <span class="battles-board-badge">Свободно: ${Number(battlesState.openSlots.length || 0)}</span>
          ${battlesState.viewer?.entrySlot ? `<span class="battles-board-badge is-warm">Твой слот: #${Number(battlesState.viewer.entrySlot)}</span>` : ``}
        </div>
      </div>

      <div class="battles-board-grid">
        ${rounds.map((round, roundIndex) => `
          <section class="battle-round-column">
            <div class="battle-round-head">
              <span>${battleEscapeHtml(round.title)}</span>
            </div>

            <div class="battle-round-matches">
              ${round.matches.map((match) => `
                <div class="battle-match-card ${roundIndex > 0 ? "is-future" : ""}">
                  ${roundIndex === 0
                    ? match.slotNumbers.map((slotNumber) => renderBattleSlot(slotNumber)).join("")
                    : `
                      <div class="battle-future-slot">
                        <div class="battle-future-line">Победитель матча</div>
                        <div class="battle-future-subline">место заполнится позже</div>
                      </div>
                      <div class="battle-future-slot">
                        <div class="battle-future-line">Победитель матча</div>
                        <div class="battle-future-subline">место заполнится позже</div>
                      </div>
                    `}
                </div>
              `).join("")}
            </div>
          </section>
        `).join("")}
      </div>
    </section>
  `;
}

function renderBattleHero() {
  const container = document.getElementById("battlesHeroMeta");
  if (!container) return;

  if (!battlesState.battle) {
    container.innerHTML = `
      <div class="battles-hero-card">
        <span class="battles-hero-label">Сейчас</span>
        <strong>Ожидание новой сетки</strong>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="battles-hero-card">
      <span class="battles-hero-label">Сетка</span>
      <strong>${Number(battlesState.battle.slots_count || 0)} мест</strong>
    </div>
    <div class="battles-hero-card">
      <span class="battles-hero-label">Заполнено</span>
      <strong>${Number(battlesState.battle.participants_count || 0)} / ${Number(battlesState.battle.slots_count || 0)}</strong>
    </div>
    <div class="battles-hero-card">
      <span class="battles-hero-label">Статус</span>
      <strong>${battleEscapeHtml(battleStatusLabel(battlesState.battle.status))}</strong>
    </div>
  `;
}

function renderBattlesAdminPanel() {
  const container = document.getElementById("battlesAdminPanel");
  if (!container) return;

  if (!isBattleAdmin()) {
    container.classList.add("queue-hidden");
    container.innerHTML = "";
    return;
  }

  container.classList.remove("queue-hidden");
  container.innerHTML = `
    <section class="battles-admin-shell">
      <div class="battles-admin-copy">
        <div class="battles-board-kicker">Админ-панель</div>
        <h3>Собрать новую турнирную сетку</h3>
        <p>Новая таблица автоматически отправит прошлую в архив, так что существующая очередь и её рейтинг не пострадают.</p>
      </div>

      <div class="battles-admin-actions">
        <label class="battles-field">
          <span>Количество участников</span>
          <select id="battleSlotsCount" class="battles-input">
            <option value="4">4 участника</option>
            <option value="8" selected>8 участников</option>
            <option value="16">16 участников</option>
            <option value="32">32 участника</option>
          </select>
        </label>

        <label class="battles-field battles-field-wide">
          <span>Название баттла</span>
          <input id="battleTitleInput" class="battles-input" type="text" maxlength="180" placeholder="Например, Ночной баттл #1">
        </label>

        <div class="battles-admin-buttons">
          <button type="button" class="battle-primary-btn" onclick="createBattleBracket()">Создать сетку</button>
          ${battlesState.battle ? `<button type="button" class="battle-secondary-btn" onclick="archiveCurrentBattle(${Number(battlesState.battle.id || 0)})">Архивировать текущую</button>` : ``}
        </div>
      </div>
    </section>
  `;
}

async function loadBattlesPageData() {
  const res = await fetch("/api/battles/current", {
    headers: {
      ...getBattleAuthHeaders()
    }
  });

  if (!res.ok) {
    throw new Error("battle_load_failed");
  }

  const data = await res.json();
  battlesState.battle = data?.battle || null;
  battlesState.viewer = data?.viewer || null;
  battlesState.openSlots = Array.isArray(data?.openSlots) ? data.openSlots.map((slot) => Number(slot || 0)) : [];
  battlesState.entriesBySlot = new Map(
    (Array.isArray(data?.entries) ? data.entries : []).map((entry) => [Number(entry.slot_number || 0), entry])
  );
}

async function refreshBattlesPage() {
  const wrap = document.getElementById("battlesCurrentWrap");
  if (wrap) {
    wrap.innerHTML = `<div class="battles-empty"><div class="battles-empty-label">Загрузка</div><h2>Собираем сетку</h2><p>Секунду, подтягиваем баттл и свободные слоты.</p></div>`;
  }

  await loadBattlesPageData();
  renderBattleHero();
  renderBattlesAdminPanel();
  renderBattleBracket();
}

async function createBattleBracket() {
  const slotsCount = Number(document.getElementById("battleSlotsCount")?.value || 0);
  const title = String(document.getElementById("battleTitleInput")?.value || "").trim();

  const res = await fetch("/api/battles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getBattleAuthHeaders()
    },
    body: JSON.stringify({
      slotsCount,
      title
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(window.getApiErrorMessage?.(data, "Не удалось создать баттл") || "Не удалось создать баттл");
    return;
  }

  await refreshBattlesPage();
}

async function archiveCurrentBattle(battleId) {
  if (!battleId) return;
  if (!confirm("Отправить текущий баттл в архив?")) return;

  const res = await fetch(`/api/battles/${battleId}/archive`, {
    method: "POST",
    headers: {
      ...getBattleAuthHeaders()
    }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(window.getApiErrorMessage?.(data, "Не удалось архивировать баттл") || "Не удалось архивировать баттл");
    return;
  }

  await refreshBattlesPage();
}

function setBattleSubmitMode(mode) {
  battlesState.submitMode = mode === "profile" ? "profile" : "file";
  document.querySelectorAll("[data-battle-submit-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.battleSubmitMode === battlesState.submitMode);
  });
  renderBattleSubmitBody();
}

async function ensureBattleProfileTracks() {
  if (Array.isArray(battlesState.profileTracks)) {
    return battlesState.profileTracks;
  }

  const res = await fetch("/user-tracks", {
    headers: {
      ...getBattleAuthHeaders()
    }
  });

  if (!res.ok) {
    throw new Error("profile_tracks_load_failed");
  }

  battlesState.profileTracks = await res.json();
  return battlesState.profileTracks;
}

function renderBattleSubmitBody() {
  const body = document.getElementById("battleSubmitBody");
  if (!body) return;

  if (battlesState.submitMode === "profile") {
    const profileTracks = Array.isArray(battlesState.profileTracks) ? battlesState.profileTracks : [];
    body.innerHTML = `
      <div class="battle-profile-select">
        ${profileTracks.length ? profileTracks.map((track) => `
          <button type="button" class="battle-profile-track" onclick="submitBattleProfileTrack(${Number(track.id || 0)})">
            <img src="${battleEscapeHtml(track.cover || "/images/logo.png")}" alt="${battleEscapeHtml(track.title || "track cover")}">
            <div class="battle-profile-track-copy">
              <strong>${battleEscapeHtml(track.title || "Без названия")}</strong>
              <span>${battleEscapeHtml(track.artist || "Артист")}</span>
            </div>
          </button>
        `).join("") : `<div class="battles-empty compact"><h2>Профиль пока пуст</h2><p>Сначала загрузи трек в профиль, потом сможешь отправить его в баттл.</p></div>`}
      </div>
    `;
    return;
  }

  body.innerHTML = `
    <form id="battleFileForm" class="battle-file-form">
      <label class="battles-field">
        <span>Название трека</span>
        <input class="battles-input" type="text" name="title" maxlength="160" placeholder="Название" required>
      </label>

      <label class="battles-field">
        <span>Артист</span>
        <input class="battles-input" type="text" name="artist" maxlength="255" placeholder="Имя артиста">
      </label>

      <label class="battles-field">
        <span>Аудиофайл</span>
        <input class="battles-input battles-file-input" type="file" name="audio" accept="audio/*" required>
      </label>

      <label class="battles-field">
        <span>Обложка</span>
        <input class="battles-input battles-file-input" type="file" name="cover" accept="image/*">
      </label>

      <button type="submit" class="battle-primary-btn battle-submit-btn">Занять место</button>
    </form>
  `;

  const form = document.getElementById("battleFileForm");
  form?.addEventListener("submit", submitBattleFileTrack);
}

async function openBattleSubmitModal(slotNumber) {
  if (!canTakeSlot(slotNumber)) return;

  battlesState.selectedSlot = Number(slotNumber || 0);
  const modal = document.getElementById("battleSubmitModal");
  const title = document.getElementById("battleSubmitTitle");
  if (!modal || !title) return;

  title.textContent = `Слот #${battlesState.selectedSlot}`;
  modal.classList.remove("queue-hidden");
  document.body.classList.add("settings-modal-open");

  setBattleSubmitMode("file");
  try {
    await ensureBattleProfileTracks();
  } catch (err) {
    console.error("Battle profile tracks error:", err);
  }
}

function closeBattleSubmitModal() {
  const modal = document.getElementById("battleSubmitModal");
  const body = document.getElementById("battleSubmitBody");
  if (modal) modal.classList.add("queue-hidden");
  if (body) body.innerHTML = "";
  battlesState.selectedSlot = null;
  document.body.classList.remove("settings-modal-open");
}

async function submitBattleFileTrack(event) {
  event.preventDefault();
  if (!battlesState.battle || !battlesState.selectedSlot) return;

  const form = event.currentTarget;
  const formData = new FormData(form);
  formData.set("slotNumber", String(battlesState.selectedSlot));

  const res = await fetch(`/api/battles/${Number(battlesState.battle.id || 0)}/join/file`, {
    method: "POST",
    headers: {
      ...getBattleAuthHeaders()
    },
    body: formData
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(window.getApiErrorMessage?.(data, "Не удалось занять слот") || "Не удалось занять слот");
    return;
  }

  closeBattleSubmitModal();
  await refreshBattlesPage();
}

async function submitBattleProfileTrack(profileTrackId) {
  if (!battlesState.battle || !battlesState.selectedSlot || !profileTrackId) return;

  const res = await fetch(`/api/battles/${Number(battlesState.battle.id || 0)}/join-profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getBattleAuthHeaders()
    },
    body: JSON.stringify({
      slotNumber: battlesState.selectedSlot,
      profileTrackId
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(window.getApiErrorMessage?.(data, "Не удалось занять слот") || "Не удалось занять слот");
    return;
  }

  closeBattleSubmitModal();
  await refreshBattlesPage();
}

window.initBattlesPage = async function initBattlesPage() {
  const modal = document.getElementById("battleSubmitModal");
  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeBattleSubmitModal();
      }
    });
  }

  document.querySelectorAll("[data-battle-submit-mode]").forEach((button) => {
    button.addEventListener("click", async () => {
      setBattleSubmitMode(button.dataset.battleSubmitMode);
      if (button.dataset.battleSubmitMode === "profile") {
        try {
          await ensureBattleProfileTracks();
          renderBattleSubmitBody();
        } catch (err) {
          console.error("Battle profile tracks error:", err);
          alert("Не удалось загрузить треки профиля");
        }
      }
    });
  });

  await refreshBattlesPage();
};

window.createBattleBracket = createBattleBracket;
window.archiveCurrentBattle = archiveCurrentBattle;
window.openBattleSubmitModal = openBattleSubmitModal;
window.closeBattleSubmitModal = closeBattleSubmitModal;
window.submitBattleProfileTrack = submitBattleProfileTrack;
