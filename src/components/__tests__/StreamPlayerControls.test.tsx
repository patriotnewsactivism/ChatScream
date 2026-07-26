import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StreamPlayerControls from '../StreamPlayerControls';

describe('StreamPlayerControls', () => {
  it('renders a toolbar with role="toolbar"', () => {
    render(<StreamPlayerControls />);
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar).toBeInTheDocument();
  });

  it('each button has an aria-label', () => {
    render(<StreamPlayerControls />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toHaveAttribute('aria-label');
      expect(button.getAttribute('aria-label')).not.toBe('');
    });
  });

  it('buttons are keyboard navigable', () => {
    render(<StreamPlayerControls />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((button, index) => {
      fireEvent.keyDown(button, { key: 'Tab', shiftKey: false });
      expect(document.activeElement).toBe(buttons[(index + 1) % buttons.length]);
    });
  });
});