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
import type { System, CelestialBody, Barycenter, Tag, Starmap, ContentCredit, ContentCreditLink, RulePackOverrides } from '$lib/types';
import { G } from '$lib/constants';
import { hostMassKg, reparentBody, hostRole } from '$lib/system/reparent';
import { readClipOverrides, describeOverrides } from './clipRules';

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
  /**
   * ABSENT ON A RULES-ONLY CLIP, which is the only reason this is optional. Use `isRulesOnlyClip`
   * rather than testing it directly - the two producers are told apart by the PAIR (no root, no
   * nodes) and one predicate is what stops that becoming two different tests in two files.
   */
  root?: string;
  nodes: any[];
  /**
   * R-19: THE CUSTOM RULES THE NODES NEED, carried whole from the source map's `rulePackOverrides`.
   *
   * Custom definitions live on the STARMAP, never on the node, so without this a pasted planet whose
   * hydrosphere names a GM's custom liquid looks up a definition that is not there and falls back to
   * a default - with the paste reporting success. See `clipRules.ts` for the whole argument.
   */
  rulePackOverrides?: RulePackOverrides;
  /**
   * Credits that came WITH the copied content, when this clip was produced by SSE itself
   * (`buildClip`). An SSE extension the hub neither sends nor reads - and safe precisely because
   * both readers leave fields they do not know alone. It is what stops a credit evaporating when a
   * GM copies a body they pasted in from somebody's map.
   */
  credits?: ContentCredit[];
  /**
   * THE NAME THE MAP GAVE THIS SYSTEM, when the clip is a whole system copied off the starmap.
   *
   * A second SSE extension, on the same footing as `credits`: the hub neither sends nor reads it,
   * and both readers leave fields they do not know alone. It exists because a system's name and its
   * star's name are genuinely two different things - `StarSystemNode.isNameUserDefined` is the map
   * saying "this GM named the SYSTEM, stop tracking the star" - so rebuilding a system from its root
   * node alone would quietly rename it back to the star on the way in.
   */
  systemName?: string;
}

export type ClipParse = { ok: true; clip: HubClip } | { ok: false; problem: string };

/**
 * R-19: IS THIS CLIP RULES AND NOTHING ELSE? The hub's `/rules` browser produces one; its map pages
 * produce the other, and no node in it changes hands.
 *
 * THE TEST IS THE PAIR - no nodes AND no root - and it is asked HERE, once, so that every reader
 * agrees. The hub chose not to send a marker for exactly this reason ("a second marker is a second
 * thing to keep in step"), and a second COPY of the test on this side would give that away again.
 */
export function isRulesOnlyClip(clip: HubClip): boolean {
  return (clip.nodes?.length ?? 0) === 0 && !clip.root;
}

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
  if (!Array.isArray(raw.nodes)) {
    return { ok: false, problem: 'That clip is empty — it carries no objects.' };
  }
  // R-19: the overrides ride through on both producers, shape-checked and no more - the content is
  // not this reader's to edit, exactly as `credits` below.
  const overrides = readClipOverrides(raw.rulePackOverrides);
  // A RULES-ONLY CLIP: no root and no nodes, which is how the hub's `/rules` browser is told from
  // its map pages. Deliberately NOT a second marker - a marker would be a second thing to keep in
  // step with the pair that already says it. A clip that names a root but carries nothing to hang
  // off it is not that; it is a malformed map clip, and saying so is more use than merging silently.
  if (raw.nodes.length === 0) {
    if (typeof raw.root === 'string' && raw.root) {
      return { ok: false, problem: 'That clip names a top object but carries none of them.' };
    }
    if (!overrides) {
      return { ok: false, problem: 'That clip is empty — it carries no objects and no rules.' };
    }
    return { ok: true, clip: { sseClip: raw.sseClip, source: raw.source, nodes: [], rulePackOverrides: overrides } };
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
  // `credits` rides through: a clip this app produced carries the attribution of anything in it
  // that came from somebody else's map, and dropping it here is how a credit quietly evaporates on
  // the second copy. Shape-checked only - the content is not this reader's to edit.
  const credits = Array.isArray(raw.credits) ? raw.credits.filter((c: any) => c && typeof c === 'object') : undefined;
  return {
    ok: true,
    clip: {
      sseClip: raw.sseClip, source: raw.source, root: rootId, nodes: raw.nodes,
      ...(credits && credits.length ? { credits } : {}),
      ...(overrides ? { rulePackOverrides: overrides } : {})
    }
  };
}

