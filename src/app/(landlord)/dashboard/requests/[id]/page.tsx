import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import DiagnosisCard from "@/components/DiagnosisCard";
import ContractorMap from "@/components/ContractorMap";
import VettingCard from "@/components/VettingCard";
import VoiceUpdate from "@/components/VoiceUpdate";
import ApprovalPanel from "@/components/ApprovalPanel";
import WorkOrderView from "@/components/WorkOrderView";
import { getRequestWithRelations, isLocalDevDataMode } from "@/lib/local-dev-store";

export default async function LandlordRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) {
    redirect("/sign-in");
  }

  if (isLocalDevDataMode()) {
    const request = getRequestWithRelations(id);

    if (!request) {
      return (
        <div className="max-w-7xl mx-auto p-8 text-center brutal-card mt-10">
          <h1 className="text-2xl font-bold font-display uppercase tracking-widest text-danger">Request Not Found</h1>
          <Link href="/dashboard" className="text-navy underline mt-4 inline-block font-bold">Return to Dashboard</Link>
        </div>
      );
    }

    const diagnosis = request.diagnosis as any;
    const isEmergency = diagnosis?.urgency?.toLowerCase() === "emergency";
    const propertyAddress = request.units?.properties?.address || "Unknown Property";
    const quoteStatus =
      typeof diagnosis?.quote_status === "string" ? diagnosis.quote_status : null;
    const quoteSource = Array.isArray(diagnosis?.quote_source)
      ? (diagnosis.quote_source as string[]).join(", ")
      : null;
    const voiceLanguageLabel =
      typeof diagnosis?.voice_transcript_language_label === "string"
        ? diagnosis.voice_transcript_language_label
        : typeof diagnosis?.preferred_language_label === "string"
          ? diagnosis.preferred_language_label
          : null;
    const originalVoiceTranscript =
      typeof diagnosis?.voice_transcript_original === "string"
        ? diagnosis.voice_transcript_original
        : null;

    let autoApprovedReason = "";
    if (request.status === "dispatched" || request.landlord_approved) {
      if (isEmergency) autoApprovedReason = "Emergency Protocol";
      else if ((request.estimated_cost_high ?? 0) <= 500) autoApprovedReason = "Cost below £500 threshold";
    }

    return (
      <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-8 pb-32">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-navy/70 hover:text-navy transition-colors">
          <ArrowLeft size={16} /> Back to Command Center
        </Link>

        <div className={`brutal-card p-6 bg-white border-b-8 ${isEmergency ? 'border-b-danger' : 'border-b-navy'}`}>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-display font-bold uppercase tracking-tight text-navy">
                 Maintenance Request
              </h1>
              <p className="text-navy/70 font-bold mt-1 text-sm uppercase tracking-widest border-s-4 border-accent pl-3">
                 ID: {request.id.split("-")[0]}
              </p>
            </div>
            <div className="text-right">
               <span className="px-3 py-1 bg-navy text-white text-xs font-bold uppercase tracking-widest shadow-[2px_2px_0_0_var(--accent)]">
                  Status: {request.status}
               </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          <div className="w-full lg:w-3/5 space-y-8">
            <div className="aspect-video brutal-card overflow-hidden bg-gray-100 flex items-center justify-center p-2 relative">
               {request.photo_url ? (
                 // eslint-disable-next-line @next/next/no-img-element
                 <img src={request.photo_url} alt="Submitted issue" className="w-full h-full object-cover border-2 border-navy" />
               ) : (
                 <span className="font-bold uppercase tracking-widest text-navy/30">No Photo</span>
               )}
               {isEmergency && (
                 <div className="absolute top-4 right-4 bg-danger text-white px-3 py-1 font-display font-bold uppercase shadow-[4px_4px_0_0_rgba(10,20,40,0.2)] animate-pulse">
                   EMERGENCY
                 </div>
               )}
            </div>

            <section>
              <h2 className="text-xl font-display font-bold uppercase tracking-wide text-navy mb-4 border-b-2 border-navy/20 pb-2">AI Diagnosis</h2>
              {request.diagnosis ? (
                <DiagnosisCard diagnosis={request.diagnosis as any} status={request.status} />
              ) : (
                <div className="brutal-card p-6 text-center text-navy/50 font-bold tracking-widest uppercase">Pending Diagnosis...</div>
              )}
            </section>

            <section>
              <h2 className="text-xl font-display font-bold uppercase tracking-wide text-navy mb-4 border-b-2 border-navy/20 pb-2">Contractor Matches</h2>
              {request.contractors ? (
                <ContractorMap
                  contractors={request.contractors as any}
                  propertyAddress={propertyAddress}
                  requestId={request.id}
                  assignedContractor={request.assigned_contractor}
                />
              ) : (
                <div className="brutal-card p-6 text-center text-navy/50 font-bold tracking-widest uppercase">Searching Network...</div>
              )}
            </section>

            <section>
              <h2 className="text-xl font-display font-bold uppercase tracking-wide text-navy mb-4 border-b-2 border-navy/20 pb-2">Vetting Results</h2>
              {request.vetting && (request.vetting as any).length > 0 ? (
                <VettingCard contractors={request.vetting as any} />
              ) : (
                <div className="brutal-card p-6 text-center text-navy/50 font-bold tracking-widest uppercase">Background Checks Pending...</div>
              )}
            </section>
          </div>

          <div className="w-full lg:w-2/5 space-y-8 sticky top-8">
             {quoteStatus && (
               <div className="brutal-card p-4 bg-[#F4F5F7] border-2 border-navy">
                 <p className="text-xs font-bold uppercase tracking-widest text-navy/70">
                   Quote Request Status
                 </p>
                 <p className="font-display font-bold text-navy text-lg">
                   {quoteStatus.replaceAll("_", " ")}
                 </p>
                 {quoteSource && (
                   <p className="text-xs text-navy/70 mt-1">
                     Source: {quoteSource}
                   </p>
                 )}
               </div>
             )}

             <ApprovalPanel
               requestId={request.id}
               costHigh={request.estimated_cost_high ?? 0}
               costLow={request.estimated_cost_low ?? 0}
               isApproved={request.landlord_approved}
               status={request.status}
               autoApprovedReason={autoApprovedReason}
             />

             <WorkOrderView workOrder={request.work_order} />

             <section>
               <h2 className="text-xl font-display font-bold uppercase tracking-wide text-navy mb-4 border-b-2 border-navy/20 pb-2">Tenant Voice Update</h2>
               {request.voice_update_url ? (
                 <VoiceUpdate
                   audioUrl={request.voice_update_url}
                   transcript={request.voice_transcript}
                   languageLabel={voiceLanguageLabel}
                   originalTranscript={originalVoiceTranscript}
                   originalLanguageLabel={originalVoiceTranscript ? "English (UK)" : null}
                 />
               ) : (
                 <div className="brutal-card p-6 text-center text-navy/50 font-bold tracking-widest uppercase border-dashed">Generating Audio Protocol...</div>
               )}
             </section>
          </div>
        </div>
      </div>
    );
  }

  const supabase = createAdminClient();
  const { data: request, error } = await supabase
    .from("maintenance_requests")
    .select(`*, units ( unit_label, properties ( address, city ) )`)
    .eq("id", id)
    .single();

  if (error || !request) {
    return (
      <div className="max-w-7xl mx-auto p-8 text-center brutal-card mt-10">
        <h1 className="text-2xl font-bold font-display uppercase tracking-widest text-danger">Request Not Found</h1>
        <Link href="/dashboard" className="text-navy underline mt-4 inline-block font-bold">Return to Dashboard</Link>
      </div>
    );
  }

  const diagnosis = request.diagnosis as any;
  const isEmergency = diagnosis?.urgency?.toLowerCase() === "emergency";
  const propertyAddress = request.units?.properties?.address || "Unknown Property";
  const quoteStatus =
    typeof diagnosis?.quote_status === "string" ? diagnosis.quote_status : null;
  const quoteSource = Array.isArray(diagnosis?.quote_source)
    ? (diagnosis.quote_source as string[]).join(", ")
    : null;
  const voiceLanguageLabel =
    typeof diagnosis?.voice_transcript_language_label === "string"
      ? diagnosis.voice_transcript_language_label
      : typeof diagnosis?.preferred_language_label === "string"
        ? diagnosis.preferred_language_label
        : null;
  const originalVoiceTranscript =
    typeof diagnosis?.voice_transcript_original === "string"
      ? diagnosis.voice_transcript_original
      : null;

  // Derive auto approval reason
  let autoApprovedReason = "";
  if (request.status === "dispatched" || request.landlord_approved) {
    if (isEmergency) autoApprovedReason = "Emergency Protocol";
    else if (request.estimated_cost_high <= 500) autoApprovedReason = "Cost below £500 threshold";
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-8 pb-32">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-navy/70 hover:text-navy transition-colors">
        <ArrowLeft size={16} /> Back to Command Center
      </Link>

      <div className={`brutal-card p-6 bg-white border-b-8 ${isEmergency ? 'border-b-danger' : 'border-b-navy'}`}>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-display font-bold uppercase tracking-tight text-navy">
               Maintenance Request
            </h1>
            <p className="text-navy/70 font-bold mt-1 text-sm uppercase tracking-widest border-s-4 border-accent pl-3">
               ID: {request.id.split("-")[0]}
            </p>
          </div>
          <div className="text-right">
             <span className="px-3 py-1 bg-navy text-white text-xs font-bold uppercase tracking-widest shadow-[2px_2px_0_0_var(--accent)]">
                Status: {request.status}
             </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Left Column (60%) */}
        <div className="w-full lg:w-3/5 space-y-8">
           
          {/* Photo */}
          <div className="aspect-video brutal-card overflow-hidden bg-gray-100 flex items-center justify-center p-2 relative">
             {request.photo_url ? (
               // eslint-disable-next-line @next/next/no-img-element
               <img src={request.photo_url} alt="Submitted issue" className="w-full h-full object-cover border-2 border-navy" />
             ) : (
               <span className="font-bold uppercase tracking-widest text-navy/30">No Photo</span>
             )}
             {isEmergency && (
               <div className="absolute top-4 right-4 bg-danger text-white px-3 py-1 font-display font-bold uppercase shadow-[4px_4px_0_0_rgba(10,20,40,0.2)] animate-pulse">
                 EMERGENCY
               </div>
             )}
          </div>

          <section>
            <h2 className="text-xl font-display font-bold uppercase tracking-wide text-navy mb-4 border-b-2 border-navy/20 pb-2">AI Diagnosis</h2>
            {request.diagnosis ? (
              <DiagnosisCard diagnosis={request.diagnosis as any} status={request.status} />
            ) : (
              <div className="brutal-card p-6 text-center text-navy/50 font-bold tracking-widest uppercase">Pending Diagnosis...</div>
            )}
          </section>

          <section>
            <h2 className="text-xl font-display font-bold uppercase tracking-wide text-navy mb-4 border-b-2 border-navy/20 pb-2">Contractor Matches</h2>
            {request.contractors ? (
              <ContractorMap 
                contractors={request.contractors as any} 
                propertyAddress={propertyAddress}
                requestId={request.id}
                assignedContractor={request.assigned_contractor}

              />
            ) : (
              <div className="brutal-card p-6 text-center text-navy/50 font-bold tracking-widest uppercase">Searching Network...</div>
            )}
          </section>

          <section>
            <h2 className="text-xl font-display font-bold uppercase tracking-wide text-navy mb-4 border-b-2 border-navy/20 pb-2">Vetting Results</h2>
            {request.vetting && (request.vetting as any).length > 0 ? (
              <VettingCard contractors={request.vetting as any} />
            ) : (
              <div className="brutal-card p-6 text-center text-navy/50 font-bold tracking-widest uppercase">Background Checks Pending...</div>
            )}
          </section>

        </div>

        {/* Right Column (40%) */}
        <div className="w-full lg:w-2/5 space-y-8 sticky top-8">
           {quoteStatus && (
             <div className="brutal-card p-4 bg-[#F4F5F7] border-2 border-navy">
               <p className="text-xs font-bold uppercase tracking-widest text-navy/70">
                 Quote Request Status
               </p>
               <p className="font-display font-bold text-navy text-lg">
                 {quoteStatus.replaceAll("_", " ")}
               </p>
               {quoteSource && (
                 <p className="text-xs text-navy/70 mt-1">
                   Source: {quoteSource}
                 </p>
               )}
             </div>
           )}
           
           <ApprovalPanel 
             requestId={request.id}
             costHigh={request.estimated_cost_high}
             costLow={request.estimated_cost_low}
             isApproved={request.landlord_approved}
             status={request.status}
             autoApprovedReason={autoApprovedReason}
           />

           <WorkOrderView workOrder={request.work_order} />

           <section>
             <h2 className="text-xl font-display font-bold uppercase tracking-wide text-navy mb-4 border-b-2 border-navy/20 pb-2">Tenant Voice Update</h2>
             {request.voice_update_url ? (
               <VoiceUpdate 
                 audioUrl={request.voice_update_url}
                 transcript={request.voice_transcript}
                 languageLabel={voiceLanguageLabel}
                 originalTranscript={originalVoiceTranscript}
                 originalLanguageLabel={originalVoiceTranscript ? "English (UK)" : null}
               />
             ) : (
               <div className="brutal-card p-6 text-center text-navy/50 font-bold tracking-widest uppercase border-dashed">Generating Audio Protocol...</div>
             )}
           </section>

        </div>
      </div>
    </div>
  );
}
