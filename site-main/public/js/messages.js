let messagesState = {
  conversations: [],
  activeConversationId: null,
  searchResults: [],
  activeMessages: [],
  replyToMessage: null,
  forwardMessage: null,
  contextMessageId: null,
  createType: "group",
  activeConversationDetails: null,
  pendingInvites: [],
  attachmentFile: null,
  createAvatarFile: null,
  editAvatarFile: null,
  livePollInterval: null
};

function msgEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMessageTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatConversationTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return formatMessageTime(value);
  }

  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit"
  });
}

function formatConversationMonth(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric"
  });
}

function getCurrentConversation() {
  return messagesState.conversations.find((item) => Number(item.id) === Number(messagesState.activeConversationId)) || null;
}

function clearMessagesLivePolling() {
  if (messagesState.livePollInterval) {
    clearInterval(messagesState.livePollInterval);
    messagesState.livePollInterval = null;
  }
}

function getMessagesThreadBottomOffset(thread) {
  if (!thread) return 0;
  return thread.scrollHeight - thread.scrollTop - thread.clientHeight;
}

function haveActiveMessagesChanged(nextItems = []) {
  const currentItems = Array.isArray(messagesState.activeMessages) ? messagesState.activeMessages : [];
  const safeNextItems = Array.isArray(nextItems) ? nextItems : [];

  if (currentItems.length !== safeNextItems.length) return true;

  for (let i = 0; i < safeNextItems.length; i += 1) {
    const current = currentItems[i];
    const next = safeNextItems[i];

    if (!current || !next) return true;
    if (Number(current.id) !== Number(next.id)) return true;
    if (String(current.text || "") !== String(next.text || "")) return true;
    if (Boolean(current.is_read) !== Boolean(next.is_read)) return true;
    if (String(current.updated_at || "") !== String(next.updated_at || "")) return true;
    if (String(current.attachment_url || "") !== String(next.attachment_url || "")) return true;
    if (JSON.stringify(current.reactions || []) !== JSON.stringify(next.reactions || [])) return true;
  }

  return false;
}

function renderActiveConversationMessages(items, options = {}) {
  const {
    forceScrollBottom = false,
    preserveViewport = true
  } = options;

  const thread = document.getElementById("messagesThread");
  if (!thread) return;

  const previousScrollTop = thread.scrollTop;
  const previousBottomOffset = getMessagesThreadBottomOffset(thread);
  const shouldStickToBottom = forceScrollBottom || previousBottomOffset < 120;

  messagesState.activeMessages = Array.isArray(items) ? items : [];

  thread.innerHTML = messagesState.activeMessages.length
    ? messagesState.activeMessages.map((item) => renderMessageBubble(item)).join("")
    : `<div class="messages-empty">Сообщений пока нет</div>`;

  bindThreadInteractions();

  if (shouldStickToBottom) {
    thread.scrollTop = thread.scrollHeight;
    return;
  }

  if (preserveViewport) {
    thread.scrollTop = previousScrollTop;
  }
}

async function refreshActiveConversationMessages(options = {}) {
  const {
    forceScrollBottom = false,
    refreshConversations = false
  } = options;

  const token = localStorage.getItem("token");
  const conversationId = Number(messagesState.activeConversationId || 0);
  const thread = document.getElementById("messagesThread");
  const head = document.getElementById("messagesChatHead");

  if (!token || !conversationId || !thread || !head) return;

  const res = await fetch(`/api/messages/conversations/${conversationId}`, {
    headers: { Authorization: "Bearer " + token }
  });

  const items = res.ok ? await res.json() : [];
  const safeItems = Array.isArray(items) ? items : [];
  const changed = haveActiveMessagesChanged(safeItems);

  if (changed || forceScrollBottom) {
    renderActiveConversationMessages(safeItems, {
      forceScrollBottom,
      preserveViewport: !forceScrollBottom
    });
  }

  if (refreshConversations) {
    await loadConversations();
  }

  applyConversationPermissions();
}

function startMessagesLivePolling() {
  clearMessagesLivePolling();

  messagesState.livePollInterval = setInterval(async () => {
    const thread = document.getElementById("messagesThread");
    const conversationList = document.getElementById("messagesConversationList");

    if (!thread || !conversationList) {
      clearMessagesLivePolling();
      return;
    }

    if (!messagesState.activeConversationId) return;

    try {
      await refreshActiveConversationMessages({ refreshConversations: true });
      await window.loadNavbarNotifications?.();
      await window.loadNavbarMessagesBadge?.();
    } catch (error) {
      console.error("messages live polling error:", error);
    }
  }, 2500);
}

function applyConversationPermissions() {
  const input = document.getElementById("messageComposer");
  const sendBtn = document.getElementById("sendMessageBtn");
  const currentConversation = getCurrentConversation();
  if (!input || !sendBtn) return;

  const blocked = Boolean(currentConversation?.peer_blocked);
  input.disabled = blocked;
  sendBtn.disabled = blocked;
  input.placeholder = blocked
    ? "Сообщения от этого пользователя отключены"
    : "Напиши сообщение";
}

function closeMessageContextMenu() {
  const menu = document.getElementById("messageContextMenu");
  if (!menu) return;
  menu.classList.remove("active");
  menu.style.left = "";
  menu.style.top = "";
  messagesState.contextMessageId = null;
}

