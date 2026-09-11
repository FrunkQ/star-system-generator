<script lang="ts">
  // COPY ONE DEFINITION A GM MADE - G99, the copy half of R-19 (Stream AA job 4).
  //
  // The owner, 2026-09-11: *"we should be able to add copy options on the various worlds/tech
  // settings in (not default ones) as the paster knows how to deal with them. A quick easy way of
  // getting new drive/atmo/liquid presets"*. ONE button, in every Settings editor that holds a section
  // the paste already merges - liquids, gases, atmosphere mixes, fuels, engines, sensors, morphologies
  // and pigments - so eight editors cannot grow eight ideas of what a copy is.
  //
  // WHAT IT DOES NOT DECIDE, and each is somebody else's single answer:
  //  - WHETHER a definition is the GM's: `isShippedDefinition` asks the section's own `fromPack`, the
  //    lookup the paste uses. A shipped definition gets no button - every campaign already has it.
  //    Asked of the shipped PACK rather than of the editor's form, because a form that fills in a field
  //    the pack never declared makes a shipped record look edited the moment the dialog renders.
  //  - WHAT the clip carries: `rulesForDefinition`, which also carries the custom definitions this one
  //    names (an engine's fuel, a gas's liquid, a mix's gases).
  //  - HOW it is put down: `putClip`, the one copy buffer, which writes the system clipboard too -
  //    so it pastes into another campaign, another tab, or the hub's own paste screen.
  import type { RulePack, RulePackOverrides } from '$lib/types';
  import { effectiveDefinitions, isShippedDefinition, rulesForDefinition, SECTIONS } from '$lib/io/clipRules';
  import { buildRulesClip, describeClipRoot } from '$lib/io/hubClip';
  import { putClip } from '$lib/io/clipBuffer';

  /** The section of `RulePackOverrides` this definition belongs to. */
  export let section: keyof RulePackOverrides;
  /** Its identity within the section: a liquid's `name`, a fuel's `id`, a gas's formula... */
  export let id: string;
  /** The definition as the editor holds it now - what the GM is looking at. */
  export let definition: unknown;
  /** The SHIPPED pack, which every Settings editor is already handed (DATA-R47). */
  export let pack: RulePack;
  /** The campaign's saved overrides: where the definitions this one names are found. */
  export let overrides: RulePackOverrides | undefined = undefined;
  /**
   * Where a named definition is found FIRST - the editor's own unsaved list, when the editor holds
   * that section (Fuel & Drives holds the fuels its engines burn). Falls back to the campaign.
   */
  export let draft: (section: keyof RulePackOverrides, id: string) => unknown = () => undefined;
  /** The campaign's name, which the paste screen shows as "From <name>". */
  export let campaignName: string | undefined = undefined;

  let copied = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  $: shipped = isShippedDefinition(section, id, pack);
  $: noun = SECTIONS.find((s) => s.key === section)?.one ?? 'definition';

  function lookup(key: keyof RulePackOverrides, refId: string): unknown {
    const own = draft(key, refId);
    if (own !== undefined) return own;
    const def = SECTIONS.find((s) => s.key === key);
    return def ? effectiveDefinitions(def, overrides, pack).get(refId) : undefined;
  }

  function copy() {
    const name = campaignName?.trim();
    const clip = buildRulesClip(rulesForDefinition(section, id, definition, pack, lookup), name ? { title: name } : undefined);
    if (!clip) return;
    putClip(clip, describeClipRoot(clip));
    copied = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => (copied = false), 1600);
  }
</script>

{#if id && !shipped}
  <button
    type="button"
    class="copy-def"
    title={`Copy this ${noun} - paste it into another campaign to use it there`}
    aria-label={`Copy ${id}`}
    on:click|stopPropagation={copy}>{copied ? 'Copied' : 'Copy'}</button>
{/if}

<style>
  .copy-def {
    flex: 0 0 auto;
    background: var(--bg-control);
    color: var(--text-faint);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 8px;
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .copy-def:hover,
  .copy-def:focus-visible {
    color: var(--text);
    border-color: var(--accent, #7aa2f7);
  }
</style>
