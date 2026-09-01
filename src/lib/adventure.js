const DAY = 86400000;
const dateValue = (date) => new Date(`${date}T12:00:00`).getTime();
const daysAgo = (today, days) => new Date(dateValue(today) - days * DAY).toISOString().slice(0, 10);

export const adventureMissions = (state = {}) => {
  const today = state.day || new Date().toISOString().slice(0, 10);
  const cooked = (state.cooked || []).filter((row) => row.date >= daysAgo(today, 6));
  const shops = (state.shops || []).filter((row) => row.date >= daysAgo(today, 6));
  const waste = (state.waste || []).filter((row) => row.date >= daysAgo(today, 6));
  const planned = Object.values(state.plan || {}).flatMap((day) => Object.values(day || {}).filter(Boolean));
  const done = state.adventureCompleted || {};
  const make = (id, label, detail, progress, target, xp) => ({ id, label, detail, progress: Math.min(progress, target), target, xp, complete: progress >= target, claimed: Boolean(done[id]) });
  return [
    make('cook-three', 'Cook three planned meals', 'Turn your plan into meals this week.', cooked.length, 3, 90),
    make('use-pantry', 'Use what you already own', 'Cook one recipe with at least two pantry ingredients.', cooked.some((row) => row.fromPantry || row.pantryUsed >= 2) ? 1 : 0, 1, 60),
    make('plan-five', 'Build a five-meal route', 'A plan makes shopping and waste easier.', new Set(planned).size, 5, 60),
    make('one-shop', 'Make one focused shop', 'Complete one recorded shopping trip.', shops.length, 1, 50),
    make('waste-free', 'Waste nothing this week', 'Keep the kitchen loop clean for seven days.', waste.length ? 0 : 1, 1, 100),
  ];
};

export const adventureSummary = (state = {}) => {
  const missions = adventureMissions(state);
  const completed = missions.filter((mission) => mission.complete).length;
  return { missions, completed, total: missions.length, xpAvailable: missions.filter((m) => m.complete && !m.claimed).reduce((sum, m) => sum + m.xp, 0) };
};
