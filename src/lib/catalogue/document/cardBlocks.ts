// Bridge: express the existing per-body info card (`HudCard`) as document blocks + a `DocTheme`, so the
// SAME `renderDocument` engine can draw it. This is the Phase-1 "prove it" — the engine re-renders the
// info card's content through the block model — and the Phase-5 seam: `drawHud` will draw its card panel
// by handing these blocks to the engine, retiring `drawCard`'s bespoke content flow. The shipped
// `drawCard` path is untouched for now; this just demonstrates equivalence.
import type { HudCard } from '../infoCard';
import type { DocBlock, DocTheme } from './blocks';

// The card content (title + role strap, fact rows, italic description) as a block stack.
export function hudCardToBlocks(card: HudCard): DocBlock[] {
  const blocks: DocBlock[] = [
    { kind: 'heading', level: 1, text: card.title, sub: card.sub }
  ];
  for (const f of card.facts) blocks.push({ kind: 'keyValue', label: f.label, value: f.value });
  if (card.description) {
    blocks.push({ kind: 'spacer', h: 6 });
    blocks.push({ kind: 'text', text: card.description, italic: true });
  }
  return blocks;
}

// The card's look as a DocTheme (accent-driven; `white` scheme → mono).
export function hudCardTheme(card: HudCard): DocTheme {
  return {
    font: card.font,
    fontScale: card.fontScale,
    mono: card.mono,
    accent: card.accent
  };
}