function setComposerMeta() {
  const meta = document.getElementById("messagesComposerMeta");
  if (!meta) return;

  if (messagesState.replyToMessage) {
    meta.innerHTML = `
      <div class="messages-composer-meta-card">
        <div class="messages-composer-meta-label">Ответ</div>
        <div class="messages-composer-meta-title">${msgEscape(messagesState.replyToMessage.sender_name || "Сообщение")}</div>
        <div class="messages-composer-meta-text">${msgEscape(messagesState.replyToMessage.text || "")}</div>
      </div>
      <button type="button" class="messages-composer-meta-close" data-clear-composer-meta>
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    meta.classList.remove("messages-hidden");
  } else if (messagesState.forwardMessage) {
    meta.innerHTML = `
      <div class="messages-composer-meta-card">
        <div class="messages-composer-meta-label">Пересылка</div>
        <div class="messages-composer-meta-text">${msgEscape(messagesState.forwardMessage.text || "")}</div>
      </div>
      <button type="button" class="messages-composer-meta-close" data-clear-composer-meta>
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    meta.classList.remove("messages-hidden");
  } else if (messagesState.attachmentFile) {
    meta.innerHTML = `
      <div class="messages-composer-meta-card">
        <div class="messages-composer-meta-label">Файл</div>
        <div class="messages-composer-meta-title">${msgEscape(messagesState.attachmentFile.name || "Вложение")}</div>
        <div class="messages-composer-meta-text">${msgEscape(formatFileSize(messagesState.attachmentFile.size || 0))}</div>
      </div>
      <button type="button" class="messages-composer-meta-close" data-clear-composer-meta>
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    meta.classList.remove("messages-hidden");
  } else {
    meta.innerHTML = "";
    meta.classList.add("messages-hidden");
  }

  meta.querySelector("[data-clear-composer-meta]")?.addEventListener("click", () => {
    messagesState.replyToMessage = null;
    messagesState.forwardMessage = null;
    messagesState.attachmentFile = null;
    const attachmentInput = document.getElementById("messageAttachmentInput");
    if (attachmentInput) attachmentInput.value = "";
    updateAttachmentName();
    setComposerMeta();
  });
}

function formatFileSize(size) {
  const value = Number(size || 0);
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function extractLinksFromText(text = "") {
  const matches = String(text || "").match(/((https?:\/\/|www\.)[^\s]+)/gi) || [];
  return matches;
}

function updateAttachmentName() {
  const attachmentName = document.getElementById("messageAttachmentName");
  if (!attachmentName) return;
  attachmentName.textContent = messagesState.attachmentFile?.name || "Файл не выбран";
}

function setCreateAvatarPreview(file = null) {
  const preview = document.getElementById("messagesCreateAvatarPreview");
  const icon = document.getElementById("messagesCreateAvatarIcon");
  const name = document.getElementById("messagesCreateAvatarName");
  if (!preview || !icon || !name) return;

  if (file) {
    preview.src = URL.createObjectURL(file);
    preview.classList.remove("messages-hidden");
    icon.classList.add("messages-hidden");
    name.textContent = file.name;
    return;
  }

  preview.removeAttribute("src");
  preview.classList.add("messages-hidden");
  icon.classList.remove("messages-hidden");
  name.textContent = "Фото группы не выбрано";
}

function setEditAvatarPreview(file = null, currentUrl = "") {
  const preview = document.getElementById("messagesConversationEditAvatarPreview");
  const icon = document.getElementById("messagesConversationEditAvatarIcon");
  const name = document.getElementById("messagesConversationEditAvatarName");
  if (!preview || !icon || !name) return;

  if (file) {
    preview.src = URL.createObjectURL(file);
    preview.classList.remove("messages-hidden");
    icon.classList.add("messages-hidden");
    name.textContent = file.name;
    return;
  }

  if (currentUrl) {
    preview.src = currentUrl;
    preview.classList.remove("messages-hidden");
    icon.classList.add("messages-hidden");
    name.textContent = "Текущее фото группы";
    return;
  }

  preview.removeAttribute("src");
  preview.classList.add("messages-hidden");
  icon.classList.remove("messages-hidden");
  name.textContent = "Фото группы не выбрано";
}

function renderReactionLine(reactions) {
  const safeReactions = Array.isArray(reactions) ? reactions : [];
  if (!safeReactions.length) return "";

  return `
    <div class="messages-reactions">
      ${safeReactions.map((reaction) => `
        <button type="button" class="messages-reaction-chip" data-message-id="${reaction.message_id}" data-reaction="${msgEscape(reaction.emoji)}">
          <span>${msgEscape(reaction.emoji)}</span>
          <span>${reaction.count}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderMessageChecks(item) {
  if (Number(item.sender_id) !== Number(window.currentUser?.id || 0)) return "";
  const icon = item.is_read ? "fa-check-double" : "fa-check";
  const stateClass = item.is_read ? "read" : "sent";
  return `<span class="messages-bubble-checks ${stateClass}"><i class="fa-solid ${icon}"></i></span>`;
}

function getAttachmentKind(type = "") {
  const safeType = String(type || "");
  if (safeType.startsWith("image/")) return "image";
  if (safeType.startsWith("video/")) return "video";
  if (safeType.startsWith("audio/")) return "audio";
  const extSource = String(type || "").toLowerCase();
  if (/\.(png|jpe?g|webp|gif|bmp|svg)$/.test(extSource)) return "image";
  if (/\.(mp4|webm|mov|m4v|avi|mkv)$/.test(extSource)) return "video";
  if (/\.(mp3|wav|ogg|m4a|flac|aac)$/.test(extSource)) return "audio";
  return "file";
}

function renderMessageAttachment(item) {
  if (!item?.attachment_url) return "";

  const kind = getAttachmentKind(item.attachment_type || item.attachment_name || item.attachment_url);
  const safeUrl = msgEscape(item.attachment_url);
  const safeName = msgEscape(item.attachment_name || "Вложение");

  if (kind === "image") {
    return `
      <button type="button" class="messages-attachment-card is-media is-image" data-media-kind="image" data-media-url="${safeUrl}" data-media-name="${safeName}">
        <img src="${safeUrl}" alt="${safeName}">
      </button>
    `;
  }

  if (kind === "video") {
    return `
      <div class="messages-attachment-card is-media is-video">
        <video controls preload="metadata" src="${safeUrl}"></video>
      </div>
    `;
  }

  if (kind === "audio") {
    return `
      <div class="messages-attachment-audio" data-audio-card>
        <button type="button" class="messages-attachment-audio-play" data-audio-toggle aria-label="Воспроизвести аудио">
          <i class="fa-solid fa-play"></i>
        </button>
        <div class="messages-attachment-audio-copy">
          <div class="messages-attachment-audio-title">${safeName}</div>
          <div class="messages-attachment-audio-progress">
            <input type="range" class="messages-attachment-audio-slider" min="0" max="100" value="0" step="0.1" data-audio-seek aria-label="Перемотать аудио">
          </div>
          <div class="messages-attachment-audio-meta">
            <div class="messages-attachment-audio-time">
              <span data-audio-current>00:00</span>
              <span class="messages-attachment-audio-meta-separator">/</span>
              <span data-audio-duration>--:--</span>
            </div>
            <label class="messages-attachment-audio-volume" aria-label="Громкость">
              <i class="fa-solid fa-volume-low" data-audio-volume-icon></i>
              <input type="range" class="messages-attachment-audio-volume-slider" min="0" max="100" value="100" step="1" data-audio-volume>
            </label>
          </div>
        </div>
        <audio preload="metadata" src="${safeUrl}" data-audio-element></audio>
      </div>
    `;
  }

  return `
    <a href="${safeUrl}" target="_blank" rel="noopener" download class="messages-attachment-card">
      <div class="messages-attachment-file"><i class="fa-solid fa-file-arrow-down"></i><span>${safeName}</span></div>
    </a>
  `;
}

function renderMessageBubble(item) {
  const isMine = Number(item.sender_id) === Number(window.currentUser?.id || 0);
  const bubbleClasses = [];

  if (isMine) bubbleClasses.push("mine");

  const attachmentKind = item?.attachment_url
    ? getAttachmentKind(item.attachment_type || item.attachment_name || item.attachment_url)
    : "";

  if (attachmentKind) bubbleClasses.push(`has-${attachmentKind}-attachment`);
  if (attachmentKind === "audio" && !item.text) bubbleClasses.push("is-audio-only");

  const bubbleClass = bubbleClasses.join(" ");

  return `
    <div class="messages-bubble-row messages-message-row ${bubbleClass}" data-chat-message-id="${item.id}">
      <div class="messages-bubble messages-message-bubble ${bubbleClass}" data-chat-message-trigger="${item.id}">
        ${item.forwarded_from_message_id ? `
          <div class="messages-bubble-forwarded messages-message-forwarded">
            <i class="fa-solid fa-share"></i>
            <span>Переслано от ${msgEscape(item.forwarded_sender_username || item.forwarded_sender_tag || "user")}</span>
          </div>
        ` : ""}
        ${item.reply_to_message_id ? `
          <button type="button" class="messages-bubble-quote messages-message-quote" data-jump-message-id="${item.reply_to_message_id}">
            <div class="messages-bubble-quote-name messages-message-quote-name">${msgEscape(item.reply_sender_username || item.reply_sender_tag || "user")}</div>
            <div class="messages-bubble-quote-text messages-message-quote-text">${msgEscape(item.reply_text || "")}</div>
          </button>
        ` : ""}
        ${renderMessageAttachment(item)}
        ${item.text ? `<div class="messages-bubble-text messages-message-text">${msgEscape(item.text || "")}</div>` : ""}
        ${renderReactionLine(item.reactions)}
        <div class="messages-bubble-meta messages-message-meta">
          <span class="messages-bubble-time messages-message-time">${formatMessageTime(item.created_at)}</span>
          ${renderMessageChecks(item)}
        </div>
      </div>
    </div>
  `;
}

function openCreateConversationModal(type) {
  messagesState.createType = "group";
  document.getElementById("messagesCreateTitle").textContent = "Создать группу";
  document.getElementById("messagesCreateNameLabel").textContent = "Название группы";
  document.getElementById("messagesCreateSubmit").textContent = "Создать";
  document.getElementById("messagesCreateName").value = "";
  const descriptionInput = document.getElementById("messagesCreateDescription");
  if (descriptionInput) descriptionInput.value = "";
  const avatarInput = document.getElementById("messagesCreateAvatarInput");
  if (avatarInput) avatarInput.value = "";
  messagesState.createAvatarFile = null;
  setCreateAvatarPreview(null);
  document.getElementById("messagesCreateError").innerText = "";
  document.getElementById("messagesCreateDescriptionWrap")?.classList.remove("messages-hidden");
  document.getElementById("messagesCreateModal")?.classList.add("active");
  document.getElementById("messagesCreateName")?.focus();
}

function closeCreateConversationModal() {
  document.getElementById("messagesCreateModal")?.classList.remove("active");
}

function closeConversationModal() {
  document.getElementById("messagesConversationModal")?.classList.remove("active");
}

function closeConversationEditModal() {
  document.getElementById("messagesConversationEditModal")?.classList.remove("active");
}

async function submitCreateConversation() {
  const token = localStorage.getItem("token");
  const name = String(document.getElementById("messagesCreateName")?.value || "").trim();
  const description = String(document.getElementById("messagesCreateDescription")?.value || "").trim();
  const error = document.getElementById("messagesCreateError");
  if (error) error.innerText = "";
  if (!token) return;

  const formData = new FormData();
  formData.append("type", messagesState.createType);
  formData.append("title", name);
  formData.append("description", description);
  if (messagesState.createAvatarFile) {
    formData.append("avatar", messagesState.createAvatarFile);
  }

  const res = await fetch("/api/messages/conversations/create", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token
    },
    body: formData
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (error) {
      error.innerText = data.error === "conversation_title_required"
        ? "Введи название группы."
        : "Не удалось создать группу.";
    }
    return;
  }

  closeCreateConversationModal();
  await loadConversations();
  if (data.conversationId) {
    await openConversation(data.conversationId);
    navigate(`/messages?conversation=${data.conversationId}`);
  }
}

async function toggleConversationPin() {
  const token = localStorage.getItem("token");
  const currentConversation = getCurrentConversation();
  if (!token || !currentConversation) return;

  const res = await fetch(`/api/messages/conversations/${currentConversation.id}/pin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify({ pinned: !Boolean(currentConversation.is_pinned) })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.error === "pin_limit_reached" ? "Можно закрепить максимум 5 чатов." : "Не удалось обновить закреп.");
    return;
  }

  await loadConversations();
  await openConversation(currentConversation.id);
}

async function loadConversationDetails(conversationId) {
  const token = localStorage.getItem("token");
  if (!token || !conversationId) return null;
  const res = await fetch(`/api/messages/conversations/${conversationId}/details`, {
    headers: { Authorization: "Bearer " + token }
  });
  if (!res.ok) return null;
  return res.json();
}

async function openConversationInfoModal() {
  const currentConversation = getCurrentConversation();
  const modal = document.getElementById("messagesConversationModal");
  const content = document.getElementById("messagesConversationContent");
  if (!currentConversation || !modal || !content) return;

  const details = await loadConversationDetails(currentConversation.id);
  messagesState.activeConversationDetails = details;
  const isOwner = Boolean(details?.is_owner);

  content.innerHTML = `
    <div class="messages-conversation-profile">
      <img class="messages-conversation-profile-avatar" src="${details?.avatar || currentConversation.peer_avatar || "/images/default-avatar.jpg"}" alt="${msgEscape(details?.title || currentConversation.peer_username || "chat")}">
      <div class="messages-conversation-profile-copy">
        <div class="messages-conversation-profile-title">${msgEscape(details?.title || currentConversation.peer_username || "Без названия")}</div>
        <div class="messages-conversation-profile-subtitle">
          Группа · ${Number(details?.members_count || 1)} участников
        </div>
      </div>
    </div>
    <div class="messages-conversation-profile-actions">
      ${isOwner ? `<button type="button" class="messages-send-btn" id="messagesConversationInviteQuickBtn">Пригласить</button>` : ""}
      ${isOwner ? `<button type="button" class="messages-chat-pref-btn" id="messagesConversationManageBtn">Редактировать</button>` : ""}
      ${!isOwner ? `<button type="button" class="messages-chat-pref-btn is-danger" id="messagesConversationLeaveBtn">Выйти из группы</button>` : ""}
      ${isOwner ? `<button type="button" class="messages-chat-pref-btn is-danger" id="messagesConversationDeleteBtn">Удалить</button>` : ""}
    </div>
    <div class="messages-conversation-profile-section">
      <div class="messages-conversation-profile-section-label">Описание</div>
      <div class="messages-conversation-profile-section-text">${msgEscape(details?.description || "Пока без описания")}</div>
    </div>
    <div class="messages-conversation-profile-stats">
      <button type="button" class="messages-conversation-profile-stat messages-conversation-profile-stat-button" data-conversation-members>
        <span class="messages-conversation-profile-stat-value">${Number(details?.members_count || 1)}</span>
        <span class="messages-conversation-profile-stat-label">Участников</span>
      </button>
      <div class="messages-conversation-profile-stat">
        <span class="messages-conversation-profile-stat-value">${Number(details?.messages_count || 0)}</span>
        <span class="messages-conversation-profile-stat-label">Сообщений</span>
      </div>
      <div class="messages-conversation-profile-stat">
        <span class="messages-conversation-profile-stat-value">${details?.created_at ? formatConversationTime(details.created_at) : "—"}</span>
        <span class="messages-conversation-profile-stat-label">Создан</span>
      </div>
    </div>
    <div class="messages-conversation-media-stats">
      <button type="button" class="messages-conversation-media-stat" data-media-browser-type="photos">
        <span class="messages-conversation-media-stat-icon"><i class="fa-regular fa-image"></i></span>
        <div class="messages-conversation-media-stat-copy">
          <div class="messages-conversation-media-stat-value">${Number(details?.photos_count || 0)}</div>
          <div class="messages-conversation-media-stat-label">photos</div>
        </div>
      </button>
      <button type="button" class="messages-conversation-media-stat" data-media-browser-type="videos">
        <span class="messages-conversation-media-stat-icon"><i class="fa-regular fa-circle-play"></i></span>
        <div class="messages-conversation-media-stat-copy">
          <div class="messages-conversation-media-stat-value">${Number(details?.videos_count || 0)}</div>
          <div class="messages-conversation-media-stat-label">videos</div>
        </div>
      </button>
      <button type="button" class="messages-conversation-media-stat" data-media-browser-type="audio">
        <span class="messages-conversation-media-stat-icon"><i class="fa-solid fa-headphones"></i></span>
        <div class="messages-conversation-media-stat-copy">
          <div class="messages-conversation-media-stat-value">${Number(details?.audio_count || 0)}</div>
          <div class="messages-conversation-media-stat-label">audio files</div>
        </div>
      </button>
      <button type="button" class="messages-conversation-media-stat" data-media-browser-type="files">
        <span class="messages-conversation-media-stat-icon"><i class="fa-regular fa-file-lines"></i></span>
        <div class="messages-conversation-media-stat-copy">
          <div class="messages-conversation-media-stat-value">${Number(details?.files_count || 0)}</div>
          <div class="messages-conversation-media-stat-label">files</div>
        </div>
      </button>
      <button type="button" class="messages-conversation-media-stat" data-media-browser-type="links">
        <span class="messages-conversation-media-stat-icon"><i class="fa-solid fa-link"></i></span>
        <div class="messages-conversation-media-stat-copy">
          <div class="messages-conversation-media-stat-value">${Number(details?.links_count || 0)}</div>
          <div class="messages-conversation-media-stat-label">shared links</div>
        </div>
      </button>
    </div>
  `;

  content.querySelector("#messagesConversationInviteQuickBtn")?.addEventListener("click", async () => {
    closeConversationModal();
    await openConversationInviteFlow();
  });

  content.querySelector("#messagesConversationManageBtn")?.addEventListener("click", () => {
    closeConversationModal();
    openConversationEditModal();
  });

  content.querySelector("#messagesConversationDeleteBtn")?.addEventListener("click", async () => {
    await deleteConversation();
  });
  content.querySelector("#messagesConversationLeaveBtn")?.addEventListener("click", async () => {
    await leaveConversation();
  });
  content.querySelector("[data-conversation-members]")?.addEventListener("click", () => {
    closeConversationModal();
    openConversationMembersBrowser();
  });
  content.querySelectorAll("[data-media-browser-type]").forEach((button) => {
    button.addEventListener("click", () => {
      closeConversationModal();
      openConversationMediaBrowser(button.dataset.mediaBrowserType);
    });
  });

  modal.classList.add("active");
}

async function openConversationInviteFlow() {
  const currentConversation = getCurrentConversation();
  if (!currentConversation || currentConversation.conversation_type !== "group") return;

  let details = messagesState.activeConversationDetails;
  if (!details || Number(details.id) !== Number(currentConversation.id)) {
    details = await loadConversationDetails(currentConversation.id);
    messagesState.activeConversationDetails = details;
  }

  if (!details?.is_owner) {
    alert("Приглашать участников в эту группу может только владелец.");
    return;
  }

  openConversationEditModal();
  const tagInput = document.getElementById("messagesConversationInviteTag");
  if (tagInput) {
    requestAnimationFrame(() => tagInput.focus());
  }
}

function openConversationEditModal() {
  const currentConversation = getCurrentConversation();
  const details = messagesState.activeConversationDetails;
  const modal = document.getElementById("messagesConversationEditModal");
  if (!currentConversation || !details || !modal) return;

  document.getElementById("messagesConversationEditTitle").textContent =
    "Редактировать группу";
  document.getElementById("messagesConversationEditName").value = details.title || currentConversation.peer_username || "";
  document.getElementById("messagesConversationEditDescription").value = details.description || "";
  document.getElementById("messagesConversationInviteTag").value = "";
  const editAvatarInput = document.getElementById("messagesConversationEditAvatarInput");
  if (editAvatarInput) editAvatarInput.value = "";
  messagesState.editAvatarFile = null;
  setEditAvatarPreview(null, details.avatar || currentConversation.peer_avatar || "");
  document.getElementById("messagesConversationEditError").innerText = "";
  modal.classList.add("active");
}

async function saveConversationDetails() {
  const token = localStorage.getItem("token");
  const currentConversation = getCurrentConversation();
  const error = document.getElementById("messagesConversationEditError");
  if (!token || !currentConversation || !error) return;
  error.innerText = "";

  const title = String(document.getElementById("messagesConversationEditName")?.value || "").trim();
  const description = String(document.getElementById("messagesConversationEditDescription")?.value || "").trim();

  const formData = new FormData();
  formData.append("title", title);
  formData.append("description", description);
  if (messagesState.editAvatarFile) {
    formData.append("avatar", messagesState.editAvatarFile);
  }

  const res = await fetch(`/api/messages/conversations/${currentConversation.id}`, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer " + token
    },
    body: formData
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    error.innerText = data.error === "conversation_title_required"
      ? "Введи название."
      : "Не удалось сохранить изменения.";
    return;
  }

  closeConversationEditModal();
  await loadConversations();
  await openConversation(currentConversation.id);
}

