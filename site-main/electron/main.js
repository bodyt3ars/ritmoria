const { app, BrowserWindow, shell, protocol, net, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const APP_PROTOCOL = "ritmoria";
const REMOTE_ORIGIN = String(process.env.RITMORIA_APP_API_ORIGIN || "https://ritmoria.com").replace(/\/+$/, "");
const FRONTEND_MODE = String(process.env.RITMORIA_DESKTOP_FRONTEND_MODE || "remote").toLowerCase();
const ENABLE_LOCAL_FALLBACK = process.env.RITMORIA_DESKTOP_LOCAL_FALLBACK === "1";
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const WINDOWS_APP_USER_MODEL_ID = "com.ritmoria.desktop";

const REMOTE_PATH_PREFIXES = [
  "/api/",
  "/add-track-comment",
  "/archive-post/",
  "/archive-track/",
  "/archived-posts",
  "/archived-tracks",
  "/change-email",
  "/change-email-confirm",
  "/change-email-send-code",
  "/change-password",
  "/check-email/",
  "/check-tag/",
  "/delete-account",
  "/delete-account-confirm",
  "/delete-account-send-code",
  "/delete-post/",
  "/delete-track/",
  "/discover-tracks",
  "/follow/",
  "/follow-status/",
  "/followers-count/",
  "/following-count/",
  "/login",
  "/logout",
  "/me",
  "/posts",
  "/register",
  "/send-code",
  "/set-password",
  "/soundcloud",
  "/telegram-auth/",
  "/track-action",
  "/track-comments/",
  "/update-profile",
  "/upload-avatar",
  "/user-tracks",
  "/verify-code"
];

const REMOTE_STATIC_PREFIXES = [
  "/uploads/",
  "/covers/",
  "/audio/"
];

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
      stream: true
    }
  }
]);

function resolveLocalPath(url) {
  const parsed = new URL(url);
  const pathname = decodeURIComponent(parsed.pathname || "/");
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const targetPath = path.normalize(path.join(PUBLIC_DIR, cleanPath));

  if (!targetPath.startsWith(PUBLIC_DIR)) {
    return null;
  }

  return targetPath;
}

function shouldServeLocal(url) {
  const parsed = new URL(url);
  const pathname = parsed.pathname || "/";

  if (!pathname || pathname === "/") {
    return true;
  }

  if (pathname.startsWith("/html/") || pathname.startsWith("/js/") || pathname.startsWith("/styles/")) {
    return true;
  }

  if (pathname.startsWith("/images/")) {
    return true;
  }

  return false;
}

function shouldProxyRemote(url) {
  const pathname = new URL(url).pathname || "/";

  if (REMOTE_STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }

  return REMOTE_PATH_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix));
}

function shouldServeSpaFallback(url) {
  const pathname = new URL(url).pathname || "/";
  return !path.extname(pathname) && !shouldProxyRemote(url);
}

async function getRemoteCookieHeader() {
  const cookies = await session.defaultSession.cookies.get({ url: REMOTE_ORIGIN });
  return cookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

function splitSetCookieHeader(value) {
  const source = String(value || "");
  if (!source) return [];

  return source.split(/,\s*(?=[^;,]+=)/g).filter(Boolean);
}

async function persistRemoteCookies(response) {
  const setCookieHeader = response.headers.get("set-cookie");
  const setCookieItems = splitSetCookieHeader(setCookieHeader);

  await Promise.all(setCookieItems.map(async (cookieString) => {
    const [nameValue, ...attributes] = cookieString.split(";").map((part) => part.trim());
    const separatorIndex = nameValue.indexOf("=");
    if (separatorIndex <= 0) return;

    const name = nameValue.slice(0, separatorIndex);
    const value = nameValue.slice(separatorIndex + 1);
    const cookie = {
      url: REMOTE_ORIGIN,
      name,
      value,
      path: "/"
    };

    attributes.forEach((attribute) => {
      const [rawKey, ...rawValue] = attribute.split("=");
      const key = String(rawKey || "").trim().toLowerCase();
      const attrValue = rawValue.join("=").trim();

      if (key === "path" && attrValue) cookie.path = attrValue;
      if (key === "domain" && attrValue) cookie.domain = attrValue.replace(/^\./, "");
      if (key === "secure") cookie.secure = true;
      if (key === "httponly") cookie.httpOnly = true;
      if (key === "expires" && attrValue) {
        const expiry = Math.floor(new Date(attrValue).getTime() / 1000);
        if (Number.isFinite(expiry)) cookie.expirationDate = expiry;
      }
      if (key === "max-age" && attrValue) {
        const seconds = Number(attrValue);
        if (Number.isFinite(seconds)) cookie.expirationDate = Math.floor(Date.now() / 1000) + seconds;
      }
    });

    if (cookie.expirationDate && cookie.expirationDate <= Math.floor(Date.now() / 1000)) {
      await session.defaultSession.cookies.remove(REMOTE_ORIGIN, name);
      return;
    }

    await session.defaultSession.cookies.set(cookie);
  }));
}

function getHeaderValue(headers, name) {
  const target = String(name || "").toLowerCase();
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === target);
  const value = entry?.[1];

  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [String(value)];
}

