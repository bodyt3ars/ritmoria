function showLoader() {
  const loader = document.getElementById("globalLoader");
  if (loader) loader.classList.remove("hidden");
}

function hideLoader() {
  const loader = document.getElementById("globalLoader");
  if (loader) loader.classList.add("hidden");
}

const pageCache = {};
const loadedScripts = new Set();
let currentRenderToken = 0;

async function loadPage(url) {
  try {
    if (pageCache[url]) {
  return pageCache[url];
}

    const res = await fetch(url, { credentials: "same-origin" });

    if (!res.ok) {
      throw new Error("Failed to load " + url);
    }

    const html = await res.text();
    pageCache[url] = html;
    return html;
  } catch (err) {
    console.error("loadPage error:", err);
    return "<h1 style='color:white;padding:40px;'>Ошибка загрузки страницы</h1>";
  }
}

function loadScriptOnce(src) {
  if (loadedScripts.has(src) || document.querySelector(`script[src="${src}"]`)) {
    loadedScripts.add(src);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;

    script.onload = () => {
      loadedScripts.add(src);
      resolve();
    };

    script.onerror = reject;
    document.body.appendChild(script);
  });
}

function removePageStyles() {
  document.querySelectorAll('link[data-page-style]').forEach((el) => el.remove());
}

async function addPageStyles(styles = []) {
  const oldStyles = document.querySelectorAll('link[data-page-style]');

  const unique = [...new Set(["/styles/player.css", ...styles])];

  const newLinks = [];

  const promises = unique.map((href) => {
    return new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.pageStyle = "true";

      link.onload = () => resolve(link);
      link.onerror = reject;

      document.head.appendChild(link);
      newLinks.push(link);
    });
  });

  // ⏳ ЖДЁМ ПОКА НОВЫЕ СТИЛИ ЗАГРУЗЯТСЯ
  await Promise.all(promises);

  // ❌ ТОЛЬКО ТЕПЕРЬ удаляем старые
  oldStyles.forEach((el) => el.remove());
}

function safeCall(fnName, ...args) {
  try {
    const fn = window[fnName];
    if (typeof fn === "function") {
      return fn(...args);
    }
  } catch (err) {
    console.error(`Error in ${fnName}:`, err);
  }
}

function runAfterPaint(cb) {
  requestAnimationFrame(() => {
    requestAnimationFrame(cb);
  });
}

function finishRender(app) {
  bindSpaLinks(document);

  setTimeout(() => {
    if (window.highlightActivePage) {
      window.highlightActivePage();
    }
  }, 0);

  hideLoader();
  window.__firstLoadDone = true;
}

function isReservedSecondLevelRoute(tag) {
  return [
    "track",
    "judge",
    "profile",
    "submit",
    "queue",
    "opens",
    "playlists",
    "discover",
    "admin",
    "messages",
    "login",
    "register",
    "settings",
    "html",
    "privacy"
  ].includes(tag);
}

function isProfileLikePath(path) {
  if (path.startsWith("/profile")) return true;
  if (!/^\/[^\/]+$/.test(path)) return false;

  const tag = path.replace("/", "");
  return !isReservedSecondLevelRoute(tag);
}

async function preloadProfileAssets() {
  return Promise.all([
    loadScriptOnce("/js/profile/profile-user.js"),
    loadScriptOnce("/js/profile/profile-avatar.js"),
    loadScriptOnce("/js/profile/profile-posts.js"),
    loadScriptOnce("/js/profile/profile-editor.js"),
    loadScriptOnce("/js/profile/profile-tabs.js"),
    loadScriptOnce("/js/profile/profile-tracks.js"),
    loadScriptOnce("/js/profile/profile-settings.js"),
    loadScriptOnce("/js/profile/profile-main.js")
  ]);
}


function initProfileAfterRenderDeferred() {
  if (!localStorage.getItem("token")) {
    navigate("/login");
    return;
  }

  runAfterPaint(async () => {
    await safeCall("initProfilePageFull");
  });
}

async function renderSimplePage({
  
  app,
  htmlUrl,
  styles,
  scriptSrc,
  initName,
  beforeRender,
  afterRender
}) 
{
  if (beforeRender) {
    const shouldContinue = await beforeRender();
    if (shouldContinue === false) return false;
  }
const renderToken = currentRenderToken;

  app.style.opacity = "0";
  await addPageStyles(styles);
  

  const html = await loadPage(htmlUrl);
  app.innerHTML = html;

  finishRender(app);
  app.style.opacity = "1";

  if (scriptSrc) {
  loadScriptOnce(scriptSrc)
    .then(() => {
      if (renderToken !== currentRenderToken) return;

      runAfterPaint(() => {
        safeCall(initName);
        if (afterRender) afterRender();
      });
    })
    .catch((err) =>
      console.error(`Failed to load script ${scriptSrc}:`, err)
    );
} else if (afterRender) {
  runAfterPaint(afterRender);
}

  return true;
}

