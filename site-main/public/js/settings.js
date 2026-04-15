let currentSettingsArchiveAudio = null;
window.settingsReady = false;
const settingsSavedPostsStorageKey = "savedPostIds";
let settingsCollectiveLogoFile = null;


function settingsGetToken() {
  return localStorage.getItem("token") || "";
}

function settingsEscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setSettingsModalMode(open) {
  document.body.classList.toggle("settings-modal-open", !!open);
}

function settingsSetCollectiveLogoPreview(src, name) {
  const logo = document.getElementById("collectiveLogoPreview");
  const badgeLogo = document.getElementById("collectiveBadgeLogo");
  const placeholder = document.getElementById("collectiveLogoPlaceholder");

  if (logo) {
    logo.src = src || "";
    logo.classList.toggle("settings-hidden", !src);
  }

  if (badgeLogo) {
    badgeLogo.src = src || "";
    badgeLogo.classList.toggle("settings-hidden", !src);
  }

  if (placeholder) {
    placeholder.classList.toggle("settings-hidden", !!src);
    placeholder.textContent = name ? name.slice(0, 1).toUpperCase() : "M";
  }
}

async function loadCollectiveSection() {
  const body = document.getElementById("modalBody");
  if (!body) return;

  settingsCollectiveLogoFile = null;
  body.innerHTML = `<div class="settings-loading-state">Загружаем объединение...</div>`;

  try {
    const res = await fetch("/api/settings/collective", {
      headers: {
        Authorization: "Bearer " + settingsGetToken()
      }
    });

    if (!res.ok) {
      body.innerHTML = `<div class="settings-empty-state">Не удалось загрузить раздел объединения.</div>`;
      return;
    }

    const data = await res.json();
    const collective = data?.collective || null;
    const collectiveName = String(collective?.name || "").trim();
    const collectiveLogo = String(collective?.logo_url || "").trim();
    const canCreate = Boolean(data?.canCreate || collective);

    body.innerHTML = `
      <div class="settings-collective-panel">
        <div class="settings-collective-hero">
          <label class="settings-collective-logo-picker">
            <input id="collectiveLogoInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
            <div class="settings-collective-logo-shell">
              <img
                id="collectiveLogoPreview"
                class="settings-collective-logo-preview ${collectiveLogo ? "" : "settings-hidden"}"
                src="${settingsEscapeHtml(collectiveLogo)}"
                alt=""
              >
              <div
                id="collectiveLogoPlaceholder"
                class="settings-collective-logo-placeholder ${collectiveLogo ? "settings-hidden" : ""}"
              >
                ${settingsEscapeHtml((collectiveName || "M").slice(0, 1).toUpperCase())}
              </div>
              <div class="settings-collective-logo-overlay">
                <i class="fa-solid fa-image"></i>
                <span>${collectiveLogo ? "Сменить логотип" : "Выбрать логотип"}</span>
              </div>
            </div>
          </label>

          <div class="settings-collective-copy">
            <div class="settings-collective-kicker">Музыкальное объединение</div>
            <h3 class="settings-collective-title">${collective ? "Настрой своё объединение" : "Создай своё объединение"}</h3>
            <p class="settings-collective-text">
              Здесь позже будет каталог муз. объединений. Пока ты можешь создать своё, загрузить PNG-логотип и получить красивый бэдж возле ника.
            </p>
          </div>
        </div>

        <div class="settings-collective-preview-card">
          <div class="settings-collective-preview-label">Как это будет выглядеть возле ника</div>
          <div class="settings-collective-badge-preview">
            <img
              id="collectiveBadgeLogo"
              class="settings-collective-badge-logo ${collectiveLogo ? "" : "settings-hidden"}"
              src="${settingsEscapeHtml(collectiveLogo)}"
              alt=""
            >
            <span id="collectiveBadgeName" class="settings-collective-badge-name">
              ${settingsEscapeHtml(collectiveName || "Твоё объединение")}
            </span>
          </div>
        </div>

        <div class="settings-collective-fields">
          <label class="settings-collective-field">
            <span>Название объединения</span>
            <input
              id="collectiveName"
              class="settings-collective-input"
              type="text"
              maxlength="80"
              placeholder="Например, NIGHTDISTRICT"
              value="${settingsEscapeHtml(collectiveName)}"
              ${canCreate ? "" : "disabled"}
            >
          </label>
        </div>

        <div class="settings-collective-actions">
          <button
            type="button"
            class="settings-collective-save"
            onclick="saveCollectiveSettings()"
            ${canCreate ? "" : "disabled"}
          >
            ${collective ? "Сохранить изменения" : "Создать объединение"}
          </button>
        </div>

        ${canCreate ? "" : `<div class="settings-empty-state">Сейчас создать объединение нельзя для этого аккаунта.</div>`}

        <p id="collectiveError" class="privacy-error"></p>
        <p id="collectiveSuccess" class="privacy-success"></p>
      </div>
    `;

    const logoInput = document.getElementById("collectiveLogoInput");
    const nameInput = document.getElementById("collectiveName");
    const badgeName = document.getElementById("collectiveBadgeName");

    if (logoInput) {
      logoInput.addEventListener("change", (event) => {
        const file = event.target?.files?.[0] || null;
        if (!file) return;
        settingsCollectiveLogoFile = file;
        settingsSetCollectiveLogoPreview(URL.createObjectURL(file), nameInput?.value?.trim() || collectiveName || "M");
      });
    }

    if (nameInput && badgeName) {
      nameInput.addEventListener("input", () => {
        const value = nameInput.value.trim();
        badgeName.textContent = value || "Твоё объединение";
        const placeholder = document.getElementById("collectiveLogoPlaceholder");
        if (placeholder && !document.getElementById("collectiveLogoPreview")?.getAttribute("src")) {
          placeholder.textContent = (value || "M").slice(0, 1).toUpperCase();
        }
      });
    }
  } catch (error) {
    console.error("loadCollectiveSection error:", error);
    body.innerHTML = `<div class="settings-empty-state">Не удалось загрузить раздел объединения.</div>`;
  }
}

