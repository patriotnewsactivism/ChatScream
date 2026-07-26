import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LiveAnnouncer from '../LiveAnnouncer';

describe('LiveAnnouncer', () => {
  it('renders an aria-live region with polite live', () => {
    render(<LiveAnnouncer />);
    const liveRegion = screen.getByRole('status');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
  });

  it('updates live region when message prop changes', () => {
    const { rerender } = render(<LiveAnnouncer message="Hello" />);
    const liveRegion = screen.getByRole('status');
    expect(liveRegion).toHaveTextContent('Hello');

    rerender(<LiveAnnouncer message="World" />);
    expect(liveRegion).toHaveTextContent('World');
  });
});
