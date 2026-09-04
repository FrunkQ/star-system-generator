// R-14: THE PASTE TARGET FOR HUB CLIPS — and it takes a HIERARCHY, never one object.
//
// Every row of a hub map page's tree has a Copy control, and copying puts a CLIP on the clipboard:
// that object AND EVERYTHING BENEATH IT. A star with all its planets and their moons; a planet with
// its moons; a station with its docked ships. Until now nothing in this engine read one, so the
// hub's Copy has led nowhere since it shipped.
//
// THE OWNER'S ONE HARD REQUIREMENT: "it must be spec'd to receive hierarchies rather than one
// object." A target that takes `nodes[0]` and drops the rest is not this feature. So this module
// inserts the WHOLE subtree or refuses; there is no partial success.
//
// WHAT ARRIVES, and the format is the hub's (its `src/lib/bundle/clip.ts` produces it):
//
//   { sseClip: 1, source: { site, url, title }, root: "<id>", nodes: [ ...whole subtree... ] }
//
// Nodes are this app's own node shape minus `image`, `model` and `gmNotes` - orbits, masses, tags
// and classes arrive exactly as they were saved.
//
// FIVE THINGS THIS DOES THAT ARE NOT OBVIOUS:
//
//  1. IDS ARE THE SOURCE MAP'S, and they are carried ONLY so `parentId` resolves inside the clip.
//     Every one is re-minted on the way in and every reference remapped, because otherwise one clip
//     pasted twice collides with itself - and a clip pasted into the map it came from would collide
//     immediately.
//  2. THE ORDER IS NOT TRUSTED. The hub documents depth-first, parents first, and this reads that
//     order happily - but it builds the tree itself rather than relying on it, so a producer bug
//     about ordering cannot silently mis-parent somebody's moons. A CYCLE is refused, because
//     nothing could then say where anything is.
//  3. THE ORBITS INSIDE THE CLIP ARE LEFT ALONE. A moon's orbit about its planet came from a real
//     save and is internally consistent. Only the ROOT changes host, and that is done through
//     G64's `reparentBody` rather than beside it, so the tilt handling, the pair promotion and the
//     stability tagging all come along.
//  4. STEER, DO NOT STOP. A 2 Msun star pasted under Earth is allowed. It is tagged by the passes
//     that already do that; nothing here refuses a paste on physical grounds.
//  5. THE CREDIT COMES WITH IT. `source.url` lands on the pasted root as `origin/hub`, so a body
//     lifted out of somebody's map still says whose map it came from.
import type { System, CelestialBody, Barycenter, Tag, Starmap, ContentCredit, ContentCreditLink } from '$lib/types';
import { G } from '$lib/constants';
import { hostMassKg, reparentBody } from '$lib/system/reparent';

type Node = CelestialBody | Barycenter;

/** The clip format this app understands. A HIGHER number was made by a newer hub. */
export const CLIP_FORMAT = 1;

export interface HubClipSource {
  site?: string;
  url?: string;
  title?: string;
  /** R-16. Absent on a clip from a hub older than 0.11.0 - then the credit says so, and does not guess. */
  creator?: string;
  /** Where the content was BEFORE this map, deepest first (hub 0.12.0). Recorded as received. */
  chain?: ContentCreditLink[];
}

export interface HubClip {
  sseClip: number;
  source?: HubClipSource;
  root: string;
  nodes: any[];
}

export type ClipParse = { ok: true; clip: HubClip } | { ok: false; problem: string };

/** True for text that is even worth trying - so a paste handler can ignore ordinary text quietly. */
export function looksLikeHubClip(text: string): boolean {
  return typeof text === 'string' && text.includes('"sseClip"');
}

/**
 * Read a clip, or say why not in one sentence a person can act on.
 *
 * The version check is the `giantRecipe` pattern and it points BOTH ways: a number this build does
 * not know is a clip from a NEWER hub, and saying so is more useful than "invalid", because the
 * answer is "update the app" rather than "the copy button is broken".
 */
