import React, { createContext, useState, useEffect, ReactNode } from 'react';

interface ThemeContextProps {
  fontSize: number;
  highContrast: boolean;
  toggleHighContrast: () => void;
  setFontSize: (size: number) => void;
}

export const ThemeContext = createContext<ThemeContextProps>({} as ThemeContextProps);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [fontSize, setFontSize] = useState<number>(parseInt(localStorage.getItem('fontSize') || '16', 10));
  const [highContrast, setHighContrast] = useState<boolean>(localStorage.getItem('highContrast') === 'true');

  useEffect(() => {
    localStorage.setItem('fontSize', fontSize.toString());
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('highContrast', highContrast.toString());
  }, [highContrast]);

  const toggleHighContrast = () => {
    setHighContrast(!highContrast);
  };

  return (
    <ThemeContext.Provider value={{ fontSize, highContrast, toggleHighContrast, setFontSize }}>
      {children}
    </ThemeContext.Provider>
  );
};
