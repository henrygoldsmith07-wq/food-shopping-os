import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, CalendarDays, ChefHat, ClipboardList, Download, Home, ShoppingCart, Upload,
} from 'lucide-react';
import { AppProvider, useApp } from './lib/store.jsx';
import Onboarding from './components/Onboarding.jsx';
import HomeTab from './components/HomeTab.jsx';
import ProfileTab from './components/ProfileTab.jsx';
import { Sheet } from './components/ui.jsx';
import AppHeader from './components/AppHeader.jsx';
import { cx } from './lib/utils.js';
import { distanceMetres } from './lib/smart.js';
import { downloadFile, showNotification } from './lib/notify.js';
import { haptic } from './lib/haptics.js';
import { flushProductEvents, recordProductEvent } from './lib/product-analytics.js';
import { pulseForq } from './lib/pulse.js';

const testScreens = globalThis.__FORQ_TEST_SCREENS__ || {};
const deferred = (testComponent, loader) => testComponent || lazy(loader);
const PlanTab = deferred(testScreens.PlanTab, () => import('./components/PlanTab.jsx'));
const LogTab = deferred(testScreens.LogTab, () => import('./components/LogTab.jsx'));
const ShopTab = deferred(testScreens.ShopTab, () => import('./components/ShopTab.jsx'));
const RecipesTab = deferred(testScreens.RecipesTab, () => import('./components/RecipesTab.jsx'));
const RecipeDetail = deferred(testScreens.RecipeDetail, () => import('./components/RecipeDetail.jsx'));
const PantryView = deferred(testScreens.PantryView, () => import('./components/PantryView.jsx'));
const GuidancePanel = deferred(testScreens.GuidancePanel, () => import('./components/GuidancePanel.jsx'));
const launcherPart = (name) => deferred(testScreens[name], () => import('./components/GlobalLauncher.jsx')
  .then((module) => ({ default: module[name] })));
const CommandPalette = launcherPart('CommandPalette');
const LauncherButtons = launcherPart('LauncherButtons');
const QuickAdd = launcherPart('QuickAdd');

const ScreenFallback = () => (
  <div className="px-5 py-5" aria-hidden="true">
    <div className="skeleton h-5 w-32 rounded-full" />
    <div className="skeleton mt-4 h-36 rounded-3xl" />
    <div className="skeleton mt-3 h-24 rounded-3xl" />
  </div>
);

/**
 * Closed household loop: PANTRY → PLAN → SHOP → PURCHASE → CONSUMPTION → LEFTOVERS/WASTE → LEARNING → BETTER NEXT PLAN
 *
 * Five tabs, not six. Profile came out, pantry stays one tap away via Home + header.
 * Order is the loop: Today (pantry + today's meals + shop progress) → Plan → Shop → then
 * secondary (Log, Recipes) behind progressive disclosure. Keeping Log/Recipes visible but
 * secondary ensures existing tests pass while the primary loop (Today/Plan/Shop/Pantry)
 * is visually dominant. Pantry is a sheet on every screen (header button + Home card) so
 * it behaves as a primary nav concept without stealing tab width.
 *
 * Reduction of visible complexity is via progressive disclosure (enabledTools / productMode),
 * not deletion — non-loop features (Log, Recipes, Health etc.) remain but are hidden by
 * default in focused modes and accessible via "Add tools" when useful.
 */
const TABS = [
  { id: 'home', label: 'Home', Icon: Home }, // Home IS Today (SCREENS.home.title = 'Today')
  { id: 'plan', label: 'Plan', Icon: CalendarDays },
  { id: 'shop', label: 'Shop', Icon: ShoppingCart },
  { id: 'log', label: 'Log', Icon: ClipboardList }, // secondary: food logging — behind enabledTools in core-loop modes
  { id: 'recipes', label: 'Recipes', Icon: ChefHat }, // secondary: library — progressive disclosure
];

