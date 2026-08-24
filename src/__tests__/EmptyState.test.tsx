import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EmptyState } from '../components/EmptyState';

describe('EmptyState', () => {
  const defaultProps = {
    title: 'Test Title',
    description: 'Test description text',
    illustrationUrl: '/test-illustration.svg',
    actions: [
      { label: 'Action 1', onClick: vi.fn() },
      { label: 'Action 2', onClick: vi.fn() },
    ],
  };

  it('renders title and description', () => {
    render(<EmptyState {...defaultProps} />);

    expect(screen.getByRole('heading', { name: 'Test Title' })).toBeDefined();
    expect(screen.getByText('Test description text')).toBeDefined();
  });

  it('renders illustration with correct src and empty alt', () => {
    render(<EmptyState {...defaultProps} />);

    const illustration = screen.getByAltText('');
    expect(illustration).toBeDefined();
    expect(illustration.getAttribute('src')).toBe('/test-illustration.svg');
  });

  it('renders all action buttons', () => {
    render(<EmptyState {...defaultProps} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent('Action 1');
    expect(buttons[1]).toHaveTextContent('Action 2');
  });

  it('calls onClick when action button is clicked', () => {
    const mockClick = vi.fn();
    render(
      <EmptyState
        {...defaultProps}
        actions={[{ label: 'Click me', onClick: mockClick }]}
      />
    );

    fireEvent.click(screen.getByText('Click me'));
    expect(mockClick).toHaveBeenCalledTimes(1);
  });

  it('does not render actions section when actions array is empty', () => {
    render(
      <EmptyState
        {...defaultProps}
        actions={[]}
      />
    );

    const buttons = screen.queryAllByRole('button');
    expect(buttons).toHaveLength(0);
  });

  it('applies custom className when provided', () => {
    render(
      <EmptyState
        {...defaultProps}
        className="custom-class"
      />
    );

    const section = screen.getByRole('status');
    expect(section.classList.contains('custom-class')).toBe(true);
  });

  it('has correct accessibility attributes', () => {
    render(<EmptyState {...defaultProps} />);

    const section = screen.getByRole('status');
    expect(section.getAttribute('aria-labelledby')).toBe('empty-state-title');
    expect(section.getAttribute('aria-describedby')).toBe('empty-state-description');
  });

  it('has live region for screen readers', () => {
    render(<EmptyState {...defaultProps} />);

    // Testing Library has no getByLiveRegion query; select the region directly.
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    if (!liveRegion) throw new Error('expected a polite live region');
    expect(liveRegion.getAttribute('aria-atomic')).toBe('true');
    expect(liveRegion.textContent).toContain('Test Title');
    expect(liveRegion.textContent).toContain('Test description text');
  });

  it('renders action buttons as native button elements', () => {
    render(<EmptyState {...defaultProps} />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
    });
  });

  describe('variant: Home page with no followed channels', () => {
    it('renders correct content for home empty state', () => {
      render(
        <EmptyState
          title="Your feed is empty"
          description="Start following channels to see content here"
          illustrationUrl="/images/empty-tv.svg"
          actions={[
            { label: 'Explore Trending', onClick: vi.fn() },
            { label: 'Search Channels', onClick: vi.fn() },
          ]}
        />
      );

      expect(screen.getByText('Your feed is empty')).toBeDefined();
      expect(screen.getByText('Explore Trending')).toBeDefined();
      expect(screen.getByText('Search Channels')).toBeDefined();
    });
  });

  describe('variant: Chat view with no messages', () => {
    it('renders correct content for chat empty state', () => {
      render(
        <EmptyState
          title="No chat yet"
          description="Be the first to send a message"
          illustrationUrl="/images/empty-chat.svg"
          actions={[
            { label: 'Send a welcome message', onClick: vi.fn() },
          ]}
        />
      );

      expect(screen.getByText('No chat yet')).toBeDefined();
      expect(screen.getByText('Send a welcome message')).toBeDefined();
    });
  });

  describe('variant: Search results empty', () => {
    it('renders correct content for search empty state with query', () => {
      render(
        <EmptyState
          title="No results for 'test query'"
          description="Try adjusting your search or filters"
          illustrationUrl="/images/empty-search.svg"
          actions={[
            { label: 'Clear filters', onClick: vi.fn() },
            { label: 'Try a broader search', onClick: vi.fn() },
          ]}
        />
      );

      expect(screen.getByText("No results for 'test query'")).toBeDefined();
      expect(screen.getByText('Clear filters')).toBeDefined();
      expect(screen.getByText('Try a broader search')).toBeDefined();
    });
  });
});