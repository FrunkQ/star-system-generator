// The player-view time-rate ladder (1 s of real time ≈ this much sim time), shared by the catalogue's
// time controls, the editor's default-time picker, and the GM's live time override. Index 2 (1 h) is
// the default: inner planets visibly move while rings/belts shear.
export const RATE_STEPS: { label: string; sec: number }[] = [
  { label: '1 s', sec: 1 }, { label: '1 min', sec: 60 }, { label: '1 h', sec: 3600 }, { label: '12 h', sec: 43200 },
  { label: '1 d', sec: 86400 }, { label: '2 d', sec: 172800 }, { label: '4 d', sec: 345600 }, { label: '1 wk', sec: 604800 },
  { label: '2 wk', sec: 1209600 }, { label: '1 mo', sec: 2592000 }, { label: '2 mo', sec: 5184000 }, { label: '6 mo', sec: 15552000 },
  { label: '1 yr', sec: 31557600 }, { label: '2 yr', sec: 63115200 }, { label: '5 yr', sec: 157788000 }, { label: '10 yr', sec: 315576000 }
];
export const DEFAULT_RATE_INDEX = 2; // 1 s ≈ 1 h
