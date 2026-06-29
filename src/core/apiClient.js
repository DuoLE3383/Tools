// core/apiClient.js - FIXED

const API_BASE = '/api'; // ✅ Use relative path for proxy

export function createApiClient({ onAuthError, onState }) {
  return async function callApi(path, options = {}) {
    const startedAt = performance.now();
    const method = options.method || 'GET';
    const { query, section, silent = false, background = false, noCache = false, ...fetchOptions } = options;

    // ✅ Skip if not authenticated and path requires auth
    const token = localStorage.getItem('token');
    if (!token && !path.includes('/auth/')) {
      console.warn('[API] No auth token, skipping call');
      return { success: false, error: 'Not authenticated' };
    }

    const headers = {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };

    // Build query string
    let finalPath = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
    
    const enrichedQuery = { ...query };
    if (enrichedQuery && Object.keys(enrichedQuery).length > 0) {
      const params = new URLSearchParams();
      Object.entries(enrichedQuery).forEach(([key, value]) => {
        if (value !== undefined && value !== null) params.append(key, String(value));
      });
      const qs = params.toString();
      if (qs) finalPath += (finalPath.includes('?') ? '&' : '?') + qs;
    }

    let body = fetchOptions.body;
    if (body && typeof body === 'object' && !(body instanceof FormData)) {
      body = JSON.stringify(body);
    }

    if (onState) {
      onState({
        type: 'request-start',
        payload: { method, path: finalPath },
      });
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(finalPath, {
        ...fetchOptions,
        method,
        headers,
        body,
        signal: controller.signal,
        credentials: 'include',
      });

      clearTimeout(timeoutId);

      let data = null;
      const contentType = response.headers.get('content-type') || '';
      if (response.status !== 204 && response.status !== 205) {
        const text = await response.text();
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = text;
        }
      }

      const durationMs = Math.round(performance.now() - startedAt);

      if (onState) {
        onState({
          type: 'request-finish',
          payload: {
            method,
            path: finalPath,
            status: `${response.status} ${response.statusText}`,
            durationMs,
          },
        });
      }

      // ✅ Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        if (onAuthError) onAuthError();
        throw new Error('Unauthorized');
      }

      // ✅ Handle response
      const isError = !response.ok || (data && (data.success === false || data.error || data.errors));

      if (isError) {
        const errorMsg = typeof data === 'string' ? data :
          data?.errors?.[0]?.message || data?.error || data?.message || response.statusText;
        throw new Error(errorMsg);
      }

      // ✅ Success
      if (onState) {
        onState({
          type: 'request-success',
          payload: { data, status: response.status, statusText: response.statusText },
        });
      }

      return data || { success: true };

    } catch (err) {
      let errorMsg = err.message || String(err);
      if (err.name === 'AbortError') {
        errorMsg = 'Request timeout (30s)';
      }

      if (onState) {
        onState({
          type: 'request-error',
          payload: { errorMsg, data: null, status: 0, showModal: options.showModal },
        });
        onState({
          type: 'request-failed',
          payload: { error: errorMsg, durationMs: Math.round(performance.now() - startedAt) },
        });
      }

      return { success: false, error: errorMsg };
    } finally {
      if (onState) {
        onState({ type: 'request-end' });
      }
    }
  };
}