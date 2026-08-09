import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PartyPopper } from 'lucide-react';

/**
 * ThankYouPage — post-checkout confirmation shown after a viewer completes
 * a ChatScream donation via Stripe Checkout (see ScreamPage / ScreamDonation).
 */
const ThankYouPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const streamerUid = searchParams.get('streamer');

  return (
    <div className="min-h-screen bg-dark-900 text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-dark-800 border border-gray-800 rounded-2xl p-8 text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-brand-600/20 flex items-center justify-center">
          <PartyPopper className="text-brand-400" size={28} />
        </div>
        <h1 className="text-2xl font-bold">Your ChatScream is on its way!</h1>
        <p className="text-sm text-gray-400">
          Thanks for the support — your alert will show up on stream within moments.
        </p>
        {streamerUid && (
          <Link
            to={`/scream/${encodeURIComponent(streamerUid)}`}
            className="inline-block text-sm text-brand-400 underline"
          >
            Send another ChatScream
          </Link>
        )}
        <div>
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gray-800 border border-gray-700 hover:border-brand-500 font-semibold text-sm"
          >
            Back to ChatScream
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ThankYouPage;
