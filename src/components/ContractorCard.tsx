"use client";

import { Star, MapPin, Clock, PhoneCall, ExternalLink, CheckSquare } from "lucide-react";
import { useState } from "react";

interface ContractorData {
  name: string;
  address: string;
  phone: string;
  rating: number;
  total_reviews: number;
  distance_miles: number;
  hours_today: string;
  is_open_now: boolean;
  maps_url?: string;
}

interface ContractorCardProps {
  contractor: ContractorData;
  requestId: string;
  isSelected: boolean;
  onSelect: () => void;
}

export default function ContractorCard({ contractor, requestId, isSelected, onSelect }: ContractorCardProps) {
  const [isSaving, setIsSaving] = useState(false);

  const handleSelect = async () => {
    if (isSelected) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_contractor: contractor }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Assign contractor failed:", err);
        return;
      }
      onSelect();
    } finally {
      setIsSaving(false);
    }
  };

  // Render stars
  const renderStars = () => {
    const stars = [];
    const fullStars = Math.floor(contractor.rating);
    for (let i = 0; i < 5; i++) {
      stars.push(
        <Star 
          key={i} 
          size={16} 
          className={i < fullStars ? "fill-[#F39C12] text-[#F39C12]" : "text-gray-300"} 
        />
      );
    }
    return stars;
  };

  return (
    <div className={`brutal-card p-4 transition-all duration-300 flex flex-col ${isSelected ? 'border-success shadow-[6px_6px_0_0_var(--success)] bg-success/5' : ''}`}>
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-display font-bold text-lg text-navy uppercase leading-tight pr-4">
          {contractor.maps_url ? (
            <a href={contractor.maps_url} target="_blank" rel="noreferrer" className="hover:text-accent flex items-center gap-2 group">
              {contractor.name} <ExternalLink size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          ) : (
            contractor.name
          )}
        </h3>
        
        {/* Open Badge */}
        {contractor.is_open_now ? (
          <span className="bg-success text-white text-[10px] font-bold px-2 py-1 uppercase tracking-widest border border-navy flex-shrink-0">
            Open
          </span>
        ) : (
          <span className="bg-danger text-white text-[10px] font-bold px-2 py-1 uppercase tracking-widest border border-navy flex-shrink-0">
            Closed
          </span>
        )}
      </div>

      {/* Ratings */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex">{renderStars()}</div>
        <span className="text-xs font-bold text-navy/70 uppercase">
          {contractor.rating.toFixed(1)} ({contractor.total_reviews})
        </span>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 gap-2 mb-5 text-sm font-medium text-navy/80">
        <div className="flex items-start gap-2">
          <MapPin size={16} className="mt-0.5 shrink-0 text-navy" />
          <span>{contractor.address} <span className="font-bold text-accent">({contractor.distance_miles.toFixed(1)} mi)</span></span>
        </div>
        <div className="flex items-center gap-2">
          <Clock size={16} className="shrink-0 text-navy" />
          <span>{contractor.hours_today}</span>
        </div>
        <div className="flex items-center gap-2">
          <PhoneCall size={16} className="shrink-0 text-navy" />
          <a href={`tel:${contractor.phone}`} className="hover:text-accent font-bold underline decoration-2 underline-offset-2">
            {contractor.phone}
          </a>
        </div>
      </div>

      {/* Action Button */}
      <div className="mt-auto pt-4 border-t-2 border-dashed border-gray-200">
        <button
          onClick={handleSelect}
          disabled={isSelected || isSaving}
          className={`w-full py-3 flex items-center justify-center gap-2 font-display font-bold uppercase tracking-widest text-sm transition-all border-2 border-navy
            ${isSelected 
              ? 'bg-success text-white cursor-default shadow-none' 
              : 'bg-white hover:bg-navy hover:text-white text-navy shadow-[4px_4px_0_0_var(--navy)] active:translate-y-1 active:translate-x-1 active:shadow-none'
            }`}
        >
          {isSaving ? (
            "Saving..."
          ) : isSelected ? (
            <>
              <CheckSquare size={18} />
              Assigned
            </>
          ) : (
            "Select Contractor"
          )}
        </button>
      </div>
    </div>
  );
}
