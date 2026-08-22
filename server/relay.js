import { WebSocketServer } from 'ws';
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';

const port = Number(process.env.PORT || 10000);
const graceMs = Number(process.env.RELAY_RECONNECT_GRACE_MS || 30000);
const authBase = String(process.env.RELAY_AUTH_BASE_URL || 'https://www.chatscream.live').replace(/\/$/, '');
const allowedOrigins = new Set(
  String(process.env.CORS_ORIGINS || 'https://www.chatscream.live,https://chatscream.live')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/api/public/capabilities') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, relay: true, ffmpeg: true, reconnectGraceMs: graceMs }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const wss = new WebSocketServer({ server });
const sessions = new Map();

const DEFAULT_RTMP_URLS = {
  youtube: 'rtmp://a.rtmp.youtube.com/live2/',
  facebook: 'rtmps://live-api-s.facebook.com:443/rtmp/',
  twitch: 'rtmp://live.twitch.tv/app/',
  kick: 'rtmps://fa723fc1b171.global-contribute.live-video.net:443/app/',
  rumble: 'rtmp://live-ingest.rumble.com/live/',
  custom_rtmp: '',
};

const resolveServerUrl = (dest) => {
  if (dest.serverUrl && dest.serverUrl.trim()) return dest.serverUrl.trim();
  const name = String(dest.platform || dest.name || '').toLowerCase();
  for (const [key, url] of Object.entries(DEFAULT_RTMP_URLS)) {
    if (name.includes(key.replace('_', ' ')) || name.includes(key.replace('_', ''))) return url;
  }
  return '';
};

const buildArgs = (outputUrl) => [
  '-fflags', '+nobuffer+flush_packets',
  '-flags', 'low_delay',
  '-i', 'pipe:0',
  '-c:v', 'libx264',
  '-preset', 'veryfast',
  '-tune', 'zerolatency',
  '-g', '60',
  '-b:v', '4500k',
  '-maxrate', '4500k',
  '-bufsize', '9000k',
  '-c:a', 'aac',
  '-b:a', '128k',
  '-ar', '44100',
  '-f', 'flv',
  outputUrl,
];

const verifyToken = async (token) => {
  if (!token) return false;
  try {
    const response = await fetch(`${authBase}/api/auth/session`, {
      headers: { authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch (error) {
    console.error('Relay auth verification failed:', error);
    return false;
  }
};

const getSession = (id) => {
  let session = sessions.get(id);
  if (!session) {
    session = {
      id,
      ws: null,
      authenticated: false,
      procs: new Map(),
      destinations: new Map(),
      intentionalKills: new Set(),
      initSegment: null,
      cleanupTimer: null,
      bytesReceived: 0,
      lastStatsTime: Date.now(),
    };
    sessions.set(id, session);
  }
  return session;
};

const send = (session, payload) => {
  if (session.ws?.readyState === 1) session.ws.send(JSON.stringify(payload));
};

const stopDestination = (session, destId) => {
  const proc = session.procs.get(destId);
  session.destinations.delete(destId);
  if (!proc) return;
  session.intentionalKills.add(destId);
  try { proc.stdin.end(); } catch {}
  try { proc.kill(); } catch {}
};

const spawnDestination = (session, dest) => {
  const serverUrl = resolveServerUrl(dest);
  if (!serverUrl) {
    send(session, { type: 'destination_error', destId: dest.id, message: 'No RTMP server URL configured.' });
    return;
  }
  const base = serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`;
  const outputUrl = `${base}${String(dest.streamKey || '').trim()}`;

  const existing = session.procs.get(dest.id);
  if (existing) return;

  console.log(`Spawning FFmpeg for relay session ${session.id}, destination ${dest.id}`);
  const proc = spawn('ffmpeg', buildArgs(outputUrl));
  session.procs.set(dest.id, proc);

  proc.on('error', (error) => {
    send(session, { type: 'destination_error', destId: dest.id, message: `FFmpeg failed: ${error.message}` });
  });

  let stderr = '';
  proc.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
    const lines = stderr.split('\n');
    stderr = lines.pop() || '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (/Output #\d+[^']*to '[^']+'/i.test(line)) {
        send(session, { type: 'destination_connected', destId: dest.id });
      } else if (/connection refused|connection timed out|connection reset|failed to connect|invalid data|authentication failed|403|401|stream key|forbidden/i.test(line)) {
        send(session, { type: 'destination_error', destId: dest.id, message: line });
      }
    }
  });

  proc.on('close', (code) => {
    if (session.procs.get(dest.id) === proc) session.procs.delete(dest.id);
    const intentional = session.intentionalKills.delete(dest.id);
    if (!intentional && code !== 0 && code !== null) {
      send(session, { type: 'destination_error', destId: dest.id, message: `Relay process exited with code ${code}.` });
    }
  });

  if (session.initSegment && proc.stdin.writable) proc.stdin.write(session.initSegment);
};

const destroySession = (session) => {
  if (session.cleanupTimer) clearTimeout(session.cleanupTimer);
  for (const destId of Array.from(session.procs.keys())) stopDestination(session, destId);
  sessions.delete(session.id);
  console.log(`Relay session ${session.id} destroyed`);
};

wss.on('connection', (ws, req) => {
  const origin = String(req.headers.origin || '');
  if (origin && !allowedOrigins.has(origin)) {
    ws.close(1008, 'Origin not allowed');
    return;
  }

  const parsed = new URL(req.url || '/', 'http://relay.local');
  if (parsed.pathname !== '/ws/ingest') {
    ws.close(1008, 'Unsupported WebSocket path');
    return;
  }

  const sessionId = parsed.searchParams.get('session') || '';
  if (!sessionId || sessionId.length > 128) {
    ws.close(1008, 'Missing relay session');
    return;
  }

  const session = getSession(sessionId);
  if (session.cleanupTimer) {
    clearTimeout(session.cleanupTimer);
    session.cleanupTimer = null;
  }
  session.ws = ws;
  session.authenticated = false;
  console.log(`Relay WebSocket attached to ${sessionId}`);

  const statsTimer = setInterval(() => {
    if (!session.authenticated || session.procs.size === 0 || session.bytesReceived === 0) return;
    const now = Date.now();
    const seconds = Math.max((now - session.lastStatsTime) / 1000, 0.001);
    const bitrate = Math.round((session.bytesReceived * 8) / seconds / 1000);
    send(session, { type: 'stats', bitrate });
    session.bytesReceived = 0;
    session.lastStatsTime = now;
  }, 2000);

  ws.on('message', async (data, isBinary) => {
    if (isBinary) {
      if (!session.authenticated) return;
      session.bytesReceived += data.length;
      if (!session.initSegment) session.initSegment = data;
      for (const proc of session.procs.values()) {
        if (proc.stdin.writable) proc.stdin.write(data);
      }
      return;
    }

    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (!session.authenticated) {
      if (msg.type !== 'auth' || !(await verifyToken(String(msg.token || '')))) {
        ws.close(1008, 'Authentication failed');
        return;
      }
      session.authenticated = true;
      send(session, { type: 'authenticated', reconnectGraceMs: graceMs });
      return;
    }

    if (msg.type === 'start' || msg.type === 'update_destinations') {
      const next = Array.isArray(msg.destinations) ? msg.destinations : [];
      const nextIds = new Set(next.map((dest) => dest.id));
      for (const existingId of Array.from(session.destinations.keys())) {
        if (!nextIds.has(existingId)) stopDestination(session, existingId);
      }
      for (const dest of next) {
        const prev = session.destinations.get(dest.id);
        const changed = !prev || prev.streamKey !== dest.streamKey || prev.serverUrl !== dest.serverUrl;
        session.destinations.set(dest.id, dest);
        if (changed && session.procs.has(dest.id)) stopDestination(session, dest.id);
        if (!session.procs.has(dest.id)) spawnDestination(session, dest);
      }
      send(session, { type: 'destinations_updated', count: session.destinations.size });
    } else if (msg.type === 'retry_destination') {
      const dest = session.destinations.get(msg.destId);
      if (dest) {
        stopDestination(session, msg.destId);
        session.destinations.set(dest.id, dest);
        spawnDestination(session, dest);
      }
    } else if (msg.type === 'stop') {
      destroySession(session);
      ws.close(1000, 'Broadcast stopped');
    }
  });

  ws.on('close', () => {
    clearInterval(statsTimer);
    if (session.ws === ws) session.ws = null;
    session.authenticated = false;
    if (!sessions.has(session.id)) return;
    session.cleanupTimer = setTimeout(() => destroySession(session), graceMs);
    console.log(`Relay session ${session.id} detached; holding RTMP outputs for ${graceMs}ms`);
  });
});

try {
  const version = execFileSync('ffmpeg', ['-version'], { timeout: 5000 }).toString().split('\n')[0];
  console.log(`FFmpeg available: ${version}`);
} catch {
  console.error('FFmpeg is required for ChatScream relay');
  process.exit(1);
}

server.listen(port, '0.0.0.0', () => {
  console.log(`ChatScream resilient relay listening on 0.0.0.0:${port}; grace=${graceMs}ms`);
});
