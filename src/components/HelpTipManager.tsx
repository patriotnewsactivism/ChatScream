import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface HelpTip {
  id: string;
  message: string;
  target: string;
}

interface HelpTipManagerContextType {
  showTip: (tip: HelpTip) => void;
  dismissTip: (id: string) => void;
  tips: HelpTip[];
}

const HelpTipManagerContext = createContext<HelpTipManagerContextType | undefined>(undefined);

interface HelpTipManagerProviderProps {
  children: ReactNode;
}

const HelpTipManagerProvider: React.FC<HelpTipManagerProviderProps> = ({ children }) => {
  const [tips, setTips] = useState<HelpTip[]>([]);

  useEffect(() => {
    const storedTips = localStorage.getItem('dismissedTips');
    if (storedTips) {
      setTips(JSON.parse(storedTips));
    }
  }, []);

  const showTip = (tip: HelpTip) => {
    setTips((prevTips) => [...prevTips, tip]);
  };

  const dismissTip = (id: string) => {
    setTips((prevTips) => prevTips.filter((tip) => tip.id !== id));
    localStorage.setItem('dismissedTips', JSON.stringify(tips.filter((tip) => tip.id !== id)));
  };

  return (
    <HelpTipManagerContext.Provider value={{ showTip, dismissTip, tips }}>
      {children}
    </HelpTipManagerContext.Provider>
  );
};

export const useHelpTipManager = () => {
  const context = useContext(HelpTipManagerContext);
  if (!context) {
    throw new Error('useHelpTipManager must be used within a HelpTipManagerProvider');
  }
  return context;
};

export default HelpTipManagerProvider;