async function saveCollectiveSettings() {
  const nameInput = document.getElementById("collectiveName");
  const errorEl = document.getElementById("collectiveError");
  const successEl = document.getElementById("collectiveSuccess");
  const saveBtn = document.querySelector(".settings-collective-save");

  if (errorEl) errorEl.textContent = "";
  if (successEl) successEl.textContent = "";

  const name = String(nameInput?.value || "").trim();

  if (name.length < 2) {
    if (errorEl) errorEl.textContent = "Название объединения должно быть не короче 2 символов.";
    return;
  }

  const formData = new FormData();
  formData.append("name", name);
  if (settingsCollectiveLogoFile) {
    formData.append("logo", settingsCollectiveLogoFile);
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Сохраняем...";
  }

  try {
    const res = await fetch("/api/settings/collective", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + settingsGetToken()
      },
      body: formData
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const code = String(data?.error || "");
      const message =
        code === "collective_name_taken" ? "Такое название объединения уже занято." :
        code === "collective_name_too_long" ? "Название объединения слишком длинное." :
        code === "invalid_collective_logo" ? "Логотип должен быть обычной картинкой PNG/JPG/WEBP." :
        "Не удалось сохранить объединение.";

      if (errorEl) errorEl.textContent = message;
      return;
    }

    settingsCollectiveLogoFile = null;
    if (successEl) {
      successEl.textContent = data?.collective ? "Объединение сохранено." : "Объединение создано.";
    }

    await loadCollectiveSection();

    const collectiveSuccess = document.getElementById("collectiveSuccess");
    if (collectiveSuccess) {
      collectiveSuccess.textContent = "Объединение сохранено.";
    }
  } catch (error) {
    console.error("saveCollectiveSettings error:", error);
    if (errorEl) errorEl.textContent = "Не удалось сохранить объединение.";
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Сохранить изменения";
    }
  }
}

function settingsGetSavedPostIds() {
  try {
    const raw = localStorage.getItem(settingsSavedPostsStorageKey);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed)
      ? parsed.map((id) => Number(id)).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function settingsFormatPostDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function settingsRenderPostMedia(post) {
  if (post.media_url) {
    if (post.media_type === "video") {
      return `<video src="${settingsEscapeHtml(post.media_url)}" class="settings-saved-post-media" muted preload="metadata"></video>`;
    }

    return `<img src="${settingsEscapeHtml(post.media_url)}" class="settings-saved-post-media" alt="">`;
  }

  return `
    <div class="settings-saved-post-text-only">
      <i class="fa-regular fa-file-lines"></i>
      <span>Текстовый пост</span>
    </div>
  `;
}

function settingsRenderPostSnippet(post) {
  const content = String(post.content || "").trim();
  if (!content) {
    return "Без описания";
  }

  return settingsEscapeHtml(content.length > 160 ? `${content.slice(0, 157)}...` : content);
}

function settingsRenderPostsCollection(posts, emptyText) {
  if (!Array.isArray(posts) || !posts.length) {
    return `<div class="settings-empty-state">${emptyText}</div>`;
  }

  return `
    <div class="settings-saved-posts-grid">
      ${posts.map((post) => `
        <button
          type="button"
          class="settings-saved-post-card"
          onclick='openPost(${JSON.stringify(post).replace(/'/g, "&apos;")})'
        >
          <div class="settings-saved-post-cover">
            ${settingsRenderPostMedia(post)}
          </div>

          <div class="settings-saved-post-body">
            <div class="settings-saved-post-head">
              <img
                src="${settingsEscapeHtml(post.avatar || "/images/default-avatar.jpg")}"
                class="settings-saved-post-avatar"
                alt=""
              >

              <div class="settings-saved-post-meta">
                <div class="settings-saved-post-username">${settingsEscapeHtml(post.username || "Пользователь")}</div>
                <div class="settings-saved-post-date">${settingsFormatPostDate(post.created_at)}</div>
              </div>
            </div>

            <div class="settings-saved-post-text">${settingsRenderPostSnippet(post)}</div>

            <div class="settings-saved-post-stats">
              <span><i class="fa-regular fa-heart"></i>${Number(post.likes_count || 0)}</span>
              <span><i class="fa-regular fa-comment-dots"></i>${Number(post.comments_count || 0)}</span>
              <span><i class="fa-regular fa-eye"></i>${Number(post.views_count || 0)}</span>
            </div>
          </div>
        </button>
      `).join("")}
    </div>
  `;
}

