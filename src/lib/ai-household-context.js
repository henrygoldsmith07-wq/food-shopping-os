/**
 * Structured household context for AI tasks — bounded, privacy-filtered,
 * validated. The assistant operates over this, never raw household text.
 * Health-vault data is never included unless an explicit permitted pathway
 * requires it (none by default).
 */
export const householdContextForAI = (app = {}) => {
  const proposal = app.weeklyProposal || null;
  const insights = app.householdInsights || [];
  const decision = app.shopDecision || null;
  const budget = app.budgetDecision || null;
  return {
    weekSummary: proposal?.summary || null,
    proposedMeals: (proposal?.days || []).slice(0, 7).map((d) => ({ date: d.date, meal: d.recipe?.name || null, reasons: d.reasons || [] })),
    insights: insights.map((i) => ({ title: i.title, evidence: i.evidence, consequence: i.consequence, confidence: i.confidence })),
    shopOptions: (decision?.options || []).map((o) => ({ label: o.label, store: o.store, total: o.total, stores: o.stores })),
    budget: budget?.hasBudget ? { message: budget.message, over: budget.over } : null,
    pantryCount: (app.pantry || []).length,
    // Never: food names beyond the proposal, recipe text, health values,
    // prices beyond basket totals, private household content.
  };
};
