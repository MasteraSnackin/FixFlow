"use client";

import ContractorCard from "./ContractorCard";

interface ContractorMapProps {
  contractors: any[];
  /** Kept for call-site compatibility; map UI removed. */
  propertyAddress?: string;
  requestId: string;
  assignedContractor?: any;
  onAssigned?: (contractor: any) => void;
}

/** Contractor recommendations as a sorted list (no Maps embed — avoids API key / iframe errors). */
export default function ContractorMap({
  contractors,
  requestId,
  assignedContractor,
  onAssigned,
}: ContractorMapProps) {
  const sortedContractors = [...contractors].sort((a, b) => {
    if (a.is_open_now && !b.is_open_now) return -1;
    if (!a.is_open_now && b.is_open_now) return 1;
    return b.rating - a.rating;
  });

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex justify-between items-end border-b-2 border-navy border-opacity-20 pb-2">
        <h3 className="font-bold text-navy uppercase tracking-widest flex items-center gap-2">
          Available Pros{" "}
          <span className="bg-navy text-white text-[10px] px-2 py-0.5">
            {contractors.length}
          </span>
        </h3>
        <span className="text-xs font-bold text-navy/50 uppercase">
          Sorted by availability
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {sortedContractors.map((c, idx) => (
          <ContractorCard
            key={idx}
            contractor={c}
            requestId={requestId}
            isSelected={assignedContractor?.name === c.name}
            onSelect={() => onAssigned?.(c)}
          />
        ))}
      </div>
    </div>
  );
}
