import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import App from '../src/App.jsx';

const onboard = ({ budget = '60' } = {}) => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
  fireEvent.click(screen.getByText('Continue'));
  if (budget) fireEvent.change(screen.getByLabelText(/Weekly food budget/), { target: { value: budget } });
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Start using Forq'));
};

const dialogFor = (title) => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')]
    .find((d) => d.querySelector('h2')?.textContent === title);
  if (!dialog) throw new Error(`No open sheet titled "${title}"`);
  return dialog;
};

const openShop = () => fireEvent.click(screen.getByText('Shop'));

const addItem = (name, price, qty) => {
  if (screen.queryByText('Add an item')) fireEvent.click(screen.getByText('Add an item'));
  fireEvent.change(screen.getByLabelText('Item name'), { target: { value: name } });
  if (qty) fireEvent.change(screen.getByLabelText('Amount'), { target: { value: qty } });
  if (price) fireEvent.change(screen.getByLabelText(/^Price each/), { target: { value: price } });
  fireEvent.click(screen.getByText('Add item'));
};

const recordShop = (store, total, { toPantry = true } = {}) => {
  fireEvent.click(screen.getAllByText(/Finish shop/)[0]);
  const sheet = dialogFor('Finish shop');
  fireEvent.change(within(sheet).getByLabelText('Shop name'), { target: { value: store } });
  fireEvent.change(within(sheet).getByLabelText(/Total paid/), { target: { value: total } });
  // Putting a shop away is on by default; a restock suggestion only makes
  // sense for something you have since used up.
  if (!toPantry) fireEvent.click(within(sheet).getByText('Put these in the pantry'));
  fireEvent.click(within(sheet).getByText('Record this shop'));
};

