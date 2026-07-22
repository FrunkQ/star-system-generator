// Builds the WS2 Guide document's block model from a system + the currently-selected body. This is the
// content assembly that mirrors the legacy Field Guide's page (`CatalogueBrowser.svelte:187-317`): the
// orbital schematic up top, then the selected body's title + imagery + facts + description, with its
// moons / constructs as in-document navigator lists to drill into. The engine (`renderDocument`) draws
// it; this file just decides WHAT appears, so the same content can be re-themed (book ↔ terminal) and
// re-filtered without touching the layout code.
import type { System, CelestialBody } from '$lib/types';
import type { MeasurementUnits, TemperatureUnit } from '$lib/units';
import { bodyFacts, bodyGlyph } from '../bodyFacts';
import { describeTag, tagContextLabel } from '$lib/tags/tagPresentation';
import type { DocBlock, TagItem, TagStyle } from './blocks';
import {
  isBary, dominantOf, displayLabel, membersOf, moonsOf, constructsOf, isRinged, type Node
} from './systemTopology';

export interface GuideDocOpts {
  units?: MeasurementUnits;
  tempUnit?: TemperatureUnit;
  colorful?: boolean;                    // The Guide's rainbow schematic
  imagery?: 'sphere' | 'disc' | 'flat' | 'photo' | 'none'; // how the body picture is shown
  image?: CanvasImageSource | null;      // a loaded picture for the selected body (photo mode)
  imageAspect?: number;                  // width/height of that picture
  photoFrame?: 'letterbox' | 'full' | 'sliver'; // how the photo is framed
  imageFocus?: import('./blocks').ImageFocus | null; // subject box → frame to the body's edge, not the pic's
  hideInfo?: boolean;                    // clean display: schematic only, no per-body file block
  tagStyle?: TagStyle;                   // how tags render: pills / list / grouped (default pills)
  panel?: boolean;                       // INFO-BLOCK-ONLY: heading + facts + tags + description. Drops the
  // schematic, body graphic, parent-nav and drill-in lists — for the 2D/3D side panel, where the live
  // map already IS the schematic/body/navigator. One builder → the document AND the 2D/3D info block.
}

// Resolve a body's tags to display items (label + type colour + group), de-duplicated by label.
function resolveTags(node: any): TagItem[] {
  const out: TagItem[] = [];
  const seen = new Set<string>();
  for (const t of (node?.tags ?? [])) {
    const label = tagContextLabel(String(t.key), t.value);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const d = describeTag(String(t.key));
    out.push({ label, color: d.color || '#8aa0c0', group: d.group });
  }
  return out;
}

// Order-preserving lookup of a node by id.
function nodeById(system: System, id: string | null): Node | null {
  if (!id) return null;
  return (system?.nodes ?? []).find((n) => n.id === id) ?? null;
}

