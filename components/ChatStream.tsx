import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectChatMessages, fetchTranslation, selectTranslationStatus } from '../store/chatSlice';
import { AggregatedMessage } from '../services/chatAggregator';
import { TranslationStatus } from '../types';

interface SummaryPanelProps {
  messages: AggregatedMessage[];
  onGenerateSummary: () => void;
  isGenerating: boolean;
  summary: string;
  sentimentFilter: 'all' | 'positive' | 'negative';
  topicFilter: string;
  onSentimentChange: (value: 'all' | 'positive' | 'negative') => void;
  onTopicChange: (value: string) => void;
}

const SummaryPanel: React.FC<SummaryPanelProps> = ({
  messages,
  onGenerateSummary,
  isGenerating,
  summary,
  sentimentFilter,
  topicFilter,
  onSentimentChange,
  onTopicChange
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="summary-panel bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Chat Summary</h3>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-blue-600 dark:text-blue-400 hover:underline"
          aria-expanded={isExpanded}
          aria-controls="summary-content"
        >
          {isExpanded ? 'Hide' : 'Show'}
        </button>
      </div>

      {isExpanded && (
        <div id="summary-content">
          <div className="flex flex-wrap gap-2 mb-4">
            <select
              value={sentimentFilter}
              onChange={(e) => onSentimentChange(e.target.value as 'all' | 'positive' | 'negative')}
              className="p-2 border rounded-md bg-white dark:bg-gray-700"
              aria-label="Filter by sentiment"
            >
              <option value="all">All Sentiments</option>
              <option value="positive">Positive</option>
              <option value="negative">Negative</option>
            </select>

            <select
              value={topicFilter}
              onChange={(e) => onTopicChange(e.target.value)}
              className="p-2 border rounded-md bg-white dark:bg-gray-700"
              aria-label="Filter by topic"
            >
              <option value="">All Topics</option>
              {/* Add dynamic topic options here */}
            </select>
          </div>

          <div className="mb-4">
            <button
              onClick={onGenerateSummary}
              disabled={isGenerating}
              className={`px-4 py-2 rounded-md ${isGenerating ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
              aria-busy={isGenerating}
            >
              {isGenerating ? 'Generating...' : 'Generate Summary'}
            </button>
          </div>

          <div className="p-4 bg-white dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600">
            {summary ? (
              <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{summary}</p>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">No summary available. Click 'Generate Summary' to create one.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const ChatStream = () => {
  const dispatch = useDispatch();
  const messages = useSelector(selectChatMessages);
  const translationStatus = useSelector(selectTranslationStatus);

  const [showTranslation, setShowTranslation] = useState<{ [key: string]: boolean }>({});
  const [keyword, setKeyword] = useState('');
  const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'summary'>('chat');
  const [summary, setSummary] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'positive' | 'negative'>('all');
  const [topicFilter, setTopicFilter] = useState('');

  useEffect(() => {
    if (translationStatus === TranslationStatus.FAILED) {
      alert('Translation failed. Please try again later.');
    }
  }, [translationStatus]);

  const handleTranslationClick = (messageId: string) => {
    setShowTranslation(prev => ({ ...prev, [messageId]: !prev[messageId] }));
    if (!showTranslation[messageId]) {
      dispatch(fetchTranslation(messageId));
    }
  };

  const handleKeywordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setKeyword(e.target.value);
    // API call to fetch suggested keywords
  };

  const handleKeywordSelect = (selectedKeyword: string) => {
    setKeyword(selectedKeyword);
    setShowSuggestions(false);
    // Filter chat messages based on selected keyword
  };

  const handleGenerateSummary = async () => {
    setIsGeneratingSummary(true);
    try {
      // Call AI service to generate summary
      // This would use the new AI endpoint added by the Logic Agent
      const response = await fetch('/api/ai/generate-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          messages: messages.map(m => m.content),
          sentimentFilter,
          topicFilter
        })
      });
      const data = await response.json();
      setSummary(data.summary);
    } catch (error) {
      console.error('Failed to generate summary:', error);
      setSummary('Failed to generate summary. Please try again.');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  return (
    <div className="chat-stream" role="region" aria-label="Chat Stream">
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
        <button
          className={`px-4 py-2 ${activeTab === 'chat' ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}
          onClick={() => setActiveTab('chat')}
          aria-selected={activeTab === 'chat'}
        >
          Chat
        </button>
        <button
          className={`px-4 py-2 ${activeTab === 'summary' ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}
          onClick={() => setActiveTab('summary')}
          aria-selected={activeTab === 'summary'}
        >
          Summary
        </button>
      </div>

      {activeTab === 'chat' ? (
        <div className="messages">
          {/* Existing chat messages rendering */}
        </div>
      ) : (
        <SummaryPanel
          messages={messages}
          onGenerateSummary={handleGenerateSummary}
          isGenerating={isGeneratingSummary}
          summary={summary}
          sentimentFilter={sentimentFilter}
          topicFilter={topicFilter}
          onSentimentChange={setSentimentFilter}
          onTopicChange={setTopicFilter}
        />
      )}

      <div className="input-area" role="search">
        <input
          type="text"
          value={keyword}
          onChange={handleKeywordChange}
          placeholder="Filter messages"
          className="keyword-input"
          aria-label="Search messages"
          aria-autocomplete="list"
          aria-controls="suggestions-dropdown"
          aria-expanded={showSuggestions}
        />
        {showSuggestions && (
          <div className="suggestions-dropdown" id="suggestions-dropdown">
            {suggestedKeywords.map((suggestion, index) => (
              <button
                key={index}
                className="suggestion-button"
                onClick={() => handleKeywordSelect(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ARIA live region for new messages, offscreen for screen readers */}
      <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', left: '-9999px', height: 1, width: 1, overflow: 'hidden' }}>
        {messages[0]?.text}
      </div>
      {/* ARIA live region for search results count */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {messages.filter(message => message.content.includes(keyword)).length} messages found
      </div>
    </div>
  );
};

export default ChatStream;