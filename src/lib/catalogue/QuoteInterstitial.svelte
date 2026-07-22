<script lang="ts">
  // Hold-screen INTERSTITIAL: shown when a player is connected but there's nothing to display (no
  // broadcast yet, or the GM stopped the view). Styled like a classic quote wallpaper: a full-bleed
  // planet/star image, a dimmed stripe across the centre carrying a random space quote in light italics
  // with a smaller attribution beneath, framed by a double-line border — plus a QR code so new players
  // can scan straight into the player view. Quote + image re-roll each time the interstitial mounts.
  import { onMount } from 'svelte';
  import QRCode from 'qrcode';
  import { loadSpaceQuotes, pickQuote, pickImage, type SpaceQuote } from './spaceQuotes';

  export let joinUrl = '';        // the player-view URL for the QR (empty = no QR)
  export let brandName = '';      // in-universe letterhead, shown as a small badge
  export let statusText = '';     // one-line status ("The GM has paused the display", "Connecting…")
  export let sessionId = '';      // small session stamp (waiting state)

  let quote: SpaceQuote | null = null;
  let image = '';
  let qrDataUrl = '';

  onMount(() => {
    image = pickImage();
    loadSpaceQuotes().then((qs) => (quote = pickQuote(qs)));
    if (joinUrl) {
      QRCode.toDataURL(joinUrl, { margin: 1, width: 200, color: { dark: '#0a0d14', light: '#ffffff' } })
        .then((d: string) => (qrDataUrl = d))
        .catch(() => (qrDataUrl = ''));
    }
  });
</script>

<div class="interstitial" style="background-image: url('{image}')">
  <div class="frame"></div>
  {#if brandName}<div class="badge">{brandName}</div>{/if}

  <div class="stripe">
    {#if quote}
      <blockquote>“{quote.text}”</blockquote>
      <div class="by">— {quote.by}</div>
    {:else}
      <blockquote class="fallback">Please stand by</blockquote>
    {/if}
  </div>

  <div class="foot">
    <div class="status">
      {#if statusText}<p>{statusText}</p>{/if}
      {#if sessionId}<p class="sid">session {sessionId}</p>{/if}
      <slot />
    </div>
    {#if qrDataUrl}
      <div class="join">
        <img src={qrDataUrl} alt="QR code — scan to open the player view" />
        <span>scan to join</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .interstitial {
    position: absolute; inset: 0; z-index: 500; /* over the status bar / stage, like the old hold screen */
    background-color: #05070c;
    background-size: cover; background-position: center;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    overflow: hidden;
  }
  /* A gentle veil + corner vignette over the art so the frame, quote and footer read on ANY image
     (some star art is nearly white). Sits under the frame/stripe/foot. */
  .interstitial::before {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(ellipse at center, rgba(4, 6, 10, 0.18) 40%, rgba(4, 6, 10, 0.55) 100%);
  }
  /* Cool border: a double-line inset frame floating just inside the screen edge. A dark shadow line
     under the light one keeps it visible over bright art. */
  .frame {
    position: absolute; inset: 14px; pointer-events: none;
    border: 1px solid rgba(235, 240, 250, 0.6);
    outline: 3px double rgba(235, 240, 250, 0.32);
    outline-offset: 5px;
    box-shadow: 0 0 0 1px rgba(4, 6, 10, 0.55), inset 0 0 0 1px rgba(4, 6, 10, 0.55);
  }
  .badge {
    position: absolute; top: 34px; left: 0; right: 0; text-align: center;
    font-size: 0.72rem; letter-spacing: 0.32em; text-transform: uppercase;
    color: rgba(235, 240, 250, 0.75); text-shadow: 0 1px 6px rgba(0, 0, 0, 0.8);
  }
  /* The dimmed stripe: a full-width band behind the quote so it always contrasts with the art. */
  .stripe {
    width: 100%; padding: clamp(1.2rem, 4vh, 2.6rem) clamp(1.4rem, 8vw, 6rem);
    background: linear-gradient(rgba(4, 6, 10, 0), rgba(4, 6, 10, 0.72) 14%, rgba(4, 6, 10, 0.72) 86%, rgba(4, 6, 10, 0));
    text-align: center;
  }
  blockquote {
    margin: 0;
    font-family: Georgia, 'Times New Roman', serif;
    font-style: italic;
    font-weight: 300;
    font-size: clamp(1.15rem, 3.2vw, 2.3rem);
    line-height: 1.45;
    color: #f4f6fa;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.85);
    max-width: 26em; margin-inline: auto;
  }
  blockquote.fallback { opacity: 0.7; }
  .by {
    margin-top: 0.9em;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: clamp(0.72rem, 1.4vw, 1rem);
    letter-spacing: 0.14em; text-transform: uppercase;
    color: rgba(235, 240, 250, 0.82);
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.85);
  }
  .foot {
    position: absolute; left: 34px; right: 34px; bottom: 32px;
    display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem;
  }
  .status {
    text-align: left; color: rgba(235, 240, 250, 0.88); text-shadow: 0 1px 5px rgba(0, 0, 0, 0.85);
    background: rgba(4, 6, 10, 0.55); border-radius: 6px; padding: 8px 12px; /* readable over bright art */
  }
  .status p { margin: 0 0 2px; font-size: 0.85rem; }
  .status .sid { font-size: 0.68rem; opacity: 0.55; }
  .status :global(button) {
    margin-top: 8px; padding: 6px 14px; cursor: pointer;
    background: rgba(10, 14, 22, 0.72); color: #e8edf4;
    border: 1px solid rgba(235, 240, 250, 0.4); border-radius: 4px; font: inherit; font-size: 0.8rem;
  }
  .join { display: flex; flex-direction: column; align-items: center; gap: 5px; }
  .join img { width: clamp(76px, 11vw, 120px); height: auto; border-radius: 6px; background: #fff; padding: 4px; box-shadow: 0 2px 14px rgba(0, 0, 0, 0.6); }
  .join span { font-size: 0.66rem; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(235, 240, 250, 0.75); text-shadow: 0 1px 5px rgba(0, 0, 0, 0.85); }
  @media (max-width: 640px) {
    .foot { flex-direction: column; align-items: center; }
    .status { text-align: center; }
  }
</style>
