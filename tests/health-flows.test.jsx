import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import App from '../src/App.jsx';

const onboard = ({ cycle = false, stats = null } = {}) => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
  fireEvent.click(screen.getByText('Continue'));
  // Age is asked on the context step now, because it decides whether the rest
  // of setup is the adult app or the under-18 one.
  if (stats) {
    fireEvent.change(screen.getByLabelText(/^Your age/), { target: { value: String(stats.age) } });
  }
  fireEvent.click(screen.getByText('Continue'));
  if (stats || cycle) fireEvent.click(screen.getByText('Personalise nutrition'));
  if (stats) {
    fireEvent.change(screen.getByLabelText(/^Your weight/), { target: { value: String(stats.weightKg) } });
    fireEvent.change(screen.getByLabelText(/^Your height/), { target: { value: String(stats.heightCm) } });
    fireEvent.click(screen.getByText(stats.sex));
  }
  // The cycle page is opt-in, so tests that need it ask for it the way a user would.
  if (cycle) fireEvent.click(screen.getByRole('switch'));
  fireEvent.click(screen.getByText('Start using Forq'));
};

const dialogFor = (title) => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')]
    .find((d) => d.querySelector('h2')?.textContent === title);
  if (!dialog) throw new Error(`No open sheet titled "${title}"`);
  return dialog;
};

const openCard = (name, title) => {
  openProfile();
  const section = screen.getByText('Health & training').closest('section');
  fireEvent.click(within(section).getByText(name));
  return dialogFor(title);
};

const openHealth = (view) => {
  const sheet = openCard('Health', 'Health');
  if (view) fireEvent.click(within(sheet).getByText(view));
  return sheet;
};

const logWeight = (kg) => {
  const sheet = openHealth();
  fireEvent.change(within(sheet).getByLabelText(/^Weight \(kg\)/), { target: { value: String(kg) } });
  fireEvent.click(within(sheet).getByText('Log'));
  return sheet;
};

/** Profile moved out of the tab bar; the avatar in the header opens it. */
const openProfile = () => fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));

describe('health tracking starts with nothing in it', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('says the page is empty rather than showing a placeholder body', () => {
    onboard();
    const sheet = openHealth();
    expect(within(sheet).getByText(/Nothing measured yet/)).toBeTruthy();
    expect(within(sheet).queryByText('BMI')).toBeNull();
    // And the card that opened it doesn't pretend to know a weight.
    fireEvent.click(within(sheet).getByLabelText('Close'));
    expect(screen.getByText('Weight, vitals, sleep')).toBeTruthy();
  });

  it('carries the medical disclaimer on every page that bands a number', () => {
    onboard();
    const sheet = openHealth();
    expect(within(sheet).getByText(/not a diagnosis/)).toBeTruthy();
    fireEvent.click(within(sheet).getByText('Vitals'));
    expect(within(sheet).getByText(/not a diagnosis/)).toBeTruthy();
  });
});

describe('what setup asks for, and why', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('estimates maintenance from the stats rather than asking you to know it', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.change(screen.getByLabelText(/^Your age/), { target: { value: '30' } });
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Personalise nutrition'));
    // Nothing given yet, so it asks for the figure instead of inventing one.
    expect(screen.getByLabelText(/^Maintenance/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Your weight/), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText(/^Your height/), { target: { value: '180' } });
    // 10×80 + 6.25×180 − 5×30 = 1,775, − 78 for the unstated midpoint, ×1.375 lightly active
    expect(screen.getByText(/2,333 kcal/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Maintenance/)).toBeNull();
  });

  it('says why it asks for sex, and moves the number when you answer', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.change(screen.getByLabelText(/^Your age/), { target: { value: '30' } });
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Personalise nutrition'));
    fireEvent.change(screen.getByLabelText(/^Your weight/), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText(/^Your height/), { target: { value: '180' } });
    expect(screen.getByText(/constants differ by\s+166 kcal/)).toBeTruthy();
    fireEvent.click(screen.getByText('Male'));
    expect(screen.getByText(/2,448 kcal/)).toBeTruthy();
    fireEvent.click(screen.getByText('Female'));
    expect(screen.getByText(/2,219 kcal/)).toBeTruthy(); // 229 kcal apart — not a rounding error
    fireEvent.click(screen.getByText('Rather not say'));
    expect(screen.getByText(/2,333 kcal/)).toBeTruthy();
  });

  it('carries the stated sex into the waist banding, which needs one', () => {
    onboard({ stats: { weightKg: 80, heightCm: 180, age: 30, sex: 'Male' } });
    const sheet = openHealth();
    fireEvent.click(within(sheet).getByText('Waist'));
    fireEvent.change(within(sheet).getByLabelText(/^Waist \(cm\)/), { target: { value: '96' } });
    fireEvent.click(within(sheet).getByText('Log'));
    expect(within(sheet).getByText(/Raised — At or above 94 cm/)).toBeTruthy();
    // And the height it now knows means BMI works without a second ask.
    expect(within(sheet).getByText('24.7')).toBeTruthy();
  });

  it('leaves the cycle page out until you ask for it, and adds it when you do', () => {
    onboard();
    const off = openHealth();
    expect(within(off).queryByText('Cycle')).toBeNull();
    fireEvent.click(within(off).getByLabelText('Close'));
    cleanup();
    localStorage.clear();

    onboard({ cycle: true });
    const on = openHealth();
    expect(within(on).getByText('Cycle')).toBeTruthy();
    fireEvent.click(within(on).getByLabelText('Close'));
    expect(screen.getByText('Weight, vitals, sleep, cycle')).toBeTruthy();
  });

  it('can be turned on later from Goals without redoing setup', () => {
    onboard();
    openProfile();
    const section = screen.getByText('Goals & targets').closest('section');
    fireEvent.click(within(section).getByText(/kcal · /));
    const goals = dialogFor('Goals & targets');
    expect(within(goals).getByText(/turning it on adds a page under Health/i)).toBeTruthy();
    fireEvent.click(within(goals).getAllByRole('switch')[0]);
    fireEvent.click(within(goals).getByLabelText('Close'));
    expect(within(openHealth()).getByText('Cycle')).toBeTruthy();
  });
});

