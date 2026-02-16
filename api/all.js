import app from '../server/app.js';

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
  return app(req, res);
};
