import { describe, it, expect } from 'vitest';
import { formatBytes, formatRate, formatDuration, averageRate, topTypes, linkSummary, transferReportText } from './transferReport';
import type { TransferStats, PeerLink } from './broadcast';

/**
 * The transfer report (owner, 2026-08-21: "useful information for the GM or player to view to help
 * me debug and see if there is over transmission or slowness").
 *
 * The thing worth pinning is not the arithmetic — it is the HONESTY: a same-machine link has no
 * bytes, and the report must say so rather than print a zero that reads like a measurement.
 */
const stats = (over: Partial<TransferStats> = {}): TransferStats => ({
  sentMsgs: 0, sentBytes: 0, largestSentBytes: 0,
  recvMsgs: 0, recvBytes: 0, largestRecvBytes: 0,
  bytesMeaningful: false, peakBytesPerSec: 0,
  startedAt: Date.now() - 10_000, byType: {}, ...over
});

describe('formatting', () => {
  it('scales bytes and never prints a bare number', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(45_743)).toBe('44.7 KB');
    expect(formatBytes(5_242_880)).toBe('5.00 MB');
  });

  it('a rate of nothing is a dash, not "0 B/s" — there is no traffic to describe', () => {
    expect(formatRate(0)).toBe('—');
    expect(formatRate(2048)).toBe('2.0 KB/s');
  });

  it('durations read in the unit a human would use', () => {
    expect(formatDuration(9_000)).toBe('9s');
    expect(formatDuration(125_000)).toBe('2m 5s');
    expect(formatDuration(3_725_000)).toBe('1h 2m');
  });

  it('the average is over the whole watched period, so bursts read below their peak', () => {
    const s = stats({ startedAt: Date.now() - 10_000, sentBytes: 10_000, bytesMeaningful: true, peakBytesPerSec: 9_000 });
    expect(Math.round(averageRate(s))).toBe(1000);   // 10 KB over 10 s
    expect(s.peakBytesPerSec).toBeGreaterThan(averageRate(s));
  });
});

describe('the busiest types are what to look at when something sends too much', () => {
  it('orders by bytes, then by message count', () => {
    const s = stats({ bytesMeaningful: true, byType: {
      SYNC_HEARTBEAT: { sent: 100, sentBytes: 1_300, recv: 0, recvBytes: 0 },
      SYNC_STARMAP: { sent: 2, sentBytes: 900_000, recv: 0, recvBytes: 0 },
      SYNC_PRESET: { sent: 4, sentBytes: 4_000, recv: 0, recvBytes: 0 }
    } });
    expect(topTypes(s).map((t) => t.type)).toEqual(['SYNC_STARMAP', 'SYNC_PRESET', 'SYNC_HEARTBEAT']);
  });
});

describe('a same-machine link reports messages and NO bytes', () => {
  // The point of the whole feature is to separate over-transmission from slowness. A local link has
  // neither: nothing is serialised, so a byte figure would be invented. Saying so is the feature.
  it('says so in the per-link line', () => {
    const link: PeerLink = { id: 'w-abc', remote: false, lastSeen: Date.now(), stats: stats({ sentMsgs: 3, recvMsgs: 9 }) };
    expect(linkSummary(link)).toContain('same machine, no transfer');
    expect(linkSummary(link)).not.toMatch(/\d+ B\b|KB|MB/);
  });

  it('says so in the report body, as a fact rather than a blank', () => {
    const text = transferReportText({ role: 'player', own: stats({ recvMsgs: 4 }) });
    expect(text).toContain('not applicable — same machine, nothing is serialised');
    expect(text).not.toContain('peak —');
  });

  it('falls back to what the PLAYER reports, because for a local link that is the only source', () => {
    // The GM has no meter for a local window — there is no connection object to attribute to — so a
    // direct count of 0 is absence of measurement, not absence of traffic.
    const link: PeerLink = {
      id: 'w-abc', remote: false, lastSeen: Date.now(),
      stats: stats(),                                   // GM sees nothing
      reported: stats({ recvMsgs: 22, sentMsgs: 5 })    // the player counted 27
    };
    expect(linkSummary(link)).toContain('27 messages');
    expect(linkSummary(link)).toContain('as the player counts them');
  });
});

describe('a remote link reports real figures', () => {
  const link: PeerLink = {
    id: 'w-xyz', remote: true, lastSeen: Date.now(),
    stats: stats({ bytesMeaningful: true, sentBytes: 5_242_880, recvBytes: 2_048, peakBytesPerSec: 1_048_576,
      sentMsgs: 12, recvMsgs: 3, largestSentBytes: 4_000_000 })
  };

  it('shows both directions and the peak', () => {
    const line = linkSummary(link);
    expect(line).toContain('remote');
    expect(line).toContain('5.00 MB out');
    expect(line).toContain('2.0 KB in');
    expect(line).toContain('peak 1.00 MB/s');
  });

  it('the report names the largest single message, which is what a chunking fix would target', () => {
    const text = transferReportText({ role: 'GM', own: link.stats, links: [link] });
    expect(text).toContain('largest 3.81 MB');
  });
});

describe('the report says which side it was taken from', () => {
  it('a player report has no per-window breakdown, because a player sees one link', () => {
    const text = transferReportText({ role: 'player', own: stats({ recvMsgs: 1 }) });
    expect(text).toContain('player window');
    expect(text).not.toContain('PLAYER WINDOWS');
  });

  it('a GM report lists the windows, and says plainly when there are none', () => {
    const text = transferReportText({ role: 'GM', own: stats(), links: [] });
    expect(text).toContain('PLAYER WINDOWS');
    expect(text).toContain('(none connected)');
  });

  it('carries the app version, so a pasted report can be placed', () => {
    expect(transferReportText({ role: 'GM', own: stats(), appVersion: '3.0.0-rc.21' })).toContain('v3.0.0-rc.21');
  });
});
