const relayOnly = String(process.env.RELAY_ONLY || "").toLowerCase() === "true";

if (relayOnly) {
  await import("./relay.js");
} else {
  // Cloud Run and other full API deployments load the Express app through
  // server/index.js. Patch app.handle before index creates the HTTP server so
  // the shared Google callback can distinguish a YouTube streaming-destination
  // OAuth state from ChatScream account-login state, and so the Cloud Run
  // job status callback can authenticate with its per-job token before the
  // normal Express route table (and its requireAuth gate) sees the request.
  // Ordinary login callbacks fall through untouched.
  const [
    { default: app },
    { maybeForwardYouTubeDestinationOAuth },
    { maybeHandleCloudJobCallback },
  ] = await Promise.all([
    import("./app.js"),
    import("./youtubeDestinationOAuthCallback.js"),
    import("./commercial/cloudJobCallback.js"),
  ]);
  const originalHandle = app.handle.bind(app);
  app.handle = (req, res, done) => {
    if (maybeForwardYouTubeDestinationOAuth(req, res)) return;
    if (maybeHandleCloudJobCallback(req, res)) return;
    return originalHandle(req, res, done);
  };
  await import("./index.js");
}
