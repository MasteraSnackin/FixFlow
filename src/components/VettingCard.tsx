"use client";

import { AlertTriangle, CheckCircle, ExternalLink, ShieldCheck, PoundSterling } from "lucide-react";
import { useState } from "react";
import { formatGbpRange } from "@/lib/currency";

interface VettedContractor {
  name: string;
  rating?: number;
  review_summary: string;
  red_flags: string[];
  estimated_cost_low: number;
  estimated_cost_high: number;
  sources: string[];
}

interface VettingCardProps {
  contractors: VettedContractor[];
}

export default function VettingCard({ contractors }: VettingCardProps) {
  const [expandedSources, setExpandedSources] = useState<number | null>(null);

  if (!contractors || contractors.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      {contractors.map((contractor, idx) => {
        const isRecommended = idx === 0; // Pre-sorted by API
        const hasRedFlags = contractor.red_flags?.length > 0;
        
        return (
          <div 
            key={idx} 
            className={`brutal-card p-6 bg-white transition-all 
              ${isRecommended ? 'border-success shadow-[8px_8px_0_0_var(--success)] relative overflow-hidden' : 'opacity-80'}`}
          >
            {isRecommended && (
              <div className="absolute top-0 right-0 bg-success text-white font-display font-bold uppercase tracking-widest text-[10px] px-3 py-1 border-l-2 border-b-2 border-success">
                Top Recommendation
              </div>
            )}
            
            <div className="flex justify-between items-start mb-4 pr-32">
              <div>
                <h3 className="font-display font-bold text-xl text-navy uppercase flex items-center gap-2">
                  {isRecommended && <ShieldCheck className="text-success" size={24} />}
                  {contractor.name}
                </h3>
                {contractor.rating && (
                  <span className="text-xs font-bold text-navy/70 uppercase">Rating: {contractor.rating}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Review Summary */}
              <div>
                <h4 className="text-xs font-bold text-navy/50 uppercase tracking-widest mb-2 border-b-2 border-navy/10 pb-1">Review Summary</h4>
                <p className="text-sm font-medium text-navy/90 leading-relaxed italic border-l-4 border-navy/20 pl-3">
                  "{contractor.review_summary}"
                </p>
              </div>

              {/* Cost & Flags */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-navy/50 uppercase tracking-widest mb-2 border-b-2 border-navy/10 pb-1">AI Cost Estimate</h4>
                  <div className="flex items-center gap-2 font-display text-lg font-bold text-navy">
                    <PoundSterling size={20} className="text-success" />
                    <span>
                      {formatGbpRange(
                        contractor.estimated_cost_low,
                        contractor.estimated_cost_high
                      ) || "Pending"}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-navy/50 uppercase tracking-widest mb-2 border-b-2 border-navy/10 pb-1">Safety & Licensing</h4>
                  {hasRedFlags ? (
                    <div className="flex flex-col gap-2">
                      {contractor.red_flags.map((flag, fIdx) => (
                        <div key={fIdx} className="bg-warning/20 border-2 border-warning text-warning-foreground text-xs font-bold px-3 py-2 flex items-start gap-2 shadow-[2px_2px_0_0_var(--warning)]">
                          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                          <span>{flag}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-success/10 border-2 border-success text-success text-xs font-bold px-3 py-2 flex items-center gap-2 shadow-[2px_2px_0_0_var(--success)] inline-flex">
                      <CheckCircle size={14} />
                      Verified Clean Record
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sources Dropdown */}
            {contractor.sources?.length > 0 && (
              <div className="border-t-2 border-dashed border-gray-200 pt-4">
                <button 
                  onClick={() => setExpandedSources(expandedSources === idx ? null : idx)}
                  className="text-xs font-bold text-navy uppercase tracking-widest flex items-center gap-2 hover:text-accent transition-colors"
                >
                  {expandedSources === idx ? "Hide Sources" : "View Grounding Sources"}
                  <ExternalLink size={14} />
                </button>
                
                {expandedSources === idx && (
                  <div className="mt-4 flex flex-col gap-2 bg-gray-50 p-4 border border-navy/10">
                    {contractor.sources.map((url, uIdx) => (
                      <a 
                        key={uIdx} 
                        href={url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-xs text-navy/70 hover:text-accent truncate hover:underline"
                      >
                        {url}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
