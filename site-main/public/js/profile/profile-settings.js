function openSettings() {
  const modal = document.getElementById("settingsModal");
  if (modal) modal.style.display = "flex";
  if (typeof window.setProfileComposerMode === "function") {
    window.setProfileComposerMode(true);
  } else {
    document.body.classList.add("profile-composer-open");
  }
}

function closeSettings() {
  const modal = document.getElementById("settingsModal");
  if (modal) modal.style.display = "none";
  if (typeof window.setProfileComposerMode === "function") {
    window.setProfileComposerMode(false);
  } else {
    document.body.classList.remove("profile-composer-open");
  }
}

function changeEmail() {
  const newEmail = document.getElementById("newEmail")?.value.trim();
  const currentPassword = document.getElementById("currentPassword")?.value.trim();

  if (!newEmail) {
    alert("Введите новую почту");
    return;
  }

  if (!currentPassword) {
    alert("Введите текущий пароль");
    return;
  }

  alert("Функция изменения почты будет добавлена позже");
}

function changePassword() {
  const currentPassword = document.getElementById("currentPassword")?.value.trim();
  const newPassword = document.getElementById("newPassword")?.value.trim();

  if (!currentPassword) {
    alert("Введите текущий пароль");
    return;
  }

  if (!newPassword) {
    alert("Введите новый пароль");
    return;
  }

  alert("Функция изменения пароля будет добавлена позже");
}

function initSettings() {
  const modal = document.getElementById("settingsModal");
  if (!modal || modal.dataset.bound === "true") return;

  modal.dataset.bound = "true";

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeSettings();
    }
  });
}

window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.changeEmail = changeEmail;
window.changePassword = changePassword;
window.initSettings = initSettings;
