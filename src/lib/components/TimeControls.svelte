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
  // Optional: when the parent is animating the actual/master clock (e.g.
  // SystemView's 5-sec align), it supplies the seconds to show so the read-out
  // counts up. Null/omitted → derive from temporal.masterTimeSec as normal.
  export let masterOverrideSec: bigint | null = null;

  const dispatch = createEventDispatcher();

  // --- Scrub / playback state (owned here) ---
  let scrubControlValue = 0;
  let autoResetTimeScrub = true;
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

  $: currentRate = scrubControlValue !== 0
    ? scrubRateFromControl(scrubControlValue)
    : (isPlaying ? 1 : 0);
  $: formattedScrubRate = formatTimeRate(currentRate);

  $: if (!autoResetTimeScrub) {
      // When unchecking, stop any active scrub and reset slider to 0
      scrubControlValue = 0;
      stopScrubLoop();
  }

  // Derive read-outs + sync play state from the authoritative temporal prop.
  $: {
    const displayResolved = resolveTemporalDisplay(temporal);
    displayClockLabel = displayResolved.formatted;
    displayClockSeconds = parseClockSeconds(temporal.displayTimeSec, 0n).toString();
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
    if (autoResetTimeScrub && isPlaying) setPlaying(false);
    scrubControlValue = Number((event.target as HTMLInputElement).value);
    if (autoResetTimeScrub && Math.abs(scrubControlValue) > 0.0001) {
      ensureScrubLoopRunning();
    }
  }

  function handleScrubRelease() {
    if (autoResetTimeScrub) {
        scrubControlValue = 0;
        stopScrubLoop();
    }
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

    const rate = autoResetTimeScrub ? 1 : scrubRateFromControl(scrubControlValue);
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
      if (autoResetTimeScrub) {
          scrubControlValue = 0;
          stopScrubLoop();
      }
      ensurePlaybackRunning();
    } else {
      stopPlayback();
    }
    if (persist) {
      applyTemporalUpdate((temporal) => ({
        ...temporal,
        playbackRunning: next,
        playbackRateSecPerSec: temporal.playbackRateSecPerSec ?? 1
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

<div class="time-panel">
  <div class="time-title" title="Relativity mode is off. Time dilation sold separately.">🕒</div>
  <div class="clock-line">
    <div class="scrub-control">
      <div class="scrub-label-row">
        <label class="scrub-label" for="time-scrub">
          Scrub Display Time
          {#if currentRate !== 0}
            <span class="scrub-rate">({formattedScrubRate})</span>
          {/if}
        </label>
        <label class="checkbox-label" title="When checked, releasing the slider resets speed to zero and stops time. When unchecked, speed is maintained and only advances when Play is clicked.">
          <input type="checkbox" bind:checked={autoResetTimeScrub} />
          Auto-reset speed
        </label>
      </div>
      <div class="scrub-slider-row">
        <div class="scrub-slider-wrap">
          <input
            id="time-scrub"
            class="scrub-slider"
            type="range"
            min="-1"
            max="1"
            step="0.01"
            value={scrubControlValue}
            on:input={handleScrubInput}
            on:mouseup={handleScrubRelease}
            on:touchend={handleScrubRelease}
            on:pointerup={handleScrubRelease}
            on:change={handleScrubRelease}
          />
          <div class="scrub-scale">
            <span>-10y/s</span>
            <span>slow</span>
            <span>pause</span>
            <span>slow</span>
            <span>+10y/s</span>
          </div>
        </div>
        <button
          class="play-toggle"
          on:click={togglePlayback}
          title={isPlaying ? 'Pause real-time clock advance' : 'Play real-time clock advance (1s/s)'}
          aria-label={isPlaying ? 'Pause time playback' : 'Start time playback'}
          >{isPlaying ? '⏸' : '▶'}</button>
      </div>
    </div>
    <div class="time-readouts">
      <span class="display-time" title={"Display seconds from big bang: " + displayClockSeconds}>Display Time: <strong>{displayClockLabel}</strong></span>
      <span class="actual-time" title={"Actual seconds from big bang: " + masterClockSeconds}><strong>Actual Time:</strong> [{masterCalendarLabel}]</span>
    </div>
    <div class="clock-actions">
      <button class="clock-action btn-blue" on:click={handleResetDisplay} title="Reset display time to current actual time">Reset to Actual Time</button>
      <button class="clock-action btn-red" on:click={handleSetActual} title="Set actual time to current display time">Set Actual Time to Display Time</button>
    </div>
  </div>
</div>

<style>
  .time-panel {
    border: 1px solid #3f3f3f;
    border-radius: 6px;
    background: rgba(18, 18, 18, 0.9);
    padding: 8px 10px;
    margin-bottom: 10px;
    display: flex;
    gap: 12px;
    align-items: center;
    width: 100%;
    box-sizing: border-box;
  }
  .time-title {
    font-size: 3rem;
    font-weight: 400;
    color: #ddd;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
  }
  .clock-line {
    display: flex;
    align-items: center;
    gap: 1.2em;
    color: #ccc;
    font-size: 0.85em;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
  }
  .scrub-control {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 0 0 auto;
    min-width: 390px;
  }
  .scrub-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }
  .scrub-label {
    color: #bbb;
    font-size: 0.8rem;
  }
  .scrub-rate {
    color: #00ffff;
    font-weight: bold;
    margin-left: 4px;
  }
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    color: #888;
    cursor: pointer;
  }
  .checkbox-label input {
    margin: 0;
    cursor: pointer;
  }
  .scrub-slider-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .scrub-slider-wrap {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1 1 auto;
    min-width: 0;
  }
  .scrub-slider {
    width: 100%;
  }
  .scrub-scale {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
    font-size: 0.72rem;
    color: #8f8f8f;
  }
  .scrub-scale span:nth-child(1) { text-align: left; }
  .scrub-scale span:nth-child(2) { text-align: center; }
  .scrub-scale span:nth-child(3) { text-align: center; }
  .scrub-scale span:nth-child(4) { text-align: center; }
  .scrub-scale span:nth-child(5) { text-align: right; }
  .play-toggle {
    width: 30px;
    min-width: 30px;
    height: 24px;
    padding: 0;
    line-height: 1;
    font-size: 0.9rem;
    background: #1f1f1f;
    border: 1px solid #555;
    color: #eee;
    border-radius: 4px;
    cursor: pointer;
  }
  .play-toggle:hover {
    background: #2a2a2a;
  }
  .time-readouts {
    display: flex;
    flex-direction: column;
    gap: 2px;
    justify-content: center;
  }
  .display-time {
    font-size: 1rem;
    white-space: nowrap;
  }
  .actual-time {
    color: #888;
    font-size: 0.9em;
    white-space: nowrap;
  }
  .clock-actions {
    margin-left: auto;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .clock-action {
    padding: 2px 6px;
    background: #2a2a2a;
    border: 1px solid #555;
    color: #eee;
    border-radius: 3px;
    cursor: pointer;
  }
  .clock-action.btn-blue {
    background: #0a4d9b;
    border-color: #2a6fc0;
    color: #fff;
  }
  .clock-action.btn-blue:hover {
    background: #1362bf;
  }
  .clock-action.btn-red {
    background: #8f1d1d;
    border-color: #b23a3a;
    color: #fff;
  }
  .clock-action.btn-red:hover {
    background: #b32929;
  }
</style>
