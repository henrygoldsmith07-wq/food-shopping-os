import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../src/App.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';

const state = { onboarded: true, name: 'Sam', day: '2026-07-28' };

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

const dialogFor = (title) => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')]
    .find((node) => node.querySelector('h2')?.textContent === title);
  if (!dialog) throw new Error(`No open sheet titled "${title}"`);
  return dialog;
};

const openQuickAdd = () => {
  render(<App />);
  fireEvent.click(screen.getByText('Open pantry →'));
  const sheet = dialogFor('Smart pantry');
  fireEvent.click(within(sheet).getByText('What’s in my kitchen'));
  return sheet;
};

describe('what’s in my kitchen', () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)));
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('turns what you typed into rows you can check before they go in', () => {
    const sheet = openQuickAdd();
    fireEvent.change(within(sheet).getByLabelText('What is in your kitchen'), {
      target: { value: 'half a bag of spinach, 2 tins of chopped tomatoes, 400g chicken breast' },
    });
    fireEvent.click(within(sheet).getByText('Read my list'));

    expect(within(sheet).getByText('3 items · 3 recognised · 2 with an amount')).toBeDefined();
    expect(within(sheet).getByLabelText('Amount of Chicken breast, cooked').value).toBe('400 g');
    // "half a bag" is not an amount, and is not made into one.
    expect(within(sheet).getByLabelText('Amount of Spinach').value).toBe('');
    expect(within(sheet).getByText(/1 item has no amount/)).toBeDefined();

    fireEvent.click(within(sheet).getByText('Add 3 items to the pantry'));
    expect(within(sheet).getByText(/3 items put away/)).toBeDefined();
    expect(within(sheet).getAllByText('Spinach').length).toBeGreaterThan(0);
  });

  it('marks a name the catalogue does not know as one to confirm', () => {
    const sheet = openQuickAdd();
    fireEvent.change(within(sheet).getByLabelText('What is in your kitchen'), {
      target: { value: 'spinach\nnan’s special chutney' },
    });
    fireEvent.click(within(sheet).getByText('Read my list'));
    expect(within(sheet).getAllByText('recognised').length).toBe(1);
    expect(within(sheet).getAllByText('confirm').length).toBe(1);
  });

  it('lets an amount be typed in, and files everything in one place on request', () => {
    const sheet = openQuickAdd();
    fireEvent.change(within(sheet).getByLabelText('What is in your kitchen'), {
      target: { value: 'some cheddar' },
    });
    fireEvent.click(within(sheet).getByText('Read my list'));

    fireEvent.change(within(sheet).getByLabelText('Amount of Cheddar'), { target: { value: '200 g' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Freezer' }));
    fireEvent.click(within(sheet).getByText('Add 1 item to the pantry'));
    expect(within(sheet).getByText(/1 item put away/)).toBeDefined();
  });

  it('asks a model to tidy a rambling list, then reads its answer the same way', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({
      text: '2 tins chopped tomatoes\n400 g chicken breast',
      lines: ['2 tins chopped tomatoes', '400 g chicken breast'],
      read: 'text',
      model: 'some/model:free',
    }));
    vi.stubGlobal('fetch', fetchImpl);

    const sheet = openQuickAdd();
    fireEvent.change(within(sheet).getByLabelText('What is in your kitchen'), {
      target: { value: 'erm there are a couple of tins of tomatoes knocking about and some chicken' },
    });
    fireEvent.click(within(sheet).getByText('Tidy it for me'));

    await waitFor(() => expect(within(sheet).getByText(/Tidied up by a model/)).toBeDefined());
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).text).toMatch(/knocking about/);
    // The model returned words; the local parser still decided the confidences.
    expect(within(sheet).getByText('2 items · 2 recognised · 2 with an amount')).toBeDefined();
  });

  it('says why a tidy-up failed and leaves the typed list alone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(
      { error: 'No AI model is available right now. Type or paste the list instead.' },
      503,
    )));
    const sheet = openQuickAdd();
    fireEvent.change(within(sheet).getByLabelText('What is in your kitchen'), {
      target: { value: 'spinach and cheddar' },
    });
    fireEvent.click(within(sheet).getByText('Tidy it for me'));

    await waitFor(() => expect(within(sheet).getByText(/No AI model is available/)).toBeDefined());
    expect(within(sheet).getByLabelText('What is in your kitchen').value).toBe('spinach and cheddar');
    // The local route still works with no backend at all.
    fireEvent.click(within(sheet).getByText('Read my list'));
    expect(within(sheet).getByText('2 items · 2 recognised · 0 with an amount')).toBeDefined();
  });

  it('says plainly that this browser cannot listen', () => {
    const sheet = openQuickAdd();
    expect(within(sheet).getByText(/no speech recognition/)).toBeDefined();
    expect(within(sheet).getByRole('button', { name: /Speak it/ }).disabled).toBe(true);
  });
});
