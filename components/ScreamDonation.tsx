/**
 * ScreamDonation — Viewer-facing component for sending paid ChatScreams.
 *
 * This opens a Stripe Checkout session in "payment" mode so viewers can
 * donate to trigger an on-stream scream alert for the streamer.
 *
 * Usage: Embed on a streamer's public page or donation overlay URL.
 */
import React, { useState } from 'react';
import { Zap, DollarSign, MessageSquare, Loader2 } from 'lucide-react';
import { buildApiUrl } from '../services/apiClient';

interface ScreamDonationProps {
  streamerUid: string;
  streamerName?: string;
}

const SCREAM_TIERS = [
  { amount: 5, label: 'Scream', emoji: '📢', color: 'from-blue-500 to-cyan-500', description: 'Basic alert' },
  { amount: 10, label: 'Loud Scream', emoji: '🔊', color: 'from-orange-500 to-yellow-500', description: 'Louder + effects' },
  { amount: 25, label: 'Mega Scream', emoji: '🎺', color: 'from-red-500 to-pink-500', description: 'Full screen takeover' },
  { amount: 50, label: 'MAXIMUM SCREAM', emoji: '🔥', color: 'from-red-600 to-orange-500', description: 'Legendary + TTS + screen shake' },
];

const ScreamDonation: React.FC<ScreamDonationProps> = ({ streamerUid, streamerName }) => {
  const [donorName, setDonorName] = useState('');
  const [message, setMessage] = useState('');
  const [selectedAmount, setSelectedAmount] = useState<number>(5);
  const [customAmount, setCustomAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveAmount = customAmount ? Math.max(5, Number(customAmount)) : selectedAmount;

  const handleCheckout = async () => {
    if (effectiveAmount < 5) {
      setError('Minimum amount is $5.00');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(buildApiUrl('/api/scream/checkout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamerUid,
          donorName: donorName.trim() || 'Anonymous',
          message: message.trim(),
          amount: effectiveAmount,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-dark-800 to-dark-900 rounded-2xl border border-gray-800 p-6 max-w-md mx-auto">
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-600/20 border border-red-500/30 rounded-full text-red-400 text-sm font-medium mb-3">
          <Zap size={14} />
          <span>Send a ChatScream</span>
        </div>
        <h3 className="text-xl font-bold text-white">
          {streamerName ? `Scream at ${streamerName}!` : 'Send a ChatScream!'}
        </h3>
        <p className="text-sm text-gray-400 mt-1">
          Your donation triggers an on-stream alert the audience will love.
        </p>
      </div>

      {/* Tier Selection */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {SCREAM_TIERS.map((tier) => (
          <button
            key={tier.amount}
            onClick={() => { setSelectedAmount(tier.amount); setCustomAmount(''); }}
            className={`p-3 rounded-xl border text-left transition-all ${
              !customAmount && selectedAmount === tier.amount
                ? `bg-gradient-to-r ${tier.color} border-transparent text-white shadow-lg`
                : 'bg-dark-900/50 border-gray-700 hover:border-gray-600 text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{tier.emoji}</span>
              <span className="font-bold">${tier.amount}</span>
            </div>
            <div className="text-xs opacity-80">{tier.label}</div>
          </button>
        ))}
      </div>

      {/* Custom Amount */}
      <div className="mb-4">
        <label className="block text-xs text-gray-400 mb-1">Custom Amount</label>
        <div className="relative">
          <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="number"
            min="5"
            max="500"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder="5.00 minimum"
            className="w-full bg-dark-950 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
          />
        </div>
      </div>

      {/* Donor Name */}
      <div className="mb-4">
        <label className="block text-xs text-gray-400 mb-1">Your Name (shown on stream)</label>
        <input
          value={donorName}
          onChange={(e) => setDonorName(e.target.value)}
          placeholder="Anonymous"
          maxLength={50}
          className="w-full bg-dark-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
        />
      </div>

      {/* Message */}
      <div className="mb-5">
        <label className="block text-xs text-gray-400 mb-1">
          <MessageSquare size={12} className="inline mr-1" />
          Message (read aloud on stream)
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          maxLength={300}
          rows={3}
          className="w-full bg-dark-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none resize-none"
        />
        <div className="text-right text-xs text-gray-600 mt-0.5">{message.length}/300</div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Pay Button */}
      <button
        onClick={handleCheckout}
        disabled={isLoading || effectiveAmount < 5}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 font-bold text-white text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-red-600/30"
      >
        {isLoading ? (
          <Loader2 size={20} className="animate-spin" />
        ) : (
          <>
            <Zap size={20} />
            Send ${effectiveAmount.toFixed(2)} ChatScream
          </>
        )}
      </button>

      <p className="text-center text-xs text-gray-600 mt-3">
        Secure payment via Stripe. Counts towards the weekly leaderboard.
      </p>
    </div>
  );
};

export default ScreamDonation;