async function inviteUserToConversation() {
  const token = localStorage.getItem("token");
  const currentConversation = getCurrentConversation();
  const error = document.getElementById("messagesConversationEditError");
  const tagInput = document.getElementById("messagesConversationInviteTag");
  if (!token || !currentConversation || !error || !tagInput) return;

  const usernameTag = String(tagInput.value || "").trim();
  if (!usernameTag) {
    error.innerText = "Введи @username для приглашения.";
    return;
  }

  error.innerText = "";

  const res = await fetch(`/api/messages/conversations/${currentConversation.id}/invite`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify({ usernameTag })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    error.innerText =
      data.error === "invite_user_not_found" ? "Пользователь не найден." :
      data.error === "invite_user_already_member" ? "Этот человек уже в группе." :
      data.error === "invite_already_pending" ? "Приглашение уже отправлено." :
      "Не удалось отправить приглашение.";
    return;
  }

  tagInput.value = "";
  error.innerText = "Приглашение отправлено.";
}

async function deleteConversation() {
  const token = localStorage.getItem("token");
  const currentConversation = getCurrentConversation();
  if (!token || !currentConversation) return;

  const confirmed = await window.showAppConfirm?.({
    title: "Удалить группу",
    text: "Это действие удалит чат и все сообщения без возможности восстановления.",
    confirmText: "Удалить",
    cancelText: "Отмена",
    danger: true
  });

  if (!confirmed) return;

  const res = await fetch(`/api/messages/conversations/${currentConversation.id}`, {
    method: "DELETE",
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (!res.ok) {
    alert("Не удалось удалить чат");
    return;
  }

  closeConversationModal();
  closeConversationEditModal();
  messagesState.activeConversationId = null;
  messagesState.activeMessages = [];
  messagesState.activeConversationDetails = null;
  await loadConversations();
  if (messagesState.conversations[0]?.id) {
    await openConversation(messagesState.conversations[0].id);
    navigate(`/messages?conversation=${messagesState.conversations[0].id}`);
  } else {
    navigate("/messages");
  }
}

async function leaveConversation() {
  const token = localStorage.getItem("token");
  const currentConversation = getCurrentConversation();
  if (!token || !currentConversation) return;

  const confirmed = await window.showAppConfirm?.({
    title: "Выйти из группы",
    text: "Ты перестанешь видеть новые сообщения этой группы.",
    confirmText: "Выйти",
    cancelText: "Отмена",
    danger: true
  });

  if (!confirmed) return;

  const res = await fetch(`/api/messages/conversations/${currentConversation.id}/leave`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token
    }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(window.getApiErrorMessage?.(data, "Не удалось выйти из группы") || "Не удалось выйти из группы");
    return;
  }

  closeConversationModal();
  closeConversationEditModal();
  messagesState.activeConversationId = null;
  messagesState.activeMessages = [];
  messagesState.activeConversationDetails = null;
  await loadConversations();
  navigate("/messages");
}

async function loadConversations() {
  const token = localStorage.getItem("token");
  const list = document.getElementById("messagesConversationList");
  if (!token || !list) return;

  const res = await fetch("/api/messages/conversations", {
    headers: { Authorization: "Bearer " + token }
  });
  const items = res.ok ? await res.json() : [];
  messagesState.conversations = Array.isArray(items) ? items : [];

  list.innerHTML = messagesState.conversations.length
    ? messagesState.conversations.map((item) => `
        <button type="button" class="messages-conversation-item ${Number(item.id) === Number(messagesState.activeConversationId) ? "active" : ""}" data-conversation-id="${item.id}">
          <img class="messages-conversation-avatar" src="${item.peer_avatar || "/images/default-avatar.jpg"}" alt="${msgEscape(item.peer_username || "user")}">
          <div class="messages-conversation-main">
            <div class="messages-conversation-topline">
              <div class="messages-conversation-name">${item.conversation_type === "group" ? `<i class="fa-solid fa-users"></i> ` : ""}${msgEscape(item.peer_username || item.peer_username_tag || "user")}</div>
              <div class="messages-conversation-time">${formatConversationTime(item.last_message_created_at || item.last_message_at)}</div>
            </div>
            <div class="messages-conversation-preview-row">
              <div class="messages-conversation-preview">${msgEscape(item.last_message_text || "Диалог пуст")}</div>
              <div class="messages-conversation-flags">
                ${Number(item.unread_count || 0) > 0 ? `<span class="messages-conversation-unread">${item.unread_count}</span>` : ""}
                ${item.is_pinned ? `<span class="messages-conversation-pin"><i class="fa-solid fa-thumbtack"></i></span>` : ""}
              </div>
            </div>
          </div>
        </button>
      `).join("")
    : `<div class="messages-empty">Диалогов пока нет</div>`;

  list.querySelectorAll("[data-conversation-id]").forEach((button) => {
    button.addEventListener("click", () => openConversation(button.dataset.conversationId));
  });
}

async function loadPendingInvites() {
  const token = localStorage.getItem("token");
  const container = document.getElementById("messagesInviteList");
  if (!token || !container) return;

  const res = await fetch("/api/messages/invites", {
    headers: { Authorization: "Bearer " + token }
  });
  const items = res.ok ? await res.json() : [];
  messagesState.pendingInvites = Array.isArray(items) ? items : [];

  if (!messagesState.pendingInvites.length) {
    container.innerHTML = "";
    container.classList.add("messages-hidden");
    return;
  }

  container.innerHTML = messagesState.pendingInvites.map((invite) => `
    <div class="messages-invite-card" data-invite-id="${invite.id}">
      <div class="messages-invite-copy">
        <div class="messages-invite-title">Приглашение в группу</div>
        <div class="messages-invite-text">
          <strong>${msgEscape(invite.title || "Без названия")}</strong> · от ${msgEscape(invite.inviter_username || invite.inviter_tag || "user")}
        </div>
      </div>
      <div class="messages-invite-actions">
        <button type="button" class="messages-chat-pref-btn" data-invite-action="decline">Отклонить</button>
        <button type="button" class="messages-send-btn" data-invite-action="accept">Войти</button>
      </div>
    </div>
  `).join("");

  container.classList.remove("messages-hidden");

  container.querySelectorAll("[data-invite-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const card = button.closest("[data-invite-id]");
      const inviteId = Number(card?.dataset.inviteId);
      const action = button.dataset.inviteAction;
      if (!inviteId || !action) return;

      const response = await fetch(`/api/messages/invites/${inviteId}/respond`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({ action })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;

      await loadPendingInvites();
      await loadConversations();
      if (action === "accept" && data.conversationId) {
        await openConversation(data.conversationId);
        navigate(`/messages?conversation=${data.conversationId}`);
      }
    });
  });
}

