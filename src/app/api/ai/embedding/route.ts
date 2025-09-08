import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

    const key = process.env.GEMINI_API_KEY;
    if (!key) return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text);
  const embedding = result.embedding?.values ?? [];
    return NextResponse.json({ embedding });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "embed error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