async function loadSavedPosts() {
  const body = document.getElementById("modalBody");
  if (!body) return;

  const savedIds = settingsGetSavedPostIds();
  if (!savedIds.length) {
    body.innerHTML = `<div class="settings-empty-state">Ты пока ничего не сохранял.</div>`;
    return;
  }

  body.innerHTML = `<div class="settings-loading-state">Загрузка...</div>`;

  try {
    const res = await fetch(`/api/settings/saved-posts?ids=${encodeURIComponent(savedIds.join(","))}`, {
      headers: {
        Authorization: "Bearer " + settingsGetToken()
      }
    });

    if (!res.ok) {
      throw new Error("saved_posts_failed");
    }

    const posts = await res.json();
    body.innerHTML = settingsRenderPostsCollection(posts, "Сохранённые посты пока пусты.");
  } catch (err) {
    console.log("loadSavedPosts error:", err);
    body.innerHTML = `<div class="settings-empty-state">Не удалось загрузить сохранённые посты.</div>`;
  }
}

async function loadLikedPosts() {
  const body = document.getElementById("modalBody");
  if (!body) return;

  body.innerHTML = `<div class="settings-loading-state">Загрузка...</div>`;

  try {
    const res = await fetch("/api/settings/liked-posts", {
      headers: {
        Authorization: "Bearer " + settingsGetToken()
      }
    });

    if (!res.ok) {
      throw new Error("liked_posts_failed");
    }

    const posts = await res.json();
    body.innerHTML = settingsRenderPostsCollection(posts, "Ты пока не лайкал публикации.");
  } catch (err) {
    console.log("loadLikedPosts error:", err);
    body.innerHTML = `<div class="settings-empty-state">Не удалось загрузить лайки.</div>`;
  }
}

async function loadCommunicationSection() {
  const body = document.getElementById("modalBody");
  if (!body) return;

  body.innerHTML = `<div class="settings-loading-state">Загрузка...</div>`;

  try {
    const res = await fetch("/api/settings/communication", {
      headers: {
        Authorization: "Bearer " + settingsGetToken()
      }
    });

    if (!res.ok) {
      throw new Error("communication_settings_failed");
    }

    const data = await res.json();
    body.innerHTML = `
      <div class="settings-communication-panel">
        <div class="settings-communication-card">
          <div>
            <div class="settings-communication-title">Уведомления</div>
            <div class="settings-communication-text">Лайки, репосты, подписки и другие события в колокольчике.</div>
          </div>
          <label class="settings-switch">
            <input id="settingsNotificationsEnabled" type="checkbox" ${data.notifications_enabled !== false ? "checked" : ""}>
            <span class="settings-switch-slider"></span>
          </label>
        </div>

        <div class="settings-communication-card">
          <div>
            <div class="settings-communication-title">Личные сообщения</div>
            <div class="settings-communication-text">Если выключить, тебе не смогут писать новые сообщения.</div>
          </div>
          <label class="settings-switch">
            <input id="settingsDmsEnabled" type="checkbox" ${data.dms_enabled !== false ? "checked" : ""}>
            <span class="settings-switch-slider"></span>
          </label>
        </div>

        <div class="settings-communication-note">
          Для конкретного человека уведомления и сообщения можно отключить прямо в нужном диалоге.
        </div>

        <div class="settings-communication-actions">
          <button type="button" class="privacy-btn" onclick="saveCommunicationSettings()">Сохранить</button>
        </div>
        <p id="communicationSettingsError" class="privacy-error"></p>
        <p id="communicationSettingsSuccess" class="privacy-success"></p>
      </div>
    `;
  } catch (err) {
    console.log("loadCommunicationSection error:", err);
    body.innerHTML = `<div class="settings-empty-state">Не удалось загрузить настройки сообщений.</div>`;
  }
}

async function saveCommunicationSettings() {
  const notificationsEnabled = !!document.getElementById("settingsNotificationsEnabled")?.checked;
  const dmsEnabled = !!document.getElementById("settingsDmsEnabled")?.checked;
  const error = document.getElementById("communicationSettingsError");
  const success = document.getElementById("communicationSettingsSuccess");

  if (error) error.innerText = "";
  if (success) success.innerText = "";

  try {
    const res = await fetch("/api/settings/communication", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + settingsGetToken()
      },
      body: JSON.stringify({ notificationsEnabled, dmsEnabled })
    });

    if (!res.ok) {
      throw new Error("communication_settings_save_failed");
    }

    if (success) success.innerText = "Настройки сохранены.";
    await window.loadNavbarNotifications?.();
    await window.loadNavbarMessagesBadge?.();
  } catch (err) {
    console.log("saveCommunicationSettings error:", err);
    if (error) error.innerText = "Не удалось сохранить настройки.";
  }
}

