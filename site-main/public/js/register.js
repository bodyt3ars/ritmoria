function initRegisterPage() {
  const registerForm = document.getElementById("registerForm");
  const registerError = document.getElementById("error");

  const usernameInput = document.getElementById("username");
  const usernameTagInput = document.getElementById("usernameTag");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const password2Input = document.getElementById("password2");

  const emailStatus = document.getElementById("emailStatus");
  const tagStatus = document.getElementById("tagStatus");

  const codeModal = document.getElementById("codeModal");
  const codeInput = document.getElementById("codeInput");
  const codeError = document.getElementById("codeError");
  const confirmCodeBtn = document.getElementById("confirmCodeBtn");
  const cancelCodeBtn = document.getElementById("cancelCodeBtn");
  const telegramAuthBtn = document.getElementById("telegramAuthBtn");
  const telegramAuthStatus = document.getElementById("telegramAuthStatus");
  const telegramAuthLink = document.getElementById("telegramAuthLink");
  let telegramAuthPoll = null;

  if (!registerForm) return;
  if (registerForm.dataset.authInitialized === "true") return;
  registerForm.dataset.authInitialized = "true";

  let emailCheckTimeout = null;
  let tagCheckTimeout = null;
  let pendingRegistrationData = null;

  function setFieldState(input, state) {
    if (!input) return;

    input.classList.remove("auth-input-valid", "auth-input-invalid");

    if (state === "valid") {
      input.classList.add("auth-input-valid");
    }

    if (state === "invalid") {
      input.classList.add("auth-input-invalid");
    }
  }

  function setStatusText(element, text, color = "") {
    if (!element) return;
    element.innerText = text;
    element.style.color = color;
  }

  function setRegisterError(message = "") {
    if (!registerError) return;
    registerError.innerText = message;
  }

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

  function openCodeModal() {
    if (!codeModal) return;
    codeModal.classList.remove("auth-hidden");

    if (codeError) {
      codeError.innerText = "";
    }

    if (codeInput) {
      codeInput.value = "";
      codeInput.focus();
    }
  }

  function closeCodeModal() {
    if (!codeModal) return;
    codeModal.classList.add("auth-hidden");

    if (codeError) {
      codeError.innerText = "";
    }
  }

  async function checkEmailAvailability(email) {
    const response = await fetch(`/check-email/${encodeURIComponent(email)}`);
    return response.json();
  }

  async function checkTagAvailability(tag) {
    const response = await fetch(`/check-tag/${encodeURIComponent(tag)}`);
    return response.json();
  }

  async function completeRegistration() {
    if (!pendingRegistrationData) return;

    const response = await fetch("/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(pendingRegistrationData)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (codeError) {
        codeError.innerText = window.getApiErrorMessage?.(data, "Ошибка регистрации") || "Ошибка регистрации";
      }
      return;
    }

    closeCodeModal();
    navigate("/login");
  }

  if (emailInput) {
    emailInput.addEventListener("input", () => {
      clearTimeout(emailCheckTimeout);

      const email = emailInput.value.trim();

      if (!email) {
        setStatusText(emailStatus, "");
        setFieldState(emailInput, "");
        return;
      }

      if (!email.includes("@")) {
        setStatusText(emailStatus, "Некорректный email", "#ef4444");
        setFieldState(emailInput, "invalid");
        return;
      }

      setStatusText(emailStatus, "Проверка...", "#a78bfa");
      setFieldState(emailInput, "");

      emailCheckTimeout = setTimeout(async () => {
        try {
          const data = await checkEmailAvailability(email);

          if (data.available) {
            setStatusText(emailStatus, "Доступно", "#22c55e");
            setFieldState(emailInput, "valid");
          } else {
            setStatusText(emailStatus, "Уже используется", "#ef4444");
            setFieldState(emailInput, "invalid");
          }
        } catch (error) {
          console.error("Email check error:", error);
          setStatusText(emailStatus, "Ошибка", "#ef4444");
          setFieldState(emailInput, "invalid");
        }
      }, 500);
    });
  }

  if (usernameTagInput) {
    usernameTagInput.addEventListener("input", () => {
      clearTimeout(tagCheckTimeout);

      const rawTag = usernameTagInput.value.trim();
      const cleanTag = rawTag.startsWith("@") ? rawTag.slice(1) : rawTag;

      if (rawTag !== cleanTag) {
        usernameTagInput.value = cleanTag;
      }

      if (!cleanTag) {
        setStatusText(tagStatus, "");
        setFieldState(usernameTagInput, "");
        return;
      }

      if (cleanTag.length < 3) {
        setStatusText(tagStatus, "Минимум 3 символа", "#ef4444");
        setFieldState(usernameTagInput, "invalid");
        return;
      }

      setStatusText(tagStatus, "Проверка...", "#a78bfa");
      setFieldState(usernameTagInput, "");

      tagCheckTimeout = setTimeout(async () => {
        try {
          const data = await checkTagAvailability(cleanTag);

          if (data.available) {
            setStatusText(tagStatus, "Доступно", "#22c55e");
            setFieldState(usernameTagInput, "valid");
          } else {
            setStatusText(tagStatus, "Уже занято", "#ef4444");
            setFieldState(usernameTagInput, "invalid");
          }
        } catch (error) {
          console.error("Tag check error:", error);
          setStatusText(tagStatus, "Ошибка", "#ef4444");
          setFieldState(usernameTagInput, "invalid");
        }
      }, 500);
    });
  }

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setRegisterError("");

    const username = usernameInput?.value.trim() || "";
    const username_tag = usernameTagInput?.value.trim() || "";
    const email = emailInput?.value.trim() || "";
    const password = passwordInput?.value || "";
    const password2 = password2Input?.value || "";

    if (username.length < 3) {
      setRegisterError("Имя минимум 3 символа");
      return;
    }

    if (username_tag.length < 3) {
      setRegisterError("Username минимум 3 символа");
      return;
    }

    if (!email.includes("@")) {
      setRegisterError("Введите корректный email");
      return;
    }

    if (password.length < 8) {
      setRegisterError("Пароль минимум 8 символов");
      return;
    }

    if (password !== password2) {
      setRegisterError("Пароли не совпадают");
      return;
    }

    pendingRegistrationData = {
      username,
      username_tag,
      email,
      password,
      verificationId: null
    };

    try {
      const response = await fetch("/send-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setRegisterError(window.getApiErrorMessage?.(data, "Не удалось отправить код") || "Не удалось отправить код");
        return;
      }

      pendingRegistrationData.verificationId = Number(data.verificationId || 0) || null;

      openCodeModal();
    } catch (error) {
      console.error("Send code error:", error);
      setRegisterError("Ошибка сервера");
    }
  });

  if (confirmCodeBtn) {
    confirmCodeBtn.addEventListener("click", async () => {
      if (!pendingRegistrationData) return;

      const code = codeInput?.value.trim() || "";

      if (!code) {
        if (codeError) {
          codeError.innerText = "Введите код";
        }
        return;
      }

      if (codeError) {
        codeError.innerText = "";
      }

      try {
        if (confirmCodeBtn) {
          confirmCodeBtn.disabled = true;
        }

        const response = await fetch("/verify-code", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email: pendingRegistrationData.email,
            code,
            verificationId: pendingRegistrationData.verificationId
          })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
          if (codeError) {
            codeError.innerText = window.getApiErrorMessage?.(data, "Неверный код") || "Неверный код";
          }
          return;
        }

        pendingRegistrationData.verificationId =
          Number(data.verificationId || pendingRegistrationData.verificationId || 0) || null;

        await completeRegistration();
      } catch (error) {
        console.error("Verify code error:", error);
        if (codeError) {
          codeError.innerText = "Ошибка сервера";
        }
      } finally {
        if (confirmCodeBtn) {
          confirmCodeBtn.disabled = false;
        }
      }
    });
  }

  if (cancelCodeBtn) {
    cancelCodeBtn.addEventListener("click", closeCodeModal);
  }

  async function startTelegramAuth() {
    try {
      setRegisterError("");
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
        body: JSON.stringify({ mode: "register" })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (popup) popup.close();
        setRegisterError(window.getApiErrorMessage?.(data, "Ошибка входа через Telegram") || "Ошибка входа через Telegram");
        if (telegramAuthBtn) {
          telegramAuthBtn.disabled = false;
        }
        return;
      }

      if (!data?.requestToken || !data?.authUrl) {
        if (popup) popup.close();
        setRegisterError("Не удалось запустить вход через Telegram");
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

      setTelegramStatus("Открой бота, нажми Start и подтверди вход. Если аккаунта ещё нет, он создастся автоматически.");

      telegramAuthPoll = setInterval(async () => {
        try {
          const statusResponse = await fetch(`/telegram-auth/status/${encodeURIComponent(data.requestToken)}`);
          const statusData = await statusResponse.json().catch(() => ({}));

          if (!statusResponse.ok) {
            stopTelegramPolling();
            setRegisterError(window.getApiErrorMessage?.(statusData, "Не удалось проверить статус входа") || "Не удалось проверить статус входа");
            if (telegramAuthBtn) {
              telegramAuthBtn.disabled = false;
            }
            return;
          }

          if (statusData.status === "approved") {
            stopTelegramPolling();
            window.markActiveSession?.(true, statusData.user || null);
            if (typeof window.completeAuthTransition === "function") {
              window.completeAuthTransition("/");
            } else {
              window.location.assign("/");
            }
            return;
          }

          if (statusData.status === "rejected") {
            stopTelegramPolling();
            setRegisterError("Вход через Telegram был отклонён");
            setTelegramStatus("");
            if (telegramAuthBtn) {
              telegramAuthBtn.disabled = false;
            }
          }
        } catch (pollError) {
          console.error("Telegram register status error:", pollError);
        }
      }, 2000);
    } catch (error) {
      console.error("TG ERROR:", error);
      setRegisterError("Ошибка входа через Telegram");
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

window.initRegisterPage = initRegisterPage;
