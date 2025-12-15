import React from 'react';
import { Link } from 'react-router-dom';

const roles = [
  {
    title: 'Senior Full-Stack Engineer',
    location: 'Remote (US Timezones)',
    summary: 'Build streaming automation, overlays, and secure creator payments.',
  },
  {
    title: 'Product Designer',
    location: 'Remote / Hybrid Houston, TX',
    summary: 'Design playful, accessible live experiences for creators and viewers.',
  },
  {
    title: 'Creator Success Manager',
    location: 'Remote',
    summary: 'Guide top creators through onboarding, sponsorships, and growth playbooks.',
  }
];

const CareersPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-dark-900 text-gray-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="mb-8">
          <p className="text-sm text-brand-400 font-semibold mb-2">Company</p>
          <h1 className="text-3xl md:text-4xl font-bold text-white">Careers</h1>
          <p className="text-gray-300 max-w-3xl">
            Join a team building the fastest way to launch, monetize, and grow interactive streams.
            We operate remote-first with collaborative hubs in Houston.
          </p>
        </div>

        <div className="space-y-4 mb-10">
          {roles.map((role) => (
            <div key={role.title} className="p-6 rounded-2xl border border-gray-800 bg-dark-800/80">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-white">{role.title}</h2>
                  <p className="text-sm text-gray-400">{role.location}</p>
                </div>
                <a
                  href="mailto:careers@chatscream.com"
                  className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 rounded-full font-semibold text-white text-center"
                >
                  Apply via Email
                </a>
              </div>
              <p className="text-gray-300 mt-3">{role.summary}</p>
            </div>
          ))}
        </div>

        <div className="p-5 rounded-2xl border border-gray-800 bg-dark-800/60">
          <h2 className="text-lg font-semibold text-white mb-2">Don&apos;t see your role?</h2>
          <p className="text-gray-300 mb-4">
            We love hearing from builders and creators. Share your portfolio or GitHub and we will
            reach out when there&apos;s a fit.
          </p>
          <Link to="/contact" className="text-brand-400 hover:text-brand-300 font-semibold">
            Contact the team
          </Link>
        </div>
      </div>
    </div>
  );
};

export default CareersPage;