async function loadDeleteAccountSection() {
  const body = document.getElementById("modalBody");
  if (!body) return;

  body.innerHTML = `<div class="settings-loading-state">Загрузка...</div>`;

  try {
    const res = await fetch("/me?ts=" + Date.now(), {
      headers: {
        Authorization: "Bearer " + settingsGetToken()
      }
    });

    if (!res.ok) {
      throw new Error("delete_account_me_failed");
    }

    const user = await res.json();
    const hasEmail = !!String(user.email || "").trim();

    body.innerHTML = `
      <div class="settings-danger-panel">
        <div class="settings-danger-icon">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <div class="settings-danger-title">Удаление аккаунта</div>
        <div class="settings-danger-text">
          После удаления аккаунта восстановить профиль, посты и треки уже не получится.
        </div>

        ${
          hasEmail
            ? `
              <div class="settings-danger-email">Код подтверждения придёт на: <strong>${settingsEscapeHtml(user.email)}</strong></div>
              <div class="settings-danger-actions">
                <button type="button" class="privacy-btn settings-danger-send-btn" onclick="sendDeleteAccountCode()">
                  Отправить код
                </button>
              </div>

              <div id="deleteAccountCodeBlock" class="settings-danger-code-block" style="display:none;">
                <input id="deleteAccountCode" class="privacy-input" placeholder="Код из письма" inputmode="numeric" maxlength="6">
                <button type="button" class="settings-danger-delete-btn" onclick="confirmDeleteAccountByCode()">
                  Удалить аккаунт
                </button>
              </div>
            `
            : `
              <div class="settings-danger-text">
                Почта не привязана. Удаление будет подтверждаться сразу.
              </div>
              <div class="settings-danger-actions">
                <button type="button" class="settings-danger-delete-btn" onclick="deleteAccountWithoutEmail()">
                  Удалить аккаунт
                </button>
              </div>
            `
        }

        <p id="deleteAccountError" class="privacy-error"></p>
        <p id="deleteAccountSuccess" class="privacy-success"></p>
      </div>
    `;
  } catch (err) {
    console.log("loadDeleteAccountSection error:", err);
    body.innerHTML = `<div class="settings-empty-state">Не удалось загрузить удаление аккаунта.</div>`;
  }
}

async function sendDeleteAccountCode() {
  const error = document.getElementById("deleteAccountError");
  const success = document.getElementById("deleteAccountSuccess");
  const block = document.getElementById("deleteAccountCodeBlock");

  if (error) error.innerText = "";
  if (success) success.innerText = "";

  try {
    const res = await fetch("/delete-account-send-code", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + settingsGetToken()
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "delete_account_code_send_failed");
    }

    if (block) block.style.display = "grid";
    if (success) success.innerText = "Код отправлен на почту.";
  } catch (err) {
    console.log("sendDeleteAccountCode error:", err);
    if (error) error.innerText = "Не удалось отправить код.";
  }
}

async function confirmDeleteAccountByCode() {
  const code = document.getElementById("deleteAccountCode")?.value.trim();
  const error = document.getElementById("deleteAccountError");
  const success = document.getElementById("deleteAccountSuccess");

  if (error) error.innerText = "";
  if (success) success.innerText = "";

  if (!code) {
    if (error) error.innerText = "Введи код из письма.";
    return;
  }

  const confirmed = typeof window.showAppConfirm === "function"
    ? await window.showAppConfirm({
        title: "Удалить аккаунт",
        text: "Это действие необратимо. Профиль, треки и публикации будут удалены.",
        confirmText: "Удалить",
        cancelText: "Отмена",
        danger: true
      })
    : window.confirm("Точно удалить аккаунт? Это действие необратимо.");
  if (!confirmed) return;

  try {
    const res = await fetch("/delete-account-confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + settingsGetToken()
      },
      body: JSON.stringify({ code })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (error) error.innerText = data.error === "Wrong code"
        ? "Неверный код."
        : "Не удалось удалить аккаунт.";
      return;
    }

    if (success) success.innerText = "Аккаунт удалён.";
    await performSettingsLogoutAfterDelete();
  } catch (err) {
    console.log("confirmDeleteAccountByCode error:", err);
    if (error) error.innerText = "Не удалось удалить аккаунт.";
  }
}

async function deleteAccountWithoutEmail() {
  const error = document.getElementById("deleteAccountError");
  const success = document.getElementById("deleteAccountSuccess");

  if (error) error.innerText = "";
  if (success) success.innerText = "";

  const confirmed = typeof window.showAppConfirm === "function"
    ? await window.showAppConfirm({
        title: "Удалить аккаунт",
        text: "Почта не привязана, поэтому удаление подтвердится сразу. Это действие необратимо.",
        confirmText: "Удалить",
        cancelText: "Отмена",
        danger: true
      })
    : window.confirm("Удалить аккаунт без возможности восстановления?");
  if (!confirmed) return;

  try {
    const res = await fetch("/delete-account-confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + settingsGetToken()
      },
      body: JSON.stringify({ confirm: true })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "delete_account_failed");
    }

    if (success) success.innerText = "Аккаунт удалён.";
    await performSettingsLogoutAfterDelete();
  } catch (err) {
    console.log("deleteAccountWithoutEmail error:", err);
    if (error) error.innerText = "Не удалось удалить аккаунт.";
  }
}

async function performSettingsLogoutAfterDelete() {
  localStorage.removeItem("token");
  localStorage.removeItem("userAvatar");
  window.currentUser = null;
  if (typeof window.loadNavbarUser === "function") {
    await window.loadNavbarUser();
  }
  navigate("/");
}

