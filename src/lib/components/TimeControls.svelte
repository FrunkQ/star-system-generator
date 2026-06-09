<script lang="ts">
  // Shared time-scrubber + playback panel, extracted from Starmap & SystemView
  // (Phase 01.1). Owns all the ephemeral scrub/playback state and the two rAF
  // loops; reads the authoritative `temporal` via prop and dispatches
  // `updatetemporal` with the next temporal state. The parent owns/persists time.
  //
  // NOTE: this is the Star Map (display-time-only) behaviour. SystemView layers
  // its orbit-simulation clock + alignment animation around this component.
  import { createEventDispatcher, onDestroy } from 'svelte';
  import type { Starmap } from '$lib/types';
  import { updateDisplayBySeconds } from '$lib/temporal/defaults';
  import { parseClockSeconds, resolveCalendar, resolveTemporalDisplay } from '$lib/temporal/utre';

  type Temporal = NonNullable<Starmap['temporal']>;

  export let temporal: Temporal;
  // Compact layout for the phone bottom bar: hides the big clock glyph, drops the
  // 390px min-width, and lets the panel wrap/scroll in a slim fixed-height bar.
  export let compact = false;
  // Optional read-out overrides for when the parent animates the clocks (e.g.
  // SystemView's 5-sec align): masterOverrideSec drives the Actual read-out,
  // displayOverrideSec drives the Display read-out. Null/omitted → derive from
  // temporal as normal.
  export let masterOverrideSec: bigint | null = null;
  export let displayOverrideSec: bigint | null = null;

  const dispatch = createEventDispatcher();

  // --- Transport UI state ---
  let expanded = false; // the "⋯" secondary panel (actual time / reset / set-actual)

  // Playback-speed ladder (sim seconds per real second). The +/- stepper walks this and
  // Play runs at the selected rate, so time can keep advancing faster than 1s/s without
  // any hidden "lock" toggle.
  const RATE_STEPS = [1, 10, 60, 600, 3600, 21600, 86400, 604800, 2592000, 31536000, 315360000];
  let rateIndex = 0;
  $: playRate = RATE_STEPS[rateIndex];
  function faster() { if (rateIndex < RATE_STEPS.length - 1) rateIndex++; }
  function slower() { if (rateIndex > 0) rateIndex--; }

  // --- Scrub / playback state (owned here) ---
  let scrubControlValue = 0;
  let scrubRafId: number | null = null;
  let scrubLastTimestamp: number | null = null;
  let scrubCarrySeconds = 0;
  let playbackRafId: number | null = null;
  let playbackLastTimestamp: number | null = null;
  let playbackCarrySeconds = 0;
  // Bindable so a parent (SystemView) can read live play state for broadcast/sync.
  export let isPlaying = false;
  export let timeScale = 0;

  // --- Derived display read-outs ---
  let displayClockLabel = '';
  let displayClockSeconds = '';
  let masterClockSeconds = '';
  let masterCalendarLabel = '';

  function formatTimeRate(secondsPerSec: number): string {
    const abs = Math.abs(secondsPerSec);
    if (abs === 0) return '0s/s';
    const sign = secondsPerSec >= 0 ? '+' : '-';

    if (abs < 1) return sign + abs.toFixed(2) + 's/s';
    if (abs < 60) return sign + Math.round(abs) + 's/s';

    const minutes = abs / 60;
    if (minutes < 60) return sign + Math.round(minutes) + 'm/s';

    const hours = abs / 3600;
    if (hours < 24) return sign + Math.round(hours) + 'h/s';

    const days = abs / 86400;
    if (days < 365.25) return sign + Math.round(days) + 'd/s';

    const years = abs / 31536000;
    return sign + Math.round(years) + 'y/s';
  }

  // Rate shown on the pill: the live scrub rate while jogging, else the selected play rate.
  $: shownRate = scrubControlValue !== 0 ? scrubRateFromControl(scrubControlValue) : playRate;
  $: formattedRate = formatTimeRate(shownRate);

  // Jump-to-now direction: if the display clock is BEHIND actual ("now"), jumping moves
  // time FORWARD (⏭); if AHEAD, BACKWARD (⏮). At now → neutral/dimmed. Good at-a-glance
  // cue for whether you're off the current time and which way the jump goes.
  $: jumpBehind = (() => { try { return BigInt(displayClockSeconds || '0') < BigInt(masterClockSeconds || '0'); } catch { return false; } })();
  $: jumpAhead = (() => { try { return BigInt(displayClockSeconds || '0') > BigInt(masterClockSeconds || '0'); } catch { return false; } })();
  $: atNow = !jumpBehind && !jumpAhead;


  // Derive read-outs + sync play state from the authoritative temporal prop.
  $: {
    const displayTemporal = displayOverrideSec !== null
      ? { ...temporal, displayTimeSec: displayOverrideSec.toString() }
      : temporal;
    const displayResolved = resolveTemporalDisplay(displayTemporal);
    displayClockLabel = displayResolved.formatted;
    displayClockSeconds = (displayOverrideSec ?? parseClockSeconds(temporal.displayTimeSec, 0n)).toString();
    const masterSeconds = masterOverrideSec ?? parseClockSeconds(temporal.masterTimeSec, 0n);
    masterClockSeconds = masterSeconds.toString();
    const calendar = temporal.temporal_registry[temporal.activeCalendarKey];
    masterCalendarLabel = calendar ? resolveCalendar(masterSeconds, calendar).formatted : masterClockSeconds;
    const desiredPlayback = temporal.playbackRunning ?? false;
    if (desiredPlayback !== isPlaying) {
      setPlaying(desiredPlayback, false);
    }
  }

  function applyTemporalUpdate(mutator: (temporal: Temporal) => Temporal) {
    dispatch('updatetemporal', mutator(temporal));
  }

  function scrubDisplay(deltaSec: bigint) {
    applyTemporalUpdate((temporal) => updateDisplayBySeconds(temporal, deltaSec));
  }

  // Clock actions are parent-handled so each screen can differ: Star Map does
  // the instant version; SystemView does its animated align / orbit-clock
  // version. We stop our own playback loop first, then dispatch.
  function handleResetDisplay() {
    setPlaying(false);
    dispatch('resetdisplay');
  }

  function handleSetActual() {
    // The only genuinely destructive time action: it moves the authoritative "now" anchor for
    // the whole campaign to whatever you're currently viewing. Confirm before committing.
    if (!confirm('Set the campaign’s current time ("now") to the time you are viewing?\n\nThis moves the authoritative clock for everyone and cannot be undone.')) return;
    setPlaying(false);
    dispatch('setactual');
  }

  function scrubRateFromControl(value: number): number {
    const abs = Math.abs(value);
    if (abs < 0.02) return 0;
    const minRate = 60; // 1 minute per second
    const maxRate = 315360000; // 10 years per second
    const normalized = (abs - 0.02) / 0.98;
    const rate = minRate * Math.pow(maxRate / minRate, normalized);
    return Math.sign(value) * rate;
  }

  function tickScrub(timestamp: number) {
    if (scrubLastTimestamp === null) {
      scrubLastTimestamp = timestamp;
      scrubRafId = requestAnimationFrame(tickScrub);
      return;
    }
    const dt = (timestamp - scrubLastTimestamp) / 1000;
    scrubLastTimestamp = timestamp;
    const rate = scrubRateFromControl(scrubControlValue);
    if (rate !== 0) {
      scrubCarrySeconds += rate * dt;
      const whole = scrubCarrySeconds > 0 ? Math.floor(scrubCarrySeconds) : Math.ceil(scrubCarrySeconds);
      if (whole !== 0) {
        scrubDisplay(BigInt(whole));
        scrubCarrySeconds -= whole;
      }
    }
    scrubRafId = requestAnimationFrame(tickScrub);
  }

  function ensureScrubLoopRunning() {
    if (scrubRafId !== null) return;
    scrubLastTimestamp = null;
    scrubRafId = requestAnimationFrame(tickScrub);
  }

  function stopScrubLoop() {
    if (scrubRafId !== null) {
      cancelAnimationFrame(scrubRafId);
      scrubRafId = null;
    }
    scrubLastTimestamp = null;
    scrubCarrySeconds = 0;
  }

  function handleScrubInput(event: Event) {
    if (isPlaying) setPlaying(false);
    scrubControlValue = Number((event.target as HTMLInputElement).value);
    if (Math.abs(scrubControlValue) > 0.0001) {
      ensureScrubLoopRunning();
    }
  }

  // The shuttle is a momentary jog — always springs back to 0 (stop) on release.
  function handleScrubRelease() {
    scrubControlValue = 0;
    stopScrubLoop();
  }

  function tickPlayback(timestamp: number) {
    if (!isPlaying) {
      playbackRafId = null;
      return;
    }
    if (playbackLastTimestamp === null) {
      playbackLastTimestamp = timestamp;
      playbackRafId = requestAnimationFrame(tickPlayback);
      return;
    }
    const dt = (timestamp - playbackLastTimestamp) / 1000;
    playbackLastTimestamp = timestamp;

    const rate = playRate;
    timeScale = rate;
    playbackCarrySeconds += rate * dt;

    const whole = playbackCarrySeconds > 0 ? Math.floor(playbackCarrySeconds) : Math.ceil(playbackCarrySeconds);
    if (whole !== 0) {
      scrubDisplay(BigInt(whole));
      playbackCarrySeconds -= whole;
    }
    playbackRafId = requestAnimationFrame(tickPlayback);
  }

  function ensurePlaybackRunning() {
    if (playbackRafId !== null) return;
    playbackLastTimestamp = null;
    playbackRafId = requestAnimationFrame(tickPlayback);
  }

  function stopPlayback() {
    if (playbackRafId !== null) {
      cancelAnimationFrame(playbackRafId);
      playbackRafId = null;
    }
    playbackLastTimestamp = null;
    playbackCarrySeconds = 0;
    timeScale = 0;
  }

  function setPlaying(next: boolean, persist = true) {
    if (isPlaying === next) return;
    isPlaying = next;
    // Parity with SystemView for broadcast/sync
    if (isPlaying) {
      scrubControlValue = 0;
      stopScrubLoop();
      ensurePlaybackRunning();
    } else {
      stopPlayback();
    }
    if (persist) {
      applyTemporalUpdate((temporal) => ({
        ...temporal,
        playbackRunning: next,
        playbackRateSecPerSec: playRate
      }));
    }
  }

  function togglePlayback() {
    setPlaying(!isPlaying);
  }

  onDestroy(() => {
    isPlaying = false;
    stopPlayback();
    stopScrubLoop();
  });
