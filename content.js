// Scan the page for "Activity Time: x minutes" and store it
function findActivityTime() {
  const body = document.body.innerText;
  const match = body.match(/Activity Time:\s*(\d+)\s*minutes?/i);
  if (match) {
    const minutes = parseInt(match[1], 10);
    chrome.storage.local.set({ activityMinutes: minutes, foundOnUrl: location.href });
  } else {
    chrome.storage.local.set({ activityMinutes: null, foundOnUrl: location.href });
  }
}

findActivityTime();
const observer = new MutationObserver(() => findActivityTime());
observer.observe(document.body, { childList: true, subtree: true });
