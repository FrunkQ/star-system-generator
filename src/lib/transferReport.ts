// ONE report, three surfaces. The GM's Settings panel, the Player Views tooltip and the player's own
// LIVE readout all print the same figures from the same function — because the first thing anyone
// does with two of them is compare them, and two formatters would eventually disagree about what a
// megabyte is.
//
// It is written to be COPIED. The GM asked for this to debug over-transmission and slowness, which
// means the useful destination is a message to someone else, so `transferReportText` produces plain
// text that survives a paste into anything.
import type { TransferStats, PeerLink } from '$lib/broadcast';

export function formatBytes(n: number): string {
  if (!(n > 0)) return '0 B';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatRate(bytesPerSec: number): string {
  return bytesPerSec > 0 ? `${formatBytes(bytesPerSec)}/s` : '—';
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Average over the whole watched period. Bursty traffic reads far below its peak, which is the point. */
export function averageRate(stats: TransferStats): number {
  const secs = Math.max(1, (Date.now() - stats.startedAt) / 1000);
  return (stats.sentBytes + stats.recvBytes) / secs;
}

/** The busiest message types first — what to look at when something is sending too much. */
export function topTypes(stats: TransferStats, n = 5) {
  return Object.entries(stats.byType)
    .map(([type, r]) => ({ type, msgs: r.sent + r.recv, bytes: r.sentBytes + r.recvBytes }))
    .sort((a, b) => b.bytes - a.bytes || b.msgs - a.msgs)
    .slice(0, n);
}

/**
 * One line per link, for a tooltip or a rail summary.
 *
 * For a LOCAL window the GM has no meter of its own — there is no connection object to attribute
 * anything to — so the only numbers that exist are the ones the player REPORTS about itself. Using
 * them is not a fallback, it is the only true source for that link, and saying "0 messages" because
 * we did not look would be worse than saying nothing.
 */
export function linkSummary(link: PeerLink): string {
  const where = link.remote ? 'remote' : 'local';
  const direct = link.stats.sentMsgs + link.stats.recvMsgs;
  const s = direct > 0 ? link.stats : (link.reported ?? link.stats);
  const viaPlayer = s === link.reported;
  if (!s.bytesMeaningful) {
    const msgs = viaPlayer ? s.recvMsgs + s.sentMsgs : direct;
    return `${where} · ${msgs} messages${viaPlayer ? ' (as the player counts them)' : ''} · same machine, no transfer`;
  }
  return `${where} · ${formatBytes(s.sentBytes)} out, ${formatBytes(s.recvBytes)} in`
    + ` · peak ${formatRate(s.peakBytesPerSec)}${viaPlayer ? ' (as the player counts it)' : ''}`;
}

function statsBlock(label: string, s: TransferStats): string[] {
  const lines = [`${label}`];
  lines.push(`  watched      ${formatDuration(Date.now() - s.startedAt)}`);
  lines.push(`  sent         ${s.sentMsgs} messages`
    + (s.bytesMeaningful ? `, ${formatBytes(s.sentBytes)} (largest ${formatBytes(s.largestSentBytes)})` : ''));
  lines.push(`  received     ${s.recvMsgs} messages`
    + (s.bytesMeaningful ? `, ${formatBytes(s.recvBytes)} (largest ${formatBytes(s.largestRecvBytes)})` : ''));
  if (s.bytesMeaningful) {
    lines.push(`  speed        peak ${formatRate(s.peakBytesPerSec)}, average ${formatRate(averageRate(s))}`);
  } else {
    // Not a gap — a fact. A same-machine channel hands over a structured clone; nothing is
    // serialised, so there is no wire and no bytes to report.
    lines.push(`  transfer     not applicable — same machine, nothing is serialised`);
  }
  const top = topTypes(s);
  if (top.length) {
    lines.push('  busiest      ' + top.map((t) => s.bytesMeaningful
      ? `${t.type} ${formatBytes(t.bytes)}`
      : `${t.type} x${t.msgs}`).join(', '));
  }
  return lines;
}

/**
 * The whole picture as pasteable text. `links` is empty on a player window, which sees only its own
 * side of one link — and that asymmetry is real, so the report says which side it was taken from.
 */
export function transferReportText(opts: {
  role: 'GM' | 'player';
  own: TransferStats;
  links?: PeerLink[];
  appVersion?: string;
}): string {
  const lines: string[] = [];
  lines.push(`SSE transfer report — ${opts.role} window${opts.appVersion ? ` — v${opts.appVersion}` : ''}`);
  lines.push(new Date().toISOString());
  lines.push('');
  lines.push(...statsBlock('THIS WINDOW', opts.own));

  const links = opts.links ?? [];
  if (opts.role === 'GM') {
    lines.push('');
    const local = links.filter((l) => !l.remote).length;
    const remote = links.filter((l) => l.remote).length;
    lines.push(`PLAYER WINDOWS  ${local} local, ${remote} remote`);
    if (!links.length) lines.push('  (none connected)');
    for (const l of links) {
      lines.push('');
      lines.push(...statsBlock(`  ${l.remote ? 'REMOTE' : 'LOCAL '} ${l.id}`, l.stats).map((x, i) => i === 0 ? x : '  ' + x));
      if (l.reported) {
        // The player's own count of the same link. A large disagreement is the interesting case:
        // it means messages are being sent that never arrive, or arriving that were never counted.
        lines.push(`    as the player counts it: ${l.reported.recvMsgs} received`
          + (l.reported.bytesMeaningful ? `, ${formatBytes(l.reported.recvBytes)}` : ''));
      }
    }
  }
  lines.push('');
  lines.push('Bytes are measured where they are free: sends are already serialised, and a large');
  lines.push('inbound payload arrives in chunks that carry their own size. A same-machine link is');
  lines.push('not serialised at all, so it reports messages and no bytes.');
  return lines.join('\n');
}