describe('taking a reading', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('keeps the weight, and asks for a height instead of guessing a BMI', () => {
    onboard();
    const sheet = logWeight(82);
    expect(within(sheet).getByText('82 kg')).toBeTruthy();
    expect(within(sheet).getByText('one reading')).toBeTruthy();
    expect(within(sheet).getByText(/Add your height under Goals/)).toBeTruthy();
    expect(within(sheet).queryByText('BMI')).toBeNull();
  });

  it('logging again on the same day replaces the reading, it does not stack one on it', () => {
    onboard();
    logWeight(82);
    const sheet = logWeight(81.4);
    expect(within(sheet).getByText('81.4 kg')).toBeTruthy();
    expect(within(sheet).queryByText('82 kg')).toBeNull();
    expect(within(sheet).getByText('one reading')).toBeTruthy();
  });

  it('shows the weight it now knows on the profile card, and in the goals maths', () => {
    onboard();
    const sheet = logWeight(82);
    fireEvent.click(within(sheet).getByLabelText('Close'));
    const section = screen.getByText('Health & training').closest('section');
    expect(within(section).getByText('82 kg')).toBeTruthy();
  });

  it('will not band a waist until it knows which thresholds apply', () => {
    onboard();
    const sheet = openHealth();
    fireEvent.click(within(sheet).getByText('Waist'));
    fireEvent.change(within(sheet).getByLabelText(/^Waist \(cm\)/), { target: { value: '96' } });
    fireEvent.click(within(sheet).getByText('Log'));
    expect(within(sheet).getByText(/thresholds differ by sex/)).toBeTruthy();
  });
});

describe('vitals', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('labels a reading with the published band and the advice that goes with it', () => {
    onboard();
    const sheet = openHealth('Vitals');
    expect(within(sheet).getByText(/No blood pressure readings yet/)).toBeTruthy();
    fireEvent.change(within(sheet).getByLabelText('Systolic'), { target: { value: '148' } });
    fireEvent.change(within(sheet).getByLabelText('Diastolic'), { target: { value: '94' } });
    fireEvent.click(within(sheet).getByText('Save reading'));
    expect(within(sheet).getByText('148 / 94 mmHg')).toBeTruthy();
    expect(within(sheet).getByText('High')).toBeTruthy();
    expect(within(sheet).getByText(/worth a GP appointment/)).toBeTruthy();
  });

  it('keeps each vital separate — glucose is not a blood pressure', () => {
    onboard();
    const sheet = openHealth('Vitals');
    fireEvent.click(within(sheet).getByText('Blood glucose'));
    fireEvent.change(within(sheet).getByLabelText('Glucose'), { target: { value: '5.2' } });
    fireEvent.click(within(sheet).getByText('Save reading'));
    expect(within(sheet).getByText('5.2 mmol/L')).toBeTruthy();
    expect(within(sheet).getByText('Normal')).toBeTruthy();
    fireEvent.click(within(sheet).getByText('Blood pressure'));
    expect(within(sheet).getByText(/No blood pressure readings yet/)).toBeTruthy();
  });
});