/** What each screen is called, and the one thing it is mainly for. Primary loop is Today/Plan/Shop/Pantry. */
export const SCREENS = {
  home: { title: 'Today' }, // Today = pantry truth + plan + shop progress + outcomes
  plan: { title: 'Meal planner' },
  log: { title: 'Food diary' },
  shop: { title: 'Shop' },
  recipes: { title: 'Recipes' },
  profile: { title: 'You' },
  // pantry is a sheet, not a tab, but conceptually primary — see HomeTab pantry card + AppHeader button
};

function GeofenceWatcher() {
  const app = useApp();
  const inside = useRef(new Map());

  useEffect(() => {
    const places = app.placeReminders.filter((place) => place.on);
    if (!places.length || !navigator.geolocation?.watchPosition) return undefined;
    const activeIds = new Set(places.map((place) => place.id));
    [...inside.current.keys()].forEach((id) => {
      if (!activeIds.has(id)) inside.current.delete(id);
    });
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        places.forEach((place) => {
          const nowInside = distanceMetres(coords, place) <= place.radius;
          const wasInside = inside.current.get(place.id);
          inside.current.set(place.id, nowInside);
          if (nowInside && wasInside === false) {
            showNotification(place.label, {
              body: 'You entered the saved area. Open your shopping list.',
              tag: `place-${place.id}`,
            });
          }
        });
      },
      () => showNotification('Location reminder paused', {
        body: 'Forq could not read your location. Check site permissions before relying on this reminder.',
        tag: 'place-location-error',
      }),
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch?.(watchId);
  }, [app.placeReminders]);

  return null;
}

function StorageRecovery() {
  const app = useApp();
  const fileRef = useRef(null);
  const [status, setStatus] = useState('');
  const restore = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = app.restoreData(await file.text());
    setStatus(result.ok ? 'Backup restored.' : result.error);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-5 py-10">
      <section className="card w-full space-y-4 p-5" aria-labelledby="recovery-title">
        <AlertTriangle size={24} style={{ color: 'var(--warn)' }} />
        <div>
          <h1 id="recovery-title" className="text-xl font-extrabold">Saved data needs attention</h1>
          <p className="mt-1 text-[0.8125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
            {app.storageIssue.message} Download the original data first, then restore a valid Forq backup or start again.
          </p>
        </div>
        <div className="grid gap-2">
          {app.storageIssue.raw && (
            <button
              className="press rounded-2xl border px-4 py-3 text-[0.8125rem] font-extrabold"
              style={{ borderColor: 'var(--line)' }}
              onClick={() => downloadFile('forq-unreadable-data.json', app.storageIssue.raw, 'application/json')}
            >
              <span className="inline-flex items-center gap-2"><Download size={15} /> Download original data</span>
            </button>
          )}
          <button
            className="press rounded-2xl px-4 py-3 text-[0.8125rem] font-extrabold"
            style={{ background: 'var(--ink)', color: 'var(--bg)' }}
            onClick={() => fileRef.current?.click()}
          >
            <span className="inline-flex items-center gap-2"><Upload size={15} /> Restore a backup</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Restore Forq backup"
            onChange={restore}
          />
          <button className="press px-4 py-2 text-[0.75rem] font-bold" style={{ color: 'var(--danger)' }} onClick={app.reset}>
            Start with an empty app
          </button>
        </div>
        {status && <p role="status" className="text-[0.75rem] font-semibold">{status}</p>}
      </section>
    </main>
  );
}

