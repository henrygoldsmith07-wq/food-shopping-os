import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import App from '../src/App.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';

const onboard = () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Start using Forq'));
};

const dialogFor = (title) => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')]
    .find((d) => d.querySelector('h2')?.textContent === title);
  if (!dialog) throw new Error(`No open sheet titled "${title}"`);
  return dialog;
};

const goTab = (label) => fireEvent.click(within(document.querySelector('nav')).getByText(label));

const logFood = (name) => {
  goTab('Log');
  fireEvent.click(screen.getAllByText('+ Add food')[0]);
  const sheet = dialogFor('Add food');
  fireEvent.change(within(sheet).getByLabelText('Search foods'), { target: { value: name } });
  fireEvent.click(within(sheet).getAllByText(new RegExp(name, 'i'))[0]);
  fireEvent.click(within(dialogFor('How much?')).getByText(/Add \d+ kcal to/));
};

const openAdvanced = async (tab) => {
  fireEvent.click(screen.getByRole('button', { name: 'Guidance — what matters now' }));
  const sheet = dialogFor('Guidance');
  fireEvent.click(within(sheet).getByText('Tools'));
  fireEvent.click(within(sheet).getByText('Health & impact'));
  await within(sheet).findByText('Planet');
  if (tab) fireEvent.click(within(sheet).getByText(tab));
  return sheet;
};

/** Profile moved out of the tab bar; the avatar in the header opens it. */
const openProfile = () => fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));

describe('the footprint', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('computes nothing from an empty diary, and says why', async () => {
    onboard();
    const sheet = await openAdvanced();
    expect(within(sheet).getByText(/it doesn’t estimate a diet for you/)).toBeTruthy();
  });

  it('says what share of your food it could actually place', async () => {
    onboard();
    logFood('Chicken breast');
    const sheet = await openAdvanced();
    expect(within(sheet).getByText(/kg CO₂e a day/)).toBeTruthy();
    expect(within(sheet).getByText(/of what you logged/)).toBeTruthy();
    expect(within(sheet).getByText(/rather than counted as nothing/)).toBeTruthy();
  });

  it('names its source and its uncertainty rather than presenting a bare figure', async () => {
    onboard();
    logFood('Chicken breast');
    const sheet = await openAdvanced();
    expect(within(sheet).getByText(/Poore & Nemecek/)).toBeTruthy();
    expect(within(sheet).getByText(/order of magnitude, not a reading/)).toBeTruthy();
  });
});

describe('nutrient gaps', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('will not compute an optimisation off a couple of days', async () => {
    onboard();
    const sheet = await openAdvanced('Gaps');
    expect(within(sheet).getByText(/5 logged days make this worth computing — you have 0/)).toBeTruthy();
  });
});

describe('fasting', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('offers a window without recommending one', async () => {
    onboard();
    const sheet = await openAdvanced('Fasting');
    expect(within(sheet).getByText(/A window you chose — Forq isn’t\s+recommending one/)).toBeTruthy();
  });

  it('runs a fast only once you start it, and can end it', async () => {
    onboard();
    const sheet = await openAdvanced('Fasting');
    expect(within(sheet).getByText('Start a fast')).toBeTruthy();
    fireEvent.click(within(sheet).getByText('Start now'));
    expect(within(sheet).getByText('Fasting now')).toBeTruthy();
    expect(within(sheet).getByText(/0h 00m/)).toBeTruthy();
    fireEvent.click(within(sheet).getByText('End the fast'));
    expect(within(sheet).getByText('Start a fast')).toBeTruthy();
  });

  it('needs nights the diary can bound before calling it a pattern', async () => {
    onboard();
    const sheet = await openAdvanced('Fasting');
    expect(within(sheet).getByText(/3 nights the diary can bound either side/)).toBeTruthy();
  });
});

