// Supabase REST API helpers
// SUPABASE_URL and SUPABASE_ANON_KEY are loaded from config.js

const HEADERS = {
  "apikey": SUPABASE_ANON_KEY,
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=representation"
};

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateHostId() {
  return "host_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

async function createRoom(activityMinutes) {
  const code = generateRoomCode();
  const hostId = generateHostId();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rooms`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      code: code,
      host_id: hostId,
      activity_minutes: activityMinutes,
      remaining: activityMinutes * 60,
      running: false
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error("Failed to create room: " + err);
  }
  const rows = await res.json();
  return { roomCode: code, hostId: hostId };
}

async function getRoom(roomCode) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/rooms?code=eq.${roomCode}&select=*`,
    { headers: HEADERS }
  );
  if (!res.ok) throw new Error("Failed to fetch room");
  const rows = await res.json();
  if (rows.length === 0) throw new Error("Room not found");
  return rows[0];
}

async function syncState(roomCode, state) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/rooms?code=eq.${roomCode}`,
    {
      method: "PATCH",
      headers: HEADERS,
      body: JSON.stringify(state)
    }
  );
  if (!res.ok) throw new Error("Failed to sync state");
}

function listenToRoom(roomCode, callback) {
  // Use Supabase Realtime via WebSocket
  const wsUrl = SUPABASE_URL.replace("https://", "wss://") + "/realtime/v1/websocket?apikey=" + SUPABASE_ANON_KEY + "&vsn=1.0.0";
  const ws = new WebSocket(wsUrl);

  const topic = "realtime:public:rooms:code=eq." + roomCode;
  let heartbeatRef = 0;
  let heartbeatInterval = null;

  ws.onopen = () => {
    // Join the channel
    ws.send(JSON.stringify({
      topic: topic,
      event: "phx_join",
      payload: { config: { broadcast: { self: false }, postgres_changes: [{ event: "*", schema: "public", table: "rooms", filter: "code=eq." + roomCode }] } },
      ref: "1"
    }));

    // Heartbeat to keep connection alive
    heartbeatInterval = setInterval(() => {
      heartbeatRef++;
      ws.send(JSON.stringify({
        topic: "phoenix",
        event: "heartbeat",
        payload: {},
        ref: String(heartbeatRef)
      }));
    }, 30000);
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.event === "postgres_changes") {
      const payload = msg.payload;
      if (payload.data && payload.data.record) {
        callback(payload.data.record);
      }
    }
  };

  ws.onerror = () => {
    // Fallback to polling
    ws.close();
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    startPolling(roomCode, callback);
  };

  ws.onclose = () => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
  };

  return {
    close: () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      ws.close();
    }
  };
}

function startPolling(roomCode, callback) {
  const pollId = setInterval(async () => {
    try {
      const data = await getRoom(roomCode);
      if (data) callback(data);
    } catch (e) {
      clearInterval(pollId);
    }
  }, 1000);
  return { close: () => clearInterval(pollId) };
}

async function deleteRoom(roomCode) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/rooms?code=eq.${roomCode}`,
    { method: "DELETE", headers: HEADERS }
  );
}
