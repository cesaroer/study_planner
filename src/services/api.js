import supabase from './supabaseClient';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

let currentToken = null;

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

async function request(method, path, body = null) {
  const headers = await getAuthHeaders();
  const options = { method, headers };
  if (body !== null) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${API_BASE}${path}`, options);
  if (response.status === 401) {
    const { data } = await supabase.auth.refreshSession();
    if (data.session) {
      currentToken = data.session.access_token;
      headers['Authorization'] = `Bearer ${currentToken}`;
      const retry = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : null });
      if (!retry.ok) {
        const err = await retry.json().catch(() => ({ detail: retry.statusText }));
        throw new Error(err.detail || retry.statusText);
      }
      return retry.json();
    }
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(err.detail || response.statusText);
  }
  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
};
