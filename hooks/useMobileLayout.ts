import { useEffect, useState } from 'react';

export type MobilePanel = 'none' | 'media' | 'graphics' | 'destinations' | 'mixer';

export const useMobileLayout = () => {
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('none');
  const [isLandscape, setIsLandscape] = useState(false);
  const [isCompactLandscape, setIsCompactLandscape] = useState(false);
  const [mobileTip, setMobileTip] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => {
      const landscapeViewport = window.innerWidth > window.innerHeight && window.innerWidth < 1024;
      setIsLandscape(landscapeViewport);
      setIsCompactLandscape(landscapeViewport && window.innerHeight < 500);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!mobileTip) return;
    const timeoutId = window.setTimeout(() => setMobileTip(null), 6500);
    return () => window.clearTimeout(timeoutId);
  }, [mobileTip]);

  return {
    mobilePanel,
    setMobilePanel,
    isLandscape,
    isCompactLandscape,
    mobileTip,
    setMobileTip,
  };
};
