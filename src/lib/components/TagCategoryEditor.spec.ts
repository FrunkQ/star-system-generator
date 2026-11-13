import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import TagCategoryEditor from './TagCategoryEditor.svelte';

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
