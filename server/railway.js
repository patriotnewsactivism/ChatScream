// Railway deployment entry point
// Start the server normally but also export for Railway

import './index.js';

// Re-export the Express app for Railway HTTP routing
import app from './app.js';

export default app;
