/**
 * StreamScheduler â Schedule future streams with notifications.
 *
 * Mobile-friendly scheduling UI. Set date/time, title, and platform.
 * Uses browser notifications to remind when it's time to go live.
 */

import { useState, useEffect } from 'react';
import { Calendar, Clock, Bell, Trash2, Play, Plus, X } from 'lucide-react';

export interface ScheduledStream {
  id: string;
  title: string;
  scheduledAt: Date;
  platforms: string[];
  notifyBefore: number; // minutes
  status: 'upcoming' | 'live' | 'completed';
}

interface StreamSchedulerProps {
  onGoLive: () => void;
  compact?: boolean;
}

const StreamScheduler = ({ onGoLive, compact = false }: StreamSchedulerProps) => {
  const [streams, setStreams] = useState<ScheduledStream[]>(() => {
    try {
      const saved = localStorage.getItem('chatscream_scheduled_streams');
      if (saved) {
        return JSON.parse(saved).map((s: any) => ({ ...s, scheduledAt: new Date(s.scheduledAt) }));
      }
    } catch {}
    return [];
  });
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notifyBefore, setNotifyBefore] = useState(5);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('chatscream_scheduled_streams', JSON.stringify(streams));
  }, [streams]);

  // Check for upcoming streams and send notifications
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      streams.forEach((stream) => {
        if (stream.status !== 'upcoming') return;
        const diff = stream.scheduledAt.getTime() - now.getTime();
        const minutesUntil = diff / 60000;

        // Notify when it's time
        if (minutesUntil <= stream.notifyBefore && minutesUntil > stream.notifyBefore - 1) {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('ð´ Stream Reminder', {
              body: `"${stream.title}" starts in ${Math.round(minutesUntil)} minutes!`,
              icon: '/favicon.ico',
            });
          }
        }

        // Auto-mark as completed if past
        if (diff < -3600000) {
          setStreams((prev) =>
            prev.map((s) =>
              s.id === stream.id ? { ...s, status: 'completed' as const } : s,
            ),
          );
        }
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [streams]);

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  const addStream = () => {
    if (!title.trim() || !date || !time) return;

    const scheduledAt = new Date(`${date}T${time}`);
    if (scheduledAt <= new Date()) return;

    const newStream: ScheduledStream = {
      id: `sched-${Date.now()}`,
      title: title.trim(),
      scheduledAt,
      platforms: [],
      notifyBefore,
      status: 'upcoming',
    };

    setStreams((prev) => [...prev, newStream].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()));
    setTitle('');
    setDate('');
    setTime('');
    setShowForm(false);
    requestNotificationPermission();
  };

  const removeStream = (id: string) => {
    setStreams((prev) => prev.filter((s) => s.id !== id));
  };

  const upcomingStreams = streams.filter((s) => s.status === 'upcoming' && s.scheduledAt > new Date());
  const nextStream = upcomingStreams[0];

  const formatRelativeTime = (date: Date): string => {
    const diff = date.getTime() - new Date().getTime();
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (hours > 24) return `in ${Math.floor(hours / 24)}d`;
    if (hours > 0) return `in ${hours}h ${minutes}m`;
    if (minutes > 0) return `in ${minutes}m`;
    return 'now!';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-brand-400" />
          <h3 className="text-sm font-bold text-gray-200">Schedule</h3>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="p-1.5 rounded-lg bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 transition-colors"
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
        </button>
      </div>

      {/* Next stream alert */}
      {nextStream && (
        <div className="bg-brand-500/10 border border-brand-500/30 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-brand-300">{nextStream.title}</p>
              <p className="text-[10px] text-brand-400/70 mt-0.5">
                {nextStream.scheduledAt.toLocaleDateString()} at {nextStream.scheduledAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {' Â· '}{formatRelativeTime(nextStream.scheduledAt)}
              </p>
            </div>
            <button
              onClick={onGoLive}
              className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-bold hover:bg-brand-400 transition-colors"
            >
              <Play size={12} className="inline mr-1" />
              Go Live
            </button>
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="bg-dark-950 border border-gray-700 rounded-lg p-3 space-y-2">
          <input
            type="text"
            placeholder="Stream title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="flex-1 bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <Bell size={12} className="text-gray-500" />
            <select
              value={notifyBefore}
              onChange={(e) => setNotifyBefore(Number(e.target.value))}
              className="bg-dark-900 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white"
            >
              <option value={5}>5 min before</option>
              <option value={15}>15 min before</option>
              <option value={30}>30 min before</option>
              <option value={60}>1 hour before</option>
            </select>
          </div>
          <button
            onClick={addStream}
            disabled={!title.trim() || !date || !time}
            className="w-full py-2 rounded-lg bg-brand-500 text-white text-xs font-semibold disabled:opacity-40 hover:bg-brand-400 transition-colors"
          >
            Schedule Stream
          </button>
        </div>
      )}

      {/* Upcoming list */}
      {upcomingStreams.length > 0 && (
        <div className="space-y-1">
          {upcomingStreams.slice(nextStream ? 1 : 0).map((stream) => (
            <div
              key={stream.id}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-dark-900 border border-gray-800 group"
            >
              <Clock size={11} className="text-gray-500 shrink-0" />
              <span className="text-[11px] text-gray-300 truncate flex-1">{stream.title}</span>
              <span className="text-[10px] text-gray-500 shrink-0">{formatRelativeTime(stream.scheduledAt)}</span>
              <button
                onClick={() => removeStream(stream.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-500 hover:text-red-400 transition-all"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StreamScheduler;
