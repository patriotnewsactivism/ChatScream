import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  findUsersByEmail,
  getAccessListConfig,
  setAccessListConfig,
  setUserAccessOverrides,
  ensureAffiliateForSignedInUser,
  type AccessListConfig,
  getOAuthPublicConfig,
  setOAuthPublicConfig,
} from '../services/firebase';

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const parseEmailLines = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/\r?\n/)
        .map((line) => normalizeEmail(line))
        .filter(Boolean)
    )
  );

const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [adminsText, setAdminsText] = useState('');
  const [betaText, setBetaText] = useState('');
  const [accessConfig, setAccessConfig] = useState<AccessListConfig | null>(null);

  const [oauthYouTubeClientId, setOauthYouTubeClientId] = useState('');
  const [oauthFacebookAppId, setOauthFacebookAppId] = useState('');
  const [oauthTwitchClientId, setOauthTwitchClientId] = useState('');
  const [oauthRedirectBase, setOauthRedirectBase] = useState('');

  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupStatus, setLookupStatus] = useState<string | null>(null);
  const [lookupResults, setLookupResults] = useState<Array<{ uid: string; email: string; displayName: string; plan: string; affiliateCode: string }>>([]);

  const [myAffiliateCode, setMyAffiliateCode] = useState<string>('');
  const referralLink = useMemo(() => {
    if (!myAffiliateCode) return '';
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    return `${origin}/signup?ref=${encodeURIComponent(myAffiliateCode)}`;
  }, [myAffiliateCode]);

  const isMaster = useMemo(() => {
    const email = user?.email ? normalizeEmail(user.email) : '';
    return email === 'mreardon@wtpnews.org' || userProfile?.role === 'admin';
  }, [user?.email, userProfile?.role]);

  useEffect(() => {
    if (!user) return;
    if (!isMaster) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const config = await getAccessListConfig();
        setAccessConfig(config);
        setAdminsText((config.admins || []).join('\n'));
        setBetaText((config.betaTesters || []).join('\n'));

        const oauthConfig = await getOAuthPublicConfig();
        setOauthYouTubeClientId(oauthConfig.youtubeClientId || '');
        setOauthFacebookAppId(oauthConfig.facebookAppId || '');
        setOauthTwitchClientId(oauthConfig.twitchClientId || '');
        setOauthRedirectBase(oauthConfig.redirectUriBase || '');
      } catch (err: any) {
        setLoadError(err?.message || 'Failed to load admin settings.');
      } finally {
        setLoading(false);
      }
    })();
  }, [user, isMaster]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const code = await ensureAffiliateForSignedInUser();
        setMyAffiliateCode(code || '');
      } catch {
        // ignore
      }
    })();
  }, [user]);

  const handleCopy = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setSaveMessage('Copied.');
      window.setTimeout(() => setSaveMessage(null), 2500);
    } catch {
      setSaveMessage('Copy failed.');
      window.setTimeout(() => setSaveMessage(null), 2500);
    }
  };

  const handleSaveAccessList = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const admins = parseEmailLines(adminsText);
      const betaTesters = parseEmailLines(betaText);
      await setAccessListConfig(admins, betaTesters);
      setAccessConfig({ admins, betaTesters });
      setSaveMessage('Saved access lists.');
    } catch (err: any) {
      setSaveMessage(err?.message || 'Failed to save access lists.');
    } finally {
      setSaving(false);
      window.setTimeout(() => setSaveMessage(null), 4000);
    }
  };

  const handleSaveOAuthIds = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      await setOAuthPublicConfig({
        youtubeClientId: oauthYouTubeClientId,
        facebookAppId: oauthFacebookAppId,
        twitchClientId: oauthTwitchClientId,
        redirectUriBase: oauthRedirectBase,
      });
      setSaveMessage('Saved OAuth client IDs.');
    } catch (err: any) {
      setSaveMessage(err?.message || 'Failed to save OAuth client IDs.');
    } finally {
      setSaving(false);
      window.setTimeout(() => setSaveMessage(null), 4000);
    }
  };

  const handleLookup = async () => {
    const email = normalizeEmail(lookupEmail);
    if (!email) return;
    setLookupStatus('Searching…');
    setLookupResults([]);
    try {
      const users = await findUsersByEmail(email);
      if (!users.length) {
        setLookupStatus('No user found for that email yet.');
        return;
      }
      setLookupStatus(`Found ${users.length} user(s).`);
      setLookupResults(
        users.map((u) => ({
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          plan: u.subscription?.plan || 'free',
          affiliateCode: u.affiliate?.code || '',
        }))
      );
    } catch (err: any) {
      setLookupStatus(err?.message || 'Lookup failed.');
    }
  };

  const handleGrantBeta = async (uid: string) => {
    setLookupStatus('Applying beta access…');
    try {
      await setUserAccessOverrides(uid, { role: 'beta_tester', betaTester: true, plan: 'enterprise', status: 'active' });
      setLookupStatus('Beta access applied.');
    } catch (err: any) {
      setLookupStatus(err?.message || 'Failed to apply beta access.');
    }
  };

  const handleGrantAdmin = async (uid: string) => {
    setLookupStatus('Applying admin access…');
    try {
      await setUserAccessOverrides(uid, { role: 'admin', betaTester: true, plan: 'enterprise', status: 'active' });
      setLookupStatus('Admin access applied.');
    } catch (err: any) {
      setLookupStatus(err?.message || 'Failed to apply admin access.');
    }
  };

  if (!user) return null;

  if (!isMaster) {
    return (
      <div className="min-h-screen bg-dark-900 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-dark-800 border border-gray-800 rounded-2xl p-6">
          <h1 className="text-xl font-bold mb-2">Admin access required</h1>
          <p className="text-gray-400 text-sm mb-4">This page is only available to the master/admin account.</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full px-4 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 font-semibold"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-dark-900 via-dark-900 to-black text-white">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-gray-400">Admin</p>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <ShieldCheck className="text-brand-400" size={22} /> Control Center
            </h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/studio')}
              className="px-4 py-2 rounded-lg bg-dark-800 border border-gray-700 hover:border-brand-500"
            >
              Open Studio
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 rounded-lg bg-dark-800 border border-gray-700 hover:border-brand-500"
            >
              Dashboard
            </button>
          </div>
        </div>

        {loading && (
          <div className="p-5 border border-gray-800 rounded-xl bg-dark-800/70">
            <p className="text-gray-300">Loading admin settings…</p>
          </div>
        )}

        {loadError && (
          <div className="p-5 border border-red-500/30 rounded-xl bg-red-500/10">
            <p className="text-red-300 text-sm">{loadError}</p>
          </div>
        )}

        {!loading && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="p-5 border border-gray-800 rounded-xl bg-dark-800/70 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-purple-300" />
                  <h2 className="font-semibold">OAuth IDs (Public)</h2>
                </div>
                <p className="text-sm text-gray-400">
                  These are safe to store publicly and are required to start the OAuth popup (YouTube/Facebook/Twitch).
                  After saving, retry “Connect” in Studio → Destinations.
                </p>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">YouTube Client ID</label>
                  <input
                    className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                    value={oauthYouTubeClientId}
                    onChange={(e) => setOauthYouTubeClientId(e.target.value)}
                    placeholder="...apps.googleusercontent.com"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">Facebook App ID</label>
                  <input
                    className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                    value={oauthFacebookAppId}
                    onChange={(e) => setOauthFacebookAppId(e.target.value)}
                    placeholder="1234567890"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">Twitch Client ID</label>
                  <input
                    className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                    value={oauthTwitchClientId}
                    onChange={(e) => setOauthTwitchClientId(e.target.value)}
                    placeholder="abcd1234..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">Redirect Base (optional)</label>
                  <input
                    className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                    value={oauthRedirectBase}
                    onChange={(e) => setOauthRedirectBase(e.target.value)}
                    placeholder="https://wtp-apps.web.app/oauth/callback"
                  />
                  <p className="text-[11px] text-gray-500">
                    Leave blank to use this site’s default: {typeof window === 'undefined' ? '' : `${window.location.origin}/oauth/callback`}.
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={handleSaveOAuthIds}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 font-semibold disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : 'Save OAuth IDs'}
                  </button>
                  {saveMessage && <span className="text-sm text-gray-300">{saveMessage}</span>}
                </div>
              </div>

              <div className="p-5 border border-gray-800 rounded-xl bg-dark-800/70 space-y-3">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-brand-300" />
                  <h2 className="font-semibold">Access Lists</h2>
                </div>
                <p className="text-sm text-gray-400">
                  Store master/admin and beta tester email allowlists in Firestore (`config/access`).
                </p>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">Admins (one per line)</label>
                  <textarea
                    className="w-full min-h-[120px] bg-dark-900 border border-gray-700 rounded-lg p-3 text-sm text-white"
                    value={adminsText}
                    onChange={(e) => setAdminsText(e.target.value)}
                    placeholder="mreardon@wtpnews.org"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">Beta Testers (one per line)</label>
                  <textarea
                    className="w-full min-h-[160px] bg-dark-900 border border-gray-700 rounded-lg p-3 text-sm text-white"
                    value={betaText}
                    onChange={(e) => setBetaText(e.target.value)}
                    placeholder="leroytruth247@gmail.com"
                  />
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={handleSaveAccessList}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 font-semibold disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : 'Save Lists'}
                  </button>
                  {saveMessage && <span className="text-sm text-gray-300">{saveMessage}</span>}
                  {accessConfig && (
                    <span className="text-xs text-gray-500">
                      Admins: {accessConfig.admins.length} · Beta: {accessConfig.betaTesters.length}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-5 border border-gray-800 rounded-xl bg-dark-800/70 space-y-3">
                <div className="flex items-center gap-2">
                  <UserPlus size={18} className="text-emerald-300" />
                  <h2 className="font-semibold">Grant Access</h2>
                </div>
                <p className="text-sm text-gray-400">
                  Lookup a user by email and apply beta/admin overrides (plan + role).
                </p>

                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                    value={lookupEmail}
                    onChange={(e) => setLookupEmail(e.target.value)}
                    placeholder="leroytruth247@gmail.com"
                  />
                  <button
                    onClick={handleLookup}
                    className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:border-brand-500 text-sm font-semibold"
                  >
                    Search
                  </button>
                </div>

                {lookupStatus && <div className="text-sm text-gray-300">{lookupStatus}</div>}

                <div className="space-y-2">
                  {lookupResults.map((r) => (
                    <div key={r.uid} className="p-3 rounded-lg border border-gray-700 bg-dark-900 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{r.displayName || 'User'}</div>
                          <div className="text-xs text-gray-400 truncate">{r.email}</div>
                        </div>
                        <div className="text-xs text-gray-400 shrink-0">{r.plan} plan</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleGrantBeta(r.uid)}
                          className="px-3 py-1.5 rounded-md bg-emerald-600/20 border border-emerald-500/30 text-emerald-200 text-xs font-semibold hover:bg-emerald-600/30"
                        >
                          Grant Beta
                        </button>
                        <button
                          onClick={() => handleGrantAdmin(r.uid)}
                          className="px-3 py-1.5 rounded-md bg-brand-600/20 border border-brand-500/30 text-brand-200 text-xs font-semibold hover:bg-brand-600/30"
                        >
                          Grant Admin
                        </button>
                        <button
                          onClick={() => handleCopy(r.uid)}
                          className="px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-gray-200 text-xs font-semibold hover:bg-gray-700"
                        >
                          <span className="inline-flex items-center gap-1"><Copy size={14} /> Copy UID</span>
                        </button>
                        {r.affiliateCode && (
                          <>
                            <button
                              onClick={() => handleCopy(r.affiliateCode)}
                              className="px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-gray-200 text-xs font-semibold hover:bg-gray-700"
                            >
                              <span className="inline-flex items-center gap-1"><Copy size={14} /> Copy Code</span>
                            </button>
                            <button
                              onClick={() => {
                                const origin = typeof window === 'undefined' ? '' : window.location.origin;
                                handleCopy(`${origin}/signup?ref=${encodeURIComponent(r.affiliateCode)}`);
                              }}
                              className="px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-gray-200 text-xs font-semibold hover:bg-gray-700"
                            >
                              <span className="inline-flex items-center gap-1"><Copy size={14} /> Copy Link</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-5 border border-gray-800 rounded-xl bg-dark-800/70 space-y-3">
              <h2 className="font-semibold">Referral Link (Your Account)</h2>
              <p className="text-sm text-gray-400">
                Share this link to track signups back to your user id.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
                  <label className="text-xs font-bold text-gray-400 uppercase">Affiliate Code</label>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                      value={myAffiliateCode}
                      readOnly
                    />
                    <button
                      onClick={() => handleCopy(myAffiliateCode)}
                      className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:border-brand-500"
                      aria-label="Copy affiliate code"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">Referral Link</label>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      className="w-full bg-dark-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                      value={referralLink}
                      readOnly
                    />
                    <button
                      onClick={() => handleCopy(referralLink)}
                      className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:border-brand-500"
                      aria-label="Copy referral link"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Referrals are logged on signup to `referrals` with `referrerId` + `referredUserId`.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminPage;