async function openSettingsSection(type) {
  
  const modal = document.getElementById("settingsModal");
  const title = document.getElementById("modalTitle");
  const body = document.getElementById("modalBody");

  if (!modal || !title || !body) return;

  setSettingsModalMode(true);
  modal.style.display = "flex";

if (type === "archive") {
  title.innerText = "Архив";

  body.innerHTML = `
    <div class="settings-archive-tabs">
      <button class="settings-archive-tab settings-archive-tab-active" onclick="switchArchiveTab(event, 'posts')">
        Посты
      </button>

      <button class="settings-archive-tab" onclick="switchArchiveTab(event, 'tracks')">
        Треки
      </button>
    </div>

    <div id="archiveContent">
      Загрузка...
    </div>
  `;

  // 💣 ВАЖНО: НЕ requestAnimationFrame
  setTimeout(() => {
    const container = document.getElementById("archiveContent");

    if (!container) {
      console.log("❌ archiveContent STILL not found");
      return;
    }

    setTimeout(() => {
  if (!window.settingsReady) {
    console.log("⛔ settings not ready yet");
    return;
  }

  loadArchivePosts();
}, 100);
  }, 0);

  return;
}

  if (type === "privacy") {
    title.innerText = "Конфиденциальность";

    try {
      const token = settingsGetToken();

      const res = await fetch("/me?ts=" + Date.now(), {
        headers: {
          Authorization: "Bearer " + token
        }
      });

      if (!res.ok) {
        body.innerHTML = `<p>Не удалось загрузить настройки конфиденциальности</p>`;
        return;
      }

      const user = await res.json();
      const hasPassword = Boolean(user?.has_password);
      const currentEmail = String(user?.email || "").trim();

        body.innerHTML = `
<div class="privacy-section">

  <div class="privacy-block">
    <div class="privacy-title">🔐 ${hasPassword ? "Смена пароля" : "Установка пароля"}</div>

    ${
      hasPassword
        ? `
    <div class="privacy-row privacy-row-inputs">
  <input id="currentPassword" type="password" placeholder="Текущий пароль" class="privacy-input">
  <input id="newPassword" type="password" placeholder="Новый пароль" class="privacy-input">
  <input id="newPassword2" type="password" placeholder="Повторите пароль" class="privacy-input">
</div>

<div class="privacy-row privacy-row-btn">
  <button onclick="changePassword()" class="privacy-btn">
    Сменить пароль
  </button>
</div>
        `
        : `
    <div class="privacy-info">
      У этого аккаунта пока нет пароля. Задай его один раз, и потом сможешь входить не только через Telegram.
    </div>

    <div class="privacy-row privacy-row-inputs">
      <input id="newPassword" type="password" placeholder="Новый пароль" class="privacy-input">
      <input id="newPassword2" type="password" placeholder="Повторите пароль" class="privacy-input">
    </div>

    <div class="privacy-row privacy-row-btn">
      <button onclick="setPassword()" class="privacy-btn">
        Установить пароль
      </button>
    </div>
        `
    }

    <p id="passwordError" class="privacy-error"></p>
    <p id="passwordSuccess" class="privacy-success"></p>
  </div>


  <div class="privacy-block">
    <div class="privacy-title">📧 Смена почты</div>

    <div class="privacy-info">
      Текущая почта: ${currentEmail || "не привязана"}
    </div>

    <div class="privacy-row">
      <input id="newEmail" type="email" placeholder="Новая почта" class="privacy-input">
      <button onclick="sendEmailCode()" class="privacy-btn">
        Отправить код
      </button>
    </div>

    <div id="emailCodeBlock" style="display:none; margin-top:10px;">
      <input id="emailCode" placeholder="Код" class="privacy-input">

      <button onclick="confirmEmailChange()" class="privacy-btn" style="margin-top:10px;">
        Подтвердить
      </button>
    </div>

    <p id="emailError" class="privacy-error"></p>
    <p id="emailSuccess" class="privacy-success"></p>
  </div>

</div>
`;
      
    } catch (err) {
      console.log("openSettings privacy error:", err);
      body.innerHTML = `<p>Ошибка загрузки</p>`;
    }

    return;
  }

  if (type === "saved") {
    title.innerText = "Сохранённые";
    loadSavedPosts();
    return;
  }

  if (type === "likes") {
    title.innerText = "Лайки";
    loadLikedPosts();
    return;
  }

  if (type === "communication") {
    title.innerText = "Сообщения и уведомления";
    loadCommunicationSection();
    return;
  }

  if (type === "collective") {
    title.innerText = "Объединение";
    loadCollectiveSection();
    return;
  }

  if (type === "delete-account") {
    title.innerText = "Удалить аккаунт";
    loadDeleteAccountSection();
  }
}

function closeSettingsSection() {
  const modal = document.getElementById("settingsModal");
  const body = document.getElementById("modalBody");
  const title = document.getElementById("modalTitle");

  if (modal) modal.style.display = "none";
  if (body) body.innerHTML = "Контент";
  if (title) title.innerText = "Заголовок";
  setSettingsModalMode(false);
}

async function changePassword() {
  const token = settingsGetToken();

  const currentPassword = document.getElementById("currentPassword")?.value.trim();
  const newPassword = document.getElementById("newPassword")?.value.trim();
  const newPassword2 = document.getElementById("newPassword2")?.value.trim();

  const passwordError = document.getElementById("passwordError");
  const passwordSuccess = document.getElementById("passwordSuccess");

  if (passwordError) passwordError.innerText = "";
  if (passwordSuccess) passwordSuccess.innerText = "";

  if (!currentPassword) {
    if (passwordError) passwordError.innerText = "Введи текущий пароль";
    return;
  }

  if (!newPassword) {
    if (passwordError) passwordError.innerText = "Введи новый пароль";
    return;
  }

  if (newPassword.length < 8) {
    if (passwordError) passwordError.innerText = "Новый пароль должен быть минимум 8 символов";
    return;
  }

  if (newPassword !== newPassword2) {
    if (passwordError) passwordError.innerText = "Пароли не совпадают";
    return;
  }

  try {
    const res = await fetch("/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({
        currentPassword,
        newPassword
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (passwordError) {
        passwordError.innerText = window.getApiErrorMessage?.(
          data,
          data.error === "Wrong password"
            ? "Неверный текущий пароль"
            : data.error === "No password set"
              ? "У этого аккаунта пока нет пароля. Сначала установи его."
              : "Ошибка смены пароля"
        ) || "Ошибка смены пароля";
      }
      return;
    }

    if (passwordSuccess) passwordSuccess.innerText = "Пароль изменён";

    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("newPassword2").value = "";
  } catch (err) {
    console.log("changePassword error:", err);
    if (passwordError) passwordError.innerText = "Ошибка смены пароля";
  }
}

