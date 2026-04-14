(function () {
  function escapeTrackCommentHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function defaultFormatDate(value) {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(value));
    } catch {
      return "";
    }
  }

  function buildTrackCommentsTree(comments) {
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

  function createTrackCommentsController(config = {}) {
    const state = {
      comments: [],
      activeReplyTarget: null,
      expandedThreads: new Set()
    };

    const options = {
      trackId: Number(config.trackId || 0),
      listEl: config.listEl,
      inputEl: config.inputEl,
      submitEl: config.submitEl,
      replyBadgeEl: config.replyBadgeEl,
      replyLabelEl: config.replyLabelEl,
      replyCancelEl: config.replyCancelEl,
      countEls: Array.isArray(config.countEls) ? config.countEls.filter(Boolean) : [],
      emptyText: config.emptyText || "Комментариев пока нет.",
      errorText: config.errorText || "Не удалось загрузить комментарии.",
      onAfterLoad: typeof config.onAfterLoad === "function" ? config.onAfterLoad : null,
      onBeforeSubmit: typeof config.onBeforeSubmit === "function" ? config.onBeforeSubmit : null,
      onXp: typeof config.onXp === "function" ? config.onXp : null,
      formatDate: typeof config.formatDate === "function" ? config.formatDate : defaultFormatDate,
      navigateToProfile: typeof config.navigateToProfile === "function"
        ? config.navigateToProfile
        : (tag) => {
            if (!tag) return;
            if (typeof window.navigate === "function") {
              window.navigate(`/${tag}`);
            } else {
              window.location.href = `/${tag}`;
            }
          }
    };

    function setCount(count) {
      const safeCount = String(Number(count) || 0);
      options.countEls.forEach((el) => {
        el.textContent = safeCount;
      });
    }

    function setReplyTarget(commentId = null, username = "") {
      state.activeReplyTarget = commentId ? { id: Number(commentId), username } : null;

      if (!options.replyBadgeEl || !options.replyLabelEl) return;

      if (!state.activeReplyTarget) {
        options.replyBadgeEl.classList.add("track-thread-hidden");
        options.replyLabelEl.textContent = "";
        return;
      }

      options.replyLabelEl.textContent = `Ответ для @${username}`;
      options.replyBadgeEl.classList.remove("track-thread-hidden");
    }

    function isExpanded(commentId) {
      return state.expandedThreads.has(Number(commentId));
    }

    function toggleThread(commentId) {
      const normalizedId = Number(commentId);
      if (!normalizedId) return;

      if (state.expandedThreads.has(normalizedId)) {
        state.expandedThreads.delete(normalizedId);
      } else {
        state.expandedThreads.add(normalizedId);
      }

      renderComments();
    }

    function renderNode(comment, depth = 0) {
      const safeName = escapeTrackCommentHtml(comment.username || "user");
      const safeTag = comment.username_tag ? `@${escapeTrackCommentHtml(comment.username_tag)}` : "";
      const safeText = escapeTrackCommentHtml(comment.text || "").replace(/\n/g, "<br>");
      const avatar = comment.avatar
        ? "/" + String(comment.avatar).replace(/^\/+/, "")
        : "/images/default-avatar.jpg";
      const isLiked = comment.my_reaction === "like";
      const isDisliked = comment.my_reaction === "dislike";
      const hasChildren = Array.isArray(comment.children) && comment.children.length > 0;
      const expanded = hasChildren ? isExpanded(comment.id) : false;
      const createdAt = options.formatDate(comment.created_at);

      return `
        <div class="track-thread-comment ${comment.parent_id ? "is-reply" : ""}" style="--comment-depth:${Math.min(depth, 4)}">
          ${comment.can_delete ? `
            <button type="button" class="track-thread-delete" data-comment-id="${comment.id}" aria-label="Удалить комментарий">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          ` : ""}
          <a href="/${encodeURIComponent(comment.username_tag || "")}" class="track-thread-profile-link track-thread-avatar-link" data-profile-tag="${escapeTrackCommentHtml(comment.username_tag || "")}">
            <img class="track-thread-avatar" src="${avatar}" alt="${safeName}">
          </a>
          <div class="track-thread-body">
            <div class="track-thread-top">
              <a href="/${encodeURIComponent(comment.username_tag || "")}" class="track-thread-profile-link track-thread-name-link" data-profile-tag="${escapeTrackCommentHtml(comment.username_tag || "")}">
                <span class="track-thread-name">${safeName}</span>
              </a>
              ${safeTag ? `<span class="track-thread-tag">${safeTag}</span>` : ""}
              ${createdAt ? `<span class="track-thread-date">${escapeTrackCommentHtml(createdAt)}</span>` : ""}
            </div>
            <div class="track-thread-text">${safeText}</div>
            <div class="track-thread-actions">
              <button type="button" class="track-thread-action track-thread-reply-btn" data-comment-id="${comment.id}" data-username="${safeName}">
                <i class="fa-solid fa-reply"></i><span>Ответить</span>
              </button>
              ${hasChildren ? `
                <button type="button" class="track-thread-action track-thread-toggle ${expanded ? "is-open" : ""}" data-comment-id="${comment.id}">
                  <i class="fa-solid ${expanded ? "fa-chevron-up" : "fa-chevron-down"}"></i>
                  <span>${expanded ? "Скрыть ответы" : `Показать ответы (${comment.children.length})`}</span>
                </button>
              ` : ""}
              <button type="button" class="track-thread-action track-thread-react ${isLiked ? "active-like" : ""}" data-comment-id="${comment.id}" data-reaction="like">
                <i class="fa-${isLiked ? "solid" : "regular"} fa-heart"></i><span>${Number(comment.likes_count || 0)}</span>
              </button>
              <button type="button" class="track-thread-action track-thread-react ${isDisliked ? "active-dislike" : ""}" data-comment-id="${comment.id}" data-reaction="dislike">
                <i class="fa-${isDisliked ? "solid" : "regular"} fa-thumbs-down"></i><span>${Number(comment.dislikes_count || 0)}</span>
              </button>
            </div>
            ${hasChildren && expanded ? `
              <div class="track-thread-children">
                ${comment.children.map((child) => renderNode(child, depth + 1)).join("")}
              </div>
            ` : ""}
          </div>
        </div>
      `;
    }

    function renderComments() {
      if (!options.listEl) return;

      if (!Array.isArray(state.comments) || !state.comments.length) {
        options.listEl.innerHTML = `<div class="track-thread-empty">${escapeTrackCommentHtml(options.emptyText)}</div>`;
        return;
      }

      const tree = buildTrackCommentsTree(state.comments);
      options.listEl.innerHTML = tree.map((comment) => renderNode(comment)).join("");
    }

    async function loadComments() {
      if (!options.trackId || !options.listEl) return;

      try {
        const token = localStorage.getItem("token");
        const headers = token ? { Authorization: "Bearer " + token } : {};
        const res = await fetch(`/track-comments/${options.trackId}`, { headers });

        if (!res.ok) {
          throw new Error(`track_comments_load_failed:${res.status}`);
        }

        const comments = await res.json();
        state.comments = Array.isArray(comments)
          ? comments.map((comment) => ({
              ...comment,
              likes_count: Number(comment.likes_count || 0),
              dislikes_count: Number(comment.dislikes_count || 0),
              my_reaction: comment.my_reaction || null
            }))
          : [];

        setCount(state.comments.length);
        renderComments();
        options.onAfterLoad?.(state.comments);
      } catch (err) {
        console.error("track comments load error", err);
        options.listEl.innerHTML = `<div class="track-thread-empty">${escapeTrackCommentHtml(options.errorText)}</div>`;
      }
    }

    async function submitComment() {
      const token = localStorage.getItem("token");
      if (!token) {
        alert("Нужно войти в аккаунт.");
        return;
      }

      if (!options.inputEl || !options.submitEl || !options.trackId) return;

      const text = String(options.inputEl.value || "").trim();
      if (!text) {
        options.inputEl.focus();
        return;
      }

      const payload = {
        trackId: options.trackId,
        text,
        parentId: state.activeReplyTarget?.id || null
      };

      options.onBeforeSubmit?.(payload);

      options.submitEl.disabled = true;

      try {
        const res = await fetch("/add-track-comment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data?.error === "comment_rate_limited") {
            alert("Слишком быстро. Подожди пару секунд и попробуй снова.");
          } else if (data?.error === "comment_text_required") {
            options.inputEl.focus();
          } else {
            alert("Не удалось отправить комментарий");
          }
          return;
        }

        options.inputEl.value = "";
        setReplyTarget(null);

        if (typeof data?.comments_count !== "undefined") {
          setCount(data.comments_count);
        }

        if (data?.xp) {
          options.onXp?.(data);
        }

        await loadComments();
      } catch (err) {
        console.error("track comment submit error", err);
        alert("Не удалось отправить комментарий");
      } finally {
        options.submitEl.disabled = false;
      }
    }

    async function deleteComment(commentId) {
      const token = localStorage.getItem("token");
      if (!token) {
        alert("Нужно войти в аккаунт.");
        return;
      }

      const confirmed = window.confirm("Удалить комментарий?");
      if (!confirmed) return;

      try {
        const res = await fetch(`/api/track-comments/${commentId}`, {
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

        if (state.activeReplyTarget && Number(state.activeReplyTarget.id) === Number(commentId)) {
          setReplyTarget(null);
        }

        if (typeof data?.comments_count !== "undefined") {
          setCount(data.comments_count);
        }

        await loadComments();
      } catch (err) {
        console.error("track comment delete error", err);
        alert("Не удалось удалить комментарий");
      }
    }

    async function toggleReaction(commentId, reaction) {
      const token = localStorage.getItem("token");
      if (!token) {
        alert("Нужно войти в аккаунт.");
        return;
      }

      try {
        const res = await fetch(`/api/track-comments/${commentId}/reaction`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token
          },
          body: JSON.stringify({ reaction })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || "track_comment_reaction_failed");
        }

        state.comments = state.comments.map((comment) => (
          Number(comment.id) === Number(commentId)
            ? {
                ...comment,
                my_reaction: data.reaction || null,
                likes_count: Number(data.likes_count || 0),
                dislikes_count: Number(data.dislikes_count || 0)
              }
            : comment
        ));

        renderComments();
      } catch (err) {
        console.error("track comment reaction error", err);
        alert("Не удалось обновить реакцию комментария");
      }
    }

    function bind() {
      options.submitEl?.addEventListener("click", submitComment);
      options.replyCancelEl?.addEventListener("click", () => setReplyTarget(null));
      options.inputEl?.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          submitComment();
        }
      });

      options.listEl?.addEventListener("click", (e) => {
        const profileLink = e.target.closest("[data-profile-tag]");
        if (profileLink) {
          e.preventDefault();
          options.navigateToProfile(profileLink.dataset.profileTag);
          return;
        }

        const replyBtn = e.target.closest(".track-thread-reply-btn");
        if (replyBtn) {
          e.preventDefault();
          setReplyTarget(replyBtn.dataset.commentId, replyBtn.dataset.username || "user");
          options.inputEl?.focus();
          return;
        }

        const toggleBtn = e.target.closest(".track-thread-toggle");
        if (toggleBtn) {
          e.preventDefault();
          toggleThread(toggleBtn.dataset.commentId);
          return;
        }

        const reactBtn = e.target.closest(".track-thread-react");
        if (reactBtn) {
          e.preventDefault();
          toggleReaction(reactBtn.dataset.commentId, reactBtn.dataset.reaction);
          return;
        }

        const deleteBtn = e.target.closest(".track-thread-delete");
        if (deleteBtn) {
          e.preventDefault();
          deleteComment(deleteBtn.dataset.commentId);
        }
      });
    }

    bind();

    return {
      loadComments,
      setReplyTarget,
      getComments: () => state.comments.slice()
    };
  }

  window.createTrackCommentsController = createTrackCommentsController;
})();
