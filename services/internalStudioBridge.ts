import { apiRequest } from './apiClient';

export type InternalStudioCommand =
  | 'lower-third'
  | 'ticker'
  | 'program-media'
  | 'clear'
  | 'note';

export interface InternalStudioBridgeState {
  enabled: boolean;
  eventId: string;
  sequence: number;
  command: InternalStudioCommand;
  payload: Record<string, unknown>;
  source?: string;
  updatedAt?: string;
}

export const getInternalStudioBridgeState = async (
  token: string,
): Promise<InternalStudioBridgeState | null> => {
  const result = await apiRequest<{ state?: InternalStudioBridgeState | null }>(
    '/api/internal-studio/admin/state',
    {
      method: 'GET',
      token,
    },
  );
  return result.state || null;
};

export const clearInternalStudioBridge = async (token: string): Promise<boolean> => {
  const result = await apiRequest<{ success?: boolean }>('/api/internal-studio/admin/clear', {
    method: 'POST',
    token,
  });
  return result.success === true;
};
