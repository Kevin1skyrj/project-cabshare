"use client";
import React, { useEffect, useState } from "react";
import { db } from "../constants/firebase";
import { collection, getDocs } from "firebase/firestore";
import { cosineSim, rideToText, normalizeRouteKey } from "../lib/ai";

interface Ride {
  id: string;
  name: string;
  phone: number;
  pickup: string;
  drop: string;
  datetime: string;
  notes: string;
  seats: number;
}
type RideWithAI = Ride & { ai?: { embedding?: number[] } };
const today = new Date().toISOString().split("T")[0];

const RideList: React.FC = () => {
  const [allRides, setAllRides] = useState<Ride[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [pickupQuery, setPickupQuery] = useState("");
  const [dropQuery, setDropQuery] = useState("");
  const [keywords, setKeywords] = useState("");
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [showAllRides, setShowAllRides] = useState<boolean>(false);
  const [smart, setSmart] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);

  // Date is managed directly via input[type=date]

  // No dropdown suggestions; users will enter locations manually.

  useEffect(() => {
    const fetchData = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "rides"));
        const rideList: RideWithAI[] = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as RideWithAI[];

        setAllRides(rideList);

        if (showAllRides) {
          setRides(rideList);
        } else {
          const todayRides = rideList.filter((ride) => ride.datetime.includes(today));
          setRides(todayRides);
        }
      } catch (error) {
        console.error("Error fetching rides:", error);
      }
    };

    fetchData();
  }, [showAllRides]);

  const handleSearch = async () => {
    setLoading(true);
    const p = pickupQuery.trim().toLowerCase();
    const d = dropQuery.trim().toLowerCase();
    const kw = keywords.trim().toLowerCase();
    const dateStr = selectedDate.trim();

    // Simple search
    if (!smart) {
      const filtered = allRides.filter((ride) => {
        const mPickup = p ? ride.pickup.toLowerCase().includes(p) : true;
        const mDrop = d ? ride.drop.toLowerCase().includes(d) : true;
        const mKw = kw
          ? ride.pickup.toLowerCase().includes(kw) ||
            ride.drop.toLowerCase().includes(kw) ||
            ride.name.toLowerCase().includes(kw) ||
            (ride.notes || "").toLowerCase().includes(kw)
          : true;
        const mDate = dateStr ? ride.datetime.includes(dateStr) : true;
        return mPickup && mDrop && mKw && mDate;
      });
      setRides(filtered);
      setLoading(false);
      return;
    }

    // Smart Match
    const qText =
      rideToText({ pickup: pickupQuery, drop: dropQuery, datetime: selectedDate }) +
      (kw ? ` Keywords: ${kw}` : "");
    try {
      const qRes = await fetch("/api/ai/embedding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: qText }),
      }).then((r) => r.json());
      const q: number[] = Array.isArray(qRes.embedding) ? qRes.embedding : [];
      const wSim = 1.0; // embedding similarity weight
      const wPickup = 0.25; // string pickup match boost
      const wDrop = 0.25; // string drop match boost
      const wDate = 0.10; // same-day boost

      const ranked = [...(allRides as RideWithAI[])]
        .map((r) => {
          const e = r.ai?.embedding as number[] | undefined;
          const sim = e?.length ? cosineSim(q, e) : 0;
          const pickEq = p ? r.pickup.toLowerCase().includes(p) : false;
          const dropEq = d ? r.drop.toLowerCase().includes(d) : false;
          const dateBoost = dateStr && r.datetime.includes(dateStr) ? 1 : 0;
          // Additional small bonus if route key matches exactly
          const keyMatch = p && d && normalizeRouteKey(r.pickup, r.drop) === normalizeRouteKey(pickupQuery, dropQuery) ? 0.15 : 0;
          const score = wSim * sim + wPickup * (pickEq ? 1 : 0) + wDrop * (dropEq ? 1 : 0) + wDate * dateBoost + keyMatch;
          return { r, score, reasons: { pickEq, dropEq, date: !!dateBoost, key: keyMatch > 0 } };
        })
        .sort((a, b) => b.score - a.score)
        .map((x, i) => ({ ...x, rank: i + 1 }))
        .slice(0, 36);
      setRides(ranked.map((x) => x.r));
    } catch (err) {
      console.error("Smart search failed", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDetails = (ride: Ride) => {
    setSelectedRide(ride);
  };

  const closeModal = () => {
    setSelectedRide(null);
  };

  return (
    <div className="min-h-screen bg-white pt-20 pb-12">
      <div className="max-w-6xl mx-auto px-6">
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8 w-full border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            {/* Pickup */}
            <div className="md:col-span-4">
              <label className="block text-xs text-gray-600 mb-1">Pickup</label>
              <input
                type="text"
                placeholder="e.g., Campus Main Gate"
                value={pickupQuery}
                onChange={(e) => setPickupQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            {/* Drop */}
            <div className="md:col-span-4">
              <label className="block text-xs text-gray-600 mb-1">Drop</label>
              <input
                type="text"
                placeholder="e.g., Bhubaneswar Airport"
                value={dropQuery}
                onChange={(e) => setDropQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            {/* Keywords */}
            <div className="md:col-span-4">
              <label className="block text-xs text-gray-600 mb-1">Keywords (optional)</label>
              <input
                type="text"
                placeholder="e.g., morning, airport, 3 seats"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            {/* Date */}
            <div className="md:col-span-3">
              <label className="block text-xs text-gray-600 mb-1">Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            {/* Toggles */}
            <div className="md:col-span-6 flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={smart} onChange={() => setSmart(!smart)} />
                <span className="select-none">AI Smart Match</span>
              </label>
              <button
                onClick={() => setShowAllRides(!showAllRides)}
                className="px-4 py-2 border border-amber-600 text-amber-700 hover:bg-amber-50 rounded-lg text-sm"
              >
                {showAllRides ? "Show Today's Rides" : "Show All Rides"}
              </button>
            </div>

            {/* Search */}
            <div className="md:col-span-3 flex justify-end">
              <button
                onClick={handleSearch}
                disabled={loading}
                className="w-full md:w-auto bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white px-6 py-2 rounded-xl font-medium transition duration-300"
              >
                {loading ? "Searching…" : smart ? "Smart Match" : "Search"}
              </button>
            </div>
          </div>

          {/* No datalist suggestions */}
        </div>

        {!loading && rides.length === 0 && (
          <div className="text-center text-gray-600 mb-8">
            No rides found. Try adjusting pickup, drop, or date.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rides.map((ride, idx) => (
            <div key={ride.id} className="border border-gray-200 rounded-xl p-5 shadow-sm bg-white">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 12.414a4 4 0 10-5.657 5.657l4.243 4.243a8 8 0 1111.314-11.314l-4.243 4.243" />
                </svg>
                <span className="font-semibold">{ride.pickup}</span>
                <svg className="w-4 h-4 mx-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-semibold">{ride.drop}</span>
                {smart && idx < 3 && (
                  <span className="ml-auto text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                    Top match
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-gray-600 text-sm">{ride.datetime.replace("T", ", ")}</span>
              </div>

              {/* Match badges */}
              {smart && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {pickupQuery && ride.pickup.toLowerCase().includes(pickupQuery.toLowerCase()) && (
                    <span className="text-[11px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">Pickup match</span>
                  )}
                  {dropQuery && ride.drop.toLowerCase().includes(dropQuery.toLowerCase()) && (
                    <span className="text-[11px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">Drop match</span>
                  )}
                  {selectedDate && ride.datetime.includes(selectedDate) && (
                    <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">Same day</span>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-gray-700 text-sm">Seats available: {ride.seats}</span>
              </div>

              <div className="flex justify-between gap-4">
                <button
                  onClick={() => handleDetails(ride)}
                  className="flex-1 border border-orange-400 text-orange-400 hover:bg-orange-50 py-2 rounded-lg text-sm"
                >
                  Details
                </button>
                <button
                  onClick={() => console.log("Contact:", ride.phone)}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-lg text-sm flex items-center justify-center"
                >
                  Contact
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {selectedRide && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-96">
            <h2 className="text-xl font-bold mb-4">Ride Details</h2>
            <p>
              <span className="font-semibold">Name:</span> {selectedRide.name}
            </p>
            <p>
              <span className="font-semibold">Contact:</span> {selectedRide.phone}
            </p>
            <p>
              <span className="font-semibold">Notes:</span> {selectedRide.notes || "No notes"}
            </p>

            <div className="mt-6 flex justify-end">
              <button onClick={closeModal} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RideList;

