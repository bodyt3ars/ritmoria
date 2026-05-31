console.log("NAVBAR JS LOADED");

let navbarQueueInterval = null;
let navbarInitialized = false;
let appConfirmPromiseResolver = null;
let navbarNotificationsInterval = null;
let navbarRealtimeInitialized = false;
let navbarRealtimeLoopInterval = null;
let collectiveInviteDecisionResolver = null;

function setNavbarBadgeState(badge, count) {
  if (!badge) return;
  const numericCount = Number(count || 0);
  if (numericCount > 0) {
    badge.textContent = String(numericCount);
    badge.classList.remove("navbar-hidden");
    badge.style.removeProperty("display");
  } else {
    badge.textContent = "";
    badge.classList.add("navbar-hidden");
    badge.style.setProperty("display", "none", "important");
  }
}

async function hasNavbarSession() {
  if (typeof window.hasActiveSession === "function") {
    return window.hasActiveSession();
  }
  return !!localStorage.getItem("token");
}

function buildNavbarProfilePath(tag) {
  const safeTag = String(tag || "").trim();
  return safeTag ? `/${encodeURIComponent(safeTag)}` : "/profile";
}

function setNavbarEmptyState(list) {
  if (!list) return;
  const empty = document.createElement("div");
  empty.className = "navbar-notification-empty";
  empty.textContent = "Пока пусто";
  list.replaceChildren(empty);
}

async function loadNavbarMessagesBadge() {
  const link = document.getElementById("navMessagesLink");
  const badge = document.getElementById("navMessagesBadge");
  if (!link || !badge) return;

  if (!(await hasNavbarSession())) {
    link.classList.add("navbar-hidden");
    link.style.setProperty("display", "none", "important");
    setNavbarBadgeState(badge, 0);
    return;
  }

  link.classList.remove("navbar-hidden");
  link.style.removeProperty("display");

  try {
    const res = await fetch("/api/messages/unread-summary");

    if (!res.ok) {
      if (res.status === 401) {
        window.clearAuthClientState?.();
      }
      setNavbarBadgeState(badge, 0);
      return;
    }
    const data = await res.json();
    const unreadConversations = Number(data.unread_conversations || 0);
    setNavbarBadgeState(badge, unreadConversations);
  } catch (err) {
    console.error("Navbar messages badge error:", err);
    setNavbarBadgeState(badge, 0);
  }
}

async function refreshNavbarRealtimeState() {
  if (!(await hasNavbarSession())) return;
  ensureNavbarRealtimeLoop();
  await loadNavbarUser();
  await loadNavbarNotifications();
  await loadNavbarMessagesBadge();
}

function ensureNavbarRealtimeLoop() {
  if (navbarRealtimeLoopInterval) return;

  navbarRealtimeLoopInterval = setInterval(async () => {
    if (document.visibilityState === "hidden") return;
    if (!(await hasNavbarSession())) return;

    const notificationsWrap = document.getElementById("navNotificationsWrap");
    const messagesLink = document.getElementById("navMessagesLink");

    if (!notificationsWrap && !messagesLink) return;

    try {
      await loadNavbarNotifications();
      await loadNavbarMessagesBadge();
    } catch (err) {
      console.error("Navbar realtime loop error:", err);
    }
  }, 5000);
}

