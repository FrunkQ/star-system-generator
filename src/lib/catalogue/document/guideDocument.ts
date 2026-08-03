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
  isBary, isStar, isBeltish, dominantOf, displayLabel, membersOf, moonsOf, listBodiesOf,
  constructsOf, isRinged, type Node
} from './systemTopology';
import { rainbowHue, rainbowHueIndex } from './systemSchematic';
import { constructIconShape } from '$lib/constructs/constructIcon';

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
  noHeading?: boolean;                   // panel hosted in a DOM aside that already shows the title bar
  liveReadings?: boolean;                // A29: a construct's CURRENT fuel/cargo/crew as well as capacity
  rulePack?: import('$lib/types').RulePack | null; // names a construct's engines and fuels, and gives them
  // an Isp and a density — without it a construct's mass, Δv and acceleration cannot be derived and
  // those rows are simply left out. Optional everywhere: a caller without a pack still gets the rest.
  nowMs?: number;                        // G8: the clock the "Next eclipse" row answers against. Without
  // it the row is omitted rather than guessed — a printed report and a live panel must agree, and they
  // only can if both are told what time it is.
  formatDate?: (ms: number) => string;   // how this campaign writes a date (its calendar is its own)
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

  // In rainbow mode a navigator button takes the hue the SCHEMATIC gives that body, so a planet's chip
  // matches its dot on the chart above rather than being an unrelated spectrum — ONE index, shared, so
  // the two cannot drift. Moons and constructs are not drawn on the schematic and so have no index;
  // they fall back to their position in their own list, which keeps them varied without pretending to
  // match something that is not there.
  const hues = colorful ? rainbowHueIndex(system) : null;
  const hueOf = (id: string, fallbackIdx: number) =>
    hues ? { color: rainbowHue(hues.get(id) ?? (hues.size + fallbackIdx)) } : {};

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
  // The singular `class` is a CONSTRUCT field (bodies carry `classes`), and the construct block now
  // prints it as a properly separated Type row — so appending it here just gave the panel a subtitle
  // reading "Ship · Ship/Interstellar/Eridian", the raw slashes and the word twice.
  const sub = ((subject as any)?.roleHint || 'body')
    + ((subject as any)?.class && (subject as any)?.kind !== 'construct' ? ' · ' + (subject as any).class : '');

  if (!panel) blocks.push({ kind: 'rule' }); // the panel's frame is its own separator
  if (!opts.noHeading) blocks.push({ kind: 'heading', level: 1, text: title, sub, id: selected.id });

  // 2) Back-to-parent navigator row (the old Guide's "↑ parent" button). Not in the side panel — the
  // live 2D/3D map is the navigator there.
  if (!bary && !panel) {
    const pid = (selected as any).ui_parentId || selected.parentId || (selected as any).orbit?.hostId;
    const parent = pid ? nodeById(system, pid) : null;
    // The "up one level" link points at a body that IS on the chart, so it takes the same hue.
    if (parent) blocks.push({ kind: 'list', items: [{ id: parent.id, text: `↑ ${displayLabel(system, parent)}`, ...hueOf(parent.id, 0) }] });
  }

  // 3) Imagery — driven by the preset's Body-graphics choice. 'photo' shows a GM/stock picture (only
  // if one loaded); 'disc'/'sphere'/'flat' reserve a gap the view overlays the real renderer into.
  // The 'sliver' photo frame is special: it becomes a LEFT column beside the facts (handled in 4).
  const sliver = opts.imagery === 'photo' && !!opts.image && opts.photoFrame === 'sliver';
  if (opts.imagery === 'photo' && opts.image && !sliver) {
    blocks.push({ kind: 'image', img: opts.image, aspect: opts.imageAspect || 1.6, frame: opts.photoFrame ?? 'letterbox', focus: opts.imageFocus });
    // A GM-uploaded picture still wins for a construct, which is why this branch is NOT gated below.
  } else if ((opts.imagery === 'sphere' || opts.imagery === 'disc' || opts.imagery === 'flat')
    && subject && subject.kind !== 'construct') {
    // A CONSTRUCT gets no body graphic. The body-graphics setting drew whatever was selected, so a
    // 110 m ship was illustrated with the same featureless sphere a rocky world gets — a picture that
    // is not merely plain but wrong about what the thing is (A28). It gets its OWN glyph below (A30).
    // '__bodygfx' lets FilteredDocumentView find the rect; taller for 3D so the spinning body has room.
    blocks.push({ kind: 'bodyDisc', id: '__bodygfx', body: subject, ringed: isRinged(system, subject.id), mode: opts.imagery, heightFrac: opts.imagery === 'sphere' ? 0.32 : 0.24 });
  } else if ((opts.imagery === 'sphere' || opts.imagery === 'disc' || opts.imagery === 'flat')
    && subject && subject.kind === 'construct') {
    // A30: the construct's authored icon, at info-block size — the picture that already exists in its
    // data, rather than a world's disc or a blank. Gated on the same imagery modes as the body disc, so
    // a preset that asks for no graphic still gets none, and a GM photo still wins (branch above).
    blocks.push({
      kind: 'constructGlyph',
      shape: constructIconShape((subject as any).icon_type),
      color: (subject as any).icon_color || '#ffd24d',
      heightFrac: 0.24
    });
  }

  // 4) Facts + description. For the sliver frame these flow in a RIGHT column beside the left photo
  // strip. The 'Tags' fact is pulled out and rendered as a styled tags block below (full width).
  if (sliver && opts.image) blocks.push({ kind: 'columnStart', img: opts.image, aspect: opts.imageAspect || 1.6, focus: opts.imageFocus });
  if (subject) {
    // A construct's facts want its HOST to describe where it is ("Adrian: Low Orbit"); resolve it the
    // same way the parent-nav row above does, so the two cannot name different parents.
    const hostId = (subject as any).parentId || (subject as any).orbit?.hostId;
    const host = hostId ? (nodeById(system, hostId) as CelestialBody | null) : null;
    const facts = bodyFacts(subject, opts.units ?? 'metric', opts.tempUnit ?? 'C',
      { rulePack: opts.rulePack, host, liveReadings: opts.liveReadings, system, nowMs: opts.nowMs, formatDate: opts.formatDate });
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
  const drillItems = (nodes: Node[]) => nodes.map((n, i) => ({
    id: n.id, text: `${bodyGlyph(n as any)} ${displayLabel(system, n)}`, ...hueOf(n.id, i)
  }));

  // A barycentre's MEMBERS and a body's MOONS are different relationships — a co-orbiting peer versus
  // a satellite — and merging them under one heading called them all moons: the Alpha Centauri AB
  // Barycentre page filed Toliman, a main-sequence K star, as a moon, glyph and all. They are split by
  // WHAT EACH NODE IS rather than by which query produced it, which also settles the case that made
  // one merged heading impossible to name honestly: `membersOf` matches `parentId === bary.id` as well
  // as `memberIds`, so a CIRCUMBINARY PLANET arrives in this list too. A star goes under Companions, a
  // moon under Moons (so Pluto–Charon still reads correctly), and a planet is left for the orbiters
  // block below to file under Planets, where it belongs.
  const companions = bary ? membersOf(system, selected).filter((m) => m.id !== subject?.id) : [];
  const companionStars = companions.filter((c) => isStar(c));
  const companionMoons = companions.filter((c) => (c as any).roleHint === 'moon');
  if (companionStars.length) {
    blocks.push({ kind: 'spacer', h: 6 });
    blocks.push({ kind: 'heading', level: 3, text: companionStars.length > 1 ? 'Companion stars' : 'Companion star' });
    blocks.push({ kind: 'list', items: drillItems(companionStars) });
  }

  const moons = subject ? moonsOf(system, subject.id) : [];
  const moonRow = [...companionMoons, ...moons];
  if (moonRow.length) {
    blocks.push({ kind: 'spacer', h: 6 });
    blocks.push({ kind: 'heading', level: 3, text: 'Moons' });
    blocks.push({ kind: 'list', items: drillItems(moonRow) });
  }

  // A star's natural satellites are its PLANETS, and the document never listed them — so the primary
  // star, which is the node you land on, was the one page in the system with no way down. Same block
  // shape and same drill items as the moons above; `listBodiesOf` is the helper the picker and the
  // legacy Guide already use, so belts stay reachable rather than becoming pickable only on the chart.
  // Keyed on `selected.id`, NOT `subject.id`: in a multi-star system the planets hang off the
  // BARYCENTRE, and `subject` has already been resolved to its dominant member — so keying on the
  // subject would leave a circumbinary system's planets listed nowhere. Nothing is listed twice
  // either, because a body has exactly one host: planets round the pair hang off the barycentre and
  // planets round one star hang off that star, and the two lists cannot overlap.
  // The `listed` filter is not defensive padding — `orbiters()` only excludes moons, and Pluto is a
  // roleHint 'planet' parented to the Pluto-Charon barycentre, so selecting that barycentre would
  // otherwise offer Pluto as its own satellite.
  // Runs for ANY subject, not just a star or a barycentre. A RING is `roleHint: 'ring'`, so `moonsOf`
  // excludes it and a ringed planet listed nothing about its own rings: all four in the Solar System
  // hang off their planet rather than off the Sun, so they were reachable from nowhere in the document
  // at all. A ring is admittedly not somewhere you drill INTO the way a moon is — but it is a real node
  // with its own facts page, and the star's list has always offered belts on exactly that basis, so a
  // row is the consistent answer rather than a special case.
  // Only the companion stars and moons are excluded here: a circumbinary planet is deliberately NOT,
  // so it lands under Planets instead of being filed as a companion (see the split above).
  const listed = new Set([subject?.id, ...companionStars.map((c) => c.id), ...companionMoons.map((c) => c.id)]
    .filter(Boolean) as string[]);
  const orbiters = listBodiesOf(system, selected.id).filter((n) => !listed.has(n.id));
  if (orbiters.length) {
    // Heading from CONTENT, so a page never announces something it is not showing.
    const isRing = (n: any) => n?.roleHint === 'ring';
    const hasPlanets = orbiters.some((n) => !isBeltish(n));
    const hasRings = orbiters.some(isRing), hasBelts = orbiters.some((n) => isBeltish(n) && !isRing(n));
    const parts = [hasPlanets && 'Planets', hasBelts && 'Belts', hasRings && 'Rings'].filter(Boolean) as string[];
    const text = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1].toLowerCase()}` : parts[0];
    blocks.push({ kind: 'spacer', h: 6 });
    blocks.push({ kind: 'heading', level: 3, text });
    blocks.push({ kind: 'list', items: drillItems(orbiters) });
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