function closeMessageSearchResults() {
  const results = document.getElementById("messageUserSearchResults");
  if (!results) return;
  results.classList.remove("active");
  results.innerHTML = "";
  messagesState.searchResults = [];
}

function renderMessageSearchResults(items) {
  const results = document.getElementById("messageUserSearchResults");
  if (!results) return;

  const safeItems = Array.isArray(items) ? items : [];
  messagesState.searchResults = safeItems;

  if (!safeItems.length) {
    closeMessageSearchResults();
    return;
  }

  results.innerHTML = safeItems.map((item) => `
    <button type="button" class="messages-search-item" data-message-user-id="${item.id}">
      <img class="messages-conversation-avatar" src="${item.avatar || "/images/default-avatar.jpg"}" alt="${msgEscape(item.username || item.username_tag || "user")}">
      <div>
        <div class="messages-conversation-name">${msgEscape(item.username || item.username_tag || "user")}</div>
        <div class="messages-conversation-preview">@${msgEscape(item.username_tag || "")}</div>
      </div>
    </button>
  `).join("");
  results.classList.add("active");

  results.querySelectorAll("[data-message-user-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await startConversation(button.dataset.messageUserId);
      const input = document.getElementById("messageUserSearch");
      if (input) input.value = "";
      closeMessageSearchResults();
    });
  });
}

