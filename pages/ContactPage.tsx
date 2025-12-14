import React from 'react';

const ContactPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-dark-900 text-gray-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="mb-8">
          <p className="text-sm text-brand-400 font-semibold mb-2">Company</p>
          <h1 className="text-3xl md:text-4xl font-bold text-white">Contact</h1>
          <p className="text-gray-300 max-w-3xl">
            We are here to help with onboarding, billing, and technical questions. Reach us through any
            of the channels below.
          </p>
        </div>

        <div className="space-y-4">
          <div className="p-6 rounded-2xl border border-gray-800 bg-dark-800/80">
            <h2 className="text-xl font-semibold text-white mb-2">Support</h2>
            <p className="text-gray-300 mb-2">Live issues, streaming help, and account access.</p>
            <a href="mailto:support@chatscream.com" className="text-brand-400 hover:text-brand-300 font-semibold">
              support@chatscream.com
            </a>
          </div>

          <div className="p-6 rounded-2xl border border-gray-800 bg-dark-800/80">
            <h2 className="text-xl font-semibold text-white mb-2">Partnerships</h2>
            <p className="text-gray-300 mb-2">Brand deals, sponsorships, and community events.</p>
            <a href="mailto:partnerships@chatscream.com" className="text-brand-400 hover:text-brand-300 font-semibold">
              partnerships@chatscream.com
            </a>
          </div>

          <div className="p-6 rounded-2xl border border-gray-800 bg-dark-800/80">
            <h2 className="text-xl font-semibold text-white mb-2">Press</h2>
            <p className="text-gray-300 mb-2">Media inquiries and interview requests.</p>
            <a href="mailto:press@chatscream.com" className="text-brand-400 hover:text-brand-300 font-semibold">
              press@chatscream.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactPage;
