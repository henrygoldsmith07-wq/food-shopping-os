export const DEMO_DEBATE = {
  motion: 'Schools should teach media literacy as a core subject.',
  sides: [
    { id: 'for', label: 'For', accent: '#2f6f52' },
    { id: 'against', label: 'Against', accent: '#8b4b4b' },
  ],
  nodes: [
    { id: 'c1', side: 'for', type: 'claim', label: 'Students face an increasingly complex information environment.' },
    { id: 'e1', side: 'for', type: 'evidence', label: 'Media-literacy practice improves source evaluation.' },
    { id: 'c2', side: 'against', type: 'claim', label: 'The timetable is already overloaded.' },
    { id: 'r1', side: 'for', type: 'rebuttal', label: 'A short, cross-curricular unit can teach the skill without adding a full subject.' },
    { id: 'd1', side: 'against', type: 'dropped', label: 'Schools cannot agree on a neutral definition.' },
  ],
  edges: [
    { from: 'e1', to: 'c1', label: 'supports' },
    { from: 'c2', to: 'c1', label: 'challenges' },
    { from: 'r1', to: 'c2', label: 'rebuts' },
    { from: 'd1', to: 'c2', label: 'extends' },
  ],
  graph: {
    nodes: [
      { id: 'c1', kind: 'claim', owner: 'a', text: 'Students face an increasingly complex information environment.', round: 1 },
      { id: 'e1', kind: 'evidence', owner: 'a', text: 'Media-literacy practice improves source evaluation.', round: 1, evidenceStrength: 'cited', citations: [{ sourceName: 'Education research review' }] },
      { id: 'c2', kind: 'claim', owner: 'b', text: 'The timetable is already overloaded.', round: 1 },
      { id: 'r1', kind: 'rebuttal', owner: 'a', text: 'A short, cross-curricular unit can teach the skill without adding a full subject.', round: 2, targets: ['c2'] },
      { id: 'd1', kind: 'claim', owner: 'b', text: 'Schools cannot agree on a neutral definition.', round: 2 },
    ],
    edges: [
      { from: 'e1', to: 'c1', relation: 'supports' },
      { from: 'r1', to: 'c2', relation: 'rebuts' },
    ],
    dropped: [{ nodeId: 'd1', text: 'Schools cannot agree on a neutral definition.', owner: 'b', round: 2 }],
    contradictions: [], concessions: [], fallacies: [],
    evidenceStats: { total: 1, byOwner: { a: 1, b: 0, ai: 0 }, byStrength: { anecdotal: 0, general: 0, cited: 1, strong: 0 }, unsupportedClaimIds: ['c2', 'd1'] },
    impactComparison: null,
  },
  verdict: {
    winner: 'For',
    confidence: 'Medium',
    summary: 'For wins narrowly: it answered the strongest objection and connected its main claim to evidence.',
    signals: [
      ['Rebuttal coverage', 'For · 2 of 2 major objections answered'],
      ['Evidence quality', 'For · one relevant, qualified source'],
      ['Unsupported claims', 'Against · one claim left ungrounded'],
    ],
    uncertainty: 'This is not a landslide. A stronger timetable objection or better evidence on implementation could change the result.',
  },
  dna: [
    { label: 'Claims', forValue: 3, againstValue: 3 },
    { label: 'Evidence', forValue: 2, againstValue: 1 },
    { label: 'Rebuttals', forValue: 2, againstValue: 0 },
    { label: 'Dropped', forValue: 0, againstValue: 1 },
  ],
  coach: 'Lead with the mechanism: show exactly how the skill fits the timetable, then attach one verifiable example.',
};
