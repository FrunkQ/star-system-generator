// ATTRIBUTIONS.md for a save bundle: who made the art in this campaign, under what licence.
//
// WHY IT EXISTS AS A FILE, not just fields on the nodes. A save gets passed around - handed to a
// player, posted to a Discord, opened on someone else's machine a year later. The provenance of
// an uploaded model or picture has to travel WITH it, in a form a person can read without the
// app. A CC-BY model in particular carries an obligation, and an obligation buried in JSON is one
// nobody will honour.
//
// It is also a WORKING DOCUMENT, not a formality: it names the assets with nothing recorded, so a
// GM can see what they still need to fill in before sharing.
import type { ModelRef } from '$lib/types';

export interface AttributionEntry {
  path: string;                 // where it sits in the bundle
  kind: 'model' | 'image';
  usedBy: string[];             // node names (with their system, in a campaign)
  title?: string;
  credit?: string;
  license?: string;
  sourceUrl?: string;
}

/** Every node, with the name of the system holding it (blank for a single-system save). */
export function* nodesWithSystem(doc: any): Generator<{ node: any; systemName: string }> {
  if (Array.isArray(doc?.nodes)) {
    for (const node of doc.nodes) yield { node, systemName: '' };
  }
  for (const entry of doc?.systems ?? []) {
    const systemName = String(entry?.name ?? entry?.system?.name ?? '');
    for (const node of entry?.system?.nodes ?? []) yield { node, systemName };
  }
}

const label = (node: any, systemName: string) => {
  const name = String(node?.name ?? node?.id ?? 'unnamed');
  return systemName ? `${name} (${systemName})` : name;
};

/**
 * Collect what the bundle carries. `modelMeta` is the per-hash metadata the bundle writes beside
 * the binaries; image provenance rides on the node's own ImageRef.
 */
export function collectAttributions(
  doc: any,
  modelMeta: Record<string, Partial<ModelRef>> = {},
  paths: { models: string; images: string; playerImages?: string } =
    { models: 'assets/models/', images: 'assets/images/', playerImages: 'assets/images/player/' }
): AttributionEntry[] {
  const models = new Map<string, AttributionEntry>();
  const images: AttributionEntry[] = [];
  const playerDir = paths.playerImages ?? 'assets/images/player/';

  for (const { node, systemName } of nodesWithSystem(doc)) {
    const who = label(node, systemName);

    const hash: unknown = node?.model?.hash;
    if (typeof hash === 'string' && hash) {
      // Prefer the metadata stored WITH the binary; fall back to the node's own ref. They are the
      // same shape, and the store's copy is the one that survives the node being edited.
      const meta = { ...(node.model ?? {}), ...(modelMeta[hash] ?? {}) } as Partial<ModelRef>;
      const existing = models.get(hash);
      if (existing) {
        existing.usedBy.push(who); // one hull, several ships: listed once, credited once
      } else {
        models.set(hash, {
          path: `${paths.models}${hash}.glb`, kind: 'model', usedBy: [who],
          title: meta.title || meta.name, credit: meta.credit, license: meta.license, sourceUrl: meta.sourceUrl
        });
      }
    }

    const url: unknown = node?.image?.url;
    // Only assets the bundle actually carries. A remote url is someone else's hosting and is not
    // ours to credit; a data: url means packing has not run yet (collect is called after).
    if (typeof url === 'string' && url.startsWith(paths.images) && !url.startsWith(playerDir)) {
      const img = node.image;
      images.push({
        path: url, kind: 'image', usedBy: [who],
        title: img.title, credit: img.credit, license: img.license, sourceUrl: img.sourceUrl
      });
    }
  }

  // G16 / DATA-M4: PLAYER-VIEW GRAPHICS ARE ASSETS TOO, and the map background is the one this rule
  // was written for. A GM's uploaded sector map is exactly the case ATTRIBUTIONS.md exists to cover:
  // it gets handed to players and posted publicly, and CC-BY without a name is a breach rather than
  // an untidy field. `usedBy` names the surfaces it can appear on, because a player asset is not
  // attached to a node and "used by nothing" would read as dead weight a GM could delete.
  for (const a of doc?.playerAssets ?? []) {
    const url: unknown = a?.dataUrl;
    if (typeof url !== 'string' || !url.startsWith(playerDir)) continue;
    images.push({
      path: url, kind: 'image', usedBy: [playerAssetUse(doc, a.id, a.name)],
      title: a.name, credit: a.credit, license: a.license, sourceUrl: a.sourceUrl
    });
  }

  return [...models.values(), ...images];
}

