// Vercel Serverless Function (HTTP API only - no WebSockets)
// Deploy this to Vercel for auth/signup functionality

import app from '../server/app.js';

// Export Express app for Vercel
export default app;
