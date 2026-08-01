export const EQ_PRESETS: Record<string, { band: number; gain: number }[]> = {
  flat: Array.from({ length: 15 }, (_, i) => ({ band: i, gain: 0.0 })),
  bass: Array.from({ length: 15 }, (_, i) => ({ band: i, gain: i < 5 ? 0.4 - i * 0.1 : -0.05 - (i - 5) * 0.02 })),
  treble: Array.from({ length: 15 }, (_, i) => ({ band: i, gain: i < 5 ? -0.2 + i * 0.05 : -0.1 + (i - 5) * 0.05 })),
  rock: [
    { band: 0, gain: 0.2 }, { band: 1, gain: 0.1 }, { band: 2, gain: 0.0 },
    { band: 3, gain: -0.1 }, { band: 4, gain: -0.1 }, { band: 5, gain: 0.0 },
    { band: 6, gain: 0.1 }, { band: 7, gain: 0.2 }, { band: 8, gain: 0.3 },
    { band: 9, gain: 0.3 }, { band: 10, gain: 0.3 }, { band: 11, gain: 0.2 },
    { band: 12, gain: 0.1 }, { band: 13, gain: 0.0 }, { band: 14, gain: -0.1 },
  ],
  jazz: [
    { band: 0, gain: 0.2 }, { band: 1, gain: 0.15 }, { band: 2, gain: 0.1 },
    { band: 3, gain: 0.05 }, { band: 4, gain: 0.0 }, { band: 5, gain: -0.05 },
    { band: 6, gain: -0.1 }, { band: 7, gain: -0.05 }, { band: 8, gain: 0.0 },
    { band: 9, gain: 0.05 }, { band: 10, gain: 0.1 }, { band: 11, gain: 0.15 },
    { band: 12, gain: 0.2 }, { band: 13, gain: 0.25 }, { band: 14, gain: 0.3 },
  ],
  pop: [
    { band: 0, gain: -0.05 }, { band: 1, gain: 0.0 }, { band: 2, gain: 0.05 },
    { band: 3, gain: 0.1 }, { band: 4, gain: 0.15 }, { band: 5, gain: 0.2 },
    { band: 6, gain: 0.2 }, { band: 7, gain: 0.15 }, { band: 8, gain: 0.1 },
    { band: 9, gain: 0.05 }, { band: 10, gain: 0.0 }, { band: 11, gain: -0.05 },
    { band: 12, gain: -0.1 }, { band: 13, gain: -0.1 }, { band: 14, gain: -0.05 },
  ],
  edm: [
    { band: 0, gain: 0.3 }, { band: 1, gain: 0.25 }, { band: 2, gain: 0.15 },
    { band: 3, gain: 0.0 }, { band: 4, gain: -0.05 }, { band: 5, gain: 0.0 },
    { band: 6, gain: 0.1 }, { band: 7, gain: 0.2 }, { band: 8, gain: 0.25 },
    { band: 9, gain: 0.3 }, { band: 10, gain: 0.35 }, { band: 11, gain: 0.3 },
    { band: 12, gain: 0.2 }, { band: 13, gain: 0.1 }, { band: 14, gain: 0.0 },
  ],
  classical: [
    { band: 0, gain: 0.1 }, { band: 1, gain: 0.05 }, { band: 2, gain: 0.0 },
    { band: 3, gain: -0.05 }, { band: 4, gain: -0.1 }, { band: 5, gain: -0.05 },
    { band: 6, gain: 0.0 }, { band: 7, gain: 0.05 }, { band: 8, gain: 0.1 },
    { band: 9, gain: 0.15 }, { band: 10, gain: 0.2 }, { band: 11, gain: 0.25 },
    { band: 12, gain: 0.3 }, { band: 13, gain: 0.25 }, { band: 14, gain: 0.2 },
  ],
};

export const PRESET_LIST = [
  { name: "Flat", value: "flat" },
  { name: "Bass", value: "bass" },
  { name: "Treble", value: "treble" },
  { name: "Rock", value: "rock" },
  { name: "Jazz", value: "jazz" },
  { name: "Pop", value: "pop" },
  { name: "EDM", value: "edm" },
  { name: "Classical", value: "classical" },
];

export function resolveEQBands(value: any): { band: number; gain: number }[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && EQ_PRESETS[value]) return EQ_PRESETS[value];
  return null;
}