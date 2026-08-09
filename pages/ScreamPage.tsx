import React from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import ScreamDonation from '../components/ScreamDonation';

/**
 * ScreamPage — public, unauthenticated page where a viewer can send a paid
 * ChatScream to a streamer. Shareable at /scream/:streamerUid.
 */
const ScreamPage: React.FC = () => {
  const { streamerUid } = useParams<{ streamerUid: string }>();
  const [searchParams] = useSearchParams();
  const streamerName = searchParams.get('name') || undefined;

  if (!streamerUid) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center text-white p-4">
        <p className="text-gray-400">This ChatScream link is missing a streamer.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center p-4">
      <Link to="/" className="mb-8 text-2xl font-bold text-white">
        Chat<span className="text-brand-400">Scream</span>
      </Link>
      <ScreamDonation streamerUid={streamerUid} streamerName={streamerName} />
    </div>
  );
};

export default ScreamPage;
