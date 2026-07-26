import React, { createContext, useState, useEffect } from 'react';

interface ThemeContextProps {
  isAccessibilityMode: boolean;
  toggleAccessibilityMode: () => void;
  accessibilitySettings: AccessibilitySettings;
  setAccessibilitySettings: (settings: AccessibilitySettings) => void;
}

export const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

interface AccessibilitySettings {
  highContrast: boolean;
  fontSize: string;
  colorScheme: string;
}

const ThemeProvider = ({ children }) => {
  const [isAccessibilityMode, setIsAccessibilityMode] = useState(false);
  const [accessibilitySettings, setAccessibilitySettings] = useState<AccessibilitySettings>({ highContrast: false, fontSize: 'medium', colorScheme: 'default' });

  useEffect(() => {
    const savedSettings = localStorage.getItem('accessibilitySettings');
    if (savedSettings) {
      setAccessibilitySettings(JSON.parse(savedSettings));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('accessibilitySettings', JSON.stringify(accessibilitySettings));
  }, [accessibilitySettings]);

  const toggleAccessibilityMode = () => {
    setIsAccessibilityMode(!isAccessibilityMode);
  };

  return (
    <ThemeContext.Provider value={{ isAccessibilityMode, toggleAccessibilityMode, accessibilitySettings, setAccessibilitySettings }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;