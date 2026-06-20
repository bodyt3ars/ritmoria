async function hasProfileClientSession({ force = false } = {}) {
  if (!force && (window.currentUser || window.hasSessionCache?.())) {
    return true;
  }

  if (typeof window.hasActiveSession === "function") {
    return window.hasActiveSession({ force });
  }

  return !!localStorage.getItem("token");
}

async function getCurrentViewerProfile() {
  const hasSession = await hasProfileClientSession();

  if (!hasSession) return null;

  const res = await fetch("/me");
  if (!res.ok) return null;

  const me = await res.json();
  window.currentViewer = me;
  window.markActiveSession?.(true, me);
  return me;
}

async function isMyProfileAsync() {
  const params = new URLSearchParams(window.location.search);
  const tag = window.__profileTag || params.get("tag");

  try {
    const me = await getCurrentViewerProfile();
    if (!me) return false;

    if (!tag) return true;

    return tag.toLowerCase() === (me.username_tag || "").toLowerCase();
  } catch {
    return false;
  }
}

function applyProfileOwnerUI(isMy, { canInteract = true } = {}) {
  const actions = document.querySelector(".profile-page-actions");
  const editBtn = document.getElementById("editProfileBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const followBtn = document.getElementById("followBtn");
  const messageBtn = document.getElementById("messageBtn");
  const editUsernameBtn = document.querySelector(".profile-edit-username-btn");

  if (!isMy) {
    document.body.classList.add("foreign-profile");

    if (actions) actions.style.setProperty("display", canInteract ? "flex" : "none", "important");
    if (editBtn) editBtn.style.setProperty("display", "none", "important");
    if (settingsBtn) settingsBtn.style.setProperty("display", "none", "important");
    if (editUsernameBtn) editUsernameBtn.style.setProperty("display", "none", "important");

    if (followBtn) {
      followBtn.style.setProperty("display", canInteract ? "inline-flex" : "none", "important");
      followBtn.style.setProperty("visibility", canInteract ? "visible" : "hidden", "important");
      followBtn.style.setProperty("opacity", canInteract ? "1" : "0", "important");
    }

    if (!canInteract && messageBtn) {
      messageBtn.classList.add("profile-hidden");
      messageBtn.style.setProperty("display", "none", "important");
    }

    return;
  }

  document.body.classList.remove("foreign-profile");

  if (actions) actions.style.removeProperty("display");
  if (editBtn) editBtn.style.removeProperty("display");
  if (settingsBtn) settingsBtn.style.removeProperty("display");
  if (editUsernameBtn) editUsernameBtn.style.removeProperty("display");

  if (followBtn) {
    followBtn.style.setProperty("display", "none", "important");
  }
  if (messageBtn) {
    messageBtn.classList.add("profile-hidden");
    messageBtn.style.setProperty("display", "none", "important");
  }
}

async function handleProfileUI() {
  const params = new URLSearchParams(window.location.search);
  const tag = window.__profileTag || params.get("tag");

  try {
    const me = await getCurrentViewerProfile();
    if (!me) {
      applyProfileOwnerUI(false, { canInteract: false });
      return;
    }

    const isMy =
      !tag || tag.toLowerCase() === (me.username_tag || "").toLowerCase();

    applyProfileOwnerUI(isMy, { canInteract: true });
  } catch (err) {
    console.error("me error", err);
    applyProfileOwnerUI(false, { canInteract: false });
  }
}

async function initProfilePageFull() {
  const params = new URLSearchParams(window.location.search);
  const tag = window.__profileTag || params.get("tag");
  const hasSession = await hasProfileClientSession();

  if (!hasSession && !tag) {
    navigate("/login");
    return;
  }

  await handleProfileUI();
  await initProfileUser();

  if (typeof initAvatarCrop === "function") initAvatarCrop();
  if (typeof initCropControls === "function") initCropControls();
  if (typeof initPostEditor === "function") initPostEditor();
  if (typeof initTabs === "function") initTabs();
  if (typeof switchTab === "function") switchTab("posts");
  if (typeof initSettings === "function") initSettings();
  if (typeof initTrackModal === "function") initTrackModal();
  if (typeof initTrackTags === "function") initTrackTags();
  if (typeof initPosts === "function") initPosts();
  if (typeof initTracks === "function") initTracks();
}

window.handleProfileUI = handleProfileUI;
window.initProfilePageFull = initProfilePageFull;
window.isMyProfileAsync = isMyProfileAsync;