function ensureAppConfirmModal() {
  if (document.getElementById("appConfirmModal")) return;

  const modal = document.createElement("div");
  modal.id = "appConfirmModal";
  modal.className = "app-confirm-modal";
  modal.innerHTML = `
    <div class="app-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="appConfirmTitle">
      <div class="app-confirm-icon">
        <i class="fa-solid fa-triangle-exclamation"></i>
      </div>
      <div class="app-confirm-copy">
        <h3 id="appConfirmTitle" class="app-confirm-title">Подтвердите действие</h3>
        <p id="appConfirmText" class="app-confirm-text">Вы уверены?</p>
      </div>
      <div class="app-confirm-actions">
        <button type="button" id="appConfirmCancel" class="app-confirm-btn app-confirm-btn-secondary">Отмена</button>
        <button type="button" id="appConfirmOk" class="app-confirm-btn app-confirm-btn-primary">Подтвердить</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const resolveConfirm = (value) => {
    modal.classList.remove("active");
    document.body.classList.remove("app-confirm-open");
    if (appConfirmPromiseResolver) {
      appConfirmPromiseResolver(value);
      appConfirmPromiseResolver = null;
    }
  };

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      resolveConfirm(false);
    }
  });

  modal.querySelector("#appConfirmCancel")?.addEventListener("click", () => resolveConfirm(false));
  modal.querySelector("#appConfirmOk")?.addEventListener("click", () => resolveConfirm(true));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("active")) {
      resolveConfirm(false);
    }
  });
}

function showAppConfirm({
  title = "Подтвердите действие",
  text = "Вы уверены?",
  confirmText = "Подтвердить",
  cancelText = "Отмена",
  danger = false
} = {}) {
  ensureAppConfirmModal();

  const modal = document.getElementById("appConfirmModal");
  const titleEl = document.getElementById("appConfirmTitle");
  const textEl = document.getElementById("appConfirmText");
  const okBtn = document.getElementById("appConfirmOk");
  const cancelBtn = document.getElementById("appConfirmCancel");

  if (!modal || !titleEl || !textEl || !okBtn || !cancelBtn) {
    return Promise.resolve(window.confirm(text));
  }

  titleEl.textContent = title;
  textEl.textContent = text;
  okBtn.textContent = confirmText;
  cancelBtn.textContent = cancelText;
  modal.classList.toggle("is-danger", !!danger);
  modal.classList.add("active");
  document.body.classList.add("app-confirm-open");

  return new Promise((resolve) => {
    appConfirmPromiseResolver = resolve;
  });
}

function ensureCollectiveInviteModal() {
  if (document.getElementById("collectiveInviteModal")) return;

  const modal = document.createElement("div");
  modal.id = "collectiveInviteModal";
  modal.className = "app-confirm-modal";
  modal.innerHTML = `
    <div class="app-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="collectiveInviteTitle">
      <div class="app-confirm-icon">
        <i class="fa-solid fa-users"></i>
      </div>
      <div class="app-confirm-copy">
        <h3 id="collectiveInviteTitle" class="app-confirm-title">Приглашение в объединение</h3>
        <p id="collectiveInviteText" class="app-confirm-text">Тебя пригласили в объединение.</p>
      </div>
      <div class="app-confirm-actions">
        <button type="button" id="collectiveInviteDecline" class="app-confirm-btn app-confirm-btn-secondary">Отклонить</button>
        <button type="button" id="collectiveInviteAccept" class="app-confirm-btn app-confirm-btn-primary">Принять</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const resolveDecision = (value) => {
    modal.classList.remove("active");
    document.body.classList.remove("app-confirm-open");
    if (collectiveInviteDecisionResolver) {
      collectiveInviteDecisionResolver(value);
      collectiveInviteDecisionResolver = null;
    }
  };

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      resolveDecision(null);
    }
  });

  modal.querySelector("#collectiveInviteDecline")?.addEventListener("click", () => resolveDecision("reject"));
  modal.querySelector("#collectiveInviteAccept")?.addEventListener("click", () => resolveDecision("accept"));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("active")) {
      resolveDecision(null);
    }
  });
}

function showCollectiveInviteDecision({ collectiveName = "", actorTag = "" } = {}) {
  ensureCollectiveInviteModal();

  const modal = document.getElementById("collectiveInviteModal");
  const textEl = document.getElementById("collectiveInviteText");
  if (!modal || !textEl) {
    return Promise.resolve(null);
  }

  const collective = String(collectiveName || "").trim();
  const tag = String(actorTag || "").trim();
  textEl.textContent = collective
    ? `${tag ? `@${tag} ` : ""}пригласил тебя в объединение "${collective}".`
    : "Тебя пригласили в музыкальное объединение.";

  modal.classList.add("active");
  document.body.classList.add("app-confirm-open");

  return new Promise((resolve) => {
    collectiveInviteDecisionResolver = resolve;
  });
}

