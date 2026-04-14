const coverInput = document.getElementById("coverInput");
const coverPreview = document.getElementById("coverPreview");
const coverPlaceholder = document.getElementById("coverPlaceholder");

const audioInput = document.getElementById("audio");
const fileName = document.getElementById("fileName");
const audioPlayer = document.getElementById("audioPlayer");
const preview = document.getElementById("preview");

const status = document.getElementById("status");

// 🎧 cover
coverInput.onchange = () => {
  const file = coverInput.files[0];
  if (!file) return;

  coverPreview.src = URL.createObjectURL(file);
  coverPreview.style.display = "block";
  coverPlaceholder.style.display = "none";
};

// 🎵 audio
audioInput.onchange = () => {
  const file = audioInput.files[0];
  if (!file) return;

  fileName.textContent = file.name;

  audioPlayer.src = URL.createObjectURL(file);
  preview.style.display = "block";
};

// 🚀 submit
document.getElementById("uploadForm").onsubmit = (e) => {
  e.preventDefault();

  status.textContent = "Трек загружен (localStorage)";
};

const tagsContainer = document.getElementById("tagsContainer");
const tagsInput = document.getElementById("tagsInput");

let tags = [];

tagsInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();

    const value = tagsInput.value.trim().toLowerCase();
    if (!value || tags.includes(value)) return;

    tags.push(value);
    addTag(value);

    tagsInput.value = "";
  }
});

function addTag(text) {
  const tag = document.createElement("div");
  tag.className = "tag";

  const span = document.createElement("span");
  span.textContent = text;

  const remove = document.createElement("span");
  remove.textContent = "×";
  remove.className = "tag-remove";

  remove.onclick = () => {
    tag.remove();
    tags = tags.filter(t => t !== text);
  };

  tag.appendChild(span);
  tag.appendChild(remove);

  tagsContainer.insertBefore(tag, tagsInput);
}