async function sendEmailCode() {
  const newEmail = document.getElementById("newEmail")?.value.trim();

  const emailError = document.getElementById("emailError");
  const emailSuccess = document.getElementById("emailSuccess");

  if (emailError) emailError.innerText = "";
  if (emailSuccess) emailSuccess.innerText = "";

  if (!newEmail) {
    if (emailError) emailError.innerText = "Введи новую почту";
    return;
  }

  if (!newEmail.includes("@")) {
    if (emailError) emailError.innerText = "Неверный формат почты";
    return;
  }

  try {
    const res = await fetch("/change-email-send-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + settingsGetToken()
      },
      body: JSON.stringify({ newEmail })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (emailError) {
        emailError.innerText = window.getApiErrorMessage?.(data, "Не удалось отправить код") || "Не удалось отправить код";
      }
      return;
    }

    const block = document.getElementById("emailCodeBlock");
    if (block) block.style.display = "block";

    if (emailSuccess) emailSuccess.innerText = "Код отправлен на почту";
  } catch (err) {
    console.log("sendEmailCode error:", err);
    if (emailError) emailError.innerText = "Не удалось отправить код";
  }
}

async function confirmEmailChange() {
  const token = settingsGetToken();

  const newEmail = document.getElementById("newEmail")?.value.trim();
  const code = document.getElementById("emailCode")?.value.trim();

  const emailError = document.getElementById("emailError");
  const emailSuccess = document.getElementById("emailSuccess");

  if (emailError) emailError.innerText = "";
  if (emailSuccess) emailSuccess.innerText = "";

  if (!newEmail) {
    if (emailError) emailError.innerText = "Введи новую почту";
    return;
  }

  if (!code) {
    if (emailError) emailError.innerText = "Введи код из письма";
    return;
  }

  try {
    const res = await fetch("/change-email-confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({
        newEmail,
        code
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (emailError) {
        emailError.innerText = window.getApiErrorMessage?.(data, "Не удалось изменить почту") || "Не удалось изменить почту";
      }
      return;
    }

    if (emailSuccess) emailSuccess.innerText = "Почта изменена";

    document.getElementById("newEmail").value = "";
    document.getElementById("emailCode").value = "";

    const block = document.getElementById("emailCodeBlock");
    if (block) block.style.display = "none";
  } catch (err) {
    console.log("confirmEmailChange error:", err);
    if (emailError) emailError.innerText = "Не удалось изменить почту";
  }
}

async function setPassword() {
  const token = settingsGetToken();

  const pass1 = document.getElementById("newPassword")?.value.trim();
  const pass2 = document.getElementById("newPassword2")?.value.trim();

  const error = document.getElementById("passwordError");
  const success = document.getElementById("passwordSuccess");
  if (error) error.innerText = "";
  if (success) success.innerText = "";

  if (!pass1) {
    if (error) error.innerText = "Введи пароль";
    return;
  }

  if (pass1.length < 8) {
    if (error) error.innerText = "Пароль должен быть минимум 8 символов";
    return;
  }

  if (pass1 !== pass2) {
    if (error) error.innerText = "Пароли не совпадают";
    return;
  }

  try {
    const res = await fetch("/set-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({
        password: pass1
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (error) error.innerText = data.error === "Нет пароля"
        ? "Введи пароль"
        : data.error === "password_too_short"
          ? "Пароль должен быть минимум 8 символов"
          : data.error === "password_already_set"
            ? "Пароль уже установлен. Используй смену пароля."
            : "Не удалось установить пароль";
      return;
    }

    if (success) success.innerText = "Пароль установлен";

    const newPassword = document.getElementById("newPassword");
    const newPassword2 = document.getElementById("newPassword2");
    if (newPassword) newPassword.value = "";
    if (newPassword2) newPassword2.value = "";

    setTimeout(() => {
      openSettingsSection("privacy");
    }, 300);
  } catch (err) {
    console.log("setPassword error:", err);
    if (error) error.innerText = "Не удалось установить пароль";
  }
}

async function loadArchivePosts() {
  console.log("🔥 loadArchivePosts called");
  const token = settingsGetToken();
  const container = document.getElementById("archiveContent");

  if (!container) return;

  container.innerHTML = "Загрузка...";

  try {
    const res = await fetch("/archived-posts", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) {
      throw new Error("archived-posts failed");
    }

    const posts = await res.json();

    if (!posts.length) {
      container.innerHTML = "<p>Архив постов пуст</p>";
      return;
    }

    container.innerHTML = `
    <h3 class="archive-title">Посты</h3>
      <div class="settings-archive-grid">
        ${posts.map((p) => {
          const date = new Date(p.created_at);
          const formattedDate = date.toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "short",
            year: "numeric"
          });

          return `
            <div class="settings-archive-card" onclick='openPost(${JSON.stringify(p).replace(/'/g, "&apos;")})'>
              ${p.media_url ? `
                ${
                  p.media_type === "image"
                    ? `<img src="${settingsEscapeHtml(p.media_url)}" alt="">`
                    : `<video src="${settingsEscapeHtml(p.media_url)}" muted></video>`
                }
              ` : `<div class="settings-no-media">Текст</div>`}

              <div class="settings-archive-overlay">
                <div class="settings-archive-date">${formattedDate}</div>

                <button onclick="event.stopPropagation(); unarchivePost(${Number(p.id)})">
                  Вернуть
                </button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  } catch (err) {
    console.log("loadArchivePosts error:", err);
    container.innerHTML = "Ошибка загрузки";
  }
}