/**
 * COPY A BRANCH OUT OF A SYSTEM — the same format the hub sends, produced by this app.
 *
 * The owner, 2026-09-05: "on a right click on an object that menu gets a Copy option that allows
 * me to cut and paste locally across my own star map / set of system maps." So the clip stops being
 * a thing only the hub makes: it is the app's own copy/cut buffer too, and ONE format serves both
 * because a second one would be a second thing to keep in step.
 *
 * TWO DIFFERENCES FROM A HUB CLIP, both deliberate:
 *  - NOTHING IS STRIPPED. The hub drops `image`, `model` and `gmNotes` because it publishes to
 *    strangers. A GM copying inside their own campaign is moving their own work, so the picture,
 *    the model reference and the private notes all come - losing a planet's photograph on a copy
 *    would be a bug, not a safeguard.
 *  - `source` IS ABSENT. There is no other cartographer: this content is already the GM's. What
 *    DOES travel is `credits` - any `contentCredits` row on the campaign that covers a copied node,
 *    so a body pasted in from somebody's map keeps its credit when it is copied on again. Losing
 *    that is precisely how attribution quietly evaporates.
 *
 * AND `rulePackOverrides` TRAVELS TOO, for the same reason and by the owner's word (2026-09-08).
 * This app is the THIRD producer of a clip and it had R-19's bug in full: copy a body out of one
 * campaign, load another, paste, and its custom liquid did not come with it. Within ONE campaign
 * every definition compares IDENTICAL and is discarded in silence, so this costs a same-campaign
 * copy nothing at all; across two it is the whole fix. Carrying the campaign's overrides rather
 * than the branch's is deliberate - narrowing is the READER's job (see `clipRules.ts`), and a
 * producer that guessed would be a second answer to a question the reader has to ask anyway.
 */
export function buildClip(
  system: System,
  rootId: string,
  opts: { credits?: ContentCredit[]; systemName?: string; rulePackOverrides?: RulePackOverrides } = {}
): HubClip | null {
  const byId = new Map(system.nodes.map((n) => [n.id, n]));
  if (!byId.has(rootId)) return null;

  // The subtree, parents first - the order the hub documents, so a clip this app produced and one
  // the hub produced are indistinguishable to any reader.
  const out: any[] = [];
  const walk = (id: string) => {
    const node = byId.get(id);
    if (!node) return;
    out.push(JSON.parse(JSON.stringify(node)));
    for (const child of system.nodes) if (child.parentId === id) walk(child.id);
  };
  walk(rootId);
  out[0].parentId = null; // the root's parent is whatever it is pasted ONTO

  const ids = new Set(out.map((n) => n.id));
  const credits = (opts.credits ?? [])
    .filter((c) => (c.nodeIds ?? []).some((i) => ids.has(i)))
    .map((c) => ({ ...c, nodeIds: (c.nodeIds ?? []).filter((i) => ids.has(i)) }));

  const overrides = readClipOverrides(opts.rulePackOverrides);
  return {
    sseClip: CLIP_FORMAT,
    root: rootId,
    nodes: out,
    ...(credits.length ? { credits } : {}),
    ...(opts.systemName ? { systemName: opts.systemName } : {}),
    ...(overrides ? { rulePackOverrides: overrides } : {})
  };
}

/**
 * WHAT THIS CLIP IS, in the words a GM uses — "System Sol", "Planet Earth", "Ship Tender".
 *
 * The owner, 2026-09-05: a paste control should "say what - Paste - Planet x, system x, star x".
 * A button reading only "Paste" asks somebody to remember what they copied; naming it means they
 * can see they are about to drop a whole system onto a moon before they do it.
 *
 * A STAR WITH THINGS UNDER IT IS A SYSTEM, not a star. That is what a GM copied and what they will
 * get, and calling it "Star Sol" would describe one node of the forty they are about to paste.
 */