describe('a list that learns', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(cleanup);

  it('files an item where you moved it to, next time too', () => {
    onboard();
    openShop();
    addItem('Bananas', '1.20');
    expect(screen.getByText('Fruit & veg')).toBeDefined(); // guessed from the name

    fireEvent.click(screen.getByLabelText('Move Bananas to another aisle'));
    fireEvent.click(screen.getByText('Frozen'));
    expect(screen.queryByText('Fruit & veg')).toBeNull();

    // Remove it and add it again: the correction stuck.
    fireEvent.click(screen.getByLabelText('Remove Bananas'));
    addItem('Bananas', '1.20');
    expect(screen.getByText('Frozen')).toBeDefined();
  });

  it('learns the order you walk a shop in', () => {
    onboard();
    openShop();
    addItem('Bread', '1.10');
    addItem('Apples', '2.00');

    // Ticked in a deliberate order: bakery first, then fruit & veg.
    fireEvent.click(screen.getByLabelText('Tick Bread'));
    fireEvent.click(screen.getByLabelText('Tick Apples'));
    recordShop('Aldi', '3.10');

    const picker = screen.getByText('Shopping at').closest('section');
    fireEvent.click(within(picker).getByText('Aldi'));
    expect(screen.getByText('your route, learned')).toBeDefined();
    expect(screen.getByText(/Bakery → Fruit & veg\./)).toBeDefined();
  });

  it('repeats the last shop and starts shopping mode', () => {
    onboard();
    openShop();
    addItem('Milk', '1.30');
    fireEvent.click(screen.getByLabelText('Tick Milk'));
    recordShop('Tesco', '1.30');
    fireEvent.click(within(screen.getByText('Shopping at').closest('section')).getByText('Aldi'));

    fireEvent.click(screen.getByRole('button', { name: 'Repeat your last shop' }));

    expect(screen.getByText('Exit mode')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Review shopping list' })).toBeDefined();
    expect(screen.getByLabelText('Tick Milk')).toBeDefined();
    expect(screen.getByText('at Tesco')).toBeDefined();
  });

  it('resumes an active shop after the tab reloads', () => {
    onboard();
    openShop();
    addItem('Milk', '1.30');
    fireEvent.click(screen.getByText('Start shopping'));
    expect(screen.getByText('Exit mode')).toBeDefined();
    expect(screen.getByRole('progressbar', { name: 'Shopping progress' }).getAttribute('aria-valuenow')).toBe('0');
    fireEvent.click(screen.getByLabelText('Tick Milk'));
    expect(screen.getByRole('progressbar', { name: 'Shopping progress' }).getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByText(/Everything is ticked/)).toBeDefined();

    cleanup();
    render(<App />);
    fireEvent.click(screen.getByText('Shop'));
    expect(screen.getByText('Exit mode')).toBeDefined();
    expect(screen.getByText(/Everything is ticked/)).toBeDefined();
  });

  it('keeps the current shop filter when the active session changes it', () => {
    onboard();
    openShop();
    addItem('Milk', '1.30');
    const picker = screen.getByText('Shopping at').closest('section');
    fireEvent.click(within(picker).getByText('Tesco'));
    addItem('Bread', '1.10');
    fireEvent.click(screen.getByText('Start shopping'));
    fireEvent.click(within(picker).getByText('All shops'));

    cleanup();
    render(<App />);
    fireEvent.click(screen.getByText('Shop'));
    expect(screen.getByText('Exit mode')).toBeDefined();
    expect(screen.getByLabelText('Tick Milk')).toBeDefined();
    expect(screen.getByLabelText('Tick Bread')).toBeDefined();
  });

  it('offers to restock what you buy again and again, once it has run out', () => {
    onboard();
    openShop();
    for (const round of [1, 2]) {
      addItem('Milk', '1.30');
      fireEvent.click(screen.getByLabelText('Tick Milk'));
      recordShop('Tesco', `1.3${round}`);
    }
    // Bought twice and put away — nothing to restock while you still have it.
    expect(screen.queryByText('Frequently bought')).toBeNull();

    fireEvent.click(screen.getByText('Home'));
    fireEvent.click(screen.getByText('Open pantry →'));
    const pantry = dialogFor('Smart pantry');
    for (const button of within(pantry).getAllByLabelText('Remove Milk')) fireEvent.click(button);
    fireEvent.click(within(pantry).getByLabelText('Close'));

    openShop();
    const restock = screen.getByText('Frequently bought').closest('section');
    expect(within(restock).getByRole('button', { name: 'Add all' })).toBeDefined();
    fireEvent.click(screen.getByText(/Milk · 2×/));
    expect(screen.getByLabelText('Tick Milk')).toBeDefined();
  });

  it('adds every frequently bought item in one tap', () => {
    onboard();
    openShop();
    for (const product of [['Milk', '1.30'], ['Bread', '1.10']]) {
      for (const round of [1, 2]) {
        addItem(product[0], product[1]);
        fireEvent.click(screen.getByLabelText(`Tick ${product[0]}`));
        recordShop('Tesco', product[1]);
      }
    }

    fireEvent.click(screen.getByText('Home'));
    fireEvent.click(screen.getByText('Open pantry →'));
    const pantry = dialogFor('Smart pantry');
    for (const name of ['Milk', 'Bread']) {
      for (const button of within(pantry).getAllByLabelText(`Remove ${name}`)) fireEvent.click(button);
    }
    fireEvent.click(within(pantry).getByLabelText('Close'));

    openShop();
    const restock = screen.getByText('Frequently bought').closest('section');
    fireEvent.click(within(restock).getByRole('button', { name: 'Add all' }));
    expect(screen.getByLabelText('Tick Milk')).toBeDefined();
    expect(screen.getByLabelText('Tick Bread')).toBeDefined();
  });
});

