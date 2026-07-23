import { FC } from 'react';
import { Link } from 'react-router-dom';

const posts = [
  {
    title: 'How Zero-Bandwidth Streaming Works',
    date: 'January 2025',
    category: 'Engineering',
    summary: 'A deep dive into how ChatScream relays your stream through the cloud so your upload speed never limits your broadcast quality â even on a phone.',
    readTime: '5 min read',
  },
  {
    title: 'Designing Memorable Donation Moments',
    date: 'December 2024',
    category: 'Creator Tips',
    summary: 'See how creators use Screams, overlays, and tiered alerts to turn casual viewers into loyal superfans who keep coming back.',
    readTime: '4 min read',
  },
  {
    title: 'Mobile Studio Tips for On-The-Go Hosts',
    date: 'November 2024',
    category: 'How-To',
    summary: 'Best practices for hosting live shows on phones and tablets â from framing and lighting to mic placement and managing chat on a small screen.',
    readTime: '6 min read',
  },
];

const BlogPage: FC = () => {
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
            <article key={post.title} className="p-6 rounded-2xl border border-gray-800 bg-dark-800/70 flex flex-col hover:border-gray-700 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-300 border border-brand-500/20 font-semibold uppercase tracking-wide">
                  {post.category}
                </span>
                <p className="text-xs text-gray-500">{post.date}</p>
              </div>
              <h2 className="text-xl font-semibold text-white mb-3">{post.title}</h2>
              <p className="text-gray-300 flex-1 leading-relaxed">{post.summary}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-gray-500">{post.readTime}</span>
                <Link
                  to="/contact"
                  className="text-brand-400 hover:text-brand-300 font-semibold text-sm"
                >
                  Get notified â
                </Link>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-12 p-6 rounded-2xl border border-gray-800 bg-dark-800/50 text-center">
          <h2 className="text-lg font-semibold text-white mb-2">Full articles coming soon</h2>
          <p className="text-gray-400 text-sm mb-4">
            We&apos;re publishing in-depth guides on streaming, monetization, and creator growth.
            Sign up to be first to know.
          </p>
          <Link
            to="/contact"
            className="inline-flex px-5 py-2.5 bg-brand-600 hover:bg-brand-500 rounded-full font-semibold text-white text-sm"
          >
            Notify me
          </Link>
        </div>
      </div>
    </div>
  );
};

export default BlogPage;