async function searchMessageUsers(query) {
  const clean = String(query || "").trim();
  if (clean.length < 2) {
    closeMessageSearchResults();
    return;
  }

  const res = await fetch(`/api/search?q=${encodeURIComponent(clean)}`);
  const data = res.ok ? await res.json() : { users: [] };
  renderMessageSearchResults(data.users || []);
}

async function openConversation(conversationId) {
  const token = localStorage.getItem("token");
  const thread = document.getElementById("messagesThread");
  const head = document.getElementById("messagesChatHead");
  if (!token || !thread || !head) return;

  messagesState.activeConversationId = Number(conversationId);
  const currentConversation = messagesState.conversations.find((item) => Number(item.id) === Number(conversationId));
  if (currentConversation) {
    head.innerHTML = `
      <div class="messages-chat-head-bar">
        <button type="button" class="messages-chat-head-link ${currentConversation.conversation_type === "group" ? "messages-chat-head-group-trigger" : ""}" data-message-profile="${msgEscape(currentConversation.peer_username_tag || "")}">
          <div class="messages-chat-head-inner">
            <img class="messages-chat-head-avatar" src="${currentConversation.peer_avatar || "/images/default-avatar.jpg"}" alt="${msgEscape(currentConversation.peer_username || currentConversation.peer_username_tag || "user")}">
            <div class="messages-chat-head-copy">
              <div class="messages-conversation-name">${msgEscape(currentConversation.peer_username || currentConversation.peer_username_tag || "user")}</div>
              <div class="messages-conversation-preview">${currentConversation.conversation_type === "direct" ? `@${msgEscape(currentConversation.peer_username_tag || "")}` : "Группа"}</div>
              
            </div>
          </div>
        </button>
        <div class="messages-chat-head-actions">
          ${currentConversation.conversation_type === "group" ? `
            <button type="button" class="messages-send-btn" id="messagesConversationInviteHeadBtn">
              Пригласить
            </button>
            <button type="button" class="messages-chat-pref-btn" id="messagesConversationInfoBtn">
              Управление
            </button>
          ` : ""}
          <button type="button" class="messages-chat-pref-btn" id="messagesPinToggle">
            ${currentConversation.is_pinned ? "Открепить" : "Закрепить"}
          </button>
          <button type="button" class="messages-chat-pref-btn ${currentConversation.peer_blocked ? "is-danger" : ""} ${currentConversation.conversation_type === "direct" ? "" : "messages-hidden"}" id="messagesBlockToggle">
            ${currentConversation.peer_blocked ? "Включить сообщения" : "Отключить сообщения"}
          </button>
        </div>
      </div>
    `;
    head.querySelector("[data-message-profile]")?.addEventListener("click", (e) => {
      if (currentConversation.conversation_type === "group") {
        e.preventDefault();
        openConversationInfoModal();
        return;
      }
      e.preventDefault();
      navigate(`/${currentConversation.peer_username_tag}`);
    });
    head.querySelector("#messagesPinToggle")?.addEventListener("click", async () => {
      await toggleConversationPin();
    });
    head.querySelector("#messagesConversationInfoBtn")?.addEventListener("click", async () => {
      await openConversationInfoModal();
    });
    head.querySelector("#messagesConversationInviteHeadBtn")?.addEventListener("click", async () => {
      await openConversationInviteFlow();
    });
    head.querySelector("#messagesBlockToggle")?.addEventListener("click", async () => {
      await saveConversationPreference({
        isBlocked: !Boolean(currentConversation.peer_blocked)
      });
    });
  }

  const res = await fetch(`/api/messages/conversations/${conversationId}`, {
    headers: { Authorization: "Bearer " + token }
  });
  const items = res.ok ? await res.json() : [];
  renderActiveConversationMessages(Array.isArray(items) ? items : [], {
    forceScrollBottom: true,
    preserveViewport: false
  });
  await loadConversations();
  applyConversationPermissions();
  await window.loadNavbarNotifications?.();
  await window.loadNavbarMessagesBadge?.();
  startMessagesLivePolling();
}

