import app from '../server/app.js';
import recordingsHandler from './recordings.js';

const normalizePathSegment = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .join('/');
  }
  return String(value || '').trim();
};

export default (req, res) => {
  const incoming = new URL(req.url || '/', 'http://localhost');
  const rewrittenPath = normalizePathSegment(req.query?.path);

  let targetPath = '';
  if (rewrittenPath) {
    targetPath = `/api/${rewrittenPath.replace(/^\/+/, '')}`;
  } else if (incoming.pathname.startsWith('/api')) {
    targetPath = incoming.pathname;
  } else {
    targetPath = '/api';
  }

  incoming.searchParams.delete('path');
  const nextQuery = incoming.searchParams.toString();
  req.url = nextQuery ? `${targetPath}?${nextQuery}` : targetPath;

  // Keep ChatScream on one Vercel API entrypoint. The project rewrites /api/*
  // to this handler, so specialized routes must dispatch here before Express.
  if (targetPath === '/api/recordings') {
    return recordingsHandler(req, res);
  }

  return app(req, res);
};

// New route for handling message reactions
app.post('/api/messages/:messageId/react', async (req, res) => {
  const { messageId } = req.params;
  const { reaction } = req.body;

  try {
    const message = await db.chatMessages.findOne({ where: { id: messageId } });
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const reactions = message.reactions || {};
    reactions[reaction] = (reactions[reaction] || 0) + 1;

    await db.chatMessages.update({
      where: { id: messageId },
      data: { reactions },
    });

    return res.status(200).json({ message: 'Reaction added successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
