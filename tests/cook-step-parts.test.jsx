import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextStepPreview, StepText, TimerTray } from '../src/components/CookStepParts.jsx';

describe('cook mode step parts', () => {
  afterEach(cleanup);

  it('turns a written duration into a button that starts that timer', () => {
    const onStartTimer = vi.fn();
    render(<StepText text="Rest for 5 minutes, then serve." ingredients={[]} onStartTimer={onStartTimer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start a 5 minutes timer' }));
    expect(onStartTimer).toHaveBeenCalledWith(expect.objectContaining({ seconds: 300, text: '5 minutes' }));
  });

  it('shows an ingredient amount where the step uses it', () => {
    render(<StepText text="Soften the onion." ingredients={[{ name: 'Onion', qty: '1 large' }]} onStartTimer={() => {}} />);
    expect(screen.getByTestId('cook-step-text').textContent).toBe('Soften the onion1 large.');
  });

  it('lists only text-started timers, and lets a running one pause and a finished one clear', () => {
    const onToggle = vi.fn();
    const onDismiss = vi.fn();
    render(
      <TimerTray
        timers={{ 2: { left: 60, running: true }, 'x:1:5 minutes': { left: 125, running: true, label: '5 minutes' }, 'x:3:1 hour': { left: 0, running: false, label: '1 hour' } }}
        onToggle={onToggle}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Pause 5 minutes timer, 2:05 left' }));
    expect(onToggle).toHaveBeenCalledWith('x:1:5 minutes');
    expect(screen.getByRole('button', { name: '1 hour timer done' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Clear the 1 hour timer' }));
    expect(onDismiss).toHaveBeenCalledWith('x:3:1 hour');
  });

  it('previews the next step, and nothing on the last', () => {
    const { container, rerender } = render(<NextStepPreview text="Serve." />);
    expect(container.textContent).toBe('NextServe.');
    rerender(<NextStepPreview text={undefined} />);
    expect(container.textContent).toBe('');
  });
});
