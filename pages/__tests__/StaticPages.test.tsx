import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PrivacyPolicyPage from '../PrivacyPolicyPage';
import TermsPage from '../TermsPage';
import CookiePolicyPage from '../CookiePolicyPage';
import AboutPage from '../AboutPage';
import BlogPage from '../BlogPage';
import CareersPage from '../CareersPage';
import ContactPage from '../ContactPage';

describe('Static informational pages', () => {
  const cases: { name: string; component: React.ReactElement; heading: RegExp }[] = [
    { name: 'Privacy Policy', component: <PrivacyPolicyPage />, heading: /privacy policy/i },
    { name: 'Terms of Service', component: <TermsPage />, heading: /terms of service/i },
    { name: 'Cookie Policy', component: <CookiePolicyPage />, heading: /cookie policy/i },
    { name: 'About', component: <AboutPage />, heading: /about chatscream/i },
    { name: 'Blog', component: <BlogPage />, heading: /blog/i },
    { name: 'Careers', component: <CareersPage />, heading: /careers/i },
    { name: 'Contact', component: <ContactPage />, heading: /contact/i },
  ];

  cases.forEach(({ name, component, heading }) => {
    it(`renders the ${name} page`, () => {
      render(<MemoryRouter>{component}</MemoryRouter>);
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    });
  });
});
