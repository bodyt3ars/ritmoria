let adminAllUsers = [];
let adminSearchBound = false;
let adminNewsBound = false;
let adminNewsPreviewUrl = null;
let adminStats = {
  total_users: 0,
  online_users: 0
};

function denyAccess(text) {
  const app = document.getElementById("app");

  if (app) {
    app.innerHTML = `
      <div style="
        color:white;
        display:flex;
        justify-content:center;
        align-items:center;
        height:80vh;
        font-size:24px;
        text-align:center;
        padding:20px;
      ">
        ${text}
      </div>
    `;
  }
}

async function checkAdminAccess() {
  const token = localStorage.getItem("token");

  if (!token) {
    denyAccess("Нет доступа");
    return false;
  }

  try {
    const res = await fetch("/me", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) {
      denyAccess("Нет доступа");
      return false;
    }

    const user = await res.json();

    if (user.role !== "admin") {
      denyAccess("У вас нет доступа к этой странице");
      return false;
    }

    return true;
  } catch (err) {
    console.error("checkAdminAccess error:", err);
    denyAccess("Ошибка доступа");
    return false;
  }
}

function renderUsers(users) {
  const container = document.getElementById("usersList");
  if (!container) return;

  if (!users.length) {
    container.innerHTML = `<div class="admin-empty-state">Ничего не найдено</div>`;
    return;
  }

  container.innerHTML = users.map((u) => `
    <div class="user-row ${u.is_banned ? "is-banned" : ""}">
      <div class="user-info">
        <div class="user-name-row">
          <button
            type="button"
            class="user-name-link"
            data-profile-tag="${escapeAdminHtml(String(u.username_tag || "").trim())}"
            title="Открыть профиль"
          >
            ${escapeAdminHtml(u.username || "Без имени")}
          </button>
          ${u.is_verified ? '<span class="admin-verified-badge" title="Подтвержденный профиль"><i class="fa-solid fa-check"></i></span>' : ""}
          <span class="admin-user-status ${u.is_online ? "is-online" : "is-offline"}">
            <span class="admin-user-status-dot"></span>
            ${u.is_online ? "онлайн" : "не в сети"}
          </span>
        </div>
        <div class="user-meta-row">
          <div class="user-tag">@${escapeAdminHtml(u.username_tag || "")}</div>
          <div class="admin-user-meta">ID ${Number(u.id) || 0}</div>
          <div class="admin-user-meta">${u.created_at ? `Регистрация: ${escapeAdminHtml(formatAdminDate(u.created_at))}` : ""}</div>
          <div class="admin-user-meta">${u.last_seen_at ? `Был в сети: ${escapeAdminHtml(formatAdminDate(u.last_seen_at))}` : "Ещё не появлялся онлайн"}</div>
          ${u.is_banned ? '<div class="admin-user-badge admin-user-badge-danger">Заблокирован</div>' : ""}
        </div>
      </div>

      <div class="user-actions">
        <select class="role-select" data-user-id="${u.id}">
          <option value="user" ${u.role === "user" ? "selected" : ""}>user</option>
          <option value="judge" ${u.role === "judge" ? "selected" : ""}>judge</option>
          <option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option>
        </select>

        <button type="button" class="verify-btn ${u.is_verified ? "active" : ""}" data-user-id="${u.id}">
          ${u.is_verified ? "Снять галочку" : "Дать галочку"}
        </button>

        <button
          type="button"
          class="ban-btn ${u.is_banned ? "active" : ""}"
          data-user-id="${u.id}"
          data-banned="${u.is_banned ? "1" : "0"}"
        >
          ${u.is_banned ? "Разблокировать" : "Заблокировать"}
        </button>

        <div class="xp-controls">
          <input type="number" min="1" placeholder="XP" class="xp-input" data-user-id="${u.id}">
          <button type="button" class="xp-btn add" data-user-id="${u.id}">+</button>
          <button type="button" class="xp-btn remove" data-user-id="${u.id}">−</button>
        </div>
      </div>
    </div>
  `).join("");

  bindRoleSelects();
  bindVerifyButtons();
  bindBanButtons();
  bindProfileLinks();
  bindXPControls();
}

