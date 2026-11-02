/** Cliente de la API del panel: misma URL (cookie de sesión) + token CSRF en cada request que modifica. */

let csrfToken = '';
export const setCsrf = (t: string) => {
  csrfToken = t;
};

let onUnauthorized: (() => void) | null = null;
export const setOnUnauthorized = (fn: () => void) => {
  onUnauthorized = fn;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
}

async function request<T>(url: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  const qs = opts.query
    ? new URLSearchParams(
        Object.entries(opts.query)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : '';
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers['x-csrf-token'] = csrfToken;
  const res = await fetch(qs ? `${url}?${qs}` : url, {
    method,
    headers,
    credentials: 'same-origin',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !url.endsWith('/auth/me') && !url.endsWith('/auth/login')) onUnauthorized?.();
    throw new ApiError(res.status, data.error ?? `Error ${res.status}`);
  }
  return data as T;
}

export const api = <T>(path: string, opts?: Options) => request<T>(`/api${path}`, opts);

/** Rutas /dev/* (solo existen fuera de producción): para simular llamadas desde el panel. */
export const devApi = <T>(path: string, body: unknown = {}) => request<T>(`/dev${path}`, { method: 'POST', body });
