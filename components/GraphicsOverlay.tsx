/**
 * GraphicsOverlay â Custom graphics, lower-thirds, scoreboards, and timers.
 *
 * Provides a Switcher-style graphics system with:
 * - Scoreboard (2 teams, score + period/quarter)
 * - Custom lower-third (name + title, fully styled)
 * - Countdown/count-up timer
 * - Custom image overlays (PNG/WebP with transparency)
 *
 * All overlays export as canvas-drawable data consumed by CanvasCompositor.
 */
import React, { useState, useCallback } from 'react';
import {
  Trophy,
  Timer,
  Type,
  Image as ImageIcon,
  Plus,
  Minus,
  Eye,
  EyeOff,
  RotateCcw,
  Trash2,
} from 'lucide-react';

// ââ Types ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export interface Scoreboard {
  visible: boolean;
  team1: { name: string; score: number; color: string };
  team2: { name: string; score: number; color: string };
  period: string; // "Q1", "Half", "OT", etc.
  clock: string;  // Manual or auto
}

export interface OverlayTimer {
  visible: boolean;
  mode: 'countdown' | 'countup';
  seconds: number;
  running: boolean;
  label: string;
}

export interface CustomLowerThird {
  visible: boolean;
  name: string;
  title: string;
  bgColor: string;
  accentColor: string;
}

export interface CustomImage {
  id: string;
  visible: boolean;
  url: string;
  name: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  scale: number; // 0.1 to 1
}

export interface GraphicsState {
  scoreboard: Scoreboard;
  timer: OverlayTimer;
  lowerThird: CustomLowerThird;
  images: CustomImage[];
}

interface GraphicsOverlayProps {
  state: GraphicsState;
  onChange: (state: GraphicsState) => void;
  compact?: boolean;
}

// ââ Default state ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export const defaultGraphicsState: GraphicsState = {
  scoreboard: {
    visible: false,
    team1: { name: 'HOME', score: 0, color: '#dc2626' },
    team2: { name: 'AWAY', score: 0, color: '#2563eb' },
    period: 'Q1',
    clock: '12:00',
  },
  timer: {
    visible: false,
    mode: 'countdown',
    seconds: 300,
    running: false,
    label: 'Starting Soon',
  },
  lowerThird: {
    visible: false,
    name: '',
    title: '',
    bgColor: '#1e293b',
    accentColor: '#f97316',
  },
  images: [],
};