function renderAdminStats() {
  const totalEl = document.getElementById("adminTotalUsers");
  const onlineEl = document.getElementById("adminOnlineUsers");
  if (totalEl) totalEl.textContent = String(Number(adminStats.total_users || 0));
  if (onlineEl) onlineEl.textContent = String(Number(adminStats.online_users || 0));
}

function formatAdminDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("ru-RU", {
      timeZone: "Europe/Moscow",
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

function escapeAdminHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function resetAdminNewsMediaPreview() {
  const input = document.getElementById("adminNewsMedia");
  const preview = document.getElementById("adminNewsMediaPreview");
  if (adminNewsPreviewUrl) {
    URL.revokeObjectURL(adminNewsPreviewUrl);
    adminNewsPreviewUrl = null;
  }

  if (input) input.value = "";
  if (preview) {
    preview.innerHTML = "";
    preview.classList.add("admin-hidden");
  }
}

function renderAdminNewsMediaPreview(file) {
  const preview = document.getElementById("adminNewsMediaPreview");
  if (!preview) return;

  if (adminNewsPreviewUrl) {
    URL.revokeObjectURL(adminNewsPreviewUrl);
    adminNewsPreviewUrl = null;
  }

  if (!file) {
    preview.innerHTML = "";
    preview.classList.add("admin-hidden");
    return;
  }

  adminNewsPreviewUrl = URL.createObjectURL(file);
  const mediaMarkup = file.type.startsWith("video")
    ? `<video src="${adminNewsPreviewUrl}" controls muted preload="metadata"></video>`
    : `<img src="${adminNewsPreviewUrl}" alt="preview">`;

  preview.innerHTML = `
    ${mediaMarkup}
    <div class="admin-news-media-meta">
      <div>${escapeAdminHtml(file.name || "media")}</div>
      <div>${Math.max(1, Math.round((file.size || 0) / 1024))} KB</div>
    </div>
  `;
  preview.classList.remove("admin-hidden");
}

async function loadUsers() {
  try {
    const res = await fetch("/api/users", {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (!res.ok) {
      console.error("Ошибка загрузки пользователей");
      return;
    }

    const payload = await res.json();

    adminAllUsers = Array.isArray(payload?.users) ? payload.users : [];
    adminStats = {
      total_users: Number(payload?.stats?.total_users || adminAllUsers.length || 0),
      online_users: Number(payload?.stats?.online_users || 0)
    };
    renderAdminStats();
    renderUsers(adminAllUsers);
  } catch (err) {
    console.error("Ошибка loadUsers:", err);
  }
}

async function changeRole(userId, role, selectEl) {
  const previousRole = adminAllUsers.find((u) => u.id === userId)?.role || "user";

  try {
    const res = await fetch(`/api/users/${userId}/role`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify({ role })
    });

    if (!res.ok) {
      if (selectEl) {
        selectEl.value = previousRole;
      }
      alert("Ошибка смены роли");
      return;
    }

    const user = adminAllUsers.find((u) => u.id === userId);
    if (user) user.role = role;
  } catch (err) {
    console.error("changeRole error:", err);
    if (selectEl) {
      selectEl.value = previousRole;
    }
    alert("Ошибка смены роли");
  }
}

function bindRoleSelects() {
  const selects = document.querySelectorAll(".role-select");

  selects.forEach((select) => {
    if (select.dataset.bound === "true") return;
    select.dataset.bound = "true";

    select.addEventListener("change", () => {
      const userId = Number(select.dataset.userId);
      const role = select.value;

      if (!userId || !role) return;
      changeRole(userId, role, select);
    });
  });
}

async function toggleVerified(userId, button) {
  const user = adminAllUsers.find((item) => Number(item.id) === Number(userId));
  if (!user) return;

  const nextValue = !user.is_verified;

  if (button) {
    button.disabled = true;
  }

  try {
    const res = await fetch(`/api/users/${userId}/verified`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify({ is_verified: nextValue })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error || "Не удалось изменить галочку");
      return;
    }

    user.is_verified = Boolean(data.is_verified);
    renderUsers(adminAllUsers);
  } catch (err) {
    console.error("toggleVerified error:", err);
    alert("Ошибка галочки");
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

async function loadAdminNews() {
  const list = document.getElementById("adminNewsList");
  if (!list) return;

  try {
    const res = await fetch("/api/admin/news", {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (!res.ok) {
      list.innerHTML = `<div style="opacity:.6;color:white;">Не удалось загрузить новости</div>`;
      return;
    }

    const news = await res.json();
    if (!Array.isArray(news) || !news.length) {
      list.innerHTML = `<div style="opacity:.6;color:white;">Новостей пока нет</div>`;
      return;
    }

    list.innerHTML = news.map((item) => `
      <div class="admin-news-item">
        <div class="admin-news-item-top">
          <div>
            <div class="admin-news-item-title">${escapeAdminHtml(item.title || "Без заголовка")}</div>
            <div class="admin-news-item-date">${formatAdminDate(item.created_at)}</div>
          </div>
          <button type="button" class="admin-news-delete" data-news-id="${item.id}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
        <div class="admin-news-item-text">${escapeAdminHtml(item.content || "")}</div>
        ${item.media_url ? `
          <div class="admin-news-media-inline">
            ${item.media_type === "video"
              ? `<video src="${escapeAdminHtml(item.media_url)}" controls preload="metadata"></video>`
              : `<img src="${escapeAdminHtml(item.media_url)}" alt="${escapeAdminHtml(item.title || "news media")}">`}
          </div>
        ` : ""}
      </div>
    `).join("");

    list.querySelectorAll(".admin-news-delete").forEach((button) => {
      button.addEventListener("click", async () => {
        const newsId = Number(button.dataset.newsId);
        if (!newsId) return;
        const confirmed = typeof window.showAppConfirm === "function"
          ? await window.showAppConfirm({
              title: "Удалить новость",
              text: "Новость исчезнет с главной страницы.",
              confirmText: "Удалить",
              cancelText: "Отмена",
              danger: true
            })
          : confirm("Удалить новость?");
        if (!confirmed) return;

        const res = await fetch(`/api/admin/news/${newsId}`, {
          method: "DELETE",
          headers: {
            Authorization: "Bearer " + localStorage.getItem("token")
          }
        });

        if (!res.ok) {
          alert("Не удалось удалить новость");
          return;
        }

        loadAdminNews();
      });
    });
  } catch (err) {
    console.error("loadAdminNews error:", err);
  }
}

function initAdminNews() {
  const button = document.getElementById("adminNewsPublish");
  const titleInput = document.getElementById("adminNewsTitle");
  const contentInput = document.getElementById("adminNewsContent");
  const mediaInput = document.getElementById("adminNewsMedia");
  if (!button || !titleInput || !contentInput || !mediaInput || adminNewsBound) return;
  adminNewsBound = true;

  mediaInput.addEventListener("change", () => {
    renderAdminNewsMediaPreview(mediaInput.files?.[0] || null);
  });

  button.addEventListener("click", async () => {
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    const mediaFile = mediaInput.files?.[0] || null;

    if (!title || !content) {
      alert("Заполни заголовок и текст новости");
      return;
    }

    const formData = new FormData();
    formData.append("title", title);
    formData.append("content", content);
    if (mediaFile) {
      formData.append("media", mediaFile);
    }

    const res = await fetch("/api/admin/news", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: formData
    });

    if (!res.ok) {
      alert("Не удалось опубликовать новость");
      return;
    }

    titleInput.value = "";
    contentInput.value = "";
    resetAdminNewsMediaPreview();
    loadAdminNews();
  });
}

function bindVerifyButtons() {
  const buttons = document.querySelectorAll(".verify-btn");

  buttons.forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";

    button.addEventListener("click", () => {
      const userId = Number(button.dataset.userId);
      if (!userId) return;
      toggleVerified(userId, button);
    });
  });
}

function openAdminProfile(tag) {
  const safeTag = String(tag || "").trim().replace(/^@+/, "");
  if (!safeTag) return;

  if (typeof window.navigate === "function") {
    window.navigate(`/${safeTag}`);
  } else {
    window.location.href = `/${safeTag}`;
  }
}

function bindProfileLinks() {
  document.querySelectorAll(".user-name-link").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";

    button.addEventListener("click", () => {
      openAdminProfile(button.dataset.profileTag || "");
    });
  });
}

async function toggleBan(userId, button) {
  const user = adminAllUsers.find((item) => Number(item.id) === Number(userId));
  if (!user) return;

  const nextValue = !user.is_banned;

  if (button) {
    button.disabled = true;
  }

  try {
    const res = await fetch(`/api/users/${userId}/ban`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify({ is_banned: nextValue })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error || "Не удалось изменить блокировку");
      return;
    }

    user.is_banned = Boolean(data.is_banned);
    renderUsers(adminAllUsers);
  } catch (err) {
    console.error("toggleBan error:", err);
    alert("Ошибка блокировки");
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

function bindBanButtons() {
  document.querySelectorAll(".ban-btn").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";

    button.addEventListener("click", () => {
      const userId = Number(button.dataset.userId);
      if (!userId) return;
      toggleBan(userId, button);
    });
  });
}

