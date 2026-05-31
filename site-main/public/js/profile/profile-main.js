async function getCurrentViewerProfile() {
  const hasSession = typeof window.hasActiveSession === "function"
    ? await window.hasActiveSession()
    : !!localStorage.getItem("token");

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

async function handleProfileUI() {
  const params = new URLSearchParams(window.location.search);
  const tag = window.__profileTag || params.get("tag");

  try {
    const me = await getCurrentViewerProfile();
    if (!me) return;

    const isMy =
      !tag || tag.toLowerCase() === (me.username_tag || "").toLowerCase();

    const actions = document.querySelector(".profile-page-actions");
    const editBtn = document.getElementById("editProfileBtn");
    const settingsBtn = document.getElementById("settingsBtn");
    const followBtn = document.getElementById("followBtn");
    const editUsernameBtn = document.querySelector(".profile-edit-username-btn");

    if (!isMy) {
      document.body.classList.add("foreign-profile");

      if (actions) actions.style.setProperty("display", "flex", "important");

      if (editBtn) editBtn.style.setProperty("display", "none", "important");
      if (settingsBtn) settingsBtn.style.setProperty("display", "none", "important");
      if (editUsernameBtn) {
        editUsernameBtn.style.setProperty("display", "none", "important");
      }

      if (followBtn) {
        followBtn.style.setProperty("display", "inline-flex", "important");
        followBtn.style.setProperty("visibility", "visible", "important");
        followBtn.style.setProperty("opacity", "1", "important");
      }
    } else {
      document.body.classList.remove("foreign-profile");

      if (actions) actions.style.removeProperty("display");

      if (editBtn) editBtn.style.removeProperty("display");
      if (settingsBtn) settingsBtn.style.removeProperty("display");
      if (editUsernameBtn) editUsernameBtn.style.removeProperty("display");

      if (followBtn) {
        followBtn.style.setProperty("display", "none", "important");
      }
    }
  } catch (err) {
    console.error("me error", err);
  }
}

async function initProfilePageFull() {
  const hasSession = typeof window.hasActiveSession === "function"
    ? await window.hasActiveSession()
    : !!localStorage.getItem("token");

  if (!hasSession) {
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
