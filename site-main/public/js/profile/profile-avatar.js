let cropState = {
  file: null,
  image: null,
  scale: 1,
  minScale: 1,
  maxScale: 4,
  x: 0,
  y: 0,
  dragging: false,
  startX: 0,
  startY: 0
};

function updateCropZoomVisual() {
  const zoomRange = document.getElementById("zoomRange");
  if (!zoomRange) return;

  const min = Number(zoomRange.min || 0);
  const max = Number(zoomRange.max || 100);
  const value = Number(zoomRange.value || min);
  const progress = max > min ? ((value - min) / (max - min)) * 100 : 0;

  zoomRange.style.setProperty("--zoom-progress", `${Math.max(0, Math.min(100, progress))}%`);
}

function getProfileToken() {
  return localStorage.getItem("token") || "";
}

function resetCropState() {
  cropState = {
    file: null,
    image: null,
    scale: 1,
    minScale: 1,
    maxScale: 4,
    x: 0,
    y: 0,
    dragging: false,
    startX: 0,
    startY: 0
  };
}

function openCropModal() {
  const cropModal = document.getElementById("cropModal");
  if (cropModal) cropModal.style.display = "flex";
  if (typeof window.setProfileComposerMode === "function") {
    window.setProfileComposerMode(true);
  } else {
    document.body.classList.add("profile-composer-open");
  }
}

function closeCropModal() {
  const cropModal = document.getElementById("cropModal");
  const avatarInput = document.getElementById("avatarInput");
  const cropImage = document.getElementById("cropImage");

  if (cropModal) cropModal.style.display = "none";
  if (typeof window.setProfileComposerMode === "function") {
    window.setProfileComposerMode(false);
  } else {
    document.body.classList.remove("profile-composer-open");
  }
  if (avatarInput) avatarInput.value = "";
  if (cropImage) {
    cropImage.src = "";
    cropImage.style.width = "";
    cropImage.style.height = "";
    cropImage.style.left = "";
    cropImage.style.top = "";
  }

  resetCropState();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampCropPosition() {
  if (!cropState.image) return;

  const circleSize = 280;

  const scaledWidth = cropState.image.width * cropState.scale;
  const scaledHeight = cropState.image.height * cropState.scale;

  const maxOffsetX = Math.max(0, (scaledWidth - circleSize) / 2);
  const maxOffsetY = Math.max(0, (scaledHeight - circleSize) / 2);

  cropState.x = clamp(cropState.x, -maxOffsetX, maxOffsetX);
  cropState.y = clamp(cropState.y, -maxOffsetY, maxOffsetY);
}

function updateCropImageTransform() {
  const cropImage = document.getElementById("cropImage");
  if (!cropImage || !cropState.image) return;

  const circleSize = 280;

  clampCropPosition();

  const scaledWidth = cropState.image.width * cropState.scale;
  const scaledHeight = cropState.image.height * cropState.scale;

  const left = (circleSize - scaledWidth) / 2 + cropState.x;
  const top = (circleSize - scaledHeight) / 2 + cropState.y;

  cropImage.style.width = `${scaledWidth}px`;
  cropImage.style.height = `${scaledHeight}px`;
  cropImage.style.left = `${left}px`;
  cropImage.style.top = `${top}px`;
}

function initCropImage(src, file) {
  const cropImage = document.getElementById("cropImage");
  const zoomRange = document.getElementById("zoomRange");
  if (!cropImage || !zoomRange) return;

  const circleSize = 280;

  cropState.file = file;
  cropState.image = new Image();

  cropState.image.onload = function () {
    const coverScale = Math.max(
      circleSize / cropState.image.width,
      circleSize / cropState.image.height
    );

    cropState.minScale = coverScale;
    cropState.maxScale = coverScale * 4;
    cropState.scale = coverScale;
    cropState.x = 0;
    cropState.y = 0;

    cropImage.src = src;

    zoomRange.min = String(cropState.minScale);
    zoomRange.max = String(cropState.maxScale);
    zoomRange.value = String(cropState.scale);
    updateCropZoomVisual();

    updateCropImageTransform();
    openCropModal();
  };

  cropState.image.src = src;
}

function startCropDrag(x, y) {
  cropState.dragging = true;
  cropState.startX = x - cropState.x;
  cropState.startY = y - cropState.y;
}

function moveCropDrag(x, y) {
  if (!cropState.dragging) return;

  cropState.x = x - cropState.startX;
  cropState.y = y - cropState.startY;

  updateCropImageTransform();
}

function endCropDrag() {
  cropState.dragging = false;
}

async function applyCrop() {
  if (!cropState.file || !cropState.image) {
    alert("Выберите изображение");
    return;
  }

  const token = getProfileToken();
  if (!token) {
    alert("Нужно войти в аккаунт");
    return;
  }

  const circleSize = 280;
  const outputSize = 400;
  const ratio = outputSize / circleSize;

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    alert("Не удалось обработать изображение");
    return;
  }

  ctx.beginPath();
  ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
  ctx.clip();

  const scaledWidth = cropState.image.width * cropState.scale;
  const scaledHeight = cropState.image.height * cropState.scale;

  const left = (circleSize - scaledWidth) / 2 + cropState.x;
  const top = (circleSize - scaledHeight) / 2 + cropState.y;

  ctx.drawImage(
    cropState.image,
    left * ratio,
    top * ratio,
    scaledWidth * ratio,
    scaledHeight * ratio
  );

  canvas.toBlob(
    async (blob) => {
      if (!blob) {
        alert("Не удалось создать изображение");
        return;
      }

      try {
        const formData = new FormData();
        formData.append("avatar", blob, "avatar.png");

        const res = await fetch("/upload-avatar", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token
          },
          body: formData
        });

        if (!res.ok) {
          throw new Error("Avatar upload failed");
        }

        const data = await res.json();

        const avatar = document.getElementById("avatar");
        const editAvatar = document.getElementById("editAvatar");

        if (avatar && data.avatar) {
          avatar.src = data.avatar + "?t=" + Date.now();
        }

        if (editAvatar && data.avatar) {
          editAvatar.value = data.avatar;
        }

        closeCropModal();
      } catch (error) {
        console.error("applyCrop error:", error);
        alert("Не удалось загрузить аватар");
      }
    },
    "image/png",
    0.95
  );
}

