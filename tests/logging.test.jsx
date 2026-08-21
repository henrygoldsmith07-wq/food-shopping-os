import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import App from '../src/App.jsx';

const onboard = () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Start using Forq'));
};

const openDiary = () => {
  onboard();
  fireEvent.click(screen.getByText('Log'));
};

/** The open sheet whose heading is `title` (labels repeat inside the sheets). */
const dialogFor = (title) => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')]
    .find((d) => d.querySelector('h2')?.textContent === title);
  if (!dialog) throw new Error(`No open sheet titled "${title}"`);
  return dialog;
};

/** The leading number in "979 kcal left today · 35g protein to go". */
const dayKcal = () =>
  Number(screen.getByText(/kcal left today|kcal over your goal/).textContent.match(/[\d,]+/)[0].replace(/,/g, ''));

/** Log one food through search, so a test has something real to work with. */
const logFood = (name) => {
  fireEvent.click(screen.getAllByText('+ Add food')[0]);
  const addSheet = dialogFor('Add food');
  fireEvent.change(within(addSheet).getByLabelText('Search foods'), { target: { value: name } });
  fireEvent.click(within(addSheet).getAllByText(new RegExp(name, 'i'))[0]);
  const portion = dialogFor('How much?');
  fireEvent.click(within(portion).getByText(/Add \d+ kcal to/));
};

describe('logging routes', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('logs a scanned barcode', () => {
    openDiary();
    fireEvent.click(screen.getByText('Barcode'));
    const sheet = dialogFor('Scan a barcode');
    fireEvent.change(within(sheet).getByLabelText('Barcode number'), { target: { value: '5000108000084' } });
    expect(within(sheet).getByText('Protein bar')).toBeDefined();

    fireEvent.click(within(sheet).getByText('Choose portion'));
    fireEvent.click(within(dialogFor('How much?')).getByText(/Add \d+ kcal to/));
    expect(screen.getAllByText('Protein bar').length).toBeGreaterThan(0);
  });

  it('tells you when a barcode is not in the catalogue', () => {
    openDiary();
    fireEvent.click(screen.getByText('Barcode'));
    const sheet = dialogFor('Scan a barcode');
    fireEvent.change(within(sheet).getByLabelText('Barcode number'), { target: { value: '9999999999999' } });
    expect(within(sheet).getByText(/No product for 9999999999999/)).toBeDefined();
  });

  it('parses a spoken sentence into portions and logs them', () => {
    openDiary();
    fireEvent.click(screen.getByText('Voice'));
    const sheet = dialogFor('Voice logging');
    fireEvent.change(within(sheet).getByLabelText('What you ate'), {
      target: { value: 'two slices of wholemeal bread and 30g cheddar for lunch' },
    });
    fireEvent.click(within(sheet).getByText('Break it into foods'));

    expect(within(sheet).getByLabelText('Grams of Wholemeal bread')).toHaveProperty('value', '72');
    fireEvent.click(within(sheet).getByText('Log 2 items'));

    const lunch = screen.getByText('Lunch').closest('section');
    expect(within(lunch).getByText('Wholemeal bread')).toBeDefined();
    expect(within(lunch).getByText('Cheddar')).toBeDefined();
  });

  it('recognises a plate from a photo and logs the detected items', async () => {
    openDiary();
    fireEvent.click(screen.getByText('Photo'));
    const sheet = dialogFor('Photo recognition');
    fireEvent.click(within(sheet).getByText('Try a sample plate'));

    const logButton = await waitFor(() => within(sheet).getByText(/^Log \d+ items/), { timeout: 3000 });
    const before = dayKcal();
    fireEvent.click(logButton);
    expect(dayKcal()).toBeLessThan(before);
  });

  it('copies a meal you logged earlier onto another slot', () => {
    openDiary();
    logFood('hummus');
    const before = dayKcal();

    fireEvent.click(screen.getByText('Copy'));
    const sheet = dialogFor('Copy a meal');
    fireEvent.click(within(sheet).getAllByText('Copy')[0]);
    expect(within(sheet).getByText(/copied to/)).toBeDefined();
    fireEvent.click(within(sheet).getByText('Back to the diary'));
    expect(dayKcal()).toBeLessThan(before);
  });

  it('saves a meal as a template and applies it', () => {
    openDiary();
    logFood('hummus');

    fireEvent.click(screen.getAllByText('Save as template')[0]);
    const sheet = dialogFor('Copy a meal');
    fireEvent.click(within(sheet).getByText(/^Save \d+ item/));
    expect(within(sheet).getByText('Template saved')).toBeDefined();

    fireEvent.click(within(sheet).getAllByText('Use')[0]);
    fireEvent.click(within(sheet).getByText('Back to the diary'));
    expect(screen.getAllByText('Hummus').length).toBeGreaterThan(1);
  });

  it('has nothing to copy before anything is logged', () => {
    openDiary();
    fireEvent.click(screen.getByText('Copy'));
    const sheet = dialogFor('Copy a meal');
    expect(within(sheet).getByText(/Nothing logged on that day|No templates yet/)).toBeDefined();
  });

  it('imports a pasted recipe and logs a serving', () => {
    openDiary();
    fireEvent.click(screen.getByText('Import a recipe'));
    const sheet = dialogFor('Import a recipe');
    fireEvent.click(within(sheet).getByText('Use an example'));
    fireEvent.click(within(sheet).getByText('Import recipe'));

    expect(within(sheet).getByText('Peanut butter overnight oats')).toBeDefined();
    const before = dayKcal();
    fireEvent.click(within(sheet).getByText(/^Log 1 serving/));
    expect(dayKcal()).toBeLessThan(before);
  });

  it('adjusts and deletes something already logged', () => {
    openDiary();
    logFood('almonds');
    const afterLog = dayKcal();

    const section = screen.getAllByText('Almonds')[0].closest('section');
    fireEvent.click(within(section).getAllByText('Almonds')[0]);
    const sheet = dialogFor('Adjust portion');
    fireEvent.change(within(sheet).getByLabelText('Portion weight'), { target: { value: '10' } });
    fireEvent.click(within(sheet).getByText('Save changes'));
    expect(dayKcal()).toBeGreaterThan(afterLog); // smaller portion → more left

    fireEvent.click(screen.getAllByText('Almonds')[0]);
    fireEvent.click(within(dialogFor('Adjust portion')).getByLabelText('Delete entry'));
    expect(screen.queryByText('Almonds')).toBeNull();
  });

  it('quick-adds calories without a food', () => {
    openDiary();
    fireEvent.click(screen.getAllByText('+ Add food')[0]);
    const sheet = dialogFor('Add food');
    fireEvent.click(within(sheet).getByText('Quick add'));
    fireEvent.click(within(sheet).getByText(/Full meal · 650/));
    fireEvent.click(within(sheet).getByText(/^Add 650 kcal$/));
    expect(screen.getAllByText('Quick add').length).toBeGreaterThan(0);
  });

  it('creates a custom food and offers it in My foods', () => {
    openDiary();
    fireEvent.click(screen.getAllByText('+ Add food')[0]);
    const sheet = dialogFor('Add food');
    fireEvent.click(within(sheet).getByText('My foods'));
    expect(within(sheet).getByText(/^No custom foods yet/)).toBeDefined();
    fireEvent.click(within(sheet).getByText('New custom food'));

    fireEvent.change(within(sheet).getByPlaceholderText(/Mum’s lasagne/), { target: { value: 'Nan’s trifle' } });
    fireEvent.change(within(sheet).getByLabelText(/Serving size/), { target: { value: '200' } });
    fireEvent.change(within(sheet).getByLabelText(/^Calories/), { target: { value: '420' } });
    fireEvent.click(within(sheet).getByText('Save food'));

    expect(within(sheet).getByText('Nan’s trifle')).toBeDefined();
  });

  it('filters foods by nutrition and food type, then clears the filters', () => {
    openDiary();
    fireEvent.click(screen.getAllByText('+ Add food')[0]);
    const sheet = dialogFor('Add food');

    fireEvent.click(within(sheet).getByRole('button', { name: 'Food filters' }));
    expect(within(sheet).getByText('Banana')).toBeDefined();

    const proteinFilter = within(sheet).getByRole('button', { name: '15g+ protein' });
    fireEvent.click(proteinFilter);
    expect(proteinFilter.getAttribute('aria-pressed')).toBe('true');
    expect(within(sheet).queryByText('Banana')).toBeNull();
    expect(within(sheet).getByText('Chicken breast, cooked')).toBeDefined();
    expect(within(sheet).getByRole('button', { name: 'Food filters, 1 active' })).toBeDefined();

    fireEvent.click(within(sheet).getByText('Clear all'));
    expect(within(sheet).getByText('Banana')).toBeDefined();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Breakfast' }));
    expect(within(sheet).getByText('Porridge oats')).toBeDefined();
    expect(within(sheet).queryByText('Chicken breast, cooked')).toBeNull();

    fireEvent.click(within(sheet).getByText('Clear all'));
    expect(within(sheet).getByText('Chicken breast, cooked')).toBeDefined();
  });
});

