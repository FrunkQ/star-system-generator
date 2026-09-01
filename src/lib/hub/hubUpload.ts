// R-04 / R-06: PUBLISHING A CAMPAIGN TO THE MAP LIBRARY, from inside the app.
//
// PARKED, ON PURPOSE, AND FULLY BUILT. `HUB.uploadEnabled` is false because the hub owes two things
// and NEITHER may be invented here:
//
//   1. THE DEVICE-CODE PAIRING ENDPOINT. R-06 was decided in favour of device-code pairing: the app
//      shows a code, the person approves it on the hub in their own browser, the app holds a token
//      it can be told to forget. No password ever reaches this app. The endpoint does not exist yet.
//   2. THE ATTESTATION WORDING, verbatim, from the hub's `src/lib/attestation.ts`. This one CANNOT
//      be stubbed even temporarily: the whole purpose of an attestation is that a person read the
//      actual words and took responsibility for them, so showing approximate words and sending
//      `attest=on` would be worse than not shipping it. A placeholder here would be a lie with a
//      tick box.
//
// Both are written up as a request in `docs/dev/hub-pairing-and-upload-request.md`. When they land,
// turning this on is `uploadEnabled: true` plus the real endpoint paths - not a feature.
//
// THREE RULES FROM THE HUB THAT ARE ENCODED BELOW RATHER THAN LEFT TO A CALLER:
//   - `attest` is NEVER pre-ticked. `publishRequest` refuses to build a body without an explicit
//     true, so "the default was on" cannot happen by editing a component.
//   - `publishGmTree` is NEVER defaulted on. Absent means the PLAYER tree, which is the safe one.
//   - `mayPublish` / `missingProvenance` come back from the upload and belong IN THE EDITOR, where
//     the credit fields are - not in a toast that scrolls away.
import { HUB } from './hubConfig';

/** What the hub answers with. Shapes owed by the hub; see the request document. */
export interface PublishResult {
  ok: boolean;
  /** The map's code on the hub, for the shareable link. */
  slug?: string;
  /** False when the map uploaded fine but cannot go public yet. NOT an error. */
  mayPublish?: boolean;
  /** Asset paths with no credit recorded - the exact list the editor should point at. */
  missingProvenance?: string[];
  /** A sentence for a person when something went wrong. */
  problem?: string;
}

export interface PublishOptions {
  /** The bundle or plain-JSON bytes, exactly as the save flow would have written them to disk. */
  bytes: Uint8Array;
  /** The file name the save flow chose, so the hub sees the same thing a manual upload would. */
  filename: string;
  /**
   * THE PERSON TICKED THE ATTESTATION BOX, having read the hub's own words. There is no default and
   * no way to pass this implicitly.
   */
  attest: boolean;
  /**
   * Publish the GM tree instead of the player one. ABSENT MEANS PLAYER, which is the redacted tree
   * `computePlayerSnapshot` produces. Never defaulted on: the wrong answer here leaks a campaign.
   */
  publishGmTree?: boolean;
  /** Updating an existing map rather than creating one. Only novel assets count against the quota. */
  replaces?: string;
  /** The paired token. Absent means not paired, which is a refusal rather than an anonymous upload. */
  token?: string;
}

/** Every reason this app will decline to attempt an upload, before any network call. */
export type PublishBlock =
  | { blocked: false }
  | { blocked: true; reason: string };

/**
 * Can this app publish at all right now? Asked before anything is shown, so a dead button never
 * appears - the reasons are ordered from "the feature does not exist" outwards.
 */
export function publishBlocked(opts: { paired: boolean; userEnabled: boolean }): PublishBlock {
  if (!HUB.uploadEnabled) {
    return { blocked: true, reason: 'Publishing to the map library is not switched on in this build yet.' };
  }
  if (!opts.userEnabled) {
    return { blocked: true, reason: 'Publishing to the map library is turned off in Settings.' };
  }
  if (!opts.paired) {
    return { blocked: true, reason: 'This app is not linked to a map-library account yet.' };
  }
  return { blocked: false };
}

/**
 * Build the multipart body for a publish. Exported separately from the request so the two rules
 * that matter can be tested without a network: an unticked attestation is refused outright, and an
 * absent `publishGmTree` is ABSENT rather than false-y-but-present.
 */
export function publishBody(opts: PublishOptions): FormData {
  if (opts.attest !== true) {
    throw new Error(
      'Refusing to publish without the provenance attestation. It is never pre-ticked and never ' +
      'assumed: the point of it is that a person read it and took responsibility.'
    );
  }
  const form = new FormData();
  form.append('file', new Blob([opts.bytes], { type: 'application/octet-stream' }), opts.filename);
  form.append('attest', 'on');
  // ABSENT means the player tree. Appending `publishGmTree=off` would be a different statement, and
  // a hub reading it as "present, therefore chosen" is exactly the ambiguity the hub warned about.
  if (opts.publishGmTree === true) form.append('publishGmTree', 'on');
  if (opts.replaces) form.append('replaces', opts.replaces);
  return form;
}

/**
 * Publish. Never throws for a network or hub failure - those come back as `problem`, because this
 * runs from a save flow where an exception would lose the GM's place. An unticked attestation DOES
 * throw, because that is a programming error in this app rather than something a person did.
 */
export async function publishToHub(opts: PublishOptions, fetchImpl: typeof fetch = fetch): Promise<PublishResult> {
  if (!HUB.uploadEnabled) {
    return { ok: false, problem: 'Publishing to the map library is not switched on in this build yet.' };
  }
  if (!opts.token) {
    return { ok: false, problem: 'This app is not linked to a map-library account yet.' };
  }
  const body = publishBody(opts); // throws on a missing attestation, deliberately
  try {
    const response = await fetchImpl(`${HUB.origin}/api/upload`, {
      method: 'POST',
      headers: { authorization: `Bearer ${opts.token}` },
      credentials: 'omit',
      body
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        problem: payload?.problem ?? `The map library refused the upload (error ${response.status}).`
      };
    }
    return {
      ok: true,
      slug: typeof payload?.slug === 'string' ? payload.slug : undefined,
      // A map with uncredited assets uploads FINE and simply cannot go public yet. Treating a
      // false here as a failure would tell the creator their work did not save, which is wrong.
      mayPublish: payload?.mayPublish !== false,
      missingProvenance: Array.isArray(payload?.missingProvenance) ? payload.missingProvenance : []
    };
  } catch {
    return { ok: false, problem: 'Could not reach the map library. Check your connection and try again.' };
  }
}
