// Argument graph: claim → evidence → counterclaim → rebuttal → impact
export type ArgNodeKind = "claim" | "evidence" | "counterclaim" | "rebuttal" | "impact";
export type Owner = "a" | "b" | "ai";
export type EvidenceStrength = "anecdotal" | "general" | "cited" | "strong";
export type Fallacy = "strawman" | "ad_hominem" | "false_dilemma" | "slippery_slope" | "appeal_to_emotion" | "hasty_generalization" | "appeal_to_authority" | "whataboutism" | "begging_the_question" | "equivocation" | "none";
export interface EvidenceCitation { sourceName: string; homepage?: string; excerpt?: string; }
export interface ArgNode { id: string; kind: ArgNodeKind; owner: Owner; text: string; round: number; evidenceStrength?: EvidenceStrength; citations?: EvidenceCitation[]; targets?: string[]; fallacy?: Fallacy; }
export interface ArgEdge { from: string; to: string; relation: "supports" | "counters" | "rebuts" | "impacts"; }
export interface DroppedArgument { nodeId: string; text: string; owner: Owner; round: number; }
export interface Contradiction { a: string; b: string; explanation: string; owner: Owner; }
export interface Concession { nodeId: string; by: Owner; note: string; }
export interface EvidenceStats { total: number; byOwner: Record<Owner, number>; byStrength: Record<EvidenceStrength, number>; unsupportedClaimIds: string[]; }
export interface FallacyTag { nodeId: string; fallacy: Fallacy; note: string; }
export interface ImpactComparison { a: number; b: number; rationale: string; }
export interface ArgGraph { nodes: ArgNode[]; edges: ArgEdge[]; dropped: DroppedArgument[]; contradictions: Contradiction[]; concessions: Concession[]; fallacies: FallacyTag[]; evidenceStats: EvidenceStats; impactComparison: ImpactComparison | null; }
export interface GraphScoreBreakdown { evidence: number; claimCoverage: number; rebuttalCoverage: number; droppedArguments: number; fallacies: number; total: number; confidence: number; verdict: "a" | "b" | "too-close" | "undetermined"; }

export function unsupportedClaims(graph: ArgGraph): ArgNode[] { const ids = new Set(graph.evidenceStats.unsupportedClaimIds); return graph.nodes.filter((n) => n.kind === "claim" && ids.has(n.id)); }
export function emptyGraph(): ArgGraph { return { nodes: [], edges: [], dropped: [], contradictions: [], concessions: [], fallacies: [], evidenceStats: { total: 0, byOwner: { a: 0, b: 0, ai: 0 }, byStrength: { anecdotal: 0, general: 0, cited: 0, strong: 0 }, unsupportedClaimIds: [] }, impactComparison: null }; }
export function groundedEvidenceRatio(graph: ArgGraph): number { const ev = graph.nodes.filter((n) => n.kind === "evidence"); if (!ev.length) return 1; return ev.filter((n) => (n.citations?.length ?? 0) > 0 && n.evidenceStrength !== "anecdotal").length / ev.length; }
export function claimCoverageWithGroundedEvidence(graph: ArgGraph): number { const claims = graph.nodes.filter((n) => n.kind === "claim"); if (!claims.length) return 1; const grounded = new Set(graph.nodes.filter((n) => n.kind === "evidence" && (n.citations?.length ?? 0) > 0).map((n) => n.id)); const supported = new Set<string>(); for (const e of graph.edges) if (e.relation === "supports" && grounded.has(e.from)) supported.add(e.to); return claims.filter((c) => supported.has(c.id) && !graph.evidenceStats.unsupportedClaimIds.includes(c.id)).length / claims.length; }

function hasCycle(nodes: Set<string>, edges: ArgEdge[]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) { const list = adjacency.get(edge.from) ?? []; list.push(edge.to); adjacency.set(edge.from, list); }
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string): boolean => { if (visiting.has(id)) return true; if (visited.has(id)) return false; visiting.add(id); for (const next of adjacency.get(id) ?? []) if (nodes.has(next) && visit(next)) return true; visiting.delete(id); visited.add(id); return false; };
  return [...nodes].some(visit);
}

