// Deterministic seeded PRNG for reproducible seed data. No Math.random anywhere.
// mulberry32: a fast, well-distributed 32-bit generator.

export class Rng {
  private state: number;
  constructor(seed: number) {
    // Force to a 32-bit unsigned int.
    this.state = seed >>> 0;
  }
  /** Next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
  /** Weighted pick: entries are [value, weight]; weight > 0. */
  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let roll = this.next() * total;
    for (const [value, w] of entries) {
      roll -= w;
      if (roll < 0) return value;
    }
    return entries[entries.length - 1][0];
  }
  /** True with probability pTrue in [0,1]. */
  bool(pTrue: number): boolean {
    return this.next() < pTrue;
  }
}

export function makeRng(seed = 0x484d53): Rng {
  return new Rng(seed);
}

const FIRST_NAMES = [
  "Budi", "Siti", "Andi", "Dewi", "Eka", "Fajar", "Gita", "Hadi", "Indah",
  "Joko", "Kartika", "Lestari", "Made", "Nadia", "Putu", "Rina", "Sari",
  "Taufik", "Umar", "Vina", "Wawan", "Yuni", "Agus", "Bayu", "Citra", "Dian",
];
const LAST_NAMES = [
  "Santoso", "Wijaya", "Pratama", "Kusuma", "Hidayat", "Nugroho", "Saputra",
  "Halim", "Wibowo", "Permana", "Utami", "Setiawan", "Maulana", "Suryani",
  "Gunawan", "Iskandar", "Rahmawati", "Firmansyah", "Anggraini", "Lesmana",
];

export function genName(rng: Rng): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

export function genPhone(rng: Rng): string {
  // 08 + 8-10 more digits.
  const len = rng.int(8, 10);
  let s = "08";
  for (let i = 0; i < len; i++) s += String(rng.int(0, 9));
  return s;
}

export function genEmail(rng: Rng, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, ".");
  return `${slug}${rng.int(1, 999)}@example.com`;
}

export function genIdNumber(rng: Rng): string {
  // 16-digit NIK-like string.
  let s = "";
  for (let i = 0; i < 16; i++) s += String(rng.int(0, 9));
  return s;
}
