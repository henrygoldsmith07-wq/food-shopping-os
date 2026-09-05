import { describe, expect, it } from "vitest";
import { KITCHEN_TOPICS, topicLabel } from "../src/domain/topic-labels";

// The kitchen-seeded topics read as proper names; anything else is prettified
// rather than shown as a raw id — a deck is for humans, not databases.

describe("topicLabel", () => {
  it("names the five fixed kitchen topics", () => {
    expect(topicLabel("shopping")).toBe("Shopping");
    expect(topicLabel("budget")).toBe("Budget");
    expect(topicLabel("pantry")).toBe("Pantry");
    expect(topicLabel("diary")).toBe("Food diary");
    expect(topicLabel("cooking")).toBe("Cooking");
    expect(Object.keys(KITCHEN_TOPICS)).toHaveLength(5);
  });

  it("prettifies unknown ids instead of showing them raw", () => {
    expect(topicLabel("membranes")).toBe("Membranes");
    expect(topicLabel("meal-planning")).toBe("Meal planning");
    expect(topicLabel("exam_season_2026")).toBe("Exam season 2026");
  });

  it("keeps the general default readable and empty ids honest", () => {
    expect(topicLabel("general")).toBe("General");
    expect(topicLabel("")).toBe("General");
    expect(topicLabel(null)).toBe("General");
    expect(topicLabel(undefined)).toBe("General");
  });
});
