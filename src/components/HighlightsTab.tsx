import React, { useState, useEffect, useCallback, useRef } from 'react';

interface HighlightSegment {
  id: string;
  startTime: number;
  endTime: number;
  title: string;
  description?: string;
  score: number;
  thumbnailUrl?: string;
  tags?: string[];
}

interface StreamHighlights {
  streamId: string;
  segments: HighlightSegment[];
  generatedAt: string;
  totalDuration: number;
}

interface HighlightsTabProps {
  streamId: string;
  videoPlayerRef: React.RefObject<HTMLVideoElement | null>;
  onSeek?: (time: number) => void;
  className?: string;
}

const API_BASE = process.env.REACT_APP_API_URL || '/api';

const HighlightsTab: React.FC<HighlightsTabProps> = ({
  streamId,
  videoPlayerRef,
  onSeek,
  className = ''
}) => {
  const [highlights, setHighlights] = useState<StreamHighlights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [selectedHighlight, setSelectedHighlight] = useState<HighlightSegment | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const fetchHighlights = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE}/highlights/${streamId}`);
      if (!response.ok) {
        if (response.status === 404) {
          setHighlights(null);
          return;
        }
        throw new Error(`Failed to fetch highlights: ${response.statusText}`);
      }
      const data: StreamHighlights = await response.json();
      setHighlights(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load highlights');
    } finally {
      setLoading(false);
    }
  }, [streamId]);

  const generateHighlights = useCallback(async () => {
    try {
      setGenerating(true);
      setError(null);
      const response = await fetch(`${API_BASE}/highlights/${streamId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Failed to generate highlights: ${response.statusText}`);
      }
      await fetchHighlights();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate highlights');
    } finally {
      setGenerating(false);
    }
  }, [streamId, fetchHighlights]);

  useEffect(() => {
    fetchHighlights();
  }, [fetchHighlights]);

  const handleSeekToHighlight = useCallback((highlight: HighlightSegment) => {
    setSelectedHighlight(highlight);
    if (videoPlayerRef.current) {
      videoPlayerRef.current.currentTime = highlight.startTime;
      videoPlayerRef.current.play().catch(() => {
        // Autoplay might be blocked, that's okay
      });
    }
    onSeek?.(highlight.startTime);
  }, [videoPlayerRef, onSeek]);

  const handleShare = useCallback(async (highlight: HighlightSegment) => {
    const shareData = {
      title: `Highlight: ${highlight.title}`,
      text: highlight.description || `Check out this highlight from the stream!`,
      url: `${window.location.origin}/stream/${streamId}?highlight=${highlight.id}`,
    };

    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        alert('Link copied to clipboard!');
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Failed to share:', err);
      }
    }
  }, [streamId]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'text-red-400';
    if (score >= 60) return 'text-orange-400';
    if (score >= 40) return 'text-yellow-400';
    return 'text-green-400';
  };

  if (loading) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 ${className}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4" />
        <p className="text-gray-400 text-sm">Loading highlights...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 ${className}`}>
        <div className="text-red-400 mb-4">⚠️</div>
        <p className="text-red-400 text-sm mb-4">{error}</p>
        <button
          onClick={fetchHighlights}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!highlights || highlights.segments.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 ${className}`}>
        <div className="text-gray-500 mb-4">🎬</div>
        <p className="text-gray-400 text-sm mb-2">No highlights generated yet</p>
        <p className="text-gray-500 text-xs mb-4">
          Highlights are created by analyzing chat activity and donations.
        </p>
        <button
          onClick={generateHighlights}
          disabled={generating}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          {generating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Generating...
            </>
          ) : (
            'Generate Highlights'
          )}
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Stream Highlights</h3>
          <p className="text-gray-400 text-xs mt-1">
            Generated {new Date(highlights.generatedAt).toLocaleDateString()} • {highlights.segments.length} moments
          </p>
        </div>
        <button
          onClick={generateHighlights}
          disabled={generating}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors"
        >
          {generating ? 'Regenerating...' : 'Regenerate'}
        </button>
      </div>

      {/* Timeline */}
      <div
        ref={timelineRef}
        className="relative h-16 bg-gray-800 rounded-lg overflow-hidden"
      >
        {/* Timeline track */}
        <div className="absolute inset-0 flex items-center px-2">
          {highlights.segments.map((segment) => {
            const leftPercent = (segment.startTime / highlights.totalDuration) * 100;
            const widthPercent = ((segment.endTime - segment.startTime) / highlights.totalDuration) * 100;
            const isSelected = selectedHighlight?.id === segment.id;

            return (
              <button
                key={segment.id}
                onClick={() => handleSeekToHighlight(segment)}
                className={`absolute h-10 rounded-md transition-all hover:scale-y-110 ${
                  isSelected
                    ? 'bg-blue-500 ring-2 ring-blue-300 z-10'
                    : 'bg-blue-600/80 hover:bg-blue-500'
                }`}
                style={{
                  left: `${leftPercent}%`,
                  width: `${Math.max(widthPercent, 2)}%`,
                }}
                title={`${segment.title} (${formatTime(segment.startTime)} - ${formatTime(segment.endTime)})`}
              >
                <span className="text-xs text-white font-medium truncate px-1 block">
                  {segment.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* Time markers */}
        <div className="absolute bottom-1 left-2 right-2 flex justify-between text-xs text-gray-500">
          <span>0:00</span>
          <span>{formatTime(highlights.totalDuration)}</span>
        </div>
      </div>

      {/* Highlight Cards */}
      <div className="grid gap-4">
        {highlights.segments.map((segment) => (
          <div
            key={segment.id}
            className={`bg-gray-800 rounded-lg p-4 border transition-colors cursor-pointer ${
              selectedHighlight?.id === segment.id
                ? 'border-blue-500 bg-gray-750'
                : 'border-gray-700 hover:border-gray-600'
            }`}
            onClick={() => handleSeekToHighlight(segment)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-white font-medium truncate">{segment.title}</h4>
                  <span className={`text-xs font-semibold ${getScoreColor(segment.score)}`}>
                    {segment.score}%
                  </span>
                </div>
                {segment.description && (
                  <p className="text-gray-400 text-sm mb-2 line-clamp-2">{segment.description}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{formatTime(segment.startTime)} - {formatTime(segment.endTime)}</span>
                  {segment.tags && segment.tags.length > 0 && (
                    <div className="flex gap-1">
                      {segment.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-gray-700 rounded-full text-gray-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShare(segment);
                  }}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                  title="Share highlight"
                  aria-label={`Share highlight: ${segment.title}`}
                >
                  <svg
                    className="w-5 h-5 text-gray-400 hover:text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 111.024 5.435l-6.632 3.316m6.632-6.632l6.632 3.316"
                    />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSeekToHighlight(segment);
                  }}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                  title="Play highlight"
                  aria-label={`Play highlight: ${segment.title}`}
                >
                  <svg
                    className="w-5 h-5 text-gray-400 hover:text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Share All Button */}
      <div className="pt-4 border-t border-gray-700">
        <button
          onClick={() => {
            const url = `${window.location.origin}/stream/${streamId}?highlights=true`;
            handleShare({
              id: 'all',
              startTime: 0,
              endTime: highlights.totalDuration,
              title: 'Stream Highlights',
              score: 100,
            });
          }}
          className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeJoin="round"
              strokeWidth={2}
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 111.024 5.435l-6.632 3.316m6.632-6.632l6.632 3.316"
            />
          </svg>
          Share All Highlights
        </button>
      </div>
    </div>
  );
};

export default HighlightsTab;