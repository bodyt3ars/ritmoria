const token = localStorage.getItem("token");

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.innerText = text || "";
  }
}

function clearMessages() {
  setText("profileError", "");
  setText("profileSuccess", "");
  setText("editProfileError", "");
  setText("editProfileSuccess", "");
  setText("usernameError", "");
}

function normalizeUrl(url) {
  if (!url) return "";
  const value = url.trim();

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("mailto:")
  ) {
    return value;
  }

  return "https://" + value;
}

function tryParseUrl(value) {
  try {
    return new URL(normalizeUrl(value));
  } catch {
    return null;
  }
}

function validateProfileSocials({ soundcloud = "", instagram = "", telegram = "", website = "" }) {
  const cleanSoundcloud = soundcloud.trim();
  const cleanInstagram = instagram.trim();
  const cleanTelegram = telegram.trim();
  const cleanWebsite = website.trim();

  if (cleanSoundcloud) {
    const parsed = tryParseUrl(cleanSoundcloud);
    const host = parsed?.hostname?.toLowerCase() || "";
    if (!parsed || (!host.endsWith("soundcloud.com") && host !== "on.soundcloud.com")) {
      return { ok: false, error: "В SoundCloud можно вставить только ссылку на SoundCloud" };
    }
  }

  if (cleanInstagram) {
    const parsed = tryParseUrl(cleanInstagram);
    const host = parsed?.hostname?.toLowerCase() || "";
    if (!parsed || !host.endsWith("instagram.com")) {
      return { ok: false, error: "В Instagram можно вставить только ссылку на Instagram" };
    }
  }

  if (cleanTelegram) {
    const value = cleanTelegram.replace(/^https?:\/\//i, "").toLowerCase();
    const looksLikeHandle = /^@[a-z0-9_]{4,32}$/i.test(cleanTelegram);
    const looksLikeTelegramUrl = /^(t\.me|telegram\.me)\//i.test(value);
    if (!looksLikeHandle && !looksLikeTelegramUrl) {
      return { ok: false, error: "В Telegram можно вставить только @username или ссылку t.me" };
    }
  }

  if (cleanWebsite && !tryParseUrl(cleanWebsite)) {
    return { ok: false, error: "Ссылка Website выглядит некорректно" };
  }

  return { ok: true };
}

function normalizeTelegram(value) {
  if (!value) return "";
  const telegram = value.trim();

  if (telegram.startsWith("https://t.me/")) return telegram;
  if (telegram.startsWith("http://t.me/")) {
    return telegram.replace("http://", "https://");
  }
  if (telegram.startsWith("@")) return `https://t.me/${telegram.slice(1)}`;
  if (telegram.includes("t.me/")) return normalizeUrl(telegram);

  return `https://t.me/${telegram}`;
}

function renderSocialLinks(user) {
  const socialLinks = document.getElementById("socialLinks");
  if (!socialLinks) return;

  socialLinks.innerHTML = "";

  const items = [
    {
      value: user.soundcloud,
      href: normalizeUrl(user.soundcloud),
      className: "soundcloud",
      iconClass: "fa-brands fa-soundcloud",
      title: "SoundCloud"
    },
    {
      value: user.instagram,
      href: normalizeUrl(user.instagram),
      className: "instagram",
      iconClass: "fa-brands fa-instagram",
      title: "Instagram"
    },
    {
      value: user.telegram,
      href: normalizeTelegram(user.telegram),
      className: "telegram",
      iconClass: "fa-brands fa-telegram",
      title: "Telegram"
    },
    {
      value: user.website,
      href: normalizeUrl(user.website),
      className: "website",
      iconClass: "fa-solid fa-globe",
      title: "Website"
    }
  ];

  items.forEach((item) => {
    if (!item.value) return;

    const link = document.createElement("a");
    link.href = item.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = `profile-social-link ${item.className}`;
    link.title = item.title;
    link.setAttribute("aria-label", item.title);

    const icon = document.createElement("i");
    icon.className = item.iconClass;

    link.appendChild(icon);
    socialLinks.appendChild(link);
  });
}

function renderVerifiedBadge(user) {
  const badge = document.getElementById("verifiedBadge");
  if (!badge) return;

  badge.classList.toggle("profile-hidden", !user?.is_verified);
}

function initProfileBioCounter() {
  const bioInput = document.getElementById("editBio");
  const bioCount = document.getElementById("bioCount");

  if (!bioInput || !bioCount) return;
  if (bioInput.dataset.bioCounterBound === "true") {
    bioCount.textContent = bioInput.value.length;
    return;
  }

  bioInput.dataset.bioCounterBound = "true";
  bioCount.textContent = bioInput.value.length;

  bioInput.addEventListener("input", () => {
    bioCount.textContent = bioInput.value.length;
  });
}

const PROFILE_RANK_TIERS = [
  { rank: 1, rankName: "Новичок", minXp: 0 },
  { rank: 2, rankName: "Слушатель", minXp: 500 },
  { rank: 3, rankName: "Артист", minXp: 2000 },
  { rank: 4, rankName: "Хитмейкер", minXp: 6000 },
  { rank: 5, rankName: "Легенда", minXp: 15000 }
];

function getRankData(xp) {
  const safeXp = Math.max(0, Number(xp || 0));
  let currentTier = PROFILE_RANK_TIERS[0];

  PROFILE_RANK_TIERS.forEach((tier) => {
    if (safeXp >= tier.minXp) {
      currentTier = tier;
    }
  });

  const nextTier = PROFILE_RANK_TIERS.find((tier) => tier.minXp > currentTier.minXp) || null;
  const prevLevel = currentTier.minXp;
  const nextLevel = nextTier ? nextTier.minXp : null;
  const progress = nextTier
    ? Math.max(0, Math.min(100, ((safeXp - prevLevel) / (nextLevel - prevLevel)) * 100))
    : 100;

  return {
    xp: safeXp,
    rank: currentTier.rank,
    rankName: currentTier.rankName,
    nextLevel,
    prevLevel,
    progress,
    icon: `/images/ranks/${currentTier.rank}.png`,
    isMaxRank: !nextTier,
    xpForNextRank: nextTier ? Math.max(0, nextLevel - safeXp) : 0
  };
}

function normalizeRankState(rankStateOrXp) {
  if (
    rankStateOrXp &&
    typeof rankStateOrXp === "object" &&
    typeof rankStateOrXp.rank !== "undefined" &&
    typeof rankStateOrXp.progress !== "undefined"
  ) {
    return {
      ...rankStateOrXp,
      xp: Number(rankStateOrXp.xp || 0),
      rank: Number(rankStateOrXp.rank || 1),
      progress: Number(rankStateOrXp.progress || 0),
      prevLevel: Number(rankStateOrXp.prevLevel || 0),
      nextLevel: rankStateOrXp.nextLevel === null ? null : Number(rankStateOrXp.nextLevel || 0),
      icon: rankStateOrXp.icon || `/images/ranks/${Number(rankStateOrXp.rank || 1)}.png`,
      isMaxRank: Boolean(rankStateOrXp.isMaxRank || rankStateOrXp.nextLevel === null)
    };
  }

  return getRankData(Number(rankStateOrXp || 0));
}

function formatRankXpText(rankState) {
  if (!rankState) return "0 XP / 500";
  if (rankState.isMaxRank || rankState.nextLevel === null) {
    return `${rankState.xp} XP / MAX`;
  }

  return `${rankState.xp} XP / ${rankState.nextLevel}`;
}

function updateRankUI(rankStateInput) {
  const rankState = normalizeRankState(rankStateInput);
  const rankIcon = document.getElementById("rankIcon");
  const rankXpFill = document.getElementById("rankXpFill");
  const rankXpText = document.getElementById("rankXpText");
  const rankNameEl = document.getElementById("rankName");

  if (rankIcon) rankIcon.src = rankState.icon;
  if (rankXpFill) rankXpFill.style.width = `${rankState.progress}%`;
  if (rankXpText) rankXpText.innerText = formatRankXpText(rankState);
  if (rankNameEl) rankNameEl.innerText = rankState.rankName;

  return rankState;
}

function showRankUp(rankData, previousRankData = null, gainedXP = 0) {
  const overlay = document.getElementById("rankUpOverlay");
  const medal = document.getElementById("rankUpMedal");
  const title = document.getElementById("rankUpTitle");
  const transition = document.getElementById("rankUpTransition");
  const gain = document.getElementById("rankUpGain");
  const subtitle = document.getElementById("rankUpSubtitle");

  if (!overlay || !medal || !title) return;

  medal.src = rankData.icon || `/images/ranks/${rankData.rank}.png`;
  title.innerText = rankData.rankName;
  if (transition) {
    transition.innerText = previousRankData
      ? `${previousRankData.rankName} -> ${rankData.rankName}`
      : `Ранг ${rankData.rank}`;
  }
  if (gain) {
    gain.innerText = gainedXP > 0 ? `+${gainedXP} XP` : "Новый ранг";
  }
  if (subtitle) {
    subtitle.innerText = rankData.isMaxRank
      ? "Ты добрался до максимального ранга в РИТМОРИИ"
      : "Ранг поднят. Вайб тоже.";
  }

  document.body.classList.remove("rank-up-active");
  overlay.classList.remove("show");
  void overlay.offsetWidth;

  document.body.classList.add("rank-up-active");
  overlay.classList.add("show");

  setTimeout(() => {
    overlay.classList.remove("show");
    document.body.classList.remove("rank-up-active");
  }, 3400);
}

async function applyXPAndCheckRank(xpGained, newXP, nextRankState = null) {
  if (!xpGained || xpGained <= 0) return;

  showXP(xpGained);

  const oldXP = typeof nextRankState?.previousXp !== "undefined"
    ? Number(nextRankState.previousXp)
    : Number(window.currentProfile?.xp || Math.max(0, Number(newXP || 0) - Number(xpGained || 0)));
  const before = normalizeRankState(window.currentProfile?.rank_state || oldXP);
  const after = normalizeRankState(nextRankState || { xp: Number(newXP || oldXP) });

  if (window.currentProfile) {
    window.currentProfile.xp = Number(after.xp || oldXP);
    window.currentProfile.rank_state = after;
  }

  updateRankUI(after);

  if (after.rank > before.rank) {
    showRankUp(after, before, xpGained);
  }
}

window.applyXPAndCheckRank = applyXPAndCheckRank;

async function loadProfile() {
  clearMessages();

  try {
    const params = new URLSearchParams(window.location.search);
    const tag = window.__profileTag || params.get("tag");

    let url = "/api/profile";
    if (tag) {
      url += `?tag=${tag}`;
    }

    const res = await fetch(url, {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) {
      throw new Error("Ошибка загрузки профиля");
    }

    const user = await res.json();

const rankData = normalizeRankState(user.rank_state || Number(user.xp || 0));
user.rank_state = rankData;
updateRankUI(rankData);

    window.currentProfile = user;

    if (typeof fillProfileEditor === "function") {
      fillProfileEditor(user);
    }

    setText("username", user.username);
    setText("usernameTag", user.username_tag ? "@" + user.username_tag : "");
    renderVerifiedBadge(user);

    const bioEl = document.getElementById("bio");
    if (!bioEl) return user;

    if (!user.bio || user.bio.trim() === "") {
      bioEl.style.display = "none";
    } else {
      bioEl.style.display = "block";
      bioEl.innerText = user.bio;
    }

    let avatar = user.avatar;
    if (!avatar || avatar === "" || avatar === "null") {
      avatar = "/images/default-avatar.jpg";
    }

    const avatarEl = document.getElementById("avatar");
    if (avatarEl) {
      avatarEl.src = avatar + "?t=" + Date.now();
    }

    const editUsernameEl = document.getElementById("editUsername");
    const editBioEl = document.getElementById("editBio");
    const editAvatarEl = document.getElementById("editAvatar");
    const editSoundcloudEl = document.getElementById("editSoundcloud");
    const editInstagramEl = document.getElementById("editInstagram");
    const editTwitterEl = document.getElementById("editTwitter");
    const editTelegramEl = document.getElementById("editTelegram");
    const editWebsiteEl = document.getElementById("editWebsite");
    const editUsernameTagEl = document.getElementById("editUsernameTag");
    const bioCount = document.getElementById("bioCount");

    if (editUsernameEl) editUsernameEl.value = user.username || "";
    if (editUsernameTagEl) editUsernameTagEl.value = user.username_tag || "";
    if (editBioEl) editBioEl.value = user.bio || "";
    if (bioCount && editBioEl) bioCount.textContent = editBioEl.value.length;
    if (editAvatarEl) editAvatarEl.value = user.avatar || "";
    if (editSoundcloudEl) editSoundcloudEl.value = user.soundcloud || "";
    if (editInstagramEl) editInstagramEl.value = user.instagram || "";
    if (editTwitterEl) editTwitterEl.value = user.twitter || "";
    if (editTelegramEl) editTelegramEl.value = user.telegram || "";
    if (editWebsiteEl) editWebsiteEl.value = user.website || "";

    renderSocialLinks(user);

    await loadFollowCounts(user.id);
    await initFollowSystem();

    return user;
  } catch (error) {
    console.error(error);
    setText("profileError", "Не удалось загрузить профиль");
    return null;
  }
}

async function openEdit() {
  if (!(await isMyProfileAsync())) {
    alert("Это не твой профиль 😈");
    return;
  }

  const modal = document.getElementById("editModal");
  if (modal) modal.style.display = "flex";
  if (typeof window.setProfileComposerMode === "function") {
    window.setProfileComposerMode(true);
  } else {
    document.body.classList.add("profile-composer-open");
  }
}

function closeEdit() {
  const modal = document.getElementById("editModal");
  if (modal) modal.style.display = "none";
  setText("editProfileError", "");
  setText("editProfileSuccess", "");
  if (typeof window.setProfileComposerMode === "function") {
    window.setProfileComposerMode(false);
  } else {
    document.body.classList.remove("profile-composer-open");
  }
}

function editUsername() {
  const editBox = document.getElementById("usernameEditBox");
  const usernameInput = document.getElementById("usernameInput");
  const username = document.getElementById("username");

  if (!editBox || !usernameInput || !username) return;

  if (!editBox.classList.contains("profile-hidden")) {
    editBox.classList.add("profile-hidden");
    return;
  }

  setText("usernameError", "");
  usernameInput.value = username.innerText.trim();
  editBox.classList.remove("profile-hidden");
  usernameInput.focus();
}

function cancelUsernameEdit() {
  const editBox = document.getElementById("usernameEditBox");
  setText("usernameError", "");
  if (editBox) editBox.classList.add("profile-hidden");
}

async function saveUsername() {
  if (!(await isMyProfileAsync())) {
    alert("Это не твой профиль 😈");
    return;
  }

  const username = document.getElementById("usernameInput")?.value.trim() || "";
  const usernameTag = document.getElementById("editUsernameTag")?.value.trim() || window.currentProfile?.username_tag || "";

  setText("usernameError", "");
  setText("profileError", "");

  if (!username) {
    setText("usernameError", "Ник не может быть пустым");
    return;
  }

  try {
    const res = await fetch("/update-profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({
        username,
        username_tag: usernameTag
      })
    });

    const data = await res.json();

    if (!res.ok) {
      if (data.error === "username_taken") {
        setText("usernameError", "Этот никнейм уже используется");
        return;
      }

      if (data.error === "username_tag_taken") {
        setText("usernameError", "Твой username_tag сейчас конфликтует. Открой редактирование профиля и сохрани username заново.");
        return;
      }

    setText("usernameError", window.getApiErrorMessage?.(data, "Не удалось изменить ник") || "Не удалось изменить ник");
      return;
    }

    document.getElementById("username").innerText = data.username || username;
    if (window.currentProfile) {
      window.currentProfile.username = data.username || username;
      window.currentProfile.username_tag = data.username_tag || usernameTag;
    }
    const editUsernameEl = document.getElementById("editUsername");
    if (editUsernameEl) editUsernameEl.value = data.username || username;
    const usernameTagEl = document.getElementById("usernameTag");
    if (usernameTagEl) usernameTagEl.innerText = (data.username_tag || usernameTag) ? "@" + (data.username_tag || usernameTag) : "";

    cancelUsernameEdit();
  } catch (error) {
    console.error(error);
    setText("usernameError", "Не удалось изменить ник");
  }
}

