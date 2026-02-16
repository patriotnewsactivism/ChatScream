export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequestOptions {
  method?: ApiMethod;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.data = data;
  }
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const getApiBaseUrl = (): string => {
  const rawValue = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  return rawValue ? trimTrailingSlash(rawValue) : '';
};

export const buildApiUrl = (path: string): string => {
  if (/^https?:\/\//i.test(path)) return path;
  const base = getApiBaseUrl();
  if (!base) return path;
  return `${base}${path}`;
};

const parseResponseBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204) return null;

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const toErrorMessage = (status: number, data: unknown, statusText: string): string => {
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    const maybeData = data as Record<string, unknown>;
    if (typeof maybeData.message === 'string' && maybeData.message.trim()) {
      return maybeData.message;
    }
    if (typeof maybeData.error === 'string' && maybeData.error.trim()) {
      return maybeData.error;
    }
  }
  return `Request failed (${status}): ${statusText || 'Unknown error'}`;
};

export const apiRequest = async <T>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
  const headers: Record<string, string> = { ...(options.headers || {}) };
  const hasBody = options.body !== undefined;

  if (hasBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(buildApiUrl(path), {
    method: options.method || 'GET',
    headers,
    body: hasBody ? JSON.stringify(options.body) : undefined,
    credentials: options.credentials || 'include',
  });

  const data = await parseResponseBody(response);
  if (!response.ok) {
    const message = toErrorMessage(response.status, data, response.statusText);
    throw new ApiRequestError(message, response.status, data);
  }

  return data as T;
};
