"use client";
import React, { useEffect, useState } from "react";
import { db } from "../constants/firebase";
import { doc, setDoc } from "firebase/firestore";
import { normalizeRouteKey, rideToText } from "../lib/ai";

const PostRide = () => {
  const [formData, setFormData] = useState({
    name: "",
    pickup: "",
    drop: "",
    datetime: "",
    seats: "",
    phone: "",
    email: "",
    notes: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  // Hostel codes to treat as campus origin (case-insensitive, supports variants like "sd hall")
  const HOSTEL_CODES = ["HB", "MSS", "DBA", "GDB", "VS", "SD", "CVR", "KMS"] as const;
  // Google Maps place_id for NIT Rourkela (Main Gate)
  const CAMPUS_PLACE_ID = "place_id:ChIJw2HVu3IfIDoRWntq53BcqwA";

  const normalize = (s: string) => s
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ") // remove punctuation
    .replace(/\s+/g, " ")
    .trim();

  const looksLikeHostel = (input: string) => {
    const norm = normalize(input);
    if (!norm) return false;
    const tight = norm.replace(/\s+/g, ""); // e.g., "S D" -> "SD"
    // Generic suffixes often used
    const suffixes = [" HALL", " HOSTEL", " BLOCK", " BHAVAN", " HSE", " HOUSE"]; // broad

    for (const code of HOSTEL_CODES) {
      if (norm === code) return true;
      if (norm.startsWith(code + " ") || norm.endsWith(" " + code) || norm.includes(" " + code + " ")) return true;
      if (tight.includes(code)) return true; // catches "S D" -> "SD"
      for (const suf of suffixes) {
        if (norm.includes(code + suf)) return true;
      }
    }
    return false;
  };

  const resolveOrigin = (pickup: string) => {
    return looksLikeHostel(pickup) ? CAMPUS_PLACE_ID : pickup;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      // Prepare AI embedding for better matching
      const text = rideToText({ pickup: formData.pickup, drop: formData.drop, datetime: formData.datetime });
      const embedRes = await fetch("/api/ai/embedding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).then((r) => r.json());

      const embedding: number[] = Array.isArray(embedRes.embedding) ? embedRes.embedding : [];

      // Compute distance/time for saving (if user didn’t pause long enough to auto-calc)
      let distanceKm: number | null = null;
      let durationMin: number | null = null;

  if (formData.pickup && formData.drop) {
        const origin = resolveOrigin(formData.pickup);
        const dir = await fetch("/api/maps/directions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin, destination: formData.drop }),
        }).then((r) => r.json());
        if (!dir.error) {
          distanceKm = dir.distanceMeters / 1000;
          durationMin = Math.round(dir.durationSeconds / 60);
        }
      }

      const docID = `${formData.name}-${Date.now()}`;
      const routeKey = normalizeRouteKey(formData.pickup, formData.drop);
      await setDoc(doc(db, "rides", docID), {
        ...formData,
        seats: Number(formData.seats),
        createdAt: Date.now(),
        routeKey,
        ai: {
          embedding,
          distanceKm,
          durationMin,
        },
      });
      alert("Ride posted successfully!");
      setFormData({
        name: "",
        pickup: "",
        drop: "",
        datetime: "",
        seats: "",
        phone: "",
        email: "",
        notes: "",
      });
    } catch (error) {
      console.error("Error posting ride:", error);
      alert(`Failed: ${(error as Error).message}`);
    }
  };

  const [suggested, setSuggested] = useState<{ distanceKm?: number; durationMin?: number }>({});

  async function computeRouteSuggestion() {
    if (!formData.pickup || !formData.drop) return;
    const origin = resolveOrigin(formData.pickup);
    const dirRes = await fetch("/api/maps/directions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin, destination: formData.drop }),
    }).then((r) => r.json());
    if (dirRes.error) return;
    const distanceKm = dirRes.distanceMeters / 1000;
    const durationMin = Math.round(dirRes.durationSeconds / 60);
    setSuggested({ distanceKm, durationMin });
  }

  useEffect(() => {
    computeRouteSuggestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.pickup, formData.drop]);

  return (
    <div className="flex justify-center mt-20 px-4">
      <div className="bg-white border border-yellow-100 p-10 rounded-3xl w-full max-w-3xl shadow-xl">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Post a Ride</h2>
        <p className="text-gray-500 text-sm mb-6">
          Share your trip so others can join and split costs.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              name="name"
              placeholder="Your full name"
              value={formData.name}
              onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring focus:ring-orange-200"
              required
            />
          </div>

          {/* Pickup location */}
          <div>
            <label className="block text-sm font-medium mb-1">Pickup location</label>
            <input
              type="text"
              name="pickup"
              placeholder="e.g, NIT Rourkela, Main Gate"
              value={formData.pickup}
              onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring focus:ring-orange-200"
              required
            />
          </div>

          {/* Drop location */}
          <div>
            <label className="block text-sm font-medium mb-1">Drop location</label>
            <input
              type="text"
              name="drop"
              placeholder="e.g, Bhubaneswar Airport"
              value={formData.drop}
              onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring focus:ring-orange-200"
              required
            />
          </div>

          {/* Date & Time and Seats */}
          <div className="flex flex-col md:flex-row md:space-x-4 space-y-4 md:space-y-0">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Date & time</label>
              <input
                type="datetime-local"
                name="datetime"
                value={formData.datetime}
                onChange={handleChange}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring focus:ring-orange-200"
                required
              />
            </div>
            <div className="w-full md:w-1/3">
              <label className="block text-sm font-medium mb-1">Available seats</label>
              <select
                name="seats"
                value={formData.seats}
                onChange={handleChange}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring focus:ring-orange-200"
                required
              >
                <option value="">Select seats</option>
                {[1, 2, 3, 4, 5, 6].map((num) => (
                  <option key={num} value={num}>
                    {num}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* phone no */}
          <div>
            <label className="block text-sm font-medium mb-1">Phone Number</label>
            <input
              type="tel"
              name="phone"
              placeholder="e.g, 9556328888"
              pattern="^\d{10}$"
              value={formData.phone}
              onChange={handleChange}
              title="please enter a valid phone number"
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring focus:ring-orange-200"
              required
            />
          </div>

          {/* email */}
          <div>
            <label className="block text-sm font-medium mb-1">Email(optional)</label>
            <input
              type="text"
              name="email"
              placeholder="e.g, 123@gmail.com"
              value={formData.email}
              pattern="/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/"
              onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring focus:ring-orange-200"
            />
          </div>          

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-1">Notes (optional)</label>
            <textarea
              name="notes"
              placeholder="Any extra info for co-travelers"
              value={formData.notes}
              onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring focus:ring-orange-200"
              rows={3}
            />
          </div>

          {/* AI Suggestion Box */}
          {(suggested.distanceKm != null || suggested.durationMin != null) && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-gray-700">
              <div>
                Distance ~ {suggested.distanceKm?.toFixed(1)} km • {suggested.durationMin} min
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end">
            <button
              type="submit"
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-1 px-3 rounded-lg w-full md:w-auto transition font-small"
            >
              Post Ride
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PostRide;
        