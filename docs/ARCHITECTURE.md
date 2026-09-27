# Forq architecture notes

Short notes on the decisions that are easy to undo by accident. Each one says
what the code does, why, and what would break if it were changed.

## The catalogue ships in two tiers, and the split follows the product hierarchy

`src/data/foods.js` and `src/data/recipes.js` are read by the core loop on the
first paint, so they are the app's startup cost. They are deliberately not
symmetrical:

| Tier | Ships in the first paint | Loads on demand |
| --- | --- | --- |
| Foods | **Everything** — generics, store cupboard, barcoded branded rows, restaurant menus, every expansion wave | nothing |
| Recipes | Signature dishes, the generated book, and the 300/600/900 shelves — the pool planning draws from | the hand-written expansion shelves (`recipes-full.js`) |

Why foods are eager: matching a spoken sentence, reading a photographed plate,
scanning a barcode and searching the catalogue are all core-loop actions, and
all of them have to answer from the whole book immediately, offline, with no
fetch in between. Deferring food waves makes the app quietly lose foods from
the log, the matcher and the search — which is exactly the "accurate shopping
list" promise, broken quietly.

Why recipe shelves can wait: planning draws from the eager pool, which is over
a thousand dishes. The hand-written shelves are browse depth on top of it. They
append to the same live `RECIPES` array, so nothing downstream changes, and
`AppProvider` re-derives once when they land (see `catalogueComplete` in
`src/lib/store.jsx`) so search and browse see the whole book.

Both `FOODS` and `RECIPES` are live arrays that every wave registers into, first
registration wins, so ids stay unique and the everyday rows keep their place at
the front of a search. `registerFood` is also how a food the user creates at
runtime joins the catalogue.

`tests/catalogue-loader.test.js` pins all of this, including that a second load
appends nothing twice.

If a future pass makes the food catalogue smaller, it has to keep this
contract: every food answerable synchronously. The way to do that is a more
compact *encoding* of the same rows, not a deferred chunk.

## Performance budgets

`scripts/performance-budgets.json` holds the budgets, each with its reason, and
`scripts/check-performance-budgets.mjs` measures them. Run with
`node scripts/check-performance-budgets.mjs --require-builds --only=.` after a
build; CI runs the same command.

The old budget was a single number — all browser assets under 16 MB — which sat
so far above reality (2.55 MB) that nothing could ever fail it. The current set
measures the wait a first-time visitor actually has:

| Budget | Limit | Measured |
| --- | --- | --- |
| App + catalogue chunks, gzipped | 300 KB | 284 KB across 5 chunks |
| App + catalogue chunks, uncompressed | 920 KB | 881 KB across 5 chunks |
| Largest single JS chunk | 800 KB | 726 KB |
| All browser assets | 3.34 MB | 2.55 MB |
| Catalogue source shipped eagerly | 800 KB | 83 modules, 569 KB |
| Client JS chunk count | 60 | 42 |

The app chunks are found by strings only the data can contain (a generic food,
a signature dish, a generated recipe id). If a rename means none of them match,
the check **fails** rather than passing at zero — a budget nobody can trip is
not a budget.

Raising a limit is allowed, but it is a decision about what a first-time
visitor waits for, and belongs in the commit that makes it.

## Household concurrency

Shared state is merged, not overwritten. `src/lib/state-merge.js` holds the pure
three-way merge mechanics; `src/lib/household-merge.js` applies them to the
whole household state; `src/lib/household-concurrency.js` keeps the shopping
list's established conflict behaviour on top of it.

The rule, everywhere: the base is the copy both devices last agreed on, so a
change made on one side only always wins, a change made identically on both is
no conflict, and a change made *differently* on both is never settled by a
silent winner — it waits for a person, on the surface that owns it (List,
Plan, Pantry). A failed push never moves the base, so the base cannot drift
towards an edit the household never saw.