function initAdminSearch() {
  const input = document.getElementById("adminSearch");
  const results = document.getElementById("adminSearchResults");

  if (!input || !results || adminSearchBound) return;
  adminSearchBound = true;

  input.addEventListener("input", () => {
    const q = input.value.toLowerCase().trim();

    if (!q) {
      results.style.display = "none";
      renderUsers(adminAllUsers);
      return;
    }

    const filtered = adminAllUsers.filter((u) =>
      (u.username_tag || "").toLowerCase().includes(q) ||
      (u.username || "").toLowerCase().includes(q)
    );

    results.innerHTML = filtered.map((u) => `
      <div class="admin-search-item" data-tag="${escapeAdminHtml(u.username_tag || "")}">
        @${escapeAdminHtml(u.username_tag || "")}
      </div>
    `).join("");

    results.style.display = filtered.length ? "block" : "none";

    const items = results.querySelectorAll(".admin-search-item");
    items.forEach((item) => {
      item.addEventListener("click", () => {
        const tag = item.dataset.tag || "";
        selectUser(tag);
      });
    });

    renderUsers(filtered);
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".admin-search")) {
      results.style.display = "none";
    }
  });
}

function selectUser(tag) {
  const input = document.getElementById("adminSearch");
  const results = document.getElementById("adminSearchResults");

  if (input) input.value = tag;

  const filtered = adminAllUsers.filter((u) => String(u.username_tag || "").toLowerCase() === String(tag || "").toLowerCase());
  renderUsers(filtered);

  if (results) {
    results.style.display = "none";
  }
}

