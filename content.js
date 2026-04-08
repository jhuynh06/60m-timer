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
  const RING_R = 54;
  const RING_C = 2 * Math.PI * RING_R;

  const widget = document.createElement("div");
  widget.id = "act-timer-widget";
  widget.innerHTML = `
    <div id="act-timer-ring-wrap">
      <svg id="act-timer-ring" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r="${RING_R}" fill="none" stroke="hsl(217 10% 85%)" stroke-width="8" opacity="0.25"/>
        <circle id="act-timer-ring-fg" cx="64" cy="64" r="${RING_R}" fill="none" stroke="hsl(217 91% 60%)" stroke-width="8" stroke-linecap="round"
          stroke-dasharray="${RING_C}" stroke-dashoffset="0" transform="rotate(-90 64 64)"
          style="transition: stroke-dashoffset 0.3s ease;"/>
      </svg>
      <div id="act-timer-display">${formatTime(minutes * 60)}</div>
    </div>
    <div id="act-timer-adjust">
      <button id="act-timer-minus" class="act-btn act-btn-outline act-btn-icon" title="Remove 1 minute">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <span id="act-timer-adjust-label">Adjust time</span>
      <button id="act-timer-plus" class="act-btn act-btn-outline act-btn-icon" title="Add 1 minute">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
    </div>
    <div id="act-timer-buttons">
      <button id="act-timer-start" class="act-btn act-btn-primary">Start</button>
      <button id="act-timer-reset" class="act-btn act-btn-outline">Reset</button>
    </div>
  `;
  document.body.appendChild(widget);

  const style = document.createElement("style");
  style.textContent = `
    #act-timer-widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: hsl(0 0% 100%);
      color: hsl(224 71% 4%);
      padding: 20px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      z-index: 999999;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.12);
      border: 1px solid hsl(220 13% 91%);
      cursor: move;
      user-select: none;
      width: 220px;
    }

    /* Ring visualizer */
    #act-timer-ring-wrap {
      position: relative;
      width: 140px;
      height: 140px;
      margin: 0 auto 12px;
    }
    #act-timer-ring { width: 100%; height: 100%; }
    #act-timer-display {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 22px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.5px;
      color: hsl(224 71% 4%);
    }
    #act-timer-display.done { color: hsl(0 84% 60%); }

    /* Adjust +/- */
    #act-timer-adjust {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    #act-timer-adjust-label {
      font-size: 11px;
      color: hsl(220 9% 46%);
      font-weight: 500;
    }

    /* Buttons */
    .act-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 6px;
      border: 1px solid transparent;
      cursor: pointer;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
      font-family: inherit;
      line-height: 1;
    }
    .act-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .act-btn-primary {
      background: hsl(222 47% 11%);
      color: hsl(210 40% 98%);
      border-color: hsl(222 47% 11%);
    }
    .act-btn-primary:hover:not(:disabled) { background: hsl(222 47% 20%); }
    .act-btn-outline {
      background: transparent;
      color: hsl(224 71% 4%);
      border-color: hsl(220 13% 82%);
    }
    .act-btn-outline:hover:not(:disabled) { background: hsl(220 14% 96%); }
    .act-btn-icon {
      padding: 6px;
      border-radius: 6px;
    }

    #act-timer-buttons {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    #act-timer-buttons .act-btn {
      width: 100%;
    }
  `;
  document.head.appendChild(style);

  // State
  let totalSeconds = minutes * 60;
  let remaining = totalSeconds;
  let interval = null;
  let running = false;

  // DOM refs
  const ringFg = document.getElementById("act-timer-ring-fg");
  const display = document.getElementById("act-timer-display");
  const startBtn = document.getElementById("act-timer-start");
  const resetBtn = document.getElementById("act-timer-reset");
  const plusBtn = document.getElementById("act-timer-plus");
  const minusBtn = document.getElementById("act-timer-minus");

  function updateRing() {
    const progress = totalSeconds > 0 ? remaining / totalSeconds : 1;
    const offset = RING_C * (1 - progress);
    ringFg.setAttribute("stroke-dashoffset", offset);
    if (remaining === 0 && totalSeconds > 0) {
      ringFg.setAttribute("stroke", "hsl(0 84% 60%)");
    } else if (remaining < totalSeconds * 0.15) {
      ringFg.setAttribute("stroke", "hsl(25 95% 53%)");
    } else {
      ringFg.setAttribute("stroke", "hsl(217 91% 60%)");
    }
  }

  function updateUI() {
    display.textContent = formatTime(remaining);
    display.classList.toggle("done", remaining === 0 && !running);
    startBtn.textContent = running ? "Pause" : "Start";
    updateRing();
  }

  // Restore local timer state
  chrome.storage.local.get(["timerRemaining", "timerRunning"], (data) => {
    if (data.timerRemaining != null) remaining = data.timerRemaining;
    if (data.timerRunning) startLocalTimer();
    updateUI();
  });

  function tick() {
    if (remaining <= 0) {
      clearInterval(interval);
      interval = null;
      running = false;
      chrome.storage.local.set({ timerRemaining: 0, timerRunning: false });
      updateUI();
      return;
    }
    remaining--;
    chrome.storage.local.set({ timerRemaining: remaining, timerRunning: true });
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
    if (running) {
      stopLocalTimer();
      chrome.storage.local.set({ timerRemaining: remaining, timerRunning: false });
    } else {
      startLocalTimer();
      chrome.storage.local.set({ timerRemaining: remaining, timerRunning: true });
    }
  });

  resetBtn.addEventListener("click", () => {
    stopLocalTimer();
    remaining = totalSeconds;
    chrome.storage.local.set({ timerRemaining: remaining, timerRunning: false });
    updateUI();
  });

  // --- +/- time adjust ---
  plusBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    remaining += 60;
    totalSeconds += 60;
    chrome.storage.local.set({ timerRemaining: remaining });
    updateUI();
  });

  minusBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (remaining > 60) {
      remaining -= 60;
      if (totalSeconds > 60) totalSeconds -= 60;
    } else {
      remaining = 0;
    }
    chrome.storage.local.set({ timerRemaining: remaining });
    updateUI();
  });

  // --- Draggable ---
  let dragging = false, offsetX, offsetY;
  widget.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT" || e.target.closest("button")) return;
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