async function unarchivePost(id) {
  const token = settingsGetToken();

  await fetch(`/archive-post/${id}`, {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + token
    }
  });

  loadArchivePosts();
}
function setViewPostMode(open) {
  document.body.classList.toggle("view-post-open", open);
}

function openPost(post) {
  const modal = document.getElementById("viewPostModal");
  const body = document.getElementById("viewPostBody");

  if (!modal || !body) return;

  setViewPostMode(true);
  setSettingsModalMode(true);
  modal.style.display = "flex";

  body.innerHTML = `
    <div class="view-post-wrapper">
     

      <div class="view-post">
        <div class="view-post-header">
          <img
            src="${settingsEscapeHtml(post.avatar || "/images/default-avatar.jpg")}"
            class="view-post-avatar"
            alt=""
          >
          <div class="view-post-username">${settingsEscapeHtml(post.username || "")}</div>
        </div>

        ${
          post.media_url
            ? post.media_type === "image"
              ? `<img src="${settingsEscapeHtml(post.media_url)}" class="view-post-media" alt="">`
              : `<video src="${settingsEscapeHtml(post.media_url)}" controls class="view-post-media"></video>`
            : ""
        }

        ${
          post.content
            ? `<div class="view-post-description">${settingsEscapeHtml(post.content)}</div>`
            : ""
        }

        <div class="view-post-date">
          ${post.created_at ? new Date(post.created_at).toLocaleString("ru-RU") : ""}
        </div>
      </div>
    </div>
  `;
}

function closeViewPost() {
  const modal = document.getElementById("viewPostModal");
  const body = document.getElementById("viewPostBody");

  if (modal) modal.style.display = "none";
  if (body) body.innerHTML = "";

  setViewPostMode(false);
  const settingsModal = document.getElementById("settingsModal");
  setSettingsModalMode(Boolean(settingsModal && settingsModal.style.display === "flex"));
}

function switchArchiveTab(e, type) {
  document.querySelectorAll(".settings-archive-tab").forEach((btn) => {
    btn.classList.remove("settings-archive-tab-active");
  });

  e.currentTarget.classList.add("settings-archive-tab-active");

  if (type === "posts") {
    loadArchivePosts();
  } else {
    loadArchiveTracks();
  }
}

async function loadArchiveTracks() {
  const token = settingsGetToken();
  const container = document.getElementById("archiveContent");
  if (!container) return;

  container.innerHTML = "Загрузка...";

  try {
    const res = await fetch("/archived-tracks", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) {
      throw new Error("archived-tracks failed");
    }

    const tracks = await res.json();

    if (!tracks.length) {
      container.innerHTML = "<p>Архив треков пуст</p>";
      return;
    }

    container.innerHTML = `
    <h3 class="archive-title">Треки</h3>
      <div class="settings-archive-tracks">
        ${tracks.map((t) => `
          <div class="settings-archive-track">
            <img
              src="${settingsEscapeHtml(t.cover || "/images/default-cover.jpg")}"
              class="settings-archive-track-cover"
              alt=""
            >

            <div class="settings-archive-track-info">
              <div class="settings-archive-track-title">${settingsEscapeHtml(t.title || "Без названия")}</div>
              <div class="settings-archive-track-artist">${settingsEscapeHtml(t.artist || "Unknown")}</div>

              <div class="settings-track-player" data-id="${Number(t.id)}">
                <button class="settings-play-btn" onclick="toggleArchiveTrack(${Number(t.id)})">
                  ▶
                </button>

                <div class="settings-track-progress" onclick="seekTrack(event, ${Number(t.id)})">
                  <div class="settings-track-progress-fill" id="progress-${Number(t.id)}"></div>
                </div>

                <span class="settings-track-time" id="time-${Number(t.id)}">0:00</span>

                <div class="settings-volume">
                  <button onclick="toggleMute(${Number(t.id)})" class="settings-volume-btn" id="volbtn-${Number(t.id)}">
                    🔊
                  </button>

                  <div class="settings-volume-slider" onclick="setVolume(event, ${Number(t.id)})">
                    <div class="settings-volume-fill" id="volume-${Number(t.id)}"></div>
                  </div>
                </div>

                <audio id="audio-${Number(t.id)}" src="${settingsEscapeHtml(t.audio || "")}"></audio>
              </div>
            </div>

            <div class="settings-archive-track-actions">
              <button class="settings-archive-restore-btn" onclick="unarchiveTrack(${Number(t.id)})">
                Вернуть
              </button>

              <button class="settings-archive-delete-btn" onclick="deleteArchiveTrack(${Number(t.id)})">
                Удалить
              </button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (err) {
    console.log("loadArchiveTracks error:", err);
    container.innerHTML = "Ошибка загрузки";
  }
}

async function unarchiveTrack(id) {
  const token = settingsGetToken();

  await fetch(`/archive-track/${id}`, {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + token
    }
  });

  loadArchiveTracks();
}

