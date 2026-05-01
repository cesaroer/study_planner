import { appendHttpLogEntry, createHttpRequestId } from './httpLogger';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

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

export function getAuthHeaders() {
  const username = localStorage.getItem('lastLoggedUsername');
  const headers = { 'Content-Type': 'application/json' };
  if (username) {
    headers['X-Username'] = username;
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

  const headers = getAuthHeaders();
  const options = { method, headers };
  if (body !== null) {
    options.body = JSON.stringify(body);
  }
  try {
    const response = await fetch(`${API_BASE}${path}`, options);
    lastStatus = response.status;
    if (!response.ok) {
      const parsed = await parseJsonOrText(response);
      // detail may be a string, a structured object (from our global error handler), or undefined
      const detail = typeof parsed === 'string' ? parsed : (parsed?.detail ?? response.statusText);
      appendHttpLogEntry({
        ...baseEntry,
        ok: false,
        status: response.status,
        durationMs: Date.now() - startedAt,
        error: detail,
      });
      // Build a readable Error message for throw (objects get stringified)
      const errorMessage = typeof detail === 'object'
        ? (detail?.error || JSON.stringify(detail))
        : String(detail || response.statusText);
      const responseError = new Error(errorMessage);
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
