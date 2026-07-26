/// <reference types="cypress" />

import 'cypress-axe';
import 'cypress-real-events/support';

describe('Accessibility', () => {
  const pages = [
    { url: '/', name: 'Landing Page' },
    { url: '/stream', name: 'Stream Page' },
    { url: '/creator-dashboard', name: 'Creator Dashboard' },
  ];

  pages.forEach(page => {
    it(`passes axe audit on ${page.name}`, () => {
      cy.visit(page.url);
      cy.injectAxe();
      cy.checkA11y(null, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa'],
        },
      });
    });
  });

  it('keyboard navigation through chat messages', () => {
    cy.visit('/stream');
    cy.get('[role="log"]').as('chatLog');

    // Wait for messages to load
    cy.wait(500);

    // Focus first message
    cy.get('[role="log"] [role="article"]').first().focus();

    // ArrowDown to next message
    cy.realPress('ArrowDown');
    cy.focused().should('have.attr', 'role', 'article');

    // ArrowUp to previous message
    cy.realPress('ArrowUp');
    cy.focused().should('have.attr', 'role', 'article');

    // Home key to first message
    cy.realPress('Home');
    cy.focused().first().should('have.attr', 'role', 'article');

    // End key to last message
    cy.realPress('End');
    cy.focused().last().should('have.attr', 'role', 'article');
  });
});
