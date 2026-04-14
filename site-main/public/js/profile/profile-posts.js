let postViewTimers = new Map();
let postViewsObserver = null;
let activePostCommentsId = null;
let activeReplyTarget = null;
let currentPostComments = [];
let postUiBound = false;
let hideTimer = null;
let currentPostsContainerId = "postsContainer";
const savedPostsStorageKey = "savedPostIds";
let currentPostsIsMyProfile = false;
let currentReposts = [];
let currentRepostTracks = [];
let currentMentionPosts = [];
let currentMentionTracks = [];
const expandedCommentThreads = new Set();

function isOwnProfilePage() {
  return !!window.currentProfileIsMine;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMentionMarkup(value, { multiline = false } = {}) {
  const source = String(value ?? "");
  const regex = /@([a-zA-Z0-9_]{2,50})/g;
  let lastIndex = 0;
  let html = "";
  let match;

  while ((match = regex.exec(source)) !== null) {
    const startIndex = match.index;
    const mentionTag = match[1];

    html += escapeHtml(source.slice(lastIndex, startIndex));
    html += `<a href="/${encodeURIComponent(mentionTag)}" class="profile-mention-link" onclick="goToMentionProfile(event, '${escapeHtml(mentionTag)}')">@${escapeHtml(mentionTag)}</a>`;
    lastIndex = regex.lastIndex;
  }

  html += escapeHtml(source.slice(lastIndex));

  if (multiline) {
    html = html.replace(/\n/g, "<br>");
  }

  return html;
}

function goToMentionProfile(event, tag) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
  }

  if (!tag) return;
  navigate(`/${tag}`);
}

function renderProfileJumpTag(tag, content, className = "") {
  const safeTag = String(tag || "").trim();
  const safeClassName = String(className || "").trim();

  if (!safeTag) {
    return content;
  }

  return `<a href="/${encodeURIComponent(safeTag)}" class="${safeClassName}" onclick="goToMentionProfile(event, '${escapeHtml(safeTag)}')">${content}</a>`;
}

function formatPostDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function getCurrentPostById(postId) {
  return window.currentPosts?.find((post) => Number(post.id) === Number(postId)) || null;
}

function setCurrentPostPatch(postId, patch = {}) {
  if (!Array.isArray(window.currentPosts)) return;
  const index = window.currentPosts.findIndex((post) => Number(post.id) === Number(postId));
  if (index === -1) return;
  window.currentPosts[index] = { ...window.currentPosts[index], ...patch };
}

