# Adding a New Transition

Transitions are fully self-contained. Adding one requires a single new file — no registry edits, no imports elsewhere.

## How it works

When the GM switches maps, the engine:

1. Captures the current player frame as a static bitmap snapshot.
2. Paints the snapshot onto the overlay canvas (covering the Three.js canvas below).
3. Loads the new map, filter, and view into the Three.js canvas underneath — invisible to the player.
4. Waits one animation frame so Three.js has rendered the new content.
5. Calls your `play()` function — at this point the new map is already fully rendered underneath the snapshot.
6. Your animation removes parts of the snapshot (or animates it away) to reveal the new map below.
7. When `play()` resolves, the engine clears the overlay completely.

The overlay canvas sits above the Three.js renderer canvas (`z-index: 10`, `position: fixed; inset: 0`). You draw on it with standard Canvas 2D API. The `destination-out` composite operation is the key tool: it punches transparent holes in the overlay to reveal whatever is underneath.

## File structure

```
src/transitions/definitions/
  your_transition_id/
    index.ts        ← only file needed
```

The registry auto-discovers `index.ts` files via `import.meta.glob`. Any module that exports a default `TransitionDefinition` is automatically added to the dropdown. A module with no default export (or `export {}`) is silently skipped — useful for stubs.

## Minimal example

```typescript
import type { TransitionDefinition } from '../../schema.ts';
import { animate, easeInOut } from '../../easing.ts';

export default {
  id: 'my_transition',    // must match the folder name by convention
  label: 'My Transition', // shown in the GM dropdown
  params: [
    {
      type: 'slider',
      id: 'duration',
      label: 'Duration',
      min: 200,
      max: 2000,
      step: 100,
      default: 600,
      unit: 'ms',
    },
  ],

  async play({ overlay, snapshot, params }) {
    const duration = (params['duration'] as number) ?? 600;
    const ctx = overlay.getContext('2d')!;
    const { width: w, height: h } = overlay;

    await animate(duration, (t) => {
      // t runs 0 → 1 over `duration` ms, shaped by the easing function.

      // Redraw snapshot each frame (clears previous drawing state)
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(snapshot, 0, 0, w, h);

      // Punch a growing hole to reveal the new map underneath
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(0, 0, t * w, h); // simple left-to-right wipe
      ctx.restore();
    }, easeInOut);
  },
} satisfies TransitionDefinition;
```

## TransitionContext

```typescript
interface TransitionContext {
  overlay:  HTMLCanvasElement;  // full-screen canvas; draw here
  snapshot: ImageBitmap;        // captured frame of the old map
  params:   Record<string, number | string>;  // resolved param values
}
```

The new map is already loaded in the Three.js canvas by the time `play()` is called. Your job is simply to animate the snapshot away.

## Param types

Both `slider` and `select` are supported:

```typescript
// Numeric slider
{ type: 'slider', id: 'speed', label: 'Speed', min: 0, max: 1, step: 0.1, default: 0.5, unit: 'x' }

// Dropdown
{ type: 'select', id: 'direction', label: 'Direction',
  options: [{ value: 'left', label: '← Left' }, { value: 'right', label: '→ Right' }],
  default: 'left' }
```

Always cast param values — they come in as `number | string`:

```typescript
const speed     = (params['speed']     as number) ?? 0.5;
const direction = (params['direction'] as string) ?? 'left';
```

## Easing helpers (`../../easing.ts`)

```typescript
animate(durationMs, (t) => { /* draw */ }, easingFn): Promise<void>
```

Available easings: `linear`, `easeIn`, `easeOut`, `easeInOut`.

## Tips

- **Always `clearRect` at the start of each frame** — Canvas 2D state accumulates.
- **`destination-out` punches holes** — anything drawn with this composite operation removes pixels from the canvas, making it transparent and revealing the Three.js canvas below.
- **Avoid drawing on the overlay before `play()` starts** — the engine already paints the snapshot there for you as part of its cover step.
- **Return a `Promise`** — `animate()` returns one; if you do something custom, make sure `play()` resolves when the animation is complete.
- **Keep the `id` unique** — it's the registry key. Clash with an existing id and one will silently win.