window.selectUser = selectUser;

window.initAdminPage = async function () {
  const ok = await checkAdminAccess();
  if (!ok) return;

  adminAllUsers = [];
  adminStats = { total_users: 0, online_users: 0 };
  adminSearchBound = false;
  adminNewsBound = false;
  resetAdminNewsMediaPreview();
  renderAdminStats();

  await loadUsers();
  await loadAdminNews();
  initAdminSearch();
  initAdminNews();
};

function bindXPControls(){
  document.querySelectorAll(".xp-btn").forEach(btn=>{
    if(btn.dataset.bound) return;
    btn.dataset.bound = "1";

    btn.addEventListener("click", async ()=>{
      const userId = btn.dataset.userId;
      const input = document.querySelector(`.xp-input[data-user-id="${userId}"]`);
      const amount = Number(input?.value);

if (!amount || amount <= 0) {
  alert("Введите XP больше 0");
  return;
}

      const type = btn.classList.contains("add") ? "add" : "remove";

      try{
        const res = await fetch(`/api/admin/xp`,{
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            Authorization:"Bearer "+localStorage.getItem("token")
          },
          body: JSON.stringify({
            userId,
            amount,
            type
          })
        });

      const data = await res.json();

        if (!res.ok) {
          alert(data.error || "Ошибка XP");
          return;
        }

        input.value = "";
        alert(`Готово. Теперь XP: ${data.newXP}`);

      }catch(e){
        console.error(e);
        alert("Ошибка");
      }
    });
  });
}
