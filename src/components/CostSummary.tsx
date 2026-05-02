"use client";

import { useMemo } from "react";
import { Activity, AlertOctagon, PoundSterling, Clock } from "lucide-react";
import { formatGbp } from "@/lib/currency";

interface CostSummaryProps {
  requests: any[];
}

export default function CostSummary({ requests }: CostSummaryProps) {
  const stats = useMemo(() => {
    let active = 0;
    let pendingApproval = 0;
    let mtdSpend = 0;

    let totalResponseDesc = "N/A";
    
    // Simplistic response time tracking just for demo vs current date
    const now = new Date();
    let totalResponseTimeMs = 0;
    let resolvedCount = 0;

    for (const req of requests) {
      if (req.status !== "resolved" && req.status !== "error") active++;
      
      const isPending = req.landlord_approved === false && req.estimated_cost_high > 500;
      if (isPending) pendingApproval++;

      if (req.status === "dispatched" || req.status === "resolved") {
        mtdSpend += req.estimated_cost_high || 0;
      }
      
      if (req.status === "resolved") {
        resolvedCount++;
        const createdLineate = new Date(req.created_at);
        const updatedTime = new Date(req.updated_at);
        totalResponseTimeMs += (updatedTime.getTime() - createdLineate.getTime());
      }
    }

    if (resolvedCount > 0) {
      const avgMs = totalResponseTimeMs / resolvedCount;
      const hours = Math.floor(avgMs / (1000 * 60 * 60));
      if (hours === 0) {
        totalResponseDesc = "< 1 hr";
      } else {
        totalResponseDesc = `~${hours} hrs`;
      }
    }

    return { active, pendingApproval, mtdSpend, responseTime: totalResponseDesc, resolvedCount };
  }, [requests]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Active Requests */}
      <div className="brutal-card p-4 sm:p-6 bg-infobg border-infoborder border-l-8 border-l-infoborder flex items-center justify-between">
        <div>
          <h3 className="text-xs uppercase font-bold tracking-widest text-navy/60 mb-1">Active Requests</h3>
          <p className="text-3xl font-display font-bold text-navy">{stats.active}</p>
        </div>
        <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-inner">
          <Activity size={24} className="text-infoborder" />
        </div>
      </div>

      {/* Pending Approval */}
      <div className={`brutal-card p-4 sm:p-6 ${stats.pendingApproval > 0 ? "bg-warningbg border-warningborder border-l-8 border-l-warningborder animate-pulse" : "bg-gray-50 border-gray-300 border-l-8 border-l-gray-400"} flex items-center justify-between`}>
        <div>
          <h3 className="text-xs uppercase font-bold tracking-widest text-navy/60 mb-1">Needs Approval</h3>
          <p className="text-3xl font-display font-bold text-navy">{stats.pendingApproval}</p>
        </div>
        <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-inner">
          <AlertOctagon size={24} className={stats.pendingApproval > 0 ? "text-warningborder" : "text-gray-400"} />
        </div>
      </div>

      {/* Spend MTD */}
      <div className="brutal-card p-4 sm:p-6 bg-white flex items-center justify-between">
        <div>
          <h3 className="text-xs uppercase font-bold tracking-widest text-navy/60 mb-1">Est. MTD Spend</h3>
          <p className="text-3xl font-display font-bold text-navy">
            {formatGbp(stats.mtdSpend)}
          </p>
        </div>
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center border-2 border-navy">
          <PoundSterling size={24} className="text-navy" />
        </div>
      </div>

      {/* Avg Response Time */}
      <div className="brutal-card p-4 sm:p-6 bg-successbg border-successborder border-l-8 border-l-successborder flex items-center justify-between">
        <div>
          <h3 className="text-xs uppercase font-bold tracking-widest text-navy/60 mb-1">Avg Resolution</h3>
          <p className="text-3xl font-display font-bold text-navy">{stats.responseTime}</p>
        </div>
        <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-inner">
          <Clock size={24} className="text-successborder" />
        </div>
      </div>
    </div>
  );
}
