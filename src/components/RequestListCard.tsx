"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, MapPin, CheckCircle, Clock } from "lucide-react";
import { formatGbpRange } from "@/lib/currency";

interface RequestListCardProps {
  request: any;
}

export default function RequestListCard({ request }: RequestListCardProps) {
  const diagnosis = request.diagnosis as any;
  const isEmergency = diagnosis?.urgency?.toLowerCase() === "emergency";
  
  const unit = request.units;
  const address = unit?.properties?.address || "Unknown Property";
  const unitLabel = unit?.unit_label || "Unknown Unit";
  const category = diagnosis?.category || "Triage";
  const severity = diagnosis?.severity || 1;

  // Derive status badge
  let statusColor = "bg-gray-200 text-gray-700";
  let StatusIcon = Clock;
  let statusText = request.status?.toUpperCase() || "SUBMITTED";

  if (request.status === "diagnosing") {
    statusColor = "bg-blue-100 text-blue-800 border-blue-300";
    statusText = "DIAGNOSING";
  } else if (request.status === "dispatched") {
    statusColor = "bg-green-100 text-green-800 border-green-300";
    statusText = "DISPATCHED";
  } else if (request.status === "resolved") {
    statusColor = "bg-success text-white";
    StatusIcon = CheckCircle;
    statusText = "RESOLVED";
  } else if (request.status === "error") {
    statusColor = "bg-danger text-white";
    StatusIcon = AlertTriangle;
    statusText = "ERROR";
  } else if (request.status === "submitted") {
    statusColor = "bg-gray-100 text-navy border-gray-400";
  } else {
    // Other statuses like "finding_contractor" etc.
    statusColor = "bg-warning text-navy border-warning";
  }

  // Formatting Cost
  const costLow = request.estimated_cost_low;
  const costHigh = request.estimated_cost_high;
  const costString = formatGbpRange(costLow, costHigh) || "Pending Estimate";

  return (
    <Link href={`/dashboard/requests/${request.id}`}>
      <div className={`brutal-card p-4 sm:p-6 mb-4 flex flex-col sm:flex-row gap-6 hover:-translate-y-1 hover:shadow-[6px_6px_0_0_var(--navy)] transition-all cursor-pointer bg-white relative overflow-hidden group ${isEmergency ? 'border-l-8 border-l-danger' : 'border-l-8 border-l-transparent'}`}>
        
        {/* Thumbnail */}
        <div className="w-full sm:w-24 h-32 sm:h-24 shrink-0 bg-gray-100 border-2 border-navy overflow-hidden relative">
          {request.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={request.photo_url} alt="Issue thumbnail" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-navy/30">No Photo</div>
          )}
          {isEmergency && (
            <div className="absolute top-1 right-1 w-3 h-3 bg-danger rounded-full animate-ping"></div>
          )}
        </div>

        {/* Core Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-widest border-2 flex items-center gap-1 ${statusColor}`}>
                <StatusIcon size={12} />
                {statusText}
              </span>
              <span className="px-2 py-1 bg-navy text-white text-[10px] font-bold uppercase tracking-widest">
                {category}
              </span>
              {request.landlord_approved === false && costHigh > 500 && (
                <span className="px-2 py-1 bg-warning text-navy border-2 border-navy text-[10px] font-bold uppercase tracking-widest animate-pulse">
                  NEEDS APPROVAL
                </span>
              )}
            </div>

            <h3 className="font-display font-bold text-lg text-navy truncate">
              {diagnosis?.affected_system || request.description || "Uncategorized Issue"}
            </h3>
            <p className="text-sm text-navy/70 flex items-center gap-1 mt-1 truncate">
              <MapPin size={14} />
              <span className="font-bold">{unitLabel}</span> — {address}
            </p>
          </div>

          <div className="mt-4 sm:mt-0 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-navy/60">
            <span>{formatDistanceToNow(new Date(request.created_at))} ago</span>
            
            {/* Severity Dots */}
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline">Severity:</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((level) => (
                  <div 
                    key={level} 
                    className={`w-2 h-2 rounded-sm ${level <= severity ? (severity >= 4 ? 'bg-danger' : severity === 3 ? 'bg-warning' : 'bg-success') : 'bg-gray-200'}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Cost / Action Desktop */}
        <div className="hidden sm:flex flex-col items-end justify-between border-l-2 border-dashed border-gray-300 pl-6 w-32 shrink-0">
          <div className="text-right">
            <span className="block text-[10px] uppercase font-bold text-navy/50 tracking-widest mb-1">Est. Cost</span>
            <span className="font-display font-bold text-navy text-sm">{costString}</span>
          </div>
          <span className="text-xs font-bold text-accent uppercase tracking-widest group-hover:underline">View Details &rarr;</span>
        </div>
      </div>
    </Link>
  );
}
