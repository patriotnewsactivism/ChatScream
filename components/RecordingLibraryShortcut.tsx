import React from 'react';
import { Cloud } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const RecordingLibraryShortcut: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  if (!user || location.pathname === '/recordings') return null;

  return (
    <button
      type="button"
      onClick={() => navigate('/recordings')}
      className="fixed right-4 bottom-20 z-40 inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-dark-900/95 px-4 py-2 text-xs font-bold text-cyan-200 shadow-xl backdrop-blur hover:border-cyan-400 hover:text-white"
      title="Open your cloud recordings library"
    >
      <Cloud size={15} /> Recordings
    </button>
  );
};

export default RecordingLibraryShortcut;