async function loadNavbar() {
  const container = document.getElementById("navbar");
  if (!container) return;

  try {
    const res = await fetch("/html/components/navbar.html");
    const html = await res.text();

    container.innerHTML = html;

    const path = window.location.pathname;
    const isAuthPage = path.includes("login") || path.includes("register");

    if (isAuthPage) {
      requestAnimationFrame(() => {
        const navbar = document.querySelector(".navbar");
        if (navbar) {
          navbar.classList.add("auth-navbar");
        }

        const search = document.querySelector(".navbar-search");
        search?.classList.add("navbar-hidden");
      });
    }

    await loadNavbarUser();
    initDropdown();
    initNotificationsDropdown();
    initSearch();
    initMobileNavbar();
    highlightActivePage();

    if (navbarQueueInterval) {
      clearInterval(navbarQueueInterval);
    }
    if (navbarNotificationsInterval) {
      clearInterval(navbarNotificationsInterval);
    }

    await loadQueueStatus();
    await loadNavbarNotifications();
    await loadNavbarMessagesBadge();
    ensureNavbarRealtimeLoop();
    navbarQueueInterval = setInterval(loadQueueStatus, 5000);
    navbarNotificationsInterval = setInterval(async () => {
      await loadNavbarNotifications();
      await loadNavbarMessagesBadge();
    }, 15000);
  } catch (err) {
    console.error("Navbar load error:", err);
  }
}

function initMobileNavbar() {
  const navbar = document.querySelector(".navbar");
  const toggle = document.getElementById("navbarMobileToggle");
  if (!navbar || !toggle) return;
  if (toggle.dataset.mobileInitialized === "true") return;
  toggle.dataset.mobileInitialized = "true";

  const closeMobileMenu = () => {
    navbar.classList.remove("mobile-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = !navbar.classList.contains("mobile-open");
    navbar.classList.toggle("mobile-open", willOpen);
    toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
  });

  navbar.addEventListener("click", (e) => {
    if (e.target.closest(".navbar-link") || e.target.closest(".navbar-dropdown-item")) {
      closeMobileMenu();
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".navbar")) {
      closeMobileMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 700) {
      closeMobileMenu();
    }
  });
}

async function loadNavbarUser() {
  const navGuest = document.getElementById("navGuest");
  const navUser = document.getElementById("navUser");
  const navAvatar = document.getElementById("navAvatar");
  const adminPanelBtn = document.getElementById("adminPanelBtn");
  const navDropdown = document.getElementById("navDropdown");
  const navMessagesLink = document.getElementById("navMessagesLink");
  const navNotificationsWrap = document.getElementById("navNotificationsWrap");
  const navMessagesBadge = document.getElementById("navMessagesBadge");

  if (!navGuest || !navUser || !navAvatar) return;

  adminPanelBtn?.classList.add("navbar-hidden");
  if (adminPanelBtn) {
    adminPanelBtn.style.setProperty("display", "none", "important");
  }
  navDropdown?.classList.remove("active");

  if (!(await hasNavbarSession())) {
    navAvatar.src = "/images/default-avatar.jpg";
    navGuest.classList.remove("navbar-hidden");
    navUser.classList.add("navbar-hidden");
    navMessagesLink?.classList.add("navbar-hidden");
    navNotificationsWrap?.classList.add("navbar-hidden");
    navMessagesLink?.style.setProperty("display", "none", "important");
    navNotificationsWrap?.style.setProperty("display", "none", "important");
    setNavbarBadgeState(navMessagesBadge, 0);
    navGuest.style.removeProperty("display");
    navUser.style.setProperty("display", "none", "important");
    window.currentUser = null;
    return;
  }

  try {
    const res = await fetch("/me");

    if (!res.ok) throw new Error("Unauthorized");

    const user = await res.json();
    window.currentUser = user;
    window.markActiveSession?.(true, user);

    navAvatar.src = user.avatar
      ? `${user.avatar}?t=${Date.now()}`
      : "/images/default-avatar.jpg";

    navGuest.classList.add("navbar-hidden");
    navUser.classList.remove("navbar-hidden");
    navMessagesLink?.classList.remove("navbar-hidden");
    navNotificationsWrap?.classList.remove("navbar-hidden");
    navMessagesLink?.style.removeProperty("display");
    navNotificationsWrap?.style.removeProperty("display");
    navGuest.style.setProperty("display", "none", "important");
    navUser.style.removeProperty("display");

    if (user.role === "admin") {
      adminPanelBtn?.classList.remove("navbar-hidden");
      adminPanelBtn?.style.removeProperty("display");
    }
  } catch (err) {
    console.error("Navbar user error:", err);
    window.clearAuthClientState?.();

    navAvatar.src = "/images/default-avatar.jpg";
    navGuest.classList.remove("navbar-hidden");
    navUser.classList.add("navbar-hidden");
    navMessagesLink?.classList.add("navbar-hidden");
    navNotificationsWrap?.classList.add("navbar-hidden");
    navMessagesLink?.style.setProperty("display", "none", "important");
    navNotificationsWrap?.style.setProperty("display", "none", "important");
    setNavbarBadgeState(navMessagesBadge, 0);
    navGuest.style.removeProperty("display");
    navUser.style.setProperty("display", "none", "important");
    adminPanelBtn?.classList.add("navbar-hidden");
    if (adminPanelBtn) {
      adminPanelBtn.style.setProperty("display", "none", "important");
    }
    window.currentUser = null;
  }
}

