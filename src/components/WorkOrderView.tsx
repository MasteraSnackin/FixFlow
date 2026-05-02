"use client";

import { FileText, Copy, User, MapPin, Wrench } from "lucide-react";
import { useState } from "react";
import { formatGbp } from "@/lib/currency";

interface WorkOrderViewProps {
  workOrder: any;
}

export default function WorkOrderView({ workOrder }: WorkOrderViewProps) {
  const [copied, setCopied] = useState(false);

  if (!workOrder) {
    return (
      <div className="brutal-card p-6 border-dashed border-gray-300 opacity-60 flex items-center justify-center h-48">
        <span className="text-sm font-bold uppercase tracking-widest text-navy/50 flex items-center gap-2">
           <FileText size={16} /> Awaiting Work Order Generation...
        </span>
      </div>
    );
  }

  const unitLabel = workOrder.unit_label || workOrder.unit_number || "";
  const issueSummary =
    workOrder.issue_summary || workOrder.issue_description || "Pending";
  const instructions =
    workOrder.special_instructions || workOrder.dispatch_notes || "";
  const costDisplay =
    typeof workOrder.approved_cost_max === "number"
      ? formatGbp(workOrder.approved_cost_max)
      : workOrder.estimated_cost_range || "Pending";
  const costLabel =
    typeof workOrder.approved_cost_max === "number"
      ? "Approved Maximum"
      : "Estimated Cost";

  const handleCopy = () => {
    const text = `WORK ORDER\n` +
      `Property: ${workOrder.property_address}\n` +
      `Unit: ${unitLabel || 'N/A'}\n` +
      `Tenant: ${workOrder.tenant_name || 'N/A'}\n` +
      `Phone: ${workOrder.tenant_phone || 'N/A'}\n\n` +
      `Issue: ${issueSummary}\n` +
      `Instructions: ${instructions}\n\n` +
      `Contractor: ${workOrder.assigned_contractor_name}\n` +
      `${costLabel}: ${costDisplay}\n`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="brutal-card overflow-hidden bg-white mb-8 border-t-[12px] border-t-navy">
      <div className="p-4 border-b-2 border-navy flex justify-between items-center bg-gray-50">
        <h3 className="font-display font-bold uppercase tracking-widest text-navy flex items-center gap-2">
           <FileText size={18} /> Official Work Order
        </h3>
        <button 
          onClick={handleCopy}
          className="p-2 border-2 border-navy bg-white hover:bg-navy hover:text-white transition-colors flex items-center justify-center shadow-[2px_2px_0_0_var(--navy)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          title="Copy to Clipboard"
        >
          {copied ? <span className="text-[10px] font-bold uppercase px-1">Copied!</span> : <Copy size={14} />}
        </button>
      </div>

      <div className="p-6 space-y-6 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-navy/50 mb-1 flex items-center gap-1"><MapPin size={10} /> Location</span>
            <p className="font-bold text-navy">{workOrder.property_address}</p>
            <p className="text-navy">{unitLabel ? unitLabel : ""}</p>
          </div>
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-navy/50 mb-1 flex items-center gap-1"><User size={10} /> Tenant</span>
            <p className="font-bold text-navy">{workOrder.tenant_name || 'Resident'}</p>
            {workOrder.tenant_phone && <p className="text-navy">{workOrder.tenant_phone}</p>}
          </div>
        </div>

        <div className="bg-gray-50 border-2 border-navy p-4 shadow-[4px_4px_0_0_rgba(10,20,40,0.05)]">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-navy/50 mb-2">Issue Summary</span>
          <p className="font-medium text-navy leading-relaxed">{issueSummary}</p>
        </div>

        <div>
           <span className="block text-[10px] font-bold uppercase tracking-widest text-navy/50 mb-1 flex items-center gap-1"><Wrench size={10} /> Dispatch</span>
           <p className="font-bold text-navy text-base">{workOrder.assigned_contractor_name}</p>
           {workOrder.assigned_contractor_phone && <p className="text-navy flex items-center gap-2 mt-1 px-3 py-1 bg-gray-100 border-2 border-navy inline-flex font-bold tracking-widest text-xs">📞 {workOrder.assigned_contractor_phone}</p>}
        </div>

        {instructions && (
          <div className="text-xs bg-infobg p-3 border-l-4 border-infoborder text-navy/80 font-medium">
            <span className="font-bold text-navy">Instructions:</span> {instructions}
          </div>
        )}

        <div className="pt-4 border-t-2 border-dashed border-gray-300 flex justify-between items-center">
           <span className="font-bold uppercase tracking-widest text-navy/60">{costLabel}</span>
           <span className="font-display font-bold text-xl text-navy">{costDisplay}</span>
        </div>
      </div>
    </div>
  );
}
