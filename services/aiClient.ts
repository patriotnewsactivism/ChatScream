import { clientEnv } from './env';

type HttpMethod = 'POST';

const buildBaseUrl = (): string => {
  const override = clientEnv.VITE_FUNCTIONS_BASE_URL;
  if (override) return override;

  if (clientEnv.VITE_API_BASE_URL) {
    return clientEnv.VITE_API_BASE_URL;
  }

  return '';
};

const jsonHeaders = (authToken: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${authToken}`,
});

async function request<T>(
  path: string,
  authToken: string,
  method: HttpMethod = 'POST',
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${buildBaseUrl()}${path}`, {
    method,
    headers: jsonHeaders(authToken),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI endpoint error (${response.status}): ${text || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export interface ViralStreamPackageResponse {
  titles: string[];
  descriptions: string[];
  hashtags: string[];
  tags: string[];
}

export interface StreamMetadataResponse {
  title: string;
  description: string;
}

export interface ModerationResponse {
  isAppropriate: boolean;
  reason?: string | null;
}

export interface ChatResponsePayload {
  message: string;
  suggestions?: string[];
}

export const requestViralPackage = (
  authToken: string,
  topic: string,
  platforms: string[],
): Promise<ViralStreamPackageResponse> =>
  request('/generateViralContent', authToken, 'POST', { topic, platforms });

export const requestStreamMetadata = (
  authToken: string,
  topic: string,
): Promise<StreamMetadataResponse> =>
  request('/generateStreamMetadata', authToken, 'POST', { topic });

export const requestModeration = (
  authToken: string,
  message: string,
): Promise<ModerationResponse> => request('/moderateChat', authToken, 'POST', { message });

export const requestChatResponse = (
  authToken: string,
  viewerMessage: string,
  streamContext: string,
  previousMessages: string[],
): Promise<ChatResponsePayload> =>
  request('/generateChatResponse', authToken, 'POST', {
    viewerMessage,
    streamContext,
    previousMessages,
  });

export { buildBaseUrl as getFunctionsBaseUrl };
