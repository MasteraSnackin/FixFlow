"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { Clock, AlertTriangle, CheckCircle2, Loader2, ArrowRight, Plus, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { formatGbpRange } from "@/lib/currency";
import { listBrowserDemoRequests } from "@/lib/browser-demo-store";

// Supabase client – only used for Realtime subscriptions (anon key is fine for channels)
const supabaseRealtime = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Request = {
  id: string;
  status: string;
  description: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  diagnosis: any;
  estimated_cost_low: number | null;
  estimated_cost_high: number | null;
  units: {
    unit_label: string;
    properties: { address: string; city: string } | null;
  } | null;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  submitted:   { label: "Submitted",   color: "text-blue-700",   bg: "bg-blue-100",   icon: <Clock size={14} /> },
  diagnosing:  { label: "Diagnosing",  color: "text-amber-700",  bg: "bg-amber-100",  icon: <Loader2 size={14} className="animate-spin" /> },
  diagnosed:   { label: "Diagnosed",   color: "text-amber-700",  bg: "bg-amber-100",  icon: <FileText size={14} /> },
  contractors: { label: "Finding Pros", color: "text-purple-700", bg: "bg-purple-100", icon: <Loader2 size={14} className="animate-spin" /> },
  vetting:     { label: "Vetting",     color: "text-purple-700", bg: "bg-purple-100", icon: <Loader2 size={14} className="animate-spin" /> },
  work_order:  { label: "Work Order",  color: "text-indigo-700", bg: "bg-indigo-100", icon: <FileText size={14} /> },
  notifying:   { label: "Notifying",   color: "text-indigo-700", bg: "bg-indigo-100", icon: <Loader2 size={14} className="animate-spin" /> },
  dispatched:  { label: "Dispatched",  color: "text-green-700",  bg: "bg-green-100",  icon: <CheckCircle2 size={14} /> },
  resolved:    { label: "Resolved",    color: "text-green-700",  bg: "bg-green-100",  icon: <CheckCircle2 size={14} /> },
  error:       { label: "Error",       color: "text-red-700",    bg: "bg-red-100",    icon: <AlertTriangle size={14} /> },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] || { label: status, color: "text-navy", bg: "bg-gray-100", icon: <Clock size={14} /> };
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function MyRequestsPage() {
  const { user, isLoaded } = useUser();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const localFallback = process.env.NEXT_PUBLIC_FIXFLOW_LOCAL_FALLBACK === "1";

  useEffect(() => {
    if (!isLoaded || !user?.id) return;

    async function fetchMyRequests() {
      const tenantId = user?.id;
      if (!tenantId) return;
      setLoading(true);
      try {
        const res = await fetch("/api/my-requests");
        const data = await res.json();
        const demoRequests = listBrowserDemoRequests(tenantId) as Request[];
        if (res.ok) {
          const liveRequests = (data.requests || []) as Request[];
          const merged = [...demoRequests, ...liveRequests.filter((request) =>
            !demoRequests.some((demoRequest) => demoRequest.id === request.id)
          )];
          setRequests(merged);
        } else {
          console.error("Failed to fetch requests:", data.error);
          setRequests(demoRequests);
        }
      } catch (err) {
        console.error("Failed to fetch requests:", err);
        setRequests(listBrowserDemoRequests(tenantId) as Request[]);
      }
      setLoading(false);
    }

    fetchMyRequests();

    if (localFallback) {
      return;
    }

    // Subscribe to realtime updates for this tenant's requests
    const channel = supabaseRealtime
      .channel("my-requests")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "maintenance_requests",
          filter: `tenant_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setRequests((prev) => [payload.new as unknown as Request, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setRequests((prev) =>
              prev.map((r) =>
                r.id === (payload.new as any).id ? { ...r, ...(payload.new as any) } : r
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabaseRealtime.removeChannel(channel);
    };
  }, [isLoaded, localFallback, user?.id]);

  if (!isLoaded || loading) {
    return (
      <div className="max-w-4xl mx-auto p-8 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="text-accent animate-spin" />
          <span className="font-display font-bold uppercase tracking-widest text-navy/50">Loading Your Requests...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-8 pb-32">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold uppercase tracking-tight text-navy">
            My Requests
          </h1>
          <p className="text-navy/70 border-l-4 border-accent pl-4 py-1 font-bold mt-2">
            Track all your maintenance submissions and their live status.
          </p>
        </div>
        <Link
          href="/submit"
          className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white font-display font-bold uppercase tracking-widest text-sm border-2 border-navy shadow-[4px_4px_0_0_var(--navy)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
        >
          <Plus size={18} /> New Request
        </Link>
      </div>

      {/* Request List */}
      {requests.length === 0 ? (
        <div className="brutal-card border-dashed p-12 text-center">
          <FileText size={48} className="text-navy/20 mx-auto mb-4" />
          <h2 className="font-display font-bold uppercase tracking-widest text-navy/50 mb-2">
            No Requests Yet
          </h2>
          <p className="text-navy/40 font-medium mb-6">
            Submit your first maintenance request to get started.
          </p>
          <Link
            href="/submit"
            className="inline-flex items-center gap-2 px-6 py-3 bg-navy text-white font-display font-bold uppercase tracking-widest text-sm border-2 border-navy shadow-[4px_4px_0_0_var(--accent)] hover:bg-accent transition-colors"
          >
            <Plus size={18} /> Submit Request
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req, i) => {
            const statusCfg = getStatusConfig(req.status);
            const isEmergency = req.diagnosis?.urgency?.toLowerCase() === "emergency";
            const category = req.diagnosis?.category || "General";
            const issueDesc = req.diagnosis?.description || req.description || "Pending diagnosis...";

            return (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
              >
                <Link href={`/requests/${req.id}`}>
                  <div
                    className={`brutal-card p-4 sm:p-6 flex flex-col sm:flex-row gap-4 items-start hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all cursor-pointer ${
                      isEmergency ? "border-l-4 border-l-danger" : ""
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="w-full sm:w-24 h-24 flex-shrink-0 overflow-hidden border-2 border-navy bg-gray-100">
                      {req.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={req.photo_url}
                          alt="Issue"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-navy/20">
                          <FileText size={24} />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold uppercase tracking-widest ${statusCfg.color} ${statusCfg.bg} border border-current/20`}>
                          {statusCfg.icon} {statusCfg.label}
                        </span>
                        <span className="text-xs font-bold uppercase tracking-widest text-navy/40">
                          {category}
                        </span>
                        {isEmergency && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-danger bg-red-50 border border-danger/20 animate-pulse">
                            <AlertTriangle size={12} /> Emergency
                          </span>
                        )}
                      </div>

                      <p className="text-navy font-bold text-sm line-clamp-2 mb-2">
                        {issueDesc}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-navy/50 font-medium">
                        <span>{req.units?.unit_label || "Unit"}</span>
                        <span>{req.units?.properties?.address || ""}</span>
                        {req.estimated_cost_low != null && req.estimated_cost_high != null && (
                          <span className="font-bold text-navy/70">
                            {formatGbpRange(
                              req.estimated_cost_low,
                              req.estimated_cost_high
                            )}
                          </span>
                        )}
                        <span className="ml-auto">{timeAgo(req.created_at)}</span>
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="hidden sm:flex items-center self-center">
                      <ArrowRight size={20} className="text-navy/30" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
