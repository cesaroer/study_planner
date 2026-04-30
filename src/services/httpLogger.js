const HTTP_LOG_STORAGE_PREFIX = 'http_logs_';
const HTTP_LOG_LIMIT = 250;

let activeUserKey = '';
const listeners = new Set();

const SENSITIVE_KEY_PATTERN = /(token|authorization|password|secret|cookie|api[-_]?key|access[-_]?token|refresh[-_]?token)/i;
const SENSITIVE_VALUE_PATTERN = /(bearer\s+[a-z0-9_.-]+|eyJ[a-zA-Z0-9_.-]+)/i;

const normalizeUserKey = (value = '') => String(value || '').trim().toLowerCase();

const parseJsonSafe = (rawValue, fallback) => {
  try {
    const parsed = JSON.parse(rawValue);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const sanitizePrimitive = (value) => {
  if (typeof value !== 'string') return value;
  if (SENSITIVE_VALUE_PATTERN.test(value)) return '[REDACTED]';
  if (value.length > 280) return `${value.slice(0, 280)}…`;
  return value;
};

const redactSensitive = (value, keyHint = '') => {
  if (value === null || value === undefined) return value;

  if (SENSITIVE_KEY_PATTERN.test(String(keyHint))) {
    return '[REDACTED]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactSensitive(item));
  }

  if (typeof value === 'object') {
    const out = {};
    Object.entries(value).slice(0, 30).forEach(([key, item]) => {
      out[key] = redactSensitive(item, key);
    });
    return out;
  }

  return sanitizePrimitive(value);
};

const getStorageKey = (userKey) => `${HTTP_LOG_STORAGE_PREFIX}${normalizeUserKey(userKey)}`;

const resolveUserKey = () => {
  if (activeUserKey) return activeUserKey;
  return normalizeUserKey(localStorage.getItem('lastLoggedUsername'));
};

export const setHttpLogUser = (userKey) => {
  activeUserKey = normalizeUserKey(userKey);
};

export const createHttpRequestId = () => `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const getHttpLogs = (userKey = resolveUserKey()) => {
  const normalized = normalizeUserKey(userKey);
  if (!normalized) return [];
  const raw = localStorage.getItem(getStorageKey(normalized));
  const parsed = parseJsonSafe(raw, []);
  return Array.isArray(parsed) ? parsed : [];
};

export const clearHttpLogs = (userKey = resolveUserKey()) => {
  const normalized = normalizeUserKey(userKey);
  if (!normalized) return;
  localStorage.removeItem(getStorageKey(normalized));
  listeners.forEach((listener) => listener([]));
};

export const onHttpLog = (listener) => {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const appendHttpLogEntry = (entry, userKey = resolveUserKey()) => {
  const normalized = normalizeUserKey(userKey);
  if (!normalized || !entry) return null;

  const sanitizedEntry = {
    id: entry.id || createHttpRequestId(),
    requestId: entry.requestId || entry.id || createHttpRequestId(),
    timestamp: entry.timestamp || new Date().toISOString(),
    method: String(entry.method || 'GET').toUpperCase(),
    path: String(entry.path || ''),
    url: String(entry.url || ''),
    ok: Boolean(entry.ok),
    status: Number.isFinite(Number(entry.status)) ? Number(entry.status) : 0,
    durationMs: Number.isFinite(Number(entry.durationMs)) ? Number(entry.durationMs) : 0,
    actionTitle: sanitizePrimitive(entry.actionTitle || ''),
    payloadSummary: redactSensitive(entry.payloadSummary || null),
    error: redactSensitive(entry.error || null),
  };

  const storageKey = getStorageKey(normalized);
  const currentLogs = getHttpLogs(normalized);
  const nextLogs = [sanitizedEntry, ...currentLogs].slice(0, HTTP_LOG_LIMIT);
  localStorage.setItem(storageKey, JSON.stringify(nextLogs));

  listeners.forEach((listener) => listener(nextLogs, sanitizedEntry));
  return sanitizedEntry;
};
