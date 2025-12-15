import React from 'react';

const CookiePolicyPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-dark-900 text-gray-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="mb-10">
          <p className="text-sm text-brand-400 font-semibold mb-2">Legal</p>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">Cookie Policy</h1>
          <p className="text-gray-300">
            This Cookie Policy explains how ChatScream uses cookies and similar technologies to
            deliver and improve our services. By using the site, you consent to the practices
            described here.
          </p>
        </div>

        <div className="space-y-10">
          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-white">What Are Cookies?</h2>
            <p className="text-gray-300">
              Cookies are small text files stored on your device when you visit a website. We use them to
              remember your preferences, secure sessions, and analyze how features perform so we can
              improve reliability.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-white">Types of Cookies We Use</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-300">
              <li><strong className="text-white">Essential:</strong> Required for authentication, security, and core functionality.</li>
              <li><strong className="text-white">Preferences:</strong> Save layouts, destinations, and UI choices between sessions.</li>
              <li><strong className="text-white">Analytics:</strong> Help us understand feature adoption and troubleshoot stability issues.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-white">Managing Cookies</h2>
            <p className="text-gray-300">
              You can control cookies through your browser settings, including blocking or deleting them.
              Some essential cookies are necessary for login and streaming; disabling them may limit
              functionality.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-white">Updates</h2>
            <p className="text-gray-300">
              We may update this policy to reflect changes in our practices or legal requirements. We will
              notify users of significant updates through the app or by email.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-white">Contact</h2>
            <p className="text-gray-300">
              For questions about cookies or privacy, email us at
              <a href="mailto:legal@ChatScream.live" className="text-brand-400 hover:text-brand-300"> legal@ChatScream.live</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default CookiePolicyPage;
