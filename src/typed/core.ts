/**
 * Strict core-loop contracts for the plan → shop → cook → learn hierarchy.
 * Checked with tsconfig.strict.json (strict: true). Zod remains the runtime
 * boundary; these types are the compile-time mirror that editor + CI check.
 */

export type IsoDate = `${number}-${number}-${number}`;
export type IsoDateTime = string;

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export interface PlannedEntry {
  date: IsoDate;
  slot: MealSlot;
  recipeId: string;
}

export type PlanMap = Record<string, Partial<Record<MealSlot, string>>>;

export type PantryTruth = 'confirmed_sufficient' | 'probably_available' | 'insufficient' | 'unknown';

export interface ShoppingRow {
  id: string;
  name: string;
  qty?: string;
  checked?: boolean;
  checkedAt?: number | null;
  checkedBy?: string | null;
  price?: number;
  priceSource?: string;
  aisle?: string;
  note?: string;
  fromRecipe?: string | null;
  autoListed?: boolean;
}

export interface PantryRow {
  id: string;
  name: string;
  qty?: string;
  cat?: string;
  expiry?: string;
  portions?: number;
  recipeId?: string;
}

export type PriceProvenanceSource =
  | 'receipt'
  | 'live'
  | 'manual'
  | 'retailer'
  | 'historical'
  | 'observed'
  | 'cached'
  | 'estimated'
  | 'scraped'
  | 'ai-extracted'
  | 'monid'
  | 'google-shopping';

export interface PriceObservation {
  name: string;
  price: number;
  source: PriceProvenanceSource;
  store?: string;
  observedAt?: string;
  url?: string;
}

export type ProvenanceKind = 'observed' | 'user-entered' | 'inferred' | 'model-generated' | 'stale' | 'unavailable' | 'estimated';

export interface ProvenanceLabel {
  kind: ProvenanceKind;
  source: string;
  at?: string;
  stale?: boolean;
}

export type PortionSource = 'configured' | 'learned';

export interface PortionDecision {
  portions: number;
  source: PortionSource;
  configured: number;
  override: number | 'auto';
  evidence: { observations: number; typical: number | null };
  autoPortions: number;
  autoLearned: boolean;
}

export type Confidence = 'high' | 'medium' | 'low' | 'none';

/** Minimum evidence before learning may change what the list asks for. */
export const MIN_OBSERVATIONS_FOR_ADAPTATION = 3;

export interface AdaptationEvidence {
  observations: number;
  rejections: number;
}

export function adaptationMayApply(evidence: AdaptationEvidence): boolean {
  if (evidence.rejections >= 2) return false;
  return evidence.observations >= MIN_OBSERVATIONS_FOR_ADAPTATION;
}

export function isValidShoppingRow(row: unknown): row is ShoppingRow {
  if (typeof row !== 'object' || row === null) return false;
  const r = row as Record<string, unknown>;
  return typeof r['id'] === 'string' && (r['id'] as string).length > 0
    && typeof r['name'] === 'string' && (r['name'] as string).trim().length > 0;
}

export function isValidPantryRow(row: unknown): row is PantryRow {
  if (typeof row !== 'object' || row === null) return false;
  const r = row as Record<string, unknown>;
  return typeof r['id'] === 'string' && (r['id'] as string).length > 0
    && typeof r['name'] === 'string' && (r['name'] as string).trim().length > 0;
}
