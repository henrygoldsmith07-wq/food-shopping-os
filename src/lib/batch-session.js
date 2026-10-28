/**
 * Batch-cook session: turns a batchCookPairs() pair into one ordered run-sheet
 * using the recipes' own written steps (nothing invented). Shared ingredients
 * are prepped once up front, then both methods run with steps interleaved so
 * long passive steps (oven, simmer) overlap with active ones.
 */
const stepText = (s) => String(typeof s === 'string' ? s : s?.text || '').trim();
const stepMins = (s) => (typeof s === 'object' && Number(s?.timerMins ?? s?.minutes)) || 0;

const PASSIVE = /\b(oven|bake|roast|simmer|boil|rest|marinat|chill|cool|soak|prove)\w*/i;

/** Is a step mostly waiting (oven, simmer, rest)? */
export const isPassiveStep = (s) => PASSIVE.test(stepText(s));

export function buildBatchSession(pair) {
  if (!pair?.recipes || pair.recipes.length < 2) return null;
  const [a, b] = pair.recipes.map((x) => x.recipe);
  const lists = [a, b].map((r) => (r.steps || []).map((s) => ({ recipe: r.name, text: stepText(s), mins: stepMins(s), passive: isPassiveStep(s) })).filter((s) => s.text));
  if (!lists[0].length && !lists[1].length) return null;
  const order = [];
  // Start whichever dish has the longer passive step first, so it works while the other is prepped.
  const first = lists[0].some((s) => s.passive) || !lists[1].some((s) => s.passive) ? 0 : 1;
  const queues = [lists[first].slice(), lists[1 - first].slice()];
  let turn = 0;
  while (queues[0].length || queues[1].length) {
    const q = queues[turn];
    if (q.length) {
      // Run active steps back to back; hand over after a passive step so the other dish fills the wait.
      let s = q.shift();
      order.push(s);
      while (!s.passive && q.length && !q[0].passive) {
        s = q.shift();
        order.push(s);
        if (order.length > 400) break;
      }
      if (s.passive && q.length && queues[1 - turn].length === 0) continue;
    }
    turn = queues[1 - turn].length ? 1 - turn : turn;
  }
  const steps = [
    { recipe: 'Both', text: `Prep once for both: ${pair.shared.join(', ')}`, mins: 0, passive: false },
    ...order,
    { recipe: 'Both', text: 'Cool, portion and label the dish you are not eating tonight', mins: 0, passive: false },
  ];
  const timed = steps.reduce((n, s) => n + s.mins, 0);
  return { id: pair.id, steps, timedMinutes: timed, passiveCount: steps.filter((s) => s.passive).length };
}
