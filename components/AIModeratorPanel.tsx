import React, { useState } from 'react';
import { Bot, Save, ShieldCheck, Sparkles } from 'lucide-react';
import type {
  AIModeratorConfig,
  AIModeratorUsage,
} from '../services/aiModeratorService';

interface AIModeratorPanelProps {
  config: AIModeratorConfig;
  usage?: AIModeratorUsage | null;
  available: boolean;
  saving?: boolean;
  onChange: (next: AIModeratorConfig) => void;
  onSave: () => void;
}

const AIModeratorPanel: React.FC<AIModeratorPanelProps> = ({
  config,
  usage,
  available,
  saving = false,
  onChange,
  onSave,
}) => {
  const [advanced, setAdvanced] = useState(false);
  const patch = (next: Partial<AIModeratorConfig>) => onChange({ ...config, ...next });
  const usedPct = usage?.limit ? Math.min(100, (usage.decisions / usage.limit) * 100) : 0;

  return (
    <div className="rounded-xl border border-indigo-500/25 bg-indigo-950/20 p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300">
            <Bot size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white">AI Co-Host</div>
            <div className="text-[10px] text-gray-400 truncate">
              Moderates, answers viewers and keeps chat moving.
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-[10px] text-gray-300 shrink-0">
          <span>{config.enabled ? 'ON' : 'OFF'}</span>
          <input
            type="checkbox"
            checked={config.enabled}
            disabled={!available}
            onChange={(event) => patch({ enabled: event.target.checked })}
            className="accent-indigo-500"
          />
        </label>
      </div>

      {!available && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          AI Co-Host is available on paid plans.
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        {(['suggest', 'assist', 'autopilot'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={!available}
            onClick={() => patch({ mode })}
            className={`rounded-lg border px-2 py-2 text-[10px] font-semibold capitalize transition-colors ${
              config.mode === mode
                ? 'border-indigo-400 bg-indigo-500/20 text-indigo-200'
                : 'border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="text-[10px] text-gray-400 leading-relaxed">
        {config.mode === 'suggest' && 'Suggests replies only; nothing is posted automatically.'}
        {config.mode === 'assist' && 'Answers strong questions automatically, but stays conservative.'}
        {config.mode === 'autopilot' && 'Actively answers and engages within your rate limits.'}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-[10px] text-gray-300">
          <input
            type="checkbox"
            checked={config.autoReplyQuestions}
            onChange={(event) => patch({ autoReplyQuestions: event.target.checked })}
            className="accent-indigo-500"
          />
          Answer questions
        </label>
        <label className="flex items-center gap-2 text-[10px] text-gray-300">
          <input
            type="checkbox"
            checked={config.engageQuietChat}
            onChange={(event) => patch({ engageQuietChat: event.target.checked })}
            className="accent-indigo-500"
          />
          Wake quiet chat
        </label>
        <label className="flex items-center gap-2 text-[10px] text-gray-300">
          <input
            type="checkbox"
            checked={config.publicReplies}
            onChange={(event) => patch({ publicReplies: event.target.checked })}
            className="accent-indigo-500"
          />
          Post to platforms
        </label>
        <label className="flex items-center gap-2 text-[10px] text-gray-300">
          <input
            type="checkbox"
            checked={config.respondToMentions}
            onChange={(event) => patch({ respondToMentions: event.target.checked })}
            className="accent-indigo-500"
          />
          Respond to mentions
        </label>
      </div>

      <button
        type="button"
        onClick={() => setAdvanced((value) => !value)}
        className="text-[10px] font-semibold text-indigo-300 hover:text-indigo-200"
      >
        {advanced ? 'Hide advanced controls' : 'Advanced controls'}
      </button>

      {advanced && (
        <div className="space-y-3 border-t border-gray-800 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-gray-400">
              Tone
              <select
                value={config.tone}
                onChange={(event) => patch({ tone: event.target.value as AIModeratorConfig['tone'] })}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-dark-950 px-2 py-1.5 text-[11px] text-white"
              >
                <option value="friendly">Friendly</option>
                <option value="witty">Witty</option>
                <option value="professional">Professional</option>
                <option value="energetic">Energetic</option>
                <option value="calm">Calm</option>
              </select>
            </label>
            <label className="text-[10px] text-gray-400">
              Knowledge scope
              <select
                value={config.answerScope}
                onChange={(event) =>
                  patch({ answerScope: event.target.value as AIModeratorConfig['answerScope'] })
                }
                className="mt-1 w-full rounded-lg border border-gray-700 bg-dark-950 px-2 py-1.5 text-[11px] text-white"
              >
                <option value="stream-and-stable-general">Show + general</option>
                <option value="stream-only">Show context only</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-gray-400">
              Reply cooldown
              <select
                value={config.cooldownSeconds}
                onChange={(event) => patch({ cooldownSeconds: Number(event.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-dark-950 px-2 py-1.5 text-[11px] text-white"
              >
                <option value={10}>10 sec</option>
                <option value={20}>20 sec</option>
                <option value={30}>30 sec</option>
                <option value={60}>60 sec</option>
              </select>
            </label>
            <label className="text-[10px] text-gray-400">
              Max replies/min
              <select
                value={config.maxRepliesPerMinute}
                onChange={(event) => patch({ maxRepliesPerMinute: Number(event.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-dark-950 px-2 py-1.5 text-[11px] text-white"
              >
                {[1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-[10px] text-gray-400">
            Pinned show facts / FAQ
            <textarea
              value={config.knowledgeBase}
              onChange={(event) => patch({ knowledgeBase: event.target.value })}
              rows={4}
              placeholder="Facts, links, names, recurring answers, sponsor details, show rules…"
              className="mt-1 w-full resize-y rounded-lg border border-gray-700 bg-dark-950 px-2 py-2 text-[11px] text-white placeholder-gray-600"
            />
          </label>

          <label className="block text-[10px] text-gray-400">
            Instructions to your AI co-host
            <textarea
              value={config.hostInstructions}
              onChange={(event) => patch({ hostInstructions: event.target.value })}
              rows={3}
              placeholder="Example: Be direct. Never speak for me on legal conclusions. Encourage questions about the evidence."
              className="mt-1 w-full resize-y rounded-lg border border-gray-700 bg-dark-950 px-2 py-2 text-[11px] text-white placeholder-gray-600"
            />
          </label>
        </div>
      )}

      {usage && usage.limit > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-[9px] text-gray-500">
            <span>{usage.decisions.toLocaleString()} AI decisions used</span>
            <span>{usage.remaining.toLocaleString()} remaining</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
            <div className="h-full bg-indigo-500" style={{ width: `${usedPct}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 text-[9px] text-gray-500 flex-1">
          <ShieldCheck size={11} />
          Rate-limited · creator controlled · grounded replies
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={!available || saving}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
        >
          {saving ? <Sparkles size={12} className="animate-pulse" /> : <Save size={12} />}
          Save
        </button>
      </div>
    </div>
  );
};

export default AIModeratorPanel;