export function describeClipRoot(clip: HubClip): string {
  // A WHOLE SYSTEM COPIED OFF THE STARMAP SAYS SO, under the name the map gives it. Only the
  // starmap's Copy System sets `systemName`, so this is exactly the case where the root node is an
  // implementation detail the GM never named: without it, copying Alpha Centauri offers "Paste Pair
  // Alpha Centauri System Barycentre here", which asks somebody to recognise their own system by
  // its barycentre. A clip from the hub has no `systemName` and is described by its root as before.
  // R-19: a rules clip has no root to describe, so it is described by what it carries. It reads as
  // "Paste Rules (2 liquids) here", which says both that nothing will land on the map and what will.
  if (isRulesOnlyClip(clip)) {
    const what = describeOverrides(clip.rulePackOverrides);
    return what ? `Rules (${what})` : 'Rules';
  }
  if (clip.systemName) return `System ${clip.systemName}`;
  const root = clip.nodes.find((n: any) => n.id === clip.root) ?? clip.nodes[0];
  const name = String(root?.name ?? 'object');
  const role = String(root?.roleHint ?? '');
  const hasChildren = clip.nodes.length > 1;

  let what: string;
  if (root?.kind === 'barycenter') what = 'Pair';
  else if (root?.kind === 'construct') {
    what = role === 'ship' ? 'Ship' : role === 'ring' ? 'Ring' : role === 'belt' ? 'Belt' : 'Structure';
  } else {
    what =
      role === 'star' ? (hasChildren ? 'System' : 'Star')
      : role === 'planet' ? 'Planet'
      : role === 'moon' ? 'Moon'
      : role === 'belt' ? 'Belt'
      : role === 'ring' ? 'Ring'
      : 'Object';
  }
  return `${what} ${name}`;
}

/**
 * THE SAME THING IN AS FEW CHARACTERS AS POSSIBLE - "Planet+7", "Moon", "System+42". Owner,
 * 2026-09-06, on the indicator that replaced the Paste button: *"have a little paste icon and a
 * description eg: Planet+7, Moon"*.
 *
 * The NAME is deliberately absent, which is the whole difference from `describeClipRoot`. This sits
 * in a pill beside the undo buttons where a long name would push the chrome about as the GM copied
 * different things; what a glance needs there is what KIND of thing is in hand and how much of it.
 * The name is one right-click away, on the menu item that actually pastes it.
 */