async function saveProfile() {
  if (!(await isMyProfileAsync())) {
    alert("Это не твой профиль 😈");
    return;
  }

  clearMessages();

  const username = document.getElementById("editUsername")?.value.trim() || "";
  const username_tag = document.getElementById("editUsernameTag")?.value.trim() || "";
  const bio = document.getElementById("editBio")?.value.trim() || "";
  const soundcloud = document.getElementById("editSoundcloud")?.value.trim() || "";
  const instagram = document.getElementById("editInstagram")?.value.trim() || "";
  const telegram = document.getElementById("editTelegram")?.value.trim() || "";
  const website = document.getElementById("editWebsite")?.value.trim() || "";

  if (!username) {
    setText("editProfileError", "Ник не может быть пустым");
    return;
  }

  if (bio.length > 200) {
    setText("editProfileError", "Описание максимум 200 символов");
    return;
  }

  const socialsValidation = validateProfileSocials({
    soundcloud,
    instagram,
    telegram,
    website
  });

  if (!socialsValidation.ok) {
    setText("editProfileError", socialsValidation.error);
    return;
  }

  try {
    const res = await fetch("/update-profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({
        username,
        username_tag,
        bio,
        soundcloud,
        instagram,
        telegram,
        website
      })
    });

    const data = await res.json();

    if (!res.ok) {
      if (data.error === "username_taken") {
        setText("editProfileError", "Этот ник уже используется");
        return;
      }

      if (data.error === "username_tag_taken") {
        setText("editProfileError", "Этот username уже занят");
        return;
      }

      if (data.error === "invalid_soundcloud_link") {
        setText("editProfileError", "В поле SoundCloud можно вставить только ссылку на SoundCloud");
        return;
      }

      if (data.error === "invalid_instagram_link") {
        setText("editProfileError", "В поле Instagram можно вставить только ссылку на Instagram");
        return;
      }

      if (data.error === "invalid_telegram_link") {
        setText("editProfileError", "В поле Telegram можно вставить только @username или ссылку t.me");
        return;
      }

      if (data.error === "invalid_website_link") {
        setText("editProfileError", "В поле Website ссылка выглядит некорректно");
        return;
      }

    setText("editProfileError", window.getApiErrorMessage?.(data, "Не удалось сохранить профиль") || "Не удалось сохранить профиль");
      return;
    }

    closeEdit();
    setText("profileSuccess", "Профиль сохранён");

    await loadProfile();
    await handleProfileUI();
    if (typeof loadNavbarUser === "function") {
      await loadNavbarUser();
    }
  } catch (error) {
    console.error(error);
    setText("editProfileError", "Не удалось сохранить профиль");
  }
}