describe('results you had taken elsewhere', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('is clear that no lab is being called', async () => {
    onboard();
    const sheet = await openAdvanced('Results');
    expect(within(sheet).getByText(/No lab has an API a web page can call/)).toBeTruthy();
    expect(within(sheet).queryByText(/Connect your lab/i)).toBeNull();
  });

  it('bands a result you type against its reference range', async () => {
    onboard();
    const sheet = await openAdvanced('Results');
    fireEvent.change(within(sheet).getByLabelText(/^Ferritin/), { target: { value: '15' } });
    fireEvent.click(within(sheet).getByText('Save this panel'));
    expect(within(sheet).getByText('Below range')).toBeTruthy();
    expect(within(sheet).getByText(/the person who ordered the test can/)).toBeTruthy();
  });

  it('says why there is no CGM connect button, and reads the export instead', async () => {
    onboard();
    const sheet = await openAdvanced('Results');
    expect(within(sheet).getByText(/Dexcom and Libre use vendor OAuth APIs/)).toBeTruthy();
    expect(within(sheet).getByText(/join household sync if you sign in/)).toBeTruthy();
    expect(within(sheet).getByText(/sent to OpenAI only if you deliberately include them/)).toBeTruthy();
    fireEvent.change(within(sheet).getByLabelText('Glucose export'), {
      target: {
        value: [
          'Device Timestamp,Historic Glucose mmol/L',
          '28/07/2026 08:00,5.2',
          '28/07/2026 08:15,5.6',
        ].join('\n'),
      },
    });
    fireEvent.click(within(sheet).getByText(/Read it/));
    expect(within(sheet).getByText(/2 readings/)).toBeTruthy();
  });
});

describe('the register of what it will not pretend to do', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('names what a browser genuinely cannot do, with the nearest real thing', async () => {
    onboard();
    const sheet = await openAdvanced('What it can’t');
    fireEvent.click(within(sheet).getAllByText('A browser can’t')[0]);
    expect(within(sheet).getByText('Smart kitchen integration')).toBeTruthy();
    expect(within(sheet).getAllByText(/Instead:/).length).toBeGreaterThan(0);
    expect(within(sheet).queryByText('Healthcare provider access')).toBeNull();
  });

  it('refuses DNA-based advice and explains, rather than saying coming soon', async () => {
    onboard();
    const sheet = await openAdvanced('What it can’t');
    fireEvent.click(within(sheet).getAllByText('Deliberately not')[0]);
    expect(within(sheet).getByText('DNA-based nutrition advice')).toBeTruthy();
    expect(within(sheet).getByText(/evidence that does not support them/)).toBeTruthy();
    expect(within(sheet).queryByText(/coming soon/i)).toBeNull();
  });

  it('is honest that the interface is English only', async () => {
    onboard();
    const sheet = await openAdvanced('What it can’t');
    expect(within(sheet).getByText(/interface is English only/)).toBeTruthy();
  });
});

