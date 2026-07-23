import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSelector, useDispatch } from 'react-redux';
import { apiRequest } from '../services/apiClient';
import { selectChatScrollPosition, setChatScrollPosition } from '../store/chatSlice';

interface SessionData {
  streamId: string;
  playbackPosition: number;
  chatScrollPosition: number;
}

const useSessionPersistence = () => {
  const { user, isAuthenticated } = useAuth();
  const dispatch = useDispatch();
  const chatScrollPosition = useSelector(selectChatScrollPosition);

  useEffect(() => {
    if (isAuthenticated && user) {
      checkForExistingSession();
    }
  }, [isAuthenticated, user]);

  const saveSession = async (streamId: string, playbackPosition: number) => {
    if (!user) return;
    const sessionData: SessionData = {
      streamId,
      playbackPosition,
      chatScrollPosition,
    };
    try {
      await apiRequest('/api/user/session', { method: 'POST', body: sessionData, token: user.token });
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  };

  const checkForExistingSession = async () => {
    if (!user) return;
    try {
      const sessionData: SessionData = await apiRequest('/api/user/session', { method: 'GET', token: user.token });
      if (sessionData) {
        const { streamId, playbackPosition, chatScrollPosition } = sessionData;
        const streamExists = await validateStream(streamId);
        if (streamExists) {
          dispatch(setChatScrollPosition(chatScrollPosition));
          promptUserToResume(streamId, playbackPosition);
        }
      }
    } catch (error) {
      console.error('Failed to check for existing session:', error);
    }
  };

  const validateStream = async (streamId: string) => {
    try {
      const response = await apiRequest(`/api/streams/${streamId}`, { method: 'GET' });
      return response.exists;
    } catch (error) {
      console.error('Failed to validate stream:', error);
      return false;
    }
  };

  const promptUserToResume = (streamId: string, playbackPosition: number) => {
    // Implement UI logic to prompt user to resume watching
  };

  return { saveSession };
};

export default useSessionPersistence;