describe('budget and offers', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(cleanup);

  it('counts an unpriced item as unknown rather than free', () => {
    onboard();
    openShop();
    addItem('Sourdough');
    expect(screen.getByText(/1 item with no price yet/)).toBeDefined();
  });

  it('explains and blocks an exact duplicate before it is added', () => {
    onboard();
    openShop();
    addItem('Milk', '1.30');
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'MILK' } });

    expect(screen.getByText(/Already on your list as “Milk”/)).toBeDefined();
    expect(screen.getByText('Add item').closest('button').disabled).toBe(true);
  });

  it('saves a product as a favourite and adds it back in one tap', () => {
    onboard();
    openShop();
    addItem('Milk', '1.30');
    fireEvent.click(screen.getByLabelText('Save Milk as favourite'));
    expect(screen.getByLabelText('Remove favourite Milk')).toBeDefined();

    fireEvent.click(screen.getByLabelText('Remove Milk'));
    const favourites = screen.getByText('Favourites').closest('section');
    fireEvent.click(within(favourites).getByRole('button', { name: /Milk/ }));
    expect(screen.getByLabelText('Tick Milk')).toBeDefined();
  });

  it('does not re-add a favourite under a singular or plural spelling', () => {
    onboard();
    openShop();
    addItem('Bananas');
    fireEvent.click(screen.getByLabelText('Save Bananas as favourite'));
    fireEvent.click(screen.getByLabelText('Remove Bananas'));
    addItem('Banana');

    const favourites = screen.getByText('Favourites').closest('section');
    fireEvent.click(within(favourites).getByRole('button', { name: /Bananas/ }));
    expect(screen.queryByLabelText('Tick Bananas')).toBeNull();
    expect(screen.getByLabelText('Tick Banana')).toBeDefined();
  });

  it('suggests a familiar quantity from recorded shops', () => {
    onboard();
    openShop();
    addItem('Milk', '1.30', '2 pints');
    fireEvent.click(screen.getByLabelText('Tick Milk'));
    recordShop('Tesco', '1.30');

    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Milk' } });
    expect(screen.getByRole('button', { name: 'Use usual quantity 2 pints' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Use usual quantity 2 pints' }));
    expect(screen.getByLabelText('Amount').value).toBe('2 pints');
    expect(document.activeElement).toBe(screen.getByLabelText('Amount'));
  });

  it('keeps products in separate store views', () => {
    onboard();
    openShop();
    addItem('Milk', '1.30');

    const picker = screen.getByText('Shopping at').closest('section');
    fireEvent.click(within(picker).getByText('Tesco'));
    addItem('Bread', '1.10');

    expect(screen.getByLabelText('Tick Bread')).toBeDefined();
    expect(screen.queryByLabelText('Tick Milk')).toBeNull();
    expect(screen.getByText(/1 assigned item shown/)).toBeDefined();

    fireEvent.click(within(picker).getByText('All shops'));
    expect(screen.getByLabelText('Tick Milk')).toBeDefined();
    expect(screen.getByLabelText('Tick Bread')).toBeDefined();

    fireEvent.click(within(picker).getByText('Tesco'));
    fireEvent.click(screen.getByLabelText('Tick Bread'));
    fireEvent.click(within(picker).getByText('All shops'));
    fireEvent.click(screen.getByLabelText('Tick Milk'));
    fireEvent.click(within(picker).getByText('Tesco'));
    fireEvent.click(screen.getAllByText(/Finish shop/)[0]);
    const finish = dialogFor('Finish shop');
    fireEvent.click(within(finish).getByText('Record this shop'));

    fireEvent.click(within(picker).getByText('All shops'));
    expect(screen.getByLabelText('Tick Milk')).toBeDefined();
    expect(screen.queryByLabelText('Tick Bread')).toBeNull();
  });

  it('takes your own offer off the projected total', () => {
    onboard();
    openShop();
    addItem('Pasta', '1.20');

    fireEvent.click(screen.getByText(/^Offers/));
    const sheet = dialogFor('Offers you have');
    expect(within(sheet).getByText(/Nothing here is fetched from a shop/)).toBeDefined();
    fireEvent.change(within(sheet).getByLabelText('Offer description'), { target: { value: '£1 off pasta' } });
    fireEvent.change(within(sheet).getByLabelText('Applies to'), { target: { value: 'pasta' } });
    fireEvent.change(within(sheet).getByLabelText(/Amount off/), { target: { value: '1' } });
    fireEvent.click(within(sheet).getByText('Add offer'));
    expect(within(sheet).getByText(/saves £1.00 on 1 item/)).toBeDefined();

    fireEvent.click(within(sheet).getByLabelText('Close'));
    expect(screen.getByText(/£1.20 less £1.00 of your offers/)).toBeDefined();
    expect(screen.getByText('£0.20')).toBeDefined();
  });

  it('warns when the shop would take you over budget', () => {
    onboard({ budget: '20' });
    openShop();
    addItem('Weekly shop', '25');
    expect(screen.getByText(/over budget/)).toBeDefined();
  });

  it('keeps an active shop usable offline and recovers when the connection returns', async () => {
    onboard();
    openShop();
    addItem('Milk', '1.30');
    fireEvent.click(screen.getByText('Start shopping'));

    window.dispatchEvent(new Event('offline'));
    await waitFor(() => expect(screen.getByText(/Offline · changes save locally/)).toBeDefined());
    fireEvent.click(screen.getByLabelText('Tick Milk'));
    expect(screen.getByText(/Finish shop · 1 item/)).toBeDefined();

    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(screen.getByText(/Online · changes save locally/)).toBeDefined());
  });

  it('sets monthly and weekly budgets and creates a price alert', () => {
    onboard();
    openShop();
    fireEvent.click(screen.getByText('Budget'));

    fireEvent.change(screen.getByLabelText('Weekly grocery budget'), { target: { value: '75' } });
    fireEvent.change(screen.getByLabelText('Monthly grocery budget'), { target: { value: '280' } });
    fireEvent.click(screen.getByText('Save budgets'));
    expect(screen.getByText(/£0.*of £75/)).toBeDefined();
    expect(screen.getByText(/£0.*of £280/)).toBeDefined();

    fireEvent.change(screen.getByLabelText('Price alert product'), { target: { value: 'Olive oil' } });
    fireEvent.change(screen.getByLabelText('Target price'), { target: { value: '4.50' } });
    fireEvent.click(screen.getByText('Add price alert'));
    expect(screen.getByText('Olive oil')).toBeDefined();
    expect(screen.getByText(/Target £4.50/)).toBeDefined();
  });

  it('tracks coupon savings when a discounted shop is recorded', () => {
    onboard();
    openShop();
    addItem('Pasta', '1.20');
    fireEvent.click(screen.getByText(/^Offers/));
    const sheet = dialogFor('Offers you have');
    fireEvent.change(within(sheet).getByLabelText('Offer description'), { target: { value: '£1 off pasta' } });
    fireEvent.change(within(sheet).getByLabelText('Applies to'), { target: { value: 'pasta' } });
    fireEvent.change(within(sheet).getByLabelText(/Amount off/), { target: { value: '1' } });
    fireEvent.click(within(sheet).getByText('Add offer'));
    fireEvent.click(within(sheet).getByLabelText('Close'));

    fireEvent.click(screen.getByLabelText('Tick Pasta'));
    recordShop('Tesco', '0.20', { toPantry: false });
    fireEvent.click(screen.getByText('Budget'));
    expect(screen.getByText(/Recorded coupon savings across 1 shop/)).toBeDefined();
    expect(screen.getAllByText('£1.00').length).toBeGreaterThan(0);
  });
});

