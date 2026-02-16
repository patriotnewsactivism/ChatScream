import app from './app.js';
import { closeIdentityStorage, flushState } from './store.js';

const port = Number(process.env.PORT || 8787);

const server = app.listen(port, () => {
  console.log(`ChatScream API listening on http://localhost:${port}`);
});

const shutdown = async () => {
  flushState();
  await closeIdentityStorage();
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