async function startConversation(targetIdValue) {
  const token = localStorage.getItem("token");
  if (!token) return;
  const targetId = Number(targetIdValue);
  if (!targetId) return;

  const res = await fetch("/api/messages/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify({ targetId })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert("Не удалось открыть диалог");
    return;
  }
  await loadConversations();
  if (data.conversationId) {
    await openConversation(data.conversationId);
    navigate(`/messages?conversation=${data.conversationId}`);
  }
}

async function sendMessage() {
  const token = localStorage.getItem("token");
  const input = document.getElementById("messageComposer");
  const attachmentInput = document.getElementById("messageAttachmentInput");
  if (!token || !input || !messagesState.activeConversationId) return;
  const text = input.value.trim();
  if (!text && !messagesState.forwardMessage && !messagesState.attachmentFile) return;

  const formData = new FormData();
  formData.append("text", text);
  if (messagesState.replyToMessage?.id) {
    formData.append("replyToMessageId", String(messagesState.replyToMessage.id));
  }
  if (messagesState.forwardMessage?.id) {
    formData.append("forwardedMessageId", String(messagesState.forwardMessage.id));
  }
  if (messagesState.attachmentFile) {
    formData.append("attachment", messagesState.attachmentFile);
  }

  const res = await fetch(`/api/messages/conversations/${messagesState.activeConversationId}`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token
    },
    body: formData
  });

  if (!res.ok) {
    alert("Не удалось отправить сообщение");
    return;
  }

  input.value = "";
  messagesState.replyToMessage = null;
  messagesState.forwardMessage = null;
  messagesState.attachmentFile = null;
  if (attachmentInput) attachmentInput.value = "";
  updateAttachmentName();
  setComposerMeta();
  await openConversation(messagesState.activeConversationId);
}

async function toggleMessageReaction(messageId, emoji) {
  const token = localStorage.getItem("token");
  if (!token || !messageId || !emoji) return;
  const res = await fetch(`/api/messages/${messageId}/react`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify({ emoji })
  });
  if (!res.ok) return;
  await openConversation(messagesState.activeConversationId);
}

async function deleteMessage(messageId) {
  const token = localStorage.getItem("token");
  if (!token || !messageId || !messagesState.activeConversationId) return;

  const res = await fetch(`/api/messages/${messageId}`, {
    method: "DELETE",
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (!res.ok) {
    alert("Не удалось удалить сообщение");
    return;
  }

  if (Number(messagesState.replyToMessage?.id) === Number(messageId)) {
    messagesState.replyToMessage = null;
    setComposerMeta();
  }
  if (Number(messagesState.forwardMessage?.id) === Number(messageId)) {
    messagesState.forwardMessage = null;
    setComposerMeta();
  }

  await openConversation(messagesState.activeConversationId);
}

async function saveConversationPreference({ isBlocked }) {
  const token = localStorage.getItem("token");
  if (!token || !messagesState.activeConversationId) return;

  const res = await fetch(`/api/messages/conversations/${messagesState.activeConversationId}/preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify({ isMuted: false, isBlocked })
  });

  if (!res.ok) {
    alert("Не удалось обновить настройки диалога");
    return;
  }

  await loadConversations();
  await openConversation(messagesState.activeConversationId);
}

function openForwardModal(messageId) {
  const modal = document.getElementById("messagesForwardModal");
  const list = document.getElementById("messagesForwardList");
  const message = messagesState.activeMessages.find((item) => Number(item.id) === Number(messageId));
  if (!modal || !list || !message) return;

  messagesState.forwardMessage = message;
  setComposerMeta();

  list.innerHTML = messagesState.conversations
    .filter((item) => Number(item.id) !== Number(messagesState.activeConversationId))
    .map((item) => `
      <button type="button" class="messages-forward-item" data-forward-conversation-id="${item.id}">
        <img class="messages-conversation-avatar" src="${item.peer_avatar || "/images/default-avatar.jpg"}" alt="${msgEscape(item.peer_username || "user")}">
        <div class="messages-conversation-main">
          <div class="messages-conversation-name">${msgEscape(item.peer_username || item.peer_username_tag || "user")}</div>
          <div class="messages-conversation-preview">@${msgEscape(item.peer_username_tag || "")}</div>
        </div>
      </button>
    `).join("") || `<div class="messages-empty">Некуда пересылать, пока есть только этот диалог</div>`;

  modal.classList.add("active");

  list.querySelectorAll("[data-forward-conversation-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const targetConversationId = Number(button.dataset.forwardConversationId);
      const token = localStorage.getItem("token");
      if (!token || !targetConversationId || !messagesState.forwardMessage) return;

      const sendRes = await fetch(`/api/messages/conversations/${targetConversationId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({
          text: messagesState.forwardMessage.text || "",
          forwardedMessageId: messagesState.forwardMessage.id
        })
      });

      if (!sendRes.ok) {
        alert("Не удалось переслать сообщение");
        return;
      }

      modal.classList.remove("active");
      navigate(`/messages?conversation=${targetConversationId}`);
    });
  });
}

function bindThreadInteractions() {
  const thread = document.getElementById("messagesThread");
  const menu = document.getElementById("messageContextMenu");
  if (!thread || !menu) return;

  thread.querySelectorAll("[data-media-kind='image']").forEach((button) => {
    button.addEventListener("click", () => {
      openMediaViewer({
        kind: button.dataset.mediaKind,
        url: button.dataset.mediaUrl,
        name: button.dataset.mediaName
      });
    });
  });

  thread.querySelectorAll("[data-chat-message-id]").forEach((row) => {
    const trigger = row.querySelector("[data-chat-message-trigger]") || row;
    trigger.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      messagesState.contextMessageId = Number(row.dataset.chatMessageId);
      const message = messagesState.activeMessages.find((item) => Number(item.id) === Number(messagesState.contextMessageId));
      const deleteButton = menu.querySelector('[data-message-action="delete"]');
      if (deleteButton) {
        deleteButton.style.display = Number(message?.sender_id) === Number(window.currentUser?.id || 0) ? "block" : "none";
      }
      menu.classList.add("active");
      const maxLeft = window.innerWidth - menu.offsetWidth - 16;
      const maxTop = window.innerHeight - menu.offsetHeight - 16;
      menu.style.left = `${Math.max(12, Math.min(e.clientX, maxLeft))}px`;
      menu.style.top = `${Math.max(12, Math.min(e.clientY, maxTop))}px`;
    });
  });

  thread.querySelectorAll("[data-jump-message-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = thread.querySelector(`[data-chat-message-id="${button.dataset.jumpMessageId}"]`);
      if (!target) return;
      target.classList.add("messages-bubble-row-highlight");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => target.classList.remove("messages-bubble-row-highlight"), 1200);
    });
  });

  thread.querySelectorAll(".messages-reaction-chip").forEach((button) => {
    button.addEventListener("click", () => {
      toggleMessageReaction(button.dataset.messageId, button.dataset.reaction);
    });
  });

  thread.querySelectorAll("[data-audio-card]").forEach((card) => {
    const audio = card.querySelector("[data-audio-element]");
    const toggle = card.querySelector("[data-audio-toggle]");
    const current = card.querySelector("[data-audio-current]");
    const duration = card.querySelector("[data-audio-duration]");
    const seek = card.querySelector("[data-audio-seek]");
    const volume = card.querySelector("[data-audio-volume]");
    const volumeIcon = card.querySelector("[data-audio-volume-icon]");
    if (!audio || !toggle || !duration || !current || !seek || !volume || !volumeIcon) return;

    const formatAudioTime = (value) => {
      const totalSeconds = Math.max(0, Math.floor(value || 0));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      return `${String(minutes).padStart(2, "0")}:${seconds}`;
    };

    const syncSeek = () => {
      const progress = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
      seek.value = String(progress);
      seek.style.setProperty("--audio-progress", `${progress}%`);
    };

    const syncVolume = (value) => {
      const normalized = Math.max(0, Math.min(1, value));
      const percent = normalized * 100;
      audio.volume = normalized;
      volume.value = String(percent);
      volume.style.setProperty("--audio-volume", `${percent}%`);
      volumeIcon.className = `fa-solid ${normalized === 0 ? "fa-volume-xmark" : normalized < 0.55 ? "fa-volume-low" : "fa-volume-high"}`;
    };

    const setPlayingState = (playing) => {
      toggle.innerHTML = `<i class="fa-solid ${playing ? "fa-pause" : "fa-play"}"></i>`;
    };

    audio.addEventListener("loadedmetadata", () => {
      duration.textContent = formatAudioTime(audio.duration);
      syncSeek();
    });

    audio.addEventListener("timeupdate", () => {
      current.textContent = formatAudioTime(audio.currentTime);
      syncSeek();
    });

    audio.addEventListener("play", () => setPlayingState(true));
    audio.addEventListener("pause", () => setPlayingState(false));
    audio.addEventListener("ended", () => {
      current.textContent = "00:00";
      seek.value = "0";
      seek.style.setProperty("--audio-progress", "0%");
      setPlayingState(false);
    });

    toggle.addEventListener("click", () => {
      if (audio.paused) {
        thread.querySelectorAll("[data-audio-element]").forEach((other) => {
          if (other !== audio) other.pause();
        });
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    });

    seek.addEventListener("input", () => {
      seek.style.setProperty("--audio-progress", `${seek.value}%`);
    });

    seek.addEventListener("change", () => {
      if (!audio.duration) return;
      audio.currentTime = (Number(seek.value) / 100) * audio.duration;
      current.textContent = formatAudioTime(audio.currentTime);
    });

    volume.addEventListener("input", () => {
      syncVolume(Number(volume.value) / 100);
    });

    syncVolume(1);
  });
}