describe('price comparison', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(cleanup);

  it('prices your list at the shops you have been to, and says what it could not price', () => {
    onboard();
    openShop();
    addItem('Pasta', '1.30');
    fireEvent.click(screen.getByLabelText('Tick Pasta'));
    recordShop('Tesco', '1.30');

    addItem('Pasta', '0.79');
    addItem('Caviar', '40');
    fireEvent.click(screen.getByText('Prices'));
    const compare = screen.getByText('This list, shop by shop').closest('section');
    expect(within(compare).getByText('Tesco')).toBeDefined();
    expect(within(compare).getByText(/prices known for 1 of 2 items/)).toBeDefined();
    expect(screen.getByText(/aren’t the same basket/)).toBeDefined();
  });

  it('says plainly when there is nothing to compare with', () => {
    onboard();
    openShop();
    fireEvent.click(screen.getByText('Prices'));
    expect(screen.getByText('No comparison yet')).toBeDefined();
    expect(screen.getByText(/Nothing is fetched from anywhere/)).toBeDefined();
  });
});

describe('scanning and exporting', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(cleanup);

  it('scans a barcode onto the list, and refuses to invent an unknown one', () => {
    onboard();
    openShop();
    fireEvent.click(screen.getByText('Scan'));
    const sheet = dialogFor('Scan onto the list');

    fireEvent.change(within(sheet).getByLabelText('Barcode number'), { target: { value: '5000108000015' } });
    fireEvent.click(within(sheet).getByLabelText('Barcode number').parentElement.querySelector('button'));
    fireEvent.click(within(sheet).getByText('Add'));

    fireEvent.change(within(sheet).getByLabelText('Barcode number'), { target: { value: '9999999999999' } });
    fireEvent.click(within(sheet).getByLabelText('Barcode number').parentElement.querySelector('button'));
    expect(within(sheet).getByText(/isn’t in the catalogue/)).toBeDefined();
    expect(within(sheet).getByText(/Nothing is invented for an unknown code/)).toBeDefined();

    fireEvent.click(within(sheet).getByLabelText('Close'));
    expect(screen.getByLabelText(/^Tick Quaker/)).toBeDefined();
  });

  it('hands the list over as text rather than pretending to talk to a shop', () => {
    onboard();
    openShop();
    addItem('Bread', '1.10');
    fireEvent.click(screen.getByText(/Copy the list as text/));
    const sheet = dialogFor('Your list as text');
    expect(within(sheet).getByText(/doesn’t connect to any supermarket/)).toBeDefined();
    expect(within(sheet).getByLabelText('List as text').value).toMatch(/Bakery\n- Bread/);
  });
});