export function buildGuideDocument(system: System, selectedId: string | null, opts: GuideDocOpts = {}): DocBlock[] {
  const blocks: DocBlock[] = [];
  const colorful = !!opts.colorful;
  const panel = !!opts.panel; // 2D/3D info block: no schematic/nav — the live map is the navigator

  // 1) The orbital schematic — the interactive map + the "simple system drawing."
  if (!panel) blocks.push({ kind: 'schematic', system, selectedId, colorful });

  // Clean display: schematic only, no per-body file (a locked kiosk / projector look).
  if (opts.hideInfo) return blocks;

  const selected = nodeById(system, selectedId);
  if (!selected) {
    if (panel) return blocks; // side panel simply stays empty until a body is picked
    blocks.push({ kind: 'spacer', h: 8 });
    blocks.push({ kind: 'text', text: 'Tap a world on the chart to read its file.', italic: true, align: 'center' });
    return blocks;
  }

  // The subject we pull facts/imagery from: a barycentre is shown AS its dominant member (e.g. Pluto).
  const bary = isBary(selected);
  const subject = (bary ? dominantOf(system, selected) : selected) as CelestialBody | null;
  const title = bary
    ? `${dominantOf(system, selected)?.name ?? '?'} (${selected.name})`
    : (selected.name ?? '');
  const sub = ((subject as any)?.roleHint || 'body')
    + ((subject as any)?.class ? ' · ' + (subject as any).class : '');

  if (!panel) blocks.push({ kind: 'rule' }); // the panel's frame is its own separator
  blocks.push({ kind: 'heading', level: 1, text: title, sub, id: selected.id });

  // 2) Back-to-parent navigator row (the old Guide's "↑ parent" button). Not in the side panel — the
  // live 2D/3D map is the navigator there.
  if (!bary && !panel) {
    const pid = (selected as any).ui_parentId || selected.parentId || (selected as any).orbit?.hostId;
    const parent = pid ? nodeById(system, pid) : null;
    if (parent) blocks.push({ kind: 'list', items: [{ id: parent.id, text: `↑ ${displayLabel(system, parent)}` }] });
  }

  // 3) Imagery — driven by the preset's Body-graphics choice. 'photo' shows a GM/stock picture (only
  // if one loaded); 'disc'/'sphere'/'flat' reserve a gap the view overlays the real renderer into.
  // The 'sliver' photo frame is special: it becomes a LEFT column beside the facts (handled in 4).
  const sliver = opts.imagery === 'photo' && !!opts.image && opts.photoFrame === 'sliver';
  if (opts.imagery === 'photo' && opts.image && !sliver) {
    blocks.push({ kind: 'image', img: opts.image, aspect: opts.imageAspect || 1.6, frame: opts.photoFrame ?? 'letterbox', focus: opts.imageFocus });
  } else if ((opts.imagery === 'sphere' || opts.imagery === 'disc' || opts.imagery === 'flat') && subject) {
    // '__bodygfx' lets FilteredDocumentView find the rect; taller for 3D so the spinning body has room.
    blocks.push({ kind: 'bodyDisc', id: '__bodygfx', body: subject, ringed: isRinged(system, subject.id), mode: opts.imagery, heightFrac: opts.imagery === 'sphere' ? 0.32 : 0.24 });
  }

  // 4) Facts + description. For the sliver frame these flow in a RIGHT column beside the left photo
  // strip. The 'Tags' fact is pulled out and rendered as a styled tags block below (full width).
  if (sliver && opts.image) blocks.push({ kind: 'columnStart', img: opts.image, aspect: opts.imageAspect || 1.6, focus: opts.imageFocus });
  if (subject) {
    const facts = bodyFacts(subject, opts.units ?? 'metric', opts.tempUnit ?? 'C');
    const rows = facts.filter((f) => f.value && f.label !== 'Tags');
    if (rows.length) blocks.push({ kind: 'spacer', h: 4 });
    for (const f of rows) blocks.push({ kind: 'keyValue', label: f.label, value: f.value });
  }
  if (selected.description) {
    blocks.push({ kind: 'spacer', h: 6 });
    blocks.push({ kind: 'text', text: selected.description, italic: true });
  }
  if (sliver) blocks.push({ kind: 'columnEnd' });

  // 4b) Tags — pills / plain list / grouped, per the preset.
  const tags = resolveTags(subject);
  if (tags.length) {
    blocks.push({ kind: 'spacer', h: 6 });
    blocks.push({ kind: 'heading', level: 3, text: 'Tags' });
    blocks.push({ kind: 'tags', tags, style: opts.tagStyle });
  }

  // 5) Drill-in navigator lists: companion members (for a barycentre), moons, constructs. Not in the
  // side panel — tapping the live map does the drilling there.
  if (panel) { blocks.push({ kind: 'spacer', h: 12 }); return blocks; }
  const drillItems = (nodes: Node[]) => nodes.map((n) => ({ id: n.id, text: `${bodyGlyph(n as any)} ${displayLabel(system, n)}` }));

  const companions = bary ? membersOf(system, selected).filter((m) => m.id !== subject?.id) : [];
  const moons = subject ? moonsOf(system, subject.id) : [];
  const moonRow = [...companions, ...moons];
  if (moonRow.length) {
    blocks.push({ kind: 'spacer', h: 6 });
    blocks.push({ kind: 'heading', level: 3, text: 'Moons' });
    blocks.push({ kind: 'list', items: drillItems(moonRow) });
  }

  const constructs = subject ? constructsOf(system, subject.id) : { surface: [], orbiting: [] };
  if (constructs.surface.length) {
    blocks.push({ kind: 'spacer', h: 6 });
    blocks.push({ kind: 'heading', level: 3, text: `On ${subject?.name ?? 'surface'}` });
    blocks.push({ kind: 'list', items: drillItems(constructs.surface) });
  }
  if (constructs.orbiting.length) {
    blocks.push({ kind: 'spacer', h: 6 });
    blocks.push({ kind: 'heading', level: 3, text: 'Orbiting' });
    blocks.push({ kind: 'list', items: drillItems(constructs.orbiting) });
  }

  blocks.push({ kind: 'spacer', h: 12 });
  return blocks;
}