async function persistSetCookieValues(values = []) {
  const chunks = values.flatMap((value) => splitSetCookieHeader(value));

  await Promise.all(chunks.map(async (cookieString) => {
    const [nameValue, ...attributes] = cookieString.split(";").map((part) => part.trim());
    const separatorIndex = nameValue.indexOf("=");
    if (separatorIndex <= 0) return;

    const name = nameValue.slice(0, separatorIndex);
    const value = nameValue.slice(separatorIndex + 1);
    const cookie = {
      url: REMOTE_ORIGIN,
      name,
      value,
      path: "/"
    };

    attributes.forEach((attribute) => {
      const [rawKey, ...rawValue] = attribute.split("=");
      const key = String(rawKey || "").trim().toLowerCase();
      const attrValue = rawValue.join("=").trim();

      if (key === "path" && attrValue) cookie.path = attrValue;
      if (key === "domain" && attrValue) cookie.domain = attrValue.replace(/^\./, "");
      if (key === "secure") cookie.secure = true;
      if (key === "httponly") cookie.httpOnly = true;
      if (key === "expires" && attrValue) {
        const expiry = Math.floor(new Date(attrValue).getTime() / 1000);
        if (Number.isFinite(expiry)) cookie.expirationDate = expiry;
      }
      if (key === "max-age" && attrValue) {
        const seconds = Number(attrValue);
        if (Number.isFinite(seconds)) cookie.expirationDate = Math.floor(Date.now() / 1000) + seconds;
      }
    });

    if (cookie.expirationDate && cookie.expirationDate <= Math.floor(Date.now() / 1000)) {
      await session.defaultSession.cookies.remove(REMOTE_ORIGIN, name);
      return;
    }

    await session.defaultSession.cookies.set(cookie);
  }));
}

function installRemoteCookieBridge() {
  const filter = {
    urls: [
      `${REMOTE_ORIGIN}/*`
    ]
  };

  session.defaultSession.webRequest.onBeforeSendHeaders(filter, async (details, callback) => {
    const requestHeaders = { ...(details.requestHeaders || {}) };
    const cookieHeader = await getRemoteCookieHeader();

    if (cookieHeader) {
      requestHeaders.Cookie = cookieHeader;
    }

    callback({ requestHeaders });
  });

  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    const setCookieValues = getHeaderValue(details.responseHeaders, "set-cookie");
    if (setCookieValues.length) {
      persistSetCookieValues(setCookieValues).catch((error) => {
        console.error("Desktop cookie bridge error:", error);
      });
    }

    callback({ responseHeaders: details.responseHeaders });
  });
}

async function proxyRemoteRequest(request) {
  const sourceUrl = new URL(request.url);
  const remoteUrl = `${REMOTE_ORIGIN}${sourceUrl.pathname}${sourceUrl.search}`;
  const headers = new Headers(request.headers);
  const cookieHeader = await getRemoteCookieHeader();
  const method = String(request.method || "GET").toUpperCase();

  headers.set("Origin", REMOTE_ORIGIN);
  headers.set("Referer", `${REMOTE_ORIGIN}/`);
  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

  const response = await net.fetch(remoteUrl, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : request.body,
    redirect: "manual"
  });

  await persistRemoteCookies(response);

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("set-cookie");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}

async function handleAppProtocol(request) {
  try {
    if (shouldServeLocal(request.url)) {
      const localPath = resolveLocalPath(request.url);
      if (localPath && fs.existsSync(localPath)) {
        return await net.fetch(pathToFileURL(localPath).toString());
      }
    }

    if (shouldServeSpaFallback(request.url)) {
      return await net.fetch(pathToFileURL(path.join(PUBLIC_DIR, "index.html")).toString());
    }

    return await proxyRemoteRequest(request);
  } catch (error) {
    console.error("Electron protocol error:", error);
    return new Response("Ritmoria app request failed", { status: 502 });
  }
}

function isAboutUrl(url) {
  return url === "" || /^about:?/i.test(String(url || ""));
}

function isInternalUrl(url) {
  return String(url || "").startsWith(REMOTE_ORIGIN) || String(url || "").startsWith(`${APP_PROTOCOL}://app`);
}

function isTelegramUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "tg:" || parsed.hostname === "t.me" || parsed.hostname.endsWith(".t.me") || parsed.hostname === "telegram.me";
  } catch {
    return false;
  }
}

function configureNavigation(webContents, { closeOnExternal = false } = {}) {
  webContents.setWindowOpenHandler(({ url }) => {
    if (isAboutUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          minWidth: 420,
          minHeight: 560,
          autoHideMenuBar: true,
          backgroundColor: "#090a10",
          title: "Ритмория — Telegram",
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
          }
        }
      };
    }

    if (isInternalUrl(url)) {
      webContents.loadURL(url);
      return { action: "deny" };
    }

    shell.openExternal(url);
    return { action: "deny" };
  });

  webContents.on("will-navigate", (event, url) => {
    if (isAboutUrl(url) || isInternalUrl(url)) return;

    event.preventDefault();
    shell.openExternal(url);

    if (closeOnExternal) {
      const ownerWindow = BrowserWindow.fromWebContents(webContents);
      ownerWindow?.close();
    }
  });
}

function createMainWindow() {
  let localFallbackLoaded = false;
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#090a10",
    title: "Ритмория",
    icon: path.join(PUBLIC_DIR, "images", "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  configureNavigation(mainWindow.webContents);

  mainWindow.webContents.on("did-create-window", (childWindow) => {
    configureNavigation(childWindow.webContents, { closeOnExternal: true });
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || localFallbackLoaded || FRONTEND_MODE !== "remote" || !ENABLE_LOCAL_FALLBACK) return;
    if (!String(validatedURL || "").startsWith(REMOTE_ORIGIN)) return;

    console.warn("Remote frontend failed, loading local fallback:", errorCode, errorDescription);
    localFallbackLoaded = true;
    mainWindow.loadURL(`${APP_PROTOCOL}://app/`);
  });

  const startUrl = FRONTEND_MODE === "local"
    ? `${APP_PROTOCOL}://app/`
    : `${REMOTE_ORIGIN}/`;

  mainWindow.loadURL(startUrl);
}

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
  }

  protocol.handle(APP_PROTOCOL, handleAppProtocol);
  installRemoteCookieBridge();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
