"use client";

import { useState } from "react";
import { CheckCircle, XCircle, PoundSterling, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatGbpRange } from "@/lib/currency";

interface ApprovalPanelProps {
  requestId: string;
  costHigh: number;
  costLow: number;
  isApproved: boolean | null;
  status: string;
  autoApprovedReason?: string;
}

export default function ApprovalPanel({ requestId, costHigh, costLow, isApproved, status, autoApprovedReason }: ApprovalPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleApprove = async () => {
    setIsSubmitting(true);
    await fetch(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        landlord_approved: true,
        status: "dispatched",
      }),
    });

    setIsSubmitting(false);
    router.refresh();
  };

  const costString = formatGbpRange(costLow, costHigh) || "Pending";

  // Treat as approved only when explicitly approved/dispatched.
  const approvedExplicit = isApproved === true;
  const isApprovedState =
    approvedExplicit ||
    status === "dispatched" ||
    (status === "resolved" && approvedExplicit);

  if (isApprovedState) {
    return (
      <div className="brutal-card p-6 bg-successbg border-successborder border-l-8 border-l-successborder mb-8">
        <div className="flex items-center gap-3 mb-2">
          <CheckCircle className="text-successborder" size={24} />
          <h3 className="text-xl font-display font-bold text-success border-success">APPROVED FOR DISPATCH</h3>
        </div>
        <p className="text-navy font-bold">
          {autoApprovedReason ? `Auto-approved: ${autoApprovedReason}` : "Manually approved by Landlord."}
        </p>
      </div>
    );
  }

  // If needs approval
  if (isApproved === false && costHigh > 500) {
    return (
      <div className="brutal-card p-6 bg-warningbg border-warningborder border-l-8 border-l-warningborder mb-8">
        <h3 className="text-sm font-bold uppercase tracking-widest text-warningborder mb-4 flex items-center gap-2">
          <PoundSterling size={16} /> Needs Approval
        </h3>
        
        <p className="font-display font-bold text-2xl text-navy mb-1">{costString}</p>
        <p className="text-sm font-bold text-navy/70 uppercase tracking-widest mb-6 border-b-2 border-navy/10 pb-4">Estimated Contractor Cost</p>

        <div className="flex flex-col gap-3 mt-4">
          <button 
            onClick={handleApprove}
            disabled={isSubmitting}
            className="brutal-btn-primary w-full py-4 bg-success border-success flex items-center justify-center gap-2 hover:bg-success/90 text-white"
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : <CheckCircle />}
            APPROVE & DISPATCH
          </button>
          
          <button 
            disabled={isSubmitting}
            className="brutal-btn-secondary w-full py-3 bg-white border-2 border-danger text-danger flex items-center justify-center gap-2 hover:bg-dangerbg shadow-[2px_2px_0_0_var(--danger)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            <XCircle size={18} />
            DECLINE
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="brutal-card p-6 bg-gray-50 border-gray-300 border-l-8 border-l-gray-400 mb-8 opacity-70">
      <h3 className="text-sm font-bold uppercase tracking-widest text-navy mb-2 flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" /> Waiting for Vetting...
      </h3>
      <p className="text-sm text-navy font-bold">Approval panel will unlock when accurate quotes arrive.</p>
    </div>
  );
}
