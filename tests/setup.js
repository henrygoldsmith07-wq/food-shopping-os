import PlanTab from '../src/components/PlanTab.jsx';
import LogTab from '../src/components/LogTab.jsx';
import ShopTab from '../src/components/ShopTab.jsx';
import RecipesTab from '../src/components/RecipesTab.jsx';
import RecipeDetail from '../src/components/RecipeDetail.jsx';
import PantryView from '../src/components/PantryView.jsx';
import GuidancePanel from '../src/components/GuidancePanel.jsx';
import { CommandPalette, LauncherButtons, QuickAdd } from '../src/components/GlobalLauncher.jsx';

globalThis.__FORQ_TEST_SCREENS__ = {
  PlanTab,
  LogTab,
  ShopTab,
  RecipesTab,
  RecipeDetail,
  PantryView,
  GuidancePanel,
  CommandPalette,
  LauncherButtons,
  QuickAdd,
};

window.scrollTo = () => {};

// The Monid adapter must be inert in every test: no real CLI spawns, no
// writes to the developer's real ~/.forq state file. The adapter-suite tests
// that exercise Monid's own logic re-enable it locally and point
// MONID_STATE_FILE at a throwaway file.
process.env.MONID_DISABLED = 'true';