describe('nutrition panel', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('lists every tracked nutrient, at zero on a fresh day', () => {
    openDiary();
    fireEvent.click(screen.getByText(/All 24 nutrients/));
    const sheet = dialogFor('Nutrition today');
    for (const label of ['Calories', 'Fibre', 'Saturated fat', 'Cholesterol', 'Sodium',
      'Potassium', 'Calcium', 'Iron', 'Magnesium', 'Zinc', 'Vitamin A', 'Vitamin B complex',
      'Vitamin C', 'Vitamin D', 'Vitamin E', 'Vitamin K', 'Caffeine', 'Alcohol']) {
      expect(within(sheet).getAllByText(label).length, label).toBeGreaterThan(0);
    }
    // The panel now reports data quality too, so a fresh day reads 0 kcal
    // for both the known and the estimated amount.
    expect(within(sheet).getAllByText('0 kcal').length).toBeGreaterThan(0);
    expect(within(sheet).getByText('Known amount')).toBeDefined();
  });

  it('edits a daily target and re-reads the percentage against it', () => {
    openDiary();
    logFood('almonds');
    fireEvent.click(screen.getByText(/All 24 nutrients/));
    const sheet = dialogFor('Nutrition today');
    fireEvent.click(within(sheet).getByText('Edit daily targets'));

    const field = within(sheet).getByLabelText('Fibre target');
    expect(field).toHaveProperty('value', '30');
    fireEvent.change(field, { target: { value: '3' } });
    fireEvent.click(within(sheet).getByText('Done editing targets'));
    expect(within(sheet).getByText('/ 3 g')).toBeDefined();
  });

  it('counts tapped glasses and logged drinks towards water intake', () => {
    openDiary();
    const water = screen.getByText('Water').closest('.card');
    expect(within(water).getByText(/^0 \/ 2,000 ml$/)).toBeDefined();
    fireEvent.click(within(water).getByText('+500 ml'));
    expect(within(water).getByText(/^500 \/ 2,000 ml$/)).toBeDefined();
  });
});