export function validateGraph(graph: ArgGraph): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const node of graph.nodes) { if (!node.id?.trim()) errors.push("Node has an empty id"); else if (ids.has(node.id)) errors.push(`Duplicate node id ${node.id}`); ids.add(node.id); if (!Number.isInteger(node.round) || node.round < 0) errors.push(`Node ${node.id} has an invalid round`); }
  const edgeKeys = new Set<string>();
  for (const edge of graph.edges) {
    if (!ids.has(edge.from)) errors.push(`Edge from unknown node ${edge.from}`);
    if (!ids.has(edge.to)) errors.push(`Edge to unknown node ${edge.to}`);
    if (edge.from === edge.to) errors.push(`Self-referential edge ${edge.from}`);
    const key = `${edge.from}:${edge.to}:${edge.relation}`; if (edgeKeys.has(key)) errors.push(`Duplicate edge ${key}`); edgeKeys.add(key);
  }
  if (hasCycle(ids, graph.edges)) errors.push("Graph contains a cycle");
  for (const id of graph.evidenceStats.unsupportedClaimIds) if (!ids.has(id)) errors.push(`Unsupported claim id ${id} not in nodes`);
  for (const dropped of graph.dropped) if (!ids.has(dropped.nodeId)) errors.push(`Dropped ${dropped.nodeId} not in nodes`);
  for (const contradiction of graph.contradictions) { if (!ids.has(contradiction.a)) errors.push(`Contradiction a=${contradiction.a} not in nodes`); if (!ids.has(contradiction.b)) errors.push(`Contradiction b=${contradiction.b} not in nodes`); if (contradiction.a === contradiction.b) errors.push(`Contradiction ${contradiction.a} references itself`); }
  for (const concession of graph.concessions) if (!ids.has(concession.nodeId)) errors.push(`Concession ${concession.nodeId} not in nodes`);
  for (const fallacy of graph.fallacies) if (!ids.has(fallacy.nodeId)) errors.push(`Fallacy ${fallacy.nodeId} not in nodes`);
  for (const node of graph.nodes) if (node.kind === "evidence" && (node.evidenceStrength === "cited" || node.evidenceStrength === "strong")) { if (!node.citations?.length) errors.push(`Evidence ${node.id} is ${node.evidenceStrength} but has no citations`); else if (node.citations.some((citation) => !citation.sourceName?.trim())) errors.push(`Evidence ${node.id} has an empty citation sourceName`); }
  return [...new Set(errors)];
}

export function claimSupportMap(graph: ArgGraph): Map<string, boolean> { const supported = new Set<string>(); for (const edge of graph.edges) if (edge.relation === "supports") { supported.add(edge.to); supported.add(edge.from); } const map = new Map<string, boolean>(); for (const node of graph.nodes) if (node.kind === "claim") map.set(node.id, supported.has(node.id)); for (const id of graph.evidenceStats.unsupportedClaimIds) map.set(id, false); return map; }

export function scoreGraph(graph: ArgGraph): GraphScoreBreakdown {
  const claimsByOwner = { a: graph.nodes.filter((n) => n.kind === "claim" && n.owner === "a"), b: graph.nodes.filter((n) => n.kind === "claim" && n.owner === "b") };
  const evidenceByOwner = { a: graph.nodes.filter((n) => n.kind === "evidence" && n.owner === "a"), b: graph.nodes.filter((n) => n.kind === "evidence" && n.owner === "b") };
  const rebuttalsByOwner = { a: graph.nodes.filter((n) => n.kind === "rebuttal" && n.owner === "a"), b: graph.nodes.filter((n) => n.kind === "rebuttal" && n.owner === "b") };
  const ratio = (items: ArgNode[], predicate: (node: ArgNode) => boolean) => items.length ? items.filter(predicate).length / items.length : 0;
  const evidence = { a: ratio(evidenceByOwner.a, (n) => (n.citations?.length ?? 0) > 0 && n.evidenceStrength !== "anecdotal"), b: ratio(evidenceByOwner.b, (n) => (n.citations?.length ?? 0) > 0 && n.evidenceStrength !== "anecdotal") };
  const coverage = { a: claimsByOwner.a.length ? claimCoverageWithGroundedEvidence({ ...graph, nodes: claimsByOwner.a.concat(evidenceByOwner.a), edges: graph.edges }) : 0, b: claimsByOwner.b.length ? claimCoverageWithGroundedEvidence({ ...graph, nodes: claimsByOwner.b.concat(evidenceByOwner.b), edges: graph.edges }) : 0 };
  const rebuttal = { a: ratio(rebuttalsByOwner.a, (n) => Boolean(n.targets?.length)), b: ratio(rebuttalsByOwner.b, (n) => Boolean(n.targets?.length)) };
  const dropped = { a: graph.dropped.filter((d) => d.owner === "a").length, b: graph.dropped.filter((d) => d.owner === "b").length };
  const fallacies = { a: graph.fallacies.filter((f) => graph.nodes.find((n) => n.id === f.nodeId)?.owner === "a" && f.fallacy !== "none").length, b: graph.fallacies.filter((f) => graph.nodes.find((n) => n.id === f.nodeId)?.owner === "b" && f.fallacy !== "none").length };
  const value = (owner: "a" | "b") => evidence[owner] * 0.3 + coverage[owner] * 0.35 + rebuttal[owner] * 0.25 - dropped[owner] * 0.05 - fallacies[owner] * 0.05;
  const scores = { a: value("a"), b: value("b") }; const total = Math.max(scores.a, scores.b); const gap = Math.abs(scores.a - scores.b);
  const verdict = total === 0 ? "undetermined" : gap < 0.1 ? "too-close" : scores.a > scores.b ? "a" : "b";
  return { evidence: scores.a - scores.b, claimCoverage: coverage.a - coverage.b, rebuttalCoverage: rebuttal.a - rebuttal.b, droppedArguments: dropped.b - dropped.a, fallacies: fallacies.b - fallacies.a, total: scores.a - scores.b, confidence: total === 0 ? 0 : Math.min(0.99, 0.5 + gap), verdict };
}