async function removeAvatar() {
  const token = getProfileToken();
  if (!token) {
    alert("Нужно войти в аккаунт");
    return;
  }

  const defaultAvatar = "/images/default-avatar.jpg";

  try {
    const res = await fetch("/update-profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ avatar: defaultAvatar })
    });

    if (!res.ok) {
      throw new Error("Remove avatar failed");
    }

    const avatar = document.getElementById("avatar");
    const editAvatar = document.getElementById("editAvatar");

    if (avatar) {
      avatar.src = defaultAvatar + "?t=" + Date.now();
    }

    if (editAvatar) {
      editAvatar.value = defaultAvatar;
    }

    closeCropModal();
  } catch (error) {
    console.error("removeAvatar error:", error);
    alert("Не удалось удалить аватар");
  }
}

async function initAvatarCrop() {
  const avatarInput = document.getElementById("avatarInput");
  if (!avatarInput || avatarInput.dataset.bound === "true") return;

  avatarInput.dataset.bound = "true";

  avatarInput.addEventListener("change", async (e) => {
    if (typeof isMyProfileAsync === "function") {
      const isMine = await isMyProfileAsync();
      if (!isMine) {
        alert("Это не твой профиль 😈");
        e.target.value = "";
        return;
      }
    }

    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (ev) => {
      initCropImage(ev.target.result, file);
    };

    reader.readAsDataURL(file);
  });
}

function initCropControls() {
  const cropCircle = document.getElementById("cropCircle");
  const zoomRange = document.getElementById("zoomRange");

  if (!cropCircle || !zoomRange) return;
  if (cropCircle.dataset.cropBound !== "true") {
    cropCircle.dataset.cropBound = "true";

    cropCircle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      startCropDrag(e.clientX, e.clientY);
    });
  }

  if (!window.__avatarCropPointerMoveBound) {
    window.__avatarCropPointerMoveBound = true;
    window.addEventListener("pointermove", (e) => {
      moveCropDrag(e.clientX, e.clientY);
    });
  }

  if (!window.__avatarCropPointerUpBound) {
    window.__avatarCropPointerUpBound = true;
    window.addEventListener("pointerup", () => {
      endCropDrag();
    });
    window.addEventListener("pointercancel", () => {
      endCropDrag();
    });
  }

  const handleZoomChange = () => {
    const oldScale = cropState.scale || 1;
    const newScale = Number(zoomRange.value);

    if (!Number.isFinite(newScale) || newScale <= 0) return;

    const ratio = newScale / oldScale;

    cropState.x *= ratio;
    cropState.y *= ratio;
    cropState.scale = newScale;

    updateCropZoomVisual();
    updateCropImageTransform();
  };

  if (zoomRange.dataset.zoomBound !== "true") {
    zoomRange.dataset.zoomBound = "true";
    zoomRange.addEventListener("input", handleZoomChange);
    zoomRange.addEventListener("change", handleZoomChange);
  }

  updateCropZoomVisual();
}

window.openCropModal = openCropModal;
window.closeCropModal = closeCropModal;
window.applyCrop = applyCrop;
window.removeAvatar = removeAvatar;
window.initAvatarCrop = initAvatarCrop;
window.initCropControls = initCropControls;
