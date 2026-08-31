// G42: ONE answer to "what is this file?" for every loader. Starmap saves, system saves and
// bundles of either kind all land on the same drop targets (Load Starmap, Load System, the
// generation wizard), and each loader used to sniff for itself — so a file dropped on the wrong
// one died inside that loader's validator with a message about missing fields, instead of being
// named as the sister type it actually is. Classification is by SHAPE, never by file name or
// extension (DATA-M3: a renamed file must still open), and it runs BEFORE validation — it does
// not replace validateStarmap or isLoadableSystem, it decides which of them should speak.
import { sniffBundle, unpackBundle, takeBundleFormat } from './bundle';

export type SaveKind = 'starmap' | 'system';

export interface ClassifiedSaveFile {
  /** What the file is — or 'unknown' when it is not a save this app can read. */
  kind: SaveKind | 'unknown';
  /** The packaging: an .sse.zip bundle or plain JSON text. */
  container: 'bundle' | 'json';
  /** The document, parsed (for a bundle, with its assets already restored). Absent when unreadable. */
  doc?: any;
  /**
   * The `bundleFormat` the file claimed, or 0 for one written before the stamp existed. Reported
   * for BOTH containers, because since R-01 a plain `.json` save carries the stamp too and "what
   * format is this?" is part of the one answer this module exists to give. Taken OFF `doc` on the
   * way through - a container property never rides into the live campaign.
   *
   * NOT A GATE HERE. A newer number is a reason for a READER to decline politely; this app is the
   * writer, it loads its own older files, and the compatibility promise at the head of bundle.ts
   * covers every one of them.
   */
  format?: number;
  /** Bundle only: model binaries by hash, in the shape importEmbeddedModels expects. */
  models?: Record<string, { b64: string; meta: Record<string, unknown> }>;
  /** When kind is 'unknown': one plain sentence a user can act on. */
  problem?: string;
}

/**
 * Shape test for a PARSED document. A campaign (starmap) carries `systems` + `routes` arrays; a
 * single system carries a `nodes` array. Read-only — unlike isLoadableSystem it stamps nothing,
 * because classification must be safe to run on a file that is then refused.
 */
export function classifyJsonDoc(doc: any): SaveKind | 'unknown' {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return 'unknown';
  if (Array.isArray(doc.systems) && Array.isArray(doc.routes)) return 'starmap';
  if (Array.isArray(doc.nodes)) return 'system';
  return 'unknown';
}

/** Classify raw file bytes: bundle kind from the zip, JSON kind from shape, else unknown. */
export function classifySaveFile(raw: Uint8Array): ClassifiedSaveFile {
  if (sniffBundle(raw)) {
    try {
      const { kind, doc, models, format } = unpackBundle(raw);
      return { kind, container: 'bundle', doc, models, format };
    } catch (e) {
      // unpackBundle's message is already user-showable ("...no starmap.json or system.json inside").
      return {
        kind: 'unknown',
        container: 'bundle',
        problem: (e as Error)?.message || 'That zip is not a Star System Explorer save.'
      };
    }
  }
  let doc: any;
  try {
    doc = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return {
      kind: 'unknown',
      container: 'json',
      problem: 'The file is not valid JSON, so it is not a save this app wrote. If it is a bundle (.sse.zip), it may be corrupted.'
    };
  }
  // Off the doc BEFORE the shape test, so `bundleFormat` is never mistaken for campaign data by
  // anything downstream - and so even an unreadable file still reports the format it claimed.
  const format = takeBundleFormat(doc);
  const kind = classifyJsonDoc(doc);
  if (kind === 'unknown') {
    return {
      kind,
      container: 'json',
      doc,
      format,
      problem: 'The file is valid JSON, but it has neither a campaign\'s "systems" and "routes" arrays nor a system\'s "nodes" array.'
    };
  }
  return { kind, container: 'json', doc, format };
}