function initDropdown() {
  const btn = document.getElementById("navUserBtn");
  const dropdown = document.getElementById("navDropdown");

  if (!btn || !dropdown) return;

  if (btn.dataset.dropdownInitialized === "true") return;
  btn.dataset.dropdownInitialized = "true";

  const closeDropdown = () => {
    dropdown.classList.remove("active");
    btn.setAttribute("aria-expanded", "false");
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = !dropdown.classList.contains("active");
    dropdown.classList.toggle("active", willOpen);
    btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
  });

  dropdown.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  dropdown.querySelectorAll(".navbar-dropdown-item").forEach((item) => {
    item.addEventListener("click", () => {
      closeDropdown();
    });
  });

  document.addEventListener("click", () => {
    closeDropdown();
  });
}

function closeNavbarProfileDropdown() {
  const dropdown = document.getElementById("navDropdown");
  const btn = document.getElementById("navUserBtn");
  if (dropdown) {
    dropdown.classList.remove("active");
  }
  if (btn) {
    btn.setAttribute("aria-expanded", "false");
  }
}

function formatNotificationTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const diff = Math.max(1, Math.floor((Date.now() - date.getTime()) / 60000));
  if (diff < 60) return `${diff} мин`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  return `${days} д`;
}

async function loadNavbarNotifications() {
  const wrap = document.getElementById("navNotificationsWrap");
  const list = document.getElementById("navNotificationsList");
  const badge = document.getElementById("navNotificationsBadge");
  if (!wrap || !list || !badge) return;

  if (!(await hasNavbarSession())) {
    wrap.classList.add("navbar-hidden");
    wrap.style.setProperty("display", "none", "important");
    setNavbarBadgeState(badge, 0);
    setNavbarEmptyState(list);
    return;
  }

  wrap.classList.remove("navbar-hidden");
  wrap.style.removeProperty("display");

  try {
    const res = await fetch("/api/notifications");
    if (!res.ok) {
      if (res.status === 401) {
        window.clearAuthClientState?.();
      }
      setNavbarBadgeState(badge, 0);
      setNavbarEmptyState(list);
      return;
    }
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    const unreadCount = Number(data.unreadCount || 0);

    setNavbarBadgeState(badge, unreadCount);

    if (!items.length) {
      setNavbarEmptyState(list);
      return;
    }

    const fragment = document.createDocumentFragment();

    items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `navbar-notification-item${item.is_read ? "" : " is-unread"}`;
      button.dataset.notificationId = String(item.id || "");
      button.dataset.notificationType = String(item.type || "");
      button.dataset.entityType = String(item.entity_type || "");
      button.dataset.entityId = String(item.entity_id || "");
      button.dataset.actorTag = String(item.actor_username_tag || "");
      button.dataset.metadata = JSON.stringify(item.metadata || {});

      const avatar = document.createElement("img");
      avatar.className = "navbar-notification-avatar";
      avatar.src = String(item.actor_avatar || "").trim() || "/images/default-avatar.jpg";
      avatar.alt = String(item.actor_username || "user");

      const copy = document.createElement("div");
      copy.className = "navbar-notification-copy";

      const text = document.createElement("div");
      text.className = "navbar-notification-text";
      text.textContent = String(item.text || "");

      const time = document.createElement("div");
      time.className = "navbar-notification-time";
      time.textContent = formatNotificationTime(item.created_at);

      copy.append(text, time);
      button.append(avatar, copy);

      button.addEventListener("click", async () => {
        const notificationId = Number(button.dataset.notificationId);
        let metadata = {};
        try {
          metadata = JSON.parse(button.dataset.metadata || "{}");
        } catch {}

        if (notificationId) {
          await fetch(`/api/notifications/${notificationId}/read`, {
            method: "POST"
          }).catch(() => {});
        }

        document.getElementById("navNotificationsDropdown")?.classList.remove("active");
        await loadNavbarNotifications();

        const type = String(button.dataset.notificationType || "");
        const entityType = String(button.dataset.entityType || "");
        const entityId = String(button.dataset.entityId || "");
        const actorTag = String(button.dataset.actorTag || "");

        if (type === "follow" && actorTag) {
          navigate(buildNavbarProfilePath(actorTag));
          return;
        }
        if ((entityType === "post" || type.startsWith("post_")) && entityId) {
          navigate("/");
          return;
        }
        if ((entityType === "track" || type === "track_like") && entityId) {
          if (metadata.route) {
            navigate(metadata.route);
            return;
          }
          navigate(`/track/${entityId}`);
          return;
        }
        if (type === "collective_invite" && metadata.inviteId) {
          const decision = await showCollectiveInviteDecision({
            collectiveName: metadata.collectiveName,
            actorTag
          });

          if (!decision) {
            return;
          }

          await fetch(`/api/settings/collective/invite/${Number(metadata.inviteId)}/respond`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ action: decision })
          }).catch((err) => {
            console.error("Collective invite decision error:", err);
          });

          await loadNavbarNotifications();
          await loadNavbarUser();

          if (typeof window.loadCollectiveSection === "function") {
            try {
              await window.loadCollectiveSection();
            } catch (err) {
              console.error("Collective section refresh error:", err);
            }
          }
          return;
        }
        if (entityType === "open_track") {
          navigate("/opens");
          return;
        }
        if ((entityType === "conversation" || type === "dm") && metadata.conversationId) {
          navigate(`/messages?conversation=${metadata.conversationId}`);
          return;
        }
      });
      fragment.append(button);
    });

    list.replaceChildren(fragment);
  } catch (err) {
    console.error("loadNavbarNotifications error:", err);
    setNavbarBadgeState(badge, 0);
  }
}

