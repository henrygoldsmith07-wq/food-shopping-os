import { CalendarDays, Package, ShoppingCart } from 'lucide-react';

export const ENTRY_GOALS = [
  { id: 'plan', title: 'Plan my meals', text: 'Choose a few dishes and build your week.', Icon: CalendarDays },
  { id: 'shop', title: 'Build a shopping list', text: 'Get one clear list, organised by aisle.', Icon: ShoppingCart },
  { id: 'pantry', title: 'Use food I already have', text: 'Start with your kitchen and waste less.', Icon: Package },
];

export const STEP_META = [
  { label: 'Your start', title: 'Welcome to Forq', note: 'Make this week yours from the first tap.' },
  { label: 'Your kitchen', title: 'A little context', note: 'Just enough to make the first list fit.' },
  { label: 'Your first action', title: 'Your first win', note: 'Choose where Forq should take you first.' },
];

export const GOAL_FINISH = {
  plan: { title: 'Choose your first dinners', note: 'Pick a few meals and see them placed into your week.', actionLabel: 'Next: meal plan', description: 'Forq will open the home screen, where you can run the week loop for your selected dinners.' },
  shop: { title: 'Build your first list', note: 'Choose a few dinners and Forq will turn them into one clear shopping list.', actionLabel: 'Next: shopping list', description: 'Forq will open the home screen, where you can review your list or plan dinners to make one.' },
  pantry: { title: 'Start with your pantry', note: 'Add a few things you already own. Forq will use confirmed stock when it builds your next list.', actionLabel: 'Next: pantry', description: 'Forq will open the home screen, where your first action is to add confirmed pantry stock.' },
};
