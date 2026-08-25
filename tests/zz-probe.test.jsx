import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import App from '../src/App.jsx';

describe('probe', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);
  it('what does home show after onboarding', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Start using Forq'));
    const raw = JSON.parse(localStorage.getItem('forq-state-v2'));
    console.log('myRecipes:', raw.myRecipes?.length, 'plan days:', Object.keys(raw.plan || {}).length);
    console.log('plan:', JSON.stringify(raw.plan));
    console.log('cooked:', raw.cooked?.length, 'shops:', raw.shops?.length, 'log days:', Object.keys(raw.log || {}).length);
    console.log('starterRecipeIds:', JSON.stringify(raw.starterRecipeIds));
    expect(true).toBe(true);
  });
});
