// EXPORTING A CONSTRUCT THAT HAS A 3D MODEL DID NOTHING AT ALL - and importing one that carried a
// model said "Failed to parse JSON file".
//
// The owner, telling a GM to save a construct off to reuse (2026-10-14): "there are some saving issues
// around some of the custom objects." This is the one with no symptom but silence. `handleExport`
// embeds the model's binary through `collectModelsForExport` and `handleImport` restores it through
// `importEmbeddedModels` - and the panel had never IMPORTED either function. Both are undeclared
// identifiers, so the moment a construct had a model the export threw a ReferenceError inside an
// async click handler (nothing downloads, nothing is said), and an import of a file carrying one
// threw inside its try block and was reported as bad JSON. A construct WITHOUT a model never reached
// either line, which is why the feature looked fine in every ordinary test.
//
// RED-FIRST: with the `modelTransfer` import removed again, the export row fails with no file
// written and the import row fails with the "Failed to parse JSON file." alert.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ConstructSidePanel from './ConstructSidePanel.svelte';
import { homeSystem, shippedPack } from '$lib/io/customDefinitions.testkit';
import { starmapStore } from '$lib/starmapStore';

const PACK = shippedPack();
const HASH = 'a'.repeat(64);

function mount(construct: any) {
  const system = homeSystem();
  const host: any = system.nodes.find((n: any) => n.name === 'Homeworld');
  return render(ConstructSidePanel, { props: { system, construct, rulePack: PACK, shippedRulePack: PACK, hostBody: host } });
}
// `physical_parameters` is what any construct that has been through the editor carries; the Basics
// tab reads `physical_parameters.dimensionsM` unguarded when the construct is REPLACED under it (an
// import), so a hand-written file without it crashes that tab. Reported, not fixed here.
const kestrel = (extra: Record<string, unknown> = {}): any => ({
  ...(homeSystem().nodes.find((n: any) => n.name === 'Kestrel') as any),
  physical_parameters: { massKg: 5e5, dimensionsM: [60, 12, 12] },
  ...extra
});
const button = (c: HTMLElement, label: string) =>
  [...c.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === label) as HTMLButtonElement;

afterEach(() => { vi.restoreAllMocks(); starmapStore.set(null as any); });

describe('a construct with a 3D model can be exported and imported', () => {
  it('EXPORT writes a file for a construct that has a model', async () => {
    const blobs: Blob[] = [];
    (URL as any).createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:x'; });
    (URL as any).revokeObjectURL = vi.fn();
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { container } = mount(kestrel({ model: { hash: HASH, name: 'Hull' } }));
    await fireEvent.click(button(container, 'Export'));
    await waitFor(() => expect(clicked, 'a download was started').toHaveBeenCalledTimes(1));
    // jsdom's Blob has no `.text()`; a FileReader reads it.
    const text = await new Promise<string>((done) => { const r = new FileReader(); r.onload = () => done(String(r.result)); r.readAsText(blobs[0]); });
    const written = JSON.parse(text);
    expect(written.name).toBe('Kestrel');
    expect(written.model.hash).toBe(HASH);
  });

  it('IMPORT accepts a construct file that carries a model\'s binary', async () => {
    const alerts: string[] = [];
    vi.spyOn(window, 'alert').mockImplementation((m?: string) => { alerts.push(String(m)); });
    const { container } = mount(kestrel());
    const file = new File(
      [JSON.stringify({ ...kestrel({ name: 'Heron', model: { hash: HASH, name: 'Hull' } }), models: { [HASH]: { b64: btoa('GLB'), meta: {} } } })],
      'Heron-Construct.json', { type: 'application/json' }
    );
    // The panel has other file inputs (a picture, a model); the construct file's is the .json one.
    const input = container.querySelector('input[type="file"][accept=".json"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await fireEvent.change(input);
    await waitFor(() => expect(alerts.length).toBe(1));
    expect(alerts[0]).toMatch(/^Successfully imported 'Heron'/);
  });

  it('the panel imports the two functions it calls', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/components/ConstructSidePanel.svelte'), 'utf-8');
    expect(src).toMatch(/import \{[^}]*\bcollectModelsForExport\b[^}]*\} from '\$lib\/constructs\/modelTransfer'/);
    expect(src).toMatch(/import \{[^}]*\bimportEmbeddedModels\b[^}]*\} from '\$lib\/constructs\/modelTransfer'/);
  });
});
