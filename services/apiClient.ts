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

const canUseApiSubdomainFallback = (): boolean => {
  if (typeof window === 'undefined') return false;
  const { hostname, protocol } = window.location;
  if (!/^https?:$/i.test(protocol)) return false;
  if (!hostname || hostname === 'localhost') return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;
  if (hostname.startsWith('api.')) return false;
  return hostname.includes('.');
};

const getFallbackApiBaseUrls = (): string[] => {
  if (!canUseApiSubdomainFallback()) return [];

  const { protocol, hostname } = window.location;
  const hostParts = hostname.split('.').filter(Boolean);
  if (hostParts.length < 2) return [];

  const candidates = new Set<string>();

  const currentHostApi = `${protocol}//api.${hostname}`;

  if (hostParts.length === 2) {
    candidates.add(currentHostApi);
    return Array.from(candidates);
  }

  const rootDomain = hostParts.slice(1).join('.');
  const rootApi = rootDomain ? `${protocol}//api.${rootDomain}` : '';
  const firstLabel = hostParts[0].toLowerCase();

  if (firstLabel === 'www') {
    if (rootApi) {
      candidates.add(rootApi);
    }
  } else {
    candidates.add(currentHostApi);
    if (rootApi) {
      candidates.add(rootApi);
    }
  }

  return Array.from(candidates);
};

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

const getApiUrlCandidates = (path: string): string[] => {
  if (/^https?:\/\//i.test(path)) return [path];

  const configuredBase = getApiBaseUrl();
  if (configuredBase) {
    return [`${configuredBase}${path}`];
  }

  const sameOrigin = path;
  const fallbackBases = getFallbackApiBaseUrls();

  return [
    sameOrigin,
    ...fallbackBases.map((fallbackBase) => `${fallbackBase}${path}`),
  ];
};

const isRetryableStatus = (status: number): boolean => status >= 500 || status === 404;

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

  const urls = getApiUrlCandidates(path);
  let lastError: unknown;

  for (const [index, url] of urls.entries()) {
    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: hasBody ? JSON.stringify(options.body) : undefined,
        credentials: options.credentials || 'include',
      });

      const data = await parseResponseBody(response);
      if (response.ok) {
        return data as T;
      }

      const message = toErrorMessage(response.status, data, response.statusText);
      const error = new ApiRequestError(message, response.status, data);
      lastError = error;

      const shouldTryFallback =
        index < urls.length - 1 && isRetryableStatus(response.status);
      if (!shouldTryFallback) {
        throw error;
      }
    } catch (error) {
      lastError = error;
      if (error instanceof ApiRequestError && !isRetryableStatus(error.status)) {
        throw error;
      }
      if (index === urls.length - 1) {
        throw error;
      }
    }
  }

  throw (lastError as Error) || new Error('Request failed.');
};