function initNotificationsDropdown() {
  const btn = document.getElementById("navNotificationsBtn");
  const dropdown = document.getElementById("navNotificationsDropdown");
  const readAllBtn = document.getElementById("navNotificationsReadAll");
  if (!btn || !dropdown || btn.dataset.notificationsInitialized === "true") return;
  btn.dataset.notificationsInitialized = "true";

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("active");
  });

  dropdown.addEventListener("click", (e) => e.stopPropagation());

  readAllBtn?.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!(await hasNavbarSession())) return;
    await fetch("/api/notifications/read-all", {
      method: "POST"
    }).catch(() => {});
    await loadNavbarNotifications();
  });

  document.addEventListener("click", () => {
    dropdown.classList.remove("active");
  });
}

async function goToProfile(e) {
  if (e) e.stopPropagation();
  closeNavbarProfileDropdown();

  if (!(await hasNavbarSession())) {
    navigate("/login");
    return;
  }

  try {
    const res = await fetch("/me");

    if (!res.ok) throw new Error("Unauthorized");

    const user = await res.json();
    const tag = user.username_tag;

    if (tag) {
      navigate(buildNavbarProfilePath(tag));
    } else {
      navigate("/profile");
    }
  } catch (err) {
    console.error("goToProfile error", err);
    window.clearAuthClientState?.();
    navigate("/profile");
  }
}

function goToSettings(e) {
  if (e) e.stopPropagation();
  closeNavbarProfileDropdown();
  navigate("/settings");
}

