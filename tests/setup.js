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
