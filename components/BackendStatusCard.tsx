import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy } from 'lucide-react';

type EndpointStatus = {
  name: string;
  path: string;
  ok: boolean;
  status?: number;
  detail?: string;
};

const testEndpoint = async (name: string, path: string): Promise<EndpointStatus> => {
  try {
    const res = await fetch(path, { method: 'GET' });
    const ok = res.status !== 404;
    return {
      name,
      path,
      ok,
      status: res.status,
      detail: ok ? 'Reachable' : 'Not deployed (404)',
    };
  } catch (err: any) {
    return {
      name,
      path,
      ok: false,
      detail: err?.message || 'Network error',
    };
  }
};

const copy = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // ignore
  }
};

const BackendStatusCard: React.FC = () => {
  const [checking, setChecking] = useState(true);
  const [statuses, setStatuses] = useState<EndpointStatus[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setChecking(true);
      const results = await Promise.all([
        testEndpoint('Leaderboard', '/api/leaderboard'),
        testEndpoint('Access Sync', '/api/access/sync'),
        testEndpoint('OAuth Exchange', '/api/oauth/exchange'),
      ]);
      if (!mounted) return;
      setStatuses(results);
      setChecking(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const missingFunctions = useMemo(
    () => statuses.some((s) => !s.ok && s.status === 404),
    [statuses],
  );

  const deployCommands = useMemo(() => {
    return [
      '# Example container deployment',
      'docker build -t chatscream-api .',
      'fly deploy',
    ].join('\n');
  }, []);

  return (
    <div className="p-5 border border-gray-800 rounded-xl bg-dark-800/70 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Backend Status</h2>
          <p className="text-sm text-gray-400">
            Shows whether required backend API endpoints are live.
          </p>
        </div>
        {missingFunctions ? (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs font-semibold">
            <AlertTriangle size={14} /> Endpoints missing
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs font-semibold">
            <CheckCircle2 size={14} /> OK
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {(checking ? [] : statuses).map((s) => (
          <div key={s.path} className="p-3 rounded-lg bg-dark-900 border border-gray-700">
            <div className="text-sm font-semibold">{s.name}</div>
            <div className="text-xs text-gray-500">{s.path}</div>
            <div className={`mt-2 text-xs ${s.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
              {s.detail}
              {s.status ? ` (${s.status})` : ''}
            </div>
          </div>
        ))}
        {checking && (
          <div className="p-3 rounded-lg bg-dark-900 border border-gray-700 text-sm text-gray-300">
            Checking…
          </div>
        )}
      </div>

      {missingFunctions && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
          <div className="text-sm text-amber-100 font-semibold">
            Deploy backend APIs to enable Dashboard/Admin + OAuth exchange
          </div>
          <pre className="text-xs text-gray-200 bg-black/30 border border-gray-700 rounded-lg p-3 overflow-x-auto whitespace-pre">
            {deployCommands}
          </pre>
          <button
            onClick={() => copy(deployCommands)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:border-brand-500 text-sm font-semibold"
          >
            <Copy size={16} /> Copy commands
          </button>
        </div>
      )}
    </div>
  );
};

export default BackendStatusCard;
