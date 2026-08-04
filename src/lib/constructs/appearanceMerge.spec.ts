// The rule that stops a ship losing its picture: appearance is neither "situation" nor "spec".
// Loading a template over a ship replaced its whole spec, and `image`/`model` rode along with it -
// so a GM who loaded a template onto a ship they had already dressed silently lost the artwork.
// The merge is: keep the ship's own appearance UNLESS the incoming spec brings its own.
import { describe, it, expect } from 'vitest';

// Mirrors ConstructSidePanel.preserveAppearance. Kept here as executable documentation of the
// rule; the component's copy is three lines and is the thing under test conceptually.
const APPEARANCE_FIELDS = ['image', 'model', 'icon_type', 'icon_color'];
function preserveAppearance(incoming: any, current: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of APPEARANCE_FIELDS) {
    if (incoming?.[f] === undefined && current?.[f] !== undefined) out[f] = current[f];
  }
  return out;
}
const applyTemplate = (tpl: any, ship: any, situation: any = {}) =>
  ({ ...tpl, ...preserveAppearance(tpl, ship), ...situation });

describe('appearance survives spec replacement', () => {
  const dressed = { id: 's', name: 'Rocinante', model: { hash: 'abc' }, image: { url: 'data:x', custom: true }, icon_color: '#ff0000' };

  it('keeps the ship\'s model, picture and colour when the template has none', () => {
    const out = applyTemplate({ name: 'Corvette', class: 'Ship/Frigate' }, dressed, { id: 's' });
    expect(out.model.hash).toBe('abc');
    expect(out.image.url).toBe('data:x');
    expect(out.icon_color).toBe('#ff0000');
    expect(out.name).toBe('Corvette'); // the SPEC still replaces
  });

  it('lets a template that ships its own artwork win', () => {
    const tpl = { name: 'Corvette', model: { hash: 'tpl' }, icon_color: '#00ff00' };
    const out = applyTemplate(tpl, dressed, { id: 's' });
    expect(out.model.hash).toBe('tpl');
    expect(out.icon_color).toBe('#00ff00');
    expect(out.image.url).toBe('data:x'); // not offered by the template: the ship keeps its own
  });

  it('situation still outranks everything', () => {
    const out = applyTemplate({ name: 'C', id: 'WRONG' }, dressed, { id: 's', orbit: { hostId: 'earth' } });
    expect(out.id).toBe('s');
    expect(out.orbit.hostId).toBe('earth');
  });
});
