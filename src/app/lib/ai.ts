export function cosineSim(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (!len) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb) + 1e-8;
  return dot / denom;
}

export function rideToText(input: { pickup: string; drop: string; datetime?: string }) {
  const t = input.datetime ? ` at ${new Date(input.datetime).toLocaleString()}` : "";
  return `Ride from ${input.pickup} to ${input.drop}${t}.`;
}

export function normalizeRouteKey(pickup: string, drop: string) {
  return `${pickup.trim().toLowerCase()}__${drop.trim().toLowerCase()}`;
}
