# The customisable loading screen

Owner, 2026-08-21. Inbox [[A63]].

**One flow, two fidelities.** V3.0 ships the flow with a SPINNER. V3.1 replaces the spinner with a
BAR. Nothing else about the flow changes, which is the point of writing it down once: the V3.1 work
is a transport change and a component swap, not a redesign.

    transition IN  ->  loading screen  ->  transition OUT  ->  the new screen

    ...unless it is fast (local, cached), in which case there is no loading screen and no second
    transition. One transition, straight to the new screen, exactly as before any of this existed.

> *"you transition to the transition screen and to a transition to the new screen. If local (cached)
> it just does a single transition"* — owner
>
> *"just now we have a spinner - a bar in 3.1"* — owner
>
> *"message is user defined per pack (Default - 'Incoming Transmission...')"* — owner
>
> *"The Interstitial should be an option - probably the default - message down low"* — owner

---

## What decides whether the loading screen appears at all

**A clock, not a size.** The GM announces (`SYNC_INCOMING`) immediately before sending the payload;
the receiver starts a grace timer and shows nothing yet. If the payload beats the timer the loading
screen never exists. If the timer wins, we are in a genuine wait and it appears.

This was measured rather than guessed, and the measurement is the whole reason the grace exists.
On a local session, sniffed off the real channel during a real join:

| t (ms) | message | bytes |
|---|---|---|
| 59932 | `REQUEST_STARMAP` | 4 |
| 59932 | `SYNC_INCOMING` | 50 |
| 59933 | `SYNC_STARMAP` | 45,743 |

**One millisecond.** Shown immediately, the holding state was created and destroyed inside a single
task and never got a frame to paint — measured at 9 ms alive, start to finish. The owner reported
"not seeing it at all", and that was correct behaviour badly expressed: there was nothing to wait
for. A size threshold would have been a guess about the transport; the clock already knows.

`RECEIVING_GRACE_MS = 400`. Below roughly this a human reads the change as instant; above it,
silence starts to read as broken.

## Where the words come from

Rule-pack data, `playerStrings.incoming`, default `"Incoming Transmission…"` in code so a pack that
omits it still works. It is IN-WORLD FLAVOUR and belongs to the GM's fiction, which is why it is not
a system string — the same reasoning that puts cover text and footer text on a preset.

Under the pack's headline sits a plain detail line that is ours, not the GM's: `27 systems, ~5.0 MB`.
A player who has waited ten seconds deserves a reason. The size is often absent (the first joiner
announces before the GM has ever sent a starmap, so there is nothing measured to quote) and the line
reads correctly without it.

## The presentation

**The interstitial is the default option**, and the message sits LOW — which is where
`QuoteInterstitial` already renders `statusText`, under the quote. That component was already the
waiting screen and the GM-paused screen; the loading state is its third thing to say, not a fourth
component. "Option" is deliberate: a future presentation (per transition, per preset) can replace it
without touching anything above.

## What V3.0 does NOT promise, and why

- **No progress, only presence.** PeerJS chunks internally and exposes no progress events, and the
  parse that follows arrives as one blocking call. A bar would be a fiction and, worse, a frozen
  fiction — the spinner itself stops dead the moment parsing begins, which is honest.
- **No transition INTO the loading screen on a COLD join.** The preset that names the transition
  arrives *with* the starmap, so on a first join there is no theme to play yet. A player already
  connected — a GM re-broadcast, a preset switch — gets both transitions today.

## V3.1: the bar

Everything above stays. The changes are:

1. **Chunk `SYNC_STARMAP` at the app level, with sequence numbers.** `sendPeer` already chunks for
   the 16 KB DataChannel frame, but *below* the message boundary, so the receiver learns nothing
   until the whole thing is reassembled. App-level chunks with `{ id, i, n }` give a real fraction.
   This is the same 16 KB-frame lesson Mappadux already paid for
   (`project_dmr_datachannel_frame_limit`).
2. **Swap the spinner for a bar** driven by that fraction. Same slot, same screen, same words.
3. **Incremental parse off the main thread where possible** — the freeze, not the transfer, is the
   larger half of the wait on a complex map. [[P2]]'s meters measured 33 s of stringify on the SEND
   side of these payloads.
4. **Close the cold-join gap** by putting the preset id in `SYNC_INCOMING`, so the themed transition
   can play INTO the loading screen on a first join too.
5. **Per-transition wording**, if wanted: the owner's original note has the message definable per
   transition as in-world flavour ("Receiving Transmission…", "Memory recall…"). The pack-level
   string is the fallback that already exists.

None of that changes the flow, the grace rule, or where the words live.
