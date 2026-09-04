import { describe, expect, it } from "vitest";
import {
  createCard,
  dayStamp,
  dueAfter,
  dueCards,
  gradeReview,
  isDue,
  rateCard,
  INITIAL_EASE,
  MIN_EASE,
  MAX_EASE,
} from "../src/domain/scheduling";
import type { Card } from "../src/domain/types";

// ---------------------------------------------------------------------------
// Fixtures: one card at a fixed review time. All dates are UTC so the day keys
// are stable no matter where the suite runs.
// ---------------------------------------------------------------------------

const NOW = new Date("2026-05-01T10:00:00Z");
const TOMORROW = new Date("2026-05-02T10:00:00Z");

function card(overrides: Partial<Card> = {}): Card {
  return {
    ...createCard(
      {
        id: "c1",
        userId: "local",
        subjectId: "bio",
        topicId: "t1",
        front: "Membrane structure?",
        back: "Phospholipid bilayer.",
        origin: "seed",
        specPointIds: ["bio.t1.sp-1"],
      },
      NOW,
    ),
    ...overrides,
  };
}

describe("first reviews graduate the card", () => {
  it("good: reps 1, 1-day interval, due tomorrow, ease untouched", () => {
    const next = gradeReview(card(), "good", NOW);
    expect(next.reps).toBe(1);
    expect(next.lapses).toBe(0);
    expect(next.ease).toBe(INITIAL_EASE);
    expect(next.intervalDays).toBe(1);
    expect(next.due).toBe("2026-05-02");
    expect(next.lastReviewedAt).toBe(NOW.toISOString());
  });

  it("easy: skips to a 2-day interval and lifts ease by the bonus", () => {
    const next = gradeReview(card(), "easy", NOW);
    expect(next.intervalDays).toBe(2);
    expect(next.due).toBe("2026-05-03");
    expect(next.ease).toBeCloseTo(INITIAL_EASE + 0.15, 5);
  });

  it("hard: graduates like good but never above it", () => {
    const next = gradeReview(card(), "hard", NOW);
    expect(next.intervalDays).toBe(1);
    expect(next.due).toBe("2026-05-02");
    expect(next.ease).toBe(INITIAL_EASE);
  });
});

describe("grown intervals compound at ease", () => {
  it("three goods climb 1 → 3 → 8 days", () => {
    let c = gradeReview(card(), "good", NOW); // fresh → 1
    expect(c.intervalDays).toBe(1);
    c = gradeReview(c, "good", TOMORROW); // 1 × 2.5 → 3
    expect(c.intervalDays).toBe(3);
    c = gradeReview(c, "good", new Date("2026-05-05T10:00:00Z")); // 3 × 2.5 → 8
    expect(c.intervalDays).toBe(8);
    expect(c.reps).toBe(3);
    expect(c.lapses).toBe(0);
  });

  it("keeps hard < good < easy from the same state", () => {
    const base = card({ reps: 1, intervalDays: 1, lastReviewedAt: "2026-04-30T10:00:00Z" });
    const hard = gradeReview(base, "hard", NOW).intervalDays;
    const good = gradeReview(base, "good", NOW).intervalDays;
    const easy = gradeReview(base, "easy", NOW).intervalDays;
    expect(hard).toBe(2);
    expect(good).toBe(3);
    expect(easy).toBe(4);
    expect(hard).toBeLessThan(good);
    expect(good).toBeLessThan(easy);
  });

  it("easy adds the ×1.3 bonus on top of the good interval", () => {
    const base = card({ reps: 1, intervalDays: 1, lastReviewedAt: "2026-04-30T10:00:00Z" });
    const good = gradeReview(base, "good", NOW).intervalDays; // 3
    const easy = gradeReview(base, "easy", NOW).intervalDays; // good 3 × 1.3 → 4
    expect(easy).toBeGreaterThan(good);
  });
});