async function initProfileUser() {
  const data = await loadProfile();
  window.currentProfile = data;
  initProfileBioCounter();
}

window.openEdit = openEdit;
window.closeEdit = closeEdit;
window.saveProfile = saveProfile;
window.editUsername = editUsername;
window.saveUsername = saveUsername;
window.cancelUsernameEdit = cancelUsernameEdit;
window.initProfileUser = initProfileUser;

async function getProfileId() {
  const params = new URLSearchParams(window.location.search);
  const tag = window.__profileTag || params.get("tag");

  let url = "/api/profile";
  if (tag) url += "?tag=" + tag;

  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + token }
  });

  const user = await res.json();
  return user.id;
}

async function initFollowSystem() {
  const btn = document.getElementById("followBtn");
  const messageBtn = document.getElementById("messageBtn");
  const actions = document.querySelector(".profile-page-actions");
  if (!btn || !actions) return;

  const token = localStorage.getItem("token");
  if (!token) return;

  const params = new URLSearchParams(window.location.search);
  const tag = window.__profileTag || params.get("tag");

  if (!tag) {
    btn.style.setProperty("display", "none", "important");
    if (messageBtn) {
      messageBtn.classList.add("profile-hidden");
      messageBtn.style.setProperty("display", "none", "important");
    }
    const myId = await getProfileId();
    await loadFollowCounts(myId);
    return;
  }

  let myTag = "";

  try {
    const meRes = await fetch("/me", {
      headers: { Authorization: "Bearer " + token }
    });

    const me = await meRes.json();
    myTag = (me.username_tag || "").toLowerCase();
  } catch (e) {
    console.error("me error", e);
  }

  if (tag.toLowerCase() === myTag) {
    btn.style.setProperty("display", "none", "important");
    if (messageBtn) {
      messageBtn.classList.add("profile-hidden");
      messageBtn.style.setProperty("display", "none", "important");
    }
    return;
  }

  actions.style.setProperty("display", "flex", "important");
  btn.style.setProperty("display", "inline-flex", "important");
  btn.style.setProperty("visibility", "visible", "important");
  btn.style.setProperty("opacity", "1", "important");
  if (messageBtn) {
    messageBtn.classList.remove("profile-hidden");
    messageBtn.style.setProperty("display", "inline-flex", "important");
  }

  const profileId = await getProfileId();

  const statusRes = await fetch(`/follow-status/${profileId}`, {
    headers: { Authorization: "Bearer " + token }
  });

  const status = await statusRes.json();

  updateFollowBtn(btn, status.following);
  await loadFollowCounts(profileId);

  if (messageBtn) {
    messageBtn.onclick = async () => {
      try {
        const startRes = await fetch("/api/messages/start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token
          },
          body: JSON.stringify({ targetId: profileId })
        });

        const startData = await startRes.json().catch(() => ({}));
        if (!startRes.ok || !startData.conversationId) {
          setText("profileError", "Не удалось открыть диалог");
          return;
        }

        navigate(`/messages?conversation=${startData.conversationId}`);
      } catch (error) {
        console.error(error);
        setText("profileError", "Не удалось открыть диалог");
      }
    };
  }

  btn.onclick = async () => {
    const res = await fetch(`/follow/${profileId}`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token }
    });

    const data = await res.json();

    updateFollowBtn(btn, data.following);
    updateFollowCountsInstant(data.following);
    await loadFollowCounts(profileId);
  };
}

