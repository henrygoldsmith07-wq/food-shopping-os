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

  // A full App render plus five tour steps; the 5s default is too tight on a
  // machine also serving a production build, and this test is about behaviour,
  // not speed.
  it('finishing the tour exits the sandbox', { timeout: 20000 }, () => {
    render(<App />);
    fireEvent.click(screen.getByText('Explore an example week first'));

    const next = () => screen.getByText('Next');
    // The tour walks plan → list → shop → pantry → cook → closed loop.
    fireEvent.click(next());
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
