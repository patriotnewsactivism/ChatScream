import React, { useEffect, useState, useCallback } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

// Inject animation keyframes once
if (typeof document !== 'undefined') {
  const styleId = 'pwa-install-anim';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = '@keyframes slideUp{from{transform:translateY(100px);opacity:0}to{transform:translateY(0);opacity:1}}';
    document.head.appendChild(style);
  }
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const PWAInstallPrompt: React.FC = () => {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      // Show banner after a short delay so user has time to see the page
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      if (!dismissed || Date.now() - Number(dismissed) > 7 * 24 * 60 * 60 * 1000) {
        setTimeout(() => setShowBanner(true), 3000);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowBanner(false);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setShowBanner(false);
      }
    } catch (err) {
      console.warn('Install prompt error:', err);
    }
    setInstallPrompt(null);
  }, [installPrompt]);

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('pwa-install-dismissed', String(Date.now()));
  };

  if (isInstalled || !showBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9999]" style={{ animation: 'slideUp 0.4s ease-out' }}>
      <div className="max-w-md mx-auto bg-gradient-to-r from-brand-600 to-brand-700 rounded-2xl shadow-2xl shadow-brand-500/30 border border-brand-400/30 p-4">
        <div className="flex items-start gap-3">
          <div className="bg-white/20 p-2 rounded-xl flex-shrink-0">
            <Smartphone size={24} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white text-sm">Install ChatScream</h3>
            <p className="text-white/80 text-xs mt-0.5 leading-relaxed">
              Add to your home screen for instant access &amp; a full-screen streaming experience.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-white text-brand-700 font-bold text-xs rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Download size={14} /> Install App
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-white/70 hover:text-white text-xs rounded-lg transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-white/50 hover:text-white flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
