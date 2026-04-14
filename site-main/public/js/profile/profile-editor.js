let postEditorState = {
  file: null,
  fileType: null,
  imageUrl: "",
  videoUrl: "",
  scale: 1,
  minScale: 1,
  maxScale: 3,
  x: 0,
  y: 0,
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  imageNaturalWidth: 0,
  imageNaturalHeight: 0
};

function setProfileComposerMode(active) {
  document.body.classList.toggle("profile-composer-open", Boolean(active));
}

function openPostModal() {
  const modal = document.getElementById("postModal");
  if (modal) modal.style.display = "flex";
  setProfileComposerMode(true);
}

function closePostModal() {
  const modal = document.getElementById("postModal");
  if (modal) modal.style.display = "none";
  setProfileComposerMode(false);

  resetPostEditor();
}

function resetPostEditor() {
  const text = document.getElementById("postText");
  const mediaInput = document.getElementById("postMedia");
  const preview = document.getElementById("editorPreview");
  const image = document.getElementById("editorImage");
  const video = document.getElementById("editorVideo");
  const zoom = document.getElementById("zoomSlider");
  const progressWrap = document.getElementById("uploadProgress");
  const progressBar = document.getElementById("uploadBar");
  const mediaActions = document.getElementById("mediaActions");
  const mediaHint = document.getElementById("mediaHint");
  const modal = document.getElementById("postModal");

  if (text) text.value = "";
  if (mediaInput) mediaInput.value = "";

  if (preview) preview.classList.add("profile-hidden");
  if (image) {
    image.src = "";
    image.style.transform = "";
    image.style.left = "0px";
    image.style.top = "0px";
    image.classList.add("profile-hidden");
  }

  if (video) {
    video.src = "";
    video.load();
    video.classList.add("profile-hidden");
  }

  if (zoom) {
    zoom.value = 1;
    zoom.classList.add("profile-hidden");
  }

  if (progressWrap) progressWrap.classList.add("profile-hidden");
  if (progressBar) progressBar.style.width = "0%";
  if (mediaActions) mediaActions.classList.add("profile-hidden");
  if (mediaHint) mediaHint.classList.remove("profile-hidden");

  if (modal) {
    delete modal.dataset.editId;
  }

  postEditorState = {
    file: null,
    fileType: null,
    imageUrl: "",
    videoUrl: "",
    scale: 1,
    minScale: 1,
    maxScale: 3,
    x: 0,
    y: 0,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    imageNaturalWidth: 0,
    imageNaturalHeight: 0
  };
}

function selectMedia() {
  const input = document.getElementById("postMedia");
  if (input) input.click();
}

function removeMedia() {
  if (postEditorState.imageUrl) {
    URL.revokeObjectURL(postEditorState.imageUrl);
  }

  if (postEditorState.videoUrl) {
    URL.revokeObjectURL(postEditorState.videoUrl);
  }

  resetPostEditor();
}

function initImageEditor(file) {
  const image = document.getElementById("editorImage");
  const video = document.getElementById("editorVideo");
  const preview = document.getElementById("editorPreview");
  const zoom = document.getElementById("zoomSlider");
  const mediaActions = document.getElementById("mediaActions");
  const mediaHint = document.getElementById("mediaHint");

  if (!image || !video || !preview || !zoom) return;

  if (postEditorState.imageUrl) {
    URL.revokeObjectURL(postEditorState.imageUrl);
  }

  const objectUrl = URL.createObjectURL(file);

  postEditorState.file = file;
  postEditorState.fileType = "image";
  postEditorState.imageUrl = objectUrl;
  postEditorState.videoUrl = "";
  postEditorState.x = 0;
  postEditorState.y = 0;

  image.onload = function () {
    postEditorState.imageNaturalWidth = image.naturalWidth;
    postEditorState.imageNaturalHeight = image.naturalHeight;

    const container = document.getElementById("editorViewport");
    if (!container) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const coverScale = Math.max(
      containerWidth / image.naturalWidth,
      containerHeight / image.naturalHeight
    );

    postEditorState.minScale = coverScale;
    postEditorState.maxScale = coverScale * 3;
    postEditorState.scale = coverScale;

    zoom.min = postEditorState.minScale;
    zoom.max = postEditorState.maxScale;
    zoom.step = 0.01;
    zoom.value = postEditorState.scale;

    clampImagePosition();
    updateImageTransform();
  };

  image.src = objectUrl;
  image.classList.remove("profile-hidden");
  video.classList.add("profile-hidden");
  preview.classList.remove("profile-hidden");
  zoom.classList.remove("profile-hidden");

  if (mediaActions) mediaActions.classList.remove("profile-hidden");
  if (mediaHint) mediaHint.classList.add("profile-hidden");
}

