import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import RailNav from './RailNav.svelte';

// THE SIZE COMPARISON LIVES INSIDE MEASURE, by the owner's own placement: its button is a sub-row
// that only exists while Measure is on. That nesting is a promise, and the promise has a second half
// the first cut missed — the owner, 2026-09-06: "unclicking the measure on the rail should also come
// out of comparison view". Without it the strip stays up with its own button no longer on the rail,
// and the only way back is the view's own X.
//
// The rule is HERE rather than at the two mounts (SystemView and Starmap) because this is the file
// that owns the nesting; kept in the callers it would be the same rule written twice.

/** Render the rail on the system view, where Measure is always offered. */
const rail = (props: Record<string, unknown> = {}, events: Record<string, unknown> = {}) =>
  render(RailNav, { props: { activeView: 'system', ...props }, events } as any);

/** The two events this rule is about, recorded IN ORDER so the closing can be told from the opening. */
const recorder = () => {
  const fired: string[] = [];
  return {
    fired,
    events: {
      ruler: vi.fn(() => fired.push('ruler')),
      sizecompare: vi.fn(() => fired.push('sizecompare'))
    }
  };
};

const measureBtn = (container: HTMLElement) =>
  [...container.querySelectorAll('button.rail-btn')].find(
    (b) => b.textContent?.includes('Measure')
  ) as HTMLButtonElement;

const compareBtn = (container: HTMLElement) =>
  [...container.querySelectorAll('button.rail-btn.sub')].find(
    (b) => b.textContent?.includes('Size comparison')
  ) as HTMLButtonElement | undefined;

describe('the rail — the size comparison is a sub-tool of Measure', () => {
  it('offers the comparison only while Measure is on', () => {
    expect(compareBtn(rail({ rulerOn: false }).container)).toBeUndefined();
    expect(compareBtn(rail({ rulerOn: true }).container)).toBeTruthy();
  });

  it('puts the comparison away when Measure is switched OFF', async () => {
    const rec = recorder();
    const { container } = rail({ rulerOn: true, sizeCompareOn: true }, rec.events);
    await fireEvent.click(measureBtn(container));
    const fired = rec.fired;
    // Both, and the comparison first — the view closes as the tool that holds it goes away.
    expect(fired).toEqual(['sizecompare', 'ruler']);
  });

  it('leaves the comparison alone when it was not open', async () => {
    const rec = recorder();
    const { container } = rail({ rulerOn: true, sizeCompareOn: false }, rec.events);
    await fireEvent.click(measureBtn(container));
    const fired = rec.fired;
    expect(fired).toEqual(['ruler']);
  });

  it('never opens the comparison when Measure is switched ON', async () => {
    // `sizeCompareOn` cannot be true here in practice, but a stale prop must not turn the strip on
    // as a side effect of reaching for the tape measure.
    const rec = recorder();
    const { container } = rail({ rulerOn: false, sizeCompareOn: true }, rec.events);
    await fireEvent.click(measureBtn(container));
    const fired = rec.fired;
    expect(fired).toEqual(['ruler']);
  });
});

// THE BRAND MARK IS THE WAY BACK TO "WHAT'S NEW" - owner, 2026-09-08: *"Have clicking on the SSE3.1
// logo in the corner have the 'What's New' pop up again... that version ties stuff together."* It
// USED to copy the version to the clipboard (owner, 2026-08-30). That is a deliberate change rather
// than a regression, and this pins it both ways: the panel opens, and the clipboard is left alone -
// which matters because the app now watches the clipboard for pasteable content, so a silent stomp
// on every click would put a phantom clip in the GM's hands.
describe('the brand mark', () => {
  it('asks for What’s New, and does not touch the clipboard', async () => {
    const fired: string[] = [];
    const write = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    const { getByLabelText } = rail({}, { whatsnew: () => fired.push('whatsnew') });
    await fireEvent.click(getByLabelText(/what’s new/i));
    expect(fired).toEqual(['whatsnew']);
    expect(write, 'the clipboard is not written on a plain logo click').not.toHaveBeenCalled();
  });
});