function getSavedPostIds() {
  try {
    const raw = localStorage.getItem(savedPostsStorageKey);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map((id) => Number(id)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function isPostSaved(postId) {
  return getSavedPostIds().includes(Number(postId));
}

function toggleSavedPost(postId) {
  const current = new Set(getSavedPostIds());
  const numericId = Number(postId);

  if (current.has(numericId)) current.delete(numericId);
  else current.add(numericId);

  const next = Array.from(current);
  localStorage.setItem(savedPostsStorageKey, JSON.stringify(next));
  return current.has(numericId);
}

function renderPostMedia(post) {
  if (post.media_type === "image" && post.media_url) {
    return `<div class="post-media-wrapper"><img src="${post.media_url}" class="post-media" alt="post media"></div>`;
  }

  if (post.media_type === "video" && post.media_url) {
    return `
      <div class="post-media-wrapper video-player">
        <video class="video-element" preload="metadata">
          <source src="${post.media_url}">
        </video>
        <div class="video-overlay"><i class="fa-solid fa-play"></i></div>
        <div class="video-ui">
          <div class="video-progress"><div class="video-progress-bar"></div></div>
          <div class="video-controls">
            <button class="video-btn play-btn"><i class="fa-solid fa-play"></i></button>
            <div class="video-time"><span class="current">0:00</span>/<span class="duration">0:00</span></div>
            <div class="video-spacer"></div>
            <button class="video-btn mute-btn" type="button" aria-label="Выключить звук"><i class="fa-solid fa-volume-low"></i></button>
            <input class="volume" type="range" min="0" max="1" step="0.01" value="0.3" aria-label="Громкость видео">
            <button class="video-btn fullscreen-btn"><i class="fa-solid fa-expand"></i></button>
          </div>
        </div>
      </div>
    `;
  }

  return "";
}

function renderPostCard(post, isMyProfile) {
  const likesCount = Number(post.likes_count || 0);
  const dislikesCount = Number(post.dislikes_count || 0);
  const commentsCount = Number(post.comments_count || 0);
  const viewsCount = Number(post.views_count || 0);
  const isLiked = post.my_reaction === "like";
  const isDisliked = post.my_reaction === "dislike";
  const safeContent = renderMentionMarkup(post.content || "", { multiline: true });
  const safeUsername = escapeHtml(post.username || "User");
  const avatar = post.avatar || "/images/default-avatar.jpg";
  const isSaved = isPostSaved(post.id);
  const isReposted = !!post.reposted;
  const showRepostButton = !isOwnProfilePage() && Number(post.user_id || 0) !== Number(window.currentUser?.id || 0);
  const repostMeta = post.reposted_at
    ? `
      <div class="post-repost-meta">
        <i class="fa-solid fa-retweet"></i>
        <span>${formatPostDate(post.reposted_at)}</span>
      </div>
    `
    : "";
  const mentionMeta = post.mentioned_at
    ? `
      <div class="post-mention-meta">
        <i class="fa-solid fa-at"></i>
        <span>${formatPostDate(post.mentioned_at)}</span>
      </div>
    `
    : "";

  return `
    <div class="post-card" data-post-id="${post.id}">
      ${repostMeta}
      ${mentionMeta}
      <div class="post-header">
        <div class="post-user">
          ${renderProfileJumpTag(
            post.username_tag,
            `<img src="${avatar}" class="post-avatar" alt="${safeUsername}">`,
            "post-user-link post-avatar-link"
          )}
          <div class="post-user-info">
            ${renderProfileJumpTag(
              post.username_tag,
              `<div class="post-username">${safeUsername}</div>`,
              "post-user-link post-username-link"
            )}
            <div class="post-date">${formatPostDate(post.created_at)}</div>
          </div>
        </div>
        ${isMyProfile ? `
          <div class="post-menu-container">
            <button class="post-menu-btn" onclick="togglePostMenu(${post.id})"><i class="fa-solid fa-ellipsis"></i></button>
            <div id="postMenu-${post.id}" class="post-menu profile-hidden">
              <button class="danger" onclick="deletePost(${post.id})"><i class="fa-solid fa-trash"></i>Удалить</button>
              <button onclick="editPost(${post.id})"><i class="fa-solid fa-pen"></i>Редактировать</button>
              <button onclick="archivePost(${post.id})"><i class="fa-solid fa-box-archive"></i>Архив</button>
              <button onclick="pinPost(${post.id})"><i class="fa-solid fa-thumbtack"></i>Закрепить</button>
            </div>
          </div>
        ` : ""}
      </div>

      ${safeContent ? `<div class="post-text"><p>${safeContent}</p></div>` : ""}
      ${renderPostMedia(post)}

      <div class="post-actions">
        <button type="button" class="post-action-btn post-reaction-btn ${isLiked ? "active-like" : ""}" data-post-id="${post.id}" data-reaction="like">
          <i class="fa-${isLiked ? "solid" : "regular"} fa-heart"></i>
          <span class="post-like-count">${likesCount}</span>
        </button>
        <button type="button" class="post-action-btn post-reaction-btn ${isDisliked ? "active-dislike" : ""}" data-post-id="${post.id}" data-reaction="dislike">
          <i class="fa-${isDisliked ? "solid" : "regular"} fa-thumbs-down"></i>
          <span class="post-dislike-count">${dislikesCount}</span>
        </button>
        <button type="button" class="post-action-btn post-comments-open-btn ${activePostCommentsId === Number(post.id) ? "active-comment" : ""}" data-post-id="${post.id}">
          <i class="fa-regular fa-comment-dots"></i>
          <span class="post-comments-count">${commentsCount}</span>
        </button>
        ${showRepostButton ? `
          <button type="button" class="post-action-btn post-repost-btn ${isReposted ? "active-repost" : ""}" data-post-id="${post.id}">
            <i class="fa-solid fa-retweet"></i>
          </button>
        ` : ""}
        <button type="button" class="post-action-btn post-save-btn ${isSaved ? "active-save" : ""}" data-post-id="${post.id}">
          <i class="fa-${isSaved ? "solid" : "regular"} fa-bookmark"></i>
        </button>
        <div class="post-actions-spacer"></div>
        <div class="post-stat-item">
          <i class="fa-regular fa-eye"></i>
          <span class="post-views-count">${viewsCount}</span>
        </div>
      </div>
    </div>
  `;
}

function updatePostRepostDom(postId, reposted) {
  document.querySelectorAll(`.post-card[data-post-id="${postId}"] .post-repost-btn`).forEach((btn) => {
    btn.classList.toggle("active-repost", !!reposted);
  });
}

function updatePostReactionDom(postId, reaction, likesCount, dislikesCount) {
  const card = document.querySelector(`.post-card[data-post-id="${postId}"]`);
  if (!card) return;

  const likeBtn = card.querySelector('.post-reaction-btn[data-reaction="like"]');
  const dislikeBtn = card.querySelector('.post-reaction-btn[data-reaction="dislike"]');
  const likeCountEl = card.querySelector(".post-like-count");
  const dislikeCountEl = card.querySelector(".post-dislike-count");

  if (likeBtn) {
    const icon = likeBtn.querySelector("i");
    likeBtn.classList.toggle("active-like", reaction === "like");
    if (icon) icon.className = reaction === "like" ? "fa-solid fa-heart" : "fa-regular fa-heart";
  }

  if (dislikeBtn) {
    const icon = dislikeBtn.querySelector("i");
    dislikeBtn.classList.toggle("active-dislike", reaction === "dislike");
    if (icon) icon.className = reaction === "dislike" ? "fa-solid fa-thumbs-down" : "fa-regular fa-thumbs-down";
  }

  if (likeCountEl) likeCountEl.textContent = String(Number(likesCount || 0));
  if (dislikeCountEl) dislikeCountEl.textContent = String(Number(dislikesCount || 0));
}

function updatePostCommentsCountDom(postId, commentsCount) {
  const card = document.querySelector(`.post-card[data-post-id="${postId}"]`);
  const countEl = card?.querySelector(".post-comments-count");
  if (countEl) countEl.textContent = String(Number(commentsCount || 0));
}

function updatePostSaveDom(postId, isSaved) {
  const card = document.querySelector(`.post-card[data-post-id="${postId}"]`);
  const saveBtn = card?.querySelector(".post-save-btn");
  const icon = saveBtn?.querySelector("i");
  if (!saveBtn || !icon) return;

  saveBtn.classList.toggle("active-save", Boolean(isSaved));
  icon.className = isSaved ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark";
}

function renderInlineCommentsSection(post) {
  if (activePostCommentsId !== Number(post.id)) return "";

  const commentsCount = Array.isArray(currentPostComments)
    ? currentPostComments.length
    : Number(post.comments_count || 0);

  let commentsHtml = "";
  if (currentPostComments === null) {
    commentsHtml = `<div class="post-comments-loading" aria-hidden="true"><span></span></div>`;
  } else if (Array.isArray(currentPostComments) && currentPostComments.length) {
    const tree = buildCommentsTree(currentPostComments);
    commentsHtml = tree.map((comment) => renderCommentNode(comment)).join("");
  }

  return `
    <div class="post-inline-comments-wrap">
      <div class="post-inline-comments-head post-inline-comments-head-compact">
        <p id="postCommentsMeta" class="post-comments-meta">${commentsCount} комментариев</p>
        <button type="button" class="post-inline-comments-close" data-post-id="${post.id}">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div id="postReplyBadge" class="post-reply-badge ${activeReplyTarget ? "" : "profile-hidden"}">
        <span id="postReplyLabel">${activeReplyTarget ? `Ответ для @${escapeHtml(activeReplyTarget.username || "user")}` : ""}</span>
        <button type="button" class="post-reply-cancel-btn">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div id="postCommentsList" class="post-comments-list">${commentsHtml}</div>

      <div class="post-comments-composer">
        <textarea
          id="postCommentInput"
          class="profile-post-textarea post-comment-input"
          placeholder="Напиши комментарий. Enter для новой строки, Ctrl+Enter чтобы отправить"
          maxlength="500"
        ></textarea>

        <div class="post-comments-composer-actions">
          <button type="button" id="postCommentSubmitBtn" class="profile-primary-btn" onclick="submitPostComment()">
            Отправить
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderPostCollection(containerId, posts, isMyProfile, emptyText) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const safePosts = Array.isArray(posts) ? posts : [];

  if (!safePosts.length) {
    container.innerHTML = `<div class="post-comments-empty">${emptyText}</div>`;
    return;
  }

  const hasActivePost = safePosts.some((post) => Number(post.id) === Number(activePostCommentsId));
  if (!hasActivePost) {
    activePostCommentsId = null;
    activeReplyTarget = null;
    currentPostComments = [];
  }

  container.innerHTML = safePosts
    .map((post) => `${renderPostCard(post, isMyProfile)}${renderInlineCommentsSection(post)}`)
    .join("");

  document.querySelectorAll(".volume").forEach(updateVolumeSlider);
  document.querySelectorAll(".video-player").forEach((player) => {
    const video = player.querySelector("video");
    const slider = player.querySelector(".volume");
    if (video && slider) {
      applyVideoVolume(player, Number(slider.value || 0.3), { remember: true });
    }
  });
  document.querySelectorAll(".video-element").forEach((video) => videoObserver.observe(video));
  initPostViewsObserver();
}

function renderPostsList() {
  renderPostCollection(
    currentPostsContainerId,
    window.currentPosts,
    currentPostsIsMyProfile,
    "Здесь пока пусто. Первый сильный пост может задать весь вайб профиля."
  );
}

function setPostsRenderContext({ containerId = "postsContainer", posts = [], isMyProfile = false } = {}) {
  currentPostsContainerId = containerId;
  currentPostsIsMyProfile = !!isMyProfile;
  window.currentProfileIsMine = !!isMyProfile;
  window.currentPosts = Array.isArray(posts) ? posts.map((post) => ({
    ...post,
    likes_count: Number(post.likes_count || 0),
    dislikes_count: Number(post.dislikes_count || 0),
    comments_count: Number(post.comments_count || 0),
    views_count: Number(post.views_count || 0),
    my_reaction: post.my_reaction || null,
    reposted: !!post.reposted
  })) : [];
  initPostUiBindings();
  renderPostsList();
}

function renderRepostsList() {
  const container = document.getElementById("repostsContainer");
  if (!container) return;

  const hasPosts = Array.isArray(currentReposts) && currentReposts.length > 0;
  const hasTracks = Array.isArray(currentRepostTracks) && currentRepostTracks.length > 0;

  if (!hasPosts && !hasTracks) {
    container.innerHTML = `<div class="post-comments-empty">Тут пока нет репостов.</div>`;
    return;
  }

  const postsHtml = hasPosts
    ? `
      <div class="profile-reposts-section">
        ${hasTracks ? `
          <div class="profile-section-header">
            <h3>Публикации</h3>
          </div>
        ` : ""}
        <div class="profile-reposts-post-list">
          ${currentReposts.map((post) => `${renderPostCard(post, false)}${renderInlineCommentsSection(post)}`).join("")}
        </div>
      </div>
    `
    : "";

  const trackRenderer = window.renderProfileTrackCard;
  const tracksHtml = hasTracks && typeof trackRenderer === "function"
    ? `
      <div class="profile-reposts-section">
        ${hasPosts ? `
          <div class="profile-section-header">
            <h3>Треки</h3>
          </div>
        ` : ""}
        <div class="profile-reposts-track-list profile-tracks-scope">
          ${currentRepostTracks.map((track) => trackRenderer(track, { isRepost: true })).join("")}
        </div>
      </div>
    `
    : "";

  container.innerHTML = `${postsHtml}${tracksHtml}`;
  window.hydrateProfileTrackCards?.(container);
  window.syncProfileTrackCardsWithGlobalPlayer?.();
}

function renderMentionsList() {
  const container = document.getElementById("mentionsContainer");
  if (!container) return;

  const hasPosts = Array.isArray(currentMentionPosts) && currentMentionPosts.length > 0;
  const hasTracks = Array.isArray(currentMentionTracks) && currentMentionTracks.length > 0;

  if (!hasPosts && !hasTracks) {
    container.innerHTML = `<div class="post-comments-empty">Тут пока нет отметок.</div>`;
    return;
  }

  const postsHtml = hasPosts
    ? `
      <div class="profile-reposts-section">
        ${hasTracks ? `
          <div class="profile-section-header">
            <h3>Публикации</h3>
          </div>
        ` : ""}
        <div class="profile-reposts-post-list">
          ${currentMentionPosts.map((post) => `${renderPostCard(post, false)}${renderInlineCommentsSection(post)}`).join("")}
        </div>
      </div>
    `
    : "";

  const trackRenderer = window.renderProfileTrackCard;
  const tracksHtml = hasTracks && typeof trackRenderer === "function"
    ? `
      <div class="profile-reposts-section">
        ${hasPosts ? `
          <div class="profile-section-header">
            <h3>Треки</h3>
          </div>
        ` : ""}
        <div class="profile-reposts-track-list profile-tracks-scope">
          ${currentMentionTracks.map((track) => trackRenderer(track, { isMention: true })).join("")}
        </div>
      </div>
    `
    : "";

  container.innerHTML = `${postsHtml}${tracksHtml}`;
  window.hydrateProfileTrackCards?.(container);
  window.syncProfileTrackCardsWithGlobalPlayer?.();
}

async function loadPosts() {
  const token = localStorage.getItem("token");
  if (!token) return;
  const container = document.getElementById("postsContainer");
  currentPostsContainerId = "postsContainer";

  try {
    const meRes = await fetch("/me", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!meRes.ok) return;

    const me = await meRes.json();
    const params = new URLSearchParams(window.location.search);
    const tag = window.__profileTag || params.get("tag");
    const url = !tag ? "/my-posts" : `/posts?tag=${encodeURIComponent(tag)}`;

    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) {
      console.error("Ошибка загрузки постов");
      if (container) {
        container.innerHTML = `<div class="post-comments-empty">Не удалось загрузить посты. Если сервер только что обновлялся, перезапусти его и обнови страницу.</div>`;
      }
      return;
    }

    const posts = await res.json();
    window.currentPosts = posts.map((post) => ({
      ...post,
      likes_count: Number(post.likes_count || 0),
      dislikes_count: Number(post.dislikes_count || 0),
      comments_count: Number(post.comments_count || 0),
      views_count: Number(post.views_count || 0),
      my_reaction: post.my_reaction || null,
      reposted: !!post.reposted
    }));

    if (!container) return;

    currentPostsIsMyProfile = !tag || tag.toLowerCase() === String(me.username_tag || "").toLowerCase();
    window.currentProfileIsMine = currentPostsIsMyProfile;
    renderPostsList();
  } catch (err) {
    console.error("loadPosts error", err);
    if (container) {
      container.innerHTML = `<div class="post-comments-empty">Посты временно недоступны. Перезапусти сервер и обнови страницу.</div>`;
    }
  }
}

async function loadReposts() {
  const token = localStorage.getItem("token");
  const container = document.getElementById("repostsContainer");
  if (!container || !token) return;

  try {
    const params = new URLSearchParams(window.location.search);
    const tag = window.__profileTag || params.get("tag");
    const url = tag
      ? `/api/profile-reposts?tag=${encodeURIComponent(tag)}`
      : "/api/profile-reposts";

    const res = await fetch(url, {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) {
      container.innerHTML = `<div class="post-comments-empty">Не удалось загрузить репосты.</div>`;
      return;
    }

    const payload = await res.json();
    const posts = Array.isArray(payload) ? payload : (payload.posts || []);
    const tracks = Array.isArray(payload?.tracks) ? payload.tracks : [];

    currentReposts = posts.map((post) => ({
      ...post,
      likes_count: Number(post.likes_count || 0),
      dislikes_count: Number(post.dislikes_count || 0),
      comments_count: Number(post.comments_count || 0),
      views_count: Number(post.views_count || 0),
      my_reaction: post.my_reaction || null,
      reposted: !!post.reposted
    }));

    currentRepostTracks = tracks.map((track) => ({
      ...track,
      reposted: !!track.reposted,
      listens_count: Number(track.listens_count || 0)
    }));
    window.currentRepostTracks = currentRepostTracks;

    renderRepostsList();
  } catch (err) {
    console.error("loadReposts error", err);
    container.innerHTML = `<div class="post-comments-empty">Репосты временно недоступны.</div>`;
  }
}

async function loadMentions() {
  const token = localStorage.getItem("token");
  const container = document.getElementById("mentionsContainer");
  if (!container || !token) return;

  try {
    const params = new URLSearchParams(window.location.search);
    const tag = window.__profileTag || params.get("tag");
    const url = tag
      ? `/api/profile-mentions?tag=${encodeURIComponent(tag)}`
      : "/api/profile-mentions";

    const res = await fetch(url, {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) {
      container.innerHTML = `<div class="post-comments-empty">Не удалось загрузить отметки.</div>`;
      return;
    }

    const payload = await res.json();
    const posts = Array.isArray(payload?.posts) ? payload.posts : [];
    const tracks = Array.isArray(payload?.tracks) ? payload.tracks : [];

    currentMentionPosts = posts.map((post) => ({
      ...post,
      likes_count: Number(post.likes_count || 0),
      dislikes_count: Number(post.dislikes_count || 0),
      comments_count: Number(post.comments_count || 0),
      views_count: Number(post.views_count || 0),
      my_reaction: post.my_reaction || null,
      reposted: !!post.reposted
    }));

    currentMentionTracks = tracks.map((track) => ({
      ...track,
      reposted: !!track.reposted,
      listens_count: Number(track.listens_count || 0)
    }));
    window.currentMentionTracks = currentMentionTracks;

    renderMentionsList();
  } catch (err) {
    console.error("loadMentions error", err);
    container.innerHTML = `<div class="post-comments-empty">Упоминания временно недоступны.</div>`;
  }
}

async function togglePostRepost(postId) {
  const token = localStorage.getItem("token");
  if (!token) {
    alert("Нужно войти в аккаунт.");
    return;
  }

  try {
    const res = await fetch(`/api/posts/${postId}/repost`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data?.error === "cannot_repost_own_post") {
        alert("Свой пост репостнуть нельзя.");
      } else {
        alert("Не удалось обновить репост");
      }
      return;
    }

    const reposted = !!data.reposted;

    window.currentPosts = Array.isArray(window.currentPosts)
      ? window.currentPosts.map((post) => (
          Number(post.id) === Number(postId)
            ? { ...post, reposted }
            : post
        ))
      : [];

    currentReposts = Array.isArray(currentReposts)
      ? currentReposts.filter((post) => Number(post.id) !== Number(postId))
      : [];

    updatePostRepostDom(postId, reposted);

    if (document.getElementById("repostsTab")?.classList.contains("active")) {
      await loadReposts();
    }
  } catch (err) {
    console.error("togglePostRepost error", err);
    alert("Не удалось обновить репост");
  }
}

async function registerPostView(postId) {
  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    const res = await fetch(`/api/posts/${postId}/view`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) return;

    const data = await res.json();
    const card = document.querySelector(`.post-card[data-post-id="${postId}"]`);
    const countEl = card?.querySelector(".post-views-count");

    if (countEl && typeof data.views_count !== "undefined") {
      countEl.textContent = String(Number(data.views_count) || 0);
      setCurrentPostPatch(postId, { views_count: Number(data.views_count) || 0 });
    }
  } catch (err) {
    console.error("registerPostView error", err);
  }
}

function clearPostViewTimer(postId) {
  if (!postViewTimers.has(postId)) return;
  clearTimeout(postViewTimers.get(postId));
  postViewTimers.delete(postId);
}

function initPostViewsObserver() {
  if (postViewsObserver) postViewsObserver.disconnect();

  postViewsObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const card = entry.target;
      const postId = card.dataset.postId;

      if (!postId || card.dataset.viewSent === "true") return;

      if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
        if (postViewTimers.has(postId)) return;

        const timer = setTimeout(() => {
          card.dataset.viewSent = "true";
          registerPostView(postId);
          clearPostViewTimer(postId);
          postViewsObserver.unobserve(card);
        }, 1500);

        postViewTimers.set(postId, timer);
      } else {
        clearPostViewTimer(postId);
      }
    });
  }, { threshold: [0.25, 0.6, 0.8] });

  document.querySelectorAll(".post-card[data-post-id]").forEach((card) => {
    if (card.dataset.viewSent === "true") return;
    postViewsObserver.observe(card);
  });
}

const videoObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) entry.target.pause();
  });
}, { threshold: 0.4 });

function togglePostMenu(id) {
  const menu = document.getElementById("postMenu-" + id);
  if (!menu) return;

  const isOpen = !menu.classList.contains("profile-hidden");
  document.querySelectorAll(".post-menu").forEach((item) => item.classList.add("profile-hidden"));
  if (!isOpen) menu.classList.remove("profile-hidden");

  document.querySelectorAll(".post-card").forEach((card) => card.classList.remove("active"));
  const card = menu.closest(".post-card");
  if (card) card.classList.add("active");
}

async function deletePost(id) {
  if (!confirm("Удалить публикацию?")) return;

  try {
    const res = await fetch("/delete-post/" + id, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + localStorage.getItem("token") }
    });

    if (!res.ok) {
      alert("Ошибка удаления");
      return;
    }

    if (Number(activePostCommentsId) === Number(id)) closePostCommentsModal();
    loadPosts();
  } catch (err) {
    console.error(err);
    alert("Ошибка удаления");
  }
}

function pinPost() {
  alert("Закрепление поста следующим шагом докрутим и на сервере, и в UI.");
}

async function archivePost(id) {
  try {
    const res = await fetch("/archive-post/" + id, {
      method: "PUT",
      headers: { Authorization: "Bearer " + localStorage.getItem("token") }
    });

    if (!res.ok) {
      alert("Ошибка архивации");
      return;
    }

    if (Number(activePostCommentsId) === Number(id)) closePostCommentsModal();
    loadPosts();
  } catch (err) {
    console.error(err);
    alert("Ошибка архивации");
  }
}

function editPost(id) {
  const post = getCurrentPostById(id);
  if (!post) return;

  const modal = document.getElementById("postModal");
  if (!modal) return;

  modal.dataset.editId = id;
  const title = document.querySelector(".profile-post-modal-title");
  if (title) title.innerText = "Редактировать публикацию";

  const text = document.getElementById("postText");
  if (text) text.value = post.content || "";

  if (post.media_type === "image") loadImageFromUrl(post.media_url);
  if (post.media_type === "video") loadVideoFromUrl(post.media_url);

  openPostModal();
}

async function togglePostReaction(postId, reaction) {
  const token = localStorage.getItem("token");
  if (!token) {
    alert("Нужно войти в аккаунт.");
    return;
  }

  try {
    const res = await fetch(`/api/posts/${postId}/reaction`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ reaction })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "post_reaction_failed");

    setCurrentPostPatch(postId, {
      my_reaction: data.reaction || null,
      likes_count: Number(data.likes_count || 0),
      dislikes_count: Number(data.dislikes_count || 0)
    });

    updatePostReactionDom(postId, data.reaction || null, data.likes_count, data.dislikes_count);
  } catch (err) {
    console.error("togglePostReaction error", err);
    alert("Не удалось обновить реакцию");
  }
}

function buildCommentsTree(comments) {
  const byId = new Map();
  const roots = [];

  comments.forEach((comment) => {
    byId.set(Number(comment.id), { ...comment, children: [] });
  });

  comments.forEach((comment) => {
    const current = byId.get(Number(comment.id));
    const parentId = comment.parent_id ? Number(comment.parent_id) : null;

    if (parentId && byId.has(parentId)) {
      byId.get(parentId).children.push(current);
    } else {
      roots.push(current);
    }
  });

  return roots;
}

function isCommentThreadExpanded(commentId) {
  return expandedCommentThreads.has(Number(commentId));
}

function toggleCommentThread(commentId) {
  const normalizedId = Number(commentId);
  if (!normalizedId) return;

  if (expandedCommentThreads.has(normalizedId)) {
    expandedCommentThreads.delete(normalizedId);
  } else {
    expandedCommentThreads.add(normalizedId);
  }

  renderPostCommentsList(currentPostComments);
}

function renderCommentNode(comment, depth = 0) {
  const safeName = escapeHtml(comment.username || "user");
  const safeTag = comment.username_tag ? `@${escapeHtml(comment.username_tag)}` : "";
  const safeText = escapeHtml(comment.text || "");
  const avatar = comment.avatar || "/images/default-avatar.jpg";
  const isLiked = comment.my_reaction === "like";
  const isDisliked = comment.my_reaction === "dislike";
  const hasChildren = Array.isArray(comment.children) && comment.children.length > 0;
  const isExpanded = hasChildren ? isCommentThreadExpanded(comment.id) : false;
  const childrenHtml = hasChildren && isExpanded
    ? (comment.children || []).map((child) => renderCommentNode(child, depth + 1)).join("")
    : "";

  return `
    <div class="post-comment ${comment.parent_id ? "is-reply" : ""}" style="--comment-depth:${Math.min(depth, 4)}">
      ${comment.can_delete ? `
        <button type="button" class="post-comment-delete-icon" data-comment-id="${comment.id}" aria-label="Удалить комментарий">
          <i class="fa-regular fa-trash-can"></i>
        </button>
      ` : ""}
      ${renderProfileJumpTag(
        comment.username_tag,
        `<img class="post-comment-avatar" src="${avatar}" alt="${safeName}">`,
        "post-comment-profile-link post-comment-avatar-link"
      )}
      <div class="post-comment-body">
        <div class="post-comment-top">
          ${renderProfileJumpTag(
            comment.username_tag,
            `<span class="post-comment-name">${safeName}</span>`,
            "post-comment-profile-link post-comment-name-link"
          )}
          ${safeTag ? `<span class="post-comment-tag">${safeTag}</span>` : ""}
          <span class="post-comment-date">${formatPostDate(comment.created_at)}</span>
        </div>
        <p class="post-comment-text">${safeText}</p>
        <div class="post-comment-actions">
          <button type="button" class="post-comment-action post-comment-reply-btn" data-comment-id="${comment.id}" data-username="${safeName}">
            <i class="fa-solid fa-reply"></i><span>Ответить</span>
          </button>
          ${hasChildren ? `
            <button
              type="button"
              class="post-comment-action post-comment-thread-toggle ${isExpanded ? "is-open" : ""}"
              data-comment-id="${comment.id}"
            >
              <i class="fa-solid ${isExpanded ? "fa-chevron-up" : "fa-chevron-down"}"></i>
              <span>${isExpanded ? "Скрыть ответы" : `Показать ответы (${comment.children.length})`}</span>
            </button>
          ` : ""}
          <button type="button" class="post-comment-action post-comment-react-btn ${isLiked ? "active-like" : ""}" data-comment-id="${comment.id}" data-reaction="like">
            <i class="fa-${isLiked ? "solid" : "regular"} fa-heart"></i><span>${Number(comment.likes_count || 0)}</span>
          </button>
          <button type="button" class="post-comment-action post-comment-react-btn ${isDisliked ? "active-dislike" : ""}" data-comment-id="${comment.id}" data-reaction="dislike">
            <i class="fa-${isDisliked ? "solid" : "regular"} fa-thumbs-down"></i><span>${Number(comment.dislikes_count || 0)}</span>
          </button>
        </div>
        ${hasChildren ? `<div class="post-comment-children ${isExpanded ? "is-open" : ""}">${childrenHtml}</div>` : ""}
      </div>
    </div>
  `;
}

function renderPostCommentsList(comments) {
  const list = document.getElementById("postCommentsList");
  if (!list) return;

  if (comments === null) {
    list.innerHTML = `<div class="post-comments-loading" aria-hidden="true"><span></span></div>`;
    return;
  }

  if (!comments.length) {
    list.innerHTML = "";
    return;
  }

  const tree = buildCommentsTree(comments);
  list.innerHTML = tree.map((comment) => renderCommentNode(comment)).join("");
}

function setReplyTarget(commentId = null, username = "") {
  activeReplyTarget = commentId ? { id: Number(commentId), username } : null;

  const badge = document.getElementById("postReplyBadge");
  const label = document.getElementById("postReplyLabel");
  if (!badge || !label) return;

  if (!activeReplyTarget) {
    badge.classList.add("profile-hidden");
    label.textContent = "";
    return;
  }

  label.textContent = `Ответ для @${username}`;
  badge.classList.remove("profile-hidden");
}

async function loadPostComments(postId) {
  const token = localStorage.getItem("token");

  try {
    const headers = {};
    if (token) headers.Authorization = "Bearer " + token;

    const res = await fetch(`/api/posts/${postId}/comments`, { headers });
    if (!res.ok) throw new Error("post_comments_load_failed");

    const comments = await res.json();
    currentPostComments = comments.map((comment) => ({
      ...comment,
      likes_count: Number(comment.likes_count || 0),
      dislikes_count: Number(comment.dislikes_count || 0),
      my_reaction: comment.my_reaction || null
    }));

    renderPostCommentsList(currentPostComments);
    updatePostCommentsCountDom(postId, currentPostComments.length);
    setCurrentPostPatch(postId, { comments_count: currentPostComments.length });

    const meta = document.getElementById("postCommentsMeta");
    if (meta) {
      meta.textContent = `${currentPostComments.length} комментариев`;
    }
  } catch (err) {
    console.error("loadPostComments error", err);
    currentPostComments = [];
    renderPostCommentsList(currentPostComments);
  }
}

async function openPostCommentsModal(postId) {
  const post = getCurrentPostById(postId);
  if (!post) return;

  if (activePostCommentsId === Number(postId)) {
    closePostCommentsModal();
    return;
  }

  activePostCommentsId = Number(postId);
  currentPostComments = null;
  setReplyTarget(null);
  renderPostsList();
  await loadPostComments(postId);
  document.getElementById("postCommentInput")?.focus();
}

function closePostCommentsModal() {
  activePostCommentsId = null;
  currentPostComments = [];
  expandedCommentThreads.clear();
  setReplyTarget(null);
  renderPostsList();
}

async function submitPostComment() {
  const token = localStorage.getItem("token");
  const input = document.getElementById("postCommentInput");
  const submitBtn = document.getElementById("postCommentSubmitBtn");

  if (!token) {
    alert("Нужно войти в аккаунт.");
    return;
  }

  if (!activePostCommentsId || !input || !submitBtn) return;

  const text = input.value.trim();
  if (!text) {
    input.focus();
    return;
  }

  submitBtn.disabled = true;

  try {
    const res = await fetch(`/api/posts/${activePostCommentsId}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({
        text,
        parentId: activeReplyTarget?.id || null
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data?.error === "comment_rate_limited") {
        alert("Слишком быстро. Подожди секунду и отправь ещё раз.");
      } else if (data?.error === "post_comment_create_failed") {
        alert("Комментарии на сервере ещё не обновились. Перезапусти сервер и попробуй ещё раз.");
      } else if (data?.error === "comment_text_required") {
        input.focus();
      } else {
        alert("Не удалось отправить комментарий");
      }
      return;
    }

    input.value = "";
    setReplyTarget(null);

    if (typeof data.comments_count !== "undefined") {
      updatePostCommentsCountDom(activePostCommentsId, data.comments_count);
      setCurrentPostPatch(activePostCommentsId, { comments_count: Number(data.comments_count || 0) });
    }

    if (data?.xp && typeof window.applyXPAndCheckRank === "function") {
      window.applyXPAndCheckRank(data.xp, data.newXP, data.xpState);
    } else if (data?.xp && typeof window.showXP === "function") {
      window.showXP(data.xp);
    }

    await loadPostComments(activePostCommentsId);
  } catch (err) {
    console.error("submitPostComment error", err);
    alert("Не удалось отправить комментарий");
  } finally {
    submitBtn.disabled = false;
  }
}

async function deletePostComment(commentId) {
  const token = localStorage.getItem("token");
  if (!token) {
    alert("Нужно войти в аккаунт.");
    return;
  }

  if (!activePostCommentsId || !commentId) return;

  const confirmed = window.confirm("Удалить комментарий?");
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/post-comments/${commentId}`, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data?.error === "comment_delete_forbidden") {
        alert("Этот комментарий нельзя удалить с твоего аккаунта.");
      } else {
        alert("Не удалось удалить комментарий");
      }
      return;
    }

    if (activeReplyTarget && Number(activeReplyTarget.id) === Number(commentId)) {
      setReplyTarget(null);
    }

    if (typeof data.comments_count !== "undefined") {
      updatePostCommentsCountDom(activePostCommentsId, data.comments_count);
      setCurrentPostPatch(activePostCommentsId, { comments_count: Number(data.comments_count || 0) });
    }

    await loadPostComments(activePostCommentsId);
  } catch (err) {
    console.error("deletePostComment error", err);
    alert("Не удалось удалить комментарий");
  }
}

async function togglePostCommentReaction(commentId, reaction) {
  const token = localStorage.getItem("token");
  if (!token) {
    alert("Нужно войти в аккаунт.");
    return;
  }

  try {
    const res = await fetch(`/api/post-comments/${commentId}/reaction`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ reaction })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "post_comment_reaction_failed");

    currentPostComments = currentPostComments.map((comment) => (
      Number(comment.id) === Number(commentId)
        ? {
            ...comment,
            my_reaction: data.reaction || null,
            likes_count: Number(data.likes_count || 0),
            dislikes_count: Number(data.dislikes_count || 0)
          }
        : comment
    ));

    renderPostsList();
  } catch (err) {
    console.error("togglePostCommentReaction error", err);
    alert("Не удалось обновить реакцию комментария");
  }
}

function initPostUiBindings() {
  if (postUiBound) return;
  postUiBound = true;

  document.addEventListener("click", (e) => {
    const reactionBtn = e.target.closest(".post-reaction-btn");
    if (reactionBtn) {
      e.preventDefault();
      togglePostReaction(Number(reactionBtn.dataset.postId), reactionBtn.dataset.reaction);
      return;
    }

    const commentsBtn = e.target.closest(".post-comments-open-btn");
    if (commentsBtn) {
      e.preventDefault();
      openPostCommentsModal(Number(commentsBtn.dataset.postId));
      return;
    }

    const commentsCloseBtn = e.target.closest(".post-inline-comments-close");
    if (commentsCloseBtn) {
      e.preventDefault();
      closePostCommentsModal();
      return;
    }

    const repostBtn = e.target.closest(".post-repost-btn");
    if (repostBtn) {
      e.preventDefault();
      togglePostRepost(Number(repostBtn.dataset.postId));
      return;
    }

    const saveBtn = e.target.closest(".post-save-btn");
    if (saveBtn) {
      e.preventDefault();
      const postId = Number(saveBtn.dataset.postId);
      const saved = toggleSavedPost(postId);
      updatePostSaveDom(postId, saved);
      return;
    }

    const replyBtn = e.target.closest(".post-comment-reply-btn");
    if (replyBtn) {
      e.preventDefault();
      setReplyTarget(replyBtn.dataset.commentId, replyBtn.dataset.username || "user");
      document.getElementById("postCommentInput")?.focus();
      return;
    }

    const threadToggleBtn = e.target.closest(".post-comment-thread-toggle");
    if (threadToggleBtn) {
      e.preventDefault();
      toggleCommentThread(threadToggleBtn.dataset.commentId);
      return;
    }

    const deleteCommentBtn = e.target.closest(".post-comment-delete-icon");
    if (deleteCommentBtn) {
      e.preventDefault();
      deletePostComment(Number(deleteCommentBtn.dataset.commentId));
      return;
    }

    const commentReactionBtn = e.target.closest(".post-comment-react-btn");
    if (commentReactionBtn) {
      e.preventDefault();
      togglePostCommentReaction(Number(commentReactionBtn.dataset.commentId), commentReactionBtn.dataset.reaction);
      return;
    }

    if (e.target.closest(".post-reply-cancel-btn")) {
      e.preventDefault();
      setReplyTarget(null);
      return;
    }

    if (!e.target.closest(".post-menu-container")) {
      document.querySelectorAll(".post-menu").forEach((menu) => menu.classList.add("profile-hidden"));
    }

  });

  document.addEventListener("keydown", (e) => {
    if (e.target?.id === "postCommentInput" && (e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      submitPostComment();
    }
  });
}

function initPosts() {
  const container = document.getElementById("postsContainer");
  if (!container) return;
  if (container.dataset.postsInitialized === "true") return;

  currentPostsContainerId = "postsContainer";
  container.dataset.postsInitialized = "true";
  initPostUiBindings();
  loadPosts();
}

document.addEventListener("click", (e) => {
  const player = e.target.closest(".video-player");
  if (!player) return;

  const video = player.querySelector("video");
  const playIcon = player.querySelector(".play-btn i");
  if (!video || !playIcon) return;

  if (e.target.closest(".play-btn") || e.target.closest(".video-overlay") || e.target.tagName === "VIDEO") {
    if (video.paused) {
      video.play();
      player.classList.add("playing");
      playIcon.className = "fa-solid fa-pause";
    } else {
      video.pause();
      player.classList.remove("playing");
      playIcon.className = "fa-solid fa-play";
    }
  }
});

document.addEventListener("timeupdate", (e) => {
  if (e.target.tagName !== "VIDEO") return;

  const video = e.target;
  const player = video.closest(".video-player");
  if (!player) return;

  const bar = player.querySelector(".video-progress-bar");
  const current = player.querySelector(".current");
  const duration = player.querySelector(".duration");
  if (!bar || !current || !duration || !video.duration) return;

  bar.style.width = `${(video.currentTime / video.duration) * 100}%`;
  current.textContent = `${Math.floor(video.currentTime / 60)}:${Math.floor(video.currentTime % 60).toString().padStart(2, "0")}`;
  duration.textContent = `${Math.floor(video.duration / 60)}:${Math.floor(video.duration % 60).toString().padStart(2, "0")}`;
}, true);

document.addEventListener("click", (e) => {
  const progress = e.target.closest(".video-progress");
  if (!progress) return;

  const player = progress.closest(".video-player");
  const video = player?.querySelector("video");
  if (!video || !video.duration) return;

  const rect = progress.getBoundingClientRect();
  video.currentTime = ((e.clientX - rect.left) / rect.width) * video.duration;
});

document.addEventListener("input", (e) => {
  if (!e.target.classList.contains("volume")) return;

  const slider = e.target;
  const player = slider.closest(".video-player");
  const video = player?.querySelector("video");
  if (!video) return;

  applyVideoVolume(player, Number(slider.value));
});

document.addEventListener("click", (e) => {
  const muteBtn = e.target.closest(".mute-btn");
  if (!muteBtn) return;

  const player = muteBtn.closest(".video-player");
  const slider = player?.querySelector(".volume");
  if (!player || !slider) return;

  const current = Number(slider.value || 0);
  if (current > 0.001) {
    applyVideoVolume(player, 0, { remember: true });
    return;
  }

  const remembered = Number(player.dataset.lastVolume || 0.3);
  applyVideoVolume(player, remembered > 0.001 ? remembered : 0.3, { remember: true });
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".fullscreen-btn")) return;
  const player = e.target.closest(".video-player");
  if (!player) return;
  if (!document.fullscreenElement) player.requestFullscreen();
  else document.exitFullscreen();
});

document.addEventListener("mousemove", (e) => {
  const player = e.target.closest(".video-player");
  if (!player) return;

  player.classList.remove("hide-ui");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => player.classList.add("hide-ui"), 2000);
});

document.addEventListener("pause", (e) => {
  if (e.target.tagName !== "VIDEO") return;
  e.target.closest(".video-player")?.classList.remove("hide-ui");
}, true);

document.addEventListener("play", (e) => {
  if (e.target.tagName !== "VIDEO") return;
  const player = e.target.closest(".video-player");
  const icon = player?.querySelector(".play-btn i");
  if (!player || !icon) return;
  player.classList.add("playing");
  icon.className = "fa-solid fa-pause";
}, true);

document.addEventListener("pause", (e) => {
  if (e.target.tagName !== "VIDEO") return;
  const player = e.target.closest(".video-player");
  const icon = player?.querySelector(".play-btn i");
  if (!player || !icon) return;
  player.classList.remove("playing");
  icon.className = "fa-solid fa-play";
}, true);

function updateVolumeSlider(slider) {
  if (!slider) return;
  const percent = Math.max(0, Math.min(100, Number(slider.value || 0) * 100));
  slider.style.setProperty("--video-volume", `${percent}%`);
}

function syncVideoMuteButton(player) {
  const video = player?.querySelector("video");
  const muteBtn = player?.querySelector(".mute-btn");
  if (!video || !muteBtn) return;

  const icon = muteBtn.querySelector("i");
  const safeVolume = Number(video.volume || 0);
  const isMuted = video.muted || safeVolume <= 0.001;

  if (icon) {
    icon.className = `fa-solid ${isMuted ? "fa-volume-xmark" : (safeVolume < 0.55 ? "fa-volume-low" : "fa-volume-high")}`;
  }

  muteBtn.classList.toggle("muted", isMuted);
  muteBtn.setAttribute("aria-label", isMuted ? "Включить звук" : "Выключить звук");
}

function applyVideoVolume(player, nextValue, { remember = true } = {}) {
  const video = player?.querySelector("video");
  const slider = player?.querySelector(".volume");
  if (!video || !slider) return;

  const safe = Math.max(0, Math.min(1, Number(nextValue || 0)));
  if (remember && safe > 0.001) {
    player.dataset.lastVolume = String(safe);
  }

  video.muted = safe <= 0.001;
  video.volume = safe;
  slider.value = String(safe);
  updateVolumeSlider(slider);
  syncVideoMuteButton(player);
}

window.togglePostMenu = togglePostMenu;
window.deletePost = deletePost;
window.archivePost = archivePost;
window.editPost = editPost;
window.initPosts = initPosts;
window.pinPost = pinPost;
window.openPostCommentsModal = openPostCommentsModal;
window.closePostCommentsModal = closePostCommentsModal;
window.submitPostComment = submitPostComment;
window.deletePostComment = deletePostComment;
window.loadReposts = loadReposts;
window.loadMentions = loadMentions;
window.renderMentionMarkup = renderMentionMarkup;
window.goToMentionProfile = goToMentionProfile;
window.renderPostsList = renderPostsList;
window.setPostsRenderContext = setPostsRenderContext;
window.initPostUiBindings = initPostUiBindings;

function loadImageFromUrl(url) {
  fetch(url)
    .then((res) => res.blob())
    .then((blob) => {
      const file = new File([blob], "image-from-server.jpg", { type: blob.type });
      handleSelectedFile(file);
    })
    .catch((err) => console.error("loadImageFromUrl error", err));
}

function loadVideoFromUrl(url) {
  fetch(url)
    .then((res) => res.blob())
    .then((blob) => {
      const file = new File([blob], "video-from-server.mp4", { type: blob.type });
      handleSelectedFile(file);
    })
    .catch((err) => console.error("loadVideoFromUrl error", err));
}
