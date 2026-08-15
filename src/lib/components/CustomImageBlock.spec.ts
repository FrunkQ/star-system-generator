// G20: ONE custom-picture block, three consumers. The planet and the construct each carried their own
// transcription of it and a star had none at all; these tests pin the contract the single component
// now owns, so a fourth consumer cannot quietly get a different one.
import { render } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import CustomImageBlock from './CustomImageBlock.svelte';

const CUSTOM = 'data:image/jpeg;base64,QUJD';

function buttons(container: HTMLElement) {
	return Array.from(container.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');
}

describe('CustomImageBlock — the labels are a prop, not a reason for a second copy', () => {
	it('shows the ADD label and no thumbnail when there is no custom picture', () => {
		const { container } = render(CustomImageBlock, {
			props: { target: {}, addLabel: 'Upload custom image…', replaceLabel: 'Replace image…' }
		});
		expect(buttons(container)).toEqual(['Upload custom image…']);
		expect(container.querySelector('img')).toBeNull();
	});

	it('shows the REPLACE and REMOVE labels, and the thumbnail, when one is set', () => {
		const target: any = { image: { url: CUSTOM, custom: true } };
		const { container } = render(CustomImageBlock, {
			props: { target, addLabel: 'Add…', replaceLabel: 'Replace…', removeLabel: 'Remove' }
		});
		expect(buttons(container)).toEqual(['Replace…', 'Remove']);
		expect(container.querySelector('img')?.getAttribute('src')).toBe(CUSTOM);
	});

	it('treats a DERIVED picture as no picture — the type/class portrait is not "custom"', () => {
		// A planet and a star both arrive carrying a derived `image.url` with no `custom` flag. Offering
		// "Replace" and "Remove" for one would invite a GM to delete something they never uploaded.
		const target: any = { image: { url: '/images/star_types/G.webp' } };
		const { container } = render(CustomImageBlock, { props: { target, addLabel: 'Add…' } });
		expect(buttons(container)).toEqual(['Add…']);
		expect(container.querySelector('img')).toBeNull();
	});
});

describe('CustomImageBlock — removing hands the picture back to whatever derives it', () => {
	it('clears the whole ImageRef and reports the change', async () => {
		// Clearing the flag alone would leave a stale url behind, and every reader of `image.url` is
		// generic (bodyImage.ts, CatalogueBrowser, the bundle packer) — they would all still show it.
		const target: any = { image: { url: CUSTOM, custom: true, credit: 'A. Painter' } };
		const onUpdate = vi.fn();
		const { container } = render(CustomImageBlock, { props: { target, onUpdate, removeLabel: 'Remove' } });
		const remove = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Remove')!;
		remove.click();
		expect(target.image).toBeUndefined();
		expect(onUpdate).toHaveBeenCalledTimes(1);
	});

	it('repaints itself on its own write rather than waiting for the parent', async () => {
		// The three consumers span both compiler modes and hand in a plain node, not a state proxy — so
		// the block cannot rely on parent invalidation to redraw. Straight after Remove it must already
		// be offering Add again.
		const target: any = { image: { url: CUSTOM, custom: true } };
		const { container } = render(CustomImageBlock, {
			props: { target, addLabel: 'Add…', replaceLabel: 'Replace…', removeLabel: 'Remove' }
		});
		Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Remove')!.click();
		await Promise.resolve();
		expect(buttons(container)).toEqual(['Add…']);
	});
});

describe('CustomImageBlock — provenance (DATA-M4)', () => {
	it('offers the credit/licence/source trio only for an uploaded picture', () => {
		const bare = render(CustomImageBlock, { props: { target: {} } });
		expect(bare.container.querySelectorAll('input[type="text"]')).toHaveLength(0);
		const withImg = render(CustomImageBlock, { props: { target: { image: { url: CUSTOM, custom: true } } } });
		expect(withImg.container.querySelectorAll('input[type="text"]')).toHaveLength(2);
		expect(withImg.container.querySelector('select')).toBeTruthy();
	});

	it('calls CC-BY without a credit a breach, and stops saying so once credited', () => {
		const uncredited = render(CustomImageBlock, {
			props: { target: { image: { url: CUSTOM, custom: true, license: 'CC-BY' } } }
		});
		expect(uncredited.container.textContent).toMatch(/CC-BY requires naming the author/);
		const credited = render(CustomImageBlock, {
			props: { target: { image: { url: CUSTOM, custom: true, license: 'CC-BY', credit: 'A. Painter' } } }
		});
		expect(credited.container.textContent).not.toMatch(/CC-BY requires naming the author/);
	});

	it('writes a licence pick onto the node and reports it', async () => {
		const target: any = { image: { url: CUSTOM, custom: true } };
		const onUpdate = vi.fn();
		const { container } = render(CustomImageBlock, { props: { target, onUpdate } });
		const select = container.querySelector('select')!;
		select.value = 'CC-BY';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		expect(target.image.license).toBe('CC-BY');
		expect(onUpdate).toHaveBeenCalled();
		await Promise.resolve();
		expect(container.textContent).toMatch(/CC-BY requires naming the author/);
	});

	it('keeps the url and the custom flag when provenance is edited', () => {
		const target: any = { image: { url: CUSTOM, custom: true } };
		const { container } = render(CustomImageBlock, { props: { target } });
		const credit = container.querySelectorAll('input[type="text"]')[0] as HTMLInputElement;
		credit.value = 'A. Painter';
		credit.dispatchEvent(new Event('input', { bubbles: true }));
		expect(target.image).toMatchObject({ url: CUSTOM, custom: true, credit: 'A. Painter' });
	});
});
