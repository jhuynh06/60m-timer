const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

const COPY_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const CHECK_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

const statusEl = document.getElementById("status");
const timerEl = document.getElementById("timer");
const ringFg = document.getElementById("ring-fg");
const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const plusBtn = document.getElementById("plusBtn");
const minusBtn = document.getElementById("minusBtn");
const hostBtn = document.getElementById("hostBtn");
const joinToggleBtn = document.getElementById("joinToggleBtn");
const joinSection = document.getElementById("join-section");
const codeInput = document.getElementById("codeInput");
const joinBtn = document.getElementById("joinBtn");
const lobbyDiv = document.getElementById("lobby");
const roomInfoDiv = document.getElementById("room-info");
const roomCodeSpan = document.getElementById("room-code");
const leaveBtn = document.getElementById("leaveBtn");
const copyBtn = document.getElementById("copyBtn");
const roleBadge = document.getElementById("role-badge");

let totalSeconds = 0;
let remainingSeconds = 0;
let interval = null;
let running = false;
let role = null;
let roomCode = null;
let hostId = null;

function formatTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function updateRing() {
  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 1;
  const offset = RING_C * (1 - progress);
  ringFg.setAttribute("stroke-dashoffset", offset);
  if (remainingSeconds === 0 && totalSeconds > 0) {
    ringFg.setAttribute("stroke", "hsl(0 84% 60%)");
  } else if (remainingSeconds < totalSeconds * 0.15) {
    ringFg.setAttribute("stroke", "hsl(25 95% 53%)");
  } else {
    ringFg.setAttribute("stroke", "hsl(217 91% 60%)");
  }
}

function render() {
  timerEl.textContent = formatTime(remainingSeconds);
  document.body.classList.toggle("done", remainingSeconds === 0 && totalSeconds > 0 && !running);
  startBtn.textContent = running ? "Pause" : "Start";
  updateRing();

  if (role === "guest") {
    startBtn.disabled = true;
    resetBtn.disabled = true;
    plusBtn.disabled = true;
    minusBtn.disabled = true;
  } else {
    startBtn.disabled = !totalSeconds;
    resetBtn.disabled = false;
    plusBtn.disabled = false;
    minusBtn.disabled = false;
  }

  if (role) {
    lobbyDiv.style.display = "none";
    joinSection.style.display = "none";
    roomInfoDiv.style.display = "flex";
    roomCodeSpan.textContent = roomCode;
    roleBadge.textContent = role === "host" ? "HOST" : "GUEST";
    roleBadge.className = role;
  } else {
    lobbyDiv.style.display = "flex";
    roomInfoDiv.style.display = "none";
    roleBadge.textContent = "";
    roleBadge.className = "";
  }
}

function tick() {
  if (remainingSeconds <= 0) {
    clearInterval(interval);
    interval = null;
    running = false;
    chrome.storage.local.set({ timerRemaining: 0, timerRunning: false });
    if (role === "host") syncState(roomCode, { remaining: 0, running: false });
    render();
    return;
  }
  remainingSeconds--;
  chrome.storage.local.set({ timerRemaining: remainingSeconds, timerRunning: running });
  if (role === "host") syncState(roomCode, { remaining: remainingSeconds, running: true });
  render();
}

// --- Timer controls ---
startBtn.addEventListener("click", () => {
  if (role === "guest") return;
  if (running) {
    clearInterval(interval);
    interval = null;
    running = false;
    chrome.storage.local.set({ timerRemaining: remainingSeconds, timerRunning: false });
    if (role === "host") syncState(roomCode, { remaining: remainingSeconds, running: false });
  } else {
    if (remainingSeconds <= 0) remainingSeconds = totalSeconds;
    running = true;
    interval = setInterval(tick, 1000);
    chrome.storage.local.set({ timerRemaining: remainingSeconds, timerRunning: true });
    if (role === "host") syncState(roomCode, { remaining: remainingSeconds, running: true });
  }
  render();
});

resetBtn.addEventListener("click", () => {
  if (role === "guest") return;
  clearInterval(interval);
  interval = null;
  running = false;
  remainingSeconds = totalSeconds;
  chrome.storage.local.set({ timerRemaining: remainingSeconds, timerRunning: false });
  if (role === "host") syncState(roomCode, { remaining: remainingSeconds, running: false });
  render();
});

// --- +/- time adjust ---
const adjustLabel = document.getElementById("adjust-label");
const STEPS = [1, 5, 10, 15, 30];
let stepIndex = 0;
let adjustTimeout = null;

function getStepSeconds() { return STEPS[stepIndex] * 60; }
function getStepLabel() { return `${STEPS[stepIndex]}m`; }
function updateAdjustLabel() { adjustLabel.textContent = getStepLabel(); }
updateAdjustLabel();

adjustLabel.addEventListener("click", () => {
  stepIndex = (stepIndex + 1) % STEPS.length;
  updateAdjustLabel();
});

function flashAdjust(text) {
  adjustLabel.textContent = text;
  clearTimeout(adjustTimeout);
  adjustTimeout = setTimeout(updateAdjustLabel, 1200);
}

