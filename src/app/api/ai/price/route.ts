import { NextRequest, NextResponse } from "next/server";

function roundTo(n: number, step = 5) {
  return Math.round(n / step) * step;
}

export async function POST(req: NextRequest) {
  try {
    const { distanceKm, durationMin, seats, demandIndex = 1 } = await req.json();
    if (distanceKm == null || durationMin == null || !seats) {
      return NextResponse.json({ error: "distanceKm, durationMin, seats required" }, { status: 400 });
    }

    const FUEL_PER_KM = 8; // tune locally
    const TIME_PER_MIN = 0.8;
    const BASE = 20;

    const raw = (BASE + distanceKm * FUEL_PER_KM + durationMin * TIME_PER_MIN) * demandIndex;
    const total = Math.max(50, roundTo(raw));
    const perSeat = roundTo(total / Math.max(1, Number(seats)));
    return NextResponse.json({ total, perSeat });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "price error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
