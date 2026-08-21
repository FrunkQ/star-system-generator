// HOW MANY PLAYER WINDOWS ARE WATCHING — one store, because the rail is mounted twice (Starmap and
// SystemView) and two copies of a poll would eventually drift into two different answers.
//
// It is a `readable` with a start/stop function on purpose: Svelte runs the start only while
// something is subscribed and calls the returned stop when the last subscriber goes. So the poll
// exists exactly while a rail is on screen and costs nothing otherwise — no lifecycle for a caller
// to get wrong, and no timer left running behind a closed view.
import { readable } from 'svelte/store';
import { browser } from '$app/environment';
import { broadcastService } from '$lib/broadcast';
import { linkSummary } from '$lib/transferReport';

export interface PlayerConnections {
  local: number;
  remote: number;
  /** One line per link, for the rail's hover title. Empty when nobody is connected. */
  summary: string;
}

const EMPTY: PlayerConnections = { local: 0, remote: 0, summary: '' };

// Two seconds. A local window announces once per GM heartbeat (5 s), so polling faster than that
// tells you nothing new; polling much slower makes the badge feel broken when someone joins.
const POLL_MS = 2000;

export const playerConnections = readable<PlayerConnections>(EMPTY, (set) => {
  if (!browser) return;
  const tick = () => {
    try {
      const { local, remote } = broadcastService.connectionCounts();
      const links = broadcastService.peerLinks();
      set({
        local,
        remote,
        summary: links.length
          ? links.map((l) => `${l.id.slice(0, 8)} — ${linkSummary(l)}`).join('\n')
          : ''
      });
    } catch {
      set(EMPTY);   // transport not up yet, or torn down mid-poll: report nothing, never throw
    }
  };
  tick();
  const t = setInterval(tick, POLL_MS);
  return () => clearInterval(t);
});
