"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

interface PipelineStatusProps {
  request: Record<string, unknown>;
}

export default function PipelineStatus({ request }: PipelineStatusProps) {
  const [elapsed, setElapsed] = useState(0);

  const isEmergency = (request?.diagnosis as any)?.urgency?.toLowerCase() === "emergency";

  const STEPS = [
    { id: "submitted", label: "Submitted", estimate: "Done" },
    { id: "diagnosing", label: "Diagnosing Issue", estimate: "Estimated: 5-8s" },
    { id: "contractors", label: "Finding Experts", estimate: "Estimated: 8-12s" },
    { id: "vetting", label: "Vetting & Quoting", estimate: "Estimated: 5-10s" },
    { id: "ready", label: isEmergency ? "EMERGENCY DISPATCH" : "Ready for Dispatch", estimate: "Finishing up..." }
  ];

  const hasDiagnosis = request?.diagnosis != null;
  const hasContractors = request?.contractors != null;
  const hasVetting = request?.vetting != null && (request.vetting as any).length > 0;
  const diag = request?.diagnosis as Record<string, unknown> | null | undefined;
  const quoteStatus = typeof diag?.quote_status === "string" ? diag.quote_status : null;
  const hasContractorQuote = typeof diag?.contractor_quote === "string";
  const notifyOutreachDone =
    request?.voice_update_url != null ||
    quoteStatus != null ||
    hasContractorQuote ||
    request?.status === "dispatched";

  // Determine current step index (0 to 4)
  let currentStepIdx = 0; // Submitted is always done contextually
  if (true) currentStepIdx = 1; 
  if (hasDiagnosis) currentStepIdx = 2;
  if (hasContractors) currentStepIdx = 3;
  if (hasVetting) currentStepIdx = 4;
  if (notifyOutreachDone) currentStepIdx = 5; // All done

  // Timer for active step
  useEffect(() => {
    if (currentStepIdx >= 5) return;
    
    // Reset elapsed when step changes
    setElapsed(0);
    
    const t = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    
    return () => clearInterval(t);
  }, [currentStepIdx]);

  return (
    <div className="w-full bg-white brutal-card p-4 sm:p-6 lg:p-8 mb-8 overflow-hidden">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between w-full relative">
        {/* Background connector line (Desktop) */}
        <div className="hidden md:block absolute top-[28px] left-[10%] right-[10%] h-1 bg-navy/10 z-0"></div>

        {/* Dynamic completed line (Desktop) */}
        <div 
          className="hidden md:block absolute top-[28px] left-[10%] h-1 bg-success z-0 transition-all duration-700 ease-in-out"
          style={{ width: `${Math.min(100, (currentStepIdx / 4) * 80)}%` }}
        ></div>

        {STEPS.map((step, idx) => {
          const isCompleted = idx < currentStepIdx || (idx === 0);
          const isActive = idx === currentStepIdx && currentStepIdx < 5;
          const isPending = idx > currentStepIdx;

          return (
            <div key={step.id} className="relative z-10 flex flex-row md:flex-col items-center gap-4 w-full md:w-1/5 mb-4 md:mb-0">
              
              {/* Connector line (Mobile) */}
              {idx > 0 && (
                <div className="md:hidden absolute left-[19px] -top-8 bottom-8 w-1 bg-navy/10 -z-10">
                  <div 
                    className="w-full bg-success transition-all duration-700"
                    style={{ height: isCompleted || isActive ? '100%' : '0%' }}
                  ></div>
                </div>
              )}

              {/* Status Circle */}
              <div 
                className={`w-10 h-10 border-2 shrink-0 flex items-center justify-center transition-all duration-500
                  ${isCompleted ? "bg-success border-success text-white shadow-[2px_2px_0_0_var(--success)]" : ""}
                  ${isActive ? "bg-white border-navy text-navy shadow-[4px_4px_0_0_var(--navy)] scale-110" : ""}
                  ${isPending ? "bg-gray-100 border-gray-300 text-gray-400" : ""}
                `}
              >
                {isCompleted ? (
                  <Check size={20} strokeWidth={3} />
                ) : isActive ? (
                  <Loader2 size={20} className="animate-spin text-accent" />
                ) : (
                  <span className="font-display font-bold text-sm tracking-tighter">{idx + 1}</span>
                )}
              </div>

              {/* Text / Labels */}
              <div className="text-left md:text-center w-full">
                <p className={`font-display uppercase tracking-widest text-xs sm:text-sm font-bold transition-colors
                  ${isCompleted ? "text-success" : ""}
                  ${isActive ? "text-navy" : ""}
                  ${isPending ? "text-gray-400" : ""}
                `}>
                  {step.label}
                </p>

                {/* Estimate or Status text under the label */}
                <div className="h-4 mt-1">
                  {isActive && (
                    <p className="text-[10px] sm:text-xs text-accent font-medium animate-pulse">
                      {elapsed > 20 ? "Taking longer than usual..." : step.estimate}
                    </p>
                  )}
                  {isCompleted && idx === 0 && (
                    <p className="text-[10px] sm:text-xs text-success/80 font-bold uppercase">Success</p>
                  )}
                  {isCompleted && idx > 0 && currentStepIdx === idx + 1 && (
                    <p className="text-[10px] sm:text-xs text-success font-bold uppercase animate-in fade-in zoom-in duration-300">Complete</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
