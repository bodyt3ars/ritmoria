function getPrivacyToken() {
  return localStorage.getItem("token") || "";
}

function getValue(id) {
  return document.getElementById(id)?.value.trim() || "";
}

function setLoading(btn, state) {
  if (!btn) return;
  btn.disabled = state;
  btn.style.opacity = state ? "0.6" : "1";
}

async function changePassword() {
  const currentPassword = getValue("currentPassword");
  const newPassword = getValue("newPassword");
  const btn = event?.target;

  if (!currentPassword || !newPassword) {
    alert("Заполни все поля");
    return;
  }

  setLoading(btn, true);

  try {
    const res = await fetch("/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + getPrivacyToken()
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    if (!res.ok) {
      throw new Error();
    }

    alert("Пароль изменён");

    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";

  } catch {
    alert("Ошибка смены пароля");
  } finally {
    setLoading(btn, false);
  }
}

async function changeEmail() {
  const newEmail = getValue("newEmail");
  const btn = event?.target;

  if (!newEmail) {
    alert("Введите почту");
    return;
  }

  setLoading(btn, true);

  try {
    const res = await fetch("/change-email-send-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + getPrivacyToken()
      },
      body: JSON.stringify({ email: newEmail })
    });

    if (!res.ok) {
      throw new Error();
    }

    alert("Почта изменена");

    document.getElementById("newEmail").value = "";

  } catch {
    alert("Ошибка смены почты");
  } finally {
    setLoading(btn, false);
  }
}

async function deleteAccount() {
  const btn = event?.target;

  if (!confirm("Ты точно хочешь удалить аккаунт?")) return;

  setLoading(btn, true);

  try {
    const res = await fetch("/delete-account", {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + getPrivacyToken()
      }
    });

    if (!res.ok) {
      throw new Error();
    }

    if (typeof window.performServerLogout === "function") {
      await window.performServerLogout("/register");
    } else {
      window.location.assign("/register");
    }

  } catch {
    alert("Ошибка удаления аккаунта");
  } finally {
    setLoading(btn, false);
  }
}

window.changePassword = changePassword;
window.changeEmail = changeEmail;
window.deleteAccount = deleteAccount;

window.initPrivacyPage = function () {
  const root = document.querySelector(".privacy-page");

  if (!root) {
    console.log("❌ privacy page not found");
    return;
  }

  if (!getPrivacyToken()) {
    navigate("/login");
    return;
  }
};
