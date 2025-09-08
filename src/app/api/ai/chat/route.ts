import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL = "gemini-1.5-flash";
const system = `You are an assistant for a campus cabshare app (NIT Rourkela).
- Answer briefly and helpfully.
- Guide posting a ride, finding rides, contacting drivers, safety tips.
- For pricing, suggest estimating via distance and splitting fairly.
- Be concise.`;

export async function POST(req: NextRequest) {
  try {
    const { messages } = (await req.json()) as { messages: { role: string; content: string }[] };
    if (!Array.isArray(messages)) return NextResponse.json({ error: "messages array required" }, { status: 400 });

    const key = process.env.GEMINI_API_KEY;
    if (!key) return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: MODEL });
    const convo = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    const prompt = `${system}\n\nConversation so far:\n${convo}\n\nReply:`;
    const result = await model.generateContent([{ text: prompt }]);
    const reply = result.response.text();
    return NextResponse.json({ reply });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "chat error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
