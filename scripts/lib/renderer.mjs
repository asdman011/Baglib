// Shared by live runners (KEY-317): find out whether a Next.js renderer already answers on port 3000.
// Runners reuse such a renderer (it may belong to another agent or to the user) and start and stop
// only one of their own; they never free the port by force.
export async function rendererAnswers(port = 3000) {
  for (const host of ['127.0.0.1', 'localhost']) {
    try {
      const response = await fetch(`http://${host}:${port}`, { signal: AbortSignal.timeout(5000) });
      if (response.status === 200 || response.status === 304 || response.status === 404) return true;
    } catch { /* try the next host */ }
  }
  return false;
}
