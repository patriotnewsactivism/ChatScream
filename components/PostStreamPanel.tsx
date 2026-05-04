/**
 * PostStreamPanel — Stream → Content Pipeline
 *
 * After a stream ends, shows the transcript and generates
 * AI-powered articles and social media posts from the content.
 */

import React, { useState, useCallback } from 'react';
import {
  FileText,
  Share2,
  Copy,
  Check,
  Sparkles,
  Download,
  X,
  Facebook,
  Loader2,
  Newspaper,
  MessageSquare,
} from 'lucide-react';
import type { EvidenceMarker } from '../hooks/useEvidenceMarkers';

interface PostStreamPanelProps {
  transcript: string;
  wordCount: number;
  evidenceMarkers: EvidenceMarker[];
  evidenceLog: string;
  streamDuration: number;
  onClose: () => void;
  authToken: string | null;
}

type ContentType = 'article' | 'facebook' | 'summary';

interface GeneratedContent {
  type: ContentType;
  title: string;
  content: string;
}

const PostStreamPanel: React.FC<PostStreamPanelProps> = ({
  transcript,
  wordCount,
  evidenceMarkers,
  evidenceLog,
  streamDuration,
  onClose,
  authToken,
}) => {
  const [activeTab, setActiveTab] = useState<'transcript' | 'generate' | 'evidence'>('transcript');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [generateType, setGenerateType] = useState<ContentType>('article');

  const formatDuration = (s: number): string => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const handleGenerate = useCallback(async () => {
    if (!transcript.trim()) return;
    setIsGenerating(true);

    try {
      // Build prompt based on content type
      const prompts: Record<ContentType, string> = {
        article: `You are Don Matthews, a fearless investigative journalist with We The People News (wtpnews.org). Write a hard-hitting article based on this livestream transcript. Include specific case law citations where relevant (e.g., Glik v. Cunniffe for recording rights, Reed v. Town of Gilbert for content-based restrictions, Monell v. NYC for municipal liability). Use a passionate, constitutional-rights-focused tone. Format with: headline, byline (Don Matthews, We The People News | wtpnews.org), body paragraphs, and end with: 'Need a civil rights attorney? Find one in your state at civilrightshub.org — 1,756+ verified attorneys listed.'\n\nTranscript:\n${transcript.slice(0, 8000)}`,
        facebook: `Write a powerful Facebook post based on this livestream transcript. Keep it punchy, passionate, and focused on constitutional rights. Include: a strong hook (2 sentences before the 'see more' break), key facts, a call to action pointing to wtpnews.org, and mention 'Find a civil rights attorney in your state at civilrightshub.org'. End with hashtags: #FirstAmendment #CivilRights #WTPNews #KnowYourRights. This is for Don Matthews / We The People News.\n\nTranscript:\n${transcript.slice(0, 4000)}`,
        summary: `Summarize the key points from this livestream in bullet points. Focus on constitutional rights issues, any violations observed, and key statements made. Be concise.\n\nTranscript:\n${transcript.slice(0, 6000)}`,
      };

      const titles: Record<ContentType, string> = {
        article: '📰 Article Draft',
        facebook: '📘 Facebook Post',
        summary: '📋 Stream Summary',
      };

      // Try to use the backend AI endpoint
      const apiBase = (import.meta as any).env?.VITE_API_BASE_URL || '';
      const response = await fetch(`${apiBase}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          message: prompts[generateType],
          model: 'default',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.response || data.message || data.content || 'Generation failed.';
        setGeneratedContent((prev) => [
          { type: generateType, title: titles[generateType], content },
          ...prev,
        ]);
      } else {
        // Fallback — provide template
        const fallback = generateType === 'article'
          ? `HEADLINE: [Your headline here]\n\nBy Don Matthews | We The People News\ndon@donmatthews.live\n\n[The AI backend is not responding — here's your transcript to work from. Copy and edit as needed.]\n\n${transcript.slice(0, 3000)}`
          : generateType === 'facebook'
            ? `🔴 LIVE UPDATE from We The People News\n\n${transcript.slice(0, 500)}...\n\n#FirstAmendment #CivilRights #KnowYourRights #WeThePeople`
            : `Key Points:\n• ${transcript.slice(0, 200)}...\n\n[Full transcript available for manual editing]`;

        setGeneratedContent((prev) => [
          { type: generateType, title: titles[generateType] + ' (template)', content: fallback },
          ...prev,
        ]);
      }
    } catch (err) {
      console.error('Content generation failed:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [transcript, generateType, authToken]);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback for mobile
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const downloadText = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
      <div className="bg-dark-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Stream Recap</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {formatDuration(streamDuration)} · {wordCount.toLocaleString()} words · {evidenceMarkers.length} markers
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-800 shrink-0">
          {[
            { id: 'transcript' as const, label: 'Transcript', icon: <FileText size={14} /> },
            { id: 'generate' as const, label: 'Generate', icon: <Sparkles size={14} /> },
            { id: 'evidence' as const, label: `Evidence (${evidenceMarkers.length})`, icon: <Share2 size={14} /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'text-brand-400 border-b-2 border-brand-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'transcript' && (
            <div className="space-y-3">
              {transcript ? (
                <>
                  <div className="bg-dark-950 border border-gray-800 rounded-lg p-4 text-sm text-gray-300 leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap">
                    {transcript}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyToClipboard(transcript, 'transcript')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-gray-800 text-gray-300 text-xs font-semibold hover:bg-gray-700"
                    >
                      {copiedId === 'transcript' ? <Check size={14} /> : <Copy size={14} />}
                      {copiedId === 'transcript' ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      onClick={() => downloadText(transcript, `transcript-${new Date().toISOString().slice(0, 10)}.txt`)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-gray-800 text-gray-300 text-xs font-semibold hover:bg-gray-700"
                    >
                      <Download size={14} />
                      Download
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <FileText size={32} className="mx-auto text-gray-600 mb-3" />
                  <p className="text-sm text-gray-500">No transcript was captured.</p>
                  <p className="text-xs text-gray-600 mt-1">Enable captions before streaming to auto-capture.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'generate' && (
            <div className="space-y-4">
              {/* Generate controls */}
              <div className="space-y-2">
                <p className="text-xs text-gray-400">Generate content from your stream:</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { type: 'article' as ContentType, label: 'Article', icon: <Newspaper size={16} /> },
                    { type: 'facebook' as ContentType, label: 'FB Post', icon: <Facebook size={16} /> },
                    { type: 'summary' as ContentType, label: 'Summary', icon: <MessageSquare size={16} /> },
                  ].map((item) => (
                    <button
                      key={item.type}
                      onClick={() => setGenerateType(item.type)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${
                        generateType === item.type
                          ? 'bg-brand-500/20 border-brand-500 text-brand-400'
                          : 'bg-dark-950 border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {item.icon}
                      <span className="text-[10px] font-semibold">{item.label}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !transcript}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-500 to-purple-600 text-white font-semibold text-sm hover:from-brand-400 hover:to-purple-500 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Generate {generateType === 'article' ? 'Article' : generateType === 'facebook' ? 'Facebook Post' : 'Summary'}
                    </>
                  )}
                </button>
              </div>

              {/* Generated content */}
              {generatedContent.map((item, i) => (
                <div key={i} className="bg-dark-950 border border-gray-800 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-dark-900">
                    <span className="text-xs font-semibold text-gray-300">{item.title}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => copyToClipboard(item.content, `gen-${i}`)}
                        className="p-1 rounded text-gray-400 hover:text-white"
                      >
                        {copiedId === `gen-${i}` ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                      <button
                        onClick={() => downloadText(item.content, `${item.type}-${new Date().toISOString().slice(0, 10)}.txt`)}
                        className="p-1 rounded text-gray-400 hover:text-white"
                      >
                        <Download size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="p-3 text-sm text-gray-300 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {item.content}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'evidence' && (
            <div className="space-y-3">
              {evidenceMarkers.length > 0 ? (
                <>
                  <div className="bg-dark-950 border border-gray-800 rounded-lg p-3 text-xs text-gray-300 font-mono leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap">
                    {evidenceLog}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyToClipboard(evidenceLog, 'evidence')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-gray-800 text-gray-300 text-xs font-semibold hover:bg-gray-700"
                    >
                      {copiedId === 'evidence' ? <Check size={14} /> : <Copy size={14} />}
                      {copiedId === 'evidence' ? 'Copied!' : 'Copy Log'}
                    </button>
                    <button
                      onClick={() => downloadText(evidenceLog, `evidence-log-${new Date().toISOString().slice(0, 10)}.txt`)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-500"
                    >
                      <Download size={14} />
                      Export
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <Share2 size={32} className="mx-auto text-gray-600 mb-3" />
                  <p className="text-sm text-gray-500">No evidence markers were recorded.</p>
                  <p className="text-xs text-gray-600 mt-1">Use the marker buttons during your next stream.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PostStreamPanel;