describe("lapses: misses on cards already seen", () => {
  it("resets a graduated card to learning and records the lapse", () => {
    const graduated = gradeReview(card(), "good", NOW); // interval 1, seen once
    const next = gradeReview(graduated, "again", TOMORROW);
    expect(next.reps).toBe(2);
    expect(next.lapses).toBe(1);
    expect(next.ease).toBeCloseTo(INITIAL_EASE - 0.2, 5);
    expect(next.intervalDays).toBe(0);
    expect(next.due).toBe("2026-05-02"); // back on the review day
  });

  it("failing on first sight is learning, not a lapse — ease untouched", () => {
    const next = gradeReview(card(), "again", NOW);
    expect(next.reps).toBe(1);
    expect(next.lapses).toBe(0);
    expect(next.ease).toBe(INITIAL_EASE);
    expect(next.intervalDays).toBe(0);
    expect(next.due).toBe("2026-05-01");
  });

  it("a second miss on the same card does count as a lapse", () => {
    const first = gradeReview(card(), "again", NOW); // first sight
    const second = gradeReview(first, "again", TOMORROW); // seen once
    expect(second.lapses).toBe(1);
    expect(second.ease).toBeCloseTo(INITIAL_EASE - 0.2, 5);
  });

  it("ease never drops below the floor", () => {
    const worn = card({ reps: 9, lapses: 8, ease: MIN_EASE, intervalDays: 60 });
    const next = gradeReview(worn, "again", NOW);
    expect(next.ease).toBe(MIN_EASE);
    expect(next.lapses).toBe(9);
  });

  it("after a lapse the next success re-graduates to 1 day", () => {
    let c = gradeReview(card(), "good", NOW);
    c = gradeReview(c, "again", TOMORROW);
    c = gradeReview(c, "good", new Date("2026-05-02T12:00:00Z"));
    expect(c.intervalDays).toBe(1);
    expect(c.lapses).toBe(1);
  });
});

describe("due logic, caps and purity", () => {
  it("a fresh card is due today; a good review pushes it out to tomorrow", () => {
    const fresh = card();
    expect(isDue(fresh, NOW)).toBe(true);
    const pushed = gradeReview(fresh, "good", NOW);
    expect(isDue(pushed, NOW)).toBe(false);
    expect(isDue(pushed, TOMORROW)).toBe(true);
  });

  it("ease caps at MAX_EASE no matter how many easy reviews", () => {
    const hot = card({ reps: 20, ease: MAX_EASE, intervalDays: 90 });
    const next = gradeReview(hot, "easy", NOW);
    expect(next.ease).toBe(MAX_EASE);
  });

  it("never mutates the card it grades", () => {
    const before = card({ reps: 2, lapses: 1, ease: 2.1, intervalDays: 6, due: "2026-05-01" });
    const snapshot = JSON.stringify(before);
    gradeReview(before, "easy", NOW);
    gradeReview(before, "again", NOW);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("day keys stay stable across month boundaries", () => {
    const late = new Date("2026-05-31T23:00:00Z");
    expect(dayStamp(late)).toBe("2026-05-31");
    expect(dueAfter(late, 1)).toBe("2026-06-01");
    const throughYear = gradeReview(card(), "good", new Date("2026-12-31T10:00:00Z"));
    expect(throughYear.due).toBe("2027-01-01");
  });
});

describe("the review queue helpers", () => {
  it("collects only cards due on the day, soonest first", () => {
    const a = card({ id: "a", due: "2026-04-30" });
    const b = card({ id: "b", due: "2026-05-01" });
    const c = card({ id: "c", due: "2026-05-02" });
    expect(dueCards([c, a, b], NOW).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("breaks due-day ties by id so the queue is stable", () => {
    const z = card({ id: "z", due: "2026-05-01" });
    const y = card({ id: "y", due: "2026-05-01" });
    expect(dueCards([z, y], NOW).map((x) => x.id)).toEqual(["y", "z"]);
  });

  it("rateCard replaces the graded card and leaves the rest untouched", () => {
    const other = card({ id: "other" });
    const target = card({ id: "target" });
    const next = rateCard([other, target], "target", "good", NOW);
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ id: "target", reps: 1, intervalDays: 1, due: "2026-05-02" });
    expect(next[0]).toBe(other);
    expect(target.reps).toBe(0); // the input card was not mutated
  });

  it("rateCard with a missing id changes nothing", () => {
    const deck = [card()];
    expect(rateCard(deck, "ghost", "good", NOW)).toEqual(deck);
  });
});
