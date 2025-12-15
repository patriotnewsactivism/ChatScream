import React from 'react';
import { Link } from 'react-router-dom';

const posts = [
  {
    title: 'How Zero-Bandwidth Streaming Works',
    date: 'January 2025',
    summary: 'A deep dive into how ChatScream relays your stream through the cloud so your upload never breaks.',
  },
  {
    title: 'Designing Memorable Donation Moments',
    date: 'December 2024',
    summary: 'See how creators use Screams, overlays, and alerts to turn casual viewers into superfans.',
  },
  {
    title: 'Mobile Studio Tips for On-The-Go Hosts',
    date: 'November 2024',
    summary: 'Best practices for hosting on phones and tablets, from framing to audio hygiene.',
  }
];

const BlogPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-dark-900 text-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <p className="text-sm text-brand-400 font-semibold mb-2">Company</p>
            <h1 className="text-3xl md:text-4xl font-bold text-white">Blog</h1>
            <p className="text-gray-300">Stories, product updates, and tips for streamers.</p>
          </div>
          <Link
            to="/contact"
            className="px-5 py-3 bg-brand-600 hover:bg-brand-500 rounded-full font-semibold text-white text-center"
          >
            Pitch a story
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {posts.map((post) => (
            <article key={post.title} className="p-6 rounded-2xl border border-gray-800 bg-dark-800/70 flex flex-col">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">{post.date}</p>
              <h2 className="text-xl font-semibold text-white mb-3">{post.title}</h2>
              <p className="text-gray-300 flex-1">{post.summary}</p>
              <a
                href="mailto:press@ChatScream.live"
                className="mt-4 text-brand-400 hover:text-brand-300 font-semibold inline-flex items-center gap-2"
              >
                Request full article
              </a>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BlogPage;