</script>

<div class="time-transport" class:expanded class:compact>
  <button
    class="tt-btn tt-jump"
    class:at-now={atNow}
    on:click={handleResetDisplay}
    title={atNow ? 'Display is at the current time' : (jumpBehind ? 'Jump forward to now' : 'Jump back to now')}
    aria-label="Jump to now"
  >{jumpBehind ? '⏭' : '⏮'}</button>
  <button class="tt-btn tt-play" class:playing={isPlaying} on:click={togglePlayback} title={isPlaying ? 'Pause' : 'Play (real-time)'} aria-label={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? '⏸' : '▶'}</button>

  <div class="tt-shuttle" title="Scrub — drag to jog forward / back; release to stop">
    <span class="tt-center" aria-hidden="true"></span>
    <input
      class="tt-slider"
      type="range"
      min="-1" max="1" step="0.01"
      value={scrubControlValue}
      on:input={handleScrubInput}
      on:mouseup={handleScrubRelease}
      on:touchend={handleScrubRelease}
      on:pointerup={handleScrubRelease}
      on:change={handleScrubRelease}
      aria-label="Time scrub"
    />
  </div>

  <div class="tt-speed">
    <button class="tt-step" on:click={slower} disabled={rateIndex === 0} title="Slower" aria-label="Slower">−</button>
    <div class="tt-rate" class:active={isPlaying || scrubControlValue !== 0} title="Playback speed — Play advances time at this rate">{formattedRate}</div>
    <button class="tt-step" on:click={faster} disabled={rateIndex === RATE_STEPS.length - 1} title="Faster" aria-label="Faster">+</button>
  </div>

  <button class="tt-btn tt-more tt-warn" class:on={expanded} on:click={() => (expanded = !expanded)} title="Danger: rewrite the campaign's current time" aria-label="Set current time (danger)">⚠</button>

  {#if expanded}
    <div class="tt-panel">
      <button class="tt-action danger" on:click={handleSetActual}>Set current time to displayed time</button>
      <p class="tt-warn-note">This is the only thing here that isn't on the bar already. It moves the authoritative "now" for the whole campaign to the time you're viewing.</p>
    </div>
  {/if}
</div>

<style>
  /* Transport pill — a clean overlay over the orrery: jump-to-now, play/pause,
     a spring-back shuttle scrub (the main interaction), the live date, and a
     "..." that expands the secondary actions. */
  .time-transport {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--bg-panel, #14161c) 86%, transparent);
    border: 1px solid var(--border, #2a2d36);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(7px);
    color: var(--text, #e8e8e8);
    font-size: 0.85rem;
    box-sizing: border-box;
  }
  .tt-btn {
    flex: 0 0 auto;
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border, #2a2d36);
    border-radius: 8px;
    background: var(--bg-control, #1b1e26);
    color: var(--text, #e8e8e8);
    font-size: 0.95rem;
    line-height: 1;
    cursor: pointer;
  }
  .tt-btn:hover { background: var(--bg-control-hover, #232733); }
  /* Jump-to-now stands out when the display is off "now"; dims when already at now. */
  .tt-jump:not(.at-now) {
    border-color: var(--accent, #ff5a1f);
    color: var(--accent, #ff5a1f);
  }
  .tt-jump.at-now { opacity: 0.4; }
  .tt-play {
    background: var(--accent, #ff5a1f);
    border-color: var(--accent, #ff5a1f);
    color: var(--on-accent, #fff);
  }
  .tt-play:hover { background: var(--accent-hover, #ff7a45); }
  .tt-play.playing { box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent, #ff5a1f) 45%, transparent); }

  .tt-shuttle {
    position: relative;
    flex: 1 1 auto;
    min-width: 110px;
    display: flex;
    align-items: center;
  }
  .tt-center {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 2px;
    height: 14px;
    transform: translate(-50%, -50%);
    background: var(--text-faint, #6b7280);
    border-radius: 1px;
    pointer-events: none;
  }
  .tt-slider {
    width: 100%;
    margin: 0;
    accent-color: var(--accent, #ff5a1f);
    cursor: ew-resize;
  }

  .tt-speed {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .tt-step {
    flex: 0 0 auto;
    width: 24px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border, #2a2d36);
    border-radius: 7px;
    background: var(--bg-control, #1b1e26);
    color: var(--text, #e8e8e8);
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
  }
  .tt-step:hover { background: var(--bg-control-hover, #232733); }
  .tt-step:disabled { opacity: 0.35; cursor: default; }
  .tt-rate {
    flex: 0 0 auto;
    min-width: 56px;
    text-align: center;
    font-size: 0.76rem;
    color: var(--text-faint, #8a8f9a);
    font-variant-numeric: tabular-nums;
  }
  .tt-rate.active { color: #00e5ff; font-weight: 700; }

  .tt-more.on { background: var(--bg-control-hover, #232733); }
  /* The "more" trigger is a red warning: the sole action it hides is the destructive set-now. */
  .tt-warn { color: var(--status-bad, #e0484d); border-color: color-mix(in srgb, var(--status-bad, #e0484d) 55%, var(--border, #2a2d36)); }
  .tt-warn:hover { background: color-mix(in srgb, var(--status-bad, #e0484d) 18%, var(--bg-control, #1b1e26)); }
  .tt-warn-note { margin: 0; font-size: 0.72rem; line-height: 1.4; color: var(--text-faint, #8a8f9a); }

  .tt-panel {
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    min-width: 240px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--bg-panel, #14161c);
    border: 1px solid var(--border, #2a2d36);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
  }
  .tt-prow { display: flex; justify-content: space-between; gap: 12px; font-size: 0.85rem; }
  .tt-k { color: var(--text-faint, #8a8f9a); }
  .tt-v { color: var(--text, #e8e8e8); }
  .tt-action {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--border, #2a2d36);
    background: var(--bg-control, #1b1e26);
    color: var(--text, #e8e8e8);
    cursor: pointer;
    text-align: left;
  }
  .tt-action:hover { background: var(--bg-control-hover, #232733); }
  .tt-action.danger {
    background: var(--status-bad, #b91c1c);
    border-color: var(--status-bad, #b91c1c);
    color: #fff;
  }
  .tt-action.danger:hover { filter: brightness(1.12); }

  /* Phone: tighten the transport pill — smaller buttons, a shorter/slimmer shuttle. */
  .time-transport.compact { gap: 4px; padding: 3px 5px; font-size: 0.78rem; }
  .time-transport.compact .tt-rate { min-width: 0; font-size: 0.68rem; }
  .time-transport.compact .tt-btn { width: 28px; height: 28px; font-size: 0.85rem; }
  .time-transport.compact .tt-step { width: 20px; height: 24px; }
  .time-transport.compact .tt-shuttle { min-width: 64px; }
  .time-transport.compact .tt-slider { height: 3px; }
  .time-transport.compact .tt-center { height: 10px; }
</style>
