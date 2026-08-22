const relayOnly = String(process.env.RELAY_ONLY || '').toLowerCase() === 'true';

if (relayOnly) {
  await import('./relay.js');
} else {
  await import('./index.js');
}