export async function renderPage(path) {
  const renderToken = ++currentRenderToken;
  console.log("RENDER PAGE:", path);

  if (!window.__firstLoadDone) {
    showLoader();
  }

  safeCall("destroyDiscoverPage");

  const app = document.getElementById("app");
  if (!app) return;

  const routeUrl = new URL(path, location.origin);
  const routePath = routeUrl.pathname;
  const routeSearch = routeUrl.search;
  const segments = routePath.split("/").filter(Boolean);

  if (routePath === "/html/index.html") {
    history.replaceState({}, "", "/");
    path = "/";
  }

  // INDEX
  if (routePath === "/" || routePath === "/index") {
    app.style.opacity = "0";
    await addPageStyles(["/styles/style.css", "/styles/profile.css"]);
    const html = await loadPage("/html/index.html");
    if (renderToken !== currentRenderToken) return;
    app.innerHTML = html;
    finishRender(app);
    app.style.opacity = "1";

    await loadScriptOnce("/js/profile/profile-posts.js");
    await loadScriptOnce("/js/home.js");
    if (renderToken !== currentRenderToken) return;
    runAfterPaint(() => {
      safeCall("initHomePage");
    });
    return;
  }

  // SUBMIT
  if (routePath === "/submit") {
    const ok = await renderSimplePage({
      app,
      htmlUrl: "/html/submit.html",
      styles: ["/styles/submit.css"],
      scriptSrc: "/js/submit.js",
      initName: "initSubmitPage",
      beforeRender: async () => {
        if (!localStorage.getItem("token")) {
          navigate("/login");
          return false;
        }
        return true;
      }
    });
    if (!ok || renderToken !== currentRenderToken) return;
    return;
  }

  // QUEUE
  if (routePath === "/queue") {
    const ok = await renderSimplePage({
      app,
      htmlUrl: "/html/queue.html",
      styles: ["/styles/queue.css"],
      scriptSrc: "/js/queue.js",
      initName: "initQueuePage"
    });
    if (!ok || renderToken !== currentRenderToken) return;
    return;
  }

  // PLAYLISTS
  if (routePath === "/playlists") {
    const ok = await renderSimplePage({
      app,
      htmlUrl: "/html/playlists.html",
      styles: ["/styles/playlists.css"],
      scriptSrc: "/js/playlists.js",
      initName: "initPlaylistsPage"
    });
    if (!ok || renderToken !== currentRenderToken) return;
    return;
  }

  // DISCOVER
  if (routePath === "/discover") {
    const ok = await renderSimplePage({
      app,
      htmlUrl: "/html/discover.html",
      styles: ["/styles/discover.css"],
      scriptSrc: "/js/swipe.js",
      initName: "initDiscoverPage"
    });
    if (!ok || renderToken !== currentRenderToken) return;
    return;
  }

  // OPENS
  if (routePath === "/opens") {
    const ok = await renderSimplePage({
      app,
      htmlUrl: "/html/opens.html",
      styles: ["/styles/opens.css"],
      scriptSrc: "/js/opens.js",
      initName: "initOpensPage"
    });
    if (!ok || renderToken !== currentRenderToken) return;
    return;
  }

  // TRACK
  if (routePath.startsWith("/track")) {
    addPageStyles(["/styles/track.css"]);

    const html = await loadPage("/html/track.html");
    if (renderToken !== currentRenderToken) return;

    app.innerHTML = html;

    const params = new URLSearchParams(location.search);
    const pathParts = routePath.split("/").filter(Boolean);

    window.__trackId =
      pathParts[1] ||
      params.get("id") ||
      params.get("track");

    finishRender(app);

    loadScriptOnce("/js/track.js")
      .then(() => {
        runAfterPaint(() => {
          safeCall("initTrackPage");
        });
      })
      .catch((err) => console.error("Failed to load /js/track.js:", err));

    return;
  }

  // JUDGE
  if (routePath.startsWith("/judge")) {
    addPageStyles(["/styles/judge.css"]);

    const html = await loadPage("/html/judge.html");
    if (renderToken !== currentRenderToken) return;

    app.innerHTML = html;

    const params = new URLSearchParams(location.search);
    window.__trackId = params.get("track");

    finishRender(app);

    loadScriptOnce("/js/judge.js")
      .then(() => {
        runAfterPaint(() => {
          safeCall("initJudgePage");
        });
      })
      .catch((err) => console.error("Failed to load /js/judge.js:", err));

    return;
  }

  // ADMIN
  if (routePath === "/admin") {
    const ok = await renderSimplePage({
      app,
      htmlUrl: "/html/admin.html",
      styles: ["/styles/admin.css"],
      scriptSrc: "/js/admin.js",
      initName: "initAdminPage",
      beforeRender: async () => {
        if (!localStorage.getItem("token")) {
          navigate("/login");
          return false;
        }
        return true;
      }
    });
    if (!ok || renderToken !== currentRenderToken) return;
    return;
  }

  // LOGIN
  if (routePath === "/login" || routePath === "/login.html" || routePath === "/html/login.html") {
    const ok = await renderSimplePage({
      app,
      htmlUrl: "/html/login.html",
      styles: ["/styles/auth.css"],
      scriptSrc: "/js/login.js",
      initName: "initLoginPage"
    });
    if (!ok || renderToken !== currentRenderToken) return;
    return;
  }

  // REGISTER
  if (routePath === "/register" || routePath === "/register.html" || routePath === "/html/register.html") {
    const ok = await renderSimplePage({
      app,
      htmlUrl: "/html/register.html",
      styles: ["/styles/auth.css"],
      scriptSrc: "/js/register.js",
      initName: "initRegisterPage"
    });
    if (!ok || renderToken !== currentRenderToken) return;
    return;
  }

  // SETTINGS
  if (routePath === "/settings") {
  const ok = await renderSimplePage({
    app,
    htmlUrl: "/html/settings.html",
    styles: [
      "/styles/settings.css",
      "/styles/privacy.css"
    ],
    scriptSrc: "/js/settings.js",
    initName: "initSettingsPage",
      beforeRender: async () => {
        if (!localStorage.getItem("token")) {
          navigate("/login");
          return false;
        }
        return true;
      }
    });
    if (!ok || renderToken !== currentRenderToken) return;
    return;
  }

  // MESSAGES
  if (routePath === "/messages") {
    const ok = await renderSimplePage({
      app,
      htmlUrl: "/html/messages.html",
      styles: ["/styles/messages.css"],
      scriptSrc: "/js/messages.js",
      initName: "initMessagesPage",
      beforeRender: async () => {
        if (!localStorage.getItem("token")) {
          navigate("/login");
          return false;
        }
        return true;
      }
    });
    if (!ok || renderToken !== currentRenderToken) return;
    return;
  }


  // PROFILE TRACK PAGE /username/slug
  if (segments.length === 2) {
    const [tag, slug] = segments;

    if (!isReservedSecondLevelRoute(tag)) {
      addPageStyles(["/styles/profile-track-page.css"]);

      const html = await loadPage("/html/profile-tracks.html");
      if (renderToken !== currentRenderToken) return;

      app.innerHTML = html;

      window.__trackTag = decodeURIComponent(tag);
      window.__trackSlug = decodeURIComponent(slug);

      finishRender(app);

      loadScriptOnce("/js/profile-track-page.js")
        .then(() => {
          runAfterPaint(() => {
            safeCall("initProfileTrackPage");
          });
        })
        .catch((err) => console.error("Failed to load /js/profile-track-page.js:", err));

      return;
    }
  }

  // PROFILE
  if (isProfileLikePath(routePath)) {
    app.style.opacity = "0";
    const stylesPromise = addPageStyles([
  "/styles/profile.css",
  "/styles/profile-tracks.css"
]);

const htmlPromise = loadPage("/html/profile.html");
const scriptsPromise = preloadProfileAssets();

// ⏳ ЖДЁМ ВСЁ
const [_, html, __] = await Promise.all([
  stylesPromise,
  htmlPromise,
  scriptsPromise
]);
    if (renderToken !== currentRenderToken) return;

    app.style.opacity = "0";
    app.innerHTML = html;
    window.scrollTo(0, 0);
    let tag = null;

if (!routePath.startsWith("/profile")) {
  tag = routePath.replace("/", "");
} else {
  const params = new URLSearchParams(routeSearch);
  tag = params.get("tag");
}
    window.__profileTag = tag;

    finishRender(app);
    app.style.opacity = "1";
    initProfileAfterRenderDeferred();
    return;
  }

  app.innerHTML = `<h1 style="color:white; padding:40px;">404</h1>`;
  finishRender(app);

  // 👇 ДОБАВИТЬ В САМЫЙ НИЗ РЕНДЕРА
if (window.syncGlobalPlayerVisibilityByRoute) {
  window.syncGlobalPlayerVisibilityByRoute(location.pathname);
}
}

export function navigate(path) {
  const target = String(path || "");

  if (location.pathname + location.search === target) return;

  history.pushState({}, "", target);
  renderPage(target);

  setTimeout(() => {
    if (window.highlightActivePage) {
      window.highlightActivePage();
    }
  }, 0);
}

window.navigate = navigate;

window.addEventListener("popstate", () => {
  renderPage(location.pathname + location.search);

  setTimeout(() => {
    if (window.highlightActivePage) {
      window.highlightActivePage();
    }
  }, 0);
});

function bindSpaLinks(root = document) {
  const links = root.querySelectorAll("a[href]");

  links.forEach((link) => {
    if (link.dataset.spaBound === "1") return;
    link.dataset.spaBound = "1";

    const href = link.getAttribute("href");

    if (!href) return;
    if (href.startsWith("http")) return;
    if (href.startsWith("#")) return;
    if (href.startsWith("mailto:")) return;
    if (href.startsWith("tel:")) return;
    if (link.hasAttribute("download")) return;

    link.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (link.target === "_blank") return;

      e.preventDefault();
      navigate(href);
    });
  });
}