// ââ Component ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const GraphicsOverlay: React.FC<GraphicsOverlayProps> = ({ state, onChange, compact }) => {
  const [activeSection, setActiveSection] = useState<'scoreboard' | 'timer' | 'l3' | 'images'>('scoreboard');

  const update = useCallback(
    (patch: Partial<GraphicsState>) => onChange({ ...state, ...patch }),
    [state, onChange],
  );

  const updateScore = (team: 'team1' | 'team2', delta: number) => {
    const sb = { ...state.scoreboard };
    sb[team] = { ...sb[team], score: Math.max(0, sb[team].score + delta) };
    update({ scoreboard: sb });
  };

  // Section buttons
  const sections: { key: typeof activeSection; icon: React.ReactNode; label: string }[] = [
    { key: 'scoreboard', icon: <Trophy size={16} />, label: 'Score' },
    { key: 'timer', icon: <Timer size={16} />, label: 'Timer' },
    { key: 'l3', icon: <Type size={16} />, label: 'L3' },
    { key: 'images', icon: <ImageIcon size={16} />, label: 'Images' },
  ];

  const inputClass = 'w-full bg-dark-950 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white';
  const btnSm = 'p-1.5 rounded-lg border border-gray-700 hover:bg-gray-700 transition-colors';

  return (
    <div className="space-y-3">
      {/* Section tabs */}
      <div className="flex gap-1 bg-dark-800 rounded-lg p-1">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`flex items-center gap-1.5 flex-1 justify-center py-1.5 px-2 rounded-md text-xs font-medium transition-colors ${
              activeSection === s.key ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {s.icon}
            {!compact && s.label}
          </button>
        ))}
      </div>

      {/* Scoreboard */}
      {activeSection === 'scoreboard' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase">Scoreboard</span>
            <button
              onClick={() => update({ scoreboard: { ...state.scoreboard, visible: !state.scoreboard.visible } })}
              className={`${btnSm} ${state.scoreboard.visible ? 'text-green-400' : 'text-gray-500'}`}
            >
              {state.scoreboard.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>

          {['team1', 'team2'].map((t) => {
            const team = state.scoreboard[t as 'team1' | 'team2'];
            return (
              <div key={t} className="flex items-center gap-2">
                <input
                  type="color"
                  value={team.color}
                  onChange={(e) =>
                    update({
                      scoreboard: {
                        ...state.scoreboard,
                        [t]: { ...team, color: e.target.value },
                      },
                    })
                  }
                  className="w-8 h-8 rounded border-0 cursor-pointer"
                />
                <input
                  className={`${inputClass} flex-1`}
                  value={team.name}
                  onChange={(e) =>
                    update({
                      scoreboard: {
                        ...state.scoreboard,
                        [t]: { ...team, name: e.target.value },
                      },
                    })
                  }
                  placeholder="Team name"
                />
                <button onClick={() => updateScore(t as 'team1' | 'team2', -1)} className={btnSm}>
                  <Minus size={14} />
                </button>
                <span className="text-xl font-black w-8 text-center">{team.score}</span>
                <button onClick={() => updateScore(t as 'team1' | 'team2', 1)} className={btnSm}>
                  <Plus size={14} />
                </button>
              </div>
            );
          })}

          <div className="flex gap-2">
            <input
              className={`${inputClass} w-20`}
              value={state.scoreboard.period}
              onChange={(e) =>
                update({ scoreboard: { ...state.scoreboard, period: e.target.value } })
              }
              placeholder="Period"
            />
            <input
              className={inputClass}
              value={state.scoreboard.clock}
              onChange={(e) =>
                update({ scoreboard: { ...state.scoreboard, clock: e.target.value } })
              }
              placeholder="Clock"
            />
            <button
              onClick={() => {
                const sb = state.scoreboard;
                update({
                  scoreboard: {
                    ...sb,
                    team1: { ...sb.team1, score: 0 },
                    team2: { ...sb.team2, score: 0 },
                    period: 'Q1',
                    clock: '12:00',
                  },
                });
              }}
              className={btnSm}
              title="Reset scores"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Timer */}
      {activeSection === 'timer' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase">Timer</span>
            <button
              onClick={() => update({ timer: { ...state.timer, visible: !state.timer.visible } })}
              className={`${btnSm} ${state.timer.visible ? 'text-green-400' : 'text-gray-500'}`}
            >
              {state.timer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>

          <input
            className={inputClass}
            value={state.timer.label}
            onChange={(e) => update({ timer: { ...state.timer, label: e.target.value } })}
            placeholder="Timer label"
          />

          <div className="flex items-center gap-2">
            <select
              className={inputClass}
              value={state.timer.mode}
              onChange={(e) =>
                update({ timer: { ...state.timer, mode: e.target.value as 'countdown' | 'countup' } })
              }
            >
              <option value="countdown">Countdown</option>
              <option value="countup">Count Up</option>
            </select>
            <input
              type="number"
              className={`${inputClass} w-24`}
              value={state.timer.seconds}
              min={0}
              onChange={(e) =>
                update({ timer: { ...state.timer, seconds: Math.max(0, +e.target.value) } })
              }
              placeholder="Seconds"
            />
          </div>

          <button
            onClick={() => update({ timer: { ...state.timer, running: !state.timer.running } })}
            className={`w-full py-2 rounded-lg font-bold text-sm ${
              state.timer.running
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-green-600 hover:bg-green-500'
            } text-white`}
          >
            {state.timer.running ? 'Stop' : 'Start'}
          </button>
        </div>
      )}

      {/* Lower Third */}
      {activeSection === 'l3' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase">Lower Third</span>
            <button
              onClick={() =>
                update({ lowerThird: { ...state.lowerThird, visible: !state.lowerThird.visible } })
              }
              className={`${btnSm} ${state.lowerThird.visible ? 'text-green-400' : 'text-gray-500'}`}
            >
              {state.lowerThird.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>

          <input
            className={inputClass}
            value={state.lowerThird.name}
            onChange={(e) =>
              update({ lowerThird: { ...state.lowerThird, name: e.target.value } })
            }
            placeholder="Name"
          />
          <input
            className={inputClass}
            value={state.lowerThird.title}
            onChange={(e) =>
              update({ lowerThird: { ...state.lowerThird, title: e.target.value } })
            }
            placeholder="Title"
          />
          <div className="flex gap-2">
            <label className="flex items-center gap-2 text-xs text-gray-400">
              BG
              <input
                type="color"
                value={state.lowerThird.bgColor}
                onChange={(e) =>
                  update({ lowerThird: { ...state.lowerThird, bgColor: e.target.value } })
                }
                className="w-8 h-6 rounded border-0 cursor-pointer"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-400">
              Accent
              <input
                type="color"
                value={state.lowerThird.accentColor}
                onChange={(e) =>
                  update({ lowerThird: { ...state.lowerThird, accentColor: e.target.value } })
                }
                className="w-8 h-6 rounded border-0 cursor-pointer"
              />
            </label>
          </div>
        </div>
      )}

      {/* Image overlays */}
      {activeSection === 'images' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase">Image Overlays</span>
            <label className={`${btnSm} cursor-pointer text-brand-400`}>
              <Plus size={14} />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const url = URL.createObjectURL(file);
                  update({
                    images: [
                      ...state.images,
                      {
                        id: crypto.randomUUID(),
                        visible: true,
                        url,
                        name: file.name,
                        position: 'top-right',
                        scale: 0.2,
                      },
                    ],
                  });
                }}
              />
            </label>
          </div>

          {state.images.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-4">
              Add PNG or WebP overlays (logos, bugs, graphics)
            </p>
          )}

          {state.images.map((img) => (
            <div key={img.id} className="flex items-center gap-2 bg-dark-800 p-2 rounded-lg">
              <img src={img.url} alt={img.name} className="w-10 h-10 object-contain rounded" />
              <span className="text-xs text-white flex-1 truncate">{img.name}</span>
              <select
                className="bg-dark-950 border border-gray-700 rounded text-xs py-1 px-1 text-white"
                value={img.position}
                onChange={(e) =>
                  update({
                    images: state.images.map((i) =>
                      i.id === img.id ? { ...i, position: e.target.value as any } : i,
                    ),
                  })
                }
              >
                <option value="top-left">â TL</option>
                <option value="top-right">â TR</option>
                <option value="bottom-left">â BL</option>
                <option value="bottom-right">â BR</option>
                <option value="center">â CTR</option>
              </select>
              <button
                onClick={() =>
                  update({
                    images: state.images.map((i) =>
                      i.id === img.id ? { ...i, visible: !i.visible } : i,
                    ),
                  })
                }
                className={`${btnSm} ${img.visible ? 'text-green-400' : 'text-gray-500'}`}
              >
                {img.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
              <button
                onClick={() =>
                  update({ images: state.images.filter((i) => i.id !== img.id) })
                }
                className={`${btnSm} text-red-400`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GraphicsOverlay;
