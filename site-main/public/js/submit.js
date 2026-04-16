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

  if (!trackForm) return;

  if (trackForm.dataset.submitInitialized === "true") return;
  trackForm.dataset.submitInitialized = "true";

  let externalCoverUrl = null;
  let queueStateInterval = null;
  const maxQueueTrackSize = 20 * 1024 * 1024;

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


  trackForm.addEventListener("submit", async (e) => {
    e.preventDefault();

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

  if (window.__submitQueueInterval) {
    clearInterval(window.__submitQueueInterval);
  }

  queueStateInterval = setInterval(checkQueueState, 3000);
  window.__submitQueueInterval = queueStateInterval;
}

window.initSubmitPage = initSubmitPage;
