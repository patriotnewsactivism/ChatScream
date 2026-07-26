import express from 'express';
import { WebSocketServer } from 'ws';
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import app from './app.js';
import {
  closeIdentityStorage,
  flushState,
  initIdentityStorage,
  seedLeaderboard,
  setScreamBroadcaster,
} from './store.js';
import { getCurrentAuthUser } from './auth.js';
import { sendMentionNotification } from './services/notification_service.js';
import { getPreferences, updatePreferences } from './notification_preferences.js';

const port = Number(process.env.PORT || 8787);
const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: undefined });

// --- Redis Setup ---
import Redis from 'ioredis';
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(redisUrl);

// --- Translation Provider ---
import fetch from 'node-fetch';

async function translateTextWithProvider(text, targetLang) {
  // Try Google Translate API first
  const googleApiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (googleApiKey) {
    try {
      const url = `https://translation.googleapis.com/language/translate/v2?key=${googleApiKey}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, target: targetLang }),
      });
      const data = await resp.json();
      return data.data.translations[0].translatedText;
    } catch (error) {
      console.error('Google Translate API failed:', error);
    }
  }
  // Fallback to another translation provider if needed
  return '';
}

// --- Session Persistence Endpoints ---
app.get('/api/user/session', async (req, res) => {
  const user = await getCurrentAuthUser(req);
  if (!user) return res.status(401).send('Unauthorized');
  
  const sessionKey = `session:${user.id}`;
  const sessionData = await redis.get(sessionKey);
  
  if (!sessionData) {
    return res.status(404).json({ error: 'No session found' });
  }
  
  try {
    const parsedData = JSON.parse(sessionData);
    // Check if session has expired (30 minutes)
    const now = Date.now();
    if (now - parsedData.timestamp > 30 * 60 * 1000) { // 30 minutes in milliseconds
      await redis.del(sessionKey);
      return res.status(404).json({ error: 'Session expired' });
    }
    res.json(parsedData.data);
  } catch (error) {
    console.error('Error parsing session data:', error);
    await redis.del(sessionKey); // Clean up corrupted data
    res.status(500).json({ error: 'Invalid session data' });
  }
});

app.post('/api/user/session', async (req, res) => {
  const user = await getCurrentAuthUser(req);
  if (!user) return res.status(401).send('Unauthorized');
  
  const sessionData = req.body;
  const sessionKey = `session:${user.id}`;
  
  // Add timestamp for expiration tracking
  const dataToStore = {
    data: sessionData,
    timestamp: Date.now()
  };
  
  try {
    await redis.setex(sessionKey, 30 * 60, JSON.stringify(dataToStore)); // 30 minutes in seconds
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving session data:', error);
    res.status(500).json({ error: 'Failed to save session' });
  }
});

app.delete('/api/user/session', async (req, res) => {
  const user = await getCurrentAuthUser(req);
  if (!user) return res.status(401).send('Unauthorized');
  
  const sessionKey = `session:${user.id}`;
  
  try {
    await redis.del(sessionKey);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error deleting session data:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// --- Draft API Endpoints ---
app.get('/api/drafts/:chatId', async (req, res) => {
  const user = await getCurrentAuthUser(req);
  if (!user) return res.status(401).send('Unauthorized');
  const chatId = req.params.chatId;
  const draftKey = `draft:${user.id}:${chatId}`;
  const draft = await redis.get(draftKey);
  res.json({ draft });
});

app.post('/api/drafts/:chatId', async (req, res) => {
  const user = await getCurrentAuthUser(req);
  if (!user) return res.status(401).send('Unauthorized');
  const chatId = req.params.chatId;
  const draftKey = `draft:${user.id}:${chatId}`;
  const draft = req.body.draft;
  await redis.set(draftKey, draft);
  res.status(200).send('Draft saved');
});

app.delete('/api/drafts/:chatId', async (req, res) => {
  const user = await getCurrentAuthUser(req);
  if (!user) return res.status(401).send('Unauthorized');
  const chatId = req.params.chatId;
  const draftKey = `draft:${user.id}:${chatId}`;
  await redis.del(draftKey);
  res.status(200).send('Draft discarded');
});

// --- Favorite and Recent Chats Endpoints ---
app.get('/api/chats/favorites', async (req, res) => {
  const user = await getCurrentAuthUser(req);
  if (!user) return res.status(401).send('Unauthorized');
  const favoritesKey = `favorites:${user.id}`;
  const favorites = await redis.smembers(favoritesKey);
  res.json({ favorites });
});

app.get('/api/chats/recent', async (req, res) => {
  const user = await getCurrentAuthUser(req);
  if (!user) return res.status(401).send('Unauthorized');
  const recentKey = `recent:${user.id}`;
  const recent = await redis.lrange(recentKey, 0, -1);
  res.json({ recent });
});

app.post('/api/chats/favorite', async (req, res) => {
  const user = await getCurrentAuthUser(req);
  if (!user) return res.status(401).send('Unauthorized');
  const { chatId, isFavorite } = req.body;
  const favoritesKey = `favorites:${user.id}`;
  if (isFavorite) {
    await redis.sadd(favoritesKey, chatId);
  } else {
    await redis.srem(favoritesKey, chatId);
  }
  res.status(200).send('Favorite status updated');
});

// --- Start Server ---
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});