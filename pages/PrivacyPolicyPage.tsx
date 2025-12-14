import React from 'react';
import { Link } from 'react-router-dom';

const PrivacyPolicyPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-dark-900 text-gray-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="mb-10">
          <p className="text-sm text-brand-400 font-semibold mb-2">Legal</p>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">Privacy Policy</h1>
          <p className="text-gray-300 max-w-3xl">
            This Privacy Policy explains how ChatScream collects, uses, and protects your
            information when you use our services. By accessing the site or creating an account,
            you agree to the practices described below.
          </p>
        </div>

        <div className="space-y-10">
          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-white">Information We Collect</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-300">
              <li>Account details such as name, email address, and authentication identifiers.</li>
              <li>Billing and subscription data processed securely through our payment partners.</li>
              <li>Stream metadata, destination preferences, and device diagnostics to improve reliability.</li>
              <li>Usage analytics and cookies that help us understand feature adoption and performance.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-white">How We Use Information</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-300">
              <li>To provide, maintain, and improve streaming, overlays, and analytics features.</li>
              <li>To personalize experiences such as saved layouts, scenes, and destination defaults.</li>
              <li>To send critical service updates, security notices, and account-related communication.</li>
              <li>To prevent fraud, enforce our Terms of Service, and comply with legal obligations.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-white">Sharing & Disclosure</h2>
            <p className="text-gray-300">
              We do not sell personal data. We may share information with trusted subprocessors such as
              payment providers, authentication partners, and infrastructure vendors solely to operate
              the service. Data is disclosed when required by law, to protect users, or to prevent
              fraud and abuse.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-white">Cookies & Tracking</h2>
            <p className="text-gray-300">
              We use cookies and similar technologies to keep you signed in, remember preferences, and
              measure product performance. You can manage cookies in your browser settings, though some
              features may not function correctly without them. For details on how we use cookies,
              please review our <Link to="/cookie-policy" className="text-brand-400 hover:text-brand-300">Cookie Policy</Link>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-white">Data Retention & Security</h2>
            <p className="text-gray-300">
              We retain account and billing information for as long as your account is active or as
              needed to provide services. We implement encryption in transit, secure credential storage,
              and least-privilege access controls to protect your data.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-white">Your Rights</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-300">
              <li>Access, update, or delete your profile data from the account settings page.</li>
              <li>Export stream data by contacting support with your registered email address.</li>
              <li>Opt out of non-essential communications using links in our emails.</li>
              <li>Disable cookies through browser controls if you do not want them stored.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-white">Contact</h2>
            <p className="text-gray-300">
              If you have questions about this policy or need to exercise your rights, email us at
              <a href="mailto:legal@chatscream.com" className="text-brand-400 hover:text-brand-300"> legal@chatscream.com</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
