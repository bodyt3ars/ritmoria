let queueList = null;
let queueCurrentUser = null;
let queueReloadInterval = null;
let queueStateInterval = null;

async function loadQueueCurrentUser() {
  const token = localStorage.getItem("token");
  if (!token) {
    queueCurrentUser = null;
    return null;
  }

  try {
    const res = await fetch("/me", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) {
      queueCurrentUser = null;
      return null;
    }

    const user = await res.json();
    queueCurrentUser = user;
    return user;
  } catch (err) {
    console.error("loadQueueCurrentUser error:", err);
    queueCurrentUser = null;
    return null;
  }
}

function isQueueAdmin() {
  return queueCurrentUser?.role === "admin";
}

function canQueueRate() {
  return Boolean(queueCurrentUser);
}

async function loadQueue() {
  if (!queueList) {
    queueList = document.getElementById("queueList");
  }

  if (!queueList) return;

  try {
    const res = await fetch("/api/tracks/queue");
    const data = await res.json();

    const state = data.state;
    const tracks = Array.isArray(data.tracks) ? data.tracks : [];

    queueList.innerHTML = "";

    tracks.forEach((track, index) => {
      let placeClass = "";

      if (state === "closed") {
        if (index === 0) placeClass = "queue-top1";
        if (index === 1) placeClass = "queue-top2";
        if (index === 2) placeClass = "queue-top3";
      }

      const trackCard = document.createElement("div");
      trackCard.className = `queue-track-card ${placeClass}`;

      trackCard.addEventListener("click", (e) => {
        if (e.target.closest(".queue-judge-btn") || e.target.closest(".queue-delete-btn")) {
          return;
        }
        navigate(`/track/${track.id}`);
      });

      trackCard.innerHTML = `
        <div class="queue-track-main">

          ${
            state === "closed" && index < 3
              ? `<div class="queue-winner-badge-left">#${index + 1}</div>`
              : ""
          }

          <div class="queue-track-left">

            <div class="queue-track-number ${placeClass}">
              ${index + 1}
            </div>

            <div class="queue-cover-wrap">
              <img src="${track.cover || "/images/default-cover.jpg"}" class="queue-track-cover" alt="">
            </div>

            ${
              state === "closed" && index === 0
                ? `<div class="queue-crown">👑</div>`
                : ""
            }

            <div class="queue-track-info">
              <div class="queue-track-artist">${track.artist || "Unknown"}</div>
              <div class="queue-track-title">${track.title || "Без названия"}</div>

              ${
                state === "closed"
                  ? `<div class="queue-track-score">🔥 ${Number(track.total_score || 0).toFixed(1)}</div>`
                  : ""
              }
            </div>

          </div>

          ${
            canQueueRate()
              ? `
                <div class="queue-track-right">
                  <button class="queue-judge-btn">
                    <i class="fa-solid fa-play"></i>
                    Оценить
                  </button>

                  ${
                    isQueueAdmin()
                      ? `
                        <button class="queue-delete-btn">
                          <i class="fa-solid fa-trash"></i>
                        </button>
                      `
                      : ""
                  }
                </div>
              `
              : ""
          }

        </div>
      `;

      if (canQueueRate()) {
        const judgeBtn = trackCard.querySelector(".queue-judge-btn");

        if (judgeBtn) {
          judgeBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            startJudge(track.id);
          });
        }
      }

      if (isQueueAdmin()) {
        const deleteBtn = trackCard.querySelector(".queue-delete-btn");

        if (deleteBtn) {
          deleteBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const confirmed = confirm("Удалить трек?");
            if (!confirmed) return;

            try {
              const token = localStorage.getItem("token");

              const res = await fetch(`/api/tracks/${track.id}`, {
                method: "DELETE",
                headers: {
                  Authorization: "Bearer " + token
                }
              });

              if (!res.ok) {
                throw new Error("Ошибка удаления");
              }

              trackCard.remove();
            } catch (err) {
              console.error(err);
              alert("Ошибка при удалении");
            }
          });
        }
      }

      queueList.appendChild(trackCard);
    });
  } catch (err) {
    console.error("Ошибка загрузки очереди", err);
  }
}

function startJudge(trackId) {
  if (!canQueueRate()) return;
  navigate(`/judge?track=${trackId}`);
}

async function initAdminControls() {
  const controls = document.getElementById("adminControls");
  if (!controls) return;

  controls.classList.add("queue-hidden");

  if (!isQueueAdmin()) return;

  controls.classList.remove("queue-hidden");

  const token = localStorage.getItem("token");
  const openBtn = document.getElementById("openQueue");
  const pauseBtn = document.getElementById("pauseQueue");
  const resumeBtn = document.getElementById("resumeQueue");
  const closeBtn = document.getElementById("closeQueue");

  async function setState(state) {
    await fetch("/api/queue/state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ state })
    });

    loadQueue();
    loadQueueState();
  }

  if (openBtn) openBtn.onclick = () => setState("open");
  if (pauseBtn) pauseBtn.onclick = () => setState("paused");
  if (resumeBtn) resumeBtn.onclick = () => setState("open");
  if (closeBtn) closeBtn.onclick = () => setState("closed");
}

async function loadQueueState() {
  try {
    const res = await fetch("/api/queue/state");
    const data = await res.json();

    const el = document.getElementById("queueStatusText");
    if (!el) return;

    el.className = "queue-status";

    if (data.state === "open") {
      el.textContent = "Открыта";
      el.classList.add("queue-status-open");
    }

    if (data.state === "closed") {
      el.textContent = "Закрыта";
      el.classList.add("queue-status-closed");
    }

    if (data.state === "paused") {
      el.textContent = "Приостановлена";
      el.classList.add("queue-status-paused");
    }
  } catch (err) {
    console.error(err);
  }
}

window.initQueuePage = async function () {
  queueList = document.getElementById("queueList");

  await loadQueueCurrentUser();
  await initAdminControls();
  await loadQueue();
  await loadQueueState();

  if (queueReloadInterval) clearInterval(queueReloadInterval);
  if (queueStateInterval) clearInterval(queueStateInterval);

  queueReloadInterval = setInterval(loadQueue, 5000);
  queueStateInterval = setInterval(loadQueueState, 3000);
};