describe('reading a receipt', () => {
  beforeEach(() => {
    localStorage.clear();
    // The receipt reader is an optional tool; these flows enable it directly.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 4, onboarded: false, enabledTools: ['receipt'] }));
  });
  afterEach(cleanup);

  const openReceipt = () => {
    goTab('Shop');
    fireEvent.click(screen.getAllByText(/Read a receipt/)[0]);
    return dialogFor('Read a receipt');
  };

  it('says plainly when native photo OCR is unavailable', () => {
    onboard();
    const sheet = openReceipt();
    expect(within(sheet).getByText(/no native receipt OCR/)).toBeTruthy();
    expect(within(sheet).getByText(/parser and total check still work/)).toBeTruthy();
    expect(within(sheet).getByText('Scan receipt photo').closest('button').disabled).toBe(true);
  });

  it('parses the example and checks itself against the printed total', () => {
    onboard();
    const sheet = openReceipt();
    fireEvent.click(within(sheet).getByText('Example'));
    fireEvent.click(within(sheet).getByText(/Read it/));
    expect(within(sheet).getByText(/5 items · Tesco/)).toBeTruthy();
    expect(within(sheet).getByText('Adds up')).toBeTruthy();
    expect(within(sheet).getByText(/That matches, so the parse is sound/)).toBeTruthy();
  });

  it('puts what it read into the pantry', () => {
    onboard();
    const sheet = openReceipt();
    fireEvent.click(within(sheet).getByText('Example'));
    fireEvent.click(within(sheet).getByText(/Read it/));
    fireEvent.click(within(sheet).getByText(/Add 5 to the pantry/));
    expect(dialogFor('Smart pantry')).toBeTruthy();
    expect(screen.getAllByText(/BANANAS LOOSE/i).length).toBeGreaterThan(0);
  });

  it('records the receipt in shop history as well as the pantry', () => {
    onboard();
    const sheet = openReceipt();
    fireEvent.click(within(sheet).getByText('Example'));
    fireEvent.click(within(sheet).getByText(/Read it/));
    fireEvent.click(within(sheet).getByText(/Add 5 to the pantry/));
    fireEvent.click(within(dialogFor('Smart pantry')).getByLabelText('Close'));
    goTab('Shop');
    fireEvent.click(screen.getByText('Shops'));

    expect(screen.getByText('Tesco')).toBeTruthy();
    expect(screen.getAllByText(/5 items/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/£12.38/).length).toBeGreaterThan(0);
  });

  it('deduplicates repeated receipt lines when repeating that shop', () => {
    onboard();
    const sheet = openReceipt();
    fireEvent.change(within(sheet).getByLabelText('Receipt text'), {
      target: { value: 'TESCO\nZUCCHINI £1.00\nZUCCHINI £1.20\nTOTAL £2.20' },
    });
    fireEvent.click(within(sheet).getByText(/Read it/));
    fireEvent.click(within(sheet).getByText(/Add 2 to the pantry/));
    fireEvent.click(within(dialogFor('Smart pantry')).getByLabelText('Close'));
    goTab('Shop');
    fireEvent.click(screen.getByRole('button', { name: 'Repeat your last shop' }));

    expect(screen.getAllByLabelText('Tick ZUCCHINI')).toHaveLength(1);
  });

  it('undoes the pantry and history receipt save as one action', () => {
    onboard();
    const sheet = openReceipt();
    fireEvent.click(within(sheet).getByText('Example'));
    fireEvent.click(within(sheet).getByText(/Read it/));
    fireEvent.click(within(sheet).getByText(/Add 5 to the pantry/));
    fireEvent.click(within(dialogFor('Smart pantry')).getByLabelText('Close'));
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

    goTab('Shop');
    fireEvent.click(screen.getByText('Shops'));
    expect(screen.getByText('No shops recorded')).toBeTruthy();
    goTab('Home');
    fireEvent.click(screen.getByText('Open pantry →'));
    expect(within(dialogFor('Smart pantry')).getByText('Your pantry is empty')).toBeTruthy();
  });

  it('lets you correct or remove recognised lines before keeping them', () => {
    onboard();
    const sheet = openReceipt();
    fireEvent.click(within(sheet).getByText('Example'));
    fireEvent.click(within(sheet).getByText(/Read it/));

    fireEvent.change(within(sheet).getByLabelText('Receipt item 1 name'), { target: { value: 'Ripe bananas' } });
    fireEvent.change(within(sheet).getByLabelText('Receipt item 1 quantity'), { target: { value: '2' } });
    const price = within(sheet).getByLabelText('Receipt item 1 price');
    fireEvent.change(price, { target: { value: '1.' } });
    expect(price.value).toBe('1.');
    fireEvent.change(price, { target: { value: '1.66' } });
    fireEvent.click(within(sheet).getByRole('button', { name: /Remove receipt item 2/ }));

    expect(within(sheet).getByText(/4 items/)).toBeTruthy();
    expect(within(sheet).getByDisplayValue('Ripe bananas')).toBeTruthy();
    expect(within(sheet).getByDisplayValue('2')).toBeTruthy();
    expect(within(sheet).getByDisplayValue('1.66')).toBeTruthy();
    expect(within(sheet).queryByDisplayValue('SEMI SKIMMED MILK 2L')).toBeNull();
    expect(within(sheet).getByText(/Items come to £10.71/)).toBeTruthy();
  });

  it('does not send a blank corrected line to the pantry', () => {
    onboard();
    const sheet = openReceipt();
    fireEvent.click(within(sheet).getByText('Example'));
    fireEvent.click(within(sheet).getByText(/Read it/));
    fireEvent.change(within(sheet).getByLabelText('Receipt item 1 name'), { target: { value: ' ' } });

    expect(within(sheet).getByRole('alert')).toBeTruthy();
    expect(within(sheet).getByText(/Add 5 to the pantry/).closest('button').disabled).toBe(true);
  });

  it('does not save receipt lines with invalid quantities or prices', () => {
    onboard();
    const sheet = openReceipt();
    fireEvent.click(within(sheet).getByText('Example'));
    fireEvent.click(within(sheet).getByText(/Read it/));
    fireEvent.change(within(sheet).getByLabelText('Receipt item 1 price'), { target: { value: 'not-a-price' } });

    expect(within(sheet).getByText(/non-negative quantity and price/)).toBeTruthy();
    expect(within(sheet).getByText(/Add 5 to the pantry/).closest('button').disabled).toBe(true);
  });

  it('does not offer a receipt pantry write when pantry access is off', () => {
    onboard();
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const member = {
      id: 'member-receipt-test', name: 'Alex', portions: 1, diets: [], role: 'child',
      permissions: { shopping: true, pantry: false, recipes: true, health: false }, notifications: true,
    };
    const next = { ...current, members: [member], activeMemberId: member.id };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(next) }));

    const sheet = openReceipt();
    fireEvent.click(within(sheet).getByText('Example'));
    fireEvent.click(within(sheet).getByText(/Read it/));
    expect(within(sheet).getByText(/Pantry editing is off/)).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: 'Pantry permission required' }).disabled).toBe(true);
  });
});