/** What a player-view graphic is doing in this campaign - map background, or which presets place it. */
function playerAssetUse(doc: any, id: string, name: string): string {
  const uses: string[] = [];
  if (doc?.mapBackground?.source === 'asset' && doc.mapBackground.assetId === id) uses.push('map background');
  for (const p of doc?.playerPresets ?? []) {
    const slots = [p?.cover?.graphic, p?.starmapOverlay, p?.systemOverlay];
    if (slots.some((g: any) => g?.assetId === id)) uses.push(`player view "${p?.name ?? p?.id}"`);
  }
  return uses.length ? `${name} (${uses.join(', ')})` : `${name} (uploaded, not currently placed)`;
}

const isBlank = (e: AttributionEntry) => !e.credit && !e.license && !e.sourceUrl;
/** CC-BY without a name is the one combination that is actively wrong, not merely unrecorded. */
const breachesCcBy = (e: AttributionEntry) => /cc[- ]?by/i.test(e.license ?? '') && !e.credit;

/** Render the file. Markdown, because it is read far more often than parsed. */
export function renderAttributions(entries: AttributionEntry[], docName: string): string {
  const models = entries.filter((e) => e.kind === 'model');
  const images = entries.filter((e) => e.kind === 'image');
  const missing = entries.filter(isBlank);
  const breaches = entries.filter(breachesCcBy);

  const lines: string[] = [];
  lines.push('# Attributions');
  lines.push('');
  lines.push(`Every uploaded asset carried by this save (\`${docName}\`), what uses it, and the`);
  lines.push('provenance recorded for it. Written automatically on export.');
  lines.push('');
  lines.push(`**${models.length} model${models.length === 1 ? '' : 's'}, ${images.length} image${images.length === 1 ? '' : 's'}.**`);
  if (breaches.length) {
    lines.push('');
    lines.push(`> **${breaches.length} asset${breaches.length === 1 ? ' is' : 's are'} licensed CC-BY with no credit recorded.**`);
    lines.push('> CC-BY requires naming the author. Add it before sharing this save.');
  }
  if (missing.length) {
    lines.push('');
    lines.push(`> ${missing.length} asset${missing.length === 1 ? ' has' : 's have'} no provenance recorded at all.`);
    lines.push('> That is fine for art you made yourself. For anything downloaded, fill it in.');
  }

  const section = (title: string, list: AttributionEntry[], emptyNote: string) => {
    lines.push('');
    lines.push(`## ${title}`);
    if (!list.length) { lines.push(''); lines.push(`_${emptyNote}_`); return; }
    for (const e of list) {
      lines.push('');
      lines.push(`### ${e.path}`);
      lines.push(`- Used by: ${e.usedBy.join(', ')}`);
      if (e.title) lines.push(`- Title: ${e.title}`);
      if (e.credit) lines.push(`- Credit: ${e.credit}`);
      if (e.license) lines.push(`- Licence: ${e.license}`);
      if (e.sourceUrl) lines.push(`- Source: ${e.sourceUrl}`);
      if (breachesCcBy(e)) lines.push('- **CC-BY with no credit recorded — the author must be named.**');
      else if (isBlank(e)) lines.push('- _No provenance recorded._');
    }
  };

  section('3D models', models, 'None in this save.');
  section('Images', images, 'None in this save.');

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('Edit the provenance in the app (the model dialog, or the picture controls beside it) and');
  lines.push('export again to refresh this file. Bundled starter models from NASA are public domain.');
  lines.push('');
  return lines.join('\n');
}

/** Null when the save carries no uploaded assets — nothing to attribute, so no file. */
export function buildAttributionsFile(
  doc: any,
  modelMeta: Record<string, Partial<ModelRef>> = {},
  docName = 'starmap.json'
): string | null {
  const entries = collectAttributions(doc, modelMeta);
  return entries.length ? renderAttributions(entries, docName) : null;
}