function toggleArchiveTrack(id) {
  const audio = document.getElementById(`audio-${id}`);
  const btn = document.querySelector(`[data-id="${id}"] .settings-play-btn`);
  if (!audio || !btn) return;

  if (currentSettingsArchiveAudio && currentSettingsArchiveAudio !== audio) {
    currentSettingsArchiveAudio.pause();
    document.querySelectorAll(".settings-play-btn").forEach((b) => {
      b.innerText = "▶";
    });
  }

  if (audio.paused) {
    audio.play();
    btn.innerText = "⏸";
    currentSettingsArchiveAudio = audio;
  } else {
    audio.pause();
    btn.innerText = "▶";
  }

  audio.ontimeupdate = () => {
    const progress = document.getElementById(`progress-${id}`);
    const time = document.getElementById(`time-${id}`);
    if (!progress || !time) return;

    const percent = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    progress.style.width = percent + "%";
    time.innerText = formatTime(audio.currentTime);
  };

  audio.onended = () => {
    btn.innerText = "▶";
    const progress = document.getElementById(`progress-${id}`);
    const time = document.getElementById(`time-${id}`);
    if (progress) progress.style.width = "0%";
    if (time) time.innerText = "0:00";
  };
}

function formatTime(sec) {
  if (!sec || !Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" + s : s}`;
}

function setVolume(e, id) {
  const slider = e.currentTarget;
  const audio = document.getElementById(`audio-${id}`);
  const fill = document.getElementById(`volume-${id}`);
  if (!slider || !audio || !fill) return;

  const rect = slider.getBoundingClientRect();
  const percent = (e.clientX - rect.left) / rect.width;

  audio.volume = Math.max(0, Math.min(1, percent));
  fill.style.width = (audio.volume * 100) + "%";
  settingsVolumeMemory[id] = audio.volume;

  const btn = document.getElementById(`volbtn-${id}`);
  if (btn) btn.innerText = audio.volume > 0 ? "🔊" : "🔇";
}

function toggleMute(id) {
  const audio = document.getElementById(`audio-${id}`);
  const btn = document.getElementById(`volbtn-${id}`);
  const fill = document.getElementById(`volume-${id}`);
  if (!audio || !btn || !fill) return;

  if (audio.volume > 0) {
    settingsVolumeMemory[id] = audio.volume;
    audio.volume = 0;
    btn.innerText = "🔇";
  } else {
    audio.volume = settingsVolumeMemory[id] || 0.7;
    btn.innerText = "🔊";
  }

  fill.style.width = (audio.volume * 100) + "%";
}

function seekTrack(e, id) {
  const bar = e.currentTarget;
  const audio = document.getElementById(`audio-${id}`);
  if (!bar || !audio || !audio.duration) return;

  const rect = bar.getBoundingClientRect();
  const percent = (e.clientX - rect.left) / rect.width;
  audio.currentTime = Math.max(0, Math.min(audio.duration, percent * audio.duration));
}

async function deleteArchiveTrack(id) {
  const ok = confirm("Удалить трек навсегда?");
  if (!ok) return;

  const res = await fetch(`/delete-track/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: "Bearer " + settingsGetToken()
    }
  });

  if (!res.ok) {
    alert("Ошибка удаления");
    return;
  }

  loadArchiveTracks();
}

window.openSettingsSection = openSettingsSection;
window.closeSettingsSection = closeSettingsSection;
window.changePassword = changePassword;
window.sendEmailCode = sendEmailCode;
window.confirmEmailChange = confirmEmailChange;
window.setPassword = setPassword;
window.loadArchivePosts = loadArchivePosts;
window.unarchivePost = unarchivePost;
window.openPost = openPost;
window.closeViewPost = closeViewPost;
window.switchArchiveTab = switchArchiveTab;
window.loadArchiveTracks = loadArchiveTracks;
window.unarchiveTrack = unarchiveTrack;
window.toggleArchiveTrack = toggleArchiveTrack;
window.setVolume = setVolume;
window.toggleMute = toggleMute;
window.seekTrack = seekTrack;
window.deleteArchiveTrack = deleteArchiveTrack;
window.sendDeleteAccountCode = sendDeleteAccountCode;
window.confirmDeleteAccountByCode = confirmDeleteAccountByCode;
window.deleteAccountWithoutEmail = deleteAccountWithoutEmail;
window.saveCommunicationSettings = saveCommunicationSettings;
window.saveCollectiveSettings = saveCollectiveSettings;

window.initSettingsPage = function () {
  const root = document.querySelector(".settings-page");
  if (!root) {
    console.log("❌ settings page not found");
    return;
  }

  if (!settingsGetToken()) {
    navigate("/login");
    return;
  }

  closeSettingsSection();
  closeViewPost();
  setViewPostMode(false);
  setSettingsModalMode(false);

  const settingsModal = document.getElementById("settingsModal");
  const viewPostModal = document.getElementById("viewPostModal");

  if (settingsModal) {
    settingsModal.addEventListener("click", (e) => {
      if (e.target === settingsModal) {
        closeSettingsSection();
      }
    });
  }

  if (viewPostModal) {
    viewPostModal.addEventListener("click", (e) => {
      if (e.target === viewPostModal) {
        closeViewPost();
      }
    });
  }
  window.settingsReady = true;
console.log("✅ settingsReady = true");
  
};
