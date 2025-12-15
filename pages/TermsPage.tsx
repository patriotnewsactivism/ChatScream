import React from 'react';
import { Link } from 'react-router-dom';

const TermsPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-dark-900 text-gray-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="mb-10">
          <p className="text-sm text-brand-400 font-semibold mb-2">Legal</p>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">Terms of Service</h1>
          <p className="text-gray-300 max-w-3xl">
            These Terms of Service govern your use of ChatScream. By creating an account or accessing
            the platform, you agree to the rules outlined below. If you do not agree, please discontinue
            use of the service.
          </p>
        </div>

        <div className="space-y-10">
          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-white">Accounts & Eligibility</h2>
            <p className="text-gray-300">
              You must be at least 16 years old to use ChatScream. You are responsible for safeguarding
              your credentials and ensuring account activity complies with these Terms. We reserve the
              right to suspend or terminate accounts for misuse, fraud, or security concerns.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-white">Acceptable Use</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-300">
              <li>Do not stream or distribute content that is illegal, hateful, or infringes on others' rights.</li>
              <li>Respect platform limits and avoid abusive API calls, automated scraping, or denial-of-service behavior.</li>
              <li>Maintain proper attribution and permissions for any third-party media you broadcast.</li>
              <li>Follow the rules of each connected destination (YouTube, Twitch, Facebook, etc.).</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-white">Subscriptions & Billing</h2>
            <p className="text-gray-300">
              Paid plans renew automatically unless canceled. Charges are handled through our payment
              partners and may be subject to applicable taxes. You can manage or cancel subscriptions at
              any time in your account settings. Refunds are processed in line with local regulations and
              our <Link to="/privacy-policy" className="text-brand-400 hover:text-brand-300">Privacy Policy</Link>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-white">Liability</h2>
            <p className="text-gray-300">
              ChatScream is provided "as is" without warranties of any kind. To the maximum extent allowed
              by law, we are not liable for indirect, incidental, or consequential damages arising from
              service use, outages, or third-party integrations.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-white">Termination</h2>
            <p className="text-gray-300">
              We may suspend or end access for violations of these Terms, security risks, or required legal
              compliance. You may stop using the service at any time. Upon termination, certain provisions
              such as intellectual property, limitations of liability, and dispute resolution survive.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-white">Contact</h2>
            <p className="text-gray-300">
              For questions about these Terms, contact us at
              <a href="mailto:legal@chatscream.com" className="text-brand-400 hover:text-brand-300"> legal@chatscream.com</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsPage;
