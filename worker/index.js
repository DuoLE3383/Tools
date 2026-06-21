const TUNNEL_URL = 'https://plants-backing-kevin-secretary.trycloudflare.com'; // <-- your URL

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Proxy ALL /api/* requests to the tunnel
    if (url.pathname.startsWith('/api/')) {
      const backendUrl = TUNNEL_URL + url.pathname + url.search;
      const proxyRequest = new Request(backendUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      return fetch(proxyRequest);
    }

    // Serve static assets (frontend)
    return env.ASSETS.fetch(request);
  }
};