function updateFollowBtn(btn, following) {
  if (following) {
    btn.innerHTML = '<i class="fa-solid fa-user-minus"></i> Отписаться';
    btn.classList.add("secondary-btn");
  } else {
    btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Подписаться';
    btn.classList.remove("secondary-btn");
  }
}

async function loadFollowCounts(userId) {
  const token = localStorage.getItem("token");

  const followers = await fetch(`/followers-count/${userId}`, {
    headers: { Authorization: "Bearer " + token }
  }).then((r) => r.json());

  const following = await fetch(`/following-count/${userId}`, {
    headers: { Authorization: "Bearer " + token }
  }).then((r) => r.json());

  const followersEl = document.getElementById("followersCount");
  const followingEl = document.getElementById("followingCount");

  const newFollowers = Number(followers.count) || 0;
  const newFollowing = Number(following.count) || 0;

  animateCount(followersEl, newFollowers);
  animateCount(followingEl, newFollowing);
}

const counters = new Map();

function animateCount(el, newValue) {
  if (!el) return;

  if (counters.has(el)) {
    cancelAnimationFrame(counters.get(el));
  }

  const start = Number(el.dataset.value || el.innerText || 0);
  const duration = 250;
  const startTime = performance.now();

  function update(time) {
    const progress = Math.min((time - startTime) / duration, 1);
    const value = Math.round(start + (newValue - start) * progress);

    el.innerText = value;
    el.dataset.value = value;

    if (progress < 1) {
      const id = requestAnimationFrame(update);
      counters.set(el, id);
    } else {
      el.dataset.value = newValue;
      counters.delete(el);
      el.style.transform = "scale(1.15)";
      el.style.color = "#ff4d9d";

      setTimeout(() => {
        el.style.transform = "scale(1)";
        el.style.color = "";
      }, 180);
    }
  }

  const id = requestAnimationFrame(update);
  counters.set(el, id);
}