function initVideoEditor(file) {
  const image = document.getElementById("editorImage");
  const video = document.getElementById("editorVideo");
  const preview = document.getElementById("editorPreview");
  const zoom = document.getElementById("zoomSlider");
  const mediaActions = document.getElementById("mediaActions");
  const mediaHint = document.getElementById("mediaHint");

  if (!image || !video || !preview || !zoom) return;

  if (postEditorState.videoUrl) {
    URL.revokeObjectURL(postEditorState.videoUrl);
  }

  const objectUrl = URL.createObjectURL(file);

  postEditorState.file = file;
  postEditorState.fileType = "video";
  postEditorState.videoUrl = objectUrl;
  postEditorState.imageUrl = "";

  video.src = objectUrl;
  video.classList.remove("profile-hidden");
  image.classList.add("profile-hidden");
  preview.classList.remove("profile-hidden");
  zoom.classList.add("profile-hidden");

  if (mediaActions) mediaActions.classList.remove("profile-hidden");
  if (mediaHint) mediaHint.classList.add("profile-hidden");
}

function handleSelectedFile(file) {
  if (!file) return;

  if (file.type.startsWith("image/")) {
    initImageEditor(file);
    return;
  }

  if (file.type.startsWith("video/")) {
    initVideoEditor(file);
    return;
  }

  alert("Поддерживаются только изображения и видео");
}

function updateImageTransform() {
  const image = document.getElementById("editorImage");
  if (!image) return;

  clampImagePosition();

  const width = postEditorState.imageNaturalWidth * postEditorState.scale;
  const height = postEditorState.imageNaturalHeight * postEditorState.scale;

  const container = document.getElementById("editorViewport");
  if (!container) return;

  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;

  const left = (containerWidth - width) / 2 + postEditorState.x;
  const top = (containerHeight - height) / 2 + postEditorState.y;

  image.style.width = `${width}px`;
  image.style.height = `${height}px`;
  image.style.left = `${left}px`;
  image.style.top = `${top}px`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampImagePosition() {
  if (!postEditorState.imageNaturalWidth || !postEditorState.imageNaturalHeight) return;

  const container = document.getElementById("editorViewport");
  if (!container) return;

  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;

  const scaledWidth = postEditorState.imageNaturalWidth * postEditorState.scale;
  const scaledHeight = postEditorState.imageNaturalHeight * postEditorState.scale;

  const maxOffsetX = Math.max(0, (scaledWidth - containerWidth) / 2);
  const maxOffsetY = Math.max(0, (scaledHeight - containerHeight) / 2);

  postEditorState.x = clamp(postEditorState.x, -maxOffsetX, maxOffsetX);
  postEditorState.y = clamp(postEditorState.y, -maxOffsetY, maxOffsetY);
}

function startImageDrag(clientX, clientY) {
  if (postEditorState.fileType !== "image") return;

  postEditorState.dragging = true;
  postEditorState.dragStartX = clientX;
  postEditorState.dragStartY = clientY;
}

function moveImageDrag(clientX, clientY) {
  if (!postEditorState.dragging) return;

  const dx = clientX - postEditorState.dragStartX;
  const dy = clientY - postEditorState.dragStartY;

  postEditorState.dragStartX = clientX;
  postEditorState.dragStartY = clientY;

  postEditorState.x += dx;
  postEditorState.y += dy;

  updateImageTransform();
}

function endImageDrag() {
  postEditorState.dragging = false;
}

async function createCroppedImageBlob() {
  const viewport = document.getElementById("editorViewport");

  const canvas = document.createElement("canvas");

  const outputWidth = 1280;
  const outputHeight = 720;

  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const ctx = canvas.getContext("2d");
  const image = document.getElementById("editorImage");

  const viewportWidth = viewport.clientWidth;
  const viewportHeight = viewport.clientHeight;

  const scaledWidth = postEditorState.imageNaturalWidth * postEditorState.scale;
  const scaledHeight = postEditorState.imageNaturalHeight * postEditorState.scale;

  const left = (viewportWidth - scaledWidth) / 2 + postEditorState.x;
  const top = (viewportHeight - scaledHeight) / 2 + postEditorState.y;

  const ratioX = outputWidth / viewportWidth;
  const ratioY = outputHeight / viewportHeight;

  ctx.drawImage(
    image,
    left * ratioX,
    top * ratioY,
    scaledWidth * ratioX,
    scaledHeight * ratioY
  );

  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.9);
  });
}

