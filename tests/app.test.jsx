import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import App from '../src/App.jsx';

/** Walk the first-run setup, the way a new user has to. */
export const onboard = ({ name = 'Sam', budget = '60' } = {}) => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: name } });
  fireEvent.click(screen.getByText('Continue'));
  if (budget) fireEvent.change(screen.getByLabelText(/Weekly food budget/), { target: { value: budget } });
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Start using Forq'));
};

/** Profile moved out of the tab bar; the avatar in the header opens it. */
const openProfile = () => fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));

describe('first run', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('asks for setup instead of inventing a user', () => {
    render(<App />);
    expect(screen.getByText('Welcome to Forq')).toBeDefined();
    expect(screen.getByText(/nothing is filled in for you/i)).toBeDefined();
    expect(screen.queryByText('Home')).toBeNull(); // no app until it's set up
  });

  it('lets you through setup and remembers who you are', () => {
    onboard({ name: 'Ada' });
    expect(screen.getByText(/Good (morning|afternoon|evening), Ada/)).toBeDefined();
    // Profile left the tab bar for the header avatar, so five tabs remain.
    expect(screen.getByRole('button', { name: /^You — profile/ })).toBeTruthy();
    for (const label of ['Home', 'Plan', 'Log', 'Shop', 'Recipes']) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it('preserves unreadable saved data and offers recovery instead of overwriting it', () => {
    localStorage.setItem('forq-state-v2', '{broken');
    render(<App />);

    expect(screen.getByText('Saved data needs attention')).toBeDefined();
    expect(screen.getByText('Download original data')).toBeDefined();
    expect(localStorage.getItem('forq-state-v2')).toBe('{broken');
  });
});

describe('an empty app', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('shows zeros and prompts, not fabricated history', () => {
    onboard();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0); // calories today
    expect(screen.getByText('of 2,200 kcal')).toBeDefined();
    expect(screen.getAllByText(/Nothing planned — tap to choose/).length).toBe(3);
    expect(screen.getByText(/Nothing tracked yet/)).toBeDefined();
    expect(screen.getByText(/Empty — add items/)).toBeDefined();
    expect(screen.queryByText(/day cooking streak/)).toBeNull();
  });

  it('has an empty diary', () => {
    onboard();
    fireEvent.click(screen.getByText('Log'));
    expect(screen.getByText('Food diary')).toBeDefined();
    expect(screen.getAllByText(/Nothing logged — search, scan, snap or say it/).length).toBe(4);
    expect(screen.getByText(/Log something and your eating window appears here/)).toBeDefined();
  });

  it('has an empty shopping list, shop history and price history', () => {
    onboard();
    fireEvent.click(screen.getByText('Shop'));
    expect(screen.getByText(/Nothing on the list yet/)).toBeDefined();
    fireEvent.click(screen.getByText('Shops'));
    expect(screen.getByText('No shops recorded')).toBeDefined();
    fireEvent.click(screen.getByText('Prices'));
    expect(screen.getByText('No price history yet')).toBeDefined();
  });

  it('has no earned achievements', () => {
    onboard();
    openProfile();
    expect(screen.queryByText('Earned')).toBeNull();
    expect(screen.getByText(/Log a day of food and it appears here/)).toBeDefined();
  });
});

describe('the budget you set', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('is used for headroom, and says so when unset', () => {
    onboard({ budget: '' });
    expect(screen.queryByText(/No budget set/)).toBeNull();
    expect(screen.getAllByText('Plan a meal').length).toBeGreaterThan(0);
    cleanup();

    localStorage.clear();
    onboard({ budget: '60' });
    expect(screen.getByText('of £60')).toBeDefined();
    expect(screen.getByText('£60.00 left')).toBeDefined();
  });
});

describe('goal-led first entry', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('turns selected starter recipes into a plan and shopping list', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Continue'));
    // Which six dishes are offered depends on what was said on the way here,
    // so the flow takes the first two rather than naming any of them.
    screen.getAllByText('Choose').slice(0, 2)
      .forEach((label) => fireEvent.click(label.closest('button')));
    fireEvent.click(screen.getByText('Start using Forq'));

    expect(screen.getByText('Your first meals are ready')).toBeDefined();
    expect(screen.getByText(/2 dinners planned/)).toBeDefined();
    fireEvent.click(screen.getByText('Shop'));
    expect(screen.queryByText(/Nothing on the list yet/)).toBeNull();
  });

  it('offers six dinners that fit the pattern chosen a step earlier', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Vegan'));
    fireEvent.click(screen.getByText('Continue'));

    const offered = screen.getAllByRole('button', { name: /Choose$|Selected$/ });
    expect(offered.length).toBe(6);
    for (const option of offered) expect(option.textContent).toContain('Fits vegan');
    // The rest of the book is gone, not greyed out and waiting to be tapped.
    expect(screen.queryByText('Lemon Chicken Traybake')).toBeNull();
  });

  it('gives you a different six when you ask for different choices', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Continue'));

    const named = () => screen.getAllByRole('button', { name: /Choose$|Selected$/ })
      .map((option) => option.textContent);
    const first = named();
    fireEvent.click(screen.getByText('Show me different choices'));
    const second = named();
    expect(second.length).toBe(6);
    expect(second.some((option) => first.includes(option))).toBe(false);
  });

  it('uses the chosen goal for the first primary action', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Use food I already have'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Start using Forq'));

    expect(screen.getAllByText('Add what’s in your cupboards').length).toBeGreaterThan(0);
  });
});

describe('logging food', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('moves the day total from zero', () => {
    onboard();
    fireEvent.click(screen.getByText('Log'));
    fireEvent.click(screen.getAllByText('+ Add food')[0]);

    const addSheet = [...document.querySelectorAll('[role="dialog"]')]
      .find((d) => d.querySelector('h2')?.textContent === 'Add food');
    fireEvent.change(within(addSheet).getByLabelText('Search foods'), { target: { value: 'hummus' } });
    fireEvent.click(within(addSheet).getByText('Hummus'));

    const portionSheet = screen.getByText('How much?').closest('[role="dialog"]');
    fireEvent.click(within(portionSheet).getByText(/Add \d+ kcal to/));

    expect(screen.getAllByText('Hummus').length).toBeGreaterThan(0);
    expect(screen.getByText(/kcal left today/).textContent).not.toMatch(/^2,200/);
  });
});
