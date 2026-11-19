// Preconditions protect the entry being edited rather than blocking unrelated saves.
export function resultBasis(state,key){const match=state.matches[key];return JSON.stringify({concession:match.concession||null,holes:Object.entries(match.holes).map(([h,r])=>[h,r.markerA??null,r.markerB??null,r.refA??null,r.refB??null,r.concededTo??null,r.pendingConcession||null])});}
