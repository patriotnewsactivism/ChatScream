import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSelector, useDispatch } from 'react-redux';
import { apiRequest } from '../services/apiClient';
import { selectChatScrollPosition, setChatScrollPosition } from '../store/chatSlice';

interface SessionData {
  streamId: string;
  playbackPosition: number;
  chatScrollPosition: number;
  timestamp: number;
}

const SESSION_KEY = 'stream_session';
const SESSION_EXPIRY_MINUTES = 30;

const useSessionPersistence = () => {
  const { user, isAuthenticated } = useAuth();
  const dispatch = useDispatch();
  const chatScrollPosition = useSelector(selectChatScrollPosition);
  
  const [hasRecoverableSession, setHasRecoverableSession] = useState(false);
  const [recoveryData, setRecoveryData] = useState<SessionData | null>(null);

  // Check for saved session on mount
  useEffect(() => {
    if (isAuthenticated && user) {
      checkForSavedSession();
    }
  }, [isAuthenticated, user]);

  // Save session to localStorage when stream starts
  const saveSession = async (streamId: string, playbackPosition: number) => {
    if (!user) return;
    
    const sessionData: SessionData = {
      streamId,
      playbackPosition,
      chatScrollPosition,
      timestamp: Date.now(),
    };
    
    try {
      // Save to localStorage
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
      
      // Also save to backend for cross-device support
      await apiRequest('/api/user/session', { 
        method: 'POST', 
        body: sessionData, 
        token: user.token 
      });
    } catch (error) {
      console.error('Failed to save session:', error);
      // Still save to localStorage as fallback
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    }
  };

  // Load saved session on mount
  const checkForSavedSession = async () => {
    if (!user) return;
    
    // First check localStorage
    const savedSession = localStorage.getItem(SESSION_KEY);
    if (savedSession) {
      try {
        const sessionData: SessionData = JSON.parse(savedSession);
        
        // Check if session is still valid (not expired)
        const now = Date.now();
        const expiryTime = sessionData.timestamp + (SESSION_EXPIRY_MINUTES * 60 * 1000);
        
        if (now < expiryTime) {
          const streamExists = await validateStream(sessionData.streamId);
          if (streamExists) {
            setRecoveryData(sessionData);
            setHasRecoverableSession(true);
            return;
          }
        }
      } catch (error) {
        console.error('Failed to parse saved session:', error);
      }
    }
    
    // If no valid session in localStorage, check backend
    try {
      const backendSession: SessionData = await apiRequest('/api/user/session', { 
        method: 'GET', 
        token: user.token 
      });
      
      if (backendSession) {
        const streamExists = await validateStream(backendSession.streamId);
        if (streamExists) {
          setRecoveryData(backendSession);
          setHasRecoverableSession(true);
        }
      }
    } catch (error) {
      console.error('Failed to check for existing session:', error);
    }
  };

  // Validate if stream still exists
  const validateStream = async (streamId: string) => {
    try {
      const response = await apiRequest(`/api/streams/${streamId}`, { method: 'GET' });
      return !!response;
    } catch (error) {
      console.error('Failed to validate stream:', error);
      return false;
    }
  };

  // Clear saved session when stream ends or user explicitly resumes
  const clearSession = () => {
    localStorage.removeItem(SESSION_KEY);
    if (user) {
      apiRequest('/api/user/session', { 
        method: 'DELETE', 
        token: user.token 
      }).catch(error => {
        console.error('Failed to clear session on backend:', error);
      });
    }
    setHasRecoverableSession(false);
    setRecoveryData(null);
  };

  // Handle beforeunload to save current state
  const setupBeforeUnloadHandler = (getCurrentPlaybackPosition: () => number) => {
    const handleBeforeUnload = () => {
      if (recoveryData?.streamId) {
        const currentPlaybackPosition = getCurrentPlaybackPosition();
        saveSession(recoveryData.streamId, currentPlaybackPosition);
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  };

  // Resume from saved session
  const resumeFromSession = () => {
    if (recoveryData) {
      dispatch(setChatScrollPosition(recoveryData.chatScrollPosition));
      clearSession();
      return {
        streamId: recoveryData.streamId,
        playbackPosition: recoveryData.playbackPosition,
      };
    }
    return null;
  };

  return {
    hasRecoverableSession,
    recoveryData,
    saveSession,
    checkForSavedSession,
    clearSession,
    setupBeforeUnloadHandler,
    resumeFromSession,
  };
};

export default useSessionPersistence;