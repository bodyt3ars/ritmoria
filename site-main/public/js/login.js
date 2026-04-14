function initLoginPage() {
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("error");
  const loginInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const telegramAuthBtn = document.getElementById("telegramAuthBtn");
  const telegramAuthStatus = document.getElementById("telegramAuthStatus");
  const telegramAuthLink = document.getElementById("telegramAuthLink");
  let telegramAuthPoll = null;

  if (!loginForm) return;
  if (loginForm.dataset.authInitialized === "true") return;
  loginForm.dataset.authInitialized = "true";

  function setError(message = "") {
    if (loginError) {
      loginError.innerText = message;
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setError("");

    const login = loginInput?.value.trim() || "";
    const password = passwordInput?.value || "";

    if (!login || !password) {
      setError("Заполни email/@username и пароль");
      return;
    }

    try {
      const response = await fetch("/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ login, password })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(window.getApiErrorMessage?.(data, "Неверный email или пароль") || "Неверный email или пароль");
        return;
      }

      if (!data?.token) {
        setError("Сервер не вернул токен");
        return;
      }

      localStorage.setItem("token", data.token);

      if (window.refreshNavbarRealtimeState) {
        await window.refreshNavbarRealtimeState();
      } else {
        if (window.loadNavbarUser) {
          await window.loadNavbarUser();
        }
        if (window.loadNavbarNotifications) {
          await window.loadNavbarNotifications();
        }
        if (window.loadNavbarMessagesBadge) {
          await window.loadNavbarMessagesBadge();
        }
      }

      navigate("/");
    } catch (error) {
      console.error("Login error:", error);
      setError("Ошибка сервера");
    }
  });

  function setTelegramStatus(message = "") {
    if (telegramAuthStatus) {
      telegramAuthStatus.innerText = message;
    }
  }

  function stopTelegramPolling() {
    if (telegramAuthPoll) {
      clearInterval(telegramAuthPoll);
      telegramAuthPoll = null;
    }
  }

  async function startTelegramAuth() {
    try {
      setError("");
      stopTelegramPolling();

      if (telegramAuthBtn) {
        telegramAuthBtn.disabled = true;
      }

      const popup = window.open("", "_blank");

      const response = await fetch("/telegram-auth/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ mode: "login" })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (popup) popup.close();
        setError(window.getApiErrorMessage?.(data, "Ошибка входа через Telegram") || "Ошибка входа через Telegram");
        if (telegramAuthBtn) {
          telegramAuthBtn.disabled = false;
        }
        return;
      }

      if (!data?.requestToken || !data?.authUrl) {
        if (popup) popup.close();
        setError("Не удалось запустить вход через Telegram");
        if (telegramAuthBtn) {
          telegramAuthBtn.disabled = false;
        }
        return;
      }

      if (popup && !popup.closed) {
        popup.location.replace(data.authUrl);
      } else {
        window.location.href = data.authUrl;
      }

      if (telegramAuthLink) {
        telegramAuthLink.href = data.authUrl;
        telegramAuthLink.classList.remove("auth-hidden");
      }

      setTelegramStatus("Открой бота, нажми Start и подтверди вход. Как только разрешишь вход, сайт продолжит автоматически.");

      telegramAuthPoll = setInterval(async () => {
        try {
          const statusResponse = await fetch(`/telegram-auth/status/${encodeURIComponent(data.requestToken)}`);
          const statusData = await statusResponse.json().catch(() => ({}));

          if (!statusResponse.ok) {
            stopTelegramPolling();
            setError(window.getApiErrorMessage?.(statusData, "Не удалось проверить статус входа") || "Не удалось проверить статус входа");
            if (telegramAuthBtn) {
              telegramAuthBtn.disabled = false;
            }
            return;
          }

          if (statusData.status === "approved" && statusData.token) {
            stopTelegramPolling();
            localStorage.setItem("token", statusData.token);

            if (window.refreshNavbarRealtimeState) {
              await window.refreshNavbarRealtimeState();
            } else {
              if (window.loadNavbarUser) {
                await window.loadNavbarUser();
              }
              if (window.loadNavbarNotifications) {
                await window.loadNavbarNotifications();
              }
              if (window.loadNavbarMessagesBadge) {
                await window.loadNavbarMessagesBadge();
              }
            }

            navigate("/");
            return;
          }

          if (statusData.status === "rejected") {
            stopTelegramPolling();
            setError("Вход через Telegram был отклонён");
            setTelegramStatus("");
            if (telegramAuthBtn) {
              telegramAuthBtn.disabled = false;
            }
          }
        } catch (pollError) {
          console.error("Telegram status error:", pollError);
        }
      }, 2000);
    } catch (error) {
      console.error("Telegram login error:", error);
      setError("Ошибка входа через Telegram");
      setTelegramStatus("");
      if (telegramAuthBtn) {
        telegramAuthBtn.disabled = false;
      }
    }
  }

  if (telegramAuthBtn) {
    telegramAuthBtn.addEventListener("click", startTelegramAuth);
  }
}

window.initLoginPage = initLoginPage;
