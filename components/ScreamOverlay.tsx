/**
 * ScreamOverlay â HTML/CSS-based scream donation animation overlay.
 *
 * Replaces the old canvas-based scream rendering with performant CSS keyframe
 * animations. Uses the ScreamTier config from stripe.ts for visual properties.
 *
 * Renders as an absolutely-positioned overlay on top of the stream canvas.
 */
import { FC, useEffect, useRef, useState, useCallback } from 'react';
import { ScreamAlert } from '../services/chatScreamer';
import { ScreamTier } from '../services/stripe';

interface ScreamOverlayProps {
  alert: ScreamAlert | null;
  onDismiss?: () => void;
  /** Show a demo alert (for testing in studio without going live) */
  demoTier?: ScreamTier | null;
}

const ANIMATION_MAP: Record<string, 'slide' | 'shake' | 'explode'> = {
  fade: 'slide',
  bounce: 'slide',
  shake: 'shake',
  explode: 'explode',
};

const ScreamOverlay: FC<ScreamOverlayProps> = ({ alert, onDismiss, demoTier }) => {
  const [visibleAlert, setVisibleAlert] = useState<ScreamAlert | null>(null);
  const [activeTier, setActiveTier] = useState<ScreamTier | null>(null);
  const [particles, setParticles] = useState<number[]>([]);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setVisibleAlert(null);
    setActiveTier(null);
    setParticles([]);
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }
    onDismiss?.();
  }, [onDismiss]);

  useEffect(() => {
    const activeAlert = alert || (demoTier ? {
      id: 'demo',
      donorName: 'ChatScreamer',
      message: 'This is a demo scream!',
      amount: demoTier.minAmount,
      tier: demoTier,
      timestamp: new Date(),
      streamerId: 'demo',
      processed: false,
    } as ScreamAlert : null);

    if (!activeAlert) return;

    setVisibleAlert(activeAlert);
    const tier = activeAlert.tier || demoTier;
    setActiveTier(tier);

    if (!tier) return;

    const animType = ANIMATION_MAP[tier.effects.animation] || 'slide';
    const durationMs = tier.effects.duration * 1000;

    // Generate particles for explode animation
    if (animType === 'explode') {
      setParticles(Array.from({ length: 20 }, (_, i) => i));
    }

    // Text-to-speech for tiers that have it enabled
    if (tier.effects.tts && typeof speechSynthesis !== 'undefined') {
      try {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(
          `${activeAlert.donorName} sent a ${tier.label}! ${activeAlert.message || ''}`
        );
        utterance.rate = 1.1;
        utterance.pitch = animType === 'explode' ? 1.3 : 1.0;
        utterance.volume = tier.effects.volume / 100;
        speechSynthesis.speak(utterance);
      } catch {
        // TTS not available
      }
    }

    // Auto-dismiss after duration
    dismissTimerRef.current = setTimeout(dismiss, durationMs);

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [alert, demoTier, dismiss]);

  if (!visibleAlert || !activeTier) return null;

  const tier = activeTier;
  const animType = ANIMATION_MAP[tier.effects.animation] || 'slide';

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
      {/* Full-screen flash for fullscreen overlay */}
      {tier.effects.overlay === 'fullscreen' && (
        <div
          className="absolute inset-0 scream-flash"
          style={{ backgroundColor: tier.color, opacity: 0 }}
        />
      )}

      {/* Screen shake wrapper for shake/explode */}
      <div
        className={animType === 'slide' ? 'w-full h-full' : 'w-full h-full scream-shake'}
      >
        {/* Main alert card */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 scream-enter"
          style={{
            animationName: animType === 'explode' ? 'scream-explode' : 'scream-enter',
          }}
        >
          <div
            className="flex flex-col items-center gap-3 px-8 py-6 rounded-2xl backdrop-blur-md border-2"
            style={{
              borderColor: tier.color,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              boxShadow: `0 0 40px ${tier.glowColor}, 0 0 80px ${tier.glowColor}`,
            }}
          >
            {/* Tier badge */}
            <div
              className="flex items-center gap-2 px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest"
              style={{
                backgroundColor: tier.color,
                color: '#fff',
              }}
            >
              <span className="text-lg">{tier.emoji}</span>
              {tier.label}
            </div>

            {/* Donor name */}
            <div className="text-2xl font-bold text-white drop-shadow-lg">
              {visibleAlert.donorName}
            </div>

            {/* Amount */}
            <div
              className="text-4xl font-black drop-shadow-lg"
              style={{ color: tier.color }}
            >
              ${visibleAlert.amount.toFixed(2)}
            </div>

            {/* Message */}
            {visibleAlert.message && (
              <div className="max-w-md text-center text-lg text-white/90 px-4">
                "{visibleAlert.message}"
              </div>
            )}

            {/* Progress bar */}
            <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden mt-2">
              <div
                className="h-full rounded-full scream-progress"
                style={{
                  backgroundColor: tier.color,
                  animationDuration: `${tier.effects.duration * 1000}ms`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Particle explosion for explode animation */}
        {animType === 'explode' && particles.map((i) => {
          const angle = (i / particles.length) * Math.PI * 2;
          const distance = 200 + Math.random() * 150;
          const tx = Math.cos(angle) * distance;
          const ty = Math.sin(angle) * distance;
          return (
            <div
              key={i}
              className="absolute top-1/2 left-1/2 scream-particle"
              style={{
                '--tx': `${tx}px`,
                '--ty': `${ty}px`,
                backgroundColor: tier.color,
                width: `${8 + Math.random() * 12}px`,
                height: `${8 + Math.random() * 12}px`,
              } as React.CSSProperties}
            />
          );
        })}
      </div>
    </div>
  );
};

export default ScreamOverlay;
