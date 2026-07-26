import React, { createContext, useContext, useState, useCallback } from 'react';
import { OnlineStatus } from '../types';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  onlineStatus?: OnlineStatus;
  accessibilitySettings?: any;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  syncAccessibilitySettingsToProfile: (settings: any) => void;
  updateOnlineStatus?: (status: OnlineStatus) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);

  const login = async (email: string, password: string) => {
    // existing login logic
  };

  const logout = () => {
    // existing logout logic
  };

  const syncAccessibilitySettingsToProfile = useCallback((settings: any) => {
    if (!user) return;
    setUser((prev) => prev ? { ...prev, accessibilitySettings: settings } : prev);
  }, [user]);

  const updateOnlineStatus = useCallback((status: OnlineStatus) => {
    if (!user) return;
    setUser((prev) => prev ? { ...prev, onlineStatus: status } : prev);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, login, logout, syncAccessibilitySettingsToProfile, updateOnlineStatus }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}