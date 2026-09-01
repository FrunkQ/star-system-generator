import { writable } from 'svelte/store';
import { HUB } from './hubConfig';

// WHETHER THIS GM WANTS THE SAVE FLOW TO OFFER THE MAP LIBRARY AT ALL (owner, 2026-09-01).
//
// TWO GATES, AND THEY ANSWER DIFFERENT QUESTIONS — which is why neither can stand in for the other:
//
//   HUB.uploadEnabled   does publishing EXIST yet? A build-time fact about the hub, not a choice.
//                       While the pairing endpoint and the attestation wording are owed, this is
//                       false and nothing about publishing renders for anybody.
//   hubSavesEnabled     does THIS PERSON want it in their way? A preference, per browser.
//
// The effective answer is both, and `hubSavesOffered` is the only thing the UI should ask.
//
// THIS SETTING NEVER TOUCHES OPENING. A `?hub=` link must work for anyone who is sent one - that is
// the entire funnel - and a local preference about publishing has no business breaking somebody
// else's link. Reading a shared map and publishing one are different acts and are gated separately.
//
// DEFAULT ON, and this is a deliberate call rather than an oversight: the setting controls whether a
// BUTTON is offered, not whether anything is published. Publishing still needs a paired account, an
// attestation that is never pre-ticked, and an explicit press - three deliberate acts after this
// one. A GM who would rather not see it turns it off here and it stays off.
const KEY = 'sse-hub-saves-enabled';
const initial = typeof window === 'undefined' || localStorage.getItem(KEY) !== '0';

export const hubSavesEnabled = writable<boolean>(initial);

if (typeof window !== 'undefined') {
  hubSavesEnabled.subscribe((v) => {
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* private mode */ }
  });
}

/** The only question the save UI should ask: is publishing both possible AND wanted? */
export function hubSavesOffered(userWants: boolean): boolean {
  return HUB.uploadEnabled && userWants;
}
