// SpaceEngine (.sc / .pak) import — tokeniser + parser for the .sc script format (browser-safe).
// See docs/dev/spaceengine-import-design.md §6a. Grammar:
//   BodyType "Name" { Key Value   Key { nested }   Key ( a b c )   Key [numbers...] }
// with // line comments. Values run to end-of-line (a bareword, number, quoted string or tuple).
import { readZipMembers, decodeMember } from '../shared/zip';

export class ScError extends Error {
  code: 'no-bodies' | 'parse';
  constructor(code: 'no-bodies' | 'parse', message?: string) { super(message ?? code); this.name = 'ScError'; this.code = code; }
}

/** A parsed .sc block: a body (type + name) or a nested sub-block (Orbit, Interior, …). */
export interface ScBlock {
  type: string;                       // block keyword: Star / Planet / Moon / Orbit / Interior / …
  name?: string;                      // quoted label on a body block
  keys: Record<string, string>;       // scalar Key Value pairs (raw string values)
  blocks: ScBlock[];                  // nested { } sub-blocks
}

// SpaceEngine body-block keywords. DwarfPlanet is essential — Pluto/Eris/Haumea/Makemake/Quaoar are all
// DwarfPlanet, and omitting it silently drops them (orphaning their moons). Planemo = a rogue/interstellar
// planet.
const BODY_TYPES = new Set(['Star', 'Planet', 'DwarfPlanet', 'Planemo', 'Moon', 'DwarfMoon', 'Asteroid', 'Comet', 'Barycenter', 'Structure']);

// --- Tokeniser ---------------------------------------------------------------
type Tok = { t: 'word' | 'string' | '{' | '}' | '(' | ')'; v: string };

function tokenise(src: string): Tok[] {
  const toks: Tok[] = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    // whitespace
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
    // line comment //… and block comment /* … */
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '{' || c === '}' || c === '(' || c === ')') { toks.push({ t: c as any, v: c }); i++; continue; }
    // quoted string
    if (c === '"') {
      let j = i + 1; let s = '';
      while (j < n && src[j] !== '"') { s += src[j]; j++; }
      toks.push({ t: 'string', v: s }); i = j + 1; continue;
    }
    // bareword / number (up to whitespace or a delimiter)
    let j = i; let w = '';
    while (j < n && !' \t\r\n{}()"'.includes(src[j]) && !(src[j] === '/' && (src[j + 1] === '/' || src[j + 1] === '*'))) { w += src[j]; j++; }
    toks.push({ t: 'word', v: w }); i = j;
  }
  return toks;
}

// --- Parser ------------------------------------------------------------------
// A .sc file is a sequence of top-level entries. A body entry is `Word "Name" { … }`. Other top-level
// `Word Value` directives (LogLevel 0) are ignored. Inside a block: `Word Value` (value to line end,
// approximated as: everything up to the next Word-that-starts-a-key or a { or }) — in practice a value
// is a single token, a quoted string, or a ( … ) / following-numbers tuple.

function parseBlockBody(toks: Tok[], start: number): { block: ScBlock['blocks']; keys: ScBlock['keys']; next: number } {
  const blocks: ScBlock[] = [];
  const keys: Record<string, string> = {};
  let i = start;
  while (i < toks.length && toks[i].t !== '}') {
    const tk = toks[i];
    if (tk.t !== 'word' && tk.t !== 'string') { i++; continue; }
    const key = tk.v;
    const next = toks[i + 1];
    // nested block:  Key {   OR   Key "Name" {
    if (next && next.t === '{') {
      const inner = parseBlockBody(toks, i + 2);
      blocks.push({ type: key, keys: inner.keys, blocks: inner.block });
      i = inner.next + 1; continue;
    }
    if (next && next.t === 'string' && toks[i + 2] && toks[i + 2].t === '{') {
      const inner = parseBlockBody(toks, i + 3);
      blocks.push({ type: key, name: next.v, keys: inner.keys, blocks: inner.block });
      i = inner.next + 1; continue;
    }
    // parenthesised tuple:  Key ( a b c )
    if (next && next.t === '(') {
      let j = i + 2; const parts: string[] = [];
      while (j < toks.length && toks[j].t !== ')') { parts.push(toks[j].v); j++; }
      keys[key] = parts.join(' ');
      i = j + 1; continue;
    }
    // scalar:  Key Value   (single token — number, bareword or quoted string)
    if (next && (next.t === 'word' || next.t === 'string')) {
      keys[key] = next.v;
      i += 2; continue;
    }
    i++; // lone token, skip
  }
  return { block: blocks, keys, next: i };
}

/** Parse a .sc source string into top-level body blocks. */
export function parseSc(src: string): ScBlock[] {
  const toks = tokenise(src);
  const bodies: ScBlock[] = [];
  let i = 0;
  while (i < toks.length) {
    const tk = toks[i];
    if (tk.t === 'word' && BODY_TYPES.has(tk.v) && toks[i + 1]?.t === 'string' && toks[i + 2]?.t === '{') {
      const inner = parseBlockBody(toks, i + 3);
      bodies.push({ type: tk.v, name: toks[i + 1].v, keys: inner.keys, blocks: inner.block });
      i = inner.next + 1; continue;
    }
    // top-level directive `Word Value` or stray token → skip one
    i++;
  }
  return bodies;
}

/** Read all `.sc` sources from a `.pak` archive (or return the single source for a bare .sc). */
export function readScSources(bytes: Uint8Array): string[] {
  // A bare .sc is UTF-8 text (not a zip). A .pak is a zip of .sc files.
  const asText = decodeMember(bytes);
  if (/^\s*(\/\/|Star|Planet|DwarfPlanet|Planemo|Moon|Barycenter|Comet|DwarfMoon|LogLevel|StarBarycenter)/m.test(asText.slice(0, 4000))) {
    return [asText];
  }
  const members = readZipMembers(bytes, ['.sc']);
  return Object.values(members).map((m) => decodeMember(m));
}
