"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import RequestListCard from "./RequestListCard";
import { Search, Filter } from "lucide-react";

interface DashboardRealtimeProps {
  initialRequests: any[];
}

export default function DashboardRealtime({ initialRequests }: DashboardRealtimeProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [filterState, setFilterState] = useState("all");
  const [toast, setToast] = useState<{message: string, isError: boolean} | null>(null);
  
  const supabase = createClient();
  const localFallback = process.env.NEXT_PUBLIC_FIXFLOW_LOCAL_FALLBACK === "1";

  useEffect(() => {
    if (localFallback) return;

    // Realtime subscription setup
    const channel = supabase
      .channel("dashboard")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "maintenance_requests"
        },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            // Need to fetch joined data since realtime payload only includes basic row
            const { data: newRow } = await supabase
              .from("maintenance_requests")
              .select("*, units(unit_label, properties(address, city))")
              .eq("id", payload.new.id)
              .single();

            if (newRow) {
              setRequests((prev) => [newRow, ...prev]);
              showToast(`New request received: ${(newRow.diagnosis as any)?.category || 'Triaging...'}`, (newRow.diagnosis as any)?.urgency === "emergency");
            }
          }
          if (payload.eventType === "UPDATE") {
             setRequests((prev) => prev.map((r) => {
               if (r.id === payload.new.id) {
                  // Merge existing joined data with new payload data
                  return { ...r, ...payload.new };
               }
               return r;
             }));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [localFallback, supabase]);

  const showToast = (message: string, isError = false) => {
    setToast({ message, isError });
    if (!isError) {
      setTimeout(() => setToast(null), 4000);
    }
  };

  // Derived filtered requests
  const displayRequests = requests.filter(req => {
    if (filterState === "active") return req.status !== "resolved" && req.status !== "error";
    if (filterState === "pending") return req.landlord_approved === false && req.estimated_cost_high > 500;
    if (filterState === "resolved") return req.status === "resolved";
    return true; // "all"
  });

  return (
    <div>
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-4 border-l-8 brutal-card shadow-[4px_4px_0_0_var(--navy)] bg-white animate-in slide-in-from-right-4 duration-300 ${toast.isError ? "border-l-danger" : "border-l-success"}`}>
          <p className="font-bold text-navy uppercase tracking-wide">
            {toast.isError && <span className="text-danger mr-2">🚨 EMERGENCY:</span>}
            {toast.message}
          </p>
          {toast.isError && (
             <button onClick={() => setToast(null)} className="mt-2 text-xs underline font-bold text-navy/50">DISMISS</button>
          )}
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-4 mb-6 bg-gray-100 p-2 border-2 border-navy border-dashed">
        <label className="text-xs uppercase font-bold tracking-widest text-navy/70 flex items-center gap-2">
          <Filter size={14} /> FILTER BY:
        </label>
        <div className="flex gap-2">
          {["all", "active", "pending", "resolved"].map(f => (
            <button
              key={f}
              onClick={() => setFilterState(f)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-2 border-navy transition-all
               ${filterState === f ? 'bg-navy text-white shadow-[2px_2px_0_0_var(--accent)]' : 'bg-white text-navy hover:bg-gray-50'}`}
            >
               {f}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-4">
        {displayRequests.length === 0 ? (
          <div className="p-12 text-center text-navy/50 font-bold uppercase tracking-widest border-4 border-dashed border-gray-200">
             No requests match this filter.
          </div>
        ) : (
          displayRequests.map((req) => (
            <RequestListCard key={req.id} request={req} />
          ))
        )}
      </div>
    </div>
  );
}
