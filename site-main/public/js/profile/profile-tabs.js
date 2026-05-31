function switchTab(tab) {
  document.querySelectorAll(".profile-tab-content").forEach((el) => {
    el.classList.remove("active");
  });

  document.querySelectorAll(".profile-tab-btn").forEach((el) => {
    el.classList.remove("active");
  });

  document.getElementById(`${tab}Tab`)?.classList.add("active");
  document.querySelector(`.profile-tab-btn[data-tab="${tab}"]`)?.classList.add("active");

  togglePostButton(tab);
  if (tab === "reposts" && typeof loadReposts === "function") {
    loadReposts();
  }
  if (tab === "mentions" && typeof loadMentions === "function") {
    loadMentions();
  }
  handleProfileUI();
}

function initTabs() {
  document.querySelectorAll(".profile-tab-content").forEach((el) => {
    el.classList.remove("active");
  });

  document.querySelectorAll(".profile-tab-btn").forEach((el) => {
    el.classList.remove("active");
  });

  switchTab("posts");
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
