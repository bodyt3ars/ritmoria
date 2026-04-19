require("dotenv").config()
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const pool = require("../database/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const sharp = require("sharp");
const crypto = require("crypto");
const fs = require("fs")
const path = require("path")

const APP_BASE_URL = String(process.env.APP_BASE_URL || "https://ritmoria.com").trim().replace(/\/+$/, "");
const APP_PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = String(process.env.JWT_SECRET || "").trim();
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const TELEGRAM_AUTH_BOT_USERNAME = String(process.env.TELEGRAM_AUTH_BOT_USERNAME || "ritmoriaauthBot").trim();
const SUPPORT_BOT_USERNAME = String(process.env.SUPPORT_BOT_USERNAME || "ritmoriasupportBOT").trim();

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}

let resend = null;
try {
  const { Resend } = require("resend");
  if (RESEND_API_KEY) {
    resend = new Resend(RESEND_API_KEY);
  } else {
    console.warn("RESEND_API_KEY is not configured. Email sending is disabled.");
  }
} catch {
  console.warn("Resend package is not installed. Email sending is disabled.");
}

const allowedCorsOrigins = new Set([
  APP_BASE_URL,
  APP_BASE_URL.replace("://ritmoria.com", "://www.ritmoria.com"),
  "http://localhost:3000",
  "http://127.0.0.1:3000"
].filter(Boolean));

function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ error: "Нет токена" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;
    touchUserLastSeen(decoded.id).finally(() => next());
  } catch (err) {
    return res.status(401).json({ error: "Неверный токен" });
  }
}


const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

const profileTrackUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 35 * 1024 * 1024
  }
});

const openUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 80 * 1024 * 1024
  }
});

const postUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024
  }
});

const PUBLIC_ERROR_MESSAGES = {
  LIMIT_FILE_SIZE: "Файл слишком большой. Попробуй выбрать файл поменьше.",
  LIMIT_UNEXPECTED_FILE: "Не удалось обработать выбранный файл. Попробуй загрузить его заново.",
  LIMIT_PART_COUNT: "Слишком много данных в форме. Попробуй отправить только нужные файлы.",
  LIMIT_FILE_COUNT: "Слишком много файлов. Оставь только нужные.",
  LIMIT_FIELD_KEY: "Одно из полей формы заполнено некорректно.",
  LIMIT_FIELD_VALUE: "Одно из полей формы слишком длинное.",
  LIMIT_FIELD_COUNT: "Форма заполнена некорректно. Обнови страницу и попробуй ещё раз.",
  LIMIT_FIELD_SIZE: "Одно из полей формы слишком длинное.",
  invalid_conversation_avatar: "Для аватарки группы подходит только изображение.",
  conversation_title_required: "Введи название группы.",
  conversation_create_failed: "Не удалось создать группу. Попробуй ещё раз.",
  conversation_update_failed: "Не удалось сохранить изменения группы.",
  conversation_delete_failed: "Не удалось удалить группу.",
  conversation_leave_failed: "Не удалось выйти из группы.",
  conversation_not_found: "Этот чат не найден или уже был удалён.",
  conversation_edit_forbidden: "У тебя нет прав на редактирование этой группы.",
  conversation_delete_forbidden: "У тебя нет прав на удаление этой группы.",
  message_send_failed: "Не удалось отправить сообщение. Попробуй ещё раз.",
  message_text_required: "Напиши сообщение или прикрепи файл.",
  invalid_reply_message: "Не удалось ответить на это сообщение.",
  invalid_forwarded_message: "Не удалось переслать это сообщение.",
  target_messages_disabled: "Этот пользователь отключил входящие сообщения.",
  blocked_by_target: "Этот пользователь ограничил тебе сообщения.",
  messages_blocked_for_target: "Ты отключил сообщения для этого пользователя.",
  message_start_failed: "Не удалось открыть диалог.",
  open_title_required: "Добавь название опена.",
  open_create_failed: "Не удалось опубликовать опен.",
  open_apply_failed: "Не удалось отправить заявку.",
  open_select_failed: "Не удалось выбрать участника.",
  open_delete_failed: "Не удалось удалить опен.",
  open_not_found: "Опен не найден.",
  open_application_exists: "Ты уже отправил заявку в этот опен.",
  forbidden: "У тебя нет доступа к этому действию.",
  server_error: "Что-то пошло не так на сервере. Попробуй ещё раз чуть позже.",
  "server error": "Что-то пошло не так на сервере. Попробуй ещё раз чуть позже.",
  update_failed: "Не удалось сохранить изменения.",
  track_not_found: "Трек не найден.",
  post_not_found: "Публикация не найдена.",
  comment_not_found: "Комментарий не найден.",
  user_not_found: "Пользователь не найден.",
  unauthorized: "Нужно войти в аккаунт.",
  no_token: "Нужно войти в аккаунт.",
  invalid_token: "Сессия устарела. Войди в аккаунт заново.",
  "Нет токена": "Нужно войти в аккаунт.",
  "Неверный токен": "Сессия устарела. Войди в аккаунт заново.",
  "No file uploaded": "Сначала выбери файл.",
  "Avatar upload failed": "Не удалось загрузить аватар.",
  "Wrong code": "Неверный код. Проверь письмо и попробуй ещё раз.",
  "Wrong password": "Неверный пароль.",
  "Email not set": "У аккаунта не указана почта.",
  "Email error": "Не удалось отправить письмо. Попробуй ещё раз позже.",
  delete_account_code_send_failed: "Не удалось отправить код подтверждения.",
  delete_account_failed: "Не удалось удалить аккаунт.",
  check_failed: "Не удалось выполнить проверку. Попробуй ещё раз.",
  failed: "Не удалось загрузить данные. Попробуй обновить страницу.",
  invalid_data: "Некорректные данные. Проверь заполненные поля.",
  action_error: "Не удалось выполнить действие. Попробуй ещё раз.",
  audio_required: "Загрузите песню.",
  cover_required: "Загрузите обложку."
};

function humanizeServerError(rawError, fallbackMessage = "Что-то пошло не так. Попробуй ещё раз.") {
  const errorValue =
    rawError instanceof Error
      ? (rawError.code || rawError.message || rawError.name)
      : (rawError?.errorCode || rawError?.error || rawError?.code || rawError?.message || rawError);

  const rawText = String(errorValue || "").trim();
  const normalizedKey = rawText.toLowerCase();

  if (PUBLIC_ERROR_MESSAGES[rawText]) {
    return PUBLIC_ERROR_MESSAGES[rawText];
  }

  if (PUBLIC_ERROR_MESSAGES[normalizedKey]) {
    return PUBLIC_ERROR_MESSAGES[normalizedKey];
  }

  if (/json|invalid input syntax|malformed/i.test(rawText)) {
    return "Один из параметров передан в неверном формате. Обнови страницу и попробуй ещё раз.";
  }

  if (/too large|file is too large|limit_file_size/i.test(rawText)) {
    return "Файл слишком большой. Попробуй выбрать файл поменьше.";
  }

  if (/unsupported|invalid file|unexpected field/i.test(rawText)) {
    return "Файл не подошёл по формату. Попробуй другой.";
  }

  if (/jwt|token/i.test(rawText)) {
    return "Сессия устарела. Войди в аккаунт заново.";
  }

  if (/violates|duplicate key|already exists/i.test(rawText)) {
    return "Такие данные уже существуют. Проверь поля и попробуй ещё раз.";
  }

  return fallbackMessage;
}

function buildPublicErrorPayload(rawError, fallbackCode = "server_error", fallbackMessage) {
  const errorCode =
    String(
      rawError?.errorCode ||
      rawError?.error ||
      rawError?.code ||
      rawError?.message ||
      fallbackCode
    ).trim() || fallbackCode;

  return {
    error: errorCode,
    errorCode,
    message: humanizeServerError(rawError, fallbackMessage || humanizeServerError(fallbackCode))
  };
}

function createHandledUpload(middleware, fallbackCode = "upload_failed", fallbackMessage) {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (!err) {
        next();
        return;
      }

      const status = err instanceof multer.MulterError
        ? (err.code === "LIMIT_FILE_SIZE" ? 413 : 400)
        : 400;

      console.error("UPLOAD ERROR:", err);
      res.status(status).json(buildPublicErrorPayload(err, fallbackCode, fallbackMessage));
    });
  };
}

const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".wave",
  ".m4a",
  ".aac",
  ".ogg",
  ".flac",
  ".webm"
]);

const AUDIO_EXTENSIONS_BY_MIME = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/wave": ".wav",
  "audio/x-wav": ".wav",
  "audio/vnd.wave": ".wav",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/x-aac": ".aac",
  "audio/ogg": ".ogg",
  "application/ogg": ".ogg",
  "audio/flac": ".flac",
  "audio/x-flac": ".flac",
  "audio/webm": ".webm",
  "video/webm": ".webm"
};

function getSafeAudioExtension(file, fallback = ".mp3") {
  const originalExt = path.extname(String(file?.originalname || "")).toLowerCase();
  if (AUDIO_EXTENSIONS.has(originalExt)) {
    return originalExt === ".wave" ? ".wav" : originalExt;
  }

  const mimeExt = AUDIO_EXTENSIONS_BY_MIME[String(file?.mimetype || "").toLowerCase()];
  if (mimeExt) {
    return mimeExt;
  }

  return fallback;
}

function assertSupportedAudioFile(file) {
  if (!file) return;

  const mimeType = String(file.mimetype || "").toLowerCase();
  const ext = getSafeAudioExtension(file, "");
  const looksLikeAudio = mimeType.startsWith("audio/") || AUDIO_EXTENSIONS.has(ext);

  if (!looksLikeAudio) {
    const error = new Error("unsupported_audio_type");
    error.errorCode = "unsupported_audio_type";
    throw error;
  }
}

const avatarUploadSingle = createHandledUpload(
  upload.single("avatar"),
  "avatar_upload_failed",
  "Не удалось загрузить изображение. Проверь файл и попробуй ещё раз."
);
const trackUploadFields = createHandledUpload(
  upload.fields([{ name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 }]),
  "track_upload_failed",
  "Не удалось загрузить трек. Проверь файл и попробуй ещё раз."
);
const profileTrackUploadFields = createHandledUpload(
  profileTrackUpload.fields([{ name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 }]),
  "track_upload_failed",
  "Не удалось загрузить трек. Проверь файл и попробуй ещё раз."
);
const postMediaUploadSingle = createHandledUpload(
  postUpload.single("media"),
  "post_media_upload_failed",
  "Не удалось загрузить медиафайл. Проверь файл и попробуй ещё раз."
);
const openUploadFields = createHandledUpload(
  openUpload.fields([{ name: "audio", maxCount: 1 }]),
  "open_upload_failed",
  "Не удалось загрузить файлы для опена. Проверь размер и формат."
);
const messageAttachmentUpload = createHandledUpload(
  upload.single("attachment"),
  "message_attachment_failed",
  "Не удалось прикрепить файл к сообщению."
);

const app = express();

function generateUsernameTag(name) {
  const tag = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20);

  return tag || "user";
}

function signAppToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      avatar: user.avatar
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function verifyTelegramAuth(data) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const hash = data?.hash;

  if (!token || !hash) {
    return false;
  }

  const authDate = Number(data.auth_date || 0);
  if (!authDate || Date.now() / 1000 - authDate > 24 * 60 * 60) {
    return false;
  }

  const checkString = Object.keys(data)
    .filter((key) => key !== "hash" && data[key] !== undefined && data[key] !== null)
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(token).digest();
  const expectedHash = crypto
    .createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const actualBuffer = Buffer.from(String(hash), "hex");

  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function escapeTelegramHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendSupportTelegramMessage(chatId, text, options = {}) {
  const token = process.env.SUPPORT_BOT_TOKEN;

  if (!token || !chatId) {
    throw new Error("support_bot_not_configured");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...options
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    throw new Error(data?.description || "support_telegram_failed");
  }

  return data.result;
}

async function configureTelegramWebhook({ token, webhookPath, label }) {
  if (!token) {
    console.warn(`${label} token is not configured. Webhook sync skipped.`);
    return;
  }

  const webhookUrl = `${APP_BASE_URL}${webhookPath}`;
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ["message", "callback_query"]
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    throw new Error(data?.description || `${label.toLowerCase()}_webhook_failed`);
  }

  console.log(`${label} webhook synced -> ${webhookUrl}`);
}

async function syncTelegramWebhooks() {
  await configureTelegramWebhook({
    token: process.env.TELEGRAM_BOT_TOKEN,
    webhookPath: "/api/telegram-auth/webhook",
    label: "Telegram auth"
  });

  await configureTelegramWebhook({
    token: process.env.SUPPORT_BOT_TOKEN,
    webhookPath: "/api/support/telegram-webhook",
    label: "Telegram support"
  });
}

async function sendAuthTelegramRequest(method, payload = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("telegram_bot_not_configured");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    throw new Error(data?.description || `telegram_${method}_failed`);
  }

  return data.result;
}

async function sendAuthTelegramMessage(chatId, text, options = {}) {
  return sendAuthTelegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...options
  });
}

async function sendEmailOrLog({ to, subject, html, logLabel = "EMAIL" }) {
  if (!to) {
    throw new Error("email_required");
  }

  if (!resend) {
    console.log(`${logLabel} -> ${to}`);
    console.log(html);
    return { success: true, logged: true };
  }

  await resend.emails.send({
    from: "Rhytmoria <no-reply@ritmoria.com>",
    to,
    subject,
    html
  });

  return { success: true, logged: false };
}

function getTelegramAuthBotUsername() {
  return TELEGRAM_AUTH_BOT_USERNAME;
}

function getSupportBotUsername() {
  return SUPPORT_BOT_USERNAME;
}

function isSupportAdminChat(chatId) {
  return String(chatId) === String(process.env.SUPPORT_ADMIN_CHAT_ID || "");
}

function getTelegramDisplayName(from = {}) {
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  const username = from.username ? `@${from.username}` : "";
  return [name || "Без имени", username].filter(Boolean).join(" ");
}

function getRequestIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || "";
}

function parseUserAgentInfo(userAgent = "") {
  const ua = String(userAgent || "");

  let browser = "Неизвестно";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = "Opera";
  else if (/chrome\//i.test(ua)) browser = "Chrome";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = "Safari";

  let os = "Неизвестно";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ios/i.test(ua)) os = "iOS";
  else if (/mac os x|macintosh/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua)) os = "Linux";

  const versionMatch = ua.match(/(?:edg|opr|chrome|firefox|version)\/([\d.]+)/i);
  const version = versionMatch?.[1] || "";

  return {
    browser: version ? `${browser} ${version.split(".")[0]}` : browser,
    os
  };
}

async function getUniqueUsernameTag(name) {
  const baseTag = generateUsernameTag(name);
  let usernameTag = baseTag;
  let counter = 1;

  while (true) {
    const check = await pool.query(
      "SELECT id FROM users WHERE LOWER(username_tag) = LOWER($1)",
      [usernameTag]
    );

    if (check.rows.length === 0) {
      return usernameTag;
    }

    usernameTag = `${baseTag}${counter}`;
    counter++;
  }
}

const RANK_TIERS = [
  { rank: 1, rankName: "Новичок", minXp: 0, icon: "/images/ranks/1.png" },
  { rank: 2, rankName: "Слушатель", minXp: 500, icon: "/images/ranks/2.png" },
  { rank: 3, rankName: "Артист", minXp: 2000, icon: "/images/ranks/3.png" },
  { rank: 4, rankName: "Хитмейкер", minXp: 6000, icon: "/images/ranks/4.png" },
  { rank: 5, rankName: "Легенда", minXp: 15000, icon: "/images/ranks/5.png" }
];

function getRankState(xpValue) {
  const xp = Math.max(0, Number(xpValue || 0));
  let currentTier = RANK_TIERS[0];

  for (const tier of RANK_TIERS) {
    if (xp >= tier.minXp) {
      currentTier = tier;
    }
  }

  const nextTier = RANK_TIERS.find((tier) => tier.minXp > currentTier.minXp) || null;
  const prevLevel = currentTier.minXp;
  const nextLevel = nextTier ? nextTier.minXp : null;
  const progress = nextTier
    ? Math.max(0, Math.min(100, ((xp - prevLevel) / (nextLevel - prevLevel)) * 100))
    : 100;

  return {
    xp,
    rank: currentTier.rank,
    rankName: currentTier.rankName,
    icon: currentTier.icon,
    prevLevel,
    nextLevel,
    progress,
    xpIntoRank: xp - prevLevel,
    xpForNextRank: nextTier ? Math.max(0, nextLevel - xp) : 0,
    isMaxRank: !nextTier
  };
}

function buildXpAwardState(previousXp, gainedXP = 0) {
  const before = getRankState(previousXp);
  const after = getRankState(previousXp + gainedXP);

  return {
    previousXp: before.xp,
    gainedXP,
    xp: after.xp,
    newXP: after.xp,
    rank: after.rank,
    rankName: after.rankName,
    icon: after.icon,
    prevLevel: after.prevLevel,
    nextLevel: after.nextLevel,
    progress: after.progress,
    xpIntoRank: after.xpIntoRank,
    xpForNextRank: after.xpForNextRank,
    isMaxRank: after.isMaxRank,
    rankUp: after.rank > before.rank,
    previousRank: before.rank,
    previousRankName: before.rankName,
    previousRankIcon: before.icon
  };
}

function attachRankState(user) {
  if (!user) return user;

  return {
    ...user,
    rank_state: getRankState(user.xp)
  };
}

function getXpPayload(xpState) {
  return {
    xp: Number(xpState?.gainedXP || 0),
    newXP: Number(xpState?.xp || 0),
    xpState
  };
}

function getDayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureXPSystemSchema() {
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS xp integer DEFAULT 0;

    UPDATE users
    SET xp = 0
    WHERE xp IS NULL;

    CREATE TABLE IF NOT EXISTS xp_events (
      id SERIAL PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action_key varchar(64) NOT NULL,
      event_key varchar(180),
      amount integer NOT NULL DEFAULT 0,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamp without time zone NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_xp_events_user_action
      ON xp_events(user_id, action_key, created_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_events_user_event_key
      ON xp_events(user_id, event_key);
  `);
}

async function ensureSocialAuthSchema() {
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS username_tag varchar(50),
      ADD COLUMN IF NOT EXISTS telegram_id text,
      ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS last_seen_at timestamp without time zone,
      ALTER COLUMN email DROP NOT NULL,
      ALTER COLUMN password DROP NOT NULL;

    UPDATE users
    SET is_verified = false
    WHERE is_verified IS NULL;

    ALTER TABLE users
      ALTER COLUMN telegram_id TYPE text USING telegram_id::text;

    ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_username_key;

    UPDATE users
    SET username_tag = LOWER(REGEXP_REPLACE(username, '[^a-zA-Z0-9]+', '', 'g'))
    WHERE username_tag IS NULL OR username_tag = '';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id
      ON users(telegram_id)
      WHERE telegram_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_users_username_tag_lower
      ON users(LOWER(username_tag))
      WHERE username_tag IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_users_last_seen_at
      ON users(last_seen_at DESC);
  `);
}

async function ensureSupportSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id SERIAL PRIMARY KEY,
      user_id integer REFERENCES users(id) ON DELETE SET NULL,
      subject varchar(120) NOT NULL,
      message text NOT NULL,
      contact text,
      status varchar(20) NOT NULL DEFAULT 'new',
      telegram_message_id text,
      created_at timestamp without time zone NOT NULL DEFAULT now()
    );

    ALTER TABLE support_tickets
      ADD COLUMN IF NOT EXISTS telegram_chat_id text,
      ADD COLUMN IF NOT EXISTS telegram_user_id text,
      ADD COLUMN IF NOT EXISTS telegram_username text,
      ADD COLUMN IF NOT EXISTS admin_message_id text,
      ADD COLUMN IF NOT EXISTS answered_at timestamp without time zone;

    CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at
      ON support_tickets(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id
      ON support_tickets(user_id);

    CREATE INDEX IF NOT EXISTS idx_support_tickets_admin_message_id
      ON support_tickets(admin_message_id);

    CREATE INDEX IF NOT EXISTS idx_support_tickets_telegram_chat_id
      ON support_tickets(telegram_chat_id);

    CREATE TABLE IF NOT EXISTS support_bot_sessions (
      telegram_chat_id text PRIMARY KEY,
      step varchar(30) NOT NULL,
      requested_username text,
      updated_at timestamp without time zone NOT NULL DEFAULT now()
    );
  `);
}

async function ensureTelegramAuthSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telegram_auth_requests (
      request_token varchar(80) PRIMARY KEY,
      mode varchar(20) NOT NULL DEFAULT 'login',
      status varchar(20) NOT NULL DEFAULT 'pending',
      browser varchar(120),
      os varchar(120),
      ip text,
      user_agent text,
      telegram_id text,
      telegram_chat_id text,
      telegram_username text,
      approved_user_id integer REFERENCES users(id) ON DELETE SET NULL,
      app_token text,
      error text,
      message_id text,
      created_at timestamp without time zone NOT NULL DEFAULT now(),
      resolved_at timestamp without time zone
    );

    CREATE INDEX IF NOT EXISTS idx_telegram_auth_requests_status
      ON telegram_auth_requests(status);

    CREATE INDEX IF NOT EXISTS idx_telegram_auth_requests_created_at
      ON telegram_auth_requests(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_telegram_auth_requests_telegram_id
      ON telegram_auth_requests(telegram_id)
      WHERE telegram_id IS NOT NULL;
  `);
}

async function ensureEmailVerificationSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_verification_codes (
      id SERIAL PRIMARY KEY,
      email text NOT NULL,
      user_id integer REFERENCES users(id) ON DELETE CASCADE,
      purpose varchar(32) NOT NULL DEFAULT 'register',
      code varchar(6) NOT NULL,
      verified boolean NOT NULL DEFAULT false,
      expires_at timestamp without time zone NOT NULL,
      created_at timestamp without time zone NOT NULL DEFAULT now(),
      verified_at timestamp without time zone
    );

    CREATE INDEX IF NOT EXISTS idx_email_verification_codes_lookup
      ON email_verification_codes(email, purpose, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_email_verification_codes_user_lookup
      ON email_verification_codes(user_id, purpose, created_at DESC)
      WHERE user_id IS NOT NULL;

    DELETE FROM email_verification_codes
    WHERE expires_at < now() - interval '1 day';
  `);
}

async function createEmailVerificationCode({
  email,
  purpose = "register",
  userId = null
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const code = String(Math.floor(100000 + Math.random() * 900000));

  await pool.query(
    `
    DELETE FROM email_verification_codes
    WHERE LOWER(email) = LOWER($1)
      AND purpose = $2
      AND ($3::int IS NULL OR user_id = $3)
    `,
    [normalizedEmail, purpose, userId]
  );

  const insertRes = await pool.query(
    `
    INSERT INTO email_verification_codes (email, user_id, purpose, code, expires_at)
    VALUES ($1, $2, $3, $4, now() + interval '10 minutes')
    RETURNING id
    `,
    [normalizedEmail, userId, purpose, code]
  );

  return {
    code,
    verificationId: Number(insertRes.rows[0]?.id || 0) || null
  };
}

async function verifyEmailVerificationCode({
  email,
  code,
  purpose = "register",
  userId = null,
  verificationId = null
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedCode = String(code || "").trim();
  let record = null;

  if (verificationId != null) {
    const byIdRes = await pool.query(
      `
      SELECT id, code, verified, expires_at, expires_at < now() AS is_expired
      FROM email_verification_codes
      WHERE id = $1
      LIMIT 1
      `,
      [verificationId]
    );

    record = byIdRes.rows[0] || null;
  }

  if (!record) {
    const byCodeRes = await pool.query(
      `
      SELECT id, code, verified, expires_at, expires_at < now() AS is_expired
      FROM email_verification_codes
      WHERE LOWER(email) = LOWER($1)
        AND purpose = $2
        AND ($3::int IS NULL OR user_id = $3)
        AND code = $4
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [normalizedEmail, purpose, userId, normalizedCode]
    );

    record = byCodeRes.rows[0] || null;
  }

  if (!record) {
    return { ok: false, error: "verification_code_not_found" };
  }

  if (record.is_expired) {
    await pool.query("DELETE FROM email_verification_codes WHERE id = $1", [record.id]);
    return { ok: false, error: "verification_code_expired" };
  }

  if (String(record.code) !== normalizedCode) {
    return { ok: false, error: "Wrong code" };
  }

  await pool.query(
    `
    UPDATE email_verification_codes
    SET verified = true,
        verified_at = now()
    WHERE id = $1
    `,
    [record.id]
  );

  return { ok: true, verificationId: Number(record.id) || null };
}

async function consumeVerifiedEmailCode({
  email,
  purpose = "register",
  userId = null,
  consume = true,
  verificationId = null
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  const recordRes = await pool.query(
    `
    SELECT id, expires_at, verified, expires_at < now() AS is_expired
    FROM email_verification_codes
    WHERE
      (
        ($4::int IS NOT NULL AND id = $4)
        OR
        ($4::int IS NULL AND LOWER(email) = LOWER($1) AND purpose = $2 AND ($3::int IS NULL OR user_id = $3))
      )
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [normalizedEmail, purpose, userId, verificationId]
  );

  const record = recordRes.rows[0];
  if (!record) {
    return { ok: false, error: "verification_code_not_found" };
  }

  if (record.is_expired) {
    await pool.query("DELETE FROM email_verification_codes WHERE id = $1", [record.id]);
    return { ok: false, error: "verification_code_expired" };
  }

  if (!record.verified) {
    return { ok: false, error: "email_not_verified" };
  }

  if (consume) {
    await pool.query(
      `
      DELETE FROM email_verification_codes
      WHERE id = $1
      `,
      [verificationId || record.id]
    );
  }

  return { ok: true };
}

async function awardXP(userId, actionKey, options = {}) {
  const {
    amount = 0,
    eventKey = null,
    cooldownSeconds = 0,
    dailyLimit = null,
    meta = {}
  } = options;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userRes = await client.query(
      "SELECT COALESCE(xp, 0)::int AS xp FROM users WHERE id = $1 FOR UPDATE",
      [userId]
    );

    if (!userRes.rows.length) {
      throw new Error("xp_user_not_found");
    }

    const currentXp = Number(userRes.rows[0].xp || 0);

    if (!amount || amount <= 0) {
      await client.query("COMMIT");
      return buildXpAwardState(currentXp, 0);
    }

    if (dailyLimit !== null) {
      const dailyRes = await client.query(
        `
        SELECT COUNT(*)::int AS count
        FROM xp_events
        WHERE user_id = $1
          AND action_key = $2
          AND created_at >= NOW() - INTERVAL '24 hours'
        `,
        [userId, actionKey]
      );

      if (Number(dailyRes.rows[0]?.count || 0) >= Number(dailyLimit)) {
        await client.query("COMMIT");
        return buildXpAwardState(currentXp, 0);
      }
    }

    if (cooldownSeconds > 0) {
      const latestRes = await client.query(
        `
        SELECT created_at
        FROM xp_events
        WHERE user_id = $1
          AND action_key = $2
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [userId, actionKey]
      );

      if (latestRes.rows.length) {
        const latestTime = new Date(latestRes.rows[0].created_at).getTime();
        if (Date.now() - latestTime < cooldownSeconds * 1000) {
          await client.query("COMMIT");
          return buildXpAwardState(currentXp, 0);
        }
      }
    }

    if (eventKey) {
      const insertEventRes = await client.query(
        `
        INSERT INTO xp_events (user_id, action_key, event_key, amount, meta)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (user_id, event_key) DO NOTHING
        RETURNING id
        `,
        [userId, actionKey, eventKey, amount, JSON.stringify(meta || {})]
      );

      if (!insertEventRes.rows.length) {
        await client.query("COMMIT");
        return buildXpAwardState(currentXp, 0);
      }
    } else {
      await client.query(
        `
        INSERT INTO xp_events (user_id, action_key, amount, meta)
        VALUES ($1, $2, $3, $4::jsonb)
        `,
        [userId, actionKey, amount, JSON.stringify(meta || {})]
      );
    }

    const nextXp = Math.max(0, currentXp + amount);

    await client.query(
      "UPDATE users SET xp = $1 WHERE id = $2",
      [nextXp, userId]
    );

    await client.query("COMMIT");
    return buildXpAwardState(currentXp, amount);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("XP AWARD ERROR:", e);
    throw e;
  } finally {
    client.release();
  }
}

async function findOrCreateTelegramUser(telegramProfile = {}) {
  const telegramId = String(telegramProfile.id || "");

  if (!telegramId) {
    throw new Error("telegram_id_missing");
  }

  const existingUserRes = await pool.query(
    "SELECT * FROM users WHERE telegram_id = $1 LIMIT 1",
    [telegramId]
  );

  if (existingUserRes.rows.length) {
    return existingUserRes.rows[0];
  }

  const baseName = telegramProfile.username || telegramProfile.first_name || "user";
  const usernameTag = await getUniqueUsernameTag(baseName);

  const createdUserRes = await pool.query(
    `
    INSERT INTO users (telegram_id, username, username_tag, avatar)
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [
      telegramId,
      telegramProfile.first_name || telegramProfile.username || "user",
      usernameTag,
      "/images/default-avatar.jpg"
    ]
  );

  return createdUserRes.rows[0];
}

async function getTelegramAuthRequest(requestToken) {
  const requestRes = await pool.query(
    "SELECT * FROM telegram_auth_requests WHERE request_token = $1 LIMIT 1",
    [requestToken]
  );

  return requestRes.rows[0] || null;
}

function buildTelegramAuthMessage(authRequest) {
  return [
    `🔐 <b>Запрос на вход в РИТМОРИЮ</b>`,
    "",
    "Кто-то пытается войти в ваш аккаунт через веб-версию.",
    "",
    `🌐 <b>Браузер:</b> ${escapeTelegramHtml(authRequest.browser || "Неизвестно")}`,
    `💻 <b>ОС:</b> ${escapeTelegramHtml(authRequest.os || "Неизвестно")}`,
    `📍 <b>IP:</b> ${escapeTelegramHtml(authRequest.ip || "Неизвестно")}`,
    "",
    "Если это вы — нажмите <b>«Разрешить»</b>.",
    "Если нет — нажмите <b>«Отклонить»</b>."
  ].join("\n");
}

async function markTelegramAuthRequestRejected(requestToken) {
  await pool.query(
    `
    UPDATE telegram_auth_requests
    SET status = 'rejected',
        resolved_at = now(),
        error = 'rejected_by_user'
    WHERE request_token = $1
    `,
    [requestToken]
  );
}

async function approveTelegramAuthRequest(requestToken, telegramProfile = {}) {
  const authRequest = await getTelegramAuthRequest(requestToken);

  if (!authRequest) {
    throw new Error("telegram_auth_request_not_found");
  }

  const user = await findOrCreateTelegramUser(telegramProfile);
  const appToken = signAppToken(user);

  await pool.query(
    `
    UPDATE telegram_auth_requests
    SET status = 'approved',
        telegram_id = $2,
        telegram_chat_id = $3,
        telegram_username = $4,
        approved_user_id = $5,
        app_token = $6,
        resolved_at = now(),
        error = NULL
    WHERE request_token = $1
    `,
    [
      requestToken,
      String(telegramProfile.id || ""),
      telegramProfile.id ? String(telegramProfile.id) : null,
      telegramProfile.username || null,
      user.id,
      appToken
    ]
  );

  return { user, appToken };
}

// ===== XP SYSTEM =====
async function addXP(userId, amount) {
  try {
    const result = await pool.query(
      "UPDATE users SET xp = COALESCE(xp,0) + $1 WHERE id = $2 RETURNING xp",
      [amount, userId]
    );

    return Number(result.rows[0]?.xp || 0);
  } catch (e) {
    console.error("XP ERROR:", e);
    return null;
  }
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedCorsOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  }
}));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../public")));

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "no_token" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded; // 🔥 ВАЖНО

    next();
  } catch (err) {
    return res.status(401).json({ error: "invalid_token" });
  }
}

function getUserIdFromToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new Error("Unauthorized");
  }

  const token = authHeader.split(" ")[1];
  const decoded = jwt.verify(token, JWT_SECRET);
  return decoded.id;
}

function getOptionalUserIdFromReq(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.id;
  } catch {
    return null;
  }
}

async function touchUserLastSeen(userId) {
  const normalizedUserId = Number(userId) || 0;
  if (!normalizedUserId) return;

  try {
    await pool.query(
      "UPDATE users SET last_seen_at = now() WHERE id = $1",
      [normalizedUserId]
    );
  } catch (err) {
    console.error("LAST SEEN UPDATE ERROR:", err);
  }
}

function normalizeOptionalProfileUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw)) {
    return raw;
  }

  return `https://${raw}`;
}

function isAllowedProfileLink(value, allowedHosts = []) {
  const raw = String(value ?? "").trim();
  if (!raw) return true;

  try {
    const parsed = new URL(normalizeOptionalProfileUrl(raw));
    const host = String(parsed.hostname || "").toLowerCase();
    return allowedHosts.some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`));
  } catch {
    return false;
  }
}

function isValidTelegramProfileLink(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return true;

  if (/^@[a-z0-9_]{4,32}$/i.test(raw)) {
    return true;
  }

  try {
    const parsed = new URL(normalizeOptionalProfileUrl(raw));
    const host = String(parsed.hostname || "").toLowerCase();
    return host === "t.me" || host.endsWith(".t.me") || host === "telegram.me" || host.endsWith(".telegram.me");
  } catch {
    return false;
  }
}

async function ensurePostSocialSchema() {
  await pool.query(`
    ALTER TABLE posts
      ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;

    CREATE TABLE IF NOT EXISTS post_reactions (
      id SERIAL PRIMARY KEY,
      post_id integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reaction varchar(10) NOT NULL CHECK (reaction IN ('like', 'dislike')),
      created_at timestamp without time zone DEFAULT now(),
      UNIQUE (post_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS post_comments (
      id SERIAL PRIMARY KEY,
      post_id integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id integer REFERENCES post_comments(id) ON DELETE CASCADE,
      text text NOT NULL,
      created_at timestamp without time zone DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS post_comment_reactions (
      id SERIAL PRIMARY KEY,
      comment_id integer NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reaction varchar(10) NOT NULL CHECK (reaction IN ('like', 'dislike')),
      created_at timestamp without time zone DEFAULT now(),
      UNIQUE (comment_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS post_reposts (
      id SERIAL PRIMARY KEY,
      post_id integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamp without time zone DEFAULT now(),
      UNIQUE (post_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_post_reactions_post_id
      ON post_reactions(post_id);

    CREATE INDEX IF NOT EXISTS idx_post_comments_post_id
      ON post_comments(post_id);

    CREATE INDEX IF NOT EXISTS idx_post_comments_parent_id
      ON post_comments(parent_id);

    CREATE INDEX IF NOT EXISTS idx_post_comment_reactions_comment_id
      ON post_comment_reactions(comment_id);

    CREATE INDEX IF NOT EXISTS idx_post_reposts_post_id
      ON post_reposts(post_id);

    CREATE INDEX IF NOT EXISTS idx_post_reposts_user_id
      ON post_reposts(user_id);

    ALTER TABLE post_reactions
      ADD COLUMN IF NOT EXISTS reaction varchar(10);

    ALTER TABLE post_reactions
      ADD COLUMN IF NOT EXISTS created_at timestamp without time zone DEFAULT now();

    UPDATE post_reactions
    SET reaction = 'like'
    WHERE reaction IS NULL;

    ALTER TABLE post_reactions
      ALTER COLUMN reaction SET DEFAULT 'like';

    ALTER TABLE post_comments
      ADD COLUMN IF NOT EXISTS parent_id integer REFERENCES post_comments(id) ON DELETE CASCADE;

    ALTER TABLE post_comments
      ADD COLUMN IF NOT EXISTS created_at timestamp without time zone DEFAULT now();

    ALTER TABLE post_comments
      ADD COLUMN IF NOT EXISTS text text;

    ALTER TABLE post_comment_reactions
      ADD COLUMN IF NOT EXISTS reaction varchar(10);

    ALTER TABLE post_comment_reactions
      ADD COLUMN IF NOT EXISTS created_at timestamp without time zone DEFAULT now();

    UPDATE post_comment_reactions
    SET reaction = 'like'
    WHERE reaction IS NULL;

    ALTER TABLE post_comment_reactions
      ALTER COLUMN reaction SET DEFAULT 'like';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_post_reactions_unique
      ON post_reactions(post_id, user_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_post_comment_reactions_unique
      ON post_comment_reactions(comment_id, user_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_post_reposts_unique
      ON post_reposts(post_id, user_id);
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'post_reactions' AND column_name = 'reaction'
      ) THEN
        BEGIN
          ALTER TABLE post_reactions
            ALTER COLUMN reaction SET NOT NULL;
        EXCEPTION WHEN others THEN
          NULL;
        END;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'post_comment_reactions' AND column_name = 'reaction'
      ) THEN
        BEGIN
          ALTER TABLE post_comment_reactions
            ALTER COLUMN reaction SET NOT NULL;
        EXCEPTION WHEN others THEN
          NULL;
        END;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'post_comments' AND column_name = 'content'
      ) THEN
        BEGIN
          EXECUTE '
            UPDATE post_comments
            SET text = content
            WHERE text IS NULL
              AND content IS NOT NULL
          ';
        EXCEPTION WHEN others THEN
          NULL;
        END;
      END IF;
    END
    $$;
  `);
}

async function ensureTrackCommentsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS track_comments (
      id SERIAL PRIMARY KEY,
      track_id integer NOT NULL REFERENCES user_tracks(id) ON DELETE CASCADE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id integer REFERENCES track_comments(id) ON DELETE CASCADE,
      text text NOT NULL,
      created_at timestamp without time zone DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS track_comment_reactions (
      id SERIAL PRIMARY KEY,
      comment_id integer NOT NULL REFERENCES track_comments(id) ON DELETE CASCADE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reaction varchar(10) NOT NULL CHECK (reaction IN ('like', 'dislike')),
      created_at timestamp without time zone DEFAULT now(),
      UNIQUE (comment_id, user_id)
    );

    ALTER TABLE track_comments
      ADD COLUMN IF NOT EXISTS parent_id integer REFERENCES track_comments(id) ON DELETE CASCADE;

    ALTER TABLE track_comments
      ADD COLUMN IF NOT EXISTS created_at timestamp without time zone DEFAULT now();

    ALTER TABLE track_comments
      ADD COLUMN IF NOT EXISTS text text;

    ALTER TABLE track_comment_reactions
      ADD COLUMN IF NOT EXISTS reaction varchar(10);

    ALTER TABLE track_comment_reactions
      ADD COLUMN IF NOT EXISTS created_at timestamp without time zone DEFAULT now();

    UPDATE track_comment_reactions
    SET reaction = 'like'
    WHERE reaction IS NULL;

    ALTER TABLE track_comment_reactions
      ALTER COLUMN reaction SET DEFAULT 'like';

    CREATE INDEX IF NOT EXISTS idx_track_comments_track_id
      ON track_comments(track_id);

    CREATE INDEX IF NOT EXISTS idx_track_comments_parent_id
      ON track_comments(parent_id);

    CREATE INDEX IF NOT EXISTS idx_track_comment_reactions_comment_id
      ON track_comment_reactions(comment_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_track_comment_reactions_unique
      ON track_comment_reactions(comment_id, user_id);
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'comment_likes'
      ) THEN
        INSERT INTO track_comment_reactions (comment_id, user_id, reaction, created_at)
        SELECT cl.comment_id, cl.user_id, 'like', now()
        FROM comment_likes cl
        ON CONFLICT (comment_id, user_id) DO NOTHING;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'track_comment_reactions' AND column_name = 'reaction'
      ) THEN
        BEGIN
          ALTER TABLE track_comment_reactions
            ALTER COLUMN reaction SET NOT NULL;
        EXCEPTION WHEN others THEN
          NULL;
        END;
      END IF;
    END
    $$;
  `);
}

async function ensureTrackActionsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS track_actions (
      id SERIAL PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      track_id integer NOT NULL,
      action varchar(10) NOT NULL CHECK (action IN ('like', 'dislike')),
      entity_type varchar(20) NOT NULL DEFAULT 'profile',
      created_at timestamp without time zone DEFAULT now()
    );

    ALTER TABLE track_actions
      ADD COLUMN IF NOT EXISTS entity_type varchar(20) NOT NULL DEFAULT 'profile';

    ALTER TABLE track_actions
      ADD COLUMN IF NOT EXISTS created_at timestamp without time zone DEFAULT now();

    UPDATE track_actions
    SET entity_type = 'profile'
    WHERE entity_type IS NULL OR entity_type = '';

    CREATE INDEX IF NOT EXISTS idx_track_actions_track_entity
      ON track_actions(track_id, entity_type);

    CREATE INDEX IF NOT EXISTS idx_track_actions_user_track_entity
      ON track_actions(user_id, track_id, entity_type);
  `);
}

async function ensureTrackRepostSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS track_reposts (
      id SERIAL PRIMARY KEY,
      track_id integer NOT NULL REFERENCES user_tracks(id) ON DELETE CASCADE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamp without time zone DEFAULT now(),
      UNIQUE (track_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_track_reposts_track_id
      ON track_reposts(track_id);

    CREATE INDEX IF NOT EXISTS idx_track_reposts_user_id
      ON track_reposts(user_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_track_reposts_unique
      ON track_reposts(track_id, user_id);
  `);
}

async function ensureProfileTrackRatingsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profile_track_ratings (
      id SERIAL PRIMARY KEY,
      profile_track_id integer NOT NULL REFERENCES user_tracks(id) ON DELETE CASCADE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type varchar(10) NOT NULL CHECK (type IN ('user', 'judge')),
      score integer NOT NULL,
      created_at timestamp without time zone DEFAULT now(),
      updated_at timestamp without time zone DEFAULT now(),
      UNIQUE(profile_track_id, user_id, type)
    );

    CREATE TABLE IF NOT EXISTS profile_track_rating_details (
      id SERIAL PRIMARY KEY,
      profile_track_id integer NOT NULL REFERENCES user_tracks(id) ON DELETE CASCADE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rhymes numeric(10,2) NOT NULL,
      structure numeric(10,2) NOT NULL,
      style numeric(10,2) NOT NULL,
      charisma numeric(10,2) NOT NULL,
      vibe numeric(10,2) NOT NULL,
      memory numeric(10,2) NOT NULL,
      total integer NOT NULL,
      rating_type varchar(10) NOT NULL CHECK (rating_type IN ('user', 'judge')),
      created_at timestamp without time zone DEFAULT now(),
      updated_at timestamp without time zone DEFAULT now(),
      UNIQUE(profile_track_id, user_id, rating_type)
    );

    CREATE INDEX IF NOT EXISTS idx_profile_track_ratings_track
      ON profile_track_ratings(profile_track_id, type);

    CREATE INDEX IF NOT EXISTS idx_profile_track_rating_details_track
      ON profile_track_rating_details(profile_track_id, rating_type);
  `);
}

async function ensureMentionsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS post_mentions (
      id SERIAL PRIMARY KEY,
      post_id integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      source_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mentioned_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamp without time zone NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS track_mentions (
      id SERIAL PRIMARY KEY,
      track_id integer NOT NULL REFERENCES user_tracks(id) ON DELETE CASCADE,
      source_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mentioned_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamp without time zone NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_post_mentions_unique
      ON post_mentions(post_id, mentioned_user_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_track_mentions_unique
      ON track_mentions(track_id, mentioned_user_id);

    CREATE INDEX IF NOT EXISTS idx_post_mentions_target
      ON post_mentions(mentioned_user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_track_mentions_target
      ON track_mentions(mentioned_user_id, created_at DESC);
  `);
}

async function ensureHomeNewsSchema() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS home_news (
        id SERIAL PRIMARY KEY,
        title varchar(160) NOT NULL,
      content text NOT NULL,
      media_url text,
      media_type varchar(16),
      created_by integer REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamp without time zone DEFAULT now()
    );

    ALTER TABLE home_news
      ADD COLUMN IF NOT EXISTS media_url text;

    ALTER TABLE home_news
      ADD COLUMN IF NOT EXISTS media_type varchar(16);

      CREATE INDEX IF NOT EXISTS idx_home_news_created_at
        ON home_news(created_at DESC);

      CREATE TABLE IF NOT EXISTS home_stream_top_tracks (
        id SERIAL PRIMARY KEY,
        position integer NOT NULL,
        track_id integer,
        title varchar(255) NOT NULL,
        artist text,
        cover text,
        audio text,
        soundcloud text,
        duration integer,
        username varchar(255),
        username_tag varchar(80),
        avatar text,
        user_score numeric(10,1) DEFAULT 0,
        judge_score numeric(10,1) DEFAULT 0,
        total_score numeric(10,1) DEFAULT 0,
        user_votes_count integer DEFAULT 0,
        judge_votes_count integer DEFAULT 0,
        snapshot_at timestamp without time zone NOT NULL DEFAULT now()
      );

      ALTER TABLE home_stream_top_tracks
        ADD COLUMN IF NOT EXISTS audio text;

      ALTER TABLE home_stream_top_tracks
        ADD COLUMN IF NOT EXISTS soundcloud text;

      CREATE INDEX IF NOT EXISTS idx_home_stream_top_tracks_position
        ON home_stream_top_tracks(position);

      CREATE TABLE IF NOT EXISTS user_stream_place_stats (
        user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        first_places integer NOT NULL DEFAULT 0,
        second_places integer NOT NULL DEFAULT 0,
        third_places integer NOT NULL DEFAULT 0,
        updated_at timestamp without time zone NOT NULL DEFAULT now()
      );
    `);
}

async function ensureUserBadgeSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS music_collectives (
      id SERIAL PRIMARY KEY,
      owner_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name varchar(48) NOT NULL UNIQUE,
      created_at timestamp without time zone NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS music_collective_members (
      collective_id integer NOT NULL REFERENCES music_collectives(id) ON DELETE CASCADE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role varchar(20) NOT NULL DEFAULT 'member',
      created_at timestamp without time zone NOT NULL DEFAULT now(),
      PRIMARY KEY (collective_id, user_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_collective_members_user_unique
      ON music_collective_members(user_id);

    CREATE TABLE IF NOT EXISTS music_collective_invites (
      id SERIAL PRIMARY KEY,
      collective_id integer NOT NULL REFERENCES music_collectives(id) ON DELETE CASCADE,
      invited_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invited_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status varchar(20) NOT NULL DEFAULT 'pending',
      created_at timestamp without time zone NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_collective_invites_pending_unique
      ON music_collective_invites(collective_id, invited_user_id)
      WHERE status = 'pending';

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS collective_id integer;

    CREATE INDEX IF NOT EXISTS idx_users_collective_id
      ON users(collective_id)
      WHERE collective_id IS NOT NULL;
  `);
}


async function saveClosedQueueTopTracksSnapshot() {
  const snapshotRes = await pool.query(`
    SELECT
      t.id AS track_id,
      t.user_id,
      t.title,
      t.artist,
      t.cover,
      t.audio,
      t.soundcloud,
      t.duration,
      COALESCE(u.username, u.username_tag, 'Артист') AS username,
      u.username_tag,
      u.avatar,
      COALESCE((
        SELECT ROUND(AVG(score)::numeric, 1)
        FROM track_ratings
        WHERE track_id = t.id AND type = 'user'
      ), 0) AS user_score,
      COALESCE((
        SELECT ROUND(AVG(score)::numeric, 1)
        FROM track_ratings
        WHERE track_id = t.id AND type = 'judge'
      ), 0) AS judge_score,
      (
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM track_ratings
            WHERE track_id = t.id AND type = 'user'
          ) AND EXISTS (
            SELECT 1
            FROM track_ratings
            WHERE track_id = t.id AND type = 'judge'
          ) THEN (
            (
              COALESCE((
                SELECT AVG(score)
                FROM track_ratings
                WHERE track_id = t.id AND type = 'user'
              ), 0)
              +
              COALESCE((
                SELECT AVG(score)
                FROM track_ratings
                WHERE track_id = t.id AND type = 'judge'
              ), 0)
            ) / 2.0
          )
          WHEN EXISTS (
            SELECT 1
            FROM track_ratings
            WHERE track_id = t.id AND type = 'judge'
          ) THEN COALESCE((
            SELECT AVG(score)
            FROM track_ratings
            WHERE track_id = t.id AND type = 'judge'
          ), 0)
          ELSE COALESCE((
            SELECT AVG(score)
            FROM track_ratings
            WHERE track_id = t.id AND type = 'user'
          ), 0)
        END
      )::numeric(10,1) AS total_score,
      COALESCE((
        SELECT COUNT(*)::int
        FROM track_ratings
        WHERE track_id = t.id AND type = 'user'
      ), 0) AS user_votes_count,
      COALESCE((
        SELECT COUNT(*)::int
        FROM track_ratings
        WHERE track_id = t.id AND type = 'judge'
      ), 0) AS judge_votes_count
    FROM tracks t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE EXISTS (
      SELECT 1
      FROM track_ratings tr
      WHERE tr.track_id = t.id
        AND tr.type = 'judge'
    )
    ORDER BY judge_score DESC, total_score DESC, user_score DESC, t.createdAt DESC
    LIMIT 10
  `);

  if (!snapshotRes.rows.length) {
    return false;
  }

  await replaceHomeTopTracksSnapshot(snapshotRes.rows, "track_id");
  await awardQueuePodiumPlaces(snapshotRes.rows);

  return true;
}

function buildQueuePodiumSignature(rows = []) {
  return rows
    .slice(0, 3)
    .map((row, index) => `${index + 1}:${Number(row.track_id || row.id || 0) || 0}`)
    .join("|");
}

async function awardQueuePodiumPlaces(rows = []) {
  const podiumRows = rows
    .slice(0, 3)
    .filter((row) => Number(row.user_id || 0) > 0);

  if (!podiumRows.length) {
    return false;
  }

  const signature = buildQueuePodiumSignature(podiumRows);
  if (!signature) {
    return false;
  }

  const signatureRes = await pool.query(
    "SELECT value FROM system_settings WHERE key = 'queue_podium_signature'"
  );

  if (signatureRes.rows[0]?.value === signature) {
    return false;
  }

  for (const [index, row] of podiumRows.entries()) {
    const userId = Number(row.user_id || 0);
    if (!userId) continue;

    await pool.query(
      `
      INSERT INTO user_stream_place_stats (
        user_id,
        first_places,
        second_places,
        third_places,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        now()
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        first_places = user_stream_place_stats.first_places + EXCLUDED.first_places,
        second_places = user_stream_place_stats.second_places + EXCLUDED.second_places,
        third_places = user_stream_place_stats.third_places + EXCLUDED.third_places,
        updated_at = now()
      `,
      [
        userId,
        index === 0 ? 1 : 0,
        index === 1 ? 1 : 0,
        index === 2 ? 1 : 0
      ]
    );
  }

  await pool.query(
    `
    INSERT INTO system_settings (key, value)
    VALUES ('queue_podium_signature', $1)
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value
    `,
    [signature]
  );

  return true;
}

async function replaceHomeTopTracksSnapshot(rows = [], idField = "track_id") {
  if (!Array.isArray(rows) || !rows.length) {
    return false;
  }

  await pool.query("DELETE FROM home_stream_top_tracks");

  for (const [index, row] of rows.entries()) {
    await pool.query(
      `
      INSERT INTO home_stream_top_tracks (
        position,
        track_id,
        title,
        artist,
        cover,
        audio,
        soundcloud,
        duration,
        username,
        username_tag,
        avatar,
        user_score,
        judge_score,
        total_score,
        user_votes_count,
        judge_votes_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `,
      [
        index + 1,
        Number(row[idField]) || null,
        String(row.title || "Без названия"),
        row.artist || "",
        row.cover || "",
        row.audio || "",
        row.soundcloud || "",
        Number(row.duration || 0) || 0,
        row.username || "",
        row.username_tag || "",
        row.avatar || "",
        Number(row.user_score || 0) || 0,
        Number(row.judge_score || 0) || 0,
        Number(row.total_score || 0) || 0,
        Number(row.user_votes_count || 0) || 0,
        Number(row.judge_votes_count || 0) || 0
      ]
    );
  }

  return true;
}

async function getHomeTopTracksSnapshot() {
  const snapshotRes = await pool.query(
    `
    SELECT
      track_id AS id,
      title,
      artist,
      cover,
      audio,
      soundcloud,
      duration,
      username,
      username_tag,
      avatar,
      user_score,
      judge_score,
      total_score,
      user_votes_count,
      judge_votes_count,
      snapshot_at
    FROM home_stream_top_tracks
    ORDER BY position ASC, id ASC
    `
  );

  if (snapshotRes.rows.length) {
    return snapshotRes.rows;
  }

  const queueStateRes = await pool.query(
    "SELECT value FROM system_settings WHERE key = 'queue_state'"
  );

  // Если очередь уже открыта заново и живых треков в ней ещё нет,
  // просто не строим новый рейтинг с нуля.
  if (queueStateRes.rows[0]?.value !== "closed") {
    return [];
  }

  const liveRes = await pool.query(
    `
    SELECT
      t.id,
      t.user_id,
      t.title,
      t.artist,
      t.cover,
      t.audio,
      t.soundcloud,
      t.duration,
      COALESCE(u.username, u.username_tag, 'Артист') AS username,
      u.username_tag,
      u.avatar,
      COALESCE((
        SELECT ROUND(AVG(score)::numeric, 1)
        FROM track_ratings
        WHERE track_id = t.id AND type = 'user'
      ), 0) AS user_score,
      COALESCE((
        SELECT ROUND(AVG(score)::numeric, 1)
        FROM track_ratings
        WHERE track_id = t.id AND type = 'judge'
      ), 0) AS judge_score,
      (
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM track_ratings
            WHERE track_id = t.id AND type = 'user'
          ) AND EXISTS (
            SELECT 1
            FROM track_ratings
            WHERE track_id = t.id AND type = 'judge'
          ) THEN (
            (
              COALESCE((
                SELECT AVG(score)
                FROM track_ratings
                WHERE track_id = t.id AND type = 'user'
              ), 0)
              +
              COALESCE((
                SELECT AVG(score)
                FROM track_ratings
                WHERE track_id = t.id AND type = 'judge'
              ), 0)
            ) / 2.0
          )
          WHEN EXISTS (
            SELECT 1
            FROM track_ratings
            WHERE track_id = t.id AND type = 'judge'
          ) THEN COALESCE((
            SELECT AVG(score)
            FROM track_ratings
            WHERE track_id = t.id AND type = 'judge'
          ), 0)
          ELSE COALESCE((
            SELECT AVG(score)
            FROM track_ratings
            WHERE track_id = t.id AND type = 'user'
          ), 0)
        END
      )::numeric(10,1) AS total_score,
      COALESCE((
        SELECT COUNT(*)::int
        FROM track_ratings
        WHERE track_id = t.id AND type = 'user'
      ), 0) AS user_votes_count,
      COALESCE((
        SELECT COUNT(*)::int
        FROM track_ratings
        WHERE track_id = t.id AND type = 'judge'
      ), 0) AS judge_votes_count,
      now() AS snapshot_at
    FROM tracks t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE EXISTS (
      SELECT 1
      FROM track_ratings tr
      WHERE tr.track_id = t.id
        AND tr.type = 'judge'
    )
    ORDER BY judge_score DESC, total_score DESC, user_score DESC, t.createdAt DESC
    LIMIT 10
    `
  );

  if (liveRes.rows.length) {
    await replaceHomeTopTracksSnapshot(liveRes.rows, "id");
    await awardQueuePodiumPlaces(liveRes.rows);
  }

  return liveRes.rows;
}

async function ensureCommunitySchema() {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS open_tracks (
      id SERIAL PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title varchar(160) NOT NULL,
      description text,
      genre varchar(120),
      looking_for text,
      cover_url text,
      audio_url text,
      soundcloud_url text,
      status varchar(20) NOT NULL DEFAULT 'open',
      selected_candidate_id integer,
      created_at timestamp without time zone DEFAULT now(),
      updated_at timestamp without time zone DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS open_track_candidates (
      id SERIAL PRIMARY KEY,
      open_track_id integer NOT NULL REFERENCES open_tracks(id) ON DELETE CASCADE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message text,
      status varchar(20) NOT NULL DEFAULT 'pending',
      created_at timestamp without time zone DEFAULT now(),
      UNIQUE (open_track_id, user_id)
    );

    ALTER TABLE open_tracks
      ADD COLUMN IF NOT EXISTS description text;

    ALTER TABLE open_tracks
      ADD COLUMN IF NOT EXISTS genre varchar(120);

    ALTER TABLE open_tracks
      ADD COLUMN IF NOT EXISTS looking_for text;

    ALTER TABLE open_tracks
      ADD COLUMN IF NOT EXISTS cover_url text;

    ALTER TABLE open_tracks
      ADD COLUMN IF NOT EXISTS audio_url text;

    ALTER TABLE open_tracks
      ADD COLUMN IF NOT EXISTS soundcloud_url text;

    ALTER TABLE open_tracks
      ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'open';

    ALTER TABLE open_tracks
      ADD COLUMN IF NOT EXISTS selected_candidate_id integer;

    ALTER TABLE open_tracks
      ADD COLUMN IF NOT EXISTS created_at timestamp without time zone DEFAULT now();

    ALTER TABLE open_tracks
      ADD COLUMN IF NOT EXISTS updated_at timestamp without time zone DEFAULT now();

    ALTER TABLE open_track_candidates
      ADD COLUMN IF NOT EXISTS message text;

    ALTER TABLE open_track_candidates
      ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'pending';

    ALTER TABLE open_track_candidates
      ADD COLUMN IF NOT EXISTS created_at timestamp without time zone DEFAULT now();

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id integer REFERENCES users(id) ON DELETE CASCADE,
      type varchar(40) NOT NULL,
      entity_type varchar(40),
      entity_id integer,
      text text NOT NULL,
      metadata jsonb DEFAULT '{}'::jsonb,
      is_read boolean NOT NULL DEFAULT false,
      created_at timestamp without time zone DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS direct_conversations (
      id SERIAL PRIMARY KEY,
      user_one_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_two_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_type varchar(24) NOT NULL DEFAULT 'direct',
      title varchar(160),
      description text,
      avatar varchar(500),
      owner_id integer REFERENCES users(id) ON DELETE SET NULL,
      last_message_at timestamp without time zone DEFAULT now(),
      created_at timestamp without time zone DEFAULT now(),
      UNIQUE (user_one_id, user_two_id)
    );

      CREATE TABLE IF NOT EXISTS direct_conversation_members (
        id SERIAL PRIMARY KEY,
        conversation_id integer NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role varchar(24) NOT NULL DEFAULT 'member',
        is_pinned boolean NOT NULL DEFAULT false,
        pinned_order integer,
        last_read_at timestamp without time zone DEFAULT now(),
        joined_at timestamp without time zone DEFAULT now(),
        UNIQUE (conversation_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS direct_message_preferences (
        id SERIAL PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_muted boolean NOT NULL DEFAULT false,
        is_blocked boolean NOT NULL DEFAULT false,
        is_pinned boolean NOT NULL DEFAULT false,
        pinned_order integer,
        created_at timestamp without time zone DEFAULT now(),
        UNIQUE (user_id, target_user_id)
      );

      CREATE TABLE IF NOT EXISTS direct_messages (
        id SERIAL PRIMARY KEY,
        conversation_id integer NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
        sender_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        text text NOT NULL,
        attachment_url varchar(500),
        attachment_type varchar(120),
        attachment_name varchar(255),
        reply_to_message_id integer REFERENCES direct_messages(id) ON DELETE SET NULL,
        forwarded_from_message_id integer REFERENCES direct_messages(id) ON DELETE SET NULL,
        is_read boolean NOT NULL DEFAULT false,
        created_at timestamp without time zone DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS direct_conversation_invites (
        id SERIAL PRIMARY KEY,
        conversation_id integer NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
        inviter_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        invited_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status varchar(24) NOT NULL DEFAULT 'pending',
        created_at timestamp without time zone DEFAULT now(),
        responded_at timestamp without time zone,
        UNIQUE (conversation_id, invited_user_id)
      );

      CREATE TABLE IF NOT EXISTS direct_message_reactions (
        id SERIAL PRIMARY KEY,
        message_id integer NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        emoji varchar(16) NOT NULL,
        created_at timestamp without time zone DEFAULT now(),
        UNIQUE (message_id, user_id, emoji)
      );

      ALTER TABLE direct_messages
        ADD COLUMN IF NOT EXISTS reply_to_message_id integer REFERENCES direct_messages(id) ON DELETE SET NULL;

      ALTER TABLE direct_messages
        ADD COLUMN IF NOT EXISTS forwarded_from_message_id integer REFERENCES direct_messages(id) ON DELETE SET NULL;

      ALTER TABLE direct_messages
        ADD COLUMN IF NOT EXISTS attachment_url varchar(500);

      ALTER TABLE direct_messages
        ADD COLUMN IF NOT EXISTS attachment_type varchar(120);

      ALTER TABLE direct_messages
        ADD COLUMN IF NOT EXISTS attachment_name varchar(255);

      ALTER TABLE direct_conversations
        ADD COLUMN IF NOT EXISTS conversation_type varchar(24) NOT NULL DEFAULT 'direct';

      ALTER TABLE direct_conversations
        ADD COLUMN IF NOT EXISTS title varchar(160);

      ALTER TABLE direct_conversations
        ADD COLUMN IF NOT EXISTS description text;

      ALTER TABLE direct_conversations
        ADD COLUMN IF NOT EXISTS avatar varchar(500);

      ALTER TABLE direct_conversations
        ADD COLUMN IF NOT EXISTS owner_id integer REFERENCES users(id) ON DELETE SET NULL;

      ALTER TABLE direct_conversations
        DROP CONSTRAINT IF EXISTS direct_conversations_user_one_id_user_two_id_key;

      ALTER TABLE direct_message_preferences
        ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

      ALTER TABLE direct_message_preferences
        ADD COLUMN IF NOT EXISTS pinned_order integer;

      ALTER TABLE direct_conversation_members
        ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

      ALTER TABLE direct_conversation_members
        ADD COLUMN IF NOT EXISTS pinned_order integer;

      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT true;

      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS dms_enabled boolean NOT NULL DEFAULT true;

    CREATE INDEX IF NOT EXISTS idx_open_tracks_created_at
      ON open_tracks(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_open_track_candidates_open_track_id
      ON open_track_candidates(open_track_id);

    CREATE INDEX IF NOT EXISTS idx_notifications_user_created
      ON notifications(user_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation_created
        ON direct_messages(conversation_id, created_at ASC);

      CREATE INDEX IF NOT EXISTS idx_direct_message_preferences_lookup
        ON direct_message_preferences(user_id, target_user_id);

      CREATE INDEX IF NOT EXISTS idx_direct_conversation_members_lookup
        ON direct_conversation_members(conversation_id, user_id);

      CREATE INDEX IF NOT EXISTS idx_direct_message_reactions_message_id
        ON direct_message_reactions(message_id);
    `);
  }

function extractMentionTags(text) {
  const source = String(text || "");
  const regex = /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{2,50})/g;
  const tags = new Set();

  let match;
  while ((match = regex.exec(source)) !== null) {
    const tag = String(match[2] || "").trim().toLowerCase();
    if (tag) {
      tags.add(tag);
    }
  }

  return Array.from(tags);
}

async function resolveMentionedUsers(tags = []) {
  if (!Array.isArray(tags) || !tags.length) {
    return [];
  }

  const normalized = Array.from(
    new Set(
      tags
        .map((tag) => String(tag || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );

  if (!normalized.length) {
    return [];
  }

  const result = await pool.query(
    `
    SELECT id, username, username_tag
    FROM users
    WHERE LOWER(username_tag) = ANY($1::text[])
    `,
    [normalized]
  );

  return result.rows;
}

async function attachArtistMentionsToTracks(tracks = []) {
  if (!Array.isArray(tracks) || !tracks.length) {
    return tracks;
  }

  const allTags = Array.from(
    new Set(
      tracks.flatMap((track) => extractMentionTags(track?.artist || ""))
    )
  );

  if (!allTags.length) {
    return tracks.map((track) => ({ ...track, artist_mentions: [] }));
  }

  const resolvedUsers = await resolveMentionedUsers(allTags);
  const userMap = new Map(
    resolvedUsers.map((user) => [
      String(user.username_tag || "").trim().toLowerCase(),
      {
        id: Number(user.id),
        username: user.username || user.username_tag || "",
        username_tag: user.username_tag || ""
      }
    ])
  );

  return tracks.map((track) => {
    const tags = extractMentionTags(track?.artist || "");
    const artistMentions = tags
      .map((tag) => userMap.get(String(tag || "").toLowerCase()))
      .filter(Boolean);

    return {
      ...track,
      artist_mentions: artistMentions
    };
  });
}

async function createNotification({
  userId,
  actorId = null,
  type,
  entityType = null,
  entityId = null,
  text,
  metadata = {},
  force = false
} = {}) {
  const recipientId = Number(userId);
  const senderId = actorId ? Number(actorId) : null;

  if (!recipientId || !type || !text) {
    return null;
  }

  if (senderId && senderId === recipientId) {
    return null;
  }

  if (type === "dm") {
    return null;
  }

  if (!force) {
    const recipientSettings = await pool.query(
      "SELECT COALESCE(notifications_enabled, true) AS notifications_enabled FROM users WHERE id = $1 LIMIT 1",
      [recipientId]
    );

    if (!recipientSettings.rows.length || recipientSettings.rows[0].notifications_enabled === false) {
      return null;
    }
  }

  const result = await pool.query(
    `
    INSERT INTO notifications (user_id, actor_id, type, entity_type, entity_id, text, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    RETURNING *
    `,
    [
      recipientId,
      senderId || null,
      type,
      entityType,
      entityId,
      text,
      JSON.stringify(metadata || {})
    ]
  );

  return result.rows[0] || null;
}

async function getDirectMessagePreference(userId, targetUserId) {
  const result = await pool.query(
    `
    SELECT is_muted, is_blocked
    FROM direct_message_preferences
    WHERE user_id = $1 AND target_user_id = $2
    LIMIT 1
    `,
    [Number(userId), Number(targetUserId)]
  );

  return result.rows[0] || { is_muted: false, is_blocked: false };
}

async function getUserMessageSettings(userId) {
  const result = await pool.query(
    `
    SELECT
      COALESCE(notifications_enabled, true) AS notifications_enabled,
      COALESCE(dms_enabled, true) AS dms_enabled
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [Number(userId)]
  );

  return result.rows[0] || { notifications_enabled: true, dms_enabled: true };
}

function normalizeConversationPair(userA, userB) {
  const a = Number(userA);
  const b = Number(userB);
  return a < b ? [a, b] : [b, a];
}

async function ensureConversationMembers(conversationId, memberIds = [], ownerId = null) {
  const numericConversationId = Number(conversationId);
  const uniqueMembers = [...new Set(memberIds.map((id) => Number(id)).filter(Boolean))];
  if (!numericConversationId || !uniqueMembers.length) return;

  for (const memberId of uniqueMembers) {
    const role = Number(ownerId) === Number(memberId) ? "owner" : "member";
    await pool.query(
      `
      INSERT INTO direct_conversation_members (conversation_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (conversation_id, user_id)
      DO UPDATE SET role = CASE
        WHEN direct_conversation_members.role = 'owner' THEN 'owner'
        ELSE EXCLUDED.role
      END
      `,
      [numericConversationId, memberId, role]
    );
  }
}

async function getOrCreateDirectConversation(userA, userB) {
  const [userOneId, userTwoId] = normalizeConversationPair(userA, userB);
  if (!userOneId || !userTwoId || userOneId === userTwoId) {
    throw new Error("invalid_conversation_pair");
  }

  const existing = await pool.query(
    `
    SELECT *
    FROM direct_conversations
    WHERE user_one_id = $1 AND user_two_id = $2
    LIMIT 1
    `,
    [userOneId, userTwoId]
  );

  if (existing.rows.length) {
    await ensureConversationMembers(existing.rows[0].id, [userOneId, userTwoId], userOneId);
    return existing.rows[0];
  }

  const created = await pool.query(
    `
    INSERT INTO direct_conversations (user_one_id, user_two_id, conversation_type, owner_id)
    VALUES ($1, $2, 'direct', $1)
    RETURNING *
    `,
    [userOneId, userTwoId]
  );

  await ensureConversationMembers(created.rows[0].id, [userOneId, userTwoId], userOneId);
  return created.rows[0];
}

async function getConversationForUser(conversationId, userId) {
  let result = await pool.query(
    `
    SELECT dc.*
    FROM direct_conversations dc
    WHERE id = $1
      AND EXISTS (
        SELECT 1
        FROM direct_conversation_members dcm
        WHERE dcm.conversation_id = dc.id
          AND dcm.user_id = $2
      )
    LIMIT 1
    `,
    [conversationId, userId]
  );

  if (result.rows.length) {
    return result.rows[0];
  }

  result = await pool.query(
    `
    SELECT *
    FROM direct_conversations
    WHERE id = $1
      AND ($2 IN (user_one_id, user_two_id))
    LIMIT 1
    `,
    [conversationId, userId]
  );

  if (!result.rows.length) {
    return null;
  }

  const conversation = result.rows[0];
  const seedMembers = [conversation.user_one_id, conversation.user_two_id].filter(Boolean);
  await ensureConversationMembers(conversation.id, seedMembers, conversation.owner_id || conversation.user_one_id);
  return conversation;
}

async function saveConversationAvatar(file, conversationId) {
  if (!file || !conversationId) return null;
  if (!String(file.mimetype || "").startsWith("image/")) {
    throw new Error("invalid_conversation_avatar");
  }

  const fileName = `conversation-${conversationId}.webp`;
  const filePath = path.join(__dirname, "..", "public", "uploads", "messages", "avatars", fileName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  await sharp(file.buffer)
    .resize(512, 512, { fit: "cover" })
    .webp({ quality: 92 })
    .toFile(filePath);

  return `/uploads/messages/avatars/${fileName}`;
}

async function syncPostMentions(postId, sourceUserId, content) {
  const numericPostId = Number(postId);
  const numericSourceUserId = Number(sourceUserId);

  if (!numericPostId || !numericSourceUserId) return;

  const tags = extractMentionTags(content);
  const users = await resolveMentionedUsers(tags);

  await pool.query("DELETE FROM post_mentions WHERE post_id = $1", [numericPostId]);

  if (!users.length) return;

  const mentionedUserIds = users
    .map((user) => Number(user.id))
    .filter((id) => id && id !== numericSourceUserId);

  for (const mentionedUserId of mentionedUserIds) {
    await pool.query(
      `
      INSERT INTO post_mentions (post_id, source_user_id, mentioned_user_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (post_id, mentioned_user_id) DO NOTHING
      `,
      [numericPostId, numericSourceUserId, mentionedUserId]
    );
  }
}

async function syncTrackMentions(trackId, sourceUserId, artistValue) {
  const numericTrackId = Number(trackId);
  const numericSourceUserId = Number(sourceUserId);

  if (!numericTrackId || !numericSourceUserId) return;

  const tags = extractMentionTags(artistValue);
  const users = await resolveMentionedUsers(tags);

  await pool.query("DELETE FROM track_mentions WHERE track_id = $1", [numericTrackId]);

  if (!users.length) return;

  const mentionedUserIds = users
    .map((user) => Number(user.id))
    .filter((id) => id && id !== numericSourceUserId);

  for (const mentionedUserId of mentionedUserIds) {
    await pool.query(
      `
      INSERT INTO track_mentions (track_id, source_user_id, mentioned_user_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (track_id, mentioned_user_id) DO NOTHING
      `,
      [numericTrackId, numericSourceUserId, mentionedUserId]
    );
  }
}

async function isAdmin(userId) {
  const result = await pool.query(
    "SELECT role FROM users WHERE id = $1",
    [userId]
  )

  return result.rows[0]?.role === "admin"
}

async function getUserFromToken(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;

  const token = auth.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const result = await pool.query(
      "SELECT id, role, is_banned FROM users WHERE id = $1",
      [decoded.id]
    );

    touchUserLastSeen(decoded.id);

    return result.rows[0];
  } catch {
    return null;
  }
}

function normalizePlaylistTrackForStorage(track) {
  if (!track || typeof track !== "object") {
    return null;
  }

  const id = Number(track.id) || 0;
  const title = String(track.title || "").trim() || "Без названия";
  const artist = String(track.artist || "").trim() || "Unknown artist";
  const cover = String(track.cover || "").trim();
  const audioSrc = String(track.audioSrc || track.audio || "").trim();
  const soundcloud = String(track.soundcloud || "").trim();
  const slug = String(track.slug || "").trim();
  const usernameTag = String(track.username_tag || "").trim();
  const duration = Math.max(0, Number(track.duration || track._duration || 0) || 0);
  const addedAt = track.addedAt || Date.now();

  if (!id && !audioSrc && !soundcloud) {
    return null;
  }

  return {
    id,
    title,
    artist,
    cover,
    audioSrc,
    soundcloud,
    slug,
    username_tag: usernameTag,
    duration,
    addedAt
  };
}

function normalizePlaylistsForStorage(playlists) {
  const list = Array.isArray(playlists) ? playlists : [];
  const byId = new Map();

  for (const item of list) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const rawId = String(item.id || "").trim();
    const playlistId = rawId || `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const isFavorites = playlistId === "favorites";

    const current = byId.get(playlistId) || {
      id: playlistId,
      name: isFavorites ? "Любимые треки" : "Без названия",
      system: isFavorites,
      cover: "",
      tracks: []
    };

    current.name = isFavorites
      ? "Любимые треки"
      : (String(item.name || "").trim() || current.name || "Без названия");
    current.system = isFavorites || !!item.system;
    current.cover = String(item.cover || current.cover || "").trim();

    const existingTrackKeys = new Set(
      current.tracks.map((track) => `${Number(track.id) || 0}|${track.audioSrc || ""}|${track.soundcloud || ""}`)
    );

    const tracks = Array.isArray(item.tracks) ? item.tracks : [];
    for (const track of tracks) {
      const normalizedTrack = normalizePlaylistTrackForStorage(track);
      if (!normalizedTrack) {
        continue;
      }

      const trackKey = `${Number(normalizedTrack.id) || 0}|${normalizedTrack.audioSrc || ""}|${normalizedTrack.soundcloud || ""}`;
      if (existingTrackKeys.has(trackKey)) {
        continue;
      }

      existingTrackKeys.add(trackKey);
      current.tracks.push(normalizedTrack);
    }

    byId.set(playlistId, current);
  }

  const favorites = byId.get("favorites") || {
    id: "favorites",
    name: "Любимые треки",
    system: true,
    cover: "",
    tracks: []
  };

  favorites.id = "favorites";
  favorites.name = "Любимые треки";
  favorites.system = true;
  favorites.tracks = Array.isArray(favorites.tracks) ? favorites.tracks : [];
  byId.set("favorites", favorites);

  const ordered = [favorites];
  for (const [playlistId, playlist] of byId.entries()) {
    if (playlistId === "favorites") {
      continue;
    }

    ordered.push({
      id: playlist.id,
      name: String(playlist.name || "").trim() || "Без названия",
      system: !!playlist.system,
      cover: String(playlist.cover || "").trim(),
      tracks: Array.isArray(playlist.tracks) ? playlist.tracks : []
    });
  }

  return ordered;
}

async function ensurePlaylistsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_playlists (
      user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      playlists_json jsonb NOT NULL DEFAULT '[]'::jsonb,
      updated_at timestamp without time zone DEFAULT now()
    );

    ALTER TABLE user_playlists
      ADD COLUMN IF NOT EXISTS playlists_json jsonb NOT NULL DEFAULT '[]'::jsonb;

    ALTER TABLE user_playlists
      ADD COLUMN IF NOT EXISTS updated_at timestamp without time zone DEFAULT now();
  `);
}

function requireRole(roles = []) {
  return async (req, res, next) => {
    const user = await getUserFromToken(req);

    if (!user) {
      return res.status(401).json({ error: "Не авторизован" });
    }

    if (user.is_banned) {
      return res.status(403).json({ error: "Ты забанен" });
    }

    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: "Нет доступа" });
    }

    req.user = user;
    next();
  };
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.get("/me", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await pool.query(
  `
  SELECT 
    users.id,
    users.username,
    users.username_tag,
    users.avatar,
    users.role,
    users.email,
    users.collective_id,
    mc.name AS collective_name,
    COALESCE(users.notifications_enabled, true) AS notifications_enabled,
    COALESCE(users.dms_enabled, true) AS dms_enabled,
    COALESCE(users.is_verified, false) AS is_verified,
    CASE 
      WHEN users.password IS NULL THEN false 
      ELSE true 
    END as has_password
  FROM users
  LEFT JOIN music_collectives mc ON mc.id = users.collective_id
  WHERE users.id = $1
  `,
  [userId]
);

    if (!user.rows.length) {
      return res.status(404).json({ error: "user_not_found" });
    }

    res.json(attachRankState(user.rows[0]));

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  }
});

app.get("/api/playlists", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT playlists_json, updated_at
      FROM user_playlists
      WHERE user_id = $1
      LIMIT 1
      `,
      [req.user.id]
    );

    const row = result.rows[0] || null;
    const playlists = normalizePlaylistsForStorage(row?.playlists_json || []);

    res.json({
      playlists,
      updated_at: row?.updated_at || null
    });
  } catch (err) {
    console.error("PLAYLISTS LOAD ERROR:", err);
    res.status(500).json({ error: "playlists_load_failed" });
  }
});

app.put("/api/playlists", auth, async (req, res) => {
  try {
    const playlists = normalizePlaylistsForStorage(req.body?.playlists || []);

    const result = await pool.query(
      `
      INSERT INTO user_playlists (user_id, playlists_json, updated_at)
      VALUES ($1, $2::jsonb, now())
      ON CONFLICT (user_id)
      DO UPDATE SET
        playlists_json = EXCLUDED.playlists_json,
        updated_at = now()
      RETURNING updated_at
      `,
      [req.user.id, JSON.stringify(playlists)]
    );

    res.json({
      success: true,
      playlists,
      updated_at: result.rows[0]?.updated_at || null
    });
  } catch (err) {
    console.error("PLAYLISTS SAVE ERROR:", err);
    res.status(500).json({ error: "playlists_save_failed" });
  }
});

app.get("/test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

app.get("/check-email/:email", async (req, res) => {
  const email = decodeURIComponent(req.params.email);

  const result = await pool.query(
    "SELECT 1 FROM users WHERE email = $1",
    [email]
  );

  res.json({ available: result.rows.length === 0 });
});

app.get("/check-tag/:tag", async (req, res) => {
  const { tag } = req.params;

  const result = await pool.query(
    "SELECT 1 FROM users WHERE LOWER(username_tag) = LOWER($1)",
    [tag]
  );

  res.json({ available: result.rows.length === 0 });
});

app.post("/api/admin/xp", requireRole(["admin"]), async (req, res) => {
  try {
    const { userId, amount, type } = req.body;

    const targetUserId = Number(userId);
    const parsedAmount = Number(amount);

    if (!targetUserId || !parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ error: "Некорректные данные" });
    }

    if (!["add", "remove"].includes(type)) {
      return res.status(400).json({ error: "Некорректный тип операции" });
    }

    const sign = type === "remove" ? -1 : 1;

    const userRes = await pool.query(
      "SELECT xp FROM users WHERE id = $1",
      [targetUserId]
    );

    if (!userRes.rows.length) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    const currentXP = Number(userRes.rows[0].xp || 0);
    const newXP = Math.max(0, currentXP + sign * parsedAmount);

    await pool.query(
      "UPDATE users SET xp = $1 WHERE id = $2",
      [newXP, targetUserId]
    );

    res.json({
      success: true,
      newXP
    });

  } catch (err) {
    console.error("ADMIN XP ERROR:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

async function handleSupportAdminMessage(message) {
  const chatId = message.chat?.id;
  const text = String(message.text || "").trim();

  if (!text) return;

  let ticketId = null;
  let replyText = "";
  let replyTarget = null;

  const commandMatch = text.match(/^\/reply(?:@\w+)?\s+#?(\d+)\s+([\s\S]+)/i);
  if (commandMatch) {
    replyTarget = commandMatch[1];
    ticketId = Number(replyTarget);
    replyText = commandMatch[2].trim();
  } else if (message.reply_to_message?.message_id) {
    const ticketRes = await pool.query(
      "SELECT id FROM support_tickets WHERE admin_message_id = $1 ORDER BY id DESC LIMIT 1",
      [String(message.reply_to_message.message_id)]
    );

    if (ticketRes.rows.length) {
      ticketId = Number(ticketRes.rows[0].id);
      replyText = text;
    }
  }

  if (!ticketId || !replyText) {
    await sendSupportTelegramMessage(
      chatId,
      [
        "Чтобы ответить пользователю:",
        "",
        "1. Ответь reply на сообщение тикета",
        "или",
        "2. Напиши <code>/reply НОМЕР_ЗАЯВКИ текст ответа</code>",
        "",
        "Например: <code>/reply 5 Привет, сейчас посмотрю</code>"
      ].join("\n")
    );
    return;
  }

  const ticketRes = await pool.query(
    `
    SELECT id, telegram_chat_id
    FROM support_tickets
    WHERE id = $1
       OR telegram_user_id = $2
       OR telegram_chat_id = $2
    ORDER BY
      CASE WHEN id = $1 THEN 0 ELSE 1 END,
      id DESC
    LIMIT 1
    `,
    [ticketId, String(replyTarget || ticketId)]
  );

  const ticket = ticketRes.rows[0];

  if (!ticket?.telegram_chat_id) {
    await sendSupportTelegramMessage(
      chatId,
      "Не нашел пользователя для этого ответа. Попробуй ответить reply на сообщение заявки или используй номер заявки, например <code>/reply 5 текст</code>."
    );
    return;
  }

  await sendSupportTelegramMessage(
    ticket.telegram_chat_id,
    [
      `💬 <b>Ответ поддержки по заявке #${ticket.id}</b>`,
      "",
      escapeTelegramHtml(replyText)
    ].join("\n")
  );

  await pool.query(
    "UPDATE support_tickets SET status = $1, answered_at = now() WHERE id = $2",
    ["answered", ticket.id]
  );

  await sendSupportTelegramMessage(chatId, `Ответ по заявке #${ticket.id} отправлен.`);
}

function normalizeSiteUsername(value) {
  const username = String(value || "").trim().replace(/\s+/g, " ");

  if (
    username.length < 2 ||
    username.length > 50 ||
    username.startsWith("/") ||
    /[\r\n\t<>]/.test(username) ||
    /^https?:\/\//i.test(username)
  ) {
    return null;
  }

  return username;
}

async function findUserBySiteUsername(siteUsername) {
  const username = String(siteUsername || "").trim();
  const tag = username.replace(/^@/, "");

  const userRes = await pool.query(
    `
    SELECT id, username, username_tag
    FROM users
    WHERE LOWER(username) = LOWER($1)
       OR LOWER(username_tag) = LOWER($2)
    ORDER BY id DESC
    LIMIT 1
    `,
    [username, tag]
  );

  return userRes.rows[0] || null;
}

async function setSupportBotSession(chatId, step, requestedUsername = null) {
  await pool.query(
    `
    INSERT INTO support_bot_sessions (telegram_chat_id, step, requested_username, updated_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (telegram_chat_id)
    DO UPDATE SET
      step = EXCLUDED.step,
      requested_username = EXCLUDED.requested_username,
      updated_at = now()
    `,
    [String(chatId), step, requestedUsername]
  );
}

async function getSupportBotSession(chatId) {
  const sessionRes = await pool.query(
    "SELECT step, requested_username FROM support_bot_sessions WHERE telegram_chat_id = $1",
    [String(chatId)]
  );

  return sessionRes.rows[0] || null;
}

async function clearSupportBotSession(chatId) {
  await pool.query(
    "DELETE FROM support_bot_sessions WHERE telegram_chat_id = $1",
    [String(chatId)]
  );
}

async function handleSupportUserMessage(message) {
  const chatId = message.chat?.id;
  const from = message.from || {};
  const text = String(message.text || message.caption || "").trim();

  if (!chatId) return;

  if (!text) {
    await sendSupportTelegramMessage(chatId, "Пока я принимаю только текстовые обращения. Напиши проблему сообщением.");
    return;
  }

  if (text.startsWith("/start")) {
    await setSupportBotSession(chatId, "username");
    await sendSupportTelegramMessage(
      chatId,
      [
        "Привет. Это поддержка РИТМОРИИ.",
        "",
        "Укажи свой ник с сайта Ритмория."
      ].join("\n")
    );
    return;
  }

  if (text.startsWith("/cancel")) {
    await clearSupportBotSession(chatId);
    await sendSupportTelegramMessage(chatId, "Ок, заявку отменил. Чтобы начать заново, напиши /start.");
    return;
  }

  if (text.startsWith("/help")) {
    await sendSupportTelegramMessage(
      chatId,
      [
        "Чтобы создать заявку:",
        "",
        "1. Напиши /start",
        "2. Укажи ник с сайта Ритмория",
        "3. Опиши проблему или напиши, что хочешь запросить подтверждение аккаунта",
        "",
        "Ответ поддержки придет сюда же."
      ].join("\n")
    );
    return;
  }

  const session = await getSupportBotSession(chatId);

  if (!session) {
    await sendSupportTelegramMessage(chatId, "Чтобы создать заявку, сначала напиши /start.");
    return;
  }

  if (session.step === "username") {
    const requestedUsername = normalizeSiteUsername(text);

    if (!requestedUsername) {
      await sendSupportTelegramMessage(
        chatId,
        "Напиши ник с сайта одним сообщением. Например: <code>хизабо</code> или <code>XJABO</code>."
      );
      return;
    }

    await setSupportBotSession(chatId, "message", requestedUsername);
    await sendSupportTelegramMessage(
      chatId,
      [
        `Принял: <code>${escapeTelegramHtml(requestedUsername)}</code>.`,
        "",
        "Теперь опиши свою проблему или напиши, что хочешь запросить подтверждение аккаунта."
      ].join("\n")
    );
    return;
  }

  if (session.step !== "message") {
    await setSupportBotSession(chatId, "username");
    await sendSupportTelegramMessage(chatId, "Давай начнем заново. Укажи свой ник с сайта Ритмория.");
    return;
  }

  if (text.length < 5) {
    await sendSupportTelegramMessage(chatId, "Напиши чуть подробнее, чтобы я смог создать заявку.");
    return;
  }

  if (text.length > 2000) {
    await sendSupportTelegramMessage(chatId, "Сообщение слишком длинное. Сократи до 2000 символов и отправь еще раз.");
    return;
  }

  const subject = text.split(/\r?\n/)[0].slice(0, 120) || "Заявка из Telegram";
  const displayName = getTelegramDisplayName(from);
  const requestedUsername = session.requested_username || null;
  const siteUser = requestedUsername ? await findUserBySiteUsername(requestedUsername) : null;

  const ticketRes = await pool.query(
    `
    INSERT INTO support_tickets (
      user_id,
      subject,
      message,
      contact,
      status,
      telegram_chat_id,
      telegram_user_id,
      telegram_username
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id, created_at
    `,
    [
      siteUser?.id || null,
      subject,
      text,
      requestedUsername,
      "new",
      String(chatId),
      from.id ? String(from.id) : null,
      from.username || null
    ]
  );

  const ticket = ticketRes.rows[0];
  const adminChatId = process.env.SUPPORT_ADMIN_CHAT_ID;
  const adminText = [
    `🎧 <b>Новая заявка в поддержку #${ticket.id}</b>`,
    "",
    `<b>От:</b> ${escapeTelegramHtml(displayName)}`,
    requestedUsername ? `<b>Ник на сайте:</b> <code>${escapeTelegramHtml(requestedUsername)}</code>` : "",
    siteUser ? `<b>Найден аккаунт:</b> #${siteUser.id} ${escapeTelegramHtml(siteUser.username || "")}` : "",
    from.id ? `<b>Telegram ID:</b> <code>${escapeTelegramHtml(from.id)}</code>` : "",
    "",
    `<b>Сообщение:</b>`,
    escapeTelegramHtml(text),
    "",
    `Чтобы ответить, сделай reply на это сообщение или напиши:`,
    `<code>/reply ${ticket.id} текст ответа</code>`
  ].filter(Boolean).join("\n");

  const adminMessage = await sendSupportTelegramMessage(adminChatId, adminText);

  await pool.query(
    "UPDATE support_tickets SET status = $1, admin_message_id = $2, telegram_message_id = $3 WHERE id = $4",
    ["sent", String(adminMessage.message_id || ""), String(message.message_id || ""), ticket.id]
  );

  await clearSupportBotSession(chatId);

  await sendSupportTelegramMessage(
    chatId,
    [
      `Заявка #${ticket.id} создана.`,
      "",
      "Ответ поддержки придет сюда же. Чтобы создать еще одну заявку, напиши /start."
    ].join("\n")
  );
}

app.post("/api/support/telegram-webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const message = req.body?.message;
    if (!message || message.from?.is_bot) return;

    const chatId = message.chat?.id;
    if (isSupportAdminChat(chatId)) {
      await handleSupportAdminMessage(message);
      return;
    }

    await handleSupportUserMessage(message);
  } catch (err) {
    console.error("SUPPORT WEBHOOK ERROR:", err);
  }
});

app.get("/support", (req, res) => {
  res.redirect(`https://t.me/${getSupportBotUsername()}?start=support`);
});

app.post("/telegram-auth/start", async (req, res) => {
  try {
    const mode = req.body?.mode === "register" ? "register" : "login";
    const requestToken = crypto.randomUUID();
    const userAgent = String(req.headers["user-agent"] || "");
    const { browser, os } = parseUserAgentInfo(userAgent);
    const ip = getRequestIp(req);

    await pool.query(
      `
      INSERT INTO telegram_auth_requests (
        request_token,
        mode,
        status,
        browser,
        os,
        ip,
        user_agent
      )
      VALUES ($1, $2, 'pending', $3, $4, $5, $6)
      `,
      [requestToken, mode, browser, os, ip, userAgent]
    );

    res.json({
      requestToken,
      authUrl: `https://t.me/${getTelegramAuthBotUsername()}?start=auth_${requestToken}`
    });
  } catch (err) {
    console.error("TELEGRAM AUTH START ERROR:", err);
    res.status(500).json({ error: "Не удалось создать Telegram-запрос" });
  }
});

app.get("/telegram-auth/status/:token", async (req, res) => {
  try {
    const authRequest = await getTelegramAuthRequest(req.params.token);

    if (!authRequest) {
      return res.status(404).json({ error: "Запрос не найден" });
    }

    if (authRequest.status === "approved" && authRequest.app_token) {
      return res.json({
        status: "approved",
        token: authRequest.app_token
      });
    }

    if (authRequest.status === "rejected") {
      return res.json({
        status: "rejected",
        error: authRequest.error || "Запрос отклонён"
      });
    }

    res.json({ status: authRequest.status || "pending" });
  } catch (err) {
    console.error("TELEGRAM AUTH STATUS ERROR:", err);
    res.status(500).json({ error: "Не удалось получить статус" });
  }
});

app.post("/api/telegram-auth/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const update = req.body || {};
    const callbackQuery = update.callback_query;
    const message = update.message;

    if (callbackQuery?.data) {
      const callbackMatch = String(callbackQuery.data).match(/^tg_auth:(approve|reject):([A-Za-z0-9-]+)$/i);
      if (!callbackMatch) return;

      const action = callbackMatch[1].toLowerCase();
      const requestToken = callbackMatch[2];
      const authRequest = await getTelegramAuthRequest(requestToken);

      if (!authRequest) {
        await sendAuthTelegramRequest("answerCallbackQuery", {
          callback_query_id: callbackQuery.id,
          text: "Запрос уже недоступен",
          show_alert: true
        });
        return;
      }

      if (authRequest.status === "approved") {
        await sendAuthTelegramRequest("answerCallbackQuery", {
          callback_query_id: callbackQuery.id,
          text: "Этот вход уже подтвержден"
        });
        return;
      }

      if (authRequest.status === "rejected") {
        await sendAuthTelegramRequest("answerCallbackQuery", {
          callback_query_id: callbackQuery.id,
          text: "Этот запрос уже отклонен"
        });
        return;
      }

      if (action === "approve") {
        await approveTelegramAuthRequest(requestToken, callbackQuery.from || {});

        await sendAuthTelegramRequest("editMessageReplyMarkup", {
          chat_id: callbackQuery.message?.chat?.id,
          message_id: callbackQuery.message?.message_id,
          reply_markup: { inline_keyboard: [] }
        }).catch(() => null);

        await sendAuthTelegramRequest("answerCallbackQuery", {
          callback_query_id: callbackQuery.id,
          text: "Вход разрешён"
        });

        await sendAuthTelegramMessage(
          callbackQuery.message?.chat?.id,
          "Готово. Вернись на сайт — вход подтвердился."
        );
        return;
      }

      await markTelegramAuthRequestRejected(requestToken);

      await sendAuthTelegramRequest("editMessageReplyMarkup", {
        chat_id: callbackQuery.message?.chat?.id,
        message_id: callbackQuery.message?.message_id,
        reply_markup: { inline_keyboard: [] }
      }).catch(() => null);

      await sendAuthTelegramRequest("answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: "Запрос отклонён"
      });

      await sendAuthTelegramMessage(
        callbackQuery.message?.chat?.id,
        "Запрос на вход отклонён."
      );
      return;
    }

    const text = String(message?.text || "").trim();
    if (!message?.chat?.id || !text) return;

    const startMatch = text.match(/^\/start(?:@\w+)?\s+auth_([A-Za-z0-9-]+)$/i);
    if (!startMatch) {
      await sendAuthTelegramMessage(
        message.chat.id,
        [
          "Привет. Это бот для входа в РИТМОРИЮ.",
          "",
          "Нажми кнопку входа через Telegram на сайте, и я отправлю сюда запрос на подтверждение."
        ].join("\n")
      );
      return;
    }

    const requestToken = startMatch[1];
    const authRequest = await getTelegramAuthRequest(requestToken);

    if (!authRequest) {
      await sendAuthTelegramMessage(message.chat.id, "Этот запрос уже недействителен. Вернись на сайт и попробуй ещё раз.");
      return;
    }

    if (authRequest.status === "approved") {
      await sendAuthTelegramMessage(message.chat.id, "Этот вход уже подтверждён. Вернись на сайт.");
      return;
    }

    if (authRequest.status === "rejected") {
      await sendAuthTelegramMessage(message.chat.id, "Этот запрос уже был отклонён. Если нужно, начни вход заново на сайте.");
      return;
    }

    const authMessage = await sendAuthTelegramMessage(
      message.chat.id,
      buildTelegramAuthMessage(authRequest),
      {
        reply_markup: {
          inline_keyboard: [[
            { text: "Разрешить", callback_data: `tg_auth:approve:${requestToken}` },
            { text: "Отклонить", callback_data: `tg_auth:reject:${requestToken}` }
          ]]
        }
      }
    );

    await pool.query(
      `
      UPDATE telegram_auth_requests
      SET telegram_chat_id = $2,
          telegram_username = $3,
          message_id = $4
      WHERE request_token = $1
      `,
      [
        requestToken,
        String(message.chat.id),
        message.from?.username || null,
        String(authMessage.message_id || "")
      ]
    );
  } catch (err) {
    console.error("TELEGRAM AUTH WEBHOOK ERROR:", err);
  }
});

app.post("/register", async (req, res) => {
  const { username, email, password, username_tag, verificationId } = req.body;

  try {
    const cleanUsername = String(username || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(password || "");

    if (cleanUsername.length < 3) {
      return res.status(400).json({ error: "username_too_short" });
    }

    if (!cleanEmail || !cleanEmail.includes("@")) {
      return res.status(400).json({ error: "invalid_email" });
    }

    if (cleanPassword.length < 8) {
      return res.status(400).json({ error: "password_too_short" });
    }

    const emailCheck = await consumeVerifiedEmailCode({
      email: cleanEmail,
      purpose: "register",
      consume: false,
      verificationId: Number(verificationId) || null
    });

    if (!emailCheck.ok) {
      return res.status(400).json({ error: emailCheck.error });
    }

    const existingEmail = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [cleanEmail]
    );

    if (existingEmail.rows.length) {
      return res.status(400).json({ error: "email_already_used" });
    }

    const hash = await bcrypt.hash(cleanPassword, 10);
    let baseTag = generateUsernameTag(username_tag || username);
let finalUsernameTag = baseTag;
let counter = 1;

while (true) {
  const check = await pool.query(
    "SELECT id FROM users WHERE LOWER(username_tag) = LOWER($1)",
    [finalUsernameTag]
  );

  if (check.rows.length === 0) break;

  finalUsernameTag = baseTag + counter;
  counter++;
}

const result = await pool.query(
  "INSERT INTO users (username,email,password,avatar,username_tag) VALUES ($1,$2,$3,$4,$5) RETURNING id,username,username_tag,email,avatar",
  [cleanUsername, cleanEmail, hash, "/images/default-avatar.jpg", finalUsernameTag]
);

    await pool.query(
      `
      DELETE FROM email_verification_codes
      WHERE id = $1
      `,
      [Number(verificationId) || null]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (String(err?.code || "") === "23505") {
      return res.status(400).json({ error: "email_already_used" });
    }
    res.status(500).json({ error: "registration_failed" });
  }
});

// ===== ОТПРАВКА КОДА =====
// ===== SEND CODE (RESEND) =====
app.post("/send-code", async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return res.status(400).json({ error: "invalid_email" });
  }

  const existing = await pool.query(
    "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
    [normalizedEmail]
  );

  if (existing.rows.length) {
    return res.status(400).json({ error: "email_already_used" });
  }

  const verification = await createEmailVerificationCode({
    email: normalizedEmail,
    purpose: "register"
  });

  try {
    if (!resend) {
      return res.json({ success: true, verificationId: verification.verificationId });
    }

    await resend.emails.send({
      from: "Rhytmoria <no-reply@ritmoria.com>",
      to: normalizedEmail,
      subject: "Код подтверждения",
      html: `
<div style="background:#0b0b12;padding:40px 0;font-family:Arial,sans-serif;">
  <div style="max-width:500px;margin:auto;background:#111827;border-radius:16px;padding:30px;text-align:center;color:white;border:1px solid rgba(255,255,255,0.08);">

    <h1 style="margin-bottom:10px;">#РИТМОРИЯ 🎧</h1>

    <p style="color:#9ca3af;margin-bottom:20px;">
      Подтверди свою почту
    </p>

    <div style="
      font-size:32px;
      letter-spacing:6px;
      font-weight:bold;
      background:linear-gradient(135deg,#8b5cf6,#6d28d9);
      padding:15px;
      border-radius:12px;
      display:inline-block;
      margin-bottom:20px;
    ">
      ${verification.code}
    </div>

    <p style="color:#9ca3af;font-size:14px;">
      Код действует 10 минут
    </p>

    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:20px 0;">

    <p style="color:#6b7280;font-size:12px;">
      Если это были не вы — просто проигнорируйте это письмо
    </p>

  </div>
</div>
`
    });

    res.json({ success: true, verificationId: verification.verificationId });

  } catch (err) {
    console.log("EMAIL ERROR:", err);
    res.status(500).json({ error: "Ошибка отправки" });
  }
});

app.post("/verify-code", async (req, res) => {
  const { email, code, verificationId } = req.body;
  try {
    const result = await verifyEmailVerificationCode({
      email,
      code,
      purpose: "register",
      verificationId: Number(verificationId) || null
    });

    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, verificationId: result.verificationId || null });
  } catch (err) {
    console.error("VERIFY CODE ERROR:", err);
    res.status(500).json({ error: "server_error" });
  }
});

app.post("/change-password", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    const cleanNewPassword = String(newPassword || "");

    if (cleanNewPassword.length < 8) {
      return res.status(400).json({ error: "password_too_short" });
    }

    const user = await pool.query(
      "SELECT password FROM users WHERE id = $1",
      [userId]
    );

    if (!user.rows[0].password) {
      return res.status(400).json({ error: "No password set" });
    }

    const isMatch = await bcrypt.compare(
      currentPassword,
      user.rows[0].password
    );

    if (!isMatch) {
      return res.status(400).json({ error: "Wrong password" });
    }

    const hash = await bcrypt.hash(cleanNewPassword, 10);

    await pool.query(
      "UPDATE users SET password = $1 WHERE id = $2",
      [hash, userId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/change-email-send-code", auth, async (req, res) => {
  const { newEmail } = req.body;
  const normalizedEmail = String(newEmail || "").trim().toLowerCase();
  const userId = req.user.id;

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return res.status(400).json({ error: "invalid_email" });
  }

  const existing = await pool.query(
    "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
    [normalizedEmail]
  );

  if (existing.rows.length > 0) {
    return res.status(400).json({ error: "email_already_used" });
  }

  const code = await createEmailVerificationCode({
    email: normalizedEmail,
    purpose: "change_email",
    userId
  });

  try {
    if (!resend) {
      return res.json({ success: true });
    }

    await resend.emails.send({
      from: "Rhytmoria <no-reply@ritmoria.com>",
      to: normalizedEmail,
      subject: "Смена почты",
      html: `
        <div style="background:#0b0b12;padding:40px;text-align:center;color:white;">
          <h2>Смена почты</h2>
          <p>Ваш код:</p>
          <h1>${code}</h1>
        </div>
      `
    });

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Email error" });
  }
});

app.post("/change-email-confirm", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { newEmail, code } = req.body;

    const verifyResult = await verifyEmailVerificationCode({
      email: newEmail,
      code,
      purpose: "change_email",
      userId
    });

    if (!verifyResult.ok) {
      return res.status(400).json({ error: verifyResult.error });
    }

    await pool.query(
      "UPDATE users SET email = $1 WHERE id = $2",
      [String(newEmail || "").trim().toLowerCase(), userId]
    );

    await pool.query(
      `
      DELETE FROM email_verification_codes
      WHERE LOWER(email) = LOWER($1)
        AND purpose = 'change_email'
        AND user_id = $2
      `,
      [String(newEmail || "").trim().toLowerCase(), userId]
    );

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    if (String(err?.code || "") === "23505") {
      return res.status(400).json({ error: "email_already_used" });
    }
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/delete-account-send-code", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRes = await pool.query(
      "SELECT email FROM users WHERE id = $1 LIMIT 1",
      [userId]
    );

    const email = String(userRes.rows[0]?.email || "").trim();
    if (!email) {
      return res.status(400).json({ error: "Email not set" });
    }

    const code = Math.floor(100000 + Math.random() * 900000);
    global.accountDeleteCodes = global.accountDeleteCodes || {};
    global.accountDeleteCodes[userId] = {
      code: String(code),
      email,
      createdAt: Date.now()
    };

    await sendEmailOrLog({
      to: email,
      subject: "Удаление аккаунта Ритмория",
      logLabel: "DELETE ACCOUNT CODE",
      html: `
        <div style="background:#0b0b12;padding:40px 0;font-family:Arial,sans-serif;">
          <div style="max-width:500px;margin:auto;background:#111827;border-radius:16px;padding:30px;text-align:center;color:white;border:1px solid rgba(255,255,255,0.08);">
            <h1 style="margin-bottom:10px;">Удаление аккаунта</h1>
            <p style="color:#cbd5e1;margin-bottom:20px;">
              Если это действительно вы, введите этот код на сайте.
            </p>
            <div style="font-size:32px;letter-spacing:6px;font-weight:bold;background:linear-gradient(135deg,#ff5ea8,#ff6c96);padding:15px;border-radius:12px;display:inline-block;margin-bottom:20px;">
              ${code}
            </div>
            <p style="color:#94a3b8;font-size:14px;">
              Если вы не запрашивали удаление аккаунта, просто проигнорируйте это письмо.
            </p>
          </div>
        </div>
      `
    });

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE ACCOUNT SEND CODE ERROR:", err);
    res.status(500).json({ error: "delete_account_code_send_failed" });
  }
});

app.post("/delete-account-confirm", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const code = String(req.body?.code || "").trim();
    const confirm = Boolean(req.body?.confirm);

    const userRes = await pool.query(
      "SELECT id, email FROM users WHERE id = $1 LIMIT 1",
      [userId]
    );

    if (!userRes.rows.length) {
      return res.status(404).json({ error: "user_not_found" });
    }

    const email = String(userRes.rows[0]?.email || "").trim();
    const hasEmail = !!email;

    if (hasEmail) {
      const record = global.accountDeleteCodes?.[userId];
      if (!record || String(record.code) !== code) {
        return res.status(400).json({ error: "Wrong code" });
      }
      delete global.accountDeleteCodes[userId];
    } else if (!confirm) {
      return res.status(400).json({ error: "confirmation_required" });
    }

    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE ACCOUNT CONFIRM ERROR:", err);
    res.status(500).json({ error: "delete_account_failed" });
  }
});


app.post("/set-password", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    if(!password){
      return res.status(400).json({ error: "Нет пароля" });
    }

    if (String(password).trim().length < 8) {
      return res.status(400).json({ error: "password_too_short" });
    }

    const userRes = await pool.query(
      "SELECT password FROM users WHERE id = $1 LIMIT 1",
      [userId]
    );

    if (!userRes.rows.length) {
      return res.status(404).json({ error: "user_not_found" });
    }

    if (userRes.rows[0].password) {
      return res.status(400).json({ error: "password_already_set" });
    }

    const bcrypt = require("bcrypt");
    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      "UPDATE users SET password = $1 WHERE id = $2",
      [hash, userId]
    );

    res.json({ success: true });

  } catch(err){
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});


app.post("/login", async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: "Нет данных" });
    }

    const rawLogin = String(login || "").trim();
    const cleanLogin = rawLogin.startsWith("@") ? rawLogin.slice(1).trim() : rawLogin;

    let result;

    if (rawLogin.includes("@") && !rawLogin.startsWith("@")) {
      result = await pool.query(
        `
        SELECT *
        FROM users
        WHERE LOWER(email) = LOWER($1)
        ORDER BY id DESC
        LIMIT 1
        `,
        [rawLogin]
      );
    } else {
      result = await pool.query(
        `
        SELECT *
        FROM users
        WHERE LOWER(username_tag) = LOWER($1)
           OR LOWER(username) = LOWER($2)
           OR LOWER(email) = LOWER($3)
        ORDER BY id DESC
        LIMIT 1
        `,
        [cleanLogin, cleanLogin, cleanLogin]
      );
    }

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Пользователь не найден" });
    }

    const user = result.rows[0];

    if (!user.password) {
      return res.status(401).json({ error: "У аккаунта нет пароля. Войди через соцсеть или задай пароль в настройках." });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: "Неверный пароль" });
    }

    const token = signAppToken(user);

    res.json({ token });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.get("/api/profile", async (req, res) => {
  try {
    const tag = req.query.tag;

    // 🔥 1. ЕСЛИ ЕСТЬ TAG → НЕ ТРОГАЕМ JWT ВООБЩЕ
    if (tag) {
      const result = await pool.query(
        `
        SELECT
          users.id,
          users.username,
          users.username_tag,
          users.avatar,
          users.bio,
          users.xp,
          users.collective_id,
          mc.name AS collective_name,
          COALESCE(ps.first_places, 0) AS first_places,
          COALESCE(ps.second_places, 0) AS second_places,
          COALESCE(ps.third_places, 0) AS third_places,
          COALESCE(users.is_verified, false) AS is_verified,
          users.soundcloud,
          users.instagram,
          users.twitter,
          users.telegram,
          users.website
          FROM users
          LEFT JOIN music_collectives mc ON mc.id = users.collective_id
          LEFT JOIN user_stream_place_stats ps ON ps.user_id = users.id
          WHERE LOWER(users.username_tag) = LOWER($1)
             OR LOWER(users.username) = LOWER($1)
          `,
          [tag]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.json(attachRankState(result.rows[0]));
    }

    // 🔥 2. ЕСЛИ TAG НЕТ → ЭТО МОЙ ПРОФИЛЬ
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "No token" });
    }

    const token = authHeader.split(" ")[1];

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const result = await pool.query(
      `
      SELECT
        users.id,
        users.username,
        users.username_tag,
          users.avatar,
          users.bio,
          users.xp,
          users.collective_id,
          mc.name AS collective_name,
          COALESCE(ps.first_places, 0) AS first_places,
          COALESCE(ps.second_places, 0) AS second_places,
          COALESCE(ps.third_places, 0) AS third_places,
          COALESCE(users.is_verified, false) AS is_verified,
          users.soundcloud,
          users.instagram,
          users.twitter,
          users.telegram,
          users.website
        FROM users
        LEFT JOIN music_collectives mc ON mc.id = users.collective_id
        LEFT JOIN user_stream_place_stats ps ON ps.user_id = users.id
        WHERE users.id = $1
        `,
        [payload.id]
      );

    res.json(attachRankState(result.rows[0]));

  } catch (err) {
    console.error("PROFILE ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});



app.get("/my-tracks", async (req, res) => {
  res.json([{ title: "My track 1" }, { title: "My track 2" }]);
});

app.put("/update-profile", authMiddleware, async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);

    const currentResult = await pool.query(
      `SELECT username, username_tag, bio, avatar, soundcloud, instagram, twitter, telegram, website
       FROM users
       WHERE id=$1`,
      [userId]
    );

    console.log("BODY:", req.body);

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: "user_not_found" });
    }

    const current = currentResult.rows[0];

    const username =
      req.body.username !== undefined ? String(req.body.username).trim() : current.username;

    const username_tag =
      req.body.username_tag !== undefined
        ? String(req.body.username_tag).trim()
        : current.username_tag;

    const bio = req.body.bio !== undefined ? req.body.bio : current.bio;
    const avatar = req.body.avatar !== undefined ? req.body.avatar : current.avatar;
    const soundcloud = req.body.soundcloud !== undefined ? req.body.soundcloud : current.soundcloud;
    const instagram = req.body.instagram !== undefined ? req.body.instagram : current.instagram;
    const twitter = req.body.twitter !== undefined ? req.body.twitter : current.twitter;
    const telegram = req.body.telegram !== undefined ? req.body.telegram : current.telegram;
    const website = req.body.website !== undefined ? req.body.website : current.website;

    if (!username) {
      return res.status(400).json({ error: "username_required" });
    }

    if (!isAllowedProfileLink(soundcloud, ["soundcloud.com", "on.soundcloud.com"])) {
      return res.status(400).json({ error: "invalid_soundcloud_link" });
    }

    if (!isAllowedProfileLink(instagram, ["instagram.com"])) {
      return res.status(400).json({ error: "invalid_instagram_link" });
    }

    if (!isValidTelegramProfileLink(telegram)) {
      return res.status(400).json({ error: "invalid_telegram_link" });
    }

    if (website) {
      try {
        new URL(normalizeOptionalProfileUrl(website));
      } catch {
        return res.status(400).json({ error: "invalid_website_link" });
      }
    }

    const check = await pool.query(
      "SELECT id FROM users WHERE username=$1 AND id != $2",
      [username, userId]
    );

    if (check.rows.length > 0) {
      return res.status(400).json({ error: "username_taken" });
    }

    const tagCheck = await pool.query(
      "SELECT id FROM users WHERE LOWER(username_tag) = LOWER($1) AND id != $2",
      [username_tag, userId]
    );

    if (tagCheck.rows.length > 0) {
      return res.status(400).json({ error: "username_tag_taken" });
    }

    const result = await pool.query(
      `UPDATE users
       SET
         username = $1,
         username_tag = $2,
         bio = $3,
         avatar = $4,
         soundcloud = $5,
         instagram = $6,
         twitter = $7,
         telegram = $8,
         website = $9
       WHERE id = $10
       RETURNING username, username_tag, bio, avatar, soundcloud, instagram, telegram, website`,
      [
        username,
        username_tag,
        bio,
        avatar,
        soundcloud,
        instagram,
        twitter,
        telegram,
        website,
        userId
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "update_profile_failed" });
  }
});

app.get("/api/settings/collective", auth, async (req, res) => {
  try {
    const userId = Number(req.user.id || 0);
    const userRes = await pool.query(
      `
      SELECT u.collective_id, mc.name AS collective_name, mc.owner_user_id
      FROM users u
      LEFT JOIN music_collectives mc ON mc.id = u.collective_id
      WHERE u.id = $1
      LIMIT 1
      `,
      [userId]
    );

    if (!userRes.rows.length) {
      return res.status(404).json({ error: "user_not_found" });
    }

    const current = userRes.rows[0];
    const collectiveId = Number(current?.collective_id || 0) || null;

    const invitesRes = await pool.query(
      `
      SELECT
        i.id,
        mc.name AS collective_name,
        inviter.username,
        inviter.username_tag
      FROM music_collective_invites i
      JOIN music_collectives mc ON mc.id = i.collective_id
      JOIN users inviter ON inviter.id = i.invited_by_user_id
      WHERE i.invited_user_id = $1
        AND i.status = 'pending'
      ORDER BY i.created_at DESC
      `,
      [userId]
    );

    let members = [];
    let outgoingInvites = [];
    let directory = [];

    if (collectiveId) {
      const membersRes = await pool.query(
        `
        SELECT
          u.id,
          u.username,
          u.username_tag,
          m.role
        FROM music_collective_members m
        JOIN users u ON u.id = m.user_id
        WHERE m.collective_id = $1
        ORDER BY CASE WHEN m.role = 'owner' THEN 0 ELSE 1 END, LOWER(COALESCE(u.username, '')) ASC
        `,
        [collectiveId]
      );
      members = membersRes.rows;

      if (Number(current.owner_user_id || 0) === userId) {
        const outgoingRes = await pool.query(
          `
          SELECT
            i.id,
            u.username,
            u.username_tag
          FROM music_collective_invites i
          JOIN users u ON u.id = i.invited_user_id
          WHERE i.collective_id = $1
            AND i.status = 'pending'
          ORDER BY i.created_at DESC
          `,
          [collectiveId]
        );
        outgoingInvites = outgoingRes.rows;
      }
    }

    const directoryRes = await pool.query(
      `
      SELECT
        mc.id,
        mc.name,
        mc.owner_user_id,
        u.id AS user_id,
        u.username,
        u.username_tag,
        m.role
      FROM music_collectives mc
      LEFT JOIN music_collective_members m ON m.collective_id = mc.id
      LEFT JOIN users u ON u.id = m.user_id
      ORDER BY LOWER(mc.name) ASC, CASE WHEN m.role = 'owner' THEN 0 ELSE 1 END, LOWER(COALESCE(u.username, '')) ASC
      `
    );

    const directoryMap = new Map();
    for (const row of directoryRes.rows) {
      const collectiveKey = Number(row.id || 0);
      if (!collectiveKey) continue;

      if (!directoryMap.has(collectiveKey)) {
        directoryMap.set(collectiveKey, {
          id: collectiveKey,
          name: row.name,
          owner_user_id: Number(row.owner_user_id || 0),
          members: []
        });
      }

      if (row.user_id) {
        directoryMap.get(collectiveKey).members.push({
          id: Number(row.user_id),
          username: row.username,
          username_tag: row.username_tag,
          role: row.role
        });
      }
    }

    directory = Array.from(directoryMap.values()).map((item) => ({
      ...item,
      members_count: item.members.length
    }));

    res.json({
      collective: collectiveId
        ? {
            id: collectiveId,
            name: current.collective_name,
            owner_user_id: Number(current.owner_user_id || 0)
          }
        : null,
      canCreate: !collectiveId,
      isOwner: collectiveId ? Number(current.owner_user_id || 0) === userId : false,
      members,
      invites: invitesRes.rows,
      outgoingInvites,
      directory
    });
  } catch (err) {
    console.error("COLLECTIVE LOAD ERROR:", err);
    res.status(500).json({ error: "collective_load_failed" });
  }
});

app.get("/api/collectives/:id", async (req, res) => {
  try {
    const collectiveId = Number(req.params.id || 0);

    if (!collectiveId) {
      return res.status(400).json({ error: "collective_not_found" });
    }

    const collectiveRes = await pool.query(
      `
      SELECT id, name, owner_user_id
      FROM music_collectives
      WHERE id = $1
      LIMIT 1
      `,
      [collectiveId]
    );

    if (!collectiveRes.rows.length) {
      return res.status(404).json({ error: "collective_not_found" });
    }

    const membersRes = await pool.query(
      `
      SELECT
        u.id,
        u.username,
        u.username_tag,
        u.avatar,
        m.role
      FROM music_collective_members m
      JOIN users u ON u.id = m.user_id
      WHERE m.collective_id = $1
      ORDER BY CASE WHEN m.role = 'owner' THEN 0 ELSE 1 END, LOWER(COALESCE(u.username, '')) ASC
      `,
      [collectiveId]
    );

    res.json({
      collective: collectiveRes.rows[0],
      members: membersRes.rows
    });
  } catch (err) {
    console.error("COLLECTIVE DETAILS ERROR:", err);
    res.status(500).json({ error: "collective_load_failed" });
  }
});

app.post("/api/settings/collective/create", auth, async (req, res) => {
  try {
    const userId = Number(req.user.id || 0);
    const name = String(req.body?.name || "").trim();

    if (name.length < 2) {
      return res.status(400).json({ error: "collective_name_too_short" });
    }

    if (name.length > 48) {
      return res.status(400).json({ error: "collective_name_too_long" });
    }

    const userCheck = await pool.query(
      `SELECT collective_id FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );

    if (!userCheck.rows.length) {
      return res.status(404).json({ error: "user_not_found" });
    }

    if (userCheck.rows[0].collective_id) {
      return res.status(400).json({ error: "collective_already_exists" });
    }

    const takenRes = await pool.query(
      `SELECT id FROM music_collectives WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [name]
    );

    if (takenRes.rows.length) {
      return res.status(400).json({ error: "collective_name_taken" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const collectiveRes = await client.query(
        `
        INSERT INTO music_collectives (owner_user_id, name)
        VALUES ($1, $2)
        RETURNING id, name, owner_user_id
        `,
        [userId, name]
      );
      const collective = collectiveRes.rows[0];

      await client.query(
        `
        INSERT INTO music_collective_members (collective_id, user_id, role)
        VALUES ($1, $2, 'owner')
        ON CONFLICT (collective_id, user_id) DO NOTHING
        `,
        [collective.id, userId]
      );

      await client.query(
        `UPDATE users SET collective_id = $1 WHERE id = $2`,
        [collective.id, userId]
      );

      await client.query("COMMIT");
      res.json({ collective });
    } catch (innerErr) {
      await client.query("ROLLBACK");
      throw innerErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("COLLECTIVE CREATE ERROR:", err);
    res.status(500).json({ error: "collective_create_failed" });
  }
});

app.post("/api/settings/collective/invite", auth, async (req, res) => {
  try {
    const userId = Number(req.user.id || 0);
    const usernameTag = String(req.body?.username_tag || "").trim().replace(/^@+/, "");

    if (!usernameTag) {
      return res.status(400).json({ error: "collective_invite_username_required" });
    }

    const collectiveRes = await pool.query(
      `
      SELECT id, name, owner_user_id
      FROM music_collectives
      WHERE owner_user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    if (!collectiveRes.rows.length) {
      return res.status(403).json({ error: "collective_invite_forbidden" });
    }

    const collective = collectiveRes.rows[0];

    const targetRes = await pool.query(
      `
      SELECT id, username, username_tag, collective_id
      FROM users
      WHERE LOWER(username_tag) = LOWER($1)
      LIMIT 1
      `,
      [usernameTag]
    );

    if (!targetRes.rows.length) {
      return res.status(404).json({ error: "invite_user_not_found" });
    }

    const target = targetRes.rows[0];

    if (Number(target.id) === userId) {
      return res.status(400).json({ error: "collective_invite_self" });
    }

    if (target.collective_id) {
      return res.status(400).json({ error: "collective_invite_user_already_in_collective" });
    }

    const inviteRes = await pool.query(
      `
      INSERT INTO music_collective_invites (collective_id, invited_user_id, invited_by_user_id, status)
      VALUES ($1, $2, $3, 'pending')
      ON CONFLICT DO NOTHING
      RETURNING id
      `,
      [collective.id, target.id, userId]
    );

    if (!inviteRes.rows.length) {
      return res.status(400).json({ error: "collective_invite_already_sent" });
    }

    await createNotification({
      userId: Number(target.id),
      actorId: userId,
      type: "collective_invite",
      entityType: "collective",
      entityId: Number(collective.id),
      text: `${req.user.username || req.user.username_tag || "Пользователь"} пригласил тебя в объединение "${collective.name}"`,
      metadata: {
        inviteId: Number(inviteRes.rows[0].id),
        collectiveId: Number(collective.id),
        collectiveName: collective.name
      }
    });

    res.json({
      success: true,
      invite: {
        username: target.username,
        username_tag: target.username_tag,
        collective_name: collective.name
      }
    });
  } catch (err) {
    console.error("COLLECTIVE INVITE ERROR:", err);
    res.status(500).json({ error: "collective_invite_failed" });
  }
});

app.post("/api/settings/collective/delete", auth, async (req, res) => {
  try {
    const userId = Number(req.user.id || 0);
    const collectiveRes = await pool.query(
      `
      SELECT id, name
      FROM music_collectives
      WHERE owner_user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    if (!collectiveRes.rows.length) {
      return res.status(403).json({ error: "collective_delete_forbidden" });
    }

    const collective = collectiveRes.rows[0];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE users SET collective_id = NULL WHERE collective_id = $1`,
        [collective.id]
      );
      await client.query(
        `DELETE FROM music_collective_invites WHERE collective_id = $1`,
        [collective.id]
      );
      await client.query(
        `DELETE FROM music_collective_members WHERE collective_id = $1`,
        [collective.id]
      );
      await client.query(
        `DELETE FROM music_collectives WHERE id = $1`,
        [collective.id]
      );
      await client.query("COMMIT");
      res.json({ success: true, deletedCollectiveId: Number(collective.id) });
    } catch (innerErr) {
      await client.query("ROLLBACK");
      throw innerErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("COLLECTIVE DELETE ERROR:", err);
    res.status(500).json({ error: "collective_delete_failed" });
  }
});

app.post("/api/settings/collective/invite/:id/respond", auth, async (req, res) => {
  try {
    const userId = Number(req.user.id || 0);
    const inviteId = Number(req.params.id || 0);
    const action = String(req.body?.action || "").trim().toLowerCase();

    if (!inviteId || !["accept", "reject"].includes(action)) {
      return res.status(400).json({ error: "collective_invite_invalid_action" });
    }

    const inviteRes = await pool.query(
      `
      SELECT *
      FROM music_collective_invites
      WHERE id = $1
        AND invited_user_id = $2
        AND status = 'pending'
      LIMIT 1
      `,
      [inviteId, userId]
    );

    if (!inviteRes.rows.length) {
      return res.status(404).json({ error: "collective_invite_not_found" });
    }

    const invite = inviteRes.rows[0];

    if (action === "reject") {
      await pool.query(
        `UPDATE music_collective_invites SET status = 'rejected' WHERE id = $1`,
        [inviteId]
      );
      return res.json({ success: true });
    }

    const currentUserRes = await pool.query(
      `SELECT collective_id FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );

    if (currentUserRes.rows[0]?.collective_id) {
      return res.status(400).json({ error: "collective_invite_user_already_in_collective" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
        INSERT INTO music_collective_members (collective_id, user_id, role)
        VALUES ($1, $2, 'member')
        ON CONFLICT (collective_id, user_id) DO NOTHING
        `,
        [invite.collective_id, userId]
      );
      await client.query(
        `UPDATE users SET collective_id = $1 WHERE id = $2`,
        [invite.collective_id, userId]
      );
      await client.query(
        `UPDATE music_collective_invites SET status = 'accepted' WHERE id = $1`,
        [inviteId]
      );
      await client.query(
        `
        UPDATE music_collective_invites
        SET status = 'rejected'
        WHERE invited_user_id = $1
          AND status = 'pending'
          AND id != $2
        `,
        [userId, inviteId]
      );
      await client.query("COMMIT");
      res.json({ success: true });
    } catch (innerErr) {
      await client.query("ROLLBACK");
      throw innerErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("COLLECTIVE INVITE RESPOND ERROR:", err);
    res.status(500).json({ error: "collective_invite_respond_failed" });
  }
});

app.put("/api/users/:id/role", async (req, res) => {
  try {
    const userId = getUserIdFromToken(req)
    if (!userId) return res.status(401).json({ error: "Нет токена" })

    const admin = await isAdmin(userId)
    if (!admin) return res.status(403).json({ error: "Нет доступа" })

    const targetId = req.params.id
    const { role } = req.body

    if (!["user", "judge", "admin"].includes(role)) {
      return res.status(400).json({ error: "Неверная роль" })
    }

    await pool.query(
      "UPDATE users SET role = $1 WHERE id = $2",
      [role, targetId]
    )

    res.json({ success: true })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Ошибка сервера" })
  }
})

app.put("/api/users/:id/verified", async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) return res.status(401).json({ error: "Нет токена" });

    const admin = await isAdmin(userId);
    if (!admin) return res.status(403).json({ error: "Нет доступа" });

    const targetId = Number(req.params.id);
    const isVerified = Boolean(req.body?.is_verified);

    if (!targetId) {
      return res.status(400).json({ error: "Некорректный пользователь" });
    }

    const result = await pool.query(
      "UPDATE users SET is_verified = $1 WHERE id = $2 RETURNING id, is_verified",
      [isVerified, targetId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    res.json({ success: true, is_verified: result.rows[0].is_verified });
  } catch (err) {
    console.error("VERIFY USER ERROR:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.post("/upload-avatar", avatarUploadSingle, async (req, res) => {

  try {

    const userId = getUserIdFromToken(req);

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const avatarPath = `public/uploads/avatars/user-${userId}.webp`;

    await sharp(req.file.buffer)
      .resize(400, 400, { fit: "cover" })
      .webp({ quality: 90 })
      .toFile(avatarPath);

    const avatarUrl = `/uploads/avatars/user-${userId}.webp`;

    await pool.query(
      "UPDATE users SET avatar=$1 WHERE id=$2",
      [avatarUrl, userId]
    );

    res.json({ avatar: avatarUrl });

  } catch (err) {

    console.error(err);
    res.status(500).json(buildPublicErrorPayload(err, "Avatar upload failed", "Не удалось загрузить аватар."));

  }

});



app.post("/create-post", postMediaUploadSingle, async (req,res)=>{

try{

const userId = getUserIdFromToken(req);

const content = req.body.content || "";
let mediaUrl = null;
let mediaType = "text";

if (req.file) {

  const timestamp = Date.now();

  if (req.file.mimetype.startsWith("image")) {

    const fileName = `post-${timestamp}.webp`;
    const filePath = `public/uploads/posts/images/${fileName}`;

    await sharp(req.file.buffer)
      .resize(1200)
      .webp({ quality: 90 })
      .toFile(filePath);

    mediaUrl = `/uploads/posts/images/${fileName}`;
    mediaType = "image";

  }

  else if (req.file.mimetype.startsWith("video")) {

    const fileName = `post-${timestamp}.mp4`;
    const filePath = `public/uploads/posts/videos/${fileName}`;

    require("fs").writeFileSync(filePath, req.file.buffer);

    mediaUrl = `/uploads/posts/videos/${fileName}`;
    mediaType = "video";

  }

}



const result = await pool.query(
`INSERT INTO posts(user_id,content,media_url,media_type)
VALUES($1,$2,$3,$4)
RETURNING *`,
[userId,content,mediaUrl,mediaType]
);

await syncPostMentions(result.rows[0]?.id, userId, content);

const xpState = await awardXP(userId, "create_post", {
  amount: 20,
  cooldownSeconds: 45,
  dailyLimit: 6,
  meta: { postId: Number(result.rows[0]?.id || 0) }
});

res.json({
  ...result.rows[0],
  ...getXpPayload(xpState)
});

}catch(err){

console.error(err);
res.status(500).json({error:"post_create_failed"});

}

});
app.post("/update-post/:id", postUpload.single("media"), async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    const postId = req.params.id;

    const content = req.body.content || "";

    let mediaUrl = null;
    let mediaType = null;

    if (req.file) {

      const timestamp = Date.now();

      if (req.file.mimetype.startsWith("image")) {

        const fileName = `post-${timestamp}.webp`;
        const filePath = `public/uploads/posts/images/${fileName}`;

        await sharp(req.file.buffer)
          .resize(1200)
          .webp({ quality: 90 })
          .toFile(filePath);

        mediaUrl = `/uploads/posts/images/${fileName}`;
        mediaType = "image";

      }

      else if (req.file.mimetype.startsWith("video")) {

        const fileName = `post-${timestamp}.mp4`;
        const filePath = `public/uploads/posts/videos/${fileName}`;

        fs.writeFileSync(filePath, req.file.buffer);

        mediaUrl = `/uploads/posts/videos/${fileName}`;
        mediaType = "video";

      }

    }

    await pool.query(
      `
      UPDATE posts
      SET 
        content = $1,
        media_url = COALESCE($2, media_url),
        media_type = COALESCE($3, media_type)
      WHERE id = $4 AND user_id = $5
      `,
      [content, mediaUrl, mediaType, postId, userId]
    );

    await syncPostMentions(postId, userId, content);

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "update_failed" });
  }
});

app.delete("/delete-post/:id", async (req,res)=>{

try{

const userId = getUserIdFromToken(req)
const postId = req.params.id
const reason = String(req.body?.reason || req.query?.reason || "").trim()

const requesterRes = await pool.query(
`SELECT id, role, username, username_tag
 FROM users
 WHERE id = $1
 LIMIT 1`,
[userId]
)

if(requesterRes.rows.length === 0){
return res.status(401).json({error:"Unauthorized"})
}

const requester = requesterRes.rows[0]

const result = await pool.query(
`SELECT id, user_id, media_url, content
 FROM posts
 WHERE id=$1
 LIMIT 1`,
[postId]
)

if(result.rows.length === 0){
return res.status(404).json({error:"Post not found"})
}

const post = result.rows[0]
const isOwner = Number(post.user_id || 0) === Number(userId)
const isAdmin = String(requester.role || "") === "admin"

if(!isOwner && !isAdmin){
return res.status(403).json({error:"forbidden"})
}

if(!isOwner && isAdmin && !reason){
return res.status(400).json({error:"delete_reason_required"})
}

const mediaUrl = post.media_url

if(mediaUrl){

const cleanPath = mediaUrl.replace(/^\/+/,"")

const filePath = path.join(__dirname,"..","public",cleanPath)

console.log("Deleting:",filePath)

fs.unlink(filePath,(err)=>{
if(err){
console.log("Delete error:",err)
}else{
console.log("File deleted")
}
})

}

await pool.query(
"DELETE FROM posts WHERE id=$1",
[postId]
)

if(!isOwner && isAdmin && Number(post.user_id || 0) > 0){
await createNotification({
userId: Number(post.user_id),
actorId: userId,
type: "admin_post_deleted",
entityType: "post",
entityId: Number(postId),
text: `${requester.username || requester.username_tag || "Администратор"} удалил твою публикацию. Причина: ${reason}`,
metadata: {
postId: Number(postId),
reason,
moderation: true
},
force: true
})
}

res.json({success:true})

}catch(err){

console.error(err)
res.status(500).json({error:"Server error"})


}

})



app.get("/my-posts", async (req,res)=>{

try{

const userId = getUserIdFromToken(req);

const posts = await pool.query(
`
SELECT 
  posts.*,
  users.username,
  users.avatar,
  users.username_tag,
  (
    SELECT COUNT(*)::int
    FROM post_views
    WHERE post_views.post_id = posts.id
  ) AS views_count,
  (
    SELECT COUNT(*)::int
    FROM post_reactions
    WHERE post_reactions.post_id = posts.id AND post_reactions.reaction = 'like'
  ) AS likes_count,
  (
    SELECT COUNT(*)::int
    FROM post_reactions
    WHERE post_reactions.post_id = posts.id AND post_reactions.reaction = 'dislike'
  ) AS dislikes_count,
  (
    SELECT COUNT(*)::int
    FROM post_comments
    WHERE post_comments.post_id = posts.id
  ) AS comments_count,
  (
    SELECT reaction
    FROM post_reactions
    WHERE post_reactions.post_id = posts.id AND post_reactions.user_id = $2
    LIMIT 1
  ) AS my_reaction,
  EXISTS(
    SELECT 1
    FROM post_reposts
    WHERE post_reposts.post_id = posts.id AND post_reposts.user_id = $2
  ) AS reposted
FROM posts
JOIN users ON posts.user_id = users.id
WHERE posts.user_id=$1 AND COALESCE(posts.is_archived,false)=false
ORDER BY COALESCE(posts.is_pinned, false) DESC, posts.created_at DESC
`,
[userId, userId]
);

res.json(posts.rows);

}catch(err){

console.error("MY POSTS ERROR:", err);
res.status(500).send("error");

}

});

app.get("/posts", async (req, res) => {
  try {
    const tag = req.query.tag;
    const viewerId = getOptionalUserIdFromReq(req);

    let userId;

    if (tag) {
      const user = await pool.query(
        "SELECT id FROM users WHERE LOWER(username_tag) = LOWER($1)",
        [tag]
      );

      if (user.rows.length === 0) {
        return res.json([]);
      }

      userId = user.rows[0].id;
    } else {
      userId = getUserIdFromToken(req);
    }

    const posts = await pool.query(
      `
      SELECT 
        posts.*,
        users.username,
        users.avatar,
        users.username_tag,
        (
          SELECT COUNT(*)::int
          FROM post_views
          WHERE post_views.post_id = posts.id
        ) AS views_count,
        (
          SELECT COUNT(*)::int
          FROM post_reactions
          WHERE post_reactions.post_id = posts.id AND post_reactions.reaction = 'like'
        ) AS likes_count,
        (
          SELECT COUNT(*)::int
          FROM post_reactions
          WHERE post_reactions.post_id = posts.id AND post_reactions.reaction = 'dislike'
        ) AS dislikes_count,
        (
          SELECT COUNT(*)::int
          FROM post_comments
          WHERE post_comments.post_id = posts.id
        ) AS comments_count,
        (
          SELECT reaction
          FROM post_reactions
          WHERE post_reactions.post_id = posts.id AND post_reactions.user_id = $2
          LIMIT 1
        ) AS my_reaction,
        EXISTS(
          SELECT 1
          FROM post_reposts
          WHERE post_reposts.post_id = posts.id AND post_reposts.user_id = $2
        ) AS reposted
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.user_id = $1
        AND COALESCE(posts.is_archived,false)=false
      ORDER BY COALESCE(posts.is_pinned, false) DESC, posts.created_at DESC
      `,
      [userId, viewerId]
    );

    res.json(posts.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "posts_load_error" });
  }
});

app.get("/api/profile-reposts", async (req, res) => {
  try {
    const tag = req.query.tag;
    const viewerId = getOptionalUserIdFromReq(req);

    let profileUserId;

    if (tag) {
      const user = await pool.query(
        "SELECT id FROM users WHERE LOWER(username_tag) = LOWER($1)",
        [tag]
      );

      if (!user.rows.length) {
        return res.json([]);
      }

      profileUserId = Number(user.rows[0].id);
    } else {
      profileUserId = getUserIdFromToken(req);
    }

    if (!profileUserId) {
      return res.json([]);
    }

    const reposts = await pool.query(
      `
      SELECT
        posts.*,
        users.username,
        users.avatar,
        users.username_tag,
        pr.created_at AS reposted_at,
        (
          SELECT COUNT(*)::int
          FROM post_views
          WHERE post_views.post_id = posts.id
        ) AS views_count,
        (
          SELECT COUNT(*)::int
          FROM post_reactions
          WHERE post_reactions.post_id = posts.id AND post_reactions.reaction = 'like'
        ) AS likes_count,
        (
          SELECT COUNT(*)::int
          FROM post_reactions
          WHERE post_reactions.post_id = posts.id AND post_reactions.reaction = 'dislike'
        ) AS dislikes_count,
        (
          SELECT COUNT(*)::int
          FROM post_comments
          WHERE post_comments.post_id = posts.id
        ) AS comments_count,
        (
          SELECT reaction
          FROM post_reactions
          WHERE post_reactions.post_id = posts.id AND post_reactions.user_id = $2
          LIMIT 1
        ) AS my_reaction,
        EXISTS(
          SELECT 1
          FROM post_reposts
          WHERE post_reposts.post_id = posts.id AND post_reposts.user_id = $2
        ) AS reposted
      FROM post_reposts pr
      JOIN posts ON posts.id = pr.post_id
      JOIN users ON users.id = posts.user_id
      WHERE pr.user_id = $1
        AND COALESCE(posts.is_archived, false) = false
      ORDER BY pr.created_at DESC
      `,
      [profileUserId, viewerId]
    );

    const repostTracks = await pool.query(
      `
      SELECT
        t.*,
        u.username_tag,
        tr.created_at AS reposted_at,
        COALESCE((
          SELECT COUNT(*)::int
          FROM track_listens tls
          WHERE tls.track_id = t.id
        ), 0) AS listens_count,
        EXISTS(
          SELECT 1
          FROM track_reposts
          WHERE track_reposts.track_id = t.id AND track_reposts.user_id = $2
        ) AS reposted
      FROM track_reposts tr
      JOIN user_tracks t ON t.id = tr.track_id
      JOIN users u ON u.id = t.user_id
      WHERE tr.user_id = $1
        AND COALESCE(t.is_archived, false) = false
      ORDER BY tr.created_at DESC
      `,
      [profileUserId, viewerId]
    );

    const tracksWithMentions = await attachArtistMentionsToTracks(repostTracks.rows);

    res.json({
      posts: reposts.rows,
      tracks: tracksWithMentions
    });
  } catch (err) {
    console.error("PROFILE REPOSTS ERROR:", err);
    res.status(500).json({ error: "profile_reposts_load_error" });
  }
});

app.get("/api/profile-mentions", async (req, res) => {
  try {
    const tag = req.query.tag;
    const viewerId = getOptionalUserIdFromReq(req);

    let profileUserId;

    if (tag) {
      const user = await pool.query(
        "SELECT id FROM users WHERE LOWER(username_tag) = LOWER($1) LIMIT 1",
        [tag]
      );

      if (!user.rows.length) {
        return res.json({ posts: [], tracks: [] });
      }

      profileUserId = user.rows[0].id;
    } else {
      profileUserId = getUserIdFromToken(req);
    }

    if (!profileUserId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const mentionedPostsRes = await pool.query(
      `
      SELECT
        p.*,
        u.username,
        u.avatar,
        u.username_tag,
        pm.created_at AS mentioned_at,
        (
          SELECT COUNT(*)::int
          FROM post_views
          WHERE post_views.post_id = p.id
        ) AS views_count,
        (
          SELECT COUNT(*)::int
          FROM post_reactions
          WHERE post_reactions.post_id = p.id AND post_reactions.reaction = 'like'
        ) AS likes_count,
        (
          SELECT COUNT(*)::int
          FROM post_reactions
          WHERE post_reactions.post_id = p.id AND post_reactions.reaction = 'dislike'
        ) AS dislikes_count,
        (
          SELECT COUNT(*)::int
          FROM post_comments
          WHERE post_comments.post_id = p.id
        ) AS comments_count,
        (
          SELECT reaction
          FROM post_reactions
          WHERE post_reactions.post_id = p.id AND post_reactions.user_id = $2
          LIMIT 1
        ) AS my_reaction,
        EXISTS(
          SELECT 1
          FROM post_reposts
          WHERE post_reposts.post_id = p.id AND post_reposts.user_id = $2
        ) AS reposted
      FROM post_mentions pm
      JOIN posts p ON p.id = pm.post_id
      JOIN users u ON u.id = p.user_id
      WHERE pm.mentioned_user_id = $1
        AND COALESCE(p.is_archived, false) = false
      ORDER BY pm.created_at DESC
      `,
      [profileUserId, viewerId]
    );

    const mentionedTracksRes = await pool.query(
      `
      SELECT
        t.*,
        u.username,
        u.username_tag,
        tm.created_at AS mentioned_at,
        COALESCE((
          SELECT COUNT(*)::int
          FROM track_listens tls
          WHERE tls.track_id = t.id
        ), 0) AS listens_count,
        EXISTS(
          SELECT 1
          FROM track_reposts
          WHERE track_reposts.track_id = t.id AND track_reposts.user_id = $2
        ) AS reposted
      FROM track_mentions tm
      JOIN user_tracks t ON t.id = tm.track_id
      JOIN users u ON u.id = t.user_id
      WHERE tm.mentioned_user_id = $1
        AND COALESCE(t.is_archived, false) = false
      ORDER BY tm.created_at DESC
      `,
      [profileUserId, viewerId]
    );

    const tracksWithMentions = await attachArtistMentionsToTracks(mentionedTracksRes.rows);

    res.json({
      posts: mentionedPostsRes.rows,
      tracks: tracksWithMentions
    });
  } catch (err) {
    console.error("PROFILE MENTIONS ERROR:", err);
    res.status(500).json({ error: "profile_mentions_load_error" });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const userId = getUserIdFromToken(req)
    if (!await isAdmin(userId)) {
      return res.status(403).json({ error: "Нет доступа" })
    }

    const users = await pool.query(`
      SELECT
        id,
        username,
        username_tag,
        role,
        COALESCE(is_verified, false) AS is_verified,
        COALESCE(is_banned, false) AS is_banned,
        created_at,
        last_seen_at,
        CASE
          WHEN last_seen_at IS NOT NULL AND last_seen_at >= now() - interval '5 minutes'
            THEN true
          ELSE false
        END AS is_online
      FROM users
      ORDER BY created_at DESC NULLS LAST, id DESC
    `);

    const statsRes = await pool.query(`
      SELECT
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER (
          WHERE last_seen_at IS NOT NULL
            AND last_seen_at >= now() - interval '5 minutes'
        )::int AS online_users
      FROM users
    `);

    res.json({
      users: users.rows,
      stats: {
        total_users: Number(statsRes.rows[0]?.total_users || 0),
        online_users: Number(statsRes.rows[0]?.online_users || 0)
      }
    });

  } catch (err) {
    res.status(401).json({ error: "Unauthorized" })
  }
});

app.put("/api/users/:id/ban", async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    if (!await isAdmin(userId)) {
      return res.status(403).json({ error: "Нет доступа" });
    }

    const targetId = Number(req.params.id);
    const isBanned = Boolean(req.body?.is_banned);

    if (!targetId) {
      return res.status(400).json({ error: "Некорректный пользователь" });
    }

    if (targetId === Number(userId)) {
      return res.status(400).json({ error: "Нельзя заблокировать самого себя" });
    }

    const result = await pool.query(
      `
      UPDATE users
      SET is_banned = $1
      WHERE id = $2
      RETURNING id, COALESCE(is_banned, false) AS is_banned
      `,
      [isBanned, targetId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    res.json({
      success: true,
      is_banned: Boolean(result.rows[0].is_banned)
    });
  } catch (err) {
    console.error("BAN USER ERROR:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.get("/archived-posts", async (req,res)=>{
  try{

    const userId = getUserIdFromToken(req);

    const posts = await pool.query(
      `
      SELECT 
      posts.*,
      users.username,
      users.avatar
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.user_id=$1 AND COALESCE(posts.is_archived,false)=true
      ORDER BY posts.created_at DESC
      `,
      [userId]
    );

    res.json(posts.rows);

  }catch(err){
    console.error(err);
    res.status(500).json({error:"archived_posts_error"});
  }
});

app.get("/archived-tracks", async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);

    const result = await pool.query(
      `
      SELECT user_tracks.*, users.username_tag
      FROM user_tracks
      JOIN users ON users.id = user_tracks.user_id
      WHERE user_tracks.user_id = $1
        AND COALESCE(user_tracks.is_archived, false) = true
      ORDER BY user_tracks.created_at DESC
      `,
      [userId]
    );

    res.json(result.rows);

  } catch (err) {
    console.error("ARCHIVED TRACKS ERROR:", err);
    res.status(500).json({ error: "archived_tracks_error" });
  }
});

app.put("/archive-track/:id", async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    const trackId = req.params.id;

    await pool.query(
      `
      UPDATE user_tracks
      SET is_archived = NOT COALESCE(is_archived, false)
      WHERE id = $1 AND user_id = $2
      `,
      [trackId, userId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("ARCHIVE TRACK ERROR:", err);
    res.status(500).json({ error: "archive_track_failed" });
  }
});

app.delete("/delete-track/:id", async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    const trackId = req.params.id;
    const reason = String(req.body?.reason || req.query?.reason || "").trim();

    const requesterRes = await pool.query(
      `
      SELECT id, role, username, username_tag
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [userId]
    );

    if (requesterRes.rows.length === 0) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const requester = requesterRes.rows[0];

    const check = await pool.query(
      `
      SELECT id, user_id, audio, cover, title
      FROM user_tracks
      WHERE id = $1
      LIMIT 1
      `,
      [trackId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Track not found" });
    }

    const track = check.rows[0];
    const isOwner = Number(track.user_id || 0) === Number(userId);
    const isAdmin = String(requester.role || "") === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "forbidden" });
    }

    if (!isOwner && isAdmin && !reason) {
      return res.status(400).json({ error: "delete_reason_required" });
    }

    // удалить файлы
    if (track.audio) {
      const pathAudio = path.join(__dirname, "..", "public", track.audio);
      fs.unlink(pathAudio, () => {});
    }

    if (track.cover) {
      const pathCover = path.join(__dirname, "..", "public", track.cover);
      fs.unlink(pathCover, () => {});
    }

    // удалить из БД
    await pool.query(
      "DELETE FROM user_tracks WHERE id = $1",
      [trackId]
    );

    if (!isOwner && isAdmin && Number(track.user_id || 0) > 0) {
      await createNotification({
        userId: Number(track.user_id),
        actorId: userId,
        type: "admin_track_deleted",
        entityType: "track",
        entityId: Number(trackId),
        text: `${requester.username || requester.username_tag || "Администратор"} удалил твой трек "${track.title || "Без названия"}". Причина: ${reason}`,
        metadata: {
          trackId: Number(trackId),
          reason,
          moderation: true
        },
        force: true
      });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("DELETE TRACK ERROR:", err);
    res.status(500).json({ error: "server_error" });
  }
});

app.get("/feed", async (req,res)=>{

const viewerId = getOptionalUserIdFromReq(req);
const posts = await pool.query(`
SELECT
posts.*,
users.username,
users.avatar,
users.username_tag,
(
  SELECT COUNT(*)::int
  FROM post_views
  WHERE post_views.post_id = posts.id
) AS views_count,
(
  SELECT COUNT(*)::int
  FROM post_reactions
  WHERE post_reactions.post_id = posts.id AND post_reactions.reaction = 'like'
) AS likes_count,
(
  SELECT COUNT(*)::int
  FROM post_reactions
  WHERE post_reactions.post_id = posts.id AND post_reactions.reaction = 'dislike'
) AS dislikes_count,
(
  SELECT COUNT(*)::int
  FROM post_comments
  WHERE post_comments.post_id = posts.id
) AS comments_count,
(
  SELECT reaction
  FROM post_reactions
  WHERE post_reactions.post_id = posts.id AND post_reactions.user_id = $1
  LIMIT 1
) AS my_reaction
FROM posts
JOIN users ON users.id = posts.user_id
WHERE COALESCE(posts.is_archived,false)=false
ORDER BY COALESCE(posts.is_pinned, false) DESC, created_at DESC
LIMIT 50
`, [viewerId])

res.json(posts.rows)

})

function getHomeChallengeCatalog() {
  return [
    {
      id: "listener_streak",
      title: "Серия слушателя",
      description: "Оцени 5 треков за неделю и держи темп в очереди.",
      focus: "Самый сильный сигнал удержания здесь — когда человек не только слушает, но и влияет на расклад оценок.",
      goal: 5,
      icon: "fa-headphones",
      actionKeys: ["track_rate_user", "track_rate_judge", "profile_track_rate_user", "profile_track_rate_judge"]
    },
    {
      id: "creator_wave",
      title: "Волна создателя",
      description: "Выложи 2 новых трека или поста на этой неделе.",
      focus: "Контент создаёт цикл возврата: люди приходят проверить реакцию, комментарии и новую динамику профиля.",
      goal: 2,
      icon: "fa-compact-disc",
      actionKeys: ["create_track", "create_post"]
    },
    {
      id: "community_heat",
      title: "Прогрей комьюнити",
      description: "Оставь 6 осмысленных действий: комментарии, репосты или лайки впервые.",
      focus: "Чем больше человек трогает других, тем меньше шансов, что он тихо выпадет из платформы.",
      goal: 6,
      icon: "fa-fire",
      actionKeys: ["post_comment", "track_comment", "post_repost", "track_repost", "track_like_first"]
    },
    {
      id: "judge_focus",
      title: "Точность недели",
      description: "Вернись 3 дня подряд и удержи личную серию активности.",
      focus: "Серия делает платформу привычкой: пользователь заходит не ради одного действия, а чтобы не оборвать импульс.",
      goal: 3,
      icon: "fa-bolt",
      actionKeys: ["daily_presence"]
    }
  ];
}

function getWeekRotationIndex(date = new Date()) {
  const currentDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = currentDate.getUTCDay() || 7;
  currentDate.setUTCDate(currentDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(currentDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((currentDate - yearStart) / 86400000) + 1) / 7);
}

function getHomeWeekBounds() {
  const now = new Date();
  const currentDay = now.getDay() || 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (currentDay - 1));

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  return { start, end };
}

function computeActivityStreak(rows = []) {
  const days = [...new Set(
    (Array.isArray(rows) ? rows : [])
      .map((row) => String(row.activity_day || "").trim())
      .filter(Boolean)
  )];

  if (!days.length) return 0;

  const latest = new Date(`${days[0]}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const latestGap = Math.round((today.getTime() - latest.getTime()) / 86400000);
  if (latestGap > 1) {
    return 0;
  }

  let streak = 0;
  let cursor = new Date(`${days[0]}T00:00:00`);

  for (const day of days) {
    const current = new Date(`${day}T00:00:00`);
    const diff = Math.round((cursor.getTime() - current.getTime()) / 86400000);

    if (streak === 0) {
      streak = 1;
      cursor = current;
      continue;
    }

    if (diff === 1) {
      streak += 1;
      cursor = current;
      continue;
    }

    break;
  }

  return streak;
}

async function getHomeQueueStateSummary() {
  const settingsRes = await pool.query(
    `
    SELECT key, value
    FROM system_settings
    WHERE key IN ('queue_state', 'queue_state_changed_at')
    `
  );

  const map = Object.fromEntries(settingsRes.rows.map((row) => [row.key, row.value]));
  const state = String(map.queue_state || "open");

  return {
    state,
    label: state === "closed" ? "Закрыта" : state === "paused" ? "На паузе" : "Открыта",
    changed_at: map.queue_state_changed_at || null
  };
}

async function getHomeLiveActivity(limit = 8) {
  const result = await pool.query(
    `
    SELECT *
    FROM (
      SELECT
        ut.created_at,
        'track_release'::text AS activity_type,
        'Новый трек'::text AS type_label,
        'fa-compact-disc'::text AS icon,
        COALESCE(u.username, u.username_tag, 'Артист') AS username,
        u.username_tag,
        u.avatar,
        COALESCE(u.username, u.username_tag, 'Артист') || ' выпустил трек' AS title,
        COALESCE(ut.title, 'Без названия') || CASE WHEN COALESCE(ut.artist, '') <> '' THEN ' • ' || ut.artist ELSE '' END AS text,
        CASE
          WHEN COALESCE(u.username_tag, '') <> '' AND COALESCE(ut.slug, '') <> '' THEN '/' || u.username_tag || '/' || ut.slug
          ELSE NULL
        END AS href
      FROM user_tracks ut
      JOIN users u ON u.id = ut.user_id
      WHERE COALESCE(ut.is_archived, false) = false

      UNION ALL

      SELECT
        tr.created_at,
        'queue_rating'::text AS activity_type,
        CASE WHEN tr.type = 'judge' THEN 'Оценка судьи' ELSE 'Новая оценка' END AS type_label,
        CASE WHEN tr.type = 'judge' THEN 'fa-scale-balanced' ELSE 'fa-star' END AS icon,
        COALESCE(actor.username, actor.username_tag, 'Участник') AS username,
        actor.username_tag,
        actor.avatar,
        COALESCE(actor.username, actor.username_tag, 'Участник') || CASE WHEN tr.type = 'judge' THEN ' оценил трек в очереди' ELSE ' поднял рейтинг трека' END AS title,
        COALESCE(t.title, 'Без названия') || ' • ' || COALESCE(t.artist, 'Артист') AS text,
        '/track/' || t.id AS href
      FROM track_ratings tr
      JOIN users actor ON actor.id = tr.user_id
      JOIN tracks t ON t.id = tr.track_id

      UNION ALL

      SELECT
        p.created_at,
        'post_drop'::text AS activity_type,
        'Новый пост'::text AS type_label,
        'fa-bolt'::text AS icon,
        COALESCE(u.username, u.username_tag, 'Артист') AS username,
        u.username_tag,
        u.avatar,
        COALESCE(u.username, u.username_tag, 'Артист') || ' вбросил новый пост' AS title,
        LEFT(REGEXP_REPLACE(COALESCE(p.content, ''), '\s+', ' ', 'g'), 96) AS text,
        '/' || u.username_tag AS href
      FROM posts p
      JOIN users u ON u.id = p.user_id
      WHERE COALESCE(p.is_archived, false) = false

      UNION ALL

      SELECT
        tc.created_at,
        'track_comment'::text AS activity_type,
        'Обсуждение'::text AS type_label,
        'fa-comment-dots'::text AS icon,
        COALESCE(actor.username, actor.username_tag, 'Слушатель') AS username,
        actor.username_tag,
        actor.avatar,
        COALESCE(actor.username, actor.username_tag, 'Слушатель') || ' подключился к обсуждению' AS title,
        COALESCE(ut.title, 'Без названия') || ' • ' || LEFT(REGEXP_REPLACE(COALESCE(tc.text, ''), '\s+', ' ', 'g'), 84) AS text,
        CASE
          WHEN COALESCE(owner.username_tag, '') <> '' AND COALESCE(ut.slug, '') <> '' THEN '/' || owner.username_tag || '/' || ut.slug
          ELSE NULL
        END AS href
      FROM track_comments tc
      JOIN users actor ON actor.id = tc.user_id
      JOIN user_tracks ut ON ut.id = tc.track_id
      JOIN users owner ON owner.id = ut.user_id
    ) activity
    ORDER BY created_at DESC
    LIMIT $1
    `,
    [limit]
  );

  return result.rows;
}

async function getHomeForYou(viewerId) {
  if (!viewerId) return null;

  const { start, end } = getHomeWeekBounds();
  const challengeCatalog = getHomeChallengeCatalog();
  const challenge = challengeCatalog[getWeekRotationIndex(new Date()) % challengeCatalog.length];

  const [
    userRes,
    notificationRes,
    unreadRes,
    streakRes,
    weeklyRes,
    queueTracksRes
  ] = await Promise.all([
    pool.query(
      `
      SELECT id, username, username_tag, avatar, role, COALESCE(xp, 0)::int AS xp
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [viewerId]
    ),
    pool.query(
      `
      SELECT
        n.id,
        n.text,
        n.type,
        n.entity_type,
        n.entity_id,
        n.metadata,
        n.created_at,
        u.username AS actor_username,
        u.username_tag AS actor_username_tag
      FROM notifications n
      LEFT JOIN users u ON u.id = n.actor_id
      WHERE n.user_id = $1
        AND n.type != 'dm'
      ORDER BY n.created_at DESC
      LIMIT 2
      `,
      [viewerId]
    ),
    pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM notifications
      WHERE user_id = $1
        AND is_read = false
        AND type != 'dm'
      `,
      [viewerId]
    ),
    pool.query(
      `
      SELECT DISTINCT DATE(created_at) AS activity_day
      FROM xp_events
      WHERE user_id = $1
      ORDER BY activity_day DESC
      LIMIT 30
      `,
      [viewerId]
    ),
    pool.query(
      `
      SELECT action_key, COUNT(*)::int AS count
      FROM xp_events
      WHERE user_id = $1
        AND created_at >= $2
        AND created_at < $3
      GROUP BY action_key
      `,
      [viewerId, start, end]
    ),
    pool.query(
      `
      SELECT
        t.id,
        t.title,
        t.artist,
        t.cover,
        t.createdAt,
        u.username,
        u.username_tag
      FROM tracks t
      LEFT JOIN users u ON u.id = t.user_id
      WHERE COALESCE(t.user_id, 0) != $1
        AND NOT EXISTS (
          SELECT 1
          FROM track_ratings tr
          WHERE tr.track_id = t.id
            AND tr.user_id = $1
        )
      ORDER BY t.createdAt ASC
      LIMIT 3
      `,
      [viewerId]
    )
  ]);

  const user = userRes.rows[0] ? attachRankState(userRes.rows[0]) : null;
  if (!user) return null;

  const weeklyCounts = Object.fromEntries(
    weeklyRes.rows.map((row) => [row.action_key, Number(row.count || 0)])
  );

  const challengeProgress = challenge.id === "judge_focus"
    ? computeActivityStreak(streakRes.rows)
    : challenge.actionKeys.reduce((sum, key) => sum + Number(weeklyCounts[key] || 0), 0);

  const streakDays = computeActivityStreak(streakRes.rows);
  const weeklyActions = Object.values(weeklyCounts).reduce((sum, count) => sum + Number(count || 0), 0);

  return {
    user,
    unread_notifications: Number(unreadRes.rows[0]?.count || 0),
    latest_notifications: notificationRes.rows,
    streak_days: streakDays,
    streak_hint: streakDays > 0
      ? `Серия уже держится ${streakDays} дн. Ещё одно действие сегодня — и темп останется с тобой.`
      : "Сделай любое действие сегодня и запусти новую серию активности.",
    weekly_actions: weeklyActions,
    weekly_actions_hint: "Чем выше недельный темп, тем чаще платформа начинает отдавать тебя в центр внимания.",
    tracks_to_rate: queueTracksRes.rows,
    challenge: {
      ...challenge,
      progress: challengeProgress
    }
  };
}

app.get("/api/home", async (req, res) => {
  try {
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store"
    });

    const viewerId = getOptionalUserIdFromReq(req);

    const results = await Promise.allSettled([
      getHomeQueueStateSummary(),
      getHomeForYou(viewerId),
      getHomeLiveActivity(8),
      pool.query(
        `
        SELECT
          hn.id,
          hn.title,
          hn.content,
          hn.media_url,
          hn.media_type,
          hn.created_at,
          COALESCE(u.username, u.username_tag, 'Админ') AS author_name,
          u.username_tag AS author_tag
        FROM home_news hn
        LEFT JOIN users u ON u.id = hn.created_by
        ORDER BY hn.created_at DESC
        LIMIT 3
        `
      ),
      getHomeTopTracksSnapshot(),
      pool.query(
        `
        WITH scored_posts AS (
          SELECT
            posts.*,
            COALESCE(users.username, users.username_tag, 'Без имени') AS username,
            users.avatar,
            users.username_tag,
            (
              SELECT COUNT(*)::int
              FROM post_views
              WHERE post_views.post_id = posts.id
            ) AS views_count,
            (
              SELECT COUNT(*)::int
              FROM post_reactions
              WHERE post_reactions.post_id = posts.id AND post_reactions.reaction = 'like'
            ) AS likes_count,
            (
              SELECT COUNT(*)::int
              FROM post_reactions
              WHERE post_reactions.post_id = posts.id AND post_reactions.reaction = 'dislike'
            ) AS dislikes_count,
            (
              SELECT COUNT(*)::int
              FROM post_comments
              WHERE post_comments.post_id = posts.id
            ) AS comments_count,
            (
              SELECT reaction
              FROM post_reactions
              WHERE post_reactions.post_id = posts.id AND post_reactions.user_id = $1
              LIMIT 1
            ) AS my_reaction,
            EXISTS(
              SELECT 1
              FROM post_reposts
              WHERE post_reposts.post_id = posts.id
                AND post_reposts.user_id = $1
            ) AS reposted,
            RANDOM() AS random_seed,
            (
              CASE
                WHEN COALESCE(posts.is_pinned, false) THEN 38
                ELSE 0
              END
              +
              CASE
                WHEN $1::int IS NOT NULL AND EXISTS(
                  SELECT 1
                  FROM follows f
                  WHERE f.follower_id = $1
                    AND f.following_id = posts.user_id
                ) THEN 18
                ELSE 0
              END
              +
              CASE
                WHEN $1::int IS NOT NULL AND NOT EXISTS(
                  SELECT 1
                  FROM post_views pv
                  WHERE pv.post_id = posts.id
                    AND pv.user_id = $1
                ) THEN 26
                ELSE 0
              END
              +
              CASE
                WHEN posts.user_id = $1 THEN -24
                ELSE 0
              END
              +
              LEAST(42, COALESCE((
                SELECT COUNT(*)::int * 6
                FROM post_reactions pr
                WHERE pr.post_id = posts.id
                  AND pr.reaction = 'like'
              ), 0))
              -
              LEAST(16, COALESCE((
                SELECT COUNT(*)::int * 4
                FROM post_reactions pr
                WHERE pr.post_id = posts.id
                  AND pr.reaction = 'dislike'
              ), 0))
              +
              LEAST(30, COALESCE((
                SELECT COUNT(*)::int * 7
                FROM post_comments pc
                WHERE pc.post_id = posts.id
              ), 0))
              +
              LEAST(24, COALESCE((
                SELECT COUNT(*)::int * 8
                FROM post_reposts rep
                WHERE rep.post_id = posts.id
              ), 0))
              +
              LEAST(18, COALESCE((
                SELECT FLOOR(COUNT(*)::numeric / 3)::int
                FROM post_views pv
                WHERE pv.post_id = posts.id
              ), 0))
              +
              GREATEST(
                0,
                20 - FLOOR(EXTRACT(EPOCH FROM (now() - posts.created_at)) / 3600 / 9)::int
              )
              +
              FLOOR(RANDOM() * 26)::int
            ) AS recommendation_score
          FROM posts
          JOIN users ON users.id = posts.user_id
          WHERE COALESCE(posts.is_archived, false) = false
        ),
        diversified_posts AS (
          SELECT
            scored_posts.*,
            ROW_NUMBER() OVER (
              PARTITION BY scored_posts.user_id
              ORDER BY scored_posts.recommendation_score DESC, scored_posts.random_seed ASC
            ) AS author_slot
          FROM scored_posts
        )
        SELECT *
        FROM diversified_posts
        WHERE author_slot <= 2
        ORDER BY recommendation_score DESC, random_seed ASC
        LIMIT 18
        `,
        [viewerId]
      ),
      pool.query(
        `
        SELECT
          u.id,
          COALESCE(u.username, u.username_tag, 'Без имени') AS username,
          u.username_tag,
          u.avatar,
          COALESCE((
            SELECT COUNT(*)::int
            FROM track_likes tl
            JOIN user_tracks t ON t.id = tl.track_id
            WHERE t.user_id = u.id
              AND COALESCE(t.is_archived, false) = false
          ), 0) +
          COALESCE((
            SELECT COUNT(*)::int
            FROM post_reactions pr
            JOIN posts p ON p.id = pr.post_id
            WHERE p.user_id = u.id
              AND COALESCE(p.is_archived, false) = false
              AND pr.reaction = 'like'
          ), 0) AS total_likes,
          COALESCE((
            SELECT COUNT(*)::int
            FROM track_listens tls
            JOIN user_tracks t ON t.id = tls.track_id
            WHERE t.user_id = u.id
              AND COALESCE(t.is_archived, false) = false
          ), 0) AS total_listens,
          COALESCE((
            SELECT COUNT(*)::int
            FROM user_tracks t
            WHERE t.user_id = u.id
              AND COALESCE(t.is_archived, false) = false
          ), 0) AS tracks_count
        FROM users u
        WHERE EXISTS (
          SELECT 1
          FROM user_tracks t
          WHERE t.user_id = u.id
            AND COALESCE(t.is_archived, false) = false
        )
        ORDER BY total_likes DESC, total_listens DESC, tracks_count DESC, u.created_at DESC
        LIMIT 20
        `
      ),
      pool.query(
        `
        WITH scored_tracks AS (
          SELECT
            t.id,
            t.slug,
            t.title,
            t.artist,
            t.cover,
            t.audio,
            t.soundcloud,
            t.duration,
            t.created_at,
            t.user_id,
            COALESCE(u.username, u.username_tag, 'Артист') AS username,
            u.username_tag,
            u.avatar,
            COALESCE((
              SELECT COUNT(*)::int
              FROM track_likes tl
              WHERE tl.track_id = t.id
            ), 0) AS likes_count,
            COALESCE((
              SELECT COUNT(*)::int
              FROM track_listens tls
              WHERE tls.track_id = t.id
            ), 0) AS listens_count,
            COALESCE((
              SELECT COUNT(*)::int
              FROM track_comments tc
              WHERE tc.track_id = t.id
            ), 0) AS comments_count,
            RANDOM() AS random_seed,
            (
              LEAST(30, COALESCE((
                SELECT COUNT(*)::int * 5
                FROM track_likes tl
                WHERE tl.track_id = t.id
              ), 0))
              +
              LEAST(24, COALESCE((
                SELECT FLOOR(COUNT(*)::numeric / 4)::int
                FROM track_listens tls
                WHERE tls.track_id = t.id
              ), 0))
              +
              LEAST(18, COALESCE((
                SELECT COUNT(*)::int * 6
                FROM track_comments tc
                WHERE tc.track_id = t.id
              ), 0))
              +
              GREATEST(
                0,
                18 - FLOOR(EXTRACT(EPOCH FROM (now() - t.created_at)) / 3600 / 12)::int
              )
              +
              FLOOR(RANDOM() * 28)::int
            ) AS spotlight_score
          FROM user_tracks t
          JOIN users u ON u.id = t.user_id
          WHERE COALESCE(t.is_archived, false) = false
        ),
        diversified_tracks AS (
          SELECT
            scored_tracks.*,
            ROW_NUMBER() OVER (
              PARTITION BY scored_tracks.user_id
              ORDER BY scored_tracks.spotlight_score DESC, scored_tracks.random_seed ASC
            ) AS author_slot
          FROM scored_tracks
        )
        SELECT *
        FROM diversified_tracks
        WHERE author_slot = 1
        ORDER BY spotlight_score DESC, random_seed ASC
        LIMIT 12
        `
      )
    ]);

    const [
      queueStateResult,
      forYouResult,
      liveActivityResult,
      newsResult,
      topTracksResult,
      postsResult,
      topArtistsResult,
      spotlightTracksResult
    ] = results;

    if (queueStateResult.status === "rejected") {
      console.error("HOME API QUEUE STATE ERROR:", queueStateResult.reason);
    }

    if (forYouResult.status === "rejected") {
      console.error("HOME API FOR YOU ERROR:", forYouResult.reason);
    }

    if (liveActivityResult.status === "rejected") {
      console.error("HOME API LIVE ACTIVITY ERROR:", liveActivityResult.reason);
    }

    if (newsResult.status === "rejected") {
      console.error("HOME API NEWS ERROR:", newsResult.reason);
    }

    if (topTracksResult.status === "rejected") {
      console.error("HOME API TOP TRACKS ERROR:", topTracksResult.reason);
    }

    if (postsResult.status === "rejected") {
      console.error("HOME API POSTS ERROR:", postsResult.reason);
    }

    if (topArtistsResult.status === "rejected") {
      console.error("HOME API TOP ARTISTS ERROR:", topArtistsResult.reason);
    }

    if (spotlightTracksResult.status === "rejected") {
      console.error("HOME API SPOTLIGHT TRACKS ERROR:", spotlightTracksResult.reason);
    }

    const queueState = queueStateResult.status === "fulfilled" ? queueStateResult.value : null;
    const forYou = forYouResult.status === "fulfilled" ? forYouResult.value : null;
    const weeklyChallenge = forYou?.challenge || {
      ...getHomeChallengeCatalog()[getWeekRotationIndex(new Date()) % getHomeChallengeCatalog().length],
      progress: 0
    };
    const liveActivity = liveActivityResult.status === "fulfilled" ? liveActivityResult.value : [];
    const news = newsResult.status === "fulfilled" ? newsResult.value.rows : [];
    const rawTopTracks = topTracksResult.status === "fulfilled" ? topTracksResult.value : [];
    const recommendedPosts = postsResult.status === "fulfilled" ? postsResult.value.rows : [];
    const topArtists = topArtistsResult.status === "fulfilled" ? topArtistsResult.value.rows : [];
    const rawSpotlightTracks = spotlightTracksResult.status === "fulfilled" ? spotlightTracksResult.value.rows : [];

    const safeTopTracks = Array.isArray(rawTopTracks) ? rawTopTracks : (rawTopTracks?.rows || []);
    const topTracks = await attachArtistMentionsToTracks(safeTopTracks);
    const spotlightTracks = await attachArtistMentionsToTracks(rawSpotlightTracks);

    res.json({
      queueState,
      weeklyChallenge,
      forYou,
      liveActivity,
      news,
      topTracks,
      recommendedPosts,
      topArtists,
      spotlightTracks
    });
  } catch (err) {
    console.error("HOME API ERROR:", err);
    res.status(500).json({ error: "home_load_failed" });
  }
});

app.get("/api/admin/news", requireRole(["admin"]), async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        hn.id,
        hn.title,
        hn.content,
        hn.created_at,
        COALESCE(u.username, u.username_tag, 'Админ') AS author_name
      FROM home_news hn
      LEFT JOIN users u ON u.id = hn.created_by
      ORDER BY hn.created_at DESC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error("ADMIN NEWS LIST ERROR:", err);
    res.status(500).json({ error: "admin_news_list_failed" });
  }
});

app.post("/api/admin/news", requireRole(["admin"]), postUpload.single("media"), async (req, res) => {
  try {
    const userId = req.user.id;
    const title = String(req.body?.title || "").trim();
    const content = String(req.body?.content || "").trim();
    let mediaUrl = null;
    let mediaType = null;

    if (!title || !content) {
      return res.status(400).json({ error: "title_and_content_required" });
    }

    if (req.file) {
      const timestamp = Date.now();

      if (req.file.mimetype.startsWith("image")) {
        const fileName = `news-${timestamp}.webp`;
        const filePath = `public/uploads/news/images/${fileName}`;
        fs.mkdirSync(path.dirname(filePath), { recursive: true });

        await sharp(req.file.buffer)
          .rotate()
          .resize({ width: 1800, withoutEnlargement: true })
          .webp({ quality: 84 })
          .toFile(filePath);

        mediaUrl = `/uploads/news/images/${fileName}`;
        mediaType = "image";
      } else if (req.file.mimetype.startsWith("video")) {
        const ext = path.extname(req.file.originalname || "").toLowerCase() || ".mp4";
        const fileName = `news-${timestamp}${ext}`;
        const filePath = `public/uploads/news/videos/${fileName}`;
        fs.mkdirSync(path.dirname(filePath), { recursive: true });

        fs.writeFileSync(filePath, req.file.buffer);

        mediaUrl = `/uploads/news/videos/${fileName}`;
        mediaType = "video";
      }
    }

    const result = await pool.query(
      `
      INSERT INTO home_news (title, content, media_url, media_type, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, title, content, media_url, media_type, created_at
      `,
      [title.slice(0, 160), content, mediaUrl, mediaType, userId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("ADMIN NEWS CREATE ERROR:", err);
    res.status(500).json({ error: "admin_news_create_failed" });
  }
});

app.delete("/api/admin/news/:id", requireRole(["admin"]), async (req, res) => {
  try {
    const newsId = Number(req.params.id);
    if (!newsId) {
      return res.status(400).json({ error: "invalid_news_id" });
    }

    const existing = await pool.query(
      "SELECT media_url FROM home_news WHERE id = $1 LIMIT 1",
      [newsId]
    );

    await pool.query("DELETE FROM home_news WHERE id = $1", [newsId]);

    const mediaUrl = existing.rows[0]?.media_url;
    if (mediaUrl) {
      const mediaPath = path.join(__dirname, "..", "public", mediaUrl.replace(/^\//, ""));
      fs.unlink(mediaPath, () => {});
    }

    res.json({ success: true });
  } catch (err) {
    console.error("ADMIN NEWS DELETE ERROR:", err);
    res.status(500).json({ error: "admin_news_delete_failed" });
  }
});

app.put("/archive-post/:id", async (req,res)=>{

try{

const userId = getUserIdFromToken(req)
const postId = req.params.id

await pool.query(
"UPDATE posts SET is_archived = NOT COALESCE(is_archived,false) WHERE id=$1 AND user_id=$2",
[postId,userId]
)

res.json({success:true})

}catch(err){

console.error(err)
res.status(500).json({error:"archive_failed"})

}

})

// ======================
// 🔥 SOUNDCLOUD API
// ======================
app.get("/api/soundcloud", async (req, res) => {
  const url = req.query.url;

  if (!url) {
    return res.status(400).json({ message: "Нет ссылки" });
  }

  try {
    // 🔥 получаем HTML страницы трека
    const response = await fetch(url);
    const html = await response.text();

    // 🔥 вытаскиваем JSON из страницы
    const jsonMatch = html.match(/window\.__sc_hydration = (\[.*?\]);/);

    if (!jsonMatch) {
      return res.status(500).json({ message: "Не удалось распарсить SoundCloud" });
    }

    const data = JSON.parse(jsonMatch[1]);

    // 🔥 ищем трек
    const trackData = data.find(item => item.hydratable === "sound");

    if (!trackData) {
      return res.status(500).json({ message: "Трек не найден" });
    }

    const track = trackData.data;

    const artist = track.user?.username || "";
    const title = track.title || "";

    const artwork =
      track.artwork_url?.replace("-large", "-t500x500") ||
      track.user?.avatar_url;

    res.json({
      artist,
      title,
      artwork
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Ошибка SoundCloud" });
  }
});


// ======================
// 🔥 TRACKS API
// ======================

// ➕ создать трек
app.post("/api/tracks", requireRole(["user", "judge", "admin"]), trackUploadFields, async (req, res) => {
  try {
    const q = await pool.query(
  "SELECT value FROM system_settings WHERE key = 'queue_state'"
);

const state = q.rows[0]?.value || "open";

if (state !== "open") {
  return res.status(403).json({ message: "Очередь закрыта или на паузе" });
}

    const artist = sanitizeTrackText(req.body?.artist, { maxLength: 255 });
    const title = sanitizeTrackText(req.body?.title, { maxLength: 255 });
    const soundcloud = String(req.body?.soundcloud || "").trim();
    const coverUrl = String(req.body?.coverUrl || "").trim();

    let audioPath = null;
    let cover = coverUrl || null;

    if (!title) {
      return res.status(400).json({ error: "title_required" });
    }

    if (!req.files?.audio?.[0] && !soundcloud) {
      return res.status(400).json({ error: "audio_required" });
    }

    // 🎵 audio
    if (req.files?.audio) {
      const file = req.files.audio[0];
      assertSupportedAudioFile(file);
      const fileExt = getSafeAudioExtension(file);
      const fileName = `track-${Date.now()}${fileExt}`;
      const filePath = `public/uploads/tracks/${fileName}`;

      fs.writeFileSync(filePath, file.buffer);
      audioPath = `/uploads/tracks/${fileName}`;
    }

    // 🖼 cover
    if (req.files?.cover) {
      const file = req.files.cover[0];
      const fileName = `cover-${Date.now()}.webp`;
      const filePath = `public/uploads/tracks/covers/${fileName}`;

      await sharp(file.buffer)
        .resize(500, 500)
        .webp({ quality: 90 })
        .toFile(filePath);

      cover = `/uploads/tracks/covers/${fileName}`;
    }

    const user = req.user;

const result = await pool.query(
  `INSERT INTO tracks (artist, title, soundcloud, cover, audio, createdAt, user_id)
   VALUES ($1,$2,$3,$4,$5,NOW(),$6)
   RETURNING *`,
  [artist, title, soundcloud, cover, audioPath, user.id]
);

    res.json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json(buildPublicErrorPayload(err, "track_create_failed", "Не удалось отправить трек."));
  }
});



// 📥 очередь
app.get("/api/tracks/queue", async (req, res) => {
  try {

    // 🔥 получаем статус
    const q = await pool.query(
      "SELECT value FROM system_settings WHERE key = 'queue_state'"
    );

    const state = q.rows[0]?.value || "open";

    let query = "";

    if(state === "closed"){

      // 🏆 СОРТИРОВКА ПО РЕЙТИНГУ
      query = `
        SELECT 
          t.*,

          (
            SELECT COALESCE(ROUND(AVG(score)),0)
            FROM track_ratings
            WHERE track_id = t.id AND type = 'user'
          ) as user_score,

          (
            SELECT COALESCE(ROUND(AVG(score)),0)
            FROM track_ratings
            WHERE track_id = t.id AND type = 'judge'
          ) as judge_score,

          (
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM track_ratings
                WHERE track_id = t.id AND type = 'user'
              ) AND EXISTS (
                SELECT 1
                FROM track_ratings
                WHERE track_id = t.id AND type = 'judge'
              ) THEN (
                (
                  COALESCE((
                    SELECT AVG(score)
                    FROM track_ratings
                    WHERE track_id = t.id AND type = 'user'
                  ),0)
                  +
                  COALESCE((
                    SELECT AVG(score)
                    FROM track_ratings
                    WHERE track_id = t.id AND type = 'judge'
                  ),0)
                ) / 2.0
              )
              WHEN EXISTS (
                SELECT 1
                FROM track_ratings
                WHERE track_id = t.id AND type = 'judge'
              ) THEN COALESCE((
                SELECT AVG(score)
                FROM track_ratings
                WHERE track_id = t.id AND type = 'judge'
              ),0)
              ELSE COALESCE((
                SELECT AVG(score)
                FROM track_ratings
                WHERE track_id = t.id AND type = 'user'
              ),0)
            END
          ) as total_score

        FROM tracks t

        ORDER BY judge_score DESC, total_score DESC, user_score DESC, t.createdAt DESC
      `;

    }else{

      // 🧾 ОБЫЧНАЯ ОЧЕРЕДЬ
      query = `
        SELECT 
          t.*,

          (
            SELECT ROUND(AVG(score))
            FROM track_ratings
            WHERE track_id = t.id AND type = 'user'
          ) as user_score,

          (
            SELECT ROUND(AVG(score))
            FROM track_ratings
            WHERE track_id = t.id AND type = 'judge'
          ) as judge_score

        FROM tracks t

        ORDER BY t.createdAt ASC
      `;
    }

    const result = await pool.query(query);

    if (state === "closed" && result.rows.length) {
      const judgeRatedRows = result.rows
        .filter((row) => Number(row.judge_score || 0) > 0)
        .sort((a, b) => {
          const judgeDiff = Number(b.judge_score || 0) - Number(a.judge_score || 0);
          if (judgeDiff !== 0) return judgeDiff;

          const totalDiff = Number(b.total_score || 0) - Number(a.total_score || 0);
          if (totalDiff !== 0) return totalDiff;

          const userDiff = Number(b.user_score || 0) - Number(a.user_score || 0);
          if (userDiff !== 0) return userDiff;

          const aTime = new Date(a.createdAt || a.created_at || 0).getTime();
          const bTime = new Date(b.createdAt || b.created_at || 0).getTime();
          return aTime - bTime;
        });
      if (judgeRatedRows.length) {
        await replaceHomeTopTracksSnapshot(judgeRatedRows.slice(0, 10), "id");
        await awardQueuePodiumPlaces(judgeRatedRows);
      }
    }

    res.json({
      state,
      tracks: result.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Ошибка загрузки очереди" });
  }
});


// ❌ удалить трек
app.delete("/api/tracks/:id", auth, async (req, res) => {
    try {
      const id = req.params.id;
      const requesterId = Number(req.user.id || 0);

      const requesterRes = await pool.query(
        "SELECT id, role FROM users WHERE id = $1 LIMIT 1",
        [requesterId]
      );

      if (!requesterRes.rows.length) {
        return res.status(401).json({ error: "user_not_found" });
      }

      const requester = requesterRes.rows[0];

      const trackRes = await pool.query(
        "SELECT id, user_id FROM tracks WHERE id = $1 LIMIT 1",
        [id]
      );

      if (!trackRes.rows.length) {
        return res.status(404).json({ error: "track_not_found" });
      }

      const track = trackRes.rows[0];
      const canDelete =
        ["judge", "admin"].includes(String(requester.role || "")) ||
        Number(track.user_id || 0) === requesterId;

      if (!canDelete) {
        return res.status(403).json({ error: "forbidden" });
      }

      await pool.query("DELETE FROM tracks WHERE id = $1", [id]);

      res.json({ success: true });

    } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Ошибка удаления" });
  }
});

// 🔥 получить один трек
app.get("/api/tracks/:id", async (req, res) => {
  try {

    const id = req.params.id;
    const viewerId = getOptionalUserIdFromReq(req);

    const result = await pool.query(`
      SELECT 
        t.*,
        u.username_tag,

        (
          SELECT ROUND(AVG(score))
          FROM track_ratings
          WHERE track_id = t.id AND type = 'user'
        ) as user_score,

        (
          SELECT ROUND(AVG(score))
          FROM track_ratings
          WHERE track_id = t.id AND type = 'judge'
        ) as judge_score,

        (
          SELECT ROUND(AVG(rhymes)::numeric, 3)
          FROM track_rating_details
          WHERE track_id = t.id AND rating_type = 'judge'
        ) as rhymes_avg,

        (
          SELECT ROUND(AVG(structure)::numeric, 3)
          FROM track_rating_details
          WHERE track_id = t.id AND rating_type = 'judge'
        ) as structure_avg,

        (
          SELECT ROUND(AVG(style)::numeric, 3)
          FROM track_rating_details
          WHERE track_id = t.id AND rating_type = 'judge'
        ) as style_avg,

        (
          SELECT ROUND(AVG(charisma)::numeric, 3)
          FROM track_rating_details
          WHERE track_id = t.id AND rating_type = 'judge'
        ) as charisma_avg,

        (
          SELECT ROUND(AVG(vibe)::numeric, 3)
          FROM track_rating_details
          WHERE track_id = t.id AND rating_type = 'judge'
        ) as vibe_avg,

        (
          SELECT ROUND(AVG(memory)::numeric, 3)
          FROM track_rating_details
          WHERE track_id = t.id AND rating_type = 'judge'
        ) as memory_avg,

        (
          SELECT ut.id
          FROM user_tracks ut
          WHERE ut.user_id = t.user_id
            AND (
              (t.audio IS NOT NULL AND ut.audio = t.audio)
              OR (t.soundcloud IS NOT NULL AND ut.soundcloud = t.soundcloud)
              OR (
                LOWER(COALESCE(ut.title, '')) = LOWER(COALESCE(t.title, ''))
                AND LOWER(COALESCE(ut.artist, '')) = LOWER(COALESCE(t.artist, ''))
              )
            )
          ORDER BY ut.created_at DESC
          LIMIT 1
        ) as comment_track_id,

        COALESCE((
          SELECT COUNT(*)::int
          FROM track_actions ta
          WHERE ta.track_id = t.id
            AND COALESCE(ta.entity_type, 'profile') = 'queue'
            AND ta.action = 'like'
        ), 0) as likes,

        COALESCE((
          SELECT COUNT(*)::int
          FROM track_actions ta
          WHERE ta.track_id = t.id
            AND COALESCE(ta.entity_type, 'profile') = 'queue'
            AND ta.action = 'dislike'
        ), 0) as dislikes,

        (
          SELECT ta.action
          FROM track_actions ta
          WHERE ta.track_id = t.id
            AND ta.user_id = $2
            AND COALESCE(ta.entity_type, 'profile') = 'queue'
          LIMIT 1
        ) as my_action

      FROM tracks t
      LEFT JOIN users u ON u.id = t.user_id
      WHERE t.id = $1
    `, [id, viewerId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Трек не найден" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Ошибка сервера" });
  }
});

app.get("/api/tracks/:id/judges", async (req, res) => {
  try {
    const trackId = req.params.id;

    const result = await pool.query(`
      SELECT
        u.username,
        d.total,
        d.rhymes,
        d.structure,
        d.style,
        d.charisma,
        d.vibe,
        d.memory
      FROM track_rating_details d
      JOIN users u ON u.id = d.user_id
      WHERE d.track_id = $1
        AND d.rating_type = 'judge'
      ORDER BY d.created_at ASC
    `, [trackId]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "judges_load_failed" });
  }
});

app.get("/api/search", async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();

  if (!q) {
    return res.json({ users: [], tracks: [] });
  }

  try {
    const users = await pool.query(`
      SELECT
        u.id,
        u.username,
        u.username_tag,
        u.avatar
      FROM users u
      WHERE LOWER(u.username_tag) LIKE $1
         OR LOWER(u.username) LIKE $1
      ORDER BY
        CASE
          WHEN LOWER(u.username_tag) = $2 THEN 0
          WHEN LOWER(u.username) = $2 THEN 1
          WHEN LOWER(u.username_tag) LIKE $3 THEN 2
          WHEN LOWER(u.username) LIKE $3 THEN 3
          ELSE 4
        END,
        u.created_at DESC
      LIMIT 6
    `, [`%${q}%`, q, `${q}%`]);

    const tracksRes = await pool.query(`
      SELECT
        t.id,
        t.title,
        t.artist,
        t.cover,
        t.audio,
        t.soundcloud,
        t.slug,
        u.username,
        u.username_tag,
        u.avatar AS user_avatar
      FROM user_tracks t
      JOIN users u ON u.id = t.user_id
      WHERE COALESCE(t.is_archived, false) = false
        AND (
          LOWER(t.title) LIKE $1
          OR LOWER(t.artist) LIKE $1
          OR LOWER(u.username) LIKE $1
          OR LOWER(u.username_tag) LIKE $1
        )
      ORDER BY
        CASE
          WHEN LOWER(t.title) = $2 THEN 0
          WHEN LOWER(t.artist) = $2 THEN 1
          WHEN LOWER(t.title) LIKE $3 THEN 2
          WHEN LOWER(t.artist) LIKE $3 THEN 3
          WHEN LOWER(u.username_tag) LIKE $3 THEN 4
          ELSE 5
        END,
        t.created_at DESC
      LIMIT 8
    `, [`%${q}%`, q, `${q}%`]);

    const tracks = await attachArtistMentionsToTracks(tracksRes.rows);

    res.json({
      users: users.rows,
      tracks
    });

  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ users: [], tracks: [] });
  }
});


app.post("/api/track-like", auth, async (req, res) => {
  const { trackId } = req.body;
  const userId = req.user.id;

  async function getTrackLikesCount() {
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM track_likes WHERE track_id = $1`,
      [trackId]
    );

    return Number(countRes.rows[0]?.count || 0);
  }

  // 🔍 проверяем текущий лайк
  const existing = await pool.query(
    `SELECT * FROM track_likes WHERE user_id=$1 AND track_id=$2`,
    [userId, trackId]
  );

  // ❌ ЕСЛИ УЖЕ ЕСТЬ ЛАЙК → УДАЛЯЕМ (БЕЗ XP)
  if (existing.rows.length > 0) {
    await pool.query(
      `DELETE FROM track_likes WHERE user_id=$1 AND track_id=$2`,
      [userId, trackId]
    );

    return res.json({ liked: false, count: await getTrackLikesCount() });
  }

  // ✅ СТАВИМ ЛАЙК
  await pool.query(
    `INSERT INTO track_likes (user_id, track_id) VALUES ($1,$2)`,
    [userId, trackId]
  );

  const ownerRes = await pool.query(
    `
    SELECT
      t.user_id,
      t.title,
      t.slug,
      u.username_tag
    FROM user_tracks t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.id = $1
    LIMIT 1
    `,
    [trackId]
  );
  const actorRes = await pool.query(
    "SELECT username, username_tag FROM users WHERE id = $1 LIMIT 1",
    [userId]
  );
  const owner = ownerRes.rows[0] || {};
  const actor = actorRes.rows[0] || {};

  if (owner.user_id) {
    const profileTrackRoute = owner.username_tag && owner.slug
      ? `/${owner.username_tag}/${owner.slug}`
      : "";

    await createNotification({
      userId: owner.user_id,
      actorId: userId,
      type: "track_like",
      entityType: "track",
      entityId: Number(trackId),
      text: `${actor.username || actor.username_tag || "Пользователь"} лайкнул твой трек "${owner.title || "без названия"}"`,
      metadata: {
        trackId: Number(trackId),
        route: profileTrackRoute,
        usernameTag: owner.username_tag || "",
        slug: owner.slug || ""
      }
    });
  }

  // 🔥 КЛЮЧЕВОЙ МОМЕНТ
  // проверяем — был ли этот лайк раньше (в истории)
  const everLiked = await pool.query(
    `SELECT 1 FROM track_likes_history WHERE user_id=$1 AND track_id=$2`,
    [userId, trackId]
  );

 let xpState = buildXpAwardState(0, 0);

// если первый раз → даём XP
if (everLiked.rows.length === 0) {
  xpState = await awardXP(userId, "track_like_first", {
    amount: 5,
    eventKey: `track-like:${trackId}`,
    meta: { trackId: Number(trackId) }
  });

  await pool.query(
    `INSERT INTO track_likes_history (user_id, track_id) VALUES ($1,$2)`,
    [userId, trackId]
  );
}

res.json({ liked: true, count: await getTrackLikesCount(), ...getXpPayload(xpState) });
});

app.get("/api/track-likes/:id", async (req, res) => {
  const trackId = req.params.id;
  const token = req.headers.authorization?.split(" ")[1];

  let userId = null;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.id;
    } catch {}
  }

  const count = await pool.query(
    `SELECT COUNT(*) FROM track_likes WHERE track_id=$1`,
    [trackId]
  );

  let liked = false;

  if (userId) {
    const check = await pool.query(
      `SELECT 1 FROM track_likes WHERE user_id=$1 AND track_id=$2`,
      [userId, trackId]
    );
    liked = check.rows.length > 0;
  }

  res.json({
    count: Number(count.rows[0].count),
    liked
  });
});

// ======================
// ⭐ ОЦЕНКИ
// ======================

// 👥 USER ОЦЕНКА
app.post("/api/rate/user", requireRole(["user", "judge", "admin"]), async (req, res) => {
  try {
    const {
      track_id,
      score,
      rhymes,
      structure,
      style,
      charisma,
      vibe,
      memory
    } = req.body;

    const user = req.user;
    const trackOwnerRes = await pool.query(
      `
      SELECT user_id
      FROM tracks
      WHERE id = $1
      LIMIT 1
      `,
      [track_id]
    );

    if (!trackOwnerRes.rows.length) {
      return res.status(404).json({ error: "track_not_found" });
    }

    if (String(user.role || "") === "user" && Number(trackOwnerRes.rows[0].user_id || 0) === Number(user.id || 0)) {
      return res.status(403).json({ error: "self_rate_forbidden" });
    }

    await pool.query(`
      INSERT INTO track_ratings (track_id, user_id, type, score)
      VALUES ($1, $2, 'user', $3)
      ON CONFLICT (track_id, user_id, type)
      DO UPDATE SET score = EXCLUDED.score
    `, [track_id, user.id, score]);

    await pool.query(`
      INSERT INTO track_rating_details
      (track_id, user_id, rhymes, structure, style, charisma, vibe, memory, total, rating_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'user')
      ON CONFLICT (track_id, user_id, rating_type)
      DO UPDATE SET
        rhymes = EXCLUDED.rhymes,
        structure = EXCLUDED.structure,
        style = EXCLUDED.style,
        charisma = EXCLUDED.charisma,
        vibe = EXCLUDED.vibe,
        memory = EXCLUDED.memory,
        total = EXCLUDED.total
    `, [
      track_id,
      user.id,
      rhymes,
      structure,
      style,
      charisma,
      vibe,
      memory,
      score
    ]);

    const xpState = await awardXP(user.id, "track_rate_user", {
      amount: 15,
      eventKey: `track-rate:user:${track_id}`,
      meta: { trackId: Number(track_id) }
    });

res.json({
  success: true,
  ...getXpPayload(xpState)
});

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "rate_failed" });
  }
});


// 🎧 JUDGE ОЦЕНКА
app.post("/api/rate/judge", requireRole(["judge", "admin"]), async (req, res) => {
  try {
    const {
      track_id,
      score,
      rhymes,
      structure,
      style,
      charisma,
      vibe,
      memory
    } = req.body;

    const user = req.user;

    await pool.query(`
      INSERT INTO track_ratings (track_id, user_id, type, score)
      VALUES ($1, $2, 'judge', $3)
      ON CONFLICT (track_id, user_id, type)
      DO UPDATE SET score = EXCLUDED.score
    `, [track_id, user.id, score]);

    await pool.query(`
      INSERT INTO track_rating_details
      (track_id, user_id, rhymes, structure, style, charisma, vibe, memory, total, rating_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'judge')
      ON CONFLICT (track_id, user_id, rating_type)
      DO UPDATE SET
        rhymes = EXCLUDED.rhymes,
        structure = EXCLUDED.structure,
        style = EXCLUDED.style,
        charisma = EXCLUDED.charisma,
        vibe = EXCLUDED.vibe,
        memory = EXCLUDED.memory,
        total = EXCLUDED.total
    `, [
      track_id,
      user.id,
      rhymes,
      structure,
      style,
      charisma,
      vibe,
      memory,
      score
    ]);

    const xpState = await awardXP(user.id, "track_rate_judge", {
      amount: 25,
      eventKey: `track-rate:judge:${track_id}`,
      meta: { trackId: Number(track_id) }
    });

res.json({
  success: true,
  ...getXpPayload(xpState)
});

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "rate_failed" });
  }
});


app.post("/add-user-track", profileTrackUploadFields, async (req, res) => {
  try {
    
const userId = getUserIdFromToken(req);
const title = sanitizeTrackText(req.body?.title, { maxLength: 160 });
const artist = sanitizeTrackText(req.body?.artist, { maxLength: 255 });
const producer = sanitizeTrackText(req.body?.producer, { maxLength: 255 });
const genre = sanitizeTrackText(req.body?.genre, { maxLength: 120 });
const tags = sanitizeTrackText(req.body?.tags, { maxLength: 500 });
const description = sanitizeTrackText(req.body?.description, { maxLength: 5000, allowNewlines: true });
const soundcloud = String(req.body?.soundcloud || "").trim();
const slug = slugify(title);
    

    if (!title) {
  return res.status(400).json({ error: "title_required" });
}

let audioPath = null;
let coverPath = null;

if (!req.files?.audio?.[0]) {
  return res.status(400).json({ error: "audio_required" });
}

if (!req.files?.cover?.[0]) {
  return res.status(400).json({ error: "cover_required" });
}

// 🎵 AUDIO
if (req.files?.audio) {
  const file = req.files.audio[0];
  assertSupportedAudioFile(file);
  const fileExt = getSafeAudioExtension(file);
  const fileName = `user-track-${Date.now()}${fileExt}`;
  const filePath = `public/uploads/tracks/${fileName}`;

  fs.writeFileSync(filePath, file.buffer);
  audioPath = `/uploads/tracks/${fileName}`;
}

// 🖼 COVER
if (req.files?.cover) {
  const file = req.files.cover[0];
  const fileName = `user-cover-${Date.now()}.webp`;
  const filePath = `public/uploads/tracks/covers/${fileName}`;

  await sharp(file.buffer)
    .resize(500, 500)
    .webp({ quality: 90 })
    .toFile(filePath);

  coverPath = `/uploads/tracks/covers/${fileName}`;
}

const result = await pool.query(
  `
  INSERT INTO user_tracks 
  (user_id, title, artist, producer, genre, tags, description, cover, audio, soundcloud, slug)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  RETURNING *
  `,
  [
    userId,
    title,
    artist,
    producer,
    genre,
    tags,
    description,
    coverPath,
    audioPath,
    soundcloud,
    slug
  ]
);

await syncTrackMentions(result.rows[0]?.id, userId, artist);

const xpState = await awardXP(userId, "create_track", {
  amount: 50,
  cooldownSeconds: 120,
  dailyLimit: 3,
  eventKey: `track-upload:${result.rows[0]?.id}`,
  meta: { trackId: Number(result.rows[0]?.id || 0) }
});

res.json({
  ...result.rows[0],
  ...getXpPayload(xpState)
});

  } catch (err) {
    console.error(err);
    res.status(500).json(buildPublicErrorPayload(err, "server_error", "Не удалось загрузить трек."));
  }
});

app.put("/update-track/:id", profileTrackUploadFields, async (req, res) => {
  try {

    const userId = getUserIdFromToken(req)
    const trackId = req.params.id

    const title = sanitizeTrackText(req.body?.title, { maxLength: 160 })
    const artist = sanitizeTrackText(req.body?.artist, { maxLength: 255 })
    const producer = sanitizeTrackText(req.body?.producer, { maxLength: 255 })
    const genre = sanitizeTrackText(req.body?.genre, { maxLength: 120 })
    const tags = sanitizeTrackText(req.body?.tags, { maxLength: 500 })
    const description = sanitizeTrackText(req.body?.description, { maxLength: 5000, allowNewlines: true })

    if (!title) {
      return res.status(400).json({ error: "title_required" })
    }

    let audioPath = null
    let coverPath = null

    // 🎵 AUDIO
    if (req.files?.audio) {
      const file = req.files.audio[0]
      assertSupportedAudioFile(file)
      const fileExt = getSafeAudioExtension(file)
      const fileName = `user-track-${Date.now()}${fileExt}`
      const filePath = `public/uploads/tracks/${fileName}`

      fs.writeFileSync(filePath, file.buffer)
      audioPath = `/uploads/tracks/${fileName}`
    }

    // 🖼 COVER
    if (req.files?.cover) {
      const file = req.files.cover[0]
      const fileName = `user-cover-${Date.now()}.webp`
      const filePath = `public/uploads/tracks/covers/${fileName}`

      await sharp(file.buffer)
        .resize(500, 500)
        .webp({ quality: 90 })
        .toFile(filePath)

      coverPath = `/uploads/tracks/covers/${fileName}`
    }

    await pool.query(`
      UPDATE user_tracks SET
        title = $1,
        artist = $2,
        producer = $3,
        genre = $4,
        tags = $5,
        description = $6,
        audio = COALESCE($7, audio),
        cover = COALESCE($8, cover)
      WHERE id = $9 AND user_id = $10
    `, [
      title,
      artist,
      producer,
      genre,
      tags,
      description,
      audioPath,
      coverPath,
      trackId,
      userId
    ])

    await syncTrackMentions(trackId, userId, artist)

    res.json({ success: true })

  } catch (err) {
    console.error("UPDATE TRACK ERROR:", err)
    res.status(500).json(buildPublicErrorPayload(err, "update_failed", "Не удалось обновить трек."))
  }
})

app.get("/user-tracks", async (req, res) => {
  try {
    const tag = req.query.tag;
    const viewerId = getOptionalUserIdFromReq(req);

    let userId;

    if (tag) {
      const user = await pool.query(
        "SELECT id FROM users WHERE LOWER(username_tag) = LOWER($1)",
        [tag]
      );

      if (user.rows.length === 0) {
        return res.json([]);
      }

      userId = user.rows[0].id;
    } else {
      userId = getUserIdFromToken(req);
    }

    const result = await pool.query(
      `
      SELECT 
        user_tracks.*,
        users.username_tag,
        COALESCE((
          SELECT ROUND(AVG(ptr.score)::numeric, 1)
          FROM profile_track_ratings ptr
          WHERE ptr.profile_track_id = user_tracks.id
            AND ptr.type = 'user'
        ), 0) AS profile_user_score,
        COALESCE((
          SELECT ROUND(AVG(ptr.score)::numeric, 1)
          FROM profile_track_ratings ptr
          WHERE ptr.profile_track_id = user_tracks.id
            AND ptr.type = 'judge'
        ), 0) AS profile_judge_score,
        (
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM profile_track_ratings ptr
              WHERE ptr.profile_track_id = user_tracks.id
                AND ptr.type = 'user'
            ) AND EXISTS (
              SELECT 1
              FROM profile_track_ratings ptr
              WHERE ptr.profile_track_id = user_tracks.id
                AND ptr.type = 'judge'
            ) THEN (
              (
                COALESCE((
                  SELECT AVG(ptr.score)
                  FROM profile_track_ratings ptr
                  WHERE ptr.profile_track_id = user_tracks.id
                    AND ptr.type = 'user'
                ), 0)
                +
                COALESCE((
                  SELECT AVG(ptr.score)
                  FROM profile_track_ratings ptr
                  WHERE ptr.profile_track_id = user_tracks.id
                    AND ptr.type = 'judge'
                ), 0)
              ) / 2.0
            )
            WHEN EXISTS (
              SELECT 1
              FROM profile_track_ratings ptr
              WHERE ptr.profile_track_id = user_tracks.id
                AND ptr.type = 'judge'
            ) THEN COALESCE((
              SELECT AVG(ptr.score)
              FROM profile_track_ratings ptr
              WHERE ptr.profile_track_id = user_tracks.id
                AND ptr.type = 'judge'
            ), 0)
            ELSE COALESCE((
              SELECT AVG(ptr.score)
              FROM profile_track_ratings ptr
              WHERE ptr.profile_track_id = user_tracks.id
                AND ptr.type = 'user'
            ), 0)
          END
        )::numeric(10,1) AS profile_total_score,
        COALESCE((
          SELECT COUNT(*)::int
          FROM profile_track_ratings ptr
          WHERE ptr.profile_track_id = user_tracks.id
            AND ptr.type = 'user'
        ), 0) AS profile_user_votes_count,
        COALESCE((
          SELECT COUNT(*)::int
          FROM profile_track_ratings ptr
          WHERE ptr.profile_track_id = user_tracks.id
            AND ptr.type = 'judge'
        ), 0) AS profile_judge_votes_count,
        (
          SELECT ptr.type
          FROM profile_track_ratings ptr
          WHERE ptr.profile_track_id = user_tracks.id
            AND ptr.user_id = $2
          LIMIT 1
        ) AS profile_my_rating_type,
        (
          SELECT COUNT(*)::int
          FROM track_listens
          WHERE track_listens.track_id = user_tracks.id
        ) AS listens_count,
        EXISTS(
          SELECT 1
          FROM track_reposts
          WHERE track_reposts.track_id = user_tracks.id AND track_reposts.user_id = $2
        ) AS reposted,
        EXISTS(
          SELECT 1
          FROM tracks t
          WHERE t.user_id = user_tracks.user_id
            AND (
              (user_tracks.audio IS NOT NULL AND t.audio = user_tracks.audio)
              OR (user_tracks.soundcloud IS NOT NULL AND t.soundcloud = user_tracks.soundcloud)
              OR (
                LOWER(COALESCE(t.title, '')) = LOWER(COALESCE(user_tracks.title, ''))
                AND LOWER(COALESCE(t.artist, '')) = LOWER(COALESCE(user_tracks.artist, ''))
              )
            )
        ) AS is_in_queue
      FROM user_tracks
      JOIN users ON users.id = user_tracks.user_id
      WHERE user_tracks.user_id = $1
        AND COALESCE(user_tracks.is_archived, false) = false
      ORDER BY user_tracks.created_at DESC
      `,
      [userId, viewerId]
    );

    const tracksWithMentions = await attachArtistMentionsToTracks(result.rows);
    res.json(tracksWithMentions);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  }
});

app.get("/api/profile-tracks/:id/my-rating", auth, async (req, res) => {
  try {
    const profileTrackId = Number(req.params.id);
    const userId = req.user.id;

    if (!profileTrackId) {
      return res.status(400).json({ error: "invalid_track_id" });
    }

    const ratingType = ["judge", "admin"].includes(String(req.user?.role || "").toLowerCase())
      ? "judge"
      : "user";

    const result = await pool.query(
      `
      SELECT rhymes, structure, style, charisma, vibe, memory, total, rating_type
      FROM profile_track_rating_details
      WHERE profile_track_id = $1
        AND user_id = $2
        AND rating_type = $3
      LIMIT 1
      `,
      [profileTrackId, userId, ratingType]
    );

    res.json(result.rows[0] || null);
  } catch (err) {
    console.error("PROFILE TRACK MY RATING ERROR:", err);
    res.status(500).json({ error: "profile_track_my_rating_failed" });
  }
});

app.post("/api/profile-tracks/:id/rate", requireRole(["user", "judge", "admin"]), async (req, res) => {
  try {
    const profileTrackId = Number(req.params.id);
    const userId = req.user.id;
    const role = String(req.user?.role || "").toLowerCase();
    const ratingType = ["judge", "admin"].includes(role) ? "judge" : "user";

    const rhymes = Number(req.body?.rhymes);
    const structure = Number(req.body?.structure);
    const style = Number(req.body?.style);
    const charisma = Number(req.body?.charisma);
    const vibe = Number(req.body?.vibe);
    const memory = Number(req.body?.memory);
    const score = Number(req.body?.score);

    if (!profileTrackId) {
      return res.status(400).json({ error: "invalid_track_id" });
    }

    const metricValues = [rhymes, structure, style, charisma, vibe, memory, score];
    if (metricValues.some((value) => !Number.isFinite(value))) {
      return res.status(400).json({ error: "invalid_rating_values" });
    }

    const trackRes = await pool.query(
      `
      SELECT id, user_id
      FROM user_tracks
      WHERE id = $1
        AND COALESCE(is_archived, false) = false
      LIMIT 1
      `,
      [profileTrackId]
    );

    if (!trackRes.rows.length) {
      return res.status(404).json({ error: "track_not_found" });
    }

    if (Number(trackRes.rows[0].user_id || 0) === Number(userId)) {
      return res.status(403).json({ error: "cannot_rate_own_track" });
    }

    await pool.query(
      `
      INSERT INTO profile_track_ratings (profile_track_id, user_id, type, score, updated_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (profile_track_id, user_id, type)
      DO UPDATE SET
        score = EXCLUDED.score,
        updated_at = now()
      `,
      [profileTrackId, userId, ratingType, score]
    );

    await pool.query(
      `
      INSERT INTO profile_track_rating_details (
        profile_track_id,
        user_id,
        rhymes,
        structure,
        style,
        charisma,
        vibe,
        memory,
        total,
        rating_type,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
      ON CONFLICT (profile_track_id, user_id, rating_type)
      DO UPDATE SET
        rhymes = EXCLUDED.rhymes,
        structure = EXCLUDED.structure,
        style = EXCLUDED.style,
        charisma = EXCLUDED.charisma,
        vibe = EXCLUDED.vibe,
        memory = EXCLUDED.memory,
        total = EXCLUDED.total,
        updated_at = now()
      `,
      [profileTrackId, userId, rhymes, structure, style, charisma, vibe, memory, score, ratingType]
    );

    const summaryRes = await pool.query(
      `
      SELECT
        COALESCE((
          SELECT ROUND(AVG(ptr.score)::numeric, 1)
          FROM profile_track_ratings ptr
          WHERE ptr.profile_track_id = $1
            AND ptr.type = 'user'
        ), 0) AS profile_user_score,
        COALESCE((
          SELECT ROUND(AVG(ptr.score)::numeric, 1)
          FROM profile_track_ratings ptr
          WHERE ptr.profile_track_id = $1
            AND ptr.type = 'judge'
        ), 0) AS profile_judge_score,
        (
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM profile_track_ratings ptr
              WHERE ptr.profile_track_id = $1
                AND ptr.type = 'user'
            ) AND EXISTS (
              SELECT 1
              FROM profile_track_ratings ptr
              WHERE ptr.profile_track_id = $1
                AND ptr.type = 'judge'
            ) THEN (
              (
                COALESCE((
                  SELECT AVG(ptr.score)
                  FROM profile_track_ratings ptr
                  WHERE ptr.profile_track_id = $1
                    AND ptr.type = 'user'
                ), 0)
                +
                COALESCE((
                  SELECT AVG(ptr.score)
                  FROM profile_track_ratings ptr
                  WHERE ptr.profile_track_id = $1
                    AND ptr.type = 'judge'
                ), 0)
              ) / 2.0
            )
            WHEN EXISTS (
              SELECT 1
              FROM profile_track_ratings ptr
              WHERE ptr.profile_track_id = $1
                AND ptr.type = 'judge'
            ) THEN COALESCE((
              SELECT AVG(ptr.score)
              FROM profile_track_ratings ptr
              WHERE ptr.profile_track_id = $1
                AND ptr.type = 'judge'
            ), 0)
            ELSE COALESCE((
              SELECT AVG(ptr.score)
              FROM profile_track_ratings ptr
              WHERE ptr.profile_track_id = $1
                AND ptr.type = 'user'
            ), 0)
          END
        )::numeric(10,1) AS profile_total_score,
        COALESCE((
          SELECT COUNT(*)::int
          FROM profile_track_ratings ptr
          WHERE ptr.profile_track_id = $1
            AND ptr.type = 'user'
        ), 0) AS profile_user_votes_count,
        COALESCE((
          SELECT COUNT(*)::int
          FROM profile_track_ratings ptr
          WHERE ptr.profile_track_id = $1
            AND ptr.type = 'judge'
        ), 0) AS profile_judge_votes_count
      `,
      [profileTrackId]
    );

    const xpState = await awardXP(req.user.id, `profile_track_rate_${ratingType}`, {
      amount: ratingType === "judge" ? 25 : 15,
      eventKey: `profile-track-rate:${ratingType}:${profileTrackId}`,
      meta: { profileTrackId }
    });

    res.json({
      success: true,
      rating_type: ratingType,
      summary: summaryRes.rows[0] || null,
      ...getXpPayload(xpState)
    });
  } catch (err) {
    console.error("PROFILE TRACK RATE ERROR:", err);
    res.status(500).json({ error: "profile_track_rate_failed" });
  }
});

app.post("/api/tracks/from-profile", requireRole(["user", "judge", "admin"]), async (req, res) => {
  try {
    const queueStateRes = await pool.query(
      "SELECT value FROM system_settings WHERE key = 'queue_state'"
    );

    const state = queueStateRes.rows[0]?.value || "open";
    if (state !== "open") {
      return res.status(403).json({ error: "queue_not_open" });
    }

    const profileTrackId = Number(req.body?.profileTrackId);
    const userId = req.user.id;

    if (!profileTrackId) {
      return res.status(400).json({ error: "invalid_track_id" });
    }

    const trackRes = await pool.query(
      `
      SELECT id, user_id, title, artist, cover, audio, soundcloud
      FROM user_tracks
      WHERE id = $1
        AND user_id = $2
        AND COALESCE(is_archived, false) = false
      LIMIT 1
      `,
      [profileTrackId, userId]
    );

    if (!trackRes.rows.length) {
      return res.status(404).json({ error: "profile_track_not_found" });
    }

    const profileTrack = trackRes.rows[0];
    if (!profileTrack.audio && !profileTrack.soundcloud) {
      return res.status(400).json({ error: "audio_required" });
    }

    const duplicateRes = await pool.query(
      `
      SELECT id
      FROM tracks
      WHERE user_id = $1
        AND (
          ($2::text <> '' AND audio = $2)
          OR ($3::text <> '' AND soundcloud = $3)
          OR (
            LOWER(COALESCE(title, '')) = LOWER(COALESCE($4, ''))
            AND LOWER(COALESCE(artist, '')) = LOWER(COALESCE($5, ''))
          )
        )
      LIMIT 1
      `,
      [
        userId,
        String(profileTrack.audio || ""),
        String(profileTrack.soundcloud || ""),
        String(profileTrack.title || ""),
        String(profileTrack.artist || "")
      ]
    );

    if (duplicateRes.rows.length) {
      return res.status(409).json({ error: "queue_track_exists" });
    }

    const createdRes = await pool.query(
      `
      INSERT INTO tracks (artist, title, soundcloud, cover, audio, createdAt, user_id)
      VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      RETURNING *
      `,
      [
        profileTrack.artist || "",
        profileTrack.title || "Без названия",
        profileTrack.soundcloud || "",
        profileTrack.cover || null,
        profileTrack.audio || null,
        userId
      ]
    );

    res.status(201).json({
      success: true,
      track: createdRes.rows[0]
    });
  } catch (err) {
    console.error("QUEUE TRACK FROM PROFILE ERROR:", err);
    res.status(500).json({ error: "queue_track_from_profile_failed" });
  }
});

// ======================
// 🔥 QUEUE CONTROL (ADMIN)
// ======================

// получить состояние
app.get("/api/queue/state", async (req, res) => {
  const q = await pool.query(
    "SELECT value FROM system_settings WHERE key = 'queue_state'"
  );

  res.json({ state: q.rows[0]?.value || "open" });
});


// изменить состояние
app.post("/api/queue/state", requireRole(["admin"]), async (req, res) => {
  try {
    const { state } = req.body;

    if (!["open", "paused", "closed"].includes(state)) {
      return res.status(400).json({ error: "Invalid state" });
    }

    const currentStateRes = await pool.query(
      "SELECT value FROM system_settings WHERE key = 'queue_state'"
    );
    const currentState = currentStateRes.rows[0]?.value || "open";

    // При новом открытии после завершённого стрима очищаем только активную очередь:
    // сами queue-треки и все их queue-оценки/реакции. Snapshot главной не трогаем.
    if (state === "open" && currentState === "closed") {
      const trackIdsRes = await pool.query("SELECT id FROM tracks");
      const trackIds = trackIdsRes.rows
        .map((row) => Number(row.id || 0))
        .filter(Boolean);

      if (trackIds.length) {
        await pool.query(
          "DELETE FROM track_rating_details WHERE track_id = ANY($1::int[])",
          [trackIds]
        );
        await pool.query(
          "DELETE FROM track_ratings WHERE track_id = ANY($1::int[])",
          [trackIds]
        );
        await pool.query(
          `
          DELETE FROM track_actions
          WHERE track_id = ANY($1::int[])
            AND COALESCE(entity_type, 'profile') = 'queue'
          `,
          [trackIds]
        );
      }

      await pool.query("DELETE FROM tracks");
    }

    await pool.query(
      `
      INSERT INTO system_settings (key, value)
      VALUES ('queue_state', $1)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value
      `,
      [state]
    );

    await pool.query(
      `
      INSERT INTO system_settings (key, value)
      VALUES ('queue_state_changed_at', $1)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value
      `,
      [new Date().toISOString()]
    );

    if (state === "closed" && currentState !== "closed") {
      try {
        const snapshotSaved = await saveClosedQueueTopTracksSnapshot();
        if (!snapshotSaved) {
          console.warn("QUEUE CLOSE: snapshot was not saved because no judge-rated tracks were found");
        }
      } catch (snapshotErr) {
        console.error("QUEUE CLOSE SNAPSHOT ERROR:", snapshotErr);
      }
    }

    // Сохраняем именно предыдущее состояние, а не новое.
    await pool.query(
      `
      INSERT INTO system_settings (key, value)
      VALUES ('queue_prev_state', $1)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value
      `,
      [currentState]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("QUEUE STATE UPDATE ERROR:", err);
    res.status(500).json({ error: "queue_state_update_failed" });
  }
});


app.get("/api/rate/check/:trackId", async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) return res.json({ rated: false });

    const trackId = req.params.trackId;

    const result = await pool.query(
      `
      SELECT 1
      FROM track_ratings
      WHERE track_id = $1 AND user_id = $2
      `,
      [trackId, user.id]
    );

    res.json({ rated: result.rows.length > 0 });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "check_failed" });
  }
});

app.get("/api/rate/my/:trackId", async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    const { trackId } = req.params;

    const result = await pool.query(
      `SELECT rhymes, structure, style, charisma, vibe, memory
       FROM track_rating_details
       WHERE user_id = $1 
         AND track_id = $2 
         AND rating_type = 'judge'`,
      [userId, trackId]
    );

    if (!result.rows.length) {
      return res.json(null);
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});




app.post("/telegram-login", async (req, res) => {
  const { id, first_name, username, photo_url } = req.body;

  try {
    if (!verifyTelegramAuth(req.body)) {
      return res.status(401).json({ error: "Неверная подпись Telegram" });
    }

    const telegramId = String(id);

    // ищем пользователя
    let user = await pool.query(
      "SELECT * FROM users WHERE telegram_id = $1",
      [telegramId]
    );

    // 🟢 ЕСЛИ НОВЫЙ ПОЛЬЗОВАТЕЛЬ
    if (user.rows.length === 0) {

      // генерация уникального username_tag
      let baseTag = generateUsernameTag(username || first_name || "user");
      let username_tag = baseTag;
      let counter = 1;

      while (true) {
        const check = await pool.query(
          "SELECT id FROM users WHERE LOWER(username_tag) = LOWER($1)",
          [username_tag]
        );

        if (check.rows.length === 0) break;

        username_tag = baseTag + counter;
        counter++;
      }

      user = await pool.query(
        `
        INSERT INTO users (telegram_id, username, username_tag, avatar)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [
          telegramId,
          first_name || "user",
          username_tag,
          photo_url || "/images/default-avatar.jpg"
        ]
      );

    } else {
      // 🔵 УЖЕ СУЩЕСТВУЕТ → НИЧЕГО НЕ МЕНЯЕМ
      user = user;
    }

    // создаём токен
    const token = signAppToken(user.rows[0]);

    res.json({ token });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Telegram auth error" });
  }
});

app.get("/api/opens", async (req, res) => {
  try {
    const viewerId = getOptionalUserIdFromReq(req);
    const result = await pool.query(
      `
      SELECT
        ot.*,
        u.username,
        u.username_tag,
        u.avatar,
        COALESCE((
          SELECT COUNT(*)::int
          FROM open_track_candidates otc
          WHERE otc.open_track_id = ot.id
        ), 0) AS candidates_count,
        EXISTS(
          SELECT 1
          FROM open_track_candidates otc
          WHERE otc.open_track_id = ot.id
            AND otc.user_id = $1
        ) AS has_applied
      FROM open_tracks ot
      JOIN users u ON u.id = ot.user_id
      ORDER BY
        CASE WHEN ot.status = 'open' THEN 0 ELSE 1 END,
        ot.created_at DESC
      `,
      [viewerId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("OPENS LOAD ERROR:", err);
    res.status(500).json({ error: "opens_load_failed" });
  }
});

app.post("/api/opens", auth, openUploadFields, async (req, res) => {
  try {
    const userId = req.user.id;
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const genre = String(req.body?.genre || "").trim();
    const lookingFor = String(req.body?.looking_for || "").trim();
    const soundcloudUrl = String(req.body?.soundcloud_url || "").trim();

    if (!title) {
      return res.status(400).json({ error: "open_title_required" });
    }

    let audioUrl = "";
    const audioFile = req.files?.audio?.[0];

    if (audioFile) {
      const ext = path.extname(audioFile.originalname || "").toLowerCase() || ".mp3";
      const fileName = `open-audio-${Date.now()}${ext}`;
      const filePath = path.join(__dirname, "..", "public", "uploads", "opens", "audio", fileName);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, audioFile.buffer);
      audioUrl = `/uploads/opens/audio/${fileName}`;
    }

    const created = await pool.query(
      `
      INSERT INTO open_tracks (user_id, title, description, genre, looking_for, cover_url, audio_url, soundcloud_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [userId, title.slice(0, 160), description, genre, lookingFor, "", audioUrl, soundcloudUrl]
    );

    res.status(201).json(created.rows[0]);
  } catch (err) {
    console.error("OPEN CREATE ERROR:", err);
    res.status(500).json(buildPublicErrorPayload(err, "open_create_failed", "Не удалось опубликовать опен."));
  }
});

app.get("/api/opens/:id/candidates", auth, async (req, res) => {
  try {
    const openId = Number(req.params.id);
    const userId = req.user.id;

    const openRes = await pool.query(
      "SELECT id, user_id, selected_candidate_id FROM open_tracks WHERE id = $1 LIMIT 1",
      [openId]
    );

    if (!openRes.rows.length) {
      return res.status(404).json({ error: "open_not_found" });
    }

    const openTrack = openRes.rows[0];
    if (Number(openTrack.user_id) !== Number(userId)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const candidates = await pool.query(
      `
      SELECT
        otc.*,
        u.username,
        u.username_tag,
        u.avatar
      FROM open_track_candidates otc
      JOIN users u ON u.id = otc.user_id
      WHERE otc.open_track_id = $1
      ORDER BY
        CASE WHEN otc.status = 'selected' THEN 0 ELSE 1 END,
        otc.created_at ASC
      `,
      [openId]
    );

    res.json(candidates.rows);
  } catch (err) {
    console.error("OPEN CANDIDATES ERROR:", err);
    res.status(500).json({ error: "open_candidates_failed" });
  }
});

app.post("/api/opens/:id/apply", auth, async (req, res) => {
  try {
    const openId = Number(req.params.id);
    const userId = req.user.id;
    const message = String(req.body?.message || "").trim();

    const openRes = await pool.query(
      `
      SELECT ot.id, ot.user_id, ot.title, u.username, u.username_tag
      FROM open_tracks ot
      JOIN users u ON u.id = ot.user_id
      WHERE ot.id = $1
      LIMIT 1
      `,
      [openId]
    );

    if (!openRes.rows.length) {
      return res.status(404).json({ error: "open_not_found" });
    }

    const openTrack = openRes.rows[0];
    if (Number(openTrack.user_id) === Number(userId)) {
      return res.status(400).json({ error: "cannot_apply_to_own_open" });
    }

    const existing = await pool.query(
      "SELECT id FROM open_track_candidates WHERE open_track_id = $1 AND user_id = $2 LIMIT 1",
      [openId, userId]
    );

    if (existing.rows.length) {
      return res.status(400).json({ error: "open_application_exists" });
    }

    const created = await pool.query(
      `
      INSERT INTO open_track_candidates (open_track_id, user_id, message)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [openId, userId, message]
    );

    const actorRes = await pool.query(
      "SELECT username, username_tag FROM users WHERE id = $1 LIMIT 1",
      [userId]
    );
    const actor = actorRes.rows[0] || {};

    await createNotification({
      userId: openTrack.user_id,
      actorId: userId,
      type: "open_candidate",
      entityType: "open_track",
      entityId: openId,
      text: `${actor.username || actor.username_tag || "Пользователь"} подал заявку на твой опен`,
      metadata: {
        openTrackId: openId,
        candidateId: userId
      }
    });

    res.status(201).json(created.rows[0]);
  } catch (err) {
    console.error("OPEN APPLY ERROR:", err);
    res.status(500).json({ error: "open_apply_failed" });
  }
});

app.post("/api/opens/:id/select-candidate", auth, async (req, res) => {
  try {
    const openId = Number(req.params.id);
    const userId = req.user.id;
    const candidateUserId = Number(req.body?.candidateUserId);

    const openRes = await pool.query(
      "SELECT id, user_id, title FROM open_tracks WHERE id = $1 LIMIT 1",
      [openId]
    );

    if (!openRes.rows.length) {
      return res.status(404).json({ error: "open_not_found" });
    }

    const openTrack = openRes.rows[0];
    if (Number(openTrack.user_id) !== Number(userId)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const candidateRes = await pool.query(
      `
      SELECT otc.id, otc.user_id, u.username, u.username_tag
      FROM open_track_candidates otc
      JOIN users u ON u.id = otc.user_id
      WHERE otc.open_track_id = $1 AND otc.user_id = $2
      LIMIT 1
      `,
      [openId, candidateUserId]
    );

    if (!candidateRes.rows.length) {
      return res.status(404).json({ error: "candidate_not_found" });
    }

    await pool.query(
      "UPDATE open_track_candidates SET status = 'rejected' WHERE open_track_id = $1",
      [openId]
    );

    await pool.query(
      "UPDATE open_track_candidates SET status = 'selected' WHERE open_track_id = $1 AND user_id = $2",
      [openId, candidateUserId]
    );

    await pool.query(
      "UPDATE open_tracks SET status = 'matched', selected_candidate_id = $2, updated_at = now() WHERE id = $1",
      [openId, candidateUserId]
    );

    const candidate = candidateRes.rows[0];

      await createNotification({
        userId: candidateUserId,
        actorId: userId,
      type: "open_selected",
      entityType: "open_track",
      entityId: openId,
      text: `Тебя выбрали на фит для опена "${openTrack.title}"`,
      metadata: {
        openTrackId: openId,
        ownerId: userId
      }
      });

      const conversation = await getOrCreateDirectConversation(userId, candidateUserId);

      await pool.query("DELETE FROM open_track_candidates WHERE open_track_id = $1", [openId]);
      await pool.query("DELETE FROM open_tracks WHERE id = $1", [openId]);

      res.json({
        success: true,
        conversationId: conversation.id,
        candidate
    });
  } catch (err) {
      console.error("OPEN SELECT ERROR:", err);
      res.status(500).json({ error: "open_select_failed" });
    }
  });

app.delete("/api/opens/:id", auth, async (req, res) => {
  try {
    const openId = Number(req.params.id);
    const userId = req.user.id;

    const openRes = await pool.query(
      "SELECT id, user_id, cover_url, audio_url FROM open_tracks WHERE id = $1 LIMIT 1",
      [openId]
    );

    if (!openRes.rows.length) {
      return res.status(404).json({ error: "open_not_found" });
    }

    const openTrack = openRes.rows[0];
    if (Number(openTrack.user_id) !== Number(userId)) {
      return res.status(403).json({ error: "forbidden" });
    }

    await pool.query("DELETE FROM open_track_candidates WHERE open_track_id = $1", [openId]);
    await pool.query("DELETE FROM open_tracks WHERE id = $1", [openId]);

    const maybeDeleteFile = (publicUrl) => {
      if (!publicUrl || !publicUrl.startsWith("/uploads/")) return;
      const relativePath = publicUrl.replace(/^\//, "");
      const filePath = path.join(__dirname, "..", "public", relativePath.replace(/^uploads[\\/]/, "uploads" + path.sep));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    };

    maybeDeleteFile(openTrack.cover_url);
    maybeDeleteFile(openTrack.audio_url);

    res.json({ success: true });
  } catch (err) {
    console.error("OPEN DELETE ERROR:", err);
    res.status(500).json({ error: "open_delete_failed" });
  }
});

app.get("/api/notifications", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `
      SELECT
        n.*,
        u.username AS actor_username,
        u.username_tag AS actor_username_tag,
        u.avatar AS actor_avatar
      FROM notifications n
      LEFT JOIN users u ON u.id = n.actor_id
      WHERE n.user_id = $1
        AND n.type != 'dm'
      ORDER BY n.created_at DESC
      LIMIT 40
      `,
      [userId]
    );

    const unreadRes = await pool.query(
      "SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false AND type != 'dm'",
      [userId]
    );

    res.json({
      items: result.rows,
      unreadCount: Number(unreadRes.rows[0]?.count || 0)
    });
  } catch (err) {
    console.error("NOTIFICATIONS LOAD ERROR:", err);
    res.status(500).json({ error: "notifications_load_failed" });
  }
});

app.post("/api/notifications/read-all", auth, async (req, res) => {
  try {
    await pool.query(
      "UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false",
      [req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("NOTIFICATIONS READ ALL ERROR:", err);
    res.status(500).json({ error: "notifications_read_all_failed" });
  }
});

app.post("/api/notifications/:id/read", auth, async (req, res) => {
  try {
    await pool.query(
      "UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2",
      [Number(req.params.id), req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("NOTIFICATION READ ERROR:", err);
    res.status(500).json({ error: "notification_read_failed" });
  }
});

app.get("/api/messages/conversations", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `
      SELECT
        dc.id,
        dc.conversation_type,
        dc.title,
        dc.avatar,
        dc.last_message_at,
        dcm_self.is_pinned,
        dcm_self.pinned_order,
        peer.id AS peer_id,
        CASE
          WHEN dc.conversation_type = 'direct' THEN peer.username
          ELSE COALESCE(dc.title, 'Новый чат')
        END AS peer_username,
        CASE
          WHEN dc.conversation_type = 'direct' THEN peer.username_tag
          ELSE NULL
        END AS peer_username_tag,
        CASE
          WHEN dc.conversation_type = 'direct' THEN peer.avatar
          ELSE dc.avatar
        END AS peer_avatar,
        COALESCE(pref.is_muted, false) AS peer_muted,
        COALESCE(pref.is_blocked, false) AS peer_blocked,
        last_message.text AS last_message_text,
        last_message.created_at AS last_message_created_at,
        COALESCE(unread.unread_count, 0)::int AS unread_count
      FROM direct_conversations dc
      JOIN direct_conversation_members dcm_self
        ON dcm_self.conversation_id = dc.id
       AND dcm_self.user_id = $1
      LEFT JOIN LATERAL (
        SELECT dcm_peer.user_id AS peer_id
        FROM direct_conversation_members dcm_peer
        WHERE dcm_peer.conversation_id = dc.id
          AND dcm_peer.user_id != $1
        ORDER BY dcm_peer.joined_at ASC
        LIMIT 1
      ) AS peer_pick ON true
      LEFT JOIN users peer
        ON peer.id = CASE
          WHEN dc.conversation_type = 'direct' THEN COALESCE(peer_pick.peer_id, CASE
            WHEN dc.user_one_id = $1 THEN dc.user_two_id
            ELSE dc.user_one_id
          END)
          ELSE NULL
        END
      LEFT JOIN direct_message_preferences pref
        ON pref.user_id = $1
       AND pref.target_user_id = peer.id
       AND dc.conversation_type = 'direct'
      LEFT JOIN LATERAL (
        SELECT dm.text, dm.created_at
        FROM direct_messages dm
        WHERE dm.conversation_id = dc.id
        ORDER BY dm.created_at DESC
        LIMIT 1
      ) AS last_message ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS unread_count
        FROM direct_messages dm
        WHERE dm.conversation_id = dc.id
          AND dm.sender_id != $1
          AND dm.created_at > COALESCE(dcm_self.last_read_at, 'epoch'::timestamp)
      ) AS unread ON true
      ORDER BY
        COALESCE(dcm_self.is_pinned, false) DESC,
        COALESCE(dcm_self.pinned_order, 999999) ASC,
        COALESCE(dc.last_message_at, dc.created_at) DESC
      `
      ,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("CONVERSATIONS LOAD ERROR:", err);
    res.status(500).json({ error: "conversations_load_failed" });
  }
});

app.get("/api/messages/unread-summary", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `
      SELECT
        COUNT(*)::int AS unread_conversations,
        COALESCE(SUM(unread.unread_count), 0)::int AS unread_messages
      FROM (
        SELECT
          dc.id,
          COUNT(dm.id)::int AS unread_count
        FROM direct_conversations dc
        JOIN direct_conversation_members dcm_self
          ON dcm_self.conversation_id = dc.id
         AND dcm_self.user_id = $1
        LEFT JOIN direct_messages dm
          ON dm.conversation_id = dc.id
         AND dm.sender_id != $1
         AND dm.created_at > COALESCE(dcm_self.last_read_at, 'epoch'::timestamp)
        GROUP BY dc.id
      ) AS unread
      WHERE unread.unread_count > 0
      `,
      [userId]
    );

    res.json(result.rows[0] || { unread_conversations: 0, unread_messages: 0 });
  } catch (err) {
    console.error("MESSAGES UNREAD SUMMARY ERROR:", err);
    res.status(500).json({ error: "messages_unread_summary_failed" });
  }
});

app.post("/api/messages/start", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const targetId = Number(req.body?.targetId);

    if (!targetId || targetId === Number(userId)) {
      return res.status(400).json({ error: "invalid_target" });
    }

    const userRes = await pool.query(
      "SELECT id, username, username_tag, avatar, COALESCE(dms_enabled, true) AS dms_enabled FROM users WHERE id = $1 LIMIT 1",
      [targetId]
    );

    if (!userRes.rows.length) {
      return res.status(404).json({ error: "target_not_found" });
    }

    if (userRes.rows[0].dms_enabled === false) {
      return res.status(403).json({ error: "target_messages_disabled" });
    }

    const targetPref = await getDirectMessagePreference(targetId, userId);
    if (targetPref.is_blocked) {
      return res.status(403).json({ error: "blocked_by_target" });
    }

    const ownPref = await getDirectMessagePreference(userId, targetId);
    if (ownPref.is_blocked) {
      return res.status(403).json({ error: "messages_blocked_for_target" });
    }

    const conversation = await getOrCreateDirectConversation(userId, targetId);
    res.json({
      conversationId: conversation.id,
      peer: userRes.rows[0]
    });
  } catch (err) {
    console.error("MESSAGE START ERROR:", err);
    res.status(500).json({ error: "message_start_failed" });
  }
});

app.post("/api/messages/conversations/create", auth, avatarUploadSingle, async (req, res) => {
  try {
    const ownerId = req.user.id;
    const type = "group";
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();

    if (title.length < 2) {
      return res.status(400).json({ error: "conversation_title_required" });
    }

    const created = await pool.query(
      `
      INSERT INTO direct_conversations (user_one_id, user_two_id, conversation_type, title, description, owner_id)
      VALUES ($1, $1, $2, $3, $4, $1)
      RETURNING *
      `,
      [ownerId, type, title, description || null]
    );

    const conversation = created.rows[0];
    await ensureConversationMembers(conversation.id, [ownerId], ownerId);

    if (req.file) {
      const avatarUrl = await saveConversationAvatar(req.file, conversation.id);
      if (avatarUrl) {
        await pool.query(
          "UPDATE direct_conversations SET avatar = $2 WHERE id = $1",
          [conversation.id, avatarUrl]
        );
      }
    }

    res.status(201).json({ conversationId: conversation.id });
  } catch (err) {
    console.error("CONVERSATION CREATE ERROR:", err);
    if (err.message === "invalid_conversation_avatar") {
      return res.status(400).json(buildPublicErrorPayload(err, "invalid_conversation_avatar"));
    }
    res.status(500).json(buildPublicErrorPayload(err, "conversation_create_failed", "Не удалось создать группу."));
  }
});

app.get("/api/messages/invites", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        dci.id,
        dci.conversation_id,
        dci.created_at,
        dc.title,
        dc.avatar,
        inviter.username AS inviter_username,
        inviter.username_tag AS inviter_tag,
        inviter.avatar AS inviter_avatar
      FROM direct_conversation_invites dci
      JOIN direct_conversations dc ON dc.id = dci.conversation_id
      JOIN users inviter ON inviter.id = dci.inviter_id
      WHERE dci.invited_user_id = $1
        AND dci.status = 'pending'
      ORDER BY dci.created_at DESC
      `,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("MESSAGE INVITES LOAD ERROR:", err);
    res.status(500).json({ error: "message_invites_load_failed" });
  }
});

app.post("/api/messages/conversations/:id/invite", auth, async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    const userId = req.user.id;
    const rawTag = String(req.body?.usernameTag || "").trim();
    const usernameTag = rawTag.replace(/^@+/, "");
    const conversation = await getConversationForUser(conversationId, userId);

    if (!conversation) {
      return res.status(404).json({ error: "conversation_not_found" });
    }

    if (String(conversation.conversation_type || "") !== "group") {
      return res.status(400).json({ error: "invite_not_allowed" });
    }

    if (Number(conversation.owner_id) !== Number(userId)) {
      return res.status(403).json({ error: "invite_forbidden" });
    }

    const invitedUserRes = await pool.query(
      `
      SELECT id
      FROM users
      WHERE LOWER(username_tag) = LOWER($1)
      LIMIT 1
      `,
      [usernameTag]
    );

    if (!invitedUserRes.rows.length) {
      return res.status(404).json({ error: "invite_user_not_found" });
    }

    const invitedUserId = Number(invitedUserRes.rows[0].id);
    if (invitedUserId === Number(userId)) {
      return res.status(400).json({ error: "invite_self_not_allowed" });
    }

    const memberCheck = await pool.query(
      `
      SELECT 1
      FROM direct_conversation_members
      WHERE conversation_id = $1
        AND user_id = $2
      LIMIT 1
      `,
      [conversationId, invitedUserId]
    );

    if (memberCheck.rows.length) {
      return res.status(400).json({ error: "invite_user_already_member" });
    }

    const existingInvite = await pool.query(
      `
      SELECT id, status
      FROM direct_conversation_invites
      WHERE conversation_id = $1
        AND invited_user_id = $2
      LIMIT 1
      `,
      [conversationId, invitedUserId]
    );

    if (existingInvite.rows.length && existingInvite.rows[0].status === "pending") {
      return res.status(400).json({ error: "invite_already_pending" });
    }

    await pool.query(
      `
      INSERT INTO direct_conversation_invites (conversation_id, inviter_id, invited_user_id, status, responded_at)
      VALUES ($1, $2, $3, 'pending', NULL)
      ON CONFLICT (conversation_id, invited_user_id)
      DO UPDATE SET
        inviter_id = EXCLUDED.inviter_id,
        status = 'pending',
        responded_at = NULL,
        created_at = now()
      `,
      [conversationId, userId, invitedUserId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("GROUP INVITE ERROR:", err);
    res.status(500).json({ error: "group_invite_failed" });
  }
});

app.post("/api/messages/invites/:id/respond", auth, async (req, res) => {
  try {
    const inviteId = Number(req.params.id);
    const userId = req.user.id;
    const action = String(req.body?.action || "").trim().toLowerCase();

    if (!["accept", "decline"].includes(action)) {
      return res.status(400).json({ error: "invalid_invite_action" });
    }

    const inviteRes = await pool.query(
      `
      SELECT dci.*, dc.conversation_type
      FROM direct_conversation_invites dci
      JOIN direct_conversations dc ON dc.id = dci.conversation_id
      WHERE dci.id = $1
        AND dci.invited_user_id = $2
        AND dci.status = 'pending'
      LIMIT 1
      `,
      [inviteId, userId]
    );

    if (!inviteRes.rows.length) {
      return res.status(404).json({ error: "invite_not_found" });
    }

    const invite = inviteRes.rows[0];

    await pool.query(
      `
      UPDATE direct_conversation_invites
      SET status = $2,
          responded_at = now()
      WHERE id = $1
      `,
      [inviteId, action === "accept" ? "accepted" : "declined"]
    );

    if (action === "accept") {
      await ensureConversationMembers(invite.conversation_id, [userId], invite.inviter_id);
      return res.json({ success: true, conversationId: invite.conversation_id });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("GROUP INVITE RESPOND ERROR:", err);
    res.status(500).json({ error: "group_invite_respond_failed" });
  }
});

app.post("/api/messages/conversations/:id/pin", auth, async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    const userId = req.user.id;
    const pinned = req.body?.pinned === true;
    const conversation = await getConversationForUser(conversationId, userId);

    if (!conversation) {
      return res.status(404).json({ error: "conversation_not_found" });
    }

    if (pinned) {
      const pinnedRes = await pool.query(
        `
        SELECT COUNT(*)::int AS count
        FROM direct_conversation_members
        WHERE user_id = $1
          AND is_pinned = true
          AND conversation_id != $2
        `,
        [userId, conversationId]
      );

      if (Number(pinnedRes.rows[0]?.count || 0) >= 5) {
        return res.status(400).json({ error: "pin_limit_reached" });
      }

      const maxOrderRes = await pool.query(
        `
        SELECT COALESCE(MAX(pinned_order), 0)::int AS max_order
        FROM direct_conversation_members
        WHERE user_id = $1
          AND is_pinned = true
        `,
        [userId]
      );

      const nextOrder = Number(maxOrderRes.rows[0]?.max_order || 0) + 1;
      await pool.query(
        `
        UPDATE direct_conversation_members
        SET is_pinned = true,
            pinned_order = $3
        WHERE conversation_id = $1
          AND user_id = $2
        `,
        [conversationId, userId, nextOrder]
      );
    } else {
      await pool.query(
        `
        UPDATE direct_conversation_members
        SET is_pinned = false,
            pinned_order = NULL
        WHERE conversation_id = $1
          AND user_id = $2
        `,
        [conversationId, userId]
      );
    }

    res.json({ success: true, pinned });
  } catch (err) {
    console.error("CONVERSATION PIN ERROR:", err);
    res.status(500).json({ error: "conversation_pin_failed" });
  }
});

app.get("/api/messages/conversations/:id/details", auth, async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    const userId = req.user.id;
    const conversation = await getConversationForUser(conversationId, userId);

    if (!conversation) {
      return res.status(404).json({ error: "conversation_not_found" });
    }

    const detailsRes = await pool.query(
      `
      SELECT
        dc.id,
        dc.conversation_type,
        dc.title,
        dc.description,
        dc.avatar,
        dc.owner_id,
        dc.created_at,
        COUNT(dcm.id)::int AS members_count,
        COALESCE((
          SELECT COUNT(*)::int
          FROM direct_messages dm
          WHERE dm.conversation_id = dc.id
        ), 0) AS messages_count
        ,
        COALESCE((
          SELECT COUNT(*)::int
          FROM direct_messages dm
          WHERE dm.conversation_id = dc.id
            AND dm.attachment_type LIKE 'image/%'
        ), 0) AS photos_count,
        COALESCE((
          SELECT COUNT(*)::int
          FROM direct_messages dm
          WHERE dm.conversation_id = dc.id
            AND dm.attachment_type LIKE 'video/%'
        ), 0) AS videos_count,
        COALESCE((
          SELECT COUNT(*)::int
          FROM direct_messages dm
          WHERE dm.conversation_id = dc.id
            AND dm.attachment_type LIKE 'audio/%'
        ), 0) AS audio_count,
        COALESCE((
          SELECT COUNT(*)::int
          FROM direct_messages dm
          WHERE dm.conversation_id = dc.id
            AND dm.attachment_url IS NOT NULL
            AND (
              dm.attachment_type IS NULL
              OR (
                dm.attachment_type NOT LIKE 'image/%'
                AND dm.attachment_type NOT LIKE 'video/%'
                AND dm.attachment_type NOT LIKE 'audio/%'
              )
            )
        ), 0) AS files_count,
        COALESCE((
          SELECT COUNT(*)::int
          FROM direct_messages dm
          WHERE dm.conversation_id = dc.id
            AND dm.text ~* '(https?://|www\\.)'
        ), 0) AS links_count
      FROM direct_conversations dc
      LEFT JOIN direct_conversation_members dcm
        ON dcm.conversation_id = dc.id
      WHERE dc.id = $1
      GROUP BY dc.id
      LIMIT 1
      `,
      [conversationId]
    );

    const details = detailsRes.rows[0];
    if (!details) {
      return res.status(404).json({ error: "conversation_not_found" });
    }

    res.json({
      ...details,
      is_owner: Number(details.owner_id) === Number(userId)
    });
  } catch (err) {
    console.error("CONVERSATION DETAILS ERROR:", err);
    res.status(500).json({ error: "conversation_details_failed" });
  }
});

app.get("/api/messages/conversations/:id/members", auth, async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    const userId = req.user.id;
    const conversation = await getConversationForUser(conversationId, userId);

    if (!conversation) {
      return res.status(404).json({ error: "conversation_not_found" });
    }

    const membersRes = await pool.query(
      `
      SELECT
        u.id,
        u.username,
        u.username_tag,
        u.avatar,
        dcm.role,
        dcm.joined_at
      FROM direct_conversation_members dcm
      JOIN users u
        ON u.id = dcm.user_id
      WHERE dcm.conversation_id = $1
      ORDER BY
        CASE WHEN dcm.role = 'owner' THEN 0 ELSE 1 END,
        LOWER(COALESCE(u.username, u.username_tag, '')) ASC,
        dcm.joined_at ASC
      `,
      [conversationId]
    );

    res.json({
      items: membersRes.rows
    });
  } catch (err) {
    console.error("CONVERSATION MEMBERS ERROR:", err);
    res.status(500).json({ error: "conversation_members_failed" });
  }
});

app.get("/api/messages/conversations/:id/media", auth, async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    const userId = req.user.id;
    const type = String(req.query.type || "").trim().toLowerCase();
    const conversation = await getConversationForUser(conversationId, userId);

    if (!conversation) {
      return res.status(404).json({ error: "conversation_not_found" });
    }

    const baseQuery = `
      SELECT
        dm.id,
        dm.text,
        dm.attachment_url,
        dm.attachment_type,
        dm.attachment_name,
        dm.created_at,
        u.username,
        u.username_tag,
        u.avatar
      FROM direct_messages dm
      JOIN users u ON u.id = dm.sender_id
      WHERE dm.conversation_id = $1
    `;

    let filter = "";
    if (type === "photos") {
      filter = " AND dm.attachment_type LIKE 'image/%'";
    } else if (type === "videos") {
      filter = " AND dm.attachment_type LIKE 'video/%'";
    } else if (type === "audio") {
      filter = " AND dm.attachment_type LIKE 'audio/%'";
    } else if (type === "files") {
      filter = `
        AND dm.attachment_url IS NOT NULL
        AND (
          dm.attachment_type IS NULL
          OR (
            dm.attachment_type NOT LIKE 'image/%'
            AND dm.attachment_type NOT LIKE 'video/%'
            AND dm.attachment_type NOT LIKE 'audio/%'
          )
        )
      `;
    } else if (type === "links") {
      filter = " AND dm.text ~* '(https?://|www\\\\.)'";
    } else {
      return res.status(400).json({ error: "invalid_media_type" });
    }

    const result = await pool.query(
      `${baseQuery} ${filter} ORDER BY dm.created_at DESC`,
      [conversationId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("CONVERSATION MEDIA LIST ERROR:", err);
    res.status(500).json({ error: "conversation_media_list_failed" });
  }
});

app.post("/api/messages/conversations/:id/leave", auth, async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    const userId = req.user.id;
    const conversation = await getConversationForUser(conversationId, userId);

    if (!conversation) {
      return res.status(404).json({ error: "conversation_not_found" });
    }

    if (!["group"].includes(String(conversation.conversation_type || ""))) {
      return res.status(400).json({ error: "conversation_leave_not_allowed" });
    }

    if (Number(conversation.owner_id) === Number(userId)) {
      return res.status(400).json({ error: "conversation_owner_cannot_leave" });
    }

    await pool.query(
      "DELETE FROM direct_conversation_members WHERE conversation_id = $1 AND user_id = $2",
      [conversationId, userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("CONVERSATION LEAVE ERROR:", err);
    res.status(500).json(buildPublicErrorPayload(err, "conversation_leave_failed", "Не удалось выйти из группы."));
  }
});

app.patch("/api/messages/conversations/:id", auth, avatarUploadSingle, async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    const userId = req.user.id;
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const conversation = await getConversationForUser(conversationId, userId);

    if (!conversation) {
      return res.status(404).json({ error: "conversation_not_found" });
    }

    if (!["group"].includes(String(conversation.conversation_type || ""))) {
      return res.status(400).json({ error: "conversation_edit_not_allowed" });
    }

    if (Number(conversation.owner_id) !== Number(userId)) {
      return res.status(403).json({ error: "conversation_edit_forbidden" });
    }

    if (title.length < 2) {
      return res.status(400).json({ error: "conversation_title_required" });
    }

    await pool.query(
      `
      UPDATE direct_conversations
      SET title = $2,
          description = $3
      WHERE id = $1
      `,
      [conversationId, title, description || null]
    );

    if (req.file) {
      const avatarUrl = await saveConversationAvatar(req.file, conversationId);
      if (avatarUrl) {
        await pool.query(
          "UPDATE direct_conversations SET avatar = $2 WHERE id = $1",
          [conversationId, avatarUrl]
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("CONVERSATION UPDATE ERROR:", err);
    if (err.message === "invalid_conversation_avatar") {
      return res.status(400).json(buildPublicErrorPayload(err, "invalid_conversation_avatar"));
    }
    res.status(500).json(buildPublicErrorPayload(err, "conversation_update_failed", "Не удалось сохранить изменения группы."));
  }
});

app.delete("/api/messages/conversations/:id", auth, async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    const userId = req.user.id;
    const conversation = await getConversationForUser(conversationId, userId);

    if (!conversation) {
      return res.status(404).json({ error: "conversation_not_found" });
    }

    if (!["group"].includes(String(conversation.conversation_type || ""))) {
      return res.status(400).json({ error: "conversation_delete_not_allowed" });
    }

    if (Number(conversation.owner_id) !== Number(userId)) {
      return res.status(403).json({ error: "conversation_delete_forbidden" });
    }

    await pool.query("DELETE FROM direct_conversations WHERE id = $1", [conversationId]);
    res.json({ success: true });
  } catch (err) {
    console.error("CONVERSATION DELETE ERROR:", err);
    res.status(500).json({ error: "conversation_delete_failed" });
  }
});

app.get("/api/messages/conversations/:id", auth, async (req, res) => {
    try {
      const conversationId = Number(req.params.id);
    const userId = req.user.id;
    const conversation = await getConversationForUser(conversationId, userId);

    if (!conversation) {
      return res.status(404).json({ error: "conversation_not_found" });
    }

      const messages = await pool.query(
        `
        SELECT
          dm.*,
          u.username,
          u.username_tag,
          u.avatar,
          reply_dm.text AS reply_text,
          reply_user.username AS reply_sender_username,
          reply_user.username_tag AS reply_sender_tag,
          forwarded_dm.text AS forwarded_text,
          forwarded_user.username AS forwarded_sender_username,
          forwarded_user.username_tag AS forwarded_sender_tag,
          COALESCE((
            SELECT json_agg(reaction_row ORDER BY reaction_row.count DESC, reaction_row.emoji ASC)
            FROM (
              SELECT
                dmr.message_id,
                dmr.emoji,
                COUNT(*)::int AS count
              FROM direct_message_reactions dmr
              WHERE dmr.message_id = dm.id
              GROUP BY dmr.message_id, dmr.emoji
            ) AS reaction_row
          ), '[]'::json) AS reactions
        FROM direct_messages dm
        JOIN users u ON u.id = dm.sender_id
        LEFT JOIN direct_messages reply_dm ON reply_dm.id = dm.reply_to_message_id
        LEFT JOIN users reply_user ON reply_user.id = reply_dm.sender_id
        LEFT JOIN direct_messages forwarded_dm ON forwarded_dm.id = dm.forwarded_from_message_id
        LEFT JOIN users forwarded_user ON forwarded_user.id = forwarded_dm.sender_id
        WHERE dm.conversation_id = $1
        ORDER BY dm.created_at ASC
        `,
        [conversationId]
    );

    await pool.query(
      `
      UPDATE direct_messages
      SET is_read = true
      WHERE conversation_id = $1
        AND sender_id != $2
        AND is_read = false
      `,
      [conversationId, userId]
    );

    await pool.query(
      `
      UPDATE direct_conversation_members
      SET last_read_at = now()
      WHERE conversation_id = $1
        AND user_id = $2
      `,
      [conversationId, userId]
    );

    res.json(messages.rows);
  } catch (err) {
    console.error("MESSAGES LOAD ERROR:", err);
    res.status(500).json({ error: "messages_load_failed" });
  }
});

app.post("/api/messages/conversations/:id", auth, messageAttachmentUpload, async (req, res) => {
    try {
      const conversationId = Number(req.params.id);
      const userId = req.user.id;
      const text = String(req.body?.text || "").trim();
      const replyToMessageId = Number(req.body?.replyToMessageId || 0) || null;
      const forwardedMessageId = Number(req.body?.forwardedMessageId || 0) || null;
      const attachment = req.file || null;

      if (!text && !forwardedMessageId && !attachment) {
        return res.status(400).json({ error: "message_text_required" });
      }

    const conversation = await getConversationForUser(conversationId, userId);
      if (!conversation) {
        return res.status(404).json({ error: "conversation_not_found" });
      }

      let recipientId = null;
      if (conversation.conversation_type === "direct") {
        recipientId =
          Number(conversation.user_one_id) === Number(userId)
            ? Number(conversation.user_two_id)
            : Number(conversation.user_one_id);

        const recipientSettings = await getUserMessageSettings(recipientId);
        if (recipientSettings.dms_enabled === false) {
          return res.status(403).json({ error: "target_messages_disabled" });
        }

        const targetPref = await getDirectMessagePreference(recipientId, userId);
        if (targetPref.is_blocked) {
          return res.status(403).json({ error: "blocked_by_target" });
        }

        const ownPref = await getDirectMessagePreference(userId, recipientId);
        if (ownPref.is_blocked) {
          return res.status(403).json({ error: "messages_blocked_for_target" });
        }
      }

      if (replyToMessageId) {
        const replyCheck = await pool.query(
          "SELECT id FROM direct_messages WHERE id = $1 AND conversation_id = $2 LIMIT 1",
          [replyToMessageId, conversationId]
        );
        if (!replyCheck.rows.length) {
          return res.status(400).json({ error: "invalid_reply_message" });
        }
      }

      if (forwardedMessageId) {
        const forwardCheck = await pool.query(
          "SELECT id, text FROM direct_messages WHERE id = $1 LIMIT 1",
          [forwardedMessageId]
        );
        if (!forwardCheck.rows.length) {
          return res.status(400).json({ error: "invalid_forwarded_message" });
        }
      }

      const finalText = text || "";
      let attachmentUrl = null;
      let attachmentType = null;
      let attachmentName = null;

      if (attachment) {
        const safeOriginalName = String(attachment.originalname || "attachment").replace(/[^\w.\-() ]+/g, "_");
        const fileName = `msg-${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${safeOriginalName}`;
        const filePath = path.join(__dirname, "..", "public", "uploads", "messages", fileName);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, attachment.buffer);
        attachmentUrl = `/uploads/messages/${fileName}`;
        attachmentType = attachment.mimetype || "application/octet-stream";
        attachmentName = safeOriginalName;
      }

      const created = await pool.query(
        `
        INSERT INTO direct_messages (
          conversation_id,
          sender_id,
          text,
          attachment_url,
          attachment_type,
          attachment_name,
          reply_to_message_id,
          forwarded_from_message_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        `,
        [conversationId, userId, finalText, attachmentUrl, attachmentType, attachmentName, replyToMessageId, forwardedMessageId]
      );

    await pool.query(
      "UPDATE direct_conversations SET last_message_at = now() WHERE id = $1",
      [conversationId]
    );

    if (recipientId) {
      await createNotification({
        userId: recipientId,
        actorId: userId,
        type: "dm",
        entityType: "conversation",
        entityId: conversationId,
        text: "Новое личное сообщение",
        metadata: { conversationId }
      });
    }

      res.status(201).json(created.rows[0]);
  } catch (err) {
    console.error("MESSAGE SEND ERROR:", err);
    res.status(500).json(buildPublicErrorPayload(err, "message_send_failed", "Не удалось отправить сообщение."));
  }
});

app.post("/api/messages/:id/react", auth, async (req, res) => {
    try {
      const messageId = Number(req.params.id);
      const userId = req.user.id;
      const emoji = String(req.body?.emoji || "").trim();

      if (!messageId || !emoji) {
        return res.status(400).json({ error: "invalid_reaction" });
      }

      const messageRes = await pool.query(
        `
        SELECT dm.id, dm.conversation_id
        FROM direct_messages dm
        JOIN direct_conversation_members dcm ON dcm.conversation_id = dm.conversation_id
        WHERE dm.id = $1
          AND dcm.user_id = $2
        LIMIT 1
        `,
        [messageId, userId]
      );

      if (!messageRes.rows.length) {
        return res.status(404).json({ error: "message_not_found" });
      }

      const existing = await pool.query(
        "SELECT id FROM direct_message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3 LIMIT 1",
        [messageId, userId, emoji]
      );

      if (existing.rows.length) {
        await pool.query(
          "DELETE FROM direct_message_reactions WHERE id = $1",
          [existing.rows[0].id]
        );
      } else {
        await pool.query(
          "INSERT INTO direct_message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)",
          [messageId, userId, emoji]
        );
      }

      res.json({ success: true });
    } catch (err) {
      console.error("MESSAGE REACTION ERROR:", err);
      res.status(500).json({ error: "message_reaction_failed" });
    }
  });

app.delete("/api/messages/:id", auth, async (req, res) => {
  try {
    const messageId = Number(req.params.id);
    const userId = req.user.id;

    if (!messageId) {
      return res.status(400).json({ error: "invalid_message_id" });
    }

    const messageRes = await pool.query(
      `
      SELECT dm.id, dm.sender_id, dm.conversation_id
      FROM direct_messages dm
      JOIN direct_conversation_members dcm ON dcm.conversation_id = dm.conversation_id
      WHERE dm.id = $1
        AND dcm.user_id = $2
      LIMIT 1
      `,
      [messageId, userId]
    );

    if (!messageRes.rows.length) {
      return res.status(404).json({ error: "message_not_found" });
    }

    const message = messageRes.rows[0];
    if (Number(message.sender_id) !== Number(userId)) {
      return res.status(403).json({ error: "message_delete_forbidden" });
    }

    await pool.query("DELETE FROM direct_messages WHERE id = $1", [messageId]);

    await pool.query(
      `
      UPDATE direct_conversations dc
      SET last_message_at = COALESCE((
        SELECT dm.created_at
        FROM direct_messages dm
        WHERE dm.conversation_id = dc.id
        ORDER BY dm.created_at DESC
        LIMIT 1
      ), dc.created_at)
      WHERE dc.id = $1
      `,
      [message.conversation_id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("MESSAGE DELETE ERROR:", err);
    res.status(500).json({ error: "message_delete_failed" });
  }
});

app.get("/api/settings/communication", auth, async (req, res) => {
  try {
    const settings = await getUserMessageSettings(req.user.id);
    res.json(settings);
  } catch (err) {
    console.error("COMMUNICATION SETTINGS LOAD ERROR:", err);
    res.status(500).json({ error: "communication_settings_load_failed" });
  }
});

app.post("/api/settings/communication", auth, async (req, res) => {
  try {
    const notificationsEnabled = req.body?.notificationsEnabled !== false;
    const dmsEnabled = req.body?.dmsEnabled !== false;

    await pool.query(
      `
      UPDATE users
      SET notifications_enabled = $1,
          dms_enabled = $2
      WHERE id = $3
      `,
      [notificationsEnabled, dmsEnabled, req.user.id]
    );

    res.json({ success: true, notificationsEnabled, dmsEnabled });
  } catch (err) {
    console.error("COMMUNICATION SETTINGS SAVE ERROR:", err);
    res.status(500).json({ error: "communication_settings_save_failed" });
  }
});

app.post("/api/messages/conversations/:id/preferences", auth, async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    const userId = req.user.id;
    const conversation = await getConversationForUser(conversationId, userId);

    if (!conversation) {
      return res.status(404).json({ error: "conversation_not_found" });
    }

    const targetUserId =
      Number(conversation.user_one_id) === Number(userId)
        ? Number(conversation.user_two_id)
        : Number(conversation.user_one_id);

    const isMuted = req.body?.isMuted === true;
    const isBlocked = req.body?.isBlocked === true;

    await pool.query(
      `
      INSERT INTO direct_message_preferences (user_id, target_user_id, is_muted, is_blocked)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, target_user_id)
      DO UPDATE SET
        is_muted = EXCLUDED.is_muted,
        is_blocked = EXCLUDED.is_blocked
      `,
      [userId, targetUserId, isMuted, isBlocked]
    );

    res.json({ success: true, isMuted, isBlocked });
  } catch (err) {
    console.error("MESSAGE PREFERENCE SAVE ERROR:", err);
    res.status(500).json({ error: "message_preference_save_failed" });
  }
});

app.post("/follow/:id", async (req, res) => {
  const userId = getUserIdFromToken(req);
  const targetId = parseInt(req.params.id);

  if (!userId || userId === targetId) {
    return res.status(400).json({ error: "invalid" });
  }

  try {
    const exists = await pool.query(
      "SELECT * FROM follows WHERE follower_id=$1 AND following_id=$2",
      [userId, targetId]
    );

    if (exists.rows.length > 0) {
      // отписка
      await pool.query(
        "DELETE FROM follows WHERE follower_id=$1 AND following_id=$2",
        [userId, targetId]
      );

      return res.json({ following: false });
    } else {
      // подписка
      await pool.query(
        "INSERT INTO follows (follower_id, following_id) VALUES ($1,$2)",
        [userId, targetId]
      );

      const actorRes = await pool.query(
        "SELECT username, username_tag FROM users WHERE id = $1 LIMIT 1",
        [userId]
      );
      const actor = actorRes.rows[0] || {};
      await createNotification({
        userId: targetId,
        actorId: userId,
        type: "follow",
        entityType: "profile",
        entityId: targetId,
        text: `${actor.username || actor.username_tag || "Пользователь"} подписался на тебя`,
        metadata: { profileId: targetId }
      });

      return res.json({ following: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

app.get("/follow-status/:id", async (req, res) => {
  const userId = getUserIdFromToken(req);
  const targetId = parseInt(req.params.id);

  if (!userId) return res.json({ following: false });

  const result = await pool.query(
    "SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2",
    [userId, targetId]
  );

  res.json({ following: result.rows.length > 0 });
});

app.get("/followers-count/:id", async (req, res) => {
  const userId = req.params.id;

  const result = await pool.query(
    "SELECT COUNT(*) FROM follows WHERE following_id = $1",
    [userId]
  );

  res.json({ count: Number(result.rows[0].count) });
});

app.get("/following-count/:id", async (req, res) => {
  const userId = req.params.id;

  const result = await pool.query(
    "SELECT COUNT(*) FROM follows WHERE follower_id = $1",
    [userId]
  );

  res.json({ count: Number(result.rows[0].count) });
});

app.get("/followers/:id", async (req, res) => {
  const id = parseInt(req.params.id)

  const result = await pool.query(`
    SELECT users.id, users.username, users.username_tag, users.avatar
    FROM follows
    JOIN users ON users.id = follows.follower_id
    WHERE follows.following_id = $1
  `, [id])

  res.json(result.rows)
})

app.get("/following/:id", async (req, res) => {
  const id = parseInt(req.params.id)

  const result = await pool.query(`
    SELECT users.id, users.username, users.username_tag, users.avatar
    FROM follows
    JOIN users ON users.id = follows.following_id
    WHERE follows.follower_id = $1
  `, [id])

  res.json(result.rows)
})

app.get("/api/track/:tag/:slug", async (req, res) => {
  try {
    const { tag, slug } = req.params;

    const userRes = await pool.query(
      `SELECT id FROM users WHERE LOWER(username_tag) = LOWER($1)`,
      [tag]
    );

    if (!userRes.rows.length) {
      return res.status(404).json({ error: "user_not_found" });
    }

    const userId = userRes.rows[0].id;

    const trackRes = await pool.query(
  `
  SELECT
    t.*,
    u.username,
    u.username_tag,
    COALESCE((
      SELECT COUNT(*)::int
      FROM track_likes tl
      WHERE tl.track_id = t.id
    ), 0) AS likes_count,
    COALESCE((
      SELECT COUNT(*)::int
      FROM track_comments tc
      WHERE tc.track_id = t.id
    ), 0) AS comments_count,
    COALESCE((
      SELECT COUNT(*)::int
      FROM track_listens tls
      WHERE tls.track_id = t.id
    ), 0) AS listens_count
  FROM user_tracks t
  JOIN users u ON u.id = t.user_id
  WHERE t.user_id = $1
    AND t.slug = $2
    AND COALESCE(t.is_archived, false) = false
  LIMIT 1
  `,
  [userId, slug]
);

    if (!trackRes.rows.length) {
      return res.status(404).json({ error: "track_not_found" });
    }

    const [trackWithMentions] = await attachArtistMentionsToTracks(trackRes.rows);
    res.json(trackWithMentions || trackRes.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  }
});





function slugify(text) {
  return text
    .toLowerCase()

    // рус → транслит
    .replace(/а/g, "a")
    .replace(/б/g, "b")
    .replace(/в/g, "v")
    .replace(/г/g, "g")
    .replace(/д/g, "d")
    .replace(/е/g, "e")
    .replace(/ё/g, "e")
    .replace(/ж/g, "zh")
    .replace(/з/g, "z")
    .replace(/и/g, "i")
    .replace(/й/g, "y")
    .replace(/к/g, "k")
    .replace(/л/g, "l")
    .replace(/м/g, "m")
    .replace(/н/g, "n")
    .replace(/о/g, "o")
    .replace(/п/g, "p")
    .replace(/р/g, "r")
    .replace(/с/g, "s")
    .replace(/т/g, "t")
    .replace(/у/g, "u")
    .replace(/ф/g, "f")
    .replace(/х/g, "h")
    .replace(/ц/g, "c")
    .replace(/ч/g, "ch")
    .replace(/ш/g, "sh")
    .replace(/щ/g, "sh")
    .replace(/ы/g, "y")
    .replace(/э/g, "e")
    .replace(/ю/g, "yu")
    .replace(/я/g, "ya")

    // всё остальное
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeTrackText(value, { maxLength = null, allowNewlines = false } = {}) {
  let normalized = String(value ?? "").normalize("NFKC");
  const controlChars = allowNewlines ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;

  normalized = normalized
    .replace(controlChars, "")
    .replace(/[<>]/g, "")
    .trim();

  if (typeof maxLength === "number" && maxLength > 0) {
    normalized = normalized.slice(0, maxLength);
  }

  return normalized;
}




app.get("/track-comments/:trackId", async (req, res) => {
  const trackId = Number(req.params.trackId);
  const userId = Number(getOptionalUserIdFromReq(req) || 0);

  if (!trackId) {
    return res.status(400).json({ error: "invalid_track_id" });
  }

  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.track_id,
        c.user_id,
        c.parent_id,
        c.text,
        c.created_at,
        u.username,
        u.username_tag,
        u.avatar,
        COALESCE((
          SELECT COUNT(*)::int
          FROM track_comment_reactions r
          WHERE r.comment_id = c.id AND r.reaction = 'like'
        ), 0) AS likes_count,
        COALESCE((
          SELECT COUNT(*)::int
          FROM track_comment_reactions r
          WHERE r.comment_id = c.id AND r.reaction = 'dislike'
        ), 0) AS dislikes_count,
        (
          SELECT reaction
          FROM track_comment_reactions r
          WHERE r.comment_id = c.id AND r.user_id = $2
          LIMIT 1
        ) AS my_reaction,
        CASE
          WHEN $2 > 0 AND (c.user_id = $2 OR t.user_id = $2) THEN true
          ELSE false
        END AS can_delete
      FROM track_comments c
      JOIN users u ON u.id = c.user_id
      JOIN user_tracks t ON t.id = c.track_id
      WHERE c.track_id = $1
      ORDER BY c.created_at ASC, c.id ASC
    `, [trackId, userId]);

    res.json(result.rows);
  } catch (err) {
    console.error("TRACK COMMENTS LOAD ERROR:", err);
    res.status(500).json({ error: "track_comments_load_failed" });
  }
});


app.post("/add-track-comment", auth, async (req, res) => {
  const trackId = Number(req.body?.trackId);
  const text = String(req.body?.text || "").trim();
  const parentId = Number(req.body?.parentId || 0) || null;

  if (!trackId) {
    return res.status(400).json({ error: "invalid_track_id" });
  }

  if (!text) {
    return res.status(400).json({ error: "comment_text_required" });
  }

  if (text.length > 2000) {
    return res.status(400).json({ error: "comment_too_long" });
  }

  // 🚫 анти-спам (3 секунды)
  const last = await pool.query(
    `SELECT created_at FROM track_comments
     WHERE user_id=$1
     ORDER BY created_at DESC
     LIMIT 1`,
    [req.user.id]
  );

  if (last.rows.length > 0) {
    const lastTime = new Date(last.rows[0].created_at).getTime();
    const now = Date.now();

    if (now - lastTime < 3000) {
      return res.status(429).json({ error: "comment_rate_limited" });
    }
  }

  try {
    if (parentId) {
      const parentRes = await pool.query(
        "SELECT id, track_id FROM track_comments WHERE id = $1",
        [parentId]
      );

      if (!parentRes.rows.length || Number(parentRes.rows[0].track_id) !== trackId) {
        return res.status(400).json({ error: "invalid_parent_comment" });
      }
    }

    await pool.query(`
      INSERT INTO track_comments (track_id, user_id, parent_id, text)
      VALUES ($1, $2, $3, $4)
    `, [trackId, req.user.id, parentId, text]);

    let xpState = null;
    if (text.length > 2) {
      xpState = await awardXP(req.user.id, parentId ? "track_reply" : "track_comment", {
        amount: 10,
        cooldownSeconds: 30,
        dailyLimit: 15,
        eventKey: parentId
          ? `track-reply:${parentId}:${getDayKey()}`
          : `track-comment:${trackId}:${getDayKey()}`,
        meta: { trackId: Number(trackId), parentId: parentId || null }
      });
    }

    const countRes = await pool.query(
      "SELECT COUNT(*)::int AS count FROM track_comments WHERE track_id = $1",
      [trackId]
    );

    res.json({
      ok: true,
      comments_count: Number(countRes.rows[0]?.count || 0),
      ...(xpState ? getXpPayload(xpState) : {})
    });
  } catch (err) {
    console.error("TRACK COMMENT CREATE ERROR:", err);
    res.status(500).json({ error: "track_comment_create_failed" });
  }
});

app.post("/comment-like", auth, async (req, res) => {
  const { commentId } = req.body;
  const userId = req.user.id;

  const exists = await pool.query(
    "SELECT * FROM comment_likes WHERE comment_id=$1 AND user_id=$2",
    [commentId, userId]
  );

  if (exists.rows.length) {
    await pool.query(
      "DELETE FROM comment_likes WHERE comment_id=$1 AND user_id=$2",
      [commentId, userId]
    );
    return res.json({ liked: false });
  }

  await pool.query(
    "INSERT INTO comment_likes (comment_id,user_id) VALUES ($1,$2)",
    [commentId, userId]
  );

  res.json({ liked: true });
});

app.delete("/api/track-comments/:id", auth, async (req, res) => {
  try {
    const commentId = Number(req.params.id);
    const userId = Number(req.user?.id || 0);

    if (!commentId) {
      return res.status(400).json({ error: "invalid_comment_id" });
    }

    const commentRes = await pool.query(`
      SELECT c.id, c.track_id, c.user_id, t.user_id AS track_owner_id
      FROM track_comments c
      JOIN user_tracks t ON t.id = c.track_id
      WHERE c.id = $1
    `, [commentId]);

    if (!commentRes.rows.length) {
      return res.status(404).json({ error: "comment_not_found" });
    }

    const comment = commentRes.rows[0];
    const canDelete = Number(comment.user_id) === userId || Number(comment.track_owner_id) === userId;

    if (!canDelete) {
      return res.status(403).json({ error: "comment_delete_forbidden" });
    }

    await pool.query("DELETE FROM track_comments WHERE id = $1", [commentId]);

    const countRes = await pool.query(
      "SELECT COUNT(*)::int AS count FROM track_comments WHERE track_id = $1",
      [comment.track_id]
    );

    res.json({
      ok: true,
      track_id: Number(comment.track_id),
      comments_count: Number(countRes.rows[0]?.count || 0)
    });
  } catch (err) {
    console.error("TRACK COMMENT DELETE ERROR:", err);
    res.status(500).json({ error: "track_comment_delete_failed" });
  }
});

app.post("/api/track-comments/:id/reaction", auth, async (req, res) => {
  try {
    const commentId = Number(req.params.id);
    const userId = Number(req.user?.id || 0);
    const reaction = req.body?.reaction;

    if (!commentId || !["like", "dislike", null].includes(reaction ?? null)) {
      return res.status(400).json({ error: "invalid_reaction" });
    }

    const commentRes = await pool.query(
      "SELECT id FROM track_comments WHERE id = $1",
      [commentId]
    );

    if (!commentRes.rows.length) {
      return res.status(404).json({ error: "comment_not_found" });
    }

    const existingRes = await pool.query(
      "SELECT reaction FROM track_comment_reactions WHERE comment_id = $1 AND user_id = $2",
      [commentId, userId]
    );

    const existing = existingRes.rows[0]?.reaction || null;
    let nextReaction = reaction ?? null;

    if (!reaction || existing === reaction) {
      await pool.query(
        "DELETE FROM track_comment_reactions WHERE comment_id = $1 AND user_id = $2",
        [commentId, userId]
      );
      nextReaction = null;
    } else if (existing) {
      await pool.query(
        "UPDATE track_comment_reactions SET reaction = $1 WHERE comment_id = $2 AND user_id = $3",
        [reaction, commentId, userId]
      );
    } else {
      await pool.query(
        "INSERT INTO track_comment_reactions (comment_id, user_id, reaction) VALUES ($1, $2, $3)",
        [commentId, userId, reaction]
      );
    }

    const countRes = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE reaction = 'like')::int AS likes_count,
        COUNT(*) FILTER (WHERE reaction = 'dislike')::int AS dislikes_count
      FROM track_comment_reactions
      WHERE comment_id = $1
    `, [commentId]);

    res.json({
      ok: true,
      reaction: nextReaction,
      likes_count: Number(countRes.rows[0]?.likes_count || 0),
      dislikes_count: Number(countRes.rows[0]?.dislikes_count || 0)
    });
  } catch (err) {
    console.error("TRACK COMMENT REACTION ERROR:", err);
    res.status(500).json({ error: "track_comment_reaction_failed" });
  }
});

app.get("/discover-tracks", auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        t.id,
        t.title,
        t.artist,
        t.genre,
        t.tags,
        t.cover,
        t.audio AS "audioSrc",
        t.soundcloud,
        u.username,
        u.username_tag
      FROM user_tracks t
      JOIN users u ON u.id = t.user_id
      WHERE COALESCE(t.is_archived, false) = false
        AND (t.audio IS NOT NULL OR t.soundcloud IS NOT NULL)
      ORDER BY RANDOM()
      LIMIT 100
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("DISCOVER ERROR:", err);
    res.status(500).json({ error: "failed" });
  }
});

app.post("/track-action", auth, async (req, res) => {
  try {
    const { trackId, action } = req.body;
    const entityType = String(req.body?.entityType || "profile").trim().toLowerCase();

    if (!trackId || !["like", "dislike"].includes(action) || !["profile", "queue"].includes(entityType)) {
      return res.status(400).json({ error: "invalid_data" });
    }

    const existingRes = await pool.query(
      `SELECT action
       FROM track_actions
       WHERE user_id = $1 AND track_id = $2 AND COALESCE(entity_type, 'profile') = $3`,
      [req.user.id, trackId, entityType]
    );

    const existing = existingRes.rows[0]?.action || null;

    await pool.query(
      `DELETE FROM track_actions
       WHERE user_id = $1 AND track_id = $2 AND COALESCE(entity_type, 'profile') = $3`,
      [req.user.id, trackId, entityType]
    );

    let nextAction = null;

    if (existing !== action) {
      await pool.query(
        `INSERT INTO track_actions (user_id, track_id, action, entity_type)
         VALUES ($1, $2, $3, $4)`,
        [req.user.id, trackId, action, entityType]
      );
      nextAction = action;
    }

    const countsRes = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE action = 'like')::int AS likes,
        COUNT(*) FILTER (WHERE action = 'dislike')::int AS dislikes
      FROM track_actions
      WHERE track_id = $1
        AND COALESCE(entity_type, 'profile') = $2
      `,
      [trackId, entityType]
    );

    res.json({
      success: true,
      action: nextAction,
      likes: Number(countsRes.rows[0]?.likes || 0),
      dislikes: Number(countsRes.rows[0]?.dislikes || 0)
    });
  } catch (err) {
    console.error("TRACK ACTION ERROR:", err);
    res.status(500).json({ error: "action error" });
  }
});

app.post("/api/posts/:id/reaction", auth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const userId = req.user.id;
    const reaction = req.body?.reaction;

    if (!postId || !["like", "dislike", null].includes(reaction ?? null)) {
      return res.status(400).json({ error: "invalid_reaction" });
    }

    const postRes = await pool.query(
      "SELECT id FROM posts WHERE id = $1",
      [postId]
    );

    if (!postRes.rows.length) {
      return res.status(404).json({ error: "post_not_found" });
    }

    const existingRes = await pool.query(
      "SELECT reaction FROM post_reactions WHERE post_id = $1 AND user_id = $2",
      [postId, userId]
    );

    const existing = existingRes.rows[0]?.reaction || null;
    let nextReaction = reaction ?? null;

    if (!reaction || existing === reaction) {
      await pool.query(
        "DELETE FROM post_reactions WHERE post_id = $1 AND user_id = $2",
        [postId, userId]
      );
      nextReaction = null;
    } else if (existing) {
      await pool.query(
        "UPDATE post_reactions SET reaction = $1 WHERE post_id = $2 AND user_id = $3",
        [reaction, postId, userId]
      );
    } else {
      await pool.query(
        "INSERT INTO post_reactions (post_id, user_id, reaction) VALUES ($1, $2, $3)",
        [postId, userId, reaction]
      );

      if (reaction === "like") {
        const actorRes = await pool.query(
          "SELECT username, username_tag FROM users WHERE id = $1 LIMIT 1",
          [userId]
        );
        const ownerRes = await pool.query(
          "SELECT user_id FROM posts WHERE id = $1 LIMIT 1",
          [postId]
        );
        const actor = actorRes.rows[0] || {};
        const ownerId = Number(ownerRes.rows[0]?.user_id || 0);
        if (ownerId) {
          await createNotification({
            userId: ownerId,
            actorId: userId,
            type: "post_like",
            entityType: "post",
            entityId: postId,
            text: `${actor.username || actor.username_tag || "Пользователь"} лайкнул твой пост`,
            metadata: { postId }
          });
        }
      }
    }

    const countsRes = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE reaction = 'like')::int AS likes_count,
        COUNT(*) FILTER (WHERE reaction = 'dislike')::int AS dislikes_count
      FROM post_reactions
      WHERE post_id = $1
      `,
      [postId]
    );

    res.json({
      success: true,
      reaction: nextReaction,
      likes_count: countsRes.rows[0]?.likes_count || 0,
      dislikes_count: countsRes.rows[0]?.dislikes_count || 0
    });
  } catch (err) {
    console.error("POST REACTION ERROR:", err);
    res.status(500).json({ error: "post_reaction_failed" });
  }
});

app.get("/api/settings/saved-posts", auth, async (req, res) => {
  try {
    const rawIds = String(req.query.ids || "")
      .split(",")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);

    if (!rawIds.length) {
      return res.json([]);
    }

    const postsRes = await pool.query(
      `
      SELECT
        p.*,
        u.username,
        u.avatar,
        u.username_tag,
        (
          SELECT COUNT(*)::int
          FROM post_views pv
          WHERE pv.post_id = p.id
        ) AS views_count,
        (
          SELECT COUNT(*)::int
          FROM post_reactions pr
          WHERE pr.post_id = p.id AND pr.reaction = 'like'
        ) AS likes_count,
        (
          SELECT COUNT(*)::int
          FROM post_reactions pr
          WHERE pr.post_id = p.id AND pr.reaction = 'dislike'
        ) AS dislikes_count,
        (
          SELECT COUNT(*)::int
          FROM post_comments pc
          WHERE pc.post_id = p.id
        ) AS comments_count,
        (
          SELECT reaction
          FROM post_reactions pr
          WHERE pr.post_id = p.id AND pr.user_id = $2
          LIMIT 1
        ) AS my_reaction
      FROM posts p
      JOIN users u ON u.id = p.user_id
      WHERE p.id = ANY($1::int[])
        AND COALESCE(p.is_archived, false) = false
      ORDER BY array_position($1::int[], p.id)
      `,
      [rawIds, req.user.id]
    );

    res.json(postsRes.rows);
  } catch (err) {
    console.error("SETTINGS SAVED POSTS ERROR:", err);
    res.status(500).json({ error: "settings_saved_posts_failed" });
  }
});

app.get("/api/settings/liked-posts", auth, async (req, res) => {
  try {
    const postsRes = await pool.query(
      `
      SELECT
        p.*,
        u.username,
        u.avatar,
        u.username_tag,
        (
          SELECT COUNT(*)::int
          FROM post_views pv
          WHERE pv.post_id = p.id
        ) AS views_count,
        (
          SELECT COUNT(*)::int
          FROM post_reactions pr
          WHERE pr.post_id = p.id AND pr.reaction = 'like'
        ) AS likes_count,
        (
          SELECT COUNT(*)::int
          FROM post_reactions pr
          WHERE pr.post_id = p.id AND pr.reaction = 'dislike'
        ) AS dislikes_count,
        (
          SELECT COUNT(*)::int
          FROM post_comments pc
          WHERE pc.post_id = p.id
        ) AS comments_count,
        'like'::text AS my_reaction
      FROM post_reactions r
      JOIN posts p ON p.id = r.post_id
      JOIN users u ON u.id = p.user_id
      WHERE r.user_id = $1
        AND r.reaction = 'like'
        AND COALESCE(p.is_archived, false) = false
      ORDER BY r.created_at DESC NULLS LAST, p.created_at DESC
      `,
      [req.user.id]
    );

    res.json(postsRes.rows);
  } catch (err) {
    console.error("SETTINGS LIKED POSTS ERROR:", err);
    res.status(500).json({ error: "settings_liked_posts_failed" });
  }
});

const SETTINGS_ACHIEVEMENT_CATEGORIES = [
  { key: "profile", title: "Профиль" },
  { key: "creation", title: "Контент" },
  { key: "ratings", title: "Оценки" },
  { key: "discussion", title: "Общение" },
  { key: "social", title: "Связи" },
  { key: "impact", title: "Импакт" },
  { key: "status", title: "Статус" }
];

function getSettingsAchievementCatalog() {
  return [
    { id: "bio_first_line", title: "Первый штрих", description: "Добавь описание профиля, чтобы люди сразу понимали твой вайб.", category: "profile", icon: "fa-signature", difficulty: "easy", xpReward: 20, goal: 1, metricKey: "has_bio" },
    { id: "avatar_custom", title: "Лицо сцены", description: "Поставь свою аватарку вместо стандартной.", category: "profile", icon: "fa-user-astronaut", difficulty: "easy", xpReward: 20, goal: 1, metricKey: "has_custom_avatar" },
    { id: "first_contact", title: "На связи", description: "Добавь хотя бы одну ссылку на свои площадки или контакт.", category: "profile", icon: "fa-link", difficulty: "easy", xpReward: 25, goal: 1, metricKey: "profile_links_count" },
    { id: "network_spread", title: "Везде свой", description: "Заполни три внешние ссылки в профиле.", category: "profile", icon: "fa-satellite-dish", difficulty: "medium", xpReward: 60, goal: 3, metricKey: "profile_links_count" },
    { id: "profile_polished", title: "Собранный образ", description: "Закрой базовый профиль: био, кастомный аватар, почта и хотя бы одна ссылка.", category: "profile", icon: "fa-id-card", difficulty: "medium", xpReward: 80, goal: 4, metricKey: "profile_depth_score" },
    { id: "verified_signal", title: "Знак доверия", description: "Получи верификацию профиля.", category: "profile", icon: "fa-badge-check", difficulty: "hard", xpReward: 140, goal: 1, metricKey: "is_verified" },

    { id: "first_post", title: "Первый выход", description: "Опубликуй свой первый пост.", category: "creation", icon: "fa-pen-nib", difficulty: "easy", xpReward: 20, goal: 1, metricKey: "posts_created" },
    { id: "five_posts", title: "Лента ожила", description: "Сделай 5 постов.", category: "creation", icon: "fa-newspaper", difficulty: "medium", xpReward: 50, goal: 5, metricKey: "posts_created" },
    { id: "fifteen_posts", title: "Голос площадки", description: "Опубликуй 15 постов.", category: "creation", icon: "fa-bullhorn", difficulty: "medium", xpReward: 80, goal: 15, metricKey: "posts_created" },
    { id: "forty_posts", title: "Хроника движения", description: "Дойди до 40 постов.", category: "creation", icon: "fa-book-open", difficulty: "hard", xpReward: 150, goal: 40, metricKey: "posts_created" },
    { id: "first_track", title: "Первый релиз", description: "Загрузи первый трек в профиль.", category: "creation", icon: "fa-waveform", difficulty: "easy", xpReward: 25, goal: 1, metricKey: "tracks_uploaded" },
    { id: "three_tracks", title: "Мини-сет", description: "Загрузи 3 трека.", category: "creation", icon: "fa-compact-disc", difficulty: "medium", xpReward: 60, goal: 3, metricKey: "tracks_uploaded" },
    { id: "ten_tracks", title: "Каталог растёт", description: "Загрузи 10 треков.", category: "creation", icon: "fa-record-vinyl", difficulty: "hard", xpReward: 110, goal: 10, metricKey: "tracks_uploaded" },
    { id: "twentyfive_tracks", title: "Собственная дискография", description: "Собери 25 треков в профиле.", category: "creation", icon: "fa-headphones-simple", difficulty: "legendary", xpReward: 220, goal: 25, metricKey: "tracks_uploaded" },

    { id: "first_queue_rating", title: "Первый вердикт", description: "Оцени первый трек в очереди.", category: "ratings", icon: "fa-scale-balanced", difficulty: "easy", xpReward: 20, goal: 1, metricKey: "queue_ratings_user" },
    { id: "ten_queue_ratings", title: "Ритм судейства", description: "Поставь 10 пользовательских оценок в очереди.", category: "ratings", icon: "fa-sliders", difficulty: "medium", xpReward: 55, goal: 10, metricKey: "queue_ratings_user" },
    { id: "twentyfive_queue_ratings", title: "В разборе", description: "Поставь 25 пользовательских оценок в очереди.", category: "ratings", icon: "fa-list-check", difficulty: "medium", xpReward: 90, goal: 25, metricKey: "queue_ratings_user" },
    { id: "seventyfive_queue_ratings", title: "Наслушанность", description: "Оставь 75 пользовательских оценок в очереди.", category: "ratings", icon: "fa-wave-square", difficulty: "hard", xpReward: 170, goal: 75, metricKey: "queue_ratings_user" },
    { id: "first_judge_rating", title: "Голос жюри", description: "Поставь первую судейскую оценку в очереди.", category: "ratings", icon: "fa-gavel", difficulty: "medium", xpReward: 40, goal: 1, metricKey: "queue_ratings_judge" },
    { id: "fifteen_judge_ratings", title: "Судья в работе", description: "Поставь 15 судейских оценок в очереди.", category: "ratings", icon: "fa-landmark", difficulty: "hard", xpReward: 120, goal: 15, metricKey: "queue_ratings_judge" },
    { id: "first_profile_rating", title: "Точечный отзыв", description: "Оцени первый профильный трек.", category: "ratings", icon: "fa-music", difficulty: "easy", xpReward: 18, goal: 1, metricKey: "profile_ratings_user" },
    { id: "ten_profile_ratings", title: "Слух настроен", description: "Оцени 10 профильных треков.", category: "ratings", icon: "fa-ear-listen", difficulty: "medium", xpReward: 55, goal: 10, metricKey: "profile_ratings_user" },
    { id: "thirty_profile_ratings", title: "Куратор профилей", description: "Оцени 30 профильных треков.", category: "ratings", icon: "fa-layer-group", difficulty: "hard", xpReward: 110, goal: 30, metricKey: "profile_ratings_user" },
    { id: "first_profile_judge", title: "Профессиональный разбор", description: "Поставь первую судейскую оценку профильному треку.", category: "ratings", icon: "fa-medal", difficulty: "medium", xpReward: 45, goal: 1, metricKey: "profile_ratings_judge" },
    { id: "fifteen_profile_judge", title: "Критик сезона", description: "Поставь 15 судейских оценок профильным трекам.", category: "ratings", icon: "fa-crown", difficulty: "hard", xpReward: 130, goal: 15, metricKey: "profile_ratings_judge" },

    { id: "first_track_comment", title: "Первый фидбек", description: "Оставь комментарий под треком.", category: "discussion", icon: "fa-comment-music", difficulty: "easy", xpReward: 18, goal: 1, metricKey: "track_comments_written" },
    { id: "fifteen_track_comments", title: "Внутри дискуссии", description: "Напиши 15 комментариев под треками.", category: "discussion", icon: "fa-comments", difficulty: "medium", xpReward: 65, goal: 15, metricKey: "track_comments_written" },
    { id: "fifty_track_comments", title: "Голос обсуждения", description: "Напиши 50 комментариев под треками.", category: "discussion", icon: "fa-microphone-lines", difficulty: "hard", xpReward: 130, goal: 50, metricKey: "track_comments_written" },
    { id: "first_post_comment", title: "Диалог начался", description: "Оставь комментарий под постом.", category: "discussion", icon: "fa-message", difficulty: "easy", xpReward: 18, goal: 1, metricKey: "post_comments_written" },
    { id: "fifteen_post_comments", title: "Пульс ленты", description: "Напиши 15 комментариев под постами.", category: "discussion", icon: "fa-comment-dots", difficulty: "medium", xpReward: 65, goal: 15, metricKey: "post_comments_written" },
    { id: "fifty_post_comments", title: "Собеседник площадки", description: "Напиши 50 комментариев под постами.", category: "discussion", icon: "fa-quote-left", difficulty: "hard", xpReward: 130, goal: 50, metricKey: "post_comments_written" },

    { id: "first_follow", title: "Первый коннект", description: "Подпишись на первого артиста.", category: "social", icon: "fa-user-plus", difficulty: "easy", xpReward: 12, goal: 1, metricKey: "following_count" },
    { id: "twentyfive_following", title: "В своей обойме", description: "Подпишись на 25 артистов.", category: "social", icon: "fa-users-viewfinder", difficulty: "medium", xpReward: 70, goal: 25, metricKey: "following_count" },
    { id: "first_follower", title: "Тебя заметили", description: "Получи первого подписчика.", category: "social", icon: "fa-user-check", difficulty: "easy", xpReward: 25, goal: 1, metricKey: "followers_count" },
    { id: "ten_followers", title: "Своя аудитория", description: "Собери 10 подписчиков.", category: "social", icon: "fa-user-group", difficulty: "medium", xpReward: 70, goal: 10, metricKey: "followers_count" },
    { id: "fifty_followers", title: "Имя на слуху", description: "Собери 50 подписчиков.", category: "social", icon: "fa-fire", difficulty: "hard", xpReward: 180, goal: 50, metricKey: "followers_count" },

    { id: "ten_track_listens", title: "Первые уши", description: "Получи 10 прослушиваний своих треков.", category: "impact", icon: "fa-headphones", difficulty: "easy", xpReward: 30, goal: 10, metricKey: "track_listens_received" },
    { id: "hundred_track_listens", title: "Разогрев", description: "Получи 100 прослушиваний своих треков.", category: "impact", icon: "fa-volume-high", difficulty: "medium", xpReward: 100, goal: 100, metricKey: "track_listens_received" },
    { id: "fivehundred_track_listens", title: "Треки на повторе", description: "Получи 500 прослушиваний своих треков.", category: "impact", icon: "fa-tower-broadcast", difficulty: "legendary", xpReward: 260, goal: 500, metricKey: "track_listens_received" },
    { id: "ten_track_likes", title: "Реакция зала", description: "Получи 10 лайков на свои треки.", category: "impact", icon: "fa-heart", difficulty: "easy", xpReward: 35, goal: 10, metricKey: "track_likes_received" },
    { id: "fifty_track_likes", title: "Людям заходит", description: "Получи 50 лайков на свои треки.", category: "impact", icon: "fa-heart-circle-bolt", difficulty: "medium", xpReward: 110, goal: 50, metricKey: "track_likes_received" },
    { id: "five_track_reposts", title: "Передай дальше", description: "Получи 5 репостов своих треков.", category: "impact", icon: "fa-share-nodes", difficulty: "medium", xpReward: 50, goal: 5, metricKey: "track_reposts_received" },
    { id: "twentyfive_track_reposts", title: "Трек гуляет по сети", description: "Получи 25 репостов своих треков.", category: "impact", icon: "fa-arrows-turn-right", difficulty: "hard", xpReward: 160, goal: 25, metricKey: "track_reposts_received" },
    { id: "ten_track_comments_received", title: "Тебя обсуждают", description: "Получи 10 комментариев под своими треками.", category: "impact", icon: "fa-comment-lines", difficulty: "medium", xpReward: 45, goal: 10, metricKey: "track_comments_received" },
    { id: "fifty_track_comments_received", title: "Точка притяжения", description: "Получи 50 комментариев под своими треками.", category: "impact", icon: "fa-comments-dollar", difficulty: "hard", xpReward: 150, goal: 50, metricKey: "track_comments_received" },
    { id: "twenty_post_likes", title: "Поймали момент", description: "Получи 20 лайков на свои посты.", category: "impact", icon: "fa-thumbs-up", difficulty: "easy", xpReward: 40, goal: 20, metricKey: "post_likes_received" },
    { id: "hundred_post_likes", title: "Лента откликнулась", description: "Получи 100 лайков на свои посты.", category: "impact", icon: "fa-bolt", difficulty: "hard", xpReward: 150, goal: 100, metricKey: "post_likes_received" },
    { id: "ten_post_comments_received", title: "Есть разговор", description: "Получи 10 комментариев под своими постами.", category: "impact", icon: "fa-inbox", difficulty: "medium", xpReward: 45, goal: 10, metricKey: "post_comments_received" },
    { id: "fifty_post_comments_received", title: "Центр внимания", description: "Получи 50 комментариев под своими постами.", category: "impact", icon: "fa-wand-magic-sparkles", difficulty: "hard", xpReward: 150, goal: 50, metricKey: "post_comments_received" },
    { id: "ten_post_reposts", title: "Разошлось по лентам", description: "Получи 10 репостов своих постов.", category: "impact", icon: "fa-retweet", difficulty: "medium", xpReward: 55, goal: 10, metricKey: "post_reposts_received" },

    { id: "join_collective", title: "В команде", description: "Вступи в музыкальное объединение.", category: "status", icon: "fa-users", difficulty: "medium", xpReward: 45, goal: 1, metricKey: "in_collective" },
    { id: "own_collective", title: "Основатель", description: "Создай своё музыкальное объединение.", category: "status", icon: "fa-flag", difficulty: "hard", xpReward: 130, goal: 1, metricKey: "owns_collective" },
    { id: "first_podium", title: "Первый подиум", description: "Попади в призовые места хотя бы один раз.", category: "status", icon: "fa-trophy", difficulty: "hard", xpReward: 90, goal: 1, metricKey: "total_podiums" },
    { id: "first_win", title: "Чемпион стрима", description: "Займи первое место хотя бы один раз.", category: "status", icon: "fa-trophy-star", difficulty: "legendary", xpReward: 180, goal: 1, metricKey: "first_places" },
    { id: "three_podiums", title: "Серия сильных выходов", description: "Собери 3 призовых места.", category: "status", icon: "fa-award", difficulty: "legendary", xpReward: 180, goal: 3, metricKey: "total_podiums" },
    { id: "xp_100", title: "Первые очки", description: "Набери 100 XP.", category: "status", icon: "fa-sparkles", difficulty: "easy", xpReward: 30, goal: 100, metricKey: "total_xp" },
    { id: "xp_500", title: "Хороший темп", description: "Набери 500 XP.", category: "status", icon: "fa-gauge-high", difficulty: "medium", xpReward: 90, goal: 500, metricKey: "total_xp" },
    { id: "xp_1500", title: "Высокая инерция", description: "Набери 1500 XP.", category: "status", icon: "fa-rocket", difficulty: "hard", xpReward: 180, goal: 1500, metricKey: "total_xp" },
    { id: "xp_4000", title: "Доминанта", description: "Набери 4000 XP.", category: "status", icon: "fa-meteor", difficulty: "legendary", xpReward: 320, goal: 4000, metricKey: "total_xp" }
  ];
}

function getSettingsAchievementProgressValue(definition, metrics) {
  const value = Number(metrics?.[definition.metricKey] || 0);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

async function getSettingsAchievementMetrics(userId) {
  const metricsRes = await pool.query(
    `
    SELECT
      COALESCE(u.xp, 0)::int AS total_xp,
      CASE WHEN COALESCE(NULLIF(BTRIM(u.bio), ''), '') <> '' THEN 1 ELSE 0 END::int AS has_bio,
      CASE WHEN COALESCE(u.avatar, '') <> '' AND COALESCE(u.avatar, '') <> '/images/default-avatar.jpg' THEN 1 ELSE 0 END::int AS has_custom_avatar,
      CASE WHEN COALESCE(NULLIF(BTRIM(u.email), ''), '') <> '' THEN 1 ELSE 0 END::int AS has_email,
      CASE WHEN COALESCE(NULLIF(BTRIM(u.soundcloud), ''), '') <> '' THEN 1 ELSE 0 END::int AS has_soundcloud,
      CASE WHEN COALESCE(NULLIF(BTRIM(u.instagram), ''), '') <> '' THEN 1 ELSE 0 END::int AS has_instagram,
      CASE WHEN COALESCE(NULLIF(BTRIM(u.twitter), ''), '') <> '' THEN 1 ELSE 0 END::int AS has_twitter,
      CASE WHEN COALESCE(NULLIF(BTRIM(u.telegram), ''), '') <> '' THEN 1 ELSE 0 END::int AS has_telegram,
      CASE WHEN COALESCE(NULLIF(BTRIM(u.website), ''), '') <> '' THEN 1 ELSE 0 END::int AS has_website,
      CASE WHEN COALESCE(u.is_verified, false) THEN 1 ELSE 0 END::int AS is_verified,
      CASE WHEN u.collective_id IS NOT NULL THEN 1 ELSE 0 END::int AS in_collective,
      CASE WHEN mc.owner_user_id = u.id THEN 1 ELSE 0 END::int AS owns_collective,
      COALESCE(ps.first_places, 0)::int AS first_places,
      COALESCE(ps.second_places, 0)::int AS second_places,
      COALESCE(ps.third_places, 0)::int AS third_places,
      (SELECT COUNT(*)::int FROM posts p WHERE p.user_id = u.id AND COALESCE(p.is_archived, false) = false) AS posts_created,
      (SELECT COUNT(*)::int FROM user_tracks t WHERE t.user_id = u.id AND COALESCE(t.is_archived, false) = false) AS tracks_uploaded,
      (SELECT COUNT(*)::int FROM track_ratings tr WHERE tr.user_id = u.id AND tr.type = 'user') AS queue_ratings_user,
      (SELECT COUNT(*)::int FROM track_ratings tr WHERE tr.user_id = u.id AND tr.type = 'judge') AS queue_ratings_judge,
      (SELECT COUNT(*)::int FROM profile_track_ratings ptr WHERE ptr.user_id = u.id AND ptr.type = 'user') AS profile_ratings_user,
      (SELECT COUNT(*)::int FROM profile_track_ratings ptr WHERE ptr.user_id = u.id AND ptr.type = 'judge') AS profile_ratings_judge,
      (SELECT COUNT(*)::int FROM track_comments tc WHERE tc.user_id = u.id) AS track_comments_written,
      (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.user_id = u.id) AS post_comments_written,
      (SELECT COUNT(*)::int FROM follows f WHERE f.following_id = u.id) AS followers_count,
      (SELECT COUNT(*)::int FROM follows f WHERE f.follower_id = u.id) AS following_count,
      (SELECT COUNT(*)::int FROM track_listens tl JOIN user_tracks t ON t.id = tl.track_id WHERE t.user_id = u.id AND tl.user_id <> u.id) AS track_listens_received,
      (SELECT COUNT(*)::int FROM track_likes tl JOIN user_tracks t ON t.id = tl.track_id WHERE t.user_id = u.id AND tl.user_id <> u.id) AS track_likes_received,
      (SELECT COUNT(*)::int FROM track_reposts trp JOIN user_tracks t ON t.id = trp.track_id WHERE t.user_id = u.id AND trp.user_id <> u.id) AS track_reposts_received,
      (SELECT COUNT(*)::int FROM track_comments tc JOIN user_tracks t ON t.id = tc.track_id WHERE t.user_id = u.id AND tc.user_id <> u.id) AS track_comments_received,
      (SELECT COUNT(*)::int FROM post_reactions pr JOIN posts p ON p.id = pr.post_id WHERE p.user_id = u.id AND pr.user_id <> u.id AND pr.reaction = 'like') AS post_likes_received,
      (SELECT COUNT(*)::int FROM post_comments pc JOIN posts p ON p.id = pc.post_id WHERE p.user_id = u.id AND pc.user_id <> u.id) AS post_comments_received,
      (SELECT COUNT(*)::int FROM post_reposts pr JOIN posts p ON p.id = pr.post_id WHERE p.user_id = u.id AND pr.user_id <> u.id) AS post_reposts_received
    FROM users u
    LEFT JOIN music_collectives mc ON mc.id = u.collective_id
    LEFT JOIN user_stream_place_stats ps ON ps.user_id = u.id
    WHERE u.id = $1
    LIMIT 1
    `,
    [userId]
  );

  if (!metricsRes.rows.length) {
    throw new Error("achievement_user_not_found");
  }

  const row = metricsRes.rows[0];
  const profileLinksCount =
    Number(row.has_soundcloud || 0) +
    Number(row.has_instagram || 0) +
    Number(row.has_twitter || 0) +
    Number(row.has_telegram || 0) +
    Number(row.has_website || 0);

  return {
    ...row,
    profile_links_count: profileLinksCount,
    profile_depth_score:
      Number(row.has_bio || 0) +
      Number(row.has_custom_avatar || 0) +
      Number(row.has_email || 0) +
      (profileLinksCount > 0 ? 1 : 0),
    total_podiums:
      Number(row.first_places || 0) +
      Number(row.second_places || 0) +
      Number(row.third_places || 0)
  };
}

async function getUnlockedAchievementMap(userId) {
  const unlockedRes = await pool.query(
    `
    SELECT event_key, created_at
    FROM xp_events
    WHERE user_id = $1
      AND action_key = 'achievement_unlock'
      AND event_key LIKE 'achievement:%'
    `,
    [userId]
  );

  return new Map(
    unlockedRes.rows.map((row) => [
      String(row.event_key || "").replace(/^achievement:/, ""),
      row.created_at
    ])
  );
}

app.get("/api/settings/achievements", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const catalog = getSettingsAchievementCatalog();
    const metrics = await getSettingsAchievementMetrics(userId);
    const unlockedMap = await getUnlockedAchievementMap(userId);

    for (const achievement of catalog) {
      const value = getSettingsAchievementProgressValue(achievement, metrics);
      if (value < achievement.goal || unlockedMap.has(achievement.id)) {
        continue;
      }

      const xpState = await awardXP(userId, "achievement_unlock", {
        amount: achievement.xpReward,
        eventKey: `achievement:${achievement.id}`,
        meta: {
          achievementId: achievement.id,
          title: achievement.title,
          difficulty: achievement.difficulty,
          category: achievement.category
        }
      });

      if (Number(xpState?.gainedXP || 0) > 0) {
        metrics.total_xp = Number(metrics.total_xp || 0) + Number(xpState.gainedXP || 0);
        unlockedMap.set(achievement.id, new Date().toISOString());
      }
    }

    const achievements = catalog.map((achievement) => {
      const rawValue = getSettingsAchievementProgressValue(achievement, metrics);
      const current = Math.max(0, Math.min(rawValue, achievement.goal));
      const completedAt = unlockedMap.get(achievement.id) || null;
      const completed = Boolean(completedAt) || rawValue >= achievement.goal;

      return {
        id: achievement.id,
        title: achievement.title,
        description: achievement.description,
        category: achievement.category,
        difficulty: achievement.difficulty,
        xpReward: achievement.xpReward,
        icon: achievement.icon,
        completed,
        completedAt,
        progress: {
          current,
          goal: achievement.goal,
          percent: achievement.goal > 0 ? Math.max(0, Math.min(100, Math.round((current / achievement.goal) * 100))) : 0
        }
      };
    });

    const categories = SETTINGS_ACHIEVEMENT_CATEGORIES.map((category) => {
      const items = achievements.filter((achievement) => achievement.category === category.key);
      return {
        ...category,
        totalCount: items.length,
        completedCount: items.filter((achievement) => achievement.completed).length
      };
    }).filter((category) => category.totalCount > 0);

    const completedCount = achievements.filter((achievement) => achievement.completed).length;
    const totalXpAvailable = achievements.reduce((sum, achievement) => sum + Number(achievement.xpReward || 0), 0);
    const totalXpEarned = achievements
      .filter((achievement) => achievement.completedAt)
      .reduce((sum, achievement) => sum + Number(achievement.xpReward || 0), 0);

    res.json({
      summary: {
        totalCount: achievements.length,
        completedCount,
        remainingCount: Math.max(0, achievements.length - completedCount),
        totalXpAvailable,
        totalXpEarned
      },
      categories,
      achievements
    });
  } catch (err) {
    console.error("SETTINGS ACHIEVEMENTS ERROR:", err);
    res.status(500).json({ error: "settings_achievements_failed" });
  }
});

app.post("/api/posts/:id/repost", auth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const userId = req.user.id;

    if (!postId) {
      return res.status(400).json({ error: "invalid_post_id" });
    }

    const postRes = await pool.query(
      "SELECT id, user_id FROM posts WHERE id = $1",
      [postId]
    );

    if (!postRes.rows.length) {
      return res.status(404).json({ error: "post_not_found" });
    }

    const post = postRes.rows[0];
    if (Number(post.user_id) === Number(userId)) {
      return res.status(400).json({ error: "cannot_repost_own_post" });
    }

    const existingRes = await pool.query(
      "SELECT id FROM post_reposts WHERE post_id = $1 AND user_id = $2",
      [postId, userId]
    );

    let reposted = false;

    if (existingRes.rows.length) {
      await pool.query(
        "DELETE FROM post_reposts WHERE post_id = $1 AND user_id = $2",
        [postId, userId]
      );
    } else {
      await pool.query(
        "INSERT INTO post_reposts (post_id, user_id) VALUES ($1, $2)",
        [postId, userId]
      );
      reposted = true;

      const actorRes = await pool.query(
        "SELECT username, username_tag FROM users WHERE id = $1 LIMIT 1",
        [userId]
      );
      const actor = actorRes.rows[0] || {};
      await createNotification({
        userId: post.user_id,
        actorId: userId,
        type: "post_repost",
        entityType: "post",
        entityId: postId,
        text: `${actor.username || actor.username_tag || "Пользователь"} репостнул твой пост`,
        metadata: { postId }
      });

      await awardXP(userId, "post_repost", {
        amount: 6,
        cooldownSeconds: 20,
        dailyLimit: 20,
        eventKey: `post-repost:${postId}:${getDayKey()}`,
        meta: { postId }
      });
    }

    const countRes = await pool.query(
      "SELECT COUNT(*)::int AS count FROM post_reposts WHERE post_id = $1",
      [postId]
    );

    res.json({
      success: true,
      reposted,
      reposts_count: Number(countRes.rows[0]?.count || 0)
    });
  } catch (err) {
    console.error("POST REPOST ERROR:", err);
    res.status(500).json({ error: "post_repost_failed" });
  }
});

app.post("/api/user-tracks/:id/repost", auth, async (req, res) => {
  try {
    const trackId = Number(req.params.id);
    const userId = req.user.id;

    if (!trackId) {
      return res.status(400).json({ error: "invalid_track_id" });
    }

    const trackRes = await pool.query(
      "SELECT id, user_id FROM user_tracks WHERE id = $1",
      [trackId]
    );

    if (!trackRes.rows.length) {
      return res.status(404).json({ error: "track_not_found" });
    }

    const track = trackRes.rows[0];
    if (Number(track.user_id) === Number(userId)) {
      return res.status(400).json({ error: "cannot_repost_own_track" });
    }

    const existingRes = await pool.query(
      "SELECT id FROM track_reposts WHERE track_id = $1 AND user_id = $2",
      [trackId, userId]
    );

    let reposted = false;

    if (existingRes.rows.length) {
      await pool.query(
        "DELETE FROM track_reposts WHERE track_id = $1 AND user_id = $2",
        [trackId, userId]
      );
    } else {
      await pool.query(
        "INSERT INTO track_reposts (track_id, user_id) VALUES ($1, $2)",
        [trackId, userId]
      );
      reposted = true;

      await awardXP(userId, "track_repost", {
        amount: 8,
        cooldownSeconds: 20,
        dailyLimit: 20,
        eventKey: `track-repost:${trackId}:${getDayKey()}`,
        meta: { trackId }
      });
    }

    const countRes = await pool.query(
      "SELECT COUNT(*)::int AS count FROM track_reposts WHERE track_id = $1",
      [trackId]
    );

    res.json({
      success: true,
      reposted,
      reposts_count: Number(countRes.rows[0]?.count || 0)
    });
  } catch (err) {
    console.error("TRACK REPOST ERROR:", err);
    res.status(500).json({ error: "track_repost_failed" });
  }
});

app.get("/api/posts/:id/comments", async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const viewerId = getOptionalUserIdFromReq(req);

    if (!postId) {
      return res.status(400).json({ error: "invalid_post_id" });
    }

    const commentsRes = await pool.query(
      `
      SELECT
        c.id,
        c.post_id,
        c.parent_id,
        c.user_id,
        c.text,
        c.created_at,
        u.username,
        u.username_tag,
        u.avatar,
        CASE
          WHEN $2::int IS NULL THEN false
          ELSE (
            c.user_id = $2
            OR EXISTS (
              SELECT 1
              FROM posts p
              WHERE p.id = c.post_id
                AND p.user_id = $2
            )
          )
        END AS can_delete,
        (
          SELECT COUNT(*)::int
          FROM post_comment_reactions r
          WHERE r.comment_id = c.id AND r.reaction = 'like'
        ) AS likes_count,
        (
          SELECT COUNT(*)::int
          FROM post_comment_reactions r
          WHERE r.comment_id = c.id AND r.reaction = 'dislike'
        ) AS dislikes_count,
        (
          SELECT reaction
          FROM post_comment_reactions r
          WHERE r.comment_id = c.id AND r.user_id = $2
          LIMIT 1
        ) AS my_reaction
      FROM post_comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.post_id = $1
      ORDER BY COALESCE(c.parent_id, c.id), c.parent_id NULLS FIRST, c.created_at ASC
      `,
      [postId, viewerId]
    );

    res.json(commentsRes.rows);
  } catch (err) {
    console.error("POST COMMENTS LOAD ERROR:", err);
    res.status(500).json({ error: "post_comments_load_failed" });
  }
});

app.post("/api/posts/:id/comments", auth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const userId = req.user.id;
    const parentId = req.body?.parentId ? Number(req.body.parentId) : null;
    const text = String(req.body?.text || "").trim();

    if (!postId || !text) {
      return res.status(400).json({ error: "comment_text_required" });
    }

    if (text.length > 500) {
      return res.status(400).json({ error: "comment_too_long" });
    }

    const postRes = await pool.query(
      "SELECT id FROM posts WHERE id = $1",
      [postId]
    );

    if (!postRes.rows.length) {
      return res.status(404).json({ error: "post_not_found" });
    }

    if (parentId) {
      const parentRes = await pool.query(
        "SELECT id, post_id FROM post_comments WHERE id = $1",
        [parentId]
      );

      if (!parentRes.rows.length || Number(parentRes.rows[0].post_id) !== postId) {
        return res.status(400).json({ error: "invalid_parent_comment" });
      }
    }

    const lastRes = await pool.query(
      `
      SELECT created_at
      FROM post_comments
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [userId]
    );

    if (lastRes.rows.length) {
      const lastTime = new Date(lastRes.rows[0].created_at).getTime();
      if (Date.now() - lastTime < 1200) {
        return res.status(429).json({ error: "comment_rate_limited" });
      }
    }

    await pool.query(
      `
      INSERT INTO post_comments (post_id, user_id, parent_id, text)
      VALUES ($1, $2, $3, $4)
      `,
      [postId, userId, parentId, text]
    );

    let xpState = null;
    if (text.length > 2) {
      xpState = await awardXP(
        userId,
        parentId ? "post_reply" : "post_comment",
        {
          amount: parentId ? 4 : 8,
          cooldownSeconds: parentId ? 15 : 25,
          dailyLimit: parentId ? 20 : 15,
          eventKey: parentId
            ? `post-reply:${parentId}:${getDayKey()}`
            : `post-comment:${postId}:${getDayKey()}`,
          meta: {
            postId,
            parentId: parentId || null
          }
        }
      );
    }

    const countRes = await pool.query(
      "SELECT COUNT(*)::int AS count FROM post_comments WHERE post_id = $1",
      [postId]
    );

    res.json({
      success: true,
      comments_count: countRes.rows[0]?.count || 0,
      ...(xpState ? getXpPayload(xpState) : {})
    });
  } catch (err) {
    console.error("POST COMMENT CREATE ERROR:", err);
    res.status(500).json({ error: "post_comment_create_failed" });
  }
});

app.delete("/api/post-comments/:id", auth, async (req, res) => {
  try {
    const commentId = Number(req.params.id);
    const userId = req.user.id;

    if (!commentId) {
      return res.status(400).json({ error: "invalid_comment_id" });
    }

    const commentRes = await pool.query(
      `
      SELECT
        c.id,
        c.post_id,
        c.user_id,
        p.user_id AS post_owner_id
      FROM post_comments c
      JOIN posts p ON p.id = c.post_id
      WHERE c.id = $1
      `,
      [commentId]
    );

    if (!commentRes.rows.length) {
      return res.status(404).json({ error: "comment_not_found" });
    }

    const comment = commentRes.rows[0];
    const canDelete = Number(comment.user_id) === Number(userId) || Number(comment.post_owner_id) === Number(userId);

    if (!canDelete) {
      return res.status(403).json({ error: "comment_delete_forbidden" });
    }

    await pool.query(
      "DELETE FROM post_comments WHERE id = $1",
      [commentId]
    );

    const countRes = await pool.query(
      "SELECT COUNT(*)::int AS count FROM post_comments WHERE post_id = $1",
      [comment.post_id]
    );

    res.json({
      success: true,
      post_id: Number(comment.post_id),
      comments_count: Number(countRes.rows[0]?.count || 0)
    });
  } catch (err) {
    console.error("POST COMMENT DELETE ERROR:", err);
    res.status(500).json({ error: "post_comment_delete_failed" });
  }
});

app.post("/api/post-comments/:id/reaction", auth, async (req, res) => {
  try {
    const commentId = Number(req.params.id);
    const userId = req.user.id;
    const reaction = req.body?.reaction;

    if (!commentId || !["like", "dislike", null].includes(reaction ?? null)) {
      return res.status(400).json({ error: "invalid_reaction" });
    }

    const commentRes = await pool.query(
      "SELECT id FROM post_comments WHERE id = $1",
      [commentId]
    );

    if (!commentRes.rows.length) {
      return res.status(404).json({ error: "comment_not_found" });
    }

    const existingRes = await pool.query(
      "SELECT reaction FROM post_comment_reactions WHERE comment_id = $1 AND user_id = $2",
      [commentId, userId]
    );

    const existing = existingRes.rows[0]?.reaction || null;
    let nextReaction = reaction ?? null;

    if (!reaction || existing === reaction) {
      await pool.query(
        "DELETE FROM post_comment_reactions WHERE comment_id = $1 AND user_id = $2",
        [commentId, userId]
      );
      nextReaction = null;
    } else if (existing) {
      await pool.query(
        "UPDATE post_comment_reactions SET reaction = $1 WHERE comment_id = $2 AND user_id = $3",
        [reaction, commentId, userId]
      );
    } else {
      await pool.query(
        "INSERT INTO post_comment_reactions (comment_id, user_id, reaction) VALUES ($1, $2, $3)",
        [commentId, userId, reaction]
      );
    }

    const countsRes = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE reaction = 'like')::int AS likes_count,
        COUNT(*) FILTER (WHERE reaction = 'dislike')::int AS dislikes_count
      FROM post_comment_reactions
      WHERE comment_id = $1
      `,
      [commentId]
    );

    res.json({
      success: true,
      reaction: nextReaction,
      likes_count: countsRes.rows[0]?.likes_count || 0,
      dislikes_count: countsRes.rows[0]?.dislikes_count || 0
    });
  } catch (err) {
    console.error("POST COMMENT REACTION ERROR:", err);
    res.status(500).json({ error: "post_comment_reaction_failed" });
  }
});

app.use((req, res, next) => {
  // НЕ ТРОГАЕМ API
  if (req.path.startsWith("/api")) {
    return next();
  }

  res.sendFile(path.join(__dirname, "../public/index.html"));
});
app.post("/api/posts/:id/view", auth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const userId = req.user.id;

    const postRes = await pool.query(
      "SELECT id, user_id FROM posts WHERE id = $1",
      [postId]
    );

    if (!postRes.rows.length) {
      return res.status(404).json({ error: "post_not_found" });
    }

    const post = postRes.rows[0];

    if (Number(post.user_id) !== Number(userId)) {
      await pool.query(
        `
        INSERT INTO post_views (post_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (post_id, user_id) DO NOTHING
        `,
        [postId, userId]
      );
    }

    const countRes = await pool.query(
      "SELECT COUNT(*)::int AS count FROM post_views WHERE post_id = $1",
      [postId]
    );

    res.json({
      success: true,
      views_count: countRes.rows[0].count
    });
  } catch (err) {
    console.error("POST VIEW ERROR:", err);
    res.status(500).json({ error: "post_view_failed" });
  }
});
app.post("/api/user-tracks/:id/listen", auth, async (req, res) => {
  try {
    const trackId = Number(req.params.id);
    const userId = req.user.id;

    const trackRes = await pool.query(
      "SELECT id, user_id FROM user_tracks WHERE id = $1",
      [trackId]
    );

    if (!trackRes.rows.length) {
      return res.status(404).json({ error: "track_not_found" });
    }

    const track = trackRes.rows[0];

    // ❌ НЕ считаем свои прослушивания
    if (Number(track.user_id) !== Number(userId)) {

      // ✅ ПРОСТО вставляем (БЕЗ ON CONFLICT)
      await pool.query(
        `
        INSERT INTO track_listens (track_id, user_id)
        VALUES ($1, $2)
        `,
        [trackId, userId]
      );
    }

    const countRes = await pool.query(
      "SELECT COUNT(*)::int AS count FROM track_listens WHERE track_id = $1",
      [trackId]
    );

    res.json({
      success: true,
      listens_count: countRes.rows[0].count
    });

  } catch (err) {
    console.error("TRACK LISTEN ERROR:", err);
    res.status(500).json({ error: "track_listen_failed" });
  }
});

(async () => {
  try {
    await ensureSocialAuthSchema();
    await ensureSupportSchema();
    await ensureTelegramAuthSchema();
await ensureEmailVerificationSchema();
await ensureXPSystemSchema();
await ensurePostSocialSchema();
await ensureTrackCommentsSchema();
await ensureTrackActionsSchema();
await ensureTrackRepostSchema();
await ensureProfileTrackRatingsSchema();
await ensureMentionsSchema();
await ensureHomeNewsSchema();
await ensureUserBadgeSchema();
await ensureCommunitySchema();
await ensurePlaylistsSchema();
    app.listen(APP_PORT, () => {
      console.log(`Server running on ${APP_BASE_URL} (port ${APP_PORT})`);
      syncTelegramWebhooks().catch((error) => {
        console.error("TELEGRAM WEBHOOK SYNC ERROR:", error);
      });
    });
  } catch (err) {
    console.error("BOOT ERROR:", err);
    process.exit(1);
  }
})();