plusBtn.addEventListener("click", () => {
  if (role === "guest") return;
  const step = getStepSeconds();
  remainingSeconds += step;
  totalSeconds += step;
  chrome.storage.local.set({ timerRemaining: remainingSeconds });
  if (role === "host") syncState(roomCode, { remaining: remainingSeconds });
  flashAdjust(`+${STEPS[stepIndex]}:00`);
  render();
});

minusBtn.addEventListener("click", () => {
  if (role === "guest") return;
  const step = getStepSeconds();
  if (remainingSeconds > step) {
    remainingSeconds -= step;
    if (totalSeconds > step) totalSeconds -= step;
    flashAdjust(`-${STEPS[stepIndex]}:00`);
  } else {
    remainingSeconds = 0;
    flashAdjust("0:00");
  }
  chrome.storage.local.set({ timerRemaining: remainingSeconds });
  if (role === "host") syncState(roomCode, { remaining: remainingSeconds });
  render();
});

// --- Host ---
hostBtn.addEventListener("click", async () => {
  if (!totalSeconds) return;
  try {
    hostBtn.textContent = "...";
    const result = await createRoom(totalSeconds / 60);
    roomCode = result.roomCode;
    hostId = result.hostId;
    role = "host";
    chrome.storage.local.set({ lobbyRole: "host", lobbyRoomCode: roomCode, lobbyHostId: hostId });
    syncState(roomCode, { remaining: remainingSeconds, running });
    render();
  } catch (e) {
    hostBtn.textContent = "Host";
    console.error("Failed to host:", e);
  }
});

// --- Join ---
joinToggleBtn.addEventListener("click", () => {
  const visible = joinSection.style.display === "flex";
  joinSection.style.display = visible ? "none" : "flex";
  if (!visible) codeInput.focus();
});

joinBtn.addEventListener("click", async () => {
  const code = codeInput.value.trim().toUpperCase();
  if (code.length !== 6) return;
  try {
    joinBtn.textContent = "...";
    const roomData = await getRoom(code);
    roomCode = code;
    role = "guest";
    remainingSeconds = roomData.remaining;
    running = roomData.running;
    totalSeconds = roomData.activity_minutes * 60;
    chrome.storage.local.set({ lobbyRole: "guest", lobbyRoomCode: roomCode });

    clearInterval(interval);
    interval = null;

    interval = setInterval(async () => {
      if (role !== "guest") return;
      try {
        const data = await getRoom(roomCode);
        remainingSeconds = data.remaining;
        running = data.running;
        render();
      } catch (e) { /* ignore */ }
    }, 1500);

    statusEl.textContent = `Activity Time: ${roomData.activity_minutes} min`;
    render();
  } catch (e) {
    joinBtn.textContent = "Go";
    console.error("Failed to join:", e);
  }
});

codeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinBtn.click();
});

// --- Room code copy ---
copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(roomCode);
  copyBtn.classList.add("copied");
  copyBtn.innerHTML = CHECK_ICON;
  setTimeout(() => {
    copyBtn.classList.remove("copied");
    copyBtn.innerHTML = COPY_ICON;
  }, 1500);
});

// --- Leave ---
leaveBtn.addEventListener("click", async () => {
  if (role === "host") {
    try { await deleteRoom(roomCode); } catch (e) { /* ignore */ }
  }
  clearInterval(interval);
  interval = null;
  role = null;
  roomCode = null;
  hostId = null;
  running = false;
  chrome.storage.local.remove(["lobbyRole", "lobbyRoomCode", "lobbyHostId"]);
  joinSection.style.display = "none";
  hostBtn.textContent = "Host";
  joinBtn.textContent = "Go";
  render();
});

// --- Load initial state ---
chrome.storage.local.get(["activityMinutes", "timerRemaining", "timerRunning", "lobbyRole", "lobbyRoomCode", "lobbyHostId"], (data) => {
  if (data.activityMinutes) {
    totalSeconds = data.activityMinutes * 60;
    statusEl.textContent = `Activity Time: ${data.activityMinutes} min`;
    startBtn.disabled = false;

    if (data.timerRemaining != null) {
      remainingSeconds = data.timerRemaining;
    } else {
      remainingSeconds = totalSeconds;
    }

    if (data.lobbyRole && data.lobbyRoomCode) {
      role = data.lobbyRole;
      roomCode = data.lobbyRoomCode;
      hostId = data.lobbyHostId || null;

      if (role === "guest") {
        interval = setInterval(async () => {
          if (role !== "guest") return;
          try {
            const roomData = await getRoom(roomCode);
            remainingSeconds = roomData.remaining;
            running = roomData.running;
            render();
          } catch (e) { /* ignore */ }
        }, 1500);
      } else if (data.timerRunning) {
        running = true;
        interval = setInterval(tick, 1000);
      }
    } else if (data.timerRunning) {
      running = true;
      interval = setInterval(tick, 1000);
    }

    render();
  } else {
    statusEl.textContent = "No activity time found on this page.";
    timerEl.textContent = "--:--:--";
  }
});
