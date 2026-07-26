import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { apiRequest } from '../../services/apiClient';

export const MentionSettings: React.FC = () => {
  const { user } = useAuthContext();
  const [muted, setMuted] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPrefs = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const res: any = await apiRequest('/api/preferences', { method: 'GET' });
        setMuted(res.preferences.muteMentions?.disabled ?? false);
      } catch (e) {
        setError('Failed to load preferences');
      } finally {
        setLoading(false);
      }
    };
    fetchPrefs();
  }, [user]);

  const toggleMute = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const newMuted = !muted;
      await apiRequest('/api/preferences', {
        method: 'PATCH',
        body: { muteMentions: { disabled: newMuted } }
      });
      setMuted(newMuted);
    } catch (e) {
      setError('Failed to update preference');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-2">Mention Notifications</h3>
      {error && <p className="text-red-600 mb-2">{error}</p>}
      <label className="flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={!muted}
          onChange={toggleMute}
          disabled={loading}
          className="mr-2"
        />
        <span>{muted ? 'Muted' : 'Enabled'} mention notifications</span>
      </label>
    </div>
  );
};