async function performLogout(e) {
  if (e) e.stopPropagation();
  closeNavbarProfileDropdown();
  localStorage.removeItem("userAvatar");
  if (typeof window.performServerLogout === "function") {
    await window.performServerLogout("/");
  } else {
    window.location.assign("/");
  }
}

async function confirmLogout(e) {
  if (e) e.stopPropagation();
  closeNavbarProfileDropdown();
  const confirmed = await showAppConfirm({
    title: "Выйти из аккаунта",
    text: "Сессия завершится на этом устройстве.",
    confirmText: "Выйти",
    cancelText: "Остаться"
  });
  if (!confirmed) return;
  await performLogout();
}

function goToAdmin(e) {
  if (e) e.stopPropagation();
  closeNavbarProfileDropdown();
  if (window.currentUser?.role !== "admin") return;
  navigate("/admin");
}

window.goToProfile = goToProfile;
window.goToSettings = goToSettings;
window.logout = performLogout;
window.confirmLogout = confirmLogout;
window.showAppConfirm = showAppConfirm;
window.goToAdmin = goToAdmin;
window.loadNavbarNotifications = loadNavbarNotifications;
window.loadNavbarMessagesBadge = loadNavbarMessagesBadge;

function initSearch() {
  const input = document.getElementById("globalSearch");
  const results = document.getElementById("searchResults");

  if (!input || !results) return;
  if (input.dataset.searchInitialized === "true") return;
  input.dataset.searchInitialized = "true";

  let timeout;

  const escapeSearchHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const closeSearchResults = () => {
    results.classList.remove("active");
    results.innerHTML = "";
  };

  const getTrackHref = (track) => {
    const tag = String(track?.username_tag || "").trim();
    const slug = String(track?.slug || "").trim();
    if (tag && slug) return `/${encodeURIComponent(tag)}/${encodeURIComponent(slug)}`;
    return null;
  };

  const normalizeSearchMedia = (value, fallback) => {
    const clean = String(value || "").trim();
    if (!clean) return fallback;
    if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
    return `/${clean.replace(/^\/+/, "")}`;
  };

  const renderTrackArtist = (track) => {
    const artist = String(track?.artist || "").trim();
    const author = String(track?.username || track?.username_tag || "").trim();
    return artist || author || "Unknown artist";
  };

  const renderUserItem = (user) => `
    <button type="button" class="navbar-search-item navbar-search-item-user" data-search-user-tag="${escapeSearchHtml(user.username_tag || "")}">
      <img
        class="navbar-search-avatar"
        src="${escapeSearchHtml(normalizeSearchMedia(user.avatar, "/images/default-avatar.jpg"))}"
        alt="${escapeSearchHtml(user.username || "User")}"
      >
      <div class="navbar-search-info">
        <div class="navbar-search-name">${escapeSearchHtml(user.username || "No name")}</div>
        <div class="navbar-search-meta">Исполнитель</div>
      </div>
    </button>
  `;

  const renderTrackItem = (track) => `
    <div class="navbar-search-item navbar-search-item-track" data-search-track-href="${escapeSearchHtml(getTrackHref(track) || "")}">
      <div class="navbar-track-cover-wrap">
        <img
          class="navbar-track-cover-img"
          src="${escapeSearchHtml(normalizeSearchMedia(track.cover, "/images/default-cover.jpg"))}"
          alt="${escapeSearchHtml(track.title || "Track")}"
        >
        <button
          type="button"
          class="navbar-track-play"
          data-search-play-track='${escapeSearchHtml(JSON.stringify(track))}'
          aria-label="Включить трек"
        >
          <span class="navbar-track-play-circle">
            <span class="navbar-play-icon"></span>
            <span class="navbar-pause-icon"><span></span><span></span></span>
          </span>
        </button>
      </div>
      <div class="navbar-search-info">
        <div class="navbar-search-name">${escapeSearchHtml(track.title || "Unknown track")}</div>
        <div class="navbar-search-meta">Трек • ${escapeSearchHtml(renderTrackArtist(track))}</div>
      </div>
    </div>
  `;

  const renderSearchResults = (data) => {
    const users = Array.isArray(data?.users) ? data.users : [];
    const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
    const items = [
      ...users.map(renderUserItem),
      ...tracks.map(renderTrackItem)
    ];

    results.innerHTML = items.length
      ? items.join("")
      : `<div class="navbar-search-empty">Ничего не найдено</div>`;
    results.classList.add("active");
  };

  input.addEventListener("input", () => {
    clearTimeout(timeout);

    const q = input.value.trim();

    if (!q) {
      closeSearchResults();
      return;
    }

    timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);

        if (!res.ok) {
          console.error("Search error:", res.status);
          return;
        }

        const data = await res.json();
        renderSearchResults(data);
      } catch (err) {
        console.error("Search fetch error:", err);
      }
    }, 300);
  });

  results.addEventListener("click", (e) => {
    const playBtn = e.target.closest("[data-search-play-track]");
    if (playBtn) {
      e.preventDefault();
      e.stopPropagation();

      try {
        const track = JSON.parse(playBtn.dataset.searchPlayTrack || "{}");
        if (!track) return;
        if (typeof window.playTrackGlobal === "function") {
          window.playTrackGlobal({
            ...track,
            play_context: "search",
            profile_source_tag: track.username_tag || ""
          });
        }
      } catch (err) {
        console.error("Search track play error:", err);
      }
      return;
    }

    const userItem = e.target.closest("[data-search-user-tag]");
    if (userItem) {
      const tag = userItem.dataset.searchUserTag;
      if (tag) {
        closeSearchResults();
        navigate(`/${tag}`);
      }
      return;
    }

    const trackItem = e.target.closest("[data-search-track-href]");
    if (trackItem) {
      const href = trackItem.dataset.searchTrackHref;
      if (href) {
        closeSearchResults();
        navigate(href);
      }
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".navbar-search")) {
      closeSearchResults();
    }
  });
}