describe('expiry and waste', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(cleanup);

  const openPantry = () => {
    fireEvent.click(screen.getByText('Home'));
    fireEvent.click(screen.getByText('Open pantry →'));
    return dialogFor('Smart pantry');
  };

  it('buckets what is going off and counts what you binned', () => {
    onboard();
    const sheet = openPantry();
    fireEvent.click(within(sheet).getByText('Add an item'));
    fireEvent.change(within(sheet).getByLabelText('Item name'), { target: { value: 'Spinach' } });
    fireEvent.change(within(sheet).getByLabelText('Use by'), { target: { value: '2020-01-01' } });
    fireEvent.change(within(sheet).getByLabelText(/^Cost/), { target: { value: '1.50' } });
    fireEvent.click(within(sheet).getByText('Add to pantry'));

    expect(within(sheet).getByText(/Past its date · 1/)).toBeDefined();
    fireEvent.click(within(sheet).getByText('Threw it away'));
    expect(within(sheet).getByText(/binned 1 item, worth £1.50/)).toBeDefined();
    expect(within(sheet).queryByText('Spinach')).toBeNull();
  });

  it('says how many items have no date at all', () => {
    onboard();
    const sheet = openPantry();
    fireEvent.click(within(sheet).getByText('Add an item'));
    fireEvent.change(within(sheet).getByLabelText('Item name'), { target: { value: 'Rice' } });
    fireEvent.click(within(sheet).getByText('Add to pantry'));
    fireEvent.change(within(sheet).getByLabelText('Item name'), { target: { value: 'Yogurt' } });
    fireEvent.change(within(sheet).getByLabelText('Use by'), { target: { value: '2020-01-01' } });
    fireEvent.click(within(sheet).getByText('Add to pantry'));

    expect(within(sheet).getByText(/1 item has no use-by date/)).toBeDefined();
  });
});

describe('meals to shopping', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(cleanup);

  it('puts one line on the list for an ingredient two meals want', () => {
    onboard();
    fireEvent.click(screen.getByText('Plan'));
    // The same dish on two nights still needs its ingredients bought once.
    fireEvent.click(screen.getAllByText('+ Dinner')[0]);
    fireEvent.click(within(dialogFor('Plan a meal')).getByText('Coconut Chickpea Curry'));
    fireEvent.click(screen.getAllByText('+ Dinner')[0]);
    fireEvent.click(within(dialogFor('Plan a meal')).getByText('Coconut Chickpea Curry'));
    fireEvent.click(screen.getByText(/Send this week's ingredients to the list/));

    openShop();
    expect(screen.getAllByText('Chickpeas (tins)')).toHaveLength(1);
    expect(screen.getAllByText(/^Rice$/)).toHaveLength(1);
  });
});