function openMediaViewer({ kind = "", url = "", name = "" } = {}) {
  const modal = document.getElementById("messagesMediaViewer");
  const body = document.getElementById("messagesMediaViewerBody");
  const title = document.getElementById("messagesMediaViewerTitle");
  if (!modal || !body || !title || !url) return;

  title.textContent = name || "Вложение";

  if (kind === "image") {
    body.innerHTML = `<img src="${msgEscape(url)}" alt="${msgEscape(name || "Вложение")}">`;
  } else if (kind === "video") {
    body.innerHTML = `<video controls autoplay src="${msgEscape(url)}"></video>`;
  } else if (kind === "audio") {
    body.innerHTML = `<audio controls autoplay src="${msgEscape(url)}"></audio>`;
  } else {
    body.innerHTML = `<a href="${msgEscape(url)}" target="_blank" rel="noopener" download class="messages-send-btn">Скачать файл</a>`;
  }

  modal.classList.add("active");
}

function closeMediaViewer() {
  const modal = document.getElementById("messagesMediaViewer");
  const body = document.getElementById("messagesMediaViewerBody");
  if (!modal || !body) return;

  body.querySelectorAll("video,audio").forEach((media) => {
    media.pause?.();
  });
  body.innerHTML = "";
  modal.classList.remove("active");
}

async function openConversationMediaBrowser(type) {
  const currentConversation = getCurrentConversation();
  const token = localStorage.getItem("token");
  const modal = document.getElementById("messagesMediaBrowser");
  const title = document.getElementById("messagesMediaBrowserTitle");
  const toolbar = document.getElementById("messagesMediaBrowserToolbar");
  const body = document.getElementById("messagesMediaBrowserBody");
  if (!currentConversation || !token || !modal || !title || !toolbar || !body) return;

  const titleMap = {
    photos: "Photos",
    videos: "Videos",
    audio: "Audio files",
    files: "Files",
    links: "Shared links"
  };

  title.textContent = titleMap[type] || "Media";
  toolbar.innerHTML = type === "audio" || type === "files"
    ? `<input id="messagesMediaBrowserSearch" class="messages-input messages-media-browser-search" type="text" placeholder="Search">`
    : "";
  body.innerHTML = `<div class="messages-media-browser-empty">Загрузка...</div>`;
  modal.classList.add("active");

  const res = await fetch(`/api/messages/conversations/${currentConversation.id}/media?type=${encodeURIComponent(type)}`, {
    headers: { Authorization: "Bearer " + token }
  });
  const items = res.ok ? await res.json() : [];

  const render = (query = "") => {
    const filtered = String(query || "").trim()
      ? items.filter((item) => String(item.attachment_name || item.text || "").toLowerCase().includes(String(query).trim().toLowerCase()))
      : items;
    renderConversationMediaBrowserContent(type, filtered, body);
  };

  render("");
  document.getElementById("messagesMediaBrowserSearch")?.addEventListener("input", (e) => render(e.target.value));
}

async function openConversationMembersBrowser() {
  const currentConversation = getCurrentConversation();
  const token = localStorage.getItem("token");
  const modal = document.getElementById("messagesMediaBrowser");
  const title = document.getElementById("messagesMediaBrowserTitle");
  const toolbar = document.getElementById("messagesMediaBrowserToolbar");
  const body = document.getElementById("messagesMediaBrowserBody");
  if (!currentConversation || !token || !modal || !title || !toolbar || !body) return;

  title.textContent = "Участники";
  toolbar.innerHTML = "";
  body.innerHTML = `<div class="messages-media-browser-empty">Загрузка...</div>`;
  modal.classList.add("active");

  try {
    const res = await fetch(`/api/messages/conversations/${currentConversation.id}/members`, {
      headers: { Authorization: "Bearer " + token }
    });
    const data = await res.json().catch(() => ({}));
    const items = Array.isArray(data.items) ? data.items : [];

    if (!res.ok) {
      body.innerHTML = `<div class="messages-media-browser-empty">${msgEscape(getApiErrorMessage(data, "Не удалось загрузить участников."))}</div>`;
      return;
    }

    if (!items.length) {
      body.innerHTML = `<div class="messages-media-browser-empty">В группе пока нет участников.</div>`;
      return;
    }

    body.innerHTML = `
      <div class="messages-media-list">
        ${items.map((item) => `
          <button type="button" class="messages-media-list-item messages-media-member-item" data-member-profile="${msgEscape(item.username_tag || "")}">
            <div class="messages-media-list-thumb messages-media-member-thumb">
              <img src="${msgEscape(item.avatar || "/images/default-avatar.jpg")}" alt="${msgEscape(item.username || item.username_tag || "user")}">
            </div>
            <div class="messages-media-list-copy">
              <div class="messages-media-list-title">${msgEscape(item.username || item.username_tag || "Пользователь")}</div>
              <div class="messages-media-list-meta">
                @${msgEscape(item.username_tag || "user")}${item.role === "owner" ? " · владелец" : ""}
              </div>
            </div>
          </button>
        `).join("")}
      </div>
    `;

    body.querySelectorAll("[data-member-profile]").forEach((button) => {
      button.addEventListener("click", () => {
        const usernameTag = String(button.dataset.memberProfile || "").trim();
        if (!usernameTag) return;
        closeConversationMediaBrowser();
        navigate(`/${usernameTag}`);
      });
    });
  } catch (error) {
    body.innerHTML = `<div class="messages-media-browser-empty">Не удалось загрузить участников.</div>`;
  }
}

