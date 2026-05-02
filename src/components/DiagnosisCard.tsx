"use client";

import { AlertTriangle, Info, CheckCircle, ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";

interface DiagnosisData {
  category: string;
  severity: number;
  urgency: string;
  description: string;
  affected_system: string;
  recommended_action: string;
  tenant_safety_note: string | null;
  confidence: number;
}

interface DiagnosisCardProps {
  diagnosis: DiagnosisData | null;
  status: string;
}

export default function DiagnosisCard({ diagnosis, status }: DiagnosisCardProps) {
  if (!diagnosis) {
    return (
      <div className="brutal-card p-6 w-full animate-pulse border-dashed border-gray-400">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-gray-200 rounded-full"></div>
          <div className="flex-1 space-y-2">
            <div className="h-6 bg-gray-200 w-1/3"></div>
            <div className="h-4 bg-gray-200 w-1/4"></div>
          </div>
        </div>
        <div className="space-y-3 mb-6">
          <div className="h-4 bg-gray-200 w-full"></div>
          <div className="h-4 bg-gray-200 w-full"></div>
          <div className="h-4 bg-gray-200 w-5/6"></div>
        </div>
        <div className="h-20 bg-gray-200 w-full"></div>
        
        <div className="mt-6 flex justify-center">
          <span className="text-navy/50 font-display font-bold text-sm tracking-widest uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-ping"></span>
            AI Agent is analyzing the issue...
          </span>
        </div>
      </div>
    );
  }

  const isEmergency = diagnosis.urgency.toLowerCase() === "emergency";
  const needsReview = diagnosis.confidence < 0.6;
  
  // Color mapping based on category
  const getCategoryColor = (cat: string) => {
    switch(cat.toLowerCase()) {
      case 'plumbing': return 'bg-blue-600';
      case 'electrical': return 'bg-yellow-500';
      case 'hvac': return 'bg-teal-500';
      case 'structural': return 'bg-red-600';
      default: return 'bg-navy';
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="brutal-card overflow-hidden w-full flex flex-col"
    >
      {/* Emergency Banner */}
      {isEmergency && (
        <div className="bg-danger text-white p-3 font-bold font-display uppercase tracking-wider flex items-center justify-center gap-2 text-sm shadow-[0_4px_0_0_rgba(0,0,0,0.2)] z-10">
          <AlertTriangle className="animate-pulse" size={18} />
          EMERGENCY — Immediate Action Required
        </div>
      )}

      {/* Header */}
      <div className="p-6 border-b-2 border-navy relative bg-[#FAFAFA]">
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className={`inline-block px-3 py-1 text-white text-xs font-bold uppercase tracking-widest mb-2 border-2 border-navy shadow-[2px_2px_0_0_var(--navy)] ${getCategoryColor(diagnosis.category)}`}>
              {diagnosis.category}
            </span>
            <h2 className="text-2xl font-bold text-navy font-display uppercase tracking-tight">
              {diagnosis.affected_system}
            </h2>
          </div>
          
          <div className="flex flex-col items-end">
            <span className="text-xs font-bold text-navy/60 uppercase tracking-widest mb-1">Severity</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((level) => (
                <div 
                  key={level} 
                  className={`w-4 h-4 rounded-sm border-2 border-navy ${level <= diagnosis.severity ? (diagnosis.severity >= 4 ? 'bg-danger' : diagnosis.severity === 3 ? 'bg-warning' : 'bg-success') : 'bg-transparent'}`}
                />
              ))}
            </div>
          </div>
        </div>

        <p className="text-navy font-medium leading-relaxed">
          {diagnosis.description}
        </p>
      </div>

      {/* Recommended Action */}
      <div className="p-6 bg-white flex-1">
        <h3 className="text-sm font-bold text-navy uppercase tracking-widest mb-3 flex items-center gap-2">
          <CheckCircle size={16} className="text-success" /> Recommended Action
        </h3>
        <p className="text-navy font-medium bg-[#FAFAFA] border-2 border-navy p-4 shadow-[4px_4px_0_0_rgba(10,20,40,0.1)]">
          {diagnosis.recommended_action}
        </p>

        {/* Safety Note */}
        {diagnosis.tenant_safety_note && (
          <div className="mt-6 hazard-border">
            <div className="bg-white border-2 border-navy p-4 flex gap-4">
              <ShieldAlert className="text-warning shrink-0 mt-1" size={24} />
              <div>
                <h4 className="text-sm font-bold text-navy uppercase tracking-widest mb-1">Safety Warning</h4>
                <p className="font-bold text-navy">{diagnosis.tenant_safety_note}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer / Meta */}
      <div className="p-4 border-t-2 border-navy bg-[#F4F5F7] flex justify-between items-center text-xs font-bold text-navy/70 uppercase">
        <div className="flex items-center gap-2">
          <Info size={14} />
          <span>Status: {status}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>AI Confidence: {Math.round(diagnosis.confidence * 100)}%</span>
          {needsReview && <span className="text-danger flex items-center gap-1"><AlertTriangle size={12}/> Needs Review</span>}
        </div>
      </div>
    </motion.div>
  );
}