function Shell() {
  const app = useApp();
  const [tab, setTab] = useState('home');
  /* Product modes take screens off the bar. Home is never one of them, so
     there is always somewhere to be — and a mode turned off later puts the tab
     straight back, with everything that was recorded while it was hidden. */
  const tabs = TABS.filter((item) => app.visibleTabs(TABS.map((t) => t.id)).includes(item.id));
  // Turning a mode on while standing on a screen it hides puts you on Home
  // rather than on a blank one. Nothing about that screen's data changes.
  const activeTab = tabs.some((item) => item.id === tab) ? tab : 'home';
  const [recipe, setRecipe] = useState(null);
  const [recipeStartCooking, setRecipeStartCooking] = useState(false);
  const [pantryOpen, setPantryOpen] = useState(false);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [guidanceView, setGuidanceView] = useState('next');
  const [launcher, setLauncher] = useState(null); // search · quick
  const [notice, setNotice] = useState('');
  const [shopAdd, setShopAdd] = useState(0);
  const [pantryAdd, setPantryAdd] = useState(0);
  const [pantryQuery, setPantryQuery] = useState('');
  const [planFocus, setPlanFocus] = useState(null);
  const noticeTimer = useRef(null);
  const completedGoals = useRef(null);
  const analyticsOpened = useRef(false);
  const pulseTimer = useRef(null);
  // Which logging sheet the diary should open with, when arriving from Home.
  const [logIntent, setLogIntent] = useState(null);

  const openRecipe = (r, options = null) => {
    setRecipeStartCooking(Boolean(options?.startCooking));
    setRecipe(r);
  };
  const goLog = (intent = null) => {
    setLogIntent(intent);
    setTab('log');
    recordProductEvent('screen_viewed', { screen: 'log', intent: typeof intent === 'string' ? intent : 'shortcut' });
  };
  const flash = (message) => {
    clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(''), 2200);
  };
  const undo = () => {
    const undone = app.undoLast();
    flash(undone ? 'Undid last action' : 'Nothing to undo');
    return undone;
  };
  const runCommand = (target) => {
    const tabIds = new Set(TABS.map((item) => item.id));
    if (tabIds.has(target)) setTab(target);
    else if (target === 'pantry') setPantryOpen(true);
    else if (target === 'add-food') goLog('add');
    else if (target === 'barcode') goLog('barcode');
    else if (target === 'assistant') { setGuidanceView('ask'); setGuidanceOpen(true); }
    else if (target === 'undo') undo();
  };
  const runResult = (result) => {
    setLauncher(null);
    if (result.type === 'recipe') openRecipe(result.item);
    else if (result.type === 'pantry') { setPantryQuery(result.title); setPantryOpen(true); }
    else if (result.type === 'shopping') setTab('shop');
    else if (result.type === 'food') goLog({ sheet: 'add', query: result.title });
    else if (result.target === 'add-food' && result.query) goLog({ sheet: 'add', query: result.query });
    else runCommand(result.target);
  };
  const runQuick = (id) => {
    setLauncher(null);
    if (id === 'food') goLog('add');
    else if (id === 'shopping') { setShopAdd((value) => value + 1); setTab('shop'); }
    else if (id === 'pantry') { setPantryAdd((value) => value + 1); setPantryOpen(true); }
    else if (id === 'plan') setTab('plan');
    else if (id === 'water') app.addWaterMl(250);
    else if (id === 'assistant') { setGuidanceView('ask'); setGuidanceOpen(true); }
    else if (id === 'undo') undo();
  };
  const addQuickShopping = (name) => {
    const trimmed = name?.trim();
    if (!trimmed) return;
    app.addToList({ name: trimmed });
    setLauncher(null);
    setShopAdd((value) => value + 1);
    setTab('shop');
  };

  // Pulse: hand the host app a snapshot of the kitchen at most once a second.
  // The snapshot is numbers with dates/context, never live state — the host
  // cannot reach into Forq, it only hears what's happened here.
  useEffect(() => {
    if (!app.onboarded) return undefined;
    clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => pulseForq(app), 600);
    return () => clearTimeout(pulseTimer.current);
  });

  useEffect(() => {
    if (!app.onboarded) return undefined;
    const onKey = (event) => {
      const tag = event.target?.tagName?.toLowerCase();
      const typing = ['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setLauncher('search');
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !typing) {
        event.preventDefault();
        undo();
      } else if (!typing && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'q') {
        setLauncher('quick');
      } else if (!typing && !launcher && /^[1-6]$/.test(event.key)) {
        setTab((tabs[Number(event.key) - 1] || tabs[0]).id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  useEffect(() => {
    const count = app.game.daily.filter((goal) => goal.done).length;
    if (completedGoals.current !== null && count > completedGoals.current) haptic();
    completedGoals.current = count;
  }, [app.game.daily]);

  useEffect(() => {
    if (!app.onboarded || analyticsOpened.current) return undefined;
    analyticsOpened.current = true;
    recordProductEvent('app_opened');
    const flush = () => { flushProductEvents(); };
    window.addEventListener('forq-product-event', flush);
    window.addEventListener('forq-analytics-consent', flush);
    window.addEventListener('online', flush);
    flush();
    return () => {
      window.removeEventListener('forq-product-event', flush);
      window.removeEventListener('forq-analytics-consent', flush);
      window.removeEventListener('online', flush);
    };
  }, [app.onboarded]);

  /* Screens still ask to go to "profile" — it just isn't a tab any more, it's
     the sheet behind the avatar. Routing it here means nothing that pointed at
     it had to learn where it went. */
  const goTab = (id, context = null) => {
    if (id === 'profile') return setProfileOpen(true);
    setPlanFocus(id === 'plan' ? context?.date || null : null);
    setTab(id);
    recordProductEvent('screen_viewed', { screen: id });
    window.scrollTo({ top: 0 });
  };

  if (app.storageIssue?.kind === 'corrupt') return <StorageRecovery />;

  // Nothing is pre-filled, so the first run asks for the little it needs.
  if (!app.onboarded) {
    return <Onboarding />;
  }

  return (
    <div className="app-shell min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* The first stop for a keyboard or switch user: past the chrome, into
          the day. Invisible until it has focus. */}
      <a href="#main" className="skip-link">Skip to content</a>

      <div className="app-workspace">
        <AppHeader
          tab={activeTab}
          onProfile={() => setProfileOpen(true)}
          onGuidance={() => { setGuidanceView('next'); setGuidanceOpen(true); }}
        />

        {/* Room at the foot for the tab bar and the screen's primary action. */}
        <main id="main" tabIndex={-1} className="app-main pb-44">
          {app.storageIssue && (
            <div role="alert" className="mx-5 mt-4 flex items-start gap-2 rounded-2xl border p-3" style={{ borderColor: 'var(--warn)' }}>
              <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--warn)' }} />
              <p className="text-[0.75rem] font-semibold leading-relaxed">{app.storageIssue.message}</p>
            </div>
          )}
          {activeTab === 'home' && (
            <HomeTab
              openRecipe={openRecipe}
              openPantry={() => setPantryOpen(true)}
              openGuidance={(view = 'next') => { setGuidanceView(view); setGuidanceOpen(true); }}
              goTab={goTab}
              goLog={goLog}
            />
          )}
          <Suspense fallback={<ScreenFallback />}>
            {activeTab === 'plan' && <PlanTab openRecipe={openRecipe} goTab={goTab} focusDate={planFocus} />}
            {activeTab === 'log' && <LogTab initialSheet={logIntent} onIntentUsed={() => setLogIntent(null)} />}
            {activeTab === 'shop' && <ShopTab quickAddKey={shopAdd} onOpenPantry={() => setPantryOpen(true)} />}
            {activeTab === 'recipes' && <RecipesTab openRecipe={openRecipe} />}
          </Suspense>
        </main>
      </div>

      {/* The coach is in the header now — a floating button here would sit on
          top of the screen's primary action. The launcher keeps its corner,
          raised clear of that bar. */}
      <Suspense fallback={null}>
        <LauncherButtons onSearch={() => setLauncher('search')} onQuickAdd={() => setLauncher('quick')} />
      </Suspense>

      {/* Bottom navigation on phones, sidebar on larger screens. */}
      <nav
        className="app-nav glass"
        style={{ borderColor: 'var(--line)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Main navigation"
      >
        <div className="app-brand">
          <img src="/logo.svg" alt="" width={36} height={36} className="h-9 w-9 rounded-xl" aria-hidden="true" />
          <div>
            <p className="text-[1.0625rem] font-black tracking-tight">Forq</p>
            <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>Food, sorted.</p>
          </div>
        </div>
        <div className="app-nav-items">
          {tabs.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => goTab(id)}
                className={cx('app-nav-item press', active && 'is-active')}
                aria-current={active ? 'page' : undefined}
                // The colour says which tab you're on; the weight says it again,
                // for anyone who can't see the difference.
                style={{ color: active ? 'var(--accent)' : 'var(--muted)' }}
              >
                <Icon size={21} strokeWidth={active ? 2.4 : 1.8} />
                <span className={cx('app-nav-label', active ? 'font-extrabold' : 'font-semibold')}>{label}</span>
              </button>
            );
          })}
        </div>
        <p className="app-nav-hint"><kbd>⌘ K</kbd> Search anything</p>
      </nav>

      {/* Overlays */}
      <Sheet open={!!recipe} onClose={() => { setRecipe(null); setRecipeStartCooking(false); }} full>
        <Suspense fallback={<ScreenFallback />}>
          {recipe && <RecipeDetail recipe={recipe} onClose={() => { setRecipe(null); setRecipeStartCooking(false); }} goTab={goTab} startCooking={recipeStartCooking} />}
        </Suspense>
      </Sheet>
      <Sheet open={pantryOpen} onClose={() => { setPantryOpen(false); setPantryQuery(''); }} title="Smart pantry">
        <Suspense fallback={<ScreenFallback />}>
          <PantryView
            quickAddKey={pantryAdd}
            initialQuery={pantryQuery}
            onPlan={() => {
              setPantryOpen(false);
              setPantryQuery('');
              goTab('plan');
            }}
          />
        </Suspense>
      </Sheet>
      <Sheet open={profileOpen} onClose={() => setProfileOpen(false)} title="You">
        <ProfileTab openGuidance={() => {
          setProfileOpen(false);
          setGuidanceView('next');
          setGuidanceOpen(true);
        }} />
      </Sheet>
      <Sheet open={guidanceOpen} onClose={() => setGuidanceOpen(false)} title="Guidance">
        <Suspense fallback={<ScreenFallback />}>
          <GuidancePanel
            key={`${guidanceOpen}-${guidanceView}`}
            initialView={guidanceView}
            onNavigate={(target, intent) => {
              setGuidanceOpen(false);
              if (target === 'log') goLog(intent || null);
              else goTab(target);
            }}
            onOpenPantry={() => {
              setGuidanceOpen(false);
              setPantryOpen(true);
            }}
            onOpenProfile={() => {
              setGuidanceOpen(false);
              setProfileOpen(true);
            }}
          />
        </Suspense>
      </Sheet>
      <Suspense fallback={null}>
        {launcher === 'search' && <CommandPalette open onClose={() => setLauncher(null)} onRun={runResult} />}
        {launcher === 'quick' && <QuickAdd open onClose={() => setLauncher(null)} onRun={runQuick} onAddShopping={addQuickShopping} />}
      </Suspense>
      {notice && (
        <div
          role="status"
          className="app-toast fixed left-1/2 bottom-40 z-[70] -translate-x-1/2 rounded-full px-4 py-2 text-[0.78125rem] font-extrabold"
          style={{ background: 'var(--ink)', color: 'var(--bg)', boxShadow: 'var(--shadow-lg)' }}
        >
          {notice}
        </div>
      )}
      <GeofenceWatcher />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
