function initSubmitPage() {
  const coverInput = document.getElementById("coverInput");
  const coverPreview = document.getElementById("coverPreview");
  const coverPlaceholder = document.getElementById("coverPlaceholder");

  const audioInput = document.getElementById("audioInput");
  const audioPreview = document.getElementById("audioPreview");
  const audioPreviewWrap = document.getElementById("audioPreviewWrap");
  const audioFileName = document.getElementById("audioFileName");

  const soundcloudInput = document.getElementById("soundcloudInput");
  const artistInput = document.getElementById("artistInput");
  const titleInput = document.getElementById("titleInput");
  const fetchBtn = document.getElementById("fetchBtn");
  const statusText = document.getElementById("statusText");
  const trackForm = document.getElementById("trackForm");
  const submitBtn = trackForm?.querySelector(".submit-submit-btn");
  const sourceSwitch = document.getElementById("submitSourceSwitch");
  const profilePicker = document.getElementById("submitProfilePicker");
  const profileTracksEl = document.getElementById("submitProfileTracks");
  const profilePickerMeta = document.getElementById("submitProfilePickerMeta");

  if (!trackForm) return;

  if (trackForm.dataset.submitInitialized === "true") return;
  trackForm.dataset.submitInitialized = "true";

  let externalCoverUrl = null;
  let queueStateInterval = null;
  const maxQueueTrackSize = 20 * 1024 * 1024;
  let submitSourceMode = "upload";
  let profileTracksLoaded = false;
  let profileTracks = [];
  let selectedProfileTrackId = null;

  function setStatus(message, type = "") {
    if (!statusText) return;

    statusText.textContent = message;
    statusText.className = "submit-status";

    if (type === "error") {
      statusText.classList.add("submit-status-error");
    }

    if (type === "success") {
      statusText.classList.add("submit-status-success");
    }
  }

  function resetCoverPreview() {
    externalCoverUrl = null;

    if (coverPreview) {
      coverPreview.src = "";
      coverPreview.style.display = "none";
    }

    if (coverPlaceholder) {
      coverPlaceholder.style.display = "flex";
    }

    if (coverInput) {
      coverInput.value = "";
    }
  }

  function resetAudioPreview() {
    if (audioPreview) {
      audioPreview.pause();
      audioPreview.removeAttribute("src");
      audioPreview.load();
    }

    if (audioPreviewWrap) {
      audioPreviewWrap.style.display = "none";
    }

    if (audioFileName) {
      audioFileName.textContent = "Файл не выбран";
    }

    if (audioInput) {
      audioInput.value = "";
    }
  }

  function setSubmitSourceMode(mode = "upload") {
    submitSourceMode = mode === "profile" ? "profile" : "upload";
    trackForm.classList.toggle("submit-mode-profile", submitSourceMode === "profile");
    profilePicker?.classList.toggle("submit-profile-picker-hidden", submitSourceMode !== "profile");

    sourceSwitch?.querySelectorAll("[data-submit-source]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.submitSource === submitSourceMode);
    });

    if (submitSourceMode === "profile" && !profileTracksLoaded) {
      loadProfileTracksForSubmit();
    }
  }

  function formatProfileTrackDate(dateValue) {
    if (!dateValue) return "";
    const date = new Date(dateValue);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ru-RU");
  }

  function renderSubmitProfileTracks() {
    if (!profileTracksEl) return;

    if (!profileTracks.length) {
      profileTracksEl.innerHTML = `<div class="submit-status">В профиле пока нет треков для отправки на оценку.</div>`;
      return;
    }

    profileTracksEl.innerHTML = profileTracks.map((track) => {
      const cover = track.cover
        ? (String(track.cover).startsWith("http") ? String(track.cover) : "/" + String(track.cover).replace(/^\/+/, ""))
        : "/images/default-cover.jpg";
      const disabled = !!track.is_in_queue;
      const selected = Number(selectedProfileTrackId) === Number(track.id);

      return `
        <button
          type="button"
          class="submit-profile-track-card ${selected ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}"
          data-profile-track-id="${track.id}"
          ${disabled ? "disabled" : ""}
        >
          <img src="${cover}" class="submit-profile-track-cover" alt="${track.title || "Track cover"}">
          <div class="submit-profile-track-info">
            <div class="submit-profile-track-title">${track.title || "Без названия"}</div>
            <div class="submit-profile-track-artist">${track.artist || track.username_tag || "Артист"}</div>
            <div class="submit-profile-track-meta">${formatProfileTrackDate(track.created_at)}${track.genre ? ` • #${track.genre}` : ""}</div>
          </div>
          <div class="submit-profile-track-badge">${disabled ? "Уже в очереди" : (selected ? "Выбрано" : "Выбрать")}</div>
        </button>
      `;
    }).join("");

    profileTracksEl.querySelectorAll("[data-profile-track-id]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedProfileTrackId = Number(button.dataset.profileTrackId);
        renderSubmitProfileTracks();
      });
    });

    if (profilePickerMeta) {
      const availableCount = profileTracks.filter((track) => !track.is_in_queue).length;
      profilePickerMeta.textContent = `Доступно ${availableCount}`;
    }
  }

  async function loadProfileTracksForSubmit() {
    if (!profileTracksEl) return;

    try {
      profileTracksEl.innerHTML = `<div class="submit-status">Загружаем треки...</div>`;

      const res = await fetch("/user-tracks", {
        headers: {
          Authorization: "Bearer " + localStorage.getItem("token")
        }
      });

      if (!res.ok) {
        throw new Error("profile_tracks_load_failed");
      }

      const data = await res.json();
      profileTracks = Array.isArray(data)
        ? data.filter((track) => track.audio || track.soundcloud)
        : [];
      profileTracksLoaded = true;

      if (!selectedProfileTrackId) {
        selectedProfileTrackId = Number(profileTracks.find((track) => !track.is_in_queue)?.id || 0) || null;
      }

      renderSubmitProfileTracks();
    } catch (err) {
      console.error("loadProfileTracksForSubmit error", err);
      profileTracksLoaded = false;
      profileTracksEl.innerHTML = `<div class="submit-status submit-status-error">Не удалось загрузить треки из профиля.</div>`;
    }
  }


  async function checkQueueState() {
    try {
      const res = await fetch("/api/queue/state");
      const data = await res.json();

      if (!submitBtn) return;

      if (data.state !== "open") {
        submitBtn.disabled = true;

        if (data.state === "closed") {
          setStatus("Очередь закрыта", "error");
        } else if (data.state === "paused") {
          setStatus("Очередь временно приостановлена", "error");
        } else {
          setStatus("Отправка сейчас недоступна", "error");
        }

        return;
      }

      submitBtn.disabled = false;

      if (
        statusText &&
        statusText.classList.contains("submit-status-error") &&
        (
          statusText.textContent === "Очередь закрыта" ||
          statusText.textContent === "Очередь временно приостановлена" ||
          statusText.textContent === "Отправка сейчас недоступна"
        )
      ) {
        setStatus("");
      }
    } catch (err) {
      console.error("Ошибка проверки состояния очереди:", err);
    }
  }

  coverInput?.addEventListener("change", function () {
    const file = this.files?.[0];
    if (!file) return;

    externalCoverUrl = null;

    const imageUrl = URL.createObjectURL(file);
    coverPreview.src = imageUrl;
    coverPreview.style.display = "block";
    coverPlaceholder.style.display = "none";
  });

  coverInput?.addEventListener("click", function () {
    this.value = "";
  });

  audioInput?.addEventListener("change", function () {
    const file = this.files?.[0];

    if (!file) {
      resetAudioPreview();
      return;
    }

    if (file.size > maxQueueTrackSize) {
      setStatus("Для очереди можно загрузить файл до 20 МБ", "error");
      resetAudioPreview();
      return;
    }

    audioFileName.textContent = file.name;
    audioPreview.src = URL.createObjectURL(file);
    audioPreviewWrap.style.display = "block";
  });

  audioInput?.addEventListener("click", function () {
    this.value = "";
  });

  fetchBtn?.addEventListener("click", async () => {
    const url = soundcloudInput.value.trim();

    if (!url) {
      setStatus("Вставь ссылку SoundCloud", "error");
      return;
    }

    try {
      setStatus("Подтягиваю данные...");

      const response = await fetch(`/api/soundcloud?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(window.getApiErrorMessage?.(data, "Не удалось подтянуть данные из SoundCloud") || "Не удалось подтянуть данные из SoundCloud");
      }

      if (data.artist) {
        artistInput.value = data.artist;
      }

      if (data.title) {
        titleInput.value = data.title;
      }

      if (data.artwork) {
        coverPreview.src = data.artwork;
        coverPreview.style.display = "block";
        coverPlaceholder.style.display = "none";
        externalCoverUrl = data.artwork;
      }

      setStatus("Данные подтянуты", "success");
    } catch (error) {
      console.error("Ошибка получения данных из SoundCloud:", error);
      setStatus("Не удалось подтянуть данные из SoundCloud", "error");
    }
  });

  sourceSwitch?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-submit-source]");
    if (!button) return;
    setSubmitSourceMode(button.dataset.submitSource);
  });


  trackForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (submitSourceMode === "profile") {
      if (!selectedProfileTrackId) {
        setStatus("Выбери трек из профиля", "error");
        return;
      }

      try {
        setStatus("Отправка...");
        if (submitBtn) submitBtn.disabled = true;

        const token = localStorage.getItem("token");
        const res = await fetch("/api/tracks/from-profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token
          },
          body: JSON.stringify({ profileTrackId: selectedProfileTrackId })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(window.getApiErrorMessage?.(data, "Не удалось отправить трек из профиля") || "Не удалось отправить трек из профиля");
        }

        setStatus("Трек из профиля отправлен в очередь", "success");
        profileTracks = profileTracks.map((track) => (
          Number(track.id) === Number(selectedProfileTrackId)
            ? { ...track, is_in_queue: true }
            : track
        ));
        selectedProfileTrackId = Number(profileTracks.find((track) => !track.is_in_queue)?.id || 0) || null;
        renderSubmitProfileTracks();
      } catch (err) {
        console.error("submit profile track error", err);
        setStatus(err.message || "Не удалось отправить трек из профиля", "error");
      } finally {
        await checkQueueState();
      }

      return;
    }

    const audioFile = audioInput?.files?.[0];
    const coverFile = coverInput?.files?.[0];
    const soundcloud = soundcloudInput?.value.trim() || "";
    const artist = artistInput.value.trim();
    const title = titleInput.value.trim();

    if (!audioFile && !soundcloud) {
      setStatus("Загрузите песню или вставьте ссылку SoundCloud", "error");
      return;
    }

    if (!artist || !title) {
      setStatus("Заполни автора и название", "error");
      return;
    }

    const formData = new FormData();
    formData.append("artist", artist);
    formData.append("title", title);
    formData.append("soundcloud", soundcloud);

    if (audioFile) {
      formData.append("audio", audioFile);
    }

    if (externalCoverUrl) {
      formData.append("coverUrl", externalCoverUrl);
    } else if (coverFile) {
      formData.append("cover", coverFile);
    }

    try {
      setStatus("Отправка...");

      if (submitBtn) {
        submitBtn.disabled = true;
      }

      const token = localStorage.getItem("token");

      const res = await fetch("/api/tracks", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token
        },
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(window.getApiErrorMessage?.(data, "Не удалось отправить трек") || "Не удалось отправить трек");
      }

      setStatus("Трек успешно отправлен", "success");

      trackForm.reset();
      resetCoverPreview();
      resetAudioPreview();
    } catch (err) {
      console.error("Ошибка отправки трека:", err);
      setStatus(err.message || "Не удалось отправить трек", "error");
    } finally {
      await checkQueueState();
    }
  });

  checkQueueState();
  setSubmitSourceMode("upload");

  if (window.__submitQueueInterval) {
    clearInterval(window.__submitQueueInterval);
  }

  queueStateInterval = setInterval(checkQueueState, 3000);
  window.__submitQueueInterval = queueStateInterval;
}

window.initSubmitPage = initSubmitPage;