export function parseHubClip(text: string): ClipParse {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'That is not a copied object from the map library — it is not JSON at all.' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, problem: 'That is not a copied object from the map library.' };
  }
  if (typeof raw.sseClip !== 'number' || !Number.isFinite(raw.sseClip)) {
    return { ok: false, problem: 'That is not a copied object from the map library — it carries no clip marker.' };
  }
  if (raw.sseClip > CLIP_FORMAT) {
    return {
      ok: false,
      problem: `That was copied from a newer version of the map library than this app understands (clip format ${raw.sseClip}). Update Star System Explorer and paste it again.`
    };
  }
  if (raw.sseClip < 1) {
    return { ok: false, problem: `That clip declares an impossible format (${raw.sseClip}).` };
  }
  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) {
    return { ok: false, problem: 'That clip is empty — it carries no objects.' };
  }
  const byId = new Map<string, any>();
  for (const n of raw.nodes) {
    if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !n.id) {
      return { ok: false, problem: 'That clip contains an object with no id, so nothing could be attached to it.' };
    }
    if (byId.has(n.id)) {
      return { ok: false, problem: `That clip lists the same object twice (${n.id}).` };
    }
    byId.set(n.id, n);
  }
  const rootId = typeof raw.root === 'string' && raw.root ? raw.root : raw.nodes[0]?.id;
  if (!byId.has(rootId)) {
    return { ok: false, problem: 'That clip does not say which of its objects is the top one.' };
  }
  // THE ROOT MUST NOT HAVE A PARENT INSIDE THE CLIP. Skipping the root in the walk below is what
  // let `a -> b -> a` through with `a` named as the root: every node reached the root in one step,
  // so nothing looked circular, and the insert would have hung one of them off itself. The root's
  // parent is the thing being pasted ONTO, and it is by definition outside.
  if (typeof byId.get(rootId)?.parentId === 'string' && byId.has(byId.get(rootId).parentId)) {
    return { ok: false, problem: 'That clip contains a loop — its top object is listed inside its own branch.' };
  }
  // Every non-root parent must be INSIDE the clip, and the whole thing must reach the root. A clip
  // that fails this is not a subtree, and inserting it would leave orphans nothing can draw.
  for (const n of raw.nodes) {
    if (n.id === rootId) continue;
    if (typeof n.parentId !== 'string' || !byId.has(n.parentId)) {
      return { ok: false, problem: `That clip is not a complete branch — "${n.name ?? n.id}" names a parent that was not copied with it.` };
    }
  }
  for (const n of raw.nodes) {
    const seen = new Set<string>([n.id]);
    let cur = n;
    while (cur.id !== rootId) {
      const next = byId.get(cur.parentId);
      if (!next || seen.has(next.id)) {
        return { ok: false, problem: 'That clip contains a loop — an object listed as its own ancestor.' };
      }
      seen.add(next.id);
      cur = next;
    }
  }
  return { ok: true, clip: { sseClip: raw.sseClip, source: raw.source, root: rootId, nodes: raw.nodes } };
}

export type ClipInsert =
  | {
      ok: true;
      rootId: string;
      count: number;
      hostName: string;
      mode: 'kepler' | 'circular' | 'attached';
      /**
       * R-16: the credit this paste earns, for the CALLER to put on the campaign. Returned rather
       * than written because `insertClip` is handed a System and a credit belongs to the Starmap -
       * a system does not own the campaign it sits in. Absent when the clip named nobody and
       * nothing: a credit with no title, no creator and no url would be a row saying nothing.
       */
      credit?: ContentCredit;
    }
  | { ok: false; problem: string };

/** A fresh id that cannot collide with anything already in the system, or with the rest of the clip. */
function mintId(taken: Set<string>, hint: string): string {
  const base = `hub-${(hint || 'node').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 24) || 'node'}`;
  let id = base;
  let n = 1;
  while (taken.has(id)) id = `${base}-${++n}`;
  taken.add(id);
  return id;
}

/**
 * Insert a whole clip under one host. All of it or none of it.
 *
 * `tMs` is the display instant - the same one G64's re-home uses - so the pasted root is placed
 * with the system as it stands right now rather than at some epoch nobody is looking at.
 *
 * The caller re-processes the system afterwards (`hierarchyRebuild` + `barycenterReconcile` come
 * with that), which is what settles host masses, promotes a comparable-mass body under a star to a
 * pair, and writes the stability tags that say whether the new home can hold what was just dropped
 * into it.
 */
