import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import TagCategoryEditor from './TagCategoryEditor.svelte';
import { tagCategories, upsertCategory, deleteCategory, exportCategory, type TagCategory } from '$lib/tags/tagCategories';

/**
 * The category editor's offers, tested where a GM meets them.
 *
 * STRANDED RULE TAGS ("how do I REMOVE tags that are seeded from rules no longer in the pack?",
 * 2026-10-23). The editor is told how many the open starmap carries and asks the page to clear
 * them; it never touches the map itself. Red-first, seen 2026-11-13: with the offer's block removed
 * from the template the first test finds no button.
 */
describe('the category editor offers to clear tags left behind by vanished rules', () => {
  it('says how many, on how many bodies, and asks the page to remove them', async () => {
    const onClean = vi.fn();
    const { container, getByText } = render(TagCategoryEditor, {
      props: { existingTags: [], stranded: { tags: 7, bodies: 3 } },
      events: { cleanstranded: onClean }
    } as any);
    const note = container.querySelector('.stranded')!;
    expect(note.textContent).toMatch(/7\s*tags on 3\s*bodies/);
    await fireEvent.click(getByText('Remove them from the starmap'));
    expect(onClean).toHaveBeenCalledTimes(1);
  });

  it('says nothing when there are none', () => {
    const { container } = render(TagCategoryEditor, { props: { existingTags: [], stranded: { tags: 0, bodies: 0 } } } as any);
    expect(container.querySelector('.stranded')).toBeNull();
  });
});

/**
 * IMPORTING ONTO A NAMESPACE THE GM ALREADY HAS ("importing a tag catagory makes the tag just reset
 * rather then actually import", 2026-10-23). The Import button used to hand the file straight to the
 * store, which replaces by namespace - so the GM's category went back to whatever the file held,
 * with no question and no way to keep both.
 *
 * Driven through the real file input, because the fault was in what the editor did with the file.
 * Red-first, seen 2026-11-13: with the old one-line handler (`upsertCategory(importCategory(...))`)
 * the first test fails - the category is already overwritten before anybody is asked.
 */
describe('the category editor asks before an import overwrites a category', () => {
  const mine = (): TagCategory => ({
    id: 'zz-houses', shortName: 'Houses', longName: 'Houses (my edits)', color: '#aa2222', appliesTo: ['planet'], enabled: true,
    tags: [{ key: 'zz-houses/atreides', label: 'Atreides' }, { key: 'zz-houses/corrino', label: 'Corrino' }], rules: []
  });
  const fileOf = (cat: TagCategory) => new File([exportCategory(cat)], 'Houses.tagcategory.json', { type: 'application/json' });
  const older = (): TagCategory => ({ ...mine(), longName: 'Houses', tags: [{ key: 'zz-houses/atreides', label: 'Atreides' }] });
  const byNs = (id: string) => get(tagCategories).find((c) => c.id === id);
  afterEach(() => { for (const c of get(tagCategories)) if (c.id.startsWith('zz-')) deleteCategory(c.id); });

  async function importFile(container: HTMLElement, file: File) {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await fireEvent.change(input);
  }

  it('holds the file and changes NOTHING until the GM answers', async () => {
    upsertCategory(mine());
    const { container } = render(TagCategoryEditor, { props: { existingTags: [] } } as any);
    await importFile(container, fileOf(older()));
    await waitFor(() => expect(container.querySelector('.import-clash')).toBeTruthy());
    expect(byNs('zz-houses')!.longName, 'the GM\'s category is untouched while the question is open').toBe('Houses (my edits)');
    expect(byNs('zz-houses')!.tags).toHaveLength(2);
    expect(container.querySelector('.import-clash')!.textContent).toContain('zz-houses-copy');
  });

  it('"Replace" takes the file', async () => {
    upsertCategory(mine());
    const { container, getByText } = render(TagCategoryEditor, { props: { existingTags: [] } } as any);
    await importFile(container, fileOf(older()));
    await waitFor(() => expect(container.querySelector('.import-clash')).toBeTruthy());
    await fireEvent.click(getByText('Replace mine with the file'));
    expect(byNs('zz-houses')!.longName).toBe('Houses');
    expect(byNs('zz-houses')!.tags).toHaveLength(1);
    expect(byNs('zz-houses-copy')).toBeUndefined();
    expect(container.querySelector('.import-clash')).toBeNull();
  });

  it('"Keep both" brings it in as a copy and leaves the original alone', async () => {
    upsertCategory(mine());
    const { container, getByText } = render(TagCategoryEditor, { props: { existingTags: [] } } as any);
    await importFile(container, fileOf(older()));
    await waitFor(() => expect(container.querySelector('.import-clash')).toBeTruthy());
    await fireEvent.click(getByText('Keep both — import as a copy'));
    expect(byNs('zz-houses')!.longName).toBe('Houses (my edits)');
    expect(byNs('zz-houses')!.tags).toHaveLength(2);
    expect(byNs('zz-houses-copy')!.tags.map((t) => t.key)).toEqual(['zz-houses-copy/atreides']);
    // ...and the editor shows the copy, so the GM can see where it went.
    expect((container.querySelector('input.pack-name') as HTMLInputElement).value).toBe('Houses (copy)');
  });

  it('"Cancel" imports nothing', async () => {
    upsertCategory(mine());
    const before = structuredClone(get(tagCategories));
    const { container, getByText } = render(TagCategoryEditor, { props: { existingTags: [] } } as any);
    await importFile(container, fileOf(older()));
    await waitFor(() => expect(container.querySelector('.import-clash')).toBeTruthy());
    await fireEvent.click(getByText('Cancel'));
    expect(get(tagCategories)).toEqual(before);
    expect(container.querySelector('.import-clash')).toBeNull();
  });

  it('a file with a namespace nobody is using just imports, with no question', async () => {
    const { container } = render(TagCategoryEditor, { props: { existingTags: [] } } as any);
    await importFile(container, fileOf(mine()));
    await waitFor(() => expect(byNs('zz-houses')).toBeTruthy());
    expect(container.querySelector('.import-clash')).toBeNull();
  });
});