export function describeClipCompact(clip: HubClip): string {
  const kind = describeClipRoot(clip).split(' ')[0];
  // "+7" counts the objects BESIDE the root. A rules clip has none and no root either, so the
  // subtraction would read "+-1" without this - the pill says "Rules" and stops.
  if (isRulesOnlyClip(clip)) return kind;
  const extra = Math.max(0, (clip.nodes?.length ?? 1) - 1);
  return extra ? `${kind}+${extra}` : kind;
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
      /** Credits that came WITH the copied content (an internal copy), ids already remapped. */
      carried?: ContentCredit[];
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
/**
 * CLONE A CLIP'S NODES WITH FRESH IDS, ready to be put somewhere. Lifted out of `insertClip` when
 * pasting a system onto the STARMAP needed the same work with a different destination.
 *
 * `rootParentId` is the whole of the difference: an id when the branch hangs under a host, and NULL
 * when the root becomes a system's own root - in which case it loses its orbit entirely, because the
 * top of a system goes round nothing.
 */
function cloneClipNodes(
  clip: HubClip,
  taken: Set<string>,
  opts: { rootParentId: string | null; tMs: number; hostMu?: number }
): { inserted: any[]; remap: Map<string, string> } {
  const remap = new Map<string, string>();
  for (const n of clip.nodes) remap.set(n.id, mintId(taken, n.name ?? n.id));

  const inserted: any[] = [];
  for (const n of clip.nodes) {
    // A deep clone: the clip is somebody else's data and must not be shared by reference with
    // whatever the caller still holds.
    const copy = JSON.parse(JSON.stringify(n));
    copy.id = remap.get(n.id)!;
    const isRoot = n.id === clip.root;
    copy.parentId = isRoot ? opts.rootParentId : remap.get(n.parentId)!;
    // EVERY reference moves with the ids, not just `parentId`. A construct is a `CelestialBody`
    // with `kind: 'construct'`, and it carries ids far from the orbit - an autopilot's legs, its
    // avoid-list, a docking target, a flight log's `placeId`. Remapping only the obvious two would
    // leave a pasted station pointing at the source map's ship. So the clone is walked and any
    // string that IS one of this clip's ids is rewritten, wherever it sits.
    remapRefsDeep(copy, remap);
    // The orbit's host is a reference like any other and has to move with the ids. A descendant
    // keeps its ELEMENTS untouched - only the name of the thing it goes round is rewritten.
    if (copy.orbit && typeof copy.orbit === 'object') {
      if (isRoot && opts.rootParentId === null) {
        // A SYSTEM ROOT ORBITS NOTHING. Keeping the old orbit would leave the star of a new system
        // describing a path round a host that is not in this map at all.
        delete copy.orbit;
      } else {
        copy.orbit = { ...copy.orbit, hostId: copy.parentId };
        if (isRoot) {
          // The root is the only one whose host actually changed, so it is the only one whose
          // gravitational parameter is now wrong. Restamped here, then re-derived by G64.
          copy.orbit.hostMu = opts.hostMu;
          copy.orbit.t0 = opts.tMs;
        }
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

  creditRoot(inserted.find((n) => n.id === remap.get(clip.root!)), clip.source);
  return { inserted, remap };
}

export type ClipAsSystem =
  | {
      ok: true;
      nodes: any[];
      rootId: string;
      /** The STAR to date the system by. The root itself when it is one; the heaviest member when
       *  the root is a pair, because a barycentre has no spectral type to guess an age from. */
      starId: string;
      name: string;
      count: number;
      credit?: ContentCredit;
      carried: ContentCredit[];
    }
  | { ok: false; problem: string };

/**
 * A CLIP AS A SYSTEM OF ITS OWN - what a paste into empty space on the starmap needs (owner,
 * 2026-09-06: *"We also need to be able to paste a star system into the starmap level in the same
 * way. eg - copy from source - paste in empty space on starmap"*).
 *
 * It returns NODES rather than a `System`, and that is deliberate: a system also needs a seed, an
 * epoch, an age and the rule pack it was made under, and none of those are in a clip. They belong to
 * the campaign receiving it, so the caller - which knows the campaign - assembles them. Inventing
 * them here would be this module guessing at things it cannot know.
 *
 * WHAT MAY BE THE TOP OF A SYSTEM: A STAR, OR A PAIR OF THEM. The first cut of this asked for a
 * BODY with `roleHint: 'star'`, and refused every binary - the owner pasted Zeta Reticuli, whose
 * root is a `barycenter` with two G stars under it, and got the option greyed out. A pair of stars
 * is not an edge case of a star system; it is one of the commonest kinds, and the bundled maps are
 * full of them.
 *
 * The test is therefore the ROLE THE ROOT RESOLVES TO, which is `hostRole` - the same walk that
 * decides what a body becomes under a host, asked rather than restated. A barycentre resolves to its
 * heaviest member, so a star pair answers 'star' and is accepted; a body answers its own role, so a
 * lone star still is. A planet, a moon, a ship or a double-PLANET barycentre answers something else
 * and the menu greys the option out with the reason, rather than hiding it.
 */
export function systemNodesFromClip(clip: HubClip): ClipAsSystem {
  if (isRulesOnlyClip(clip)) {
    return { ok: false, problem: 'That clip carries rules, not objects — there is no system in it to place.' };
  }
  const root = clip.nodes.find((n: any) => n.id === clip.root) ?? clip.nodes[0];
  if (!root) return { ok: false, problem: 'That clip has nothing in it.' };
  // `hostRole` reads only `system.nodes`, so the clip's own node list stands in for a system here -
  // there is no system yet, which is the whole point of the call.
  if (hostRole({ nodes: clip.nodes } as unknown as System, root as any) !== 'star') {
    return { ok: false, problem: `Only a star, or a pair of them, and what orbits it can become a system on the map. This is ${describeClipRoot(clip)}.` };
  }

  const { inserted, remap } = cloneClipNodes(clip, new Set<string>(), { rootParentId: null, tMs: 0 });
  const rootId = remap.get(clip.root!)!;
  // The heaviest star among what arrived - the root when it is a star, a member when it is a pair.
  const heaviestStar = inserted
    .filter((n: any) => n.kind === 'body' && n.roleHint === 'star')
    .sort((a: any, b: any) => (b.massKg ?? 0) - (a.massKg ?? 0))[0];
  return {
    ok: true,
    nodes: inserted,
    rootId,
    starId: String(heaviestStar?.id ?? rootId),
    // The map's own name for it when the clip carries one (a system copied off the starmap), and the
    // root node's name otherwise - which is every clip the hub produces.
    name: String(clip.systemName ?? root.name ?? 'New system'),
    count: inserted.length,
    credit: creditFor(clip.source, inserted.map((n) => n.id)),
    carried: (clip.credits ?? [])
      .map((c) => ({ ...c, nodeIds: (c.nodeIds ?? []).map((i) => remap.get(i)).filter(Boolean) as string[] }))
      .filter((c) => c.nodeIds.length)
  };
}

export function insertClip(system: System, clip: HubClip, hostId: string, tMs: number): ClipInsert {
  if (isRulesOnlyClip(clip)) {
    return { ok: false, problem: 'That clip carries rules, not objects — there is nothing in it to paste here.' };
  }
  const host = system.nodes.find((n) => n.id === hostId) as Node | undefined;
  if (!host) return { ok: false, problem: 'The place to paste it into is no longer there.' };

  const taken = new Set(system.nodes.map((n) => n.id));
  const { inserted, remap } = cloneClipNodes(clip, taken, {
    rootParentId: host.id,
    tMs,
    hostMu: G * hostMassKg(system, host)
  });
  const newRootId = remap.get(clip.root!)!;
  const rootCopy = inserted.find((n) => n.id === newRootId);

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
    credit: creditFor(clip.source, inserted.map((n) => n.id)),
    // Credits that travelled WITH the content, their node ids remapped to the copies just made.
    // A clip from the hub has none of these (its own credit is `credit` above); a clip this app
    // copied carries whatever covered the branch, so the attribution survives the second hop.
    carried: (clip.credits ?? [])
      .map((c) => ({ ...c, nodeIds: (c.nodeIds ?? []).map((i) => remap.get(i)).filter(Boolean) as string[] }))
      .filter((c) => c.nodeIds.length)
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
 * R-18 (Stream AA job 3): A WHOLE SYSTEM THAT ARRIVED BY DOWNLOAD earns what a pasted one earns.
 *
 * The generation wizard lists single systems from Explorers and places one at the clicked spot. That
 * system arrives as a SAVE FILE, not a clip, so nothing in it names its cartographer - the list entry
 * does (`title`, `creator`, `url`). This is the paste path's two credits applied to it, ONE function
 * and the same two private helpers rather than a third copy: the `origin/hub` tag on every top node
 * (a system's top is its star, or the barycentre of a pair), and the campaign credit covering every
 * node. Mutates the system's nodes, which the caller has just fetched and owns; returns the credit
 * for the caller to put on the campaign with `addContentCredit`, as a paste's is.
 */
export function creditDownloadedSystem(system: { nodes: any[] }, source: HubClipSource): ContentCredit | undefined {
  const nodes = Array.isArray(system?.nodes) ? system.nodes : [];
  for (const top of nodes.filter((n) => n && !n.parentId)) creditRoot(top, source);
  return creditFor(source, nodes.map((n) => String(n.id)));
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
