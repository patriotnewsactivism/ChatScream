import React from 'react';
import { Link } from 'react-router-dom';

const AboutPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-dark-900 text-gray-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="mb-8">
          <p className="text-sm text-brand-400 font-semibold mb-2">Company</p>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">About ChatScream</h1>
          <p className="text-gray-300 max-w-3xl">
            ChatScream is built for creators who want to stream without the friction of bandwidth limits
            or complex setups. We pair cloud-powered routing with playful overlays so your audience can
            interact in real time.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-10">
          <div className="p-6 rounded-2xl border border-gray-800 bg-dark-800/80">
            <h2 className="text-xl font-semibold text-white mb-3">Our Mission</h2>
            <p className="text-gray-300">
              Make live video accessible to every creator, anywhere. We obsess over reliability,
              simplicity, and expressive tools that let you focus on content—not wiring.
            </p>
          </div>
          <div className="p-6 rounded-2xl border border-gray-800 bg-dark-800/80">
            <h2 className="text-xl font-semibold text-white mb-3">What We Value</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-300">
              <li>Trust and safety-first streaming.</li>
              <li>Inclusive, community-driven features.</li>
              <li>Transparent pricing and support you can reach.</li>
            </ul>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {[{ label: 'Zero Bandwidth Streaming', value: 'Cloud relays' }, { label: 'Creator Uptime', value: '99.9% SLA' }, { label: 'Global Destinations', value: 'YouTube, Twitch, Facebook' }].map((item) => (
            <div key={item.label} className="p-5 rounded-2xl border border-gray-800 bg-dark-800/60">
              <p className="text-sm text-brand-400 font-semibold">{item.label}</p>
              <p className="text-2xl font-bold text-white mt-2">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            to="/careers"
            className="px-6 py-3 bg-brand-600 hover:bg-brand-500 rounded-full font-semibold text-white text-center"
          >
            View Careers
          </Link>
          <Link
            to="/contact"
            className="px-6 py-3 border border-gray-700 hover:border-gray-600 rounded-full font-semibold text-gray-200 text-center"
          >
            Talk with Support
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
