import React, { useMemo, useState } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const AuthStatusBanner: React.FC = () => {
  const { error, configError, clearError } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  const { message, critical } = useMemo(() => {
    if (configError) {
      return { message: configError, critical: true };
    }
    if (error) {
      return { message: error, critical: false };
    }
    return { message: '', critical: false };
  }, [configError, error]);

  if (!message || (dismissed && !critical)) {
    return null;
  }

  return (
    <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 px-4 py-3 flex items-start gap-3">
      {critical ? <Info size={18} className="mt-0.5" /> : <AlertCircle size={18} className="mt-0.5" />}
      <div className="flex-1 text-sm leading-relaxed">{message}</div>
      {!critical && (
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            clearError();
          }}
          className="text-xs font-semibold text-red-100 hover:text-white"
        >
          Dismiss
        </button>
      )}
    </div>
  );
};

export default AuthStatusBanner;
