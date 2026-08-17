<script lang="ts">
  /**
   * /bridge — the VTT integration DISCOVERY frame (docs/dev/vtt-integration-design.md 9.2).
   *
   * A host app (Mappadux's StarMap map kind, a Foundry/Owlbear shim) embeds this page hidden.
   * BroadcastChannel is ORIGIN-scoped, not tab-scoped, so this frame sits on the same channel as
   * the GM's SSE2 tab in this browser and can ask it "who is here" using the existing broadcast
   * plumbing — the host never has to speak the SSE2 wire protocol. It relays to its parent over
   * postMessage, both directions origin-checked against the one allowlist.
   *
   * READ / RELAY ONLY. It exposes starmap identity + Player View names (what a sid-holder could learn
   * anyway) and can ask the GM tab to start remote hosting. It cannot read the campaign, cannot edit
   * anything, and carries no token. Protocol frames all carry {ns:'sse2-bridge', v:1}:
   *   parent -> bridge: {cmd:'hello', requestId} | {cmd:'ensureRemote', sessionId, requestId}
   *   bridge -> parent: {event:'ready'} | {event:'announce', requestId?, payload}
   *                     | {event:'gone', requestId} | {event:'ok', requestId} | {event:'error', ...}
   * Unsolicited announces (the GM loads a map / renames / adds a preset AFTER hello) are forwarded
   * with no requestId — that is how a host's "open SSE2, then auto-resume" flow completes.
   */
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { broadcastService, type AnnouncePayload } from '$lib/broadcast';
  import { isAllowedEmbedOrigin } from '$lib/embedOrigins';

  const NS = 'sse2-bridge';
  const HELLO_TIMEOUT_MS = 2500;

  let parentOrigin: string | null = null;      // learned from the first allowed inbound message
  let embedded = false;
  let lastAnnounce: AnnouncePayload | null = null;
  const pendingHellos = new Map<string, ReturnType<typeof setTimeout>>();

  function reply(frame: Record<string, unknown>) {
    if (!parentOrigin || window.parent === window) return;
    window.parent.postMessage({ ns: NS, v: 1, ...frame }, parentOrigin);
  }

  function onAnnounce(a: AnnouncePayload) {
    lastAnnounce = a;
    if (pendingHellos.size === 0) { reply({ event: 'announce', payload: a }); return; }
    for (const [requestId, timer] of pendingHellos) {
      clearTimeout(timer);
      reply({ event: 'announce', requestId, payload: a });
    }
    pendingHellos.clear();
  }

  function onMessage(e: MessageEvent) {
    if (window.parent === window || e.source !== window.parent) return;
    if (!isAllowedEmbedOrigin(e.origin)) return;
    const d = e.data;
    if (!d || d.ns !== NS || d.v !== 1 || typeof d.cmd !== 'string') return;
    parentOrigin = e.origin;
    const requestId = typeof d.requestId === 'string' ? d.requestId : String(Date.now());

    if (d.cmd === 'hello') {
      const timer = setTimeout(() => {
        pendingHellos.delete(requestId);
        reply({ event: 'gone', requestId });
      }, HELLO_TIMEOUT_MS);
      pendingHellos.set(requestId, timer);
      broadcastService.sendMessage({ type: 'REQUEST_HELLO', payload: null });
    } else if (d.cmd === 'ensureRemote') {
      const sid = typeof d.sessionId === 'string' ? d.sessionId : null;
      if (!sid) { reply({ event: 'error', requestId, message: 'ensureRemote needs sessionId' }); return; }
      broadcastService.sendMessage({ type: 'REQUEST_REMOTE', payload: sid });
      reply({ event: 'ok', requestId });
    } else {
      reply({ event: 'error', requestId, message: `unknown cmd ${d.cmd}` });
    }
  }

  onMount(() => {
    if (!browser) return;
    embedded = window.parent !== window;
    broadcastService.initProbe(onAnnounce);
    window.addEventListener('message', onMessage);
    // Announce readiness to whoever framed us — but only to an allowed origin, which we learn
    // from THEIR first message. Until then, a generic 'ready' can only go to a parent whose origin
    // we already trust: same-origin, or the referrer if it is allowlisted.
    try {
      const ref = document.referrer ? new URL(document.referrer).origin : null;
      if (ref && isAllowedEmbedOrigin(ref)) { parentOrigin = ref; reply({ event: 'ready' }); }
    } catch { /* no referrer; the parent's hello establishes the origin */ }
  });
  onDestroy(() => {
    if (!browser) return;
    window.removeEventListener('message', onMessage);
    for (const t of pendingHellos.values()) clearTimeout(t);
    broadcastService.close();
  });
</script>

<svelte:head><title>SSE2 bridge</title></svelte:head>

{#if !embedded}
  <p class="note">
    Star System Explorer integration bridge. This page is meant to be embedded by a host application
    (for example a VTT); opened directly it does nothing.
    {#if lastAnnounce}Currently announcing: <strong>{lastAnnounce.starmapName}</strong>.{/if}
  </p>
{/if}

<style>
  .note { font: 13px/1.5 system-ui, sans-serif; color: #889; padding: 16px; }
</style>