export function insertClip(system: System, clip: HubClip, hostId: string, tMs: number): ClipInsert {
  const host = system.nodes.find((n) => n.id === hostId) as Node | undefined;
  if (!host) return { ok: false, problem: 'The place to paste it into is no longer there.' };

  const taken = new Set(system.nodes.map((n) => n.id));
  const remap = new Map<string, string>();
  for (const n of clip.nodes) remap.set(n.id, mintId(taken, n.name ?? n.id));

  const inserted: any[] = [];
  for (const n of clip.nodes) {
    // A deep clone: the clip is somebody else's data and must not be shared by reference with
    // whatever the caller still holds.
    const copy = JSON.parse(JSON.stringify(n));
    copy.id = remap.get(n.id)!;
    if (n.id === clip.root) {
      copy.parentId = host.id;
    } else {
      copy.parentId = remap.get(n.parentId)!;
    }
    // EVERY reference moves with the ids, not just `parentId`. A construct is a `CelestialBody`
    // with `kind: 'construct'`, and it carries ids far from the orbit - an autopilot's legs, its
    // avoid-list, a docking target, a flight log's `placeId`. Remapping only the obvious two would
    // leave a pasted station pointing at the source map's ship. So the clone is walked and any
    // string that IS one of this clip's ids is rewritten, wherever it sits.
    remapRefsDeep(copy, remap);
    // The orbit's host is a reference like any other and has to move with the ids. A descendant
    // keeps its ELEMENTS untouched - only the name of the thing it goes round is rewritten.
    if (copy.orbit && typeof copy.orbit === 'object') {
      copy.orbit = { ...copy.orbit, hostId: copy.parentId };
      if (n.id === clip.root) {
        // The root is the only one whose host actually changed, so it is the only one whose
        // gravitational parameter is now wrong. Restamped here, then re-derived by G64 below.
        copy.orbit.hostMu = G * hostMassKg(system, host);
        copy.orbit.t0 = tMs;
      }
    }
    inserted.push(copy);
  }

  // A ROUTE IS A PLAN MADE IN ANOTHER CAMPAIGN. Whatever the deep remap could resolve, an
  // autopilot's stops are mostly places that were never copied - the fuel depot two systems over,
  // the yard it returns to. Leaving it enabled sets the planner chasing ids that do not exist here.
  // So the SHIP comes whole - hull, cargo, crew, tags - and its route is stood down and said so.
  // That is requirement 5 exactly: tag it, keep the node.
  for (const n of inserted) {
    if (n?.kind !== 'construct' || !n.autopilot) continue;
    if (n.autopilot.enabled) {
      n.autopilot = { ...n.autopilot, enabled: false };
      addTag(n, { ns: 'origin', key: 'hub-route-stood-down', origin: 'authored' });
    }
  }

  const newRootId = remap.get(clip.root)!;
  const rootCopy = inserted.find((n) => n.id === newRootId);
  creditRoot(rootCopy, clip.source);

  system.nodes.push(...inserted);

  // G64 does the re-home: the root's orbit re-expressed about its new host, in the host's frame,
  // with the retrograde convention and the roleHint that go with it. Built ON it rather than
  // beside it - a second implementation of "put this body round that one" is the fault this repo
  // keeps writing rules about. It only applies to a BODY; a barycentre root keeps the plain attach.
  let mode: 'kepler' | 'circular' | 'attached' = 'attached';
  if (rootCopy?.kind === 'body') {
    const res = reparentBody(system, newRootId, host.id, tMs);
    if (res) mode = res.mode;
  }

  return {
    ok: true,
    rootId: newRootId,
    count: inserted.length,
    hostName: String((host as any).name ?? host.id),
    mode,
    credit: creditFor(clip.source, inserted.map((n) => n.id))
  };
}

/**
 * R-14 point 6: the pasted root says whose map it came from.
 *
 * A tag rather than a field, because a tag is already the thing this app shows, filters and carries
 * into a player view - and because a body lifted out of somebody's campaign keeping a quiet line
 * back to it is the whole point. `origin` is the namespace, `hub` the key, the map's URL the value.
 */
function creditRoot(root: any, source: HubClipSource | undefined): void {
  const url = typeof source?.url === 'string' ? source.url.trim() : '';
  if (!root || !url) return;
  addTag(root, { ns: 'origin', key: 'hub', value: url, origin: 'authored' });
}

/**
 * R-16: the credit a paste earns. Null when the clip named nobody and nothing - a row with no
 * title, no creator and no link credits no one and is just noise in ATTRIBUTIONS.md.
 */