async function publishPost() {
  const text = document.getElementById("postText")?.value?.trim() || "";
  const progressWrap = document.getElementById("uploadProgress");
  const progressBar = document.getElementById("uploadBar");
  const publishBtn = document.getElementById("publishPostBtn");
  const modal = document.getElementById("postModal");
  const editId = modal?.dataset?.editId;

  if (!text && !postEditorState.file) {
    alert("Добавь текст или медиа");
    return;
  }

  const formData = new FormData();
  formData.append("content", text);

  if (editId && !postEditorState.file) {
    formData.append("keepMedia", "true");
  }

  if (postEditorState.file) {
    if (postEditorState.fileType === "image") {
      const croppedBlob = await createCroppedImageBlob();
      formData.append("media", croppedBlob, "post-image.jpg");
    } else if (postEditorState.fileType === "video") {
      formData.append("media", postEditorState.file);
    }
  }

  if (progressWrap) progressWrap.classList.remove("profile-hidden");
  if (progressBar) progressBar.style.width = "0%";
  if (publishBtn) publishBtn.disabled = true;

  const xhr = new XMLHttpRequest();

  xhr.upload.onprogress = function (e) {
    if (!e.lengthComputable || !progressBar) return;

    const percent = Math.round((e.loaded / e.total) * 100);
    progressBar.style.width = percent + "%";
  };

  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) return;

    if (publishBtn) publishBtn.disabled = false;

    if (xhr.status >= 200 && xhr.status < 300) {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {}

      if (data?.xp && typeof window.applyXPAndCheckRank === "function") {
        window.applyXPAndCheckRank(data.xp, data.newXP, data.xpState);
      } else if (data?.xp && typeof window.showXP === "function") {
        window.showXP(data.xp);
      }

      closePostModal();
      loadPosts();
      return;
    }

    alert("Ошибка публикации");
  };

  if (editId) {
    xhr.open("POST", "/update-post/" + editId);
  } else {
    xhr.open("POST", "/create-post");
  }

  xhr.setRequestHeader("Authorization", "Bearer " + localStorage.getItem("token"));
  xhr.send(formData);
}

function initPostEditor() {
  const mediaInput = document.getElementById("postMedia");
  const zoom = document.getElementById("zoomSlider");
  const viewport = document.getElementById("editorViewport");
  const dropzone = document.getElementById("editorDropzone");

  if (!mediaInput || !zoom || !viewport || !dropzone) return;
  if (dropzone.dataset.editorInitialized === "true") return;
  dropzone.dataset.editorInitialized = "true";

  mediaInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    handleSelectedFile(file);
  });

  zoom.addEventListener("input", () => {
    const oldScale = postEditorState.scale;
    const newScale = Number(zoom.value);

    const ratio = newScale / oldScale;

    postEditorState.x = postEditorState.x * ratio;
    postEditorState.y = postEditorState.y * ratio;
    postEditorState.scale = newScale;

    updateImageTransform();
  });

  viewport.addEventListener("mousedown", (e) => {
    startImageDrag(e.clientX, e.clientY);
  });

  window.addEventListener("mousemove", (e) => {
    moveImageDrag(e.clientX, e.clientY);
  });

  window.addEventListener("mouseup", () => {
    endImageDrag();
  });

  viewport.addEventListener("touchstart", (e) => {
    if (!e.touches[0]) return;
    startImageDrag(e.touches[0].clientX, e.touches[0].clientY);
  });

  window.addEventListener("touchmove", (e) => {
    if (!e.touches[0]) return;
    moveImageDrag(e.touches[0].clientX, e.touches[0].clientY);
  });

  window.addEventListener("touchend", () => {
    endImageDrag();
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");

    const file = e.dataTransfer.files[0];
    if (!file) return;

    handleSelectedFile(file);
  });

  window.addEventListener("resize", () => {
    if (postEditorState.fileType === "image") {
      updateImageTransform();
    }
  });

  const usernameTagInput = document.getElementById("editUsernameTag");
  const statusEl = document.getElementById("usernameTagStatus");

  let debounce;

  if (usernameTagInput && statusEl && !usernameTagInput.dataset.tagEditorInitialized) {
    usernameTagInput.dataset.tagEditorInitialized = "true";

    usernameTagInput.addEventListener("input", () => {
      let value = usernameTagInput.value;

      value = value.replace(/[^a-zA-Z0-9]/g, "");
      usernameTagInput.value = value;

      clearTimeout(debounce);

      if (value.length < 4) {
        statusEl.innerText = "Минимум 4 символа";
        statusEl.className = "profile-input-status error";
        return;
      }

      debounce = setTimeout(async () => {
        const res = await fetch(`/check-tag/${value}`);
        const data = await res.json();

        if (data.available) {
          statusEl.innerText = "Свободно ✅";
          statusEl.className = "profile-input-status ok";
        } else {
          statusEl.innerText = "Занято ❌";
          statusEl.className = "profile-input-status error";
        }
      }, 400);
    });
  }
}

function fillProfileEditor(user) {
  const usernameInput = document.getElementById("editUsernameTag");

  if (usernameInput) {
    usernameInput.value = user.username_tag || "";
  }
}

function openCreatePostModal() {
  const modal = document.getElementById("postModal");
  if (!modal) return;

  delete modal.dataset.editId;
  resetPostEditor();

  const title = document.querySelector(".profile-post-modal-title");
  if (title) {
    title.innerText = "Создать публикацию";
  }

  modal.style.display = "flex";
  setProfileComposerMode(true);
}

window.openPostModal = openPostModal;
window.closePostModal = closePostModal;
window.publishPost = publishPost;
window.selectMedia = selectMedia;
window.removeMedia = removeMedia;
window.openCreatePostModal = openCreatePostModal;
window.initPostEditor = initPostEditor;
window.fillProfileEditor = fillProfileEditor;
window.setProfileComposerMode = setProfileComposerMode;
