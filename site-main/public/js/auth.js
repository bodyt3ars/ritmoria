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
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, String(value));
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
      return sessionStorage.getItem(SESSION_ACTIVE_KEY) === "1";
    } catch {
      return false;
    }
  }

  async function hasActiveSession({ force = false } = {}) {
    if (!force && authState.checked) {
      return authState.active;
    }

    if (!force && authState.pending) {
      return authState.pending;
    }

    authState.pending = fetch("/api/auth/session", {
      cache: "no-store"
    })
      .then(async (response) => {
        if (!response.ok) {
          setCachedSession(false, null);
          return false;
        }

        const data = await response.json().catch(() => ({}));
        setCachedSession(data.authenticated === true, data.user || null);
        return authState.active;
      })
      .catch(() => {
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
          return sessionStorage.getItem(SESSION_USER_ID_KEY);
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
          return sessionStorage.getItem(SESSION_USER_TAG_KEY);
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

  setCachedSession(readCachedSessionFlag(), null);
  hasActiveSession().catch(() => {});

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
