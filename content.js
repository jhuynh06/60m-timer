// Scan the page for "Activity Time: x minutes" and store it
function findActivityTime() {
  const body = document.body.innerText;
  const match = body.match(/Activity Time:\s*(\d+)\s*minutes?/i);
  if (match) {
    const minutes = parseInt(match[1], 10);
    chrome.storage.local.set({ activityMinutes: minutes, foundOnUrl: location.href });
    if (!document.getElementById("act-timer-widget")) {
      injectTimer(minutes);
    }
  } else {
    chrome.storage.local.set({ activityMinutes: null, foundOnUrl: location.href });
  }
}

function formatTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function injectTimer(minutes) {
  const widget = document.createElement("div");
  widget.id = "act-timer-widget";
  widget.innerHTML = `
    <div id="act-timer-role"></div>
    <div id="act-timer-display">${formatTime(minutes * 60)}</div>
    <div id="act-timer-buttons">
      <button id="act-timer-start">Start</button>
      <button id="act-timer-reset">Reset</button>
    </div>
    <div id="act-timer-lobby">
      <button id="act-timer-host">Host</button>
      <button id="act-timer-join-toggle">Join</button>
    </div>
    <div id="act-timer-join-input" style="display:none;">
      <input id="act-timer-code-input" type="text" placeholder="Room code" maxlength="6" />
      <button id="act-timer-join-btn">Go</button>
    </div>
    <div id="act-timer-room-info" style="display:none;">
      <span id="act-timer-room-code"></span>
      <button id="act-timer-leave">Leave</button>
    </div>
  `;
  document.body.appendChild(widget);

  const style = document.createElement("style");
  style.textContent = `
    #act-timer-widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #1a1a2e;
      color: #fff;
      padding: 12px 16px;
      border-radius: 10px;
      font-family: system-ui, sans-serif;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      cursor: move;
      user-select: none;
      min-width: 180px;
    }
    #act-timer-role {
      text-align: center;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 4px;
      min-height: 16px;
    }
    #act-timer-role.host { color: #4fc3f7; }
    #act-timer-role.guest { color: #aed581; }
    #act-timer-display {
      font-size: 28px;
      font-weight: bold;
      font-variant-numeric: tabular-nums;
      text-align: center;
      margin-bottom: 8px;
    }
    #act-timer-display.done { color: #ff4444; }
    #act-timer-buttons, #act-timer-lobby {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-bottom: 6px;
    }
    #act-timer-widget button {
      padding: 4px 14px;
      font-size: 13px;
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: 5px;
      background: transparent;
      color: #fff;
      cursor: pointer;
    }
    #act-timer-widget button:hover { background: rgba(255,255,255,0.1); }
    #act-timer-widget button:disabled {
      opacity: 0.35;
      cursor: default;
    }
    #act-timer-widget button:disabled:hover { background: transparent; }
    #act-timer-join-input {
      display: flex;
      gap: 6px;
      justify-content: center;
      margin-bottom: 6px;
    }
    #act-timer-code-input {
      width: 80px;
      padding: 4px 8px;
      font-size: 13px;
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: 5px;
      background: rgba(255,255,255,0.1);
      color: #fff;
      text-transform: uppercase;
      text-align: center;
      letter-spacing: 2px;
    }
    #act-timer-code-input::placeholder { color: rgba(255,255,255,0.4); }
    #act-timer-room-info {
      display: flex;
      gap: 8px;
      justify-content: center;
      align-items: center;
      margin-top: 4px;
    }
    #act-timer-room-code {
      font-size: 14px;
      font-weight: bold;
      letter-spacing: 2px;
      color: #ffd54f;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);

  // State
  const totalSeconds = minutes * 60;
  let remaining = totalSeconds;
  let interval = null;
  let running = false;
  let role = null; // null, "host", "guest"
  let roomCode = null;
  let hostId = null;
  let listener = null;

  // DOM refs
  const display = document.getElementById("act-timer-display");
  const startBtn = document.getElementById("act-timer-start");
  const resetBtn = document.getElementById("act-timer-reset");
  const hostBtn = document.getElementById("act-timer-host");
  const joinToggleBtn = document.getElementById("act-timer-join-toggle");
  const joinInputDiv = document.getElementById("act-timer-join-input");
  const codeInput = document.getElementById("act-timer-code-input");
  const joinBtn = document.getElementById("act-timer-join-btn");
  const roomInfoDiv = document.getElementById("act-timer-room-info");
  const roomCodeSpan = document.getElementById("act-timer-room-code");
  const leaveBtn = document.getElementById("act-timer-leave");
  const lobbyDiv = document.getElementById("act-timer-lobby");
  const roleDiv = document.getElementById("act-timer-role");

  // Restore local timer state
  chrome.storage.local.get(["timerRemaining", "timerRunning"], (data) => {
    if (data.timerRemaining != null) remaining = data.timerRemaining;
    if (data.timerRunning) startLocalTimer();
    display.textContent = formatTime(remaining);
    display.classList.toggle("done", remaining === 0);
  });

  function updateUI() {
    display.textContent = formatTime(remaining);
    display.classList.toggle("done", remaining === 0 && !running);
    startBtn.textContent = running ? "Pause" : "Start";

    if (role === "guest") {
      startBtn.disabled = true;
      resetBtn.disabled = true;
    } else {
      startBtn.disabled = false;
      resetBtn.disabled = false;
    }

    if (role) {
      lobbyDiv.style.display = "none";
      joinInputDiv.style.display = "none";
      roomInfoDiv.style.display = "flex";
      roomCodeSpan.textContent = roomCode;
      roleDiv.textContent = role === "host" ? "Host" : "Guest";
      roleDiv.className = role;
    } else {
      lobbyDiv.style.display = "flex";
      roomInfoDiv.style.display = "none";
      roleDiv.textContent = "";
      roleDiv.className = "";
    }
  }

  // --- Local timer ---
  function tick() {
    if (remaining <= 0) {
      clearInterval(interval);
      interval = null;
      running = false;
      chrome.storage.local.set({ timerRemaining: 0, timerRunning: false });
      if (role === "host") syncState(roomCode, { remaining: 0, running: false });
      updateUI();
      return;
    }
    remaining--;
    chrome.storage.local.set({ timerRemaining: remaining, timerRunning: true });
    if (role === "host") syncState(roomCode, { remaining, running: true });
    updateUI();
  }

  function startLocalTimer() {
    if (remaining <= 0) remaining = totalSeconds;
    running = true;
    interval = setInterval(tick, 1000);
    updateUI();
  }

  function stopLocalTimer() {
    clearInterval(interval);
    interval = null;
    running = false;
    updateUI();
  }

  // --- Controls ---
  startBtn.addEventListener("click", () => {
    if (role === "guest") return;
    if (running) {
      stopLocalTimer();
      chrome.storage.local.set({ timerRemaining: remaining, timerRunning: false });
      if (role === "host") syncState(roomCode, { remaining, running: false });
    } else {
      startLocalTimer();
      chrome.storage.local.set({ timerRemaining: remaining, timerRunning: true });
      if (role === "host") syncState(roomCode, { remaining, running: true });
    }
  });

  resetBtn.addEventListener("click", () => {
    if (role === "guest") return;
    stopLocalTimer();
    remaining = totalSeconds;
    chrome.storage.local.set({ timerRemaining: remaining, timerRunning: false });
    if (role === "host") syncState(roomCode, { remaining, running: false });
    updateUI();
  });

  // --- Host ---
  hostBtn.addEventListener("click", async () => {
    try {
      hostBtn.textContent = "...";
      const result = await createRoom(minutes);
      roomCode = result.roomCode;
      hostId = result.hostId;
      role = "host";
      chrome.storage.local.set({ lobbyRole: "host", lobbyRoomCode: roomCode, lobbyHostId: hostId });
      // Push current state
      syncState(roomCode, { remaining, running });
      updateUI();
    } catch (e) {
      hostBtn.textContent = "Host";
      console.error("Failed to host:", e);
    }
  });

  // --- Join ---
  joinToggleBtn.addEventListener("click", () => {
    const visible = joinInputDiv.style.display !== "none";
    joinInputDiv.style.display = visible ? "none" : "flex";
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
      remaining = roomData.remaining;
      running = roomData.running;
      chrome.storage.local.set({ lobbyRole: "guest", lobbyRoomCode: roomCode });

      // Stop local timer, let remote drive
      clearInterval(interval);
      interval = null;

      // Listen for updates
      listener = listenToRoom(roomCode, (data) => {
        remaining = data.remaining;
        running = data.running;
        updateUI();
      });

      // Start polling-based render for guest (in case realtime is slow)
      setInterval(async () => {
        if (role !== "guest") return;
        try {
          const data = await getRoom(roomCode);
          remaining = data.remaining;
          running = data.running;
          updateUI();
        } catch (e) { /* ignore */ }
      }, 2000);

      updateUI();
    } catch (e) {
      joinBtn.textContent = "Go";
      console.error("Failed to join:", e);
    }
  });

  codeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") joinBtn.click();
  });

  // --- Room code copy on click ---
  roomCodeSpan.addEventListener("click", (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(roomCode);
    roomCodeSpan.textContent = "Copied!";
    setTimeout(() => { roomCodeSpan.textContent = roomCode; }, 1000);
  });

  // --- Leave ---
  leaveBtn.addEventListener("click", async () => {
    if (role === "host") {
      try { await deleteRoom(roomCode); } catch (e) { /* ignore */ }
    }
    if (listener) { listener.close(); listener = null; }
    role = null;
    roomCode = null;
    hostId = null;
    chrome.storage.local.remove(["lobbyRole", "lobbyRoomCode", "lobbyHostId"]);
    joinInputDiv.style.display = "none";
    updateUI();
  });

  // --- Draggable ---
  let dragging = false, offsetX, offsetY;
  widget.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT") return;
    dragging = true;
    offsetX = e.clientX - widget.getBoundingClientRect().left;
    offsetY = e.clientY - widget.getBoundingClientRect().top;
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    widget.style.right = "auto";
    widget.style.bottom = "auto";
    widget.style.left = (e.clientX - offsetX) + "px";
    widget.style.top = (e.clientY - offsetY) + "px";
  });
  document.addEventListener("mouseup", () => { dragging = false; });
}

// Run on load and observe for late-rendered content
findActivityTime();
const observer = new MutationObserver(() => findActivityTime());
observer.observe(document.body, { childList: true, subtree: true });
