import supabase from './supabaseClient';
import { appendHttpLogEntry, createHttpRequestId } from './httpLogger';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

let currentToken = null;

const isJsonResponse = (response) => {
  const contentType = response.headers.get('content-type') || '';
  return contentType.toLowerCase().includes('application/json');
};

const parseJsonOrText = async (response) => {
  if (response.status === 204) return null;
  if (isJsonResponse(response)) {
    return response.json();
  }
  const text = await response.text();
  return text;
};

export async function getAuthHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) {
    currentToken = token;
  }
  const headers = {
    'Content-Type': 'application/json',
  };
  if (currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }
  return headers;
}

async function request(method, path, body = null, meta = {}) {
  const requestId = createHttpRequestId();
  const startedAt = Date.now();
  let lastStatus = 0;
  const baseEntry = {
    id: requestId,
    requestId,
    method,
    path,
    url: `${API_BASE}${path}`,
    actionTitle: meta?.actionTitle || '',
    payloadSummary: body ?? null,
  };

  const headers = await getAuthHeaders();
  const options = { method, headers };
  if (body !== null) {
    options.body = JSON.stringify(body);
  }
  try {
    const response = await fetch(`${API_BASE}${path}`, options);
    lastStatus = response.status;
    if (response.status === 401) {
      const { data } = await supabase.auth.refreshSession();
      if (data.session) {
        currentToken = data.session.access_token;
        headers['Authorization'] = `Bearer ${currentToken}`;
        const retry = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : null });
        lastStatus = retry.status;
        if (!retry.ok) {
          const parsedRetry = await parseJsonOrText(retry);
          const detail = typeof parsedRetry === 'string'
            ? parsedRetry.slice(0, 260)
            : parsedRetry?.detail || retry.statusText;
          appendHttpLogEntry({
            ...baseEntry,
            ok: false,
            status: retry.status,
            durationMs: Date.now() - startedAt,
            error: {
              detail,
              retry: true,
            },
          });
          const retryError = new Error(detail || retry.statusText);
          retryError.__httpLogged = true;
          throw retryError;
        }
        const retryPayload = await parseJsonOrText(retry);
        if (retryPayload !== null && typeof retryPayload === 'string') {
          const nonJsonRetryError = new Error(
            `Respuesta no JSON en ${method} ${path}. Posible backend no disponible o ruta mal configurada.`
          );
          nonJsonRetryError.__httpLogged = true;
          appendHttpLogEntry({
            ...baseEntry,
            ok: false,
            status: retry.status,
            durationMs: Date.now() - startedAt,
            error: nonJsonRetryError.message,
          });
          throw nonJsonRetryError;
        }
        appendHttpLogEntry({
          ...baseEntry,
          ok: true,
          status: retry.status,
          durationMs: Date.now() - startedAt,
        });
        return retryPayload;
      }
    }
    if (!response.ok) {
      const parsed = await parseJsonOrText(response);
      const detail = typeof parsed === 'string'
        ? parsed.slice(0, 260)
        : parsed?.detail || response.statusText;
      appendHttpLogEntry({
        ...baseEntry,
        ok: false,
        status: response.status,
        durationMs: Date.now() - startedAt,
        error: detail,
      });
      const responseError = new Error(detail || response.statusText);
      responseError.__httpLogged = true;
      throw responseError;
    }
    const payload = await parseJsonOrText(response);
    if (payload !== null && typeof payload === 'string') {
      const htmlLike = payload.trim().startsWith('<');
      const parseError = new Error(
        htmlLike
          ? `Respuesta HTML en ${method} ${path}. Revisa que el backend /api esté disponible.`
          : `Respuesta no JSON en ${method} ${path}.`
      );
      parseError.__httpLogged = true;
      appendHttpLogEntry({
        ...baseEntry,
        ok: false,
        status: response.status,
        durationMs: Date.now() - startedAt,
        error: parseError.message,
      });
      throw parseError;
    }

    if (response.status === 204 || payload === null) {
      appendHttpLogEntry({
        ...baseEntry,
        ok: true,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return null;
    }
    appendHttpLogEntry({
      ...baseEntry,
      ok: true,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return payload;
  } catch (error) {
    if (error?.__httpLogged) {
      throw error;
    }
    appendHttpLogEntry({
      ...baseEntry,
      ok: false,
      status: lastStatus || 0,
      durationMs: Date.now() - startedAt,
      error: error?.message || 'Network error',
    });
    throw error;
  }
}

export const api = {
  get: (path, meta) => request('GET', path, null, meta),
  post: (path, body, meta) => request('POST', path, body, meta),
  put: (path, body, meta) => request('PUT', path, body, meta),
  patch: (path, body, meta) => request('PATCH', path, body, meta),
  delete: (path, meta) => request('DELETE', path, null, meta),
};