function creditFor(source: HubClipSource | undefined, nodeIds: string[]): ContentCredit | undefined {
  const clean = (s: unknown) => (typeof s === 'string' && s.trim() ? s.trim() : undefined);
  const title = clean(source?.title), creator = clean(source?.creator), url = clean(source?.url);
  if (!title && !creator && !url) return undefined;
  // The chain is somebody else's history: taken as received, not shortened, reordered or
  // de-duplicated. Only the shape is checked, so a malformed one cannot poison the save.
  const chain = Array.isArray(source?.chain)
    ? source!.chain!.filter((l) => l && typeof l === 'object').map((l) => ({
        url: clean(l.url), title: clean(l.title), creator: clean(l.creator)
      })).filter((l) => l.url || l.title || l.creator)
    : undefined;
  return {
    title, creator, url, site: clean(source?.site),
    ...(chain && chain.length ? { chain } : {}),
    // ISO rather than a millisecond count: this is a date a person reads in a save they are
    // editing by hand, not an instant anything computes with.
    pastedAt: new Date().toISOString(),
    nodeIds: [...nodeIds]
  };
}

/**
 * R-16: put a paste's credit on the CAMPAIGN.
 *
 * On the campaign and not the nodes, because nodes get renamed, re-homed and deleted, and a credit
 * that dies with the body it arrived on is not a credit. Returns a NEW campaign - the store's own
 * discipline - and merges rather than appends when the same map is pasted twice: one source, one
 * row, with the node ids accumulated, so a GM who pastes six systems from one map owes one credit
 * six bodies wide rather than six identical rows.
 */
export function addContentCredit<T extends { contentCredits?: ContentCredit[] }>(map: T, credit: ContentCredit | undefined): T {
  if (!credit) return map;
  const existing = Array.isArray(map.contentCredits) ? map.contentCredits : [];
  // MERGE ON THE MAP, NOT THE DEEP LINK. Since hub 0.12.0 `source.url` points at the OBJECT
  // (`…/s/<slug>#node=<id>`), so two bodies from one map arrive with different urls - matching on
  // the whole url would file six pastes from one map as six identical-looking rows, which is the
  // thing the merge exists to prevent. The fragment is dropped for COMPARISON only; the stored url
  // keeps it whole, because it is what opens the hub's page on the right row.
  //
  // AND THE LINEAGE IS PART OF THE IDENTITY. Two objects from one map can have different histories
  // - one native to it, one passed through two maps before that - and merging those would silently
  // claim a lineage for content that does not have it. Same map AND same chain, or separate rows.
  const mapOf = (u?: string) => (u ?? '').split('#')[0];
  const chainOf = (c: { chain?: ContentCreditLink[] }) => JSON.stringify((c.chain ?? []).map((l) => [l.url, l.title, l.creator]));
  const sameSource = (c: ContentCredit) =>
    mapOf(c.url) === mapOf(credit.url) &&
    (c.creator ?? '') === (credit.creator ?? '') &&
    (c.title ?? '') === (credit.title ?? '') &&
    chainOf(c) === chainOf(credit);
  const prior = existing.find(sameSource);
  const merged: ContentCredit = prior
    ? { ...prior, pastedAt: credit.pastedAt, nodeIds: [...new Set([...(prior.nodeIds ?? []), ...credit.nodeIds])] }
    : credit;
  return { ...map, contentCredits: [...existing.filter((c) => !sameSource(c)), merged] };
}

/** One tag per ns+key: a second paste replaces rather than stacks. */
function addTag(node: any, tag: Tag): void {
  const tags: Tag[] = Array.isArray(node.tags) ? node.tags : [];
  node.tags = [...tags.filter((t) => !(t?.ns === tag.ns && t?.key === tag.key)), tag];
}

/**
 * Rewrite every reference to a clip id, wherever it is nested. Strings only, and only exact
 * matches against an id the clip actually carries - so ordinary prose is untouched, and a
 * reference to something that was NOT copied is left exactly as it was rather than being guessed
 * at. Arrays and objects are walked; nothing else can hold an id.
 */
function remapRefsDeep(value: any, remap: Map<string, string>, depth = 0): void {
  if (!value || typeof value !== 'object' || depth > 12) return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const v = value[i];
      if (typeof v === 'string' && remap.has(v)) value[i] = remap.get(v)!;
      else remapRefsDeep(v, remap, depth + 1);
    }
    return;
  }
  for (const k of Object.keys(value)) {
    const v = value[k];
    if (typeof v === 'string' && remap.has(v)) value[k] = remap.get(v)!;
    else remapRefsDeep(v, remap, depth + 1);
  }
}
