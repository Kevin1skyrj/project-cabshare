import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { origin, destination } = await req.json();
    if (!origin || !destination) return NextResponse.json({ error: "origin and destination required" }, { status: 400 });

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return NextResponse.json({ error: "Missing GOOGLE_MAPS_API_KEY" }, { status: 500 });

    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", origin);
    url.searchParams.set("destination", destination);
    url.searchParams.set("key", key);
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("departure_time", "now");
  url.searchParams.set("mode", "driving");
  url.searchParams.set("units", "metric");
  url.searchParams.set("region", "in");

    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.status !== "OK") {
      return NextResponse.json({ error: data.error_message ?? data.status }, { status: 400 });
    }
    const best = data.routes[0];
    const leg = best.legs[0];
    const distanceMeters = leg.distance.value;
  const durationSeconds = (leg.duration_in_traffic?.value ?? leg.duration.value) as number;
    const polyline = best.overview_polyline.points;
    return NextResponse.json({ distanceMeters, durationSeconds, polyline });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "directions error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
