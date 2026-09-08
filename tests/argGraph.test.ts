import { describe, expect, it } from "vitest";
import { emptyGraph, scoreGraph, validateGraph, type ArgGraph } from "../src/legacy/debate/argGraph";

const graphWith = (overrides: Partial<ArgGraph>): ArgGraph => ({ ...emptyGraph(), ...overrides });
const node = (id: string, kind: "claim" | "evidence" = "claim") => ({ id, kind, owner: "a" as const, text: id, round: 1, ...(kind === "evidence" ? { evidenceStrength: "cited" as const } : {}) });

describe("validateGraph defensive boundaries", () => {
  it("rejects duplicate nodes, self edges, duplicate edges, and cycles", () => {
    const errors = validateGraph(graphWith({
      nodes: [node("a"), node("a"), node("b")],
      edges: [
        { from: "a", to: "a", relation: "supports" },
        { from: "a", to: "b", relation: "supports" },
        { from: "a", to: "b", relation: "supports" },
        { from: "b", to: "a", relation: "rebuts" },
      ],
    }));
    expect(errors).toEqual(expect.arrayContaining([
      "Duplicate node id a",
      "Self-referential edge a",
      "Duplicate edge a:b:supports",
      "Graph contains a cycle",
    ]));
  });

  it("rejects dangling references and invalid rounds", () => {
    const errors = validateGraph(graphWith({
      nodes: [{ ...node("claim"), round: -1 }],
      edges: [{ from: "claim", to: "missing", relation: "supports" }],
      dropped: [{ nodeId: "missing", text: "x", owner: "a", round: 1 }],
      concessions: [{ nodeId: "missing", by: "a", note: "x" }],
    }));
    expect(errors).toEqual(expect.arrayContaining([
      "Node claim has an invalid round",
      "Edge to unknown node missing",
      "Dropped missing not in nodes",
      "Concession missing not in nodes",
    ]));
  });

  it("requires citations for cited and strong evidence", () => {
    const errors = validateGraph(graphWith({
      nodes: [node("evidence", "evidence")],
    }));
    expect(errors).toContain("Evidence evidence is cited but has no citations");
  });

  it("returns an explainable, cautious score breakdown", () => {
    const graph = graphWith({
      nodes: [
        { ...node("a-claim"), owner: "a" },
        { ...node("a-evidence", "evidence"), owner: "a", citations: [{ sourceName: "Source" }] },
        { ...node("b-claim"), owner: "b" },
        { ...node("b-evidence", "evidence"), owner: "b", evidenceStrength: "anecdotal" },
      ],
      edges: [{ from: "a-evidence", to: "a-claim", relation: "supports" }],
    });
    const result = scoreGraph(graph);
    expect(result.verdict).toBe("a");
    expect(result.claimCoverage).toBeGreaterThan(0);
    expect(result.evidence).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});