function renderConversationMediaBrowserContent(type, items, container) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) {
    container.innerHTML = `<div class="messages-media-browser-empty">Пока пусто</div>`;
    return;
  }

  const groups = new Map();
  safeItems.forEach((item) => {
    const monthKey = formatConversationMonth(item.created_at) || "Unknown";
    if (!groups.has(monthKey)) groups.set(monthKey, []);
    groups.get(monthKey).push(item);
  });

  container.innerHTML = [...groups.entries()].map(([month, monthItems]) => {
    if (type === "photos" || type === "videos") {
      return `
        <section class="messages-media-month">
          <div class="messages-media-month-title">${msgEscape(month)}</div>
          <div class="messages-media-grid">
            ${monthItems.map((item) => `
              <button type="button" class="messages-media-grid-item" data-open-media-item="${item.id}" data-media-kind="${type === "photos" ? "image" : "video"}" data-media-url="${msgEscape(item.attachment_url || "")}" data-media-name="${msgEscape(item.attachment_name || "Вложение")}">
                ${type === "photos"
                  ? `<img src="${msgEscape(item.attachment_url || "")}" alt="${msgEscape(item.attachment_name || "photo")}">`
                  : `<video preload="metadata" src="${msgEscape(item.attachment_url || "")}"></video>`
                }
              </button>
            `).join("")}
          </div>
        </section>
      `;
    }

    if (type === "links") {
      return `
        <section class="messages-media-month">
          <div class="messages-media-month-title">${msgEscape(month)}</div>
          <div class="messages-media-list">
            ${monthItems.map((item) => {
              const url = extractLinksFromText(item.text || "")[0] || "";
              return `
                <a href="${msgEscape(url.startsWith("http") ? url : `https://${url}`)}" target="_blank" rel="noopener" class="messages-media-link-item">
                  <div class="messages-media-list-thumb"><i class="fa-solid fa-link"></i></div>
                  <div class="messages-media-list-copy">
                    <div class="messages-media-link-url">${msgEscape(url)}</div>
                    <div class="messages-media-link-meta">${formatConversationTime(item.created_at)}</div>
                  </div>
                </a>
              `;
            }).join("")}
          </div>
        </section>
      `;
    }

    return `
      <section class="messages-media-month">
        <div class="messages-media-month-title">${msgEscape(month)}</div>
        <div class="messages-media-list">
          ${monthItems.map((item) => `
            <div class="messages-media-list-item">
              <div class="messages-media-list-thumb">
                ${type === "audio"
                  ? `<i class="fa-solid fa-play"></i>`
                  : `<i class="fa-solid fa-file-arrow-down"></i>`
                }
              </div>
              <div class="messages-media-list-copy">
                <div class="messages-media-list-title">${msgEscape(item.attachment_name || "Файл")}</div>
                <div class="messages-media-list-meta">${formatConversationTime(item.created_at)}</div>
              </div>
              <div class="messages-media-list-action">
                ${type === "audio"
                  ? `<button type="button" class="messages-chat-pref-btn" data-open-media-item="${item.id}" data-media-kind="audio" data-media-url="${msgEscape(item.attachment_url || "")}" data-media-name="${msgEscape(item.attachment_name || "Audio")}">Открыть</button>`
                  : `<a href="${msgEscape(item.attachment_url || "")}" target="_blank" rel="noopener" download class="messages-chat-pref-btn">Скачать</a>`
                }
              </div>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }).join("");

  container.querySelectorAll("[data-open-media-item]").forEach((button) => {
    button.addEventListener("click", () => {
      openMediaViewer({
        kind: button.dataset.mediaKind,
        url: button.dataset.mediaUrl,
        name: button.dataset.mediaName
      });
    });
  });
}

function closeConversationMediaBrowser() {
  const modal = document.getElementById("messagesMediaBrowser");
  const body = document.getElementById("messagesMediaBrowserBody");
  const toolbar = document.getElementById("messagesMediaBrowserToolbar");
  if (!modal || !body || !toolbar) return;
  body.innerHTML = "";
  toolbar.innerHTML = "";
  modal.classList.remove("active");
}

window.initMessagesPage = async function initMessagesPage() {
  const token = localStorage.getItem("token");
  if (!token) {
    navigate("/login");
    return;
  }

  const searchInput = document.getElementById("messageUserSearch");
  searchInput?.addEventListener("input", () => searchMessageUsers(searchInput.value));
  searchInput?.addEventListener("blur", () => {
    setTimeout(() => closeMessageSearchResults(), 150);
  });
  document.getElementById("sendMessageBtn")?.addEventListener("click", sendMessage);
  document.getElementById("createGroupBtn")?.addEventListener("click", () => openCreateConversationModal("group"));
  document.getElementById("messagesCreateClose")?.addEventListener("click", closeCreateConversationModal);
  document.getElementById("messagesCreateCancel")?.addEventListener("click", closeCreateConversationModal);
  document.getElementById("messagesCreateSubmit")?.addEventListener("click", submitCreateConversation);
  document.getElementById("messagesConversationClose")?.addEventListener("click", closeConversationModal);
  document.getElementById("messagesConversationEditClose")?.addEventListener("click", closeConversationEditModal);
  document.getElementById("messagesConversationEditCancel")?.addEventListener("click", closeConversationEditModal);
  document.getElementById("messagesMediaViewerClose")?.addEventListener("click", closeMediaViewer);
  document.getElementById("messagesMediaViewer")?.addEventListener("click", (e) => {
    if (e.target?.id === "messagesMediaViewer") closeMediaViewer();
  });
  document.getElementById("messagesMediaBrowserClose")?.addEventListener("click", closeConversationMediaBrowser);
  document.getElementById("messagesMediaBrowser")?.addEventListener("click", (e) => {
    if (e.target?.id === "messagesMediaBrowser") closeConversationMediaBrowser();
  });
  document.getElementById("messagesConversationEditSave")?.addEventListener("click", saveConversationDetails);
  document.getElementById("messagesConversationInviteBtn")?.addEventListener("click", inviteUserToConversation);
  document.getElementById("messageAttachmentInput")?.addEventListener("change", (e) => {
    messagesState.attachmentFile = e.target?.files?.[0] || null;
    updateAttachmentName();
    setComposerMeta();
  });
  document.getElementById("messagesCreateAvatarInput")?.addEventListener("change", (e) => {
    messagesState.createAvatarFile = e.target?.files?.[0] || null;
    setCreateAvatarPreview(messagesState.createAvatarFile);
  });
  document.getElementById("messagesConversationEditAvatarInput")?.addEventListener("change", (e) => {
    messagesState.editAvatarFile = e.target?.files?.[0] || null;
    setEditAvatarPreview(messagesState.editAvatarFile);
  });
  document.querySelectorAll(".messages-context-reaction").forEach((button) => {
    button.addEventListener("click", async () => {
      await toggleMessageReaction(messagesState.contextMessageId, button.dataset.reaction);
      closeMessageContextMenu();
    });
  });
  document.querySelectorAll("[data-message-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const message = messagesState.activeMessages.find((item) => Number(item.id) === Number(messagesState.contextMessageId));
      if (!message) return;
      if (button.dataset.messageAction === "reply") {
        messagesState.replyToMessage = {
          id: message.id,
          text: message.text,
          sender_name: message.username || message.username_tag || "user"
        };
        messagesState.forwardMessage = null;
        setComposerMeta();
        document.getElementById("messageComposer")?.focus();
      }
      if (button.dataset.messageAction === "forward") {
        openForwardModal(message.id);
      }
      if (button.dataset.messageAction === "delete") {
        deleteMessage(message.id);
      }
      closeMessageContextMenu();
    });
  });
  document.addEventListener("click", closeMessageContextMenu);
  document.getElementById("messagesForwardClose")?.addEventListener("click", () => {
    document.getElementById("messagesForwardModal")?.classList.remove("active");
  });
  document.getElementById("messageComposer")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  updateAttachmentName();
  setComposerMeta();
  await loadPendingInvites();
  await loadConversations();

  const params = new URLSearchParams(window.location.search);
  const conversationId = params.get("conversation");
  if (conversationId) {
    await openConversation(conversationId);
  } else if (messagesState.conversations[0]?.id) {
    await openConversation(messagesState.conversations[0].id);
  }

  startMessagesLivePolling();
};
