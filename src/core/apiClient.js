// core/apiClient.js - COMPLETE FIX

// Use relative path for development proxy, absolute for production
const API_BASE = import.meta.env.VITE_API_URL || '/api';
const WS_URL = import.meta.env.VITE_WS_URL || '/api/v2/prices/ws';

export function createApiClient({ onAuthError, onState }) {
  return async function callApi(path, options = {}) {
    const startedAt = performance.now();
    const method = options.method || 'GET';
    const { query, section, silent = false, background = false, noCache = false, ...fetchOptions } = options;

    // ✅ Skip if not authenticated and path requires auth
    const token = localStorage.getItem('token');
    if (!token && !path.includes('/auth/') && !path.includes('/public/')) {
      console.warn('[API] No auth token, skipping call');
      return { success: false, error: 'Not authenticated' };
    }

    const isLoginPath = path.includes('/auth/login');

    const headers = {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
      ...(token && !isLoginPath ? { 'Authorization': `Bearer ${token}` } : {}),
    };

    // ✅ Build the path correctly
    let apiPath = path;
    if (!apiPath.startsWith('/api')) {
      apiPath = `/api${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`;
    }

    // ✅ Use environment variable for base URL (if set)
    // In development with proxy, this will be empty -> relative URLs
    // In production, we force a relative path to ensure requests go to the same domain.
    const baseUrl = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || '');
    let finalUrl = baseUrl ? `${baseUrl}${apiPath}` : apiPath;

    // ✅ Add query parameters
    const enrichedQuery = { ...query };
    if (enrichedQuery && Object.keys(enrichedQuery).length > 0) {
      const params = new URLSearchParams();
      Object.entries(enrichedQuery).forEach(([key, value]) => {
        if (value !== undefined && value !== null) params.append(key, String(value));
      });
      const qs = params.toString();
      if (qs) {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + qs;
      }
    }

    // ✅ Log for debugging
    if (import.meta.env.DEV) {
      console.log(`[API] ${method} ${finalUrl}`);
    }

    let body = fetchOptions.body;
    if (body && typeof body === 'object' && !(body instanceof FormData)) {
      body = JSON.stringify(body);
    }

    if (onState) {
      onState({
        type: 'request-start',
        payload: { method, path: finalUrl },
      });
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(finalUrl, {
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
            path: finalUrl,
            status: `${response.status} ${response.statusText}`,
            durationMs,
          },
        });
      }

      // ✅ Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        // Clear invalid token
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
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

      // ✅ Don't show modal for auth errors (they're handled above)
      const shouldShowModal = options.showModal !== false && 
                            !response?.status === 401 && 
                            !response?.status === 403;

      if (onState) {
        onState({
          type: 'request-error',
          payload: { 
            errorMsg, 
            data: null, 
            status: response?.status || 0, 
            showModal: shouldShowModal 
          },
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