describe('rest and cycle', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('summarises the nights it has, and says how many that is', () => {
    onboard();
    const sheet = openHealth('Rest');
    fireEvent.change(within(sheet).getByLabelText(/^Hours slept/), { target: { value: '6' } });
    fireEvent.click(within(sheet).getByText('Poor'));
    fireEvent.click(within(sheet).getByText('Log sleep'));
    const card = within(sheet).getByText('Last 1 night').closest('.card');
    expect(card.textContent).toContain('6 h');
    expect(card.textContent).toContain('1 night under seven');
    expect(card.textContent).toContain('quality 2/5');
  });

  it('records how a day felt, with the reason you gave', () => {
    onboard();
    const sheet = openHealth('Rest');
    fireEvent.click(within(sheet).getByText('Stressed'));
    fireEvent.change(within(sheet).getByLabelText('Stress note'), { target: { value: 'deadline week' } });
    fireEvent.click(within(sheet).getByText('Log how today felt'));
    expect(within(sheet).getByText('Stress · 1 day logged')).toBeTruthy();
    expect(within(sheet).getByText('4/5 average')).toBeTruthy();
    expect(within(sheet).getByText(/deadline week/)).toBeTruthy();
  });

  it('refuses to predict a cycle from one period, and says what it needs', () => {
    onboard({ cycle: true });
    const sheet = openHealth('Cycle');
    expect(within(sheet).getByText(/Log a period start/)).toBeTruthy();
    fireEvent.click(within(sheet).getByText('Medium'));
    fireEvent.click(within(sheet).getByText('Cramps'));
    fireEvent.click(within(sheet).getByText('Save'));
    expect(within(sheet).getByText('Day of cycle')).toBeTruthy();
    expect(within(sheet).getByText(/Two logged periods/)).toBeTruthy();
    expect(within(sheet).getByText('What you’ve noted').closest('.card').textContent).toContain('Cramps');
  });

  it('predicts only from your own cycles once there are two of them', () => {
    onboard({ cycle: true });
    const sheet = openHealth('Cycle');
    for (const start of ['2026-06-02', '2026-06-30']) {
      fireEvent.change(within(sheet).getByLabelText('Period start'), { target: { value: start } });
      fireEvent.click(within(sheet).getByText('Save'));
    }
    expect(within(sheet).getByText(/Average 28 days from 1 cycle of your own/)).toBeTruthy();
    expect(within(sheet).getByText(/no population average standing in for you/)).toBeTruthy();
  });
});

describe('exercise', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  const openExercise = () => openCard('Exercise', 'Exercise');

  it('says there is no step counter behind it before anything is logged', () => {
    onboard();
    const sheet = openExercise();
    expect(within(sheet).getByText(/there is no\s+step counter behind it/)).toBeTruthy();
  });

  it('will not estimate a burn without a weight, and says why', () => {
    onboard();
    const sheet = openExercise();
    expect(within(sheet).getByText(/it would be inventing a body/)).toBeTruthy();
    fireEvent.click(within(sheet).getByText('Running'));
    fireEvent.click(within(sheet).getByText('Log workout'));
    expect(within(sheet).getByText(/Running · 30 min/)).toBeTruthy();
    // Minutes are a fact; a calorie figure would not be, so there isn't one.
    expect(within(sheet).queryByText(/≈ \d+ kcal/)).toBeNull();
  });

  it('estimates the burn once it knows a weight, and labels it an estimate', () => {
    onboard();
    fireEvent.click(within(logWeight(80)).getByLabelText('Close'));
    const sheet = openExercise();
    fireEvent.click(within(sheet).getByText('Running'));
    expect(within(sheet).getByText('≈ 412 kcal')).toBeTruthy();
    fireEvent.click(within(sheet).getByText('Log workout'));
    expect(within(sheet).getByText(/1 session/)).toBeTruthy();
    expect(within(sheet).getAllByText(/≈ 412 kcal/).length).toBeGreaterThan(1);
  });

  it('leaves the day’s target alone until you ask for the calories back', () => {
    onboard();
    fireEvent.click(within(logWeight(80)).getByLabelText('Close'));
    const sheet = openExercise();
    fireEvent.click(within(sheet).getByText('Running'));
    fireEvent.click(within(sheet).getByText('Log workout'));
    expect(within(sheet).getByText(/Exercise isn’t added to your target/)).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('switch'));
    expect(within(sheet).getByText(/\+ 412 =/)).toBeTruthy();
  });

  it('reads an exported file rather than offering a sync button that could not work', () => {
    onboard();
    const sheet = openExercise();
    expect(within(sheet).getByText(/can’t read HealthKit, Health Connect or a watch directly/)).toBeTruthy();
    expect(within(sheet).queryByText(/Connect Apple Health/)).toBeNull();
    fireEvent.click(within(sheet).getByText('Example'));
    fireEvent.click(within(sheet).getByText(/Read the file/));
    expect(within(sheet).getByText(/3 workouts read/)).toBeTruthy();
    fireEvent.click(within(sheet).getByText(/Add them/));
    expect(within(sheet).getAllByText(/imported/).length).toBeGreaterThan(0);
  });
});
