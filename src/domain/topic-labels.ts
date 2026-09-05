// Readable names for card topics — presentation, not scheduling.
//
// Cards carry a raw `topicId`. Kitchen-seeded cards use the app's five fixed
// topics, so those get proper names; anything else (hand-typed topics, decks
// from a future importer) is prettified from the id rather than shown raw.
// A real topic catalogue can replace the lookup later without touching the UI.

/** The fixed topics kitchen-seeded cards are stamped with. */
export const KITCHEN_TOPICS: Record<string, string> = {
  shopping: "Shopping",
  budget: "Budget",
  pantry: "Pantry",
  diary: "Food diary",
  cooking: "Cooking",
};

/** Turn `meal-planning` or `meal_planning` into `Meal planning`. */
function prettify(topicId: string): string {
  return topicId
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/^./, (ch) => ch.toUpperCase());
}

/**
 * The readable name for a card topic: a proper name for the known kitchen
 * topics, a prettified id for anything else. Empty or missing ids fall back
 * to "General", matching the store's `general` default topic.
 */
export function topicLabel(topicId: string | null | undefined): string {
  if (!topicId) return "General";
  return KITCHEN_TOPICS[topicId] ?? prettify(topicId);
}