async function openFollowModal(type) {
  const modal = document.getElementById("followModal");
  const list = document.getElementById("followList");
  const title = document.getElementById("followTitle");

  if (!modal || !list || !title) return;

  modal.style.display = "flex";
  list.innerHTML = "Загрузка...";

  const targetId = await getProfileId();

  let url = "";

  if (type === "followers") {
    title.innerText = "Подписчики";
    url = `/followers/${targetId}`;
  } else {
    title.innerText = "Подписки";
    url = `/following/${targetId}`;
  }

  const res = await fetch(url);
  const users = await res.json();

  list.innerHTML = "";

  users.forEach((user) => {
    list.innerHTML += `
      <div class="follow-item" onclick="goToUserProfile('${user.username_tag}')">
        <img class="follow-avatar" src="${user.avatar || "/images/default-avatar.jpg"}">
        <div class="follow-info">
          <div class="follow-name">${user.username}</div>
          <div class="follow-tag">@${user.username_tag}</div>
        </div>
        <div class="follow-action">
          <i class="fa-solid fa-chevron-right"></i>
        </div>
      </div>
    `;
  });
}

function closeFollowModal() {
  const modal = document.getElementById("followModal");
  if (modal) modal.style.display = "none";
}

function goToUserProfile(tag) {
  navigate(`/${tag}`);
}

function updateFollowCountsInstant(isFollowing) {
  const followersEl = document.getElementById("followersCount");

  let current = Number(followersEl?.dataset.value || followersEl?.innerText || 0);

  if (isFollowing) {
    animateCount(followersEl, current + 1);
  } else {
    animateCount(followersEl, Math.max(0, current - 1));
  }
}

window.openFollowModal = openFollowModal;
window.closeFollowModal = closeFollowModal;
window.goToUserProfile = goToUserProfile;
window.initFollowSystem = initFollowSystem;
window.loadFollowCounts = loadFollowCounts;

function showXP(amount) {
  const toast = document.getElementById("xpToast");
  if (!toast) return;

  toast.innerText = `+${amount} XP`;
  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}

window.showXP = showXP;
