"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "../constants/firebase";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";

// Combined Chatbot: two tabs
// - Helper: teammate's ride menu/find/post flow (no external AI)
// - Ask AI: Gemini-powered Q&A via /api/ai/chat

type Phase = "awaiting_start" | "menu" | "find" | "post";
type Tab = "helper" | "ai";

type Ride = {
  id?: string;
  name: string;
  phone: number;
  pickup: string;
  drop: string;
  datetime: string; // ISO string
  notes?: string;
  seats: number;
};

type ChatMessage = { from: "bot" | "user"; text: string };
type Role = "user" | "assistant";
type Msg = { role: Role; content: string };

const Chatbot: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("helper");

  // Helper tab state (teammate's flow)
  const [phase, setPhase] = useState<Phase>("awaiting_start");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [fPickup, setFPickup] = useState("");
  const [fDrop, setFDrop] = useState("");
  const [fDate, setFDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [results, setResults] = useState<Ride[]>([]);

  const [pName, setPName] = useState("");
  const [pPhone, setPPhone] = useState("");
  const [pPickup, setPPickup] = useState("");
  const [pDrop, setPDrop] = useState("");
  const [pDate, setPDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [pTime, setPTime] = useState<string>("12:00");
  const [pSeats, setPSeats] = useState<string>("1");
  const [pNotes, setPNotes] = useState<string>("");
  const [staged, setStaged] = useState<Ride[]>([]);

  const [allRides, setAllRides] = useState<Ride[]>([]);
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "rides"));
        const items: Ride[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as Ride[];
        setAllRides(items);
      } catch {
        // ignore
      }
    })();
  }, [open]);

  const locations = useMemo(() => {
    const setVals = new Set<string>();
    allRides.forEach((r) => {
      if (r.pickup) setVals.add(r.pickup);
      if (r.drop) setVals.add(r.drop);
    });
    return Array.from(setVals).sort();
  }, [allRides]);

  const resetState = () => {
    setLoading(false);
    setMessage(null);
    setError(null);
  };

  const headerTitle = useMemo(() => {
    if (tab === "ai") return "Ask CabShare";
    if (phase === "find") return "Find a ride";
    if (phase === "post") return "Post a ride";
    if (phase === "menu") return "What can I help with?";
    return "CabShare Assistant";
  }, [tab, phase]);

  useEffect(() => {
    if (open) {
      setPhase("awaiting_start");
      setMessages([{ from: "bot", text: "Type 'start' to begin the assistant." }]);
      setResults([]);
      setStaged([]);
      setFPickup("");
      setFDrop("");
    }
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendUser = (text: string) => setMessages((m) => [...m, { from: "user", text }]);
  const sendBot = (text: string) => setMessages((m) => [...m, { from: "bot", text }]);

  const searchRides = async () => {
    resetState();
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "rides"));
      const items: Ride[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as Ride[];
      const qPickup = fPickup.trim().toLowerCase();
      const qDrop = fDrop.trim().toLowerCase();
      const qDate = fDate;

      const filtered = items.filter((r) => {
        const matchesPickup = qPickup ? r.pickup?.toLowerCase().includes(qPickup) : true;
        const matchesDrop = qDrop ? r.drop?.toLowerCase().includes(qDrop) : true;
        const dateStr = new Date(r.datetime).toISOString().split("T")[0];
        const matchesDate = qDate ? dateStr === qDate : true;
        return matchesPickup && matchesDrop && matchesDate;
      });
      setResults(filtered);
      if (filtered.length === 0) setMessage("No rides found. Try adjusting filters.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Failed to search rides");
    } finally {
      setLoading(false);
    }
  };

  const addToStaged = () => {
    resetState();
    if (!pName || !pPhone || !pPickup || !pDrop || !pDate || !pTime) {
      setError("Fill all required fields first.");
      return;
    }
    const datetime = `${pDate}T${pTime}`;
    const ride: Ride = {
      name: pName.trim(),
      phone: Number(pPhone),
      pickup: pPickup.trim(),
      drop: pDrop.trim(),
      datetime,
      notes: pNotes.trim(),
      seats: Number(pSeats) || 1,
    };
    setStaged((prev) => [...prev, ride]);
    setPPickup("");
    setPDrop("");
    setPTime("12:00");
    setPSeats("1");
    setPNotes("");
    setMessage("Ride added. You can add another or finish.");
  };

  const postAllRides = async () => {
    resetState();
    setLoading(true);
    try {
      const list = staged.length
        ? staged
        : [
            {
              name: pName.trim(),
              phone: Number(pPhone),
              pickup: pPickup.trim(),
              drop: pDrop.trim(),
              datetime: `${pDate}T${pTime}`,
              notes: pNotes.trim(),
              seats: Number(pSeats) || 1,
            } as Ride,
          ];
      if (list.some((r) => !r.name || !r.phone || !r.pickup || !r.drop || !r.datetime)) {
        setError("Missing fields in one or more rides.");
        setLoading(false);
        return;
      }
      await Promise.all(
        list.map((payload) => addDoc(collection(db, "rides"), { ...payload, createdAt: serverTimestamp() }))
      );
      setMessage(`Posted ${list.length} ride${list.length > 1 ? "s" : ""} successfully!`);
      setStaged([]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Failed to post ride");
    } finally {
      setLoading(false);
    }
  };

  const handleSend = (text: string) => {
    const t = text.trim().toLowerCase();
    if (!t) return;
    sendUser(text);
    if (phase === "awaiting_start") {
      if (t === "start") {
        setPhase("menu");
        sendBot("Great! I can help you find rides or post multiple rides.");
      } else {
        sendBot("Please type 'start' to begin.");
      }
      return;
    }
    if (phase === "menu") {
      if (t.includes("find")) {
        setPhase("find");
        sendBot("Select pickup, drop, and date to search.");
      } else if (t.includes("post")) {
        setPhase("post");
        sendBot("Fill the form and click 'Add to list' to add multiple rides. When ready, click 'Finish & Post'.");
      } else {
        sendBot("Type 'find' to search rides or 'post' to add rides.");
      }
      return;
    }
    if (t === "menu") {
      setPhase("menu");
      sendBot("Back to menu. Type 'find' or 'post'.");
      return;
    }
  };

  // AI tab state
  const [aiMsgs, setAiMsgs] = useState<Msg[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const aiScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    aiScrollRef.current?.scrollTo({ top: aiScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [aiMsgs]);

  async function sendAI() {
    const content = aiInput.trim();
    if (!content || aiLoading) return;
    const next: Msg[] = [...aiMsgs, { role: "user", content }];
    setAiMsgs(next);
    setAiInput("");
    setAiLoading(true);
    try {
      const res: { reply?: string } = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      }).then((r) => r.json());
      if (res.reply) setAiMsgs([...next, { role: "assistant", content: res.reply }]);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Toggle button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-amber-600 hover:bg-amber-700 text-white shadow-lg w-14 h-14 flex items-center justify-center"
          aria-label="Open CabShare Assistant"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h6m-8 8l4-4h6l4 4V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12z" />
          </svg>
        </button>
      )}

      {open && (
        <div className="w-[420px] max-w-[92vw] bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 bg-amber-50 border-b">
            <div>
              <div className="text-sm text-amber-700">{headerTitle}</div>
              <div className="text-xs text-gray-500">{tab === "helper" ? "Type 'start' to begin • type 'menu' anytime" : "Ask anything about CabShare"}</div>
            </div>
            <div className="flex items-center gap-2">
              {/* Tabs */}
              <div className="flex bg-white border rounded-lg overflow-hidden">
                <button className={`px-3 py-1 text-xs ${tab === "helper" ? "bg-amber-100 text-amber-700" : "text-gray-600"}`} onClick={() => setTab("helper")}>
                  Helper
                </button>
                <button className={`px-3 py-1 text-xs ${tab === "ai" ? "bg-amber-100 text-amber-700" : "text-gray-600"}`} onClick={() => setTab("ai")}>
                  Ask AI
                </button>
              </div>
              <button onClick={() => { setOpen(false); }} className="text-gray-500 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4">
            {tab === "helper" && (
              <>
                {/* Messages area */}
                <div ref={scrollRef} className="max-h-40 overflow-auto space-y-2 pr-1">
                  {messages.map((m, i) => (
                    <div key={i} className={`${m.from === "bot" ? "bg-amber-50 text-amber-900" : "bg-gray-100 text-gray-900"} px-3 py-2 rounded-lg w-fit max-w-full`}>{m.text}</div>
                  ))}
                </div>

                {/* Contextual panels */}
                {phase === "menu" && (
                  <div className="space-y-3">
                    <button onClick={() => { setPhase("find"); sendBot("Select pickup, drop, and date to search."); }} className="w-full border rounded-lg p-3 text-left hover:bg-amber-50">
                      <div className="text-sm font-medium">Find a ride</div>
                      <div className="text-xs text-gray-500">Search by date and locations</div>
                    </button>
                    <button onClick={() => { setPhase("post"); sendBot("Fill and add multiple rides, then post all."); }} className="w-full border rounded-lg p-3 text-left hover:bg-amber-50">
                      <div className="text-sm font-medium">Post a ride</div>
                      <div className="text-xs text-gray-500">Add one or multiple rides</div>
                    </button>
                  </div>
                )}

                {phase === "find" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3">
                      <select value={fPickup} onChange={(e) => setFPickup(e.target.value)} className="border rounded-lg px-3 py-2">
                        <option value="">Select pickup</option>
                        {locations.map((loc) => (
                          <option key={`p-${loc}`} value={loc}>{loc}</option>
                        ))}
                      </select>
                      <select value={fDrop} onChange={(e) => setFDrop(e.target.value)} className="border rounded-lg px-3 py-2">
                        <option value="">Select drop</option>
                        {locations.map((loc) => (
                          <option key={`d-${loc}`} value={loc}>{loc}</option>
                        ))}
                      </select>
                      <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className="border rounded-lg px-3 py-2" />
                    </div>
                    <button disabled={loading} onClick={searchRides} className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-lg px-4 py-2">
                      {loading ? "Searching..." : "Search"}
                    </button>
                    {message && <div className="text-xs text-gray-600">{message}</div>}
                    {error && <div className="text-xs text-red-600">{error}</div>}
                    {results.length > 0 && (
                      <div className="max-h-64 overflow-auto divide-y rounded-lg border">
                        {results.map((r) => (
                          <div key={r.id} className="p-3 text-sm">
                            <div className="font-medium">{r.pickup} → {r.drop}</div>
                            <div className="text-xs text-gray-600">{new Date(r.datetime).toLocaleString()}</div>
                            <div className="text-xs text-gray-600">Seats: {r.seats} • Contact: {r.phone}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {phase === "post" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3">
                      <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Your name" className="border rounded-lg px-3 py-2" />
                      <input value={pPhone} onChange={(e) => setPPhone(e.target.value)} placeholder="Phone number" inputMode="tel" className="border rounded-lg px-3 py-2" />
                      <select value={pPickup} onChange={(e) => setPPickup(e.target.value)} className="border rounded-lg px-3 py-2">
                        <option value="">Select pickup</option>
                        {locations.map((loc) => (
                          <option key={`pp-${loc}`} value={loc}>{loc}</option>
                        ))}
                      </select>
                      <select value={pDrop} onChange={(e) => setPDrop(e.target.value)} className="border rounded-lg px-3 py-2">
                        <option value="">Select drop</option>
                        {locations.map((loc) => (
                          <option key={`pd-${loc}`} value={loc}>{loc}</option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-3">
                        <input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} className="border rounded-lg px-3 py-2" />
                        <input type="time" value={pTime} onChange={(e) => setPTime(e.target.value)} className="border rounded-lg px-3 py-2" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <input type="number" min={1} value={pSeats} onChange={(e) => setPSeats(e.target.value)} placeholder="Seats" className="border rounded-lg px-3 py-2" />
                        <input value={pNotes} onChange={(e) => setPNotes(e.target.value)} placeholder="Notes (optional)" className="border rounded-lg px-3 py-2" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button disabled={loading} onClick={addToStaged} className="flex-1 border border-amber-600 text-amber-700 hover:bg-amber-50 rounded-lg px-4 py-2 disabled:opacity-60">Add to list</button>
                      <button disabled={loading} onClick={postAllRides} className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-lg px-4 py-2">
                        {loading ? "Posting..." : `Finish & Post${staged.length ? ` (${staged.length})` : ""}`}
                      </button>
                    </div>
                    {message && <div className="text-xs text-green-700">{message}</div>}
                    {error && <div className="text-xs text-red-600">{error}</div>}
                    {staged.length > 0 && (
                      <div className="max-h-40 overflow-auto border rounded-lg divide-y">
                        {staged.map((r, idx) => (
                          <div key={idx} className="p-2 text-xs">
                            <div className="font-medium">{r.pickup} → {r.drop}</div>
                            <div className="text-gray-600">{new Date(r.datetime).toLocaleString()} • Seats: {r.seats}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Chat input (helper) */}
                <div className="flex gap-2">
                  <input
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const v = (e.target as HTMLInputElement).value;
                        (e.target as HTMLInputElement).value = "";
                        handleSend(v);
                      }
                    }}
                    placeholder={phase === "awaiting_start" ? "Type start" : phase === "menu" ? "Type find/post or use buttons" : "Type 'menu' to go back"}
                    className="flex-1 border rounded-lg px-3 py-2"
                  />
                  <button
                    onClick={() => {
                      const inputEl = (scrollRef.current?.parentElement?.querySelector("input") as HTMLInputElement) || null;
                      if (inputEl) { const v = inputEl.value; inputEl.value = ""; handleSend(v); }
                    }}
                    className="bg-amber-600 text-white rounded-lg px-3"
                  >
                    Send
                  </button>
                </div>
              </>
            )}

            {tab === "ai" && (
              <>
                <div ref={aiScrollRef} className="max-h-64 overflow-auto space-y-2">
                  {aiMsgs.map((m, i) => (
                    <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                      <div className={`inline-block px-3 py-2 rounded-lg ${m.role === "user" ? "bg-amber-600 text-white" : "bg-gray-100"}`}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {aiLoading && <div className="text-gray-400 text-xs">Typing…</div>}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    className="flex-1 border rounded-lg px-2 py-1"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendAI()}
                    placeholder="e.g. Find a ride to station Sunday"
                  />
                  <button onClick={sendAI} className="bg-amber-600 hover:bg-amber-700 text-white px-3 rounded-lg">
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Chatbot;

"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "../constants/firebase";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";

type Phase = "awaiting_start" | "menu" | "find" | "post";

type Ride = {
  id?: string;
  name: string;
  phone: number;
  pickup: string;
  drop: string;
  datetime: string; // ISO string: YYYY-MM-DDTHH:mm
  notes?: string;
  seats: number;
};

type ChatMessage = { from: "bot" | "user"; text: string };

const Chatbot: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("awaiting_start");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Find form
  const [fPickup, setFPickup] = useState("");
  const [fDrop, setFDrop] = useState("");
  const [fDate, setFDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [results, setResults] = useState<Ride[]>([]);

  // Post form (staged multi)
  const [pName, setPName] = useState("");
  const [pPhone, setPPhone] = useState("");
  const [pPickup, setPPickup] = useState("");
  const [pDrop, setPDrop] = useState("");
  const [pDate, setPDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [pTime, setPTime] = useState<string>("12:00");
  const [pSeats, setPSeats] = useState<string>("1");
  const [pNotes, setPNotes] = useState<string>("");
  const [staged, setStaged] = useState<Ride[]>([]);

  // Cache of rides for suggestions
  const [allRides, setAllRides] = useState<Ride[]>([]);
  useEffect(() => {
    // Fetch once when chatbot opens
    if (!open) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "rides"));
        const items: Ride[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as Ride[];
        setAllRides(items);
      } catch {
        // ignore suggestions error
      }
    })();
  }, [open]);

  const locations = useMemo(() => {
    const set = new Set<string>();
    allRides.forEach((r) => {
      if (r.pickup) set.add(r.pickup);
      if (r.drop) set.add(r.drop);
    });
    return Array.from(set).sort();
  }, [allRides]);

  const resetState = () => {
    setLoading(false);
    setMessage(null);
    setError(null);
  };

  const headerTitle = useMemo(() => {
    if (phase === "find") return "Find a ride";
    if (phase === "post") return "Post a ride";
    if (phase === "menu") return "What can I help with?";
    return "CabShare Assistant";
  }, [phase]);

  // Initialize chat when opened
  useEffect(() => {
    if (open) {
      setPhase("awaiting_start");
      setMessages([{ from: "bot", text: "Type 'start' to begin the assistant." }]);
      setResults([]);
      setStaged([]);
      setFPickup(""); setFDrop("");
    }
  }, [open]);

  useEffect(() => {
    // Auto scroll messages
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendUser = (text: string) => setMessages((m) => [...m, { from: "user", text }]);
  const sendBot = (text: string) => setMessages((m) => [...m, { from: "bot", text }]);

  const searchRides = async () => {
    resetState();
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "rides"));
      const items: Ride[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as Ride[];
      const qPickup = fPickup.trim().toLowerCase();
      const qDrop = fDrop.trim().toLowerCase();
      const qDate = fDate;

      const filtered = items.filter((r) => {
        const matchesPickup = qPickup ? r.pickup?.toLowerCase().includes(qPickup) : true;
        const matchesDrop = qDrop ? r.drop?.toLowerCase().includes(qDrop) : true;
        const dateStr = new Date(r.datetime).toISOString().split("T")[0];
        const matchesDate = qDate ? dateStr === qDate : true;
        return matchesPickup && matchesDrop && matchesDate;
      });
      setResults(filtered);
      if (filtered.length === 0) setMessage("No rides found. Try adjusting filters.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Failed to search rides");
    } finally {
      setLoading(false);
    }
  };

  const addToStaged = () => {
    resetState();
    if (!pName || !pPhone || !pPickup || !pDrop || !pDate || !pTime) {
      setError("Fill all required fields first.");
      return;
    }
    const datetime = `${pDate}T${pTime}`;
    const ride: Ride = {
      name: pName.trim(),
      phone: Number(pPhone),
      pickup: pPickup.trim(),
      drop: pDrop.trim(),
      datetime,
      notes: pNotes.trim(),
      seats: Number(pSeats) || 1,
    };
    setStaged((prev) => [...prev, ride]);
    // Clear a few fields for quick next entry
    setPPickup("");
    setPDrop("");
    setPTime("12:00");
    setPSeats("1");
    setPNotes("");
    setMessage("Ride added. You can add another or finish.");
  };

  const postAllRides = async () => {
    resetState();
    setLoading(true);
    try {
      const list = staged.length
        ? staged
        : [
            {
              name: pName.trim(),
              phone: Number(pPhone),
              pickup: pPickup.trim(),
              drop: pDrop.trim(),
              datetime: `${pDate}T${pTime}`,
              notes: pNotes.trim(),
              seats: Number(pSeats) || 1,
            } as Ride,
          ];
      if (list.some((r) => !r.name || !r.phone || !r.pickup || !r.drop || !r.datetime)) {
        setError("Missing fields in one or more rides.");
        setLoading(false);
        return;
      }
      await Promise.all(
        list.map((payload) => addDoc(collection(db, "rides"), { ...payload, createdAt: serverTimestamp() }))
      );
      setMessage(`Posted ${list.length} ride${list.length > 1 ? "s" : ""} successfully!`);
      setStaged([]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Failed to post ride");
    } finally {
      setLoading(false);
    }
  };

  const handleSend = (text: string) => {
    const t = text.trim().toLowerCase();
    if (!t) return;
    sendUser(text);
    if (phase === "awaiting_start") {
      if (t === "start") {
        setPhase("menu");
        sendBot("Great! I can help you find rides or post multiple rides.");
      } else {
        sendBot("Please type 'start' to begin.");
      }
      return;
    }
    if (phase === "menu") {
      if (t.includes("find")) {
        setPhase("find");
        sendBot("Select pickup, drop, and date to search.");
      } else if (t.includes("post")) {
        setPhase("post");
        sendBot("Fill the form and click 'Add to list' to add multiple rides. When ready, click 'Finish & Post'.");
      } else {
        sendBot("Type 'find' to search rides or 'post' to add rides.");
      }
      return;
    }
    if (t === "menu") {
      setPhase("menu");
      sendBot("Back to menu. Type 'find' or 'post'.");
      return;
    }
    // Other phases rely on the on-screen forms
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Toggle button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-amber-600 hover:bg-amber-700 text-white shadow-lg w-14 h-14 flex items-center justify-center"
          aria-label="Open CabShare Assistant"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h6m-8 8l4-4h6l4 4V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12z" />
          </svg>
        </button>
      )}

      {open && (
        <div className="w-[380px] max-w-[92vw] bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 bg-amber-50 border-b">
            <div>
              <div className="text-sm text-amber-700">{headerTitle}</div>
              <div className="text-xs text-gray-500">Type &#39;start&#39; to begin • type &#39;menu&#39; anytime</div>
            </div>
            <div className="flex items-center gap-2">
              <button className="text-xs text-amber-700 hover:underline" onClick={() => setPhase("menu")}>Menu</button>
              <button onClick={() => { setOpen(false); }} className="text-gray-500 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4">
            {/* Messages area */}
            <div ref={scrollRef} className="max-h-48 overflow-auto space-y-2 pr-1">
              {messages.map((m, i) => (
                <div key={i} className={`${m.from === "bot" ? "bg-amber-50 text-amber-900" : "bg-gray-100 text-gray-900"} px-3 py-2 rounded-lg w-fit max-w-full`}>{m.text}</div>
              ))}
            </div>

            {/* Contextual panels */}
            {phase === "menu" && (
              <div className="space-y-3">
                <button onClick={() => { setPhase("find"); sendBot("Select pickup, drop, and date to search."); }} className="w-full border rounded-lg p-3 text-left hover:bg-amber-50">
                  <div className="text-sm font-medium">Find a ride</div>
                  <div className="text-xs text-gray-500">Search by date and locations</div>
                </button>
                <button onClick={() => { setPhase("post"); sendBot("Fill and add multiple rides, then post all."); }} className="w-full border rounded-lg p-3 text-left hover:bg-amber-50">
                  <div className="text-sm font-medium">Post a ride</div>
                  <div className="text-xs text-gray-500">Add one or multiple rides</div>
                </button>
              </div>
            )}

            {phase === "find" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3">
                  <select value={fPickup} onChange={(e) => setFPickup(e.target.value)} className="border rounded-lg px-3 py-2">
                    <option value="">Select pickup</option>
                    {locations.map((loc) => (
                      <option key={`p-${loc}`} value={loc}>{loc}</option>
                    ))}
                  </select>
                  <select value={fDrop} onChange={(e) => setFDrop(e.target.value)} className="border rounded-lg px-3 py-2">
                    <option value="">Select drop</option>
                    {locations.map((loc) => (
                      <option key={`d-${loc}`} value={loc}>{loc}</option>
                    ))}
                  </select>
                  <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className="border rounded-lg px-3 py-2" />
                </div>
                <button disabled={loading} onClick={searchRides} className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-lg px-4 py-2">
                  {loading ? "Searching..." : "Search"}
                </button>
                {message && <div className="text-xs text-gray-600">{message}</div>}
                {error && <div className="text-xs text-red-600">{error}</div>}
                {results.length > 0 && (
                  <div className="max-h-64 overflow-auto divide-y rounded-lg border">
                    {results.map((r) => (
                      <div key={r.id} className="p-3 text-sm">
                        <div className="font-medium">{r.pickup} → {r.drop}</div>
                        <div className="text-xs text-gray-600">{new Date(r.datetime).toLocaleString()}</div>
                        <div className="text-xs text-gray-600">Seats: {r.seats} • Contact: {r.phone}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {phase === "post" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3">
                  <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Your name" className="border rounded-lg px-3 py-2" />
                  <input value={pPhone} onChange={(e) => setPPhone(e.target.value)} placeholder="Phone number" inputMode="tel" className="border rounded-lg px-3 py-2" />
                  <select value={pPickup} onChange={(e) => setPPickup(e.target.value)} className="border rounded-lg px-3 py-2">
                    <option value="">Select pickup</option>
                    {locations.map((loc) => (
                      <option key={`pp-${loc}`} value={loc}>{loc}</option>
                    ))}
                  </select>
                  <select value={pDrop} onChange={(e) => setPDrop(e.target.value)} className="border rounded-lg px-3 py-2">
                    <option value="">Select drop</option>
                    {locations.map((loc) => (
                      <option key={`pd-${loc}`} value={loc}>{loc}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} className="border rounded-lg px-3 py-2" />
                    <input type="time" value={pTime} onChange={(e) => setPTime(e.target.value)} className="border rounded-lg px-3 py-2" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" min={1} value={pSeats} onChange={(e) => setPSeats(e.target.value)} placeholder="Seats" className="border rounded-lg px-3 py-2" />
                    <input value={pNotes} onChange={(e) => setPNotes(e.target.value)} placeholder="Notes (optional)" className="border rounded-lg px-3 py-2" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button disabled={loading} onClick={addToStaged} className="flex-1 border border-amber-600 text-amber-700 hover:bg-amber-50 rounded-lg px-4 py-2 disabled:opacity-60">Add to list</button>
                  <button disabled={loading} onClick={postAllRides} className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-lg px-4 py-2">
                    {loading ? "Posting..." : `Finish & Post${staged.length ? ` (${staged.length})` : ""}`}
                  </button>
                </div>
                {message && <div className="text-xs text-green-700">{message}</div>}
                {error && <div className="text-xs text-red-600">{error}</div>}
                {staged.length > 0 && (
                  <div className="max-h-40 overflow-auto border rounded-lg divide-y">
                    {staged.map((r, idx) => (
                      <div key={idx} className="p-2 text-xs">
                        <div className="font-medium">{r.pickup} → {r.drop}</div>
                        <div className="text-gray-600">{new Date(r.datetime).toLocaleString()} • Seats: {r.seats}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Chat input */}
            <div className="flex gap-2">
              <input
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = (e.target as HTMLInputElement).value;
                    (e.target as HTMLInputElement).value = "";
                    handleSend(v);
                  }
                }}
                placeholder={phase === "awaiting_start" ? "Type start" : phase === "menu" ? "Type find/post or use buttons" : "Type 'menu' to go back"}
                className="flex-1 border rounded-lg px-3 py-2"
              />
              <button
                onClick={() => {
                  const input = (scrollRef.current?.parentElement?.querySelector("input") as HTMLInputElement) || null;
                  if (input) { const v = input.value; input.value = ""; handleSend(v); }
                }}
                className="bg-amber-600 text-white rounded-lg px-3"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chatbot;
