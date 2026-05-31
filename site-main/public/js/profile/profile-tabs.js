function switchTab(tab) {
  const tabs = document.querySelector(".profile-tabs");

  document.querySelectorAll(".profile-tab-content").forEach((el) => {
    el.classList.remove("active");
  });

  document.querySelectorAll(".profile-tab-btn").forEach((el) => {
    el.classList.remove("active");
  });

  document.getElementById(`${tab}Tab`)?.classList.add("active");
  document.querySelector(`.profile-tab-btn[data-tab="${tab}"]`)?.classList.add("active");
  updateProfileTabIndicator();
  requestAnimationFrame(updateProfileTabIndicator);

  if (tabs) {
    tabs.classList.remove("is-switching");
    void tabs.offsetWidth;
    tabs.classList.add("is-switching");
    clearTimeout(tabs.__profileTabSwitchTimer);
    tabs.__profileTabSwitchTimer = setTimeout(() => {
      tabs.classList.remove("is-switching");
    }, 640);
  }

  togglePostButton(tab);
  if (tab === "reposts" && typeof loadReposts === "function") {
    loadReposts();
  }
  if (tab === "mentions" && typeof loadMentions === "function") {
    loadMentions();
  }
  handleProfileUI();
}

function updateProfileTabIndicator() {
  const tabs = document.querySelector(".profile-tabs");
  const active = tabs?.querySelector(".profile-tab-btn.active");
  if (!tabs || !active) return;
  if (active.offsetWidth < 8) {
    tabs.style.setProperty("--profile-tab-indicator-opacity", "0");
    return;
  }

  tabs.style.setProperty("--profile-tab-left", `${active.offsetLeft}px`);
  tabs.style.setProperty("--profile-tab-width", `${active.offsetWidth}px`);
  tabs.style.setProperty("--profile-tab-indicator-opacity", "1");
}

function initTabs() {
  document.querySelectorAll(".profile-tab-content").forEach((el) => {
    el.classList.remove("active");
  });

  document.querySelectorAll(".profile-tab-btn").forEach((el) => {
    el.classList.remove("active");
  });

  switchTab("posts");
  window.addEventListener("resize", updateProfileTabIndicator);
}

function togglePostButton(tab) {
  const btn = document.querySelector("#postsTab .profile-create-post-btn");

  if (!btn) return;

  if (tab === "posts") {
    btn.style.display = "";
  } else {
    btn.style.display = "none";
  }
}

window.switchTab = switchTab;
window.initTabs = initTabs;
window.updateProfileTabIndicator = updateProfileTabIndicator;