function goToUserProfile(tag) {
  navigate(`/${tag}`);
}

window.goToUserProfile = goToUserProfile;

async function loadQueueStatus() {
  try {
    const res = await fetch("/api/queue/state");
    const data = await res.json();

    const dot = document.getElementById("queueStatus");
    if (!dot) return;

    dot.classList.remove("active", "closed");

    if (data.state === "open") {
      dot.classList.add("active");
    } else {
      dot.classList.add("closed");
    }
  } catch (err) {
    console.error("Queue status error:", err);
  }
}

function highlightActivePage() {
  const path = window.location.pathname;

  let page = "";

  if (path === "/" || path.includes("index")) page = "index";
  else if (path.includes("playlists")) page = "playlists";
  else if (path.includes("submit")) page = "submit";
  else if (path.includes("queue")) page = "queue";
  else if (path.includes("discover")) page = "discover";
  else if (path.includes("battle")) page = "battle";

  const nav = document.querySelector(".navbar-links");
  if (!nav) return;

  const links = nav.querySelectorAll("a");
  const indicator = nav.querySelector(".navbar-indicator");
  if (!indicator) return;

  links.forEach((link) => link.classList.remove("active-link"));

  const activeLink = Array.from(links).find((link) => link.dataset.page === page);

  if (!activeLink) {
    indicator.style.width = "0px";
    return;
  }

  activeLink.classList.add("active-link");

  const rect = activeLink.getBoundingClientRect();
  const navRect = nav.getBoundingClientRect();

  indicator.style.width = rect.width + "px";
  indicator.style.left = (rect.left - navRect.left) + "px";
}

if (!navbarInitialized) {
  navbarInitialized = true;
  ensureAppConfirmModal();
  loadNavbar();
}

if (!navbarRealtimeInitialized) {
  navbarRealtimeInitialized = true;
  ensureNavbarRealtimeLoop();

  window.addEventListener("focus", () => {
    refreshNavbarRealtimeState().catch((err) => {
      console.error("Navbar focus refresh error:", err);
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    refreshNavbarRealtimeState().catch((err) => {
      console.error("Navbar visibility refresh error:", err);
    });
  });
}

window.highlightActivePage = highlightActivePage;
window.loadNavbar = loadNavbar;
window.loadNavbarUser = loadNavbarUser;
window.refreshNavbarRealtimeState = refreshNavbarRealtimeState;
