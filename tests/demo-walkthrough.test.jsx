import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import App from '../src/App.jsx';

/**
 * The walkthrough's own dismiss button used to be a no-op on the final step —
 * the card could only be removed by exiting the sandbox entirely. Regression:
 * finishing the tour must end the demo session.
 */
describe('demo walkthrough', () => {
  afterEach(cleanup);

  it('finishing the tour exits the sandbox', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Explore an example week first'));

    const next = () => screen.getByText('Next');
    fireEvent.click(next());
    fireEvent.click(next());
    fireEvent.click(next());
    fireEvent.click(next());

    expect(screen.getByText('Finish tour')).toBeTruthy();
    fireEvent.click(screen.getByText('Finish tour'));

    // Demo closed: walkthrough gone, back on the real (still un-onboarded) app.
    expect(screen.queryByText('Finish tour')).toBeNull();
    expect(screen.queryByText(/Demonstration data/)).toBeNull();
    expect(screen.getByLabelText('Your name')).toBeTruthy();
  });
});
