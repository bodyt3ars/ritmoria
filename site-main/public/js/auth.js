(() => {
  if (window.__ritmoriaAuthLoaded) return;
  window.__ritmoriaAuthLoaded = true;

  const SESSION_ACTIVE_KEY = "ritmoria_session_active";
  const SESSION_USER_ID_KEY = "ritmoria_session_user_id";
  const SESSION_USER_TAG_KEY = "ritmoria_session_user_tag";

  const authState = {
    checked: false,
    active: false,
    user: null,
    pending: null
  };

  function writeSessionValue(key, value) {
    try {
      if (value === null || value === undefined || value === "") {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, String(value));
      }
    } catch {}
  }

  function setCachedSession(active, user = null) {
    authState.checked = true;
    authState.active = !!active;
    authState.user = active && user ? { ...user } : (active ? authState.user : null);

    writeSessionValue(SESSION_ACTIVE_KEY, active ? "1" : null);
    writeSessionValue(SESSION_USER_ID_KEY, active ? authState.user?.id || null : null);
    writeSessionValue(SESSION_USER_TAG_KEY, active ? authState.user?.username_tag || null : null);

    if (active && authState.user) {
      window.currentUser = {
        ...(window.currentUser || {}),
        ...authState.user
      };
    } else if (!active) {
      window.currentUser = null;
    }
  }

  function readCachedSessionFlag() {
    try {
      return localStorage.getItem(SESSION_ACTIVE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function readCachedUser() {
    try {
      const id = localStorage.getItem(SESSION_USER_ID_KEY) || "";
      const usernameTag = localStorage.getItem(SESSION_USER_TAG_KEY) || "";
      if (!id && !usernameTag) return null;

      return {
        id,
        username_tag: usernameTag
      };
    } catch {
      return null;
    }
  }

  async function hasActiveSession({ force = false } = {}) {
    if (!force && authState.checked) {
      return authState.active;
    }

    if (!force && authState.pending) {
      return authState.pending;
    }

    const verifyWithMe = async () => {
      try {
        const response = await fetch("/me", {
          cache: "no-store",
          credentials: "same-origin"
        });

        if (!response.ok) return false;

        const user = await response.json().catch(() => null);
        setCachedSession(true, user || authState.user || readCachedUser());
        return true;
      } catch {
        return false;
      }
    };

    authState.pending = fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin"
    })
      .then(async (response) => {
        if (!response.ok) {
          if (await verifyWithMe()) {
            return true;
          }
          setCachedSession(false, null);
          return false;
        }

        const data = await response.json().catch(() => ({}));
        if (data.authenticated !== true && await verifyWithMe()) {
          return true;
        }
        setCachedSession(data.authenticated === true, data.user || null);
        return authState.active;
      })
      .catch(async () => {
        if (await verifyWithMe()) {
          return true;
        }
        setCachedSession(false, null);
        return false;
      })
      .finally(() => {
        authState.pending = null;
      });

    return authState.pending;
  }

  function hasSessionCache() {
    return authState.active || readCachedSessionFlag();
  }

  function getSessionUserId() {
    return String(
      window.currentUser?.id ||
      authState.user?.id ||
      (() => {
        try {
          return localStorage.getItem(SESSION_USER_ID_KEY);
        } catch {
          return null;
        }
      })() ||
      "guest"
    );
  }

  function getSessionUserTag() {
    return String(
      window.currentUser?.username_tag ||
      authState.user?.username_tag ||
      (() => {
        try {
          return localStorage.getItem(SESSION_USER_TAG_KEY);
        } catch {
          return null;
        }
      })() ||
      ""
    );
  }

  function clearClientAuthState() {
    setCachedSession(false, null);
    if (typeof window.clearSpaPageCache === "function") {
      window.clearSpaPageCache();
    }
  }

  function completeAuthTransition(redirectPath = "/") {
    if (typeof window.clearSpaPageCache === "function") {
      window.clearSpaPageCache();
    }
    window.location.assign(redirectPath);
  }

  async function performServerLogout(redirectPath = "/") {
    try {
      await fetch("/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
    } catch (err) {
      console.error("Logout error:", err);
    }

    clearClientAuthState();
    window.location.assign(redirectPath);
  }

  authState.active = readCachedSessionFlag();
  authState.user = authState.active ? readCachedUser() : null;
  authState.checked = false;
  hasActiveSession({ force: true }).catch(() => {});

  try {
    const nativeGetItem = localStorage.getItem.bind(localStorage);
    const nativeSetItem = localStorage.setItem.bind(localStorage);
    const nativeRemoveItem = localStorage.removeItem.bind(localStorage);

    localStorage.getItem = (key) => {
      if (key === "token") {
        return hasSessionCache() ? "cookie-session" : null;
      }
      return nativeGetItem(key);
    };

    localStorage.setItem = (key, value) => {
      if (key === "token") {
        setCachedSession(true, authState.user);
        return;
      }
      nativeSetItem(key, value);
    };

    localStorage.removeItem = (key) => {
      if (key === "token") {
        clearClientAuthState();
        return;
      }
      nativeRemoveItem(key);
    };
  } catch {}

  window.hasActiveSession = hasActiveSession;
  window.hasSessionCache = hasSessionCache;
  window.getSessionUserId = getSessionUserId;
  window.getSessionUserTag = getSessionUserTag;
  window.markActiveSession = setCachedSession;
  window.clearAuthClientState = clearClientAuthState;
  window.completeAuthTransition = completeAuthTransition;
  window.performServerLogout = performServerLogout;
})();
