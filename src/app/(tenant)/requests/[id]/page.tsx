"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import DiagnosisCard from "@/components/DiagnosisCard";
import ContractorMap from "@/components/ContractorMap";
import VettingCard from "@/components/VettingCard";
import ContractorQuote from "@/components/ContractorQuote";
import VoiceUpdate from "@/components/VoiceUpdate";
import { motion } from "framer-motion";
import PipelineStatus from "@/components/PipelineStatus";
import {
  getBrowserDemoRequest,
  isBrowserDemoRequestId,
} from "@/lib/browser-demo-store";

export default function RequestDetailPage() {
  const { id } = useParams() as { id: string };
  const [request, setRequest] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRequest = useCallback(async () => {
    if (isBrowserDemoRequestId(id)) {
      const demoRequest = getBrowserDemoRequest(id);
      if (!demoRequest) {
        setError("not_found");
        setRequest(null);
        return false;
      }

      setError(null);
      setRequest(demoRequest as Record<string, unknown>);
      return true;
    }

    const res = await fetch(`/api/requests/${id}`, { method: "GET" });
    const payload = await res.json().catch(() => ({}));

    if (res.status === 401) {
      setError("sign_in");
      setRequest(null);
      return false;
    }
    if (res.status === 403 || res.status === 404) {
      const demoRequest = getBrowserDemoRequest(id);
      if (demoRequest) {
        setError(null);
        setRequest(demoRequest as Record<string, unknown>);
        return true;
      }
      setError("not_found");
      setRequest(null);
      return false;
    }
    if (!res.ok) {
      const demoRequest = getBrowserDemoRequest(id);
      if (demoRequest) {
        setError(null);
        setRequest(demoRequest as Record<string, unknown>);
        return true;
      }
      setError("unknown");
      setRequest(null);
      return false;
    }

    setError(null);
    setRequest(payload.request as Record<string, unknown>);
    return true;
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await fetchRequest();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchRequest]);

  // Poll while pipeline may still be writing (Clerk + no Supabase JWT => Realtime RLS won't fire for anon client)
  useEffect(() => {
    if (!request || !id) return;

    const status = String(request.status ?? "");
    const hasContractors = request.contractors != null;
    const hasVetting =
      Array.isArray(request.vetting) && (request.vetting as unknown[]).length > 0;
    const diag = request.diagnosis as Record<string, unknown> | null | undefined;
    const pipelineFailed =
      typeof diag?.pipeline_error === "string" && diag.pipeline_error.length > 0;
    const hasQuote = typeof diag?.contractor_quote === "string";
    const quoteStatus = typeof diag?.quote_status === "string" ? diag.quote_status : null;
    const notifyInitiated =
      request.voice_update_url != null ||
      quoteStatus != null ||
      hasQuote;
    const awaitingContractorQuote =
      (quoteStatus === "requested" || quoteStatus === "mock_requested") &&
      !hasQuote &&
      status !== "dispatched" &&
      status !== "resolved";

    const stillUpdating =
      !pipelineFailed &&
      (status === "submitted" ||
        (!hasContractors && status !== "error") ||
        (hasContractors && !hasVetting && status !== "error") ||
        (hasVetting &&
          !notifyInitiated &&
          status !== "error" &&
          status !== "dispatched" &&
          status !== "resolved") ||
        awaitingContractorQuote);

    if (!stillUpdating) return;

    const t = setInterval(() => {
      void fetchRequest();
    }, 2500);

    return () => clearInterval(t);
  }, [id, request, fetchRequest]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto flex items-center justify-center min-h-[50vh]">
        <div className="text-xl font-display font-bold text-navy tracking-widest uppercase animate-pulse">
          Loading Request Data...
        </div>
      </div>
    );
  }

  if (error === "sign_in") {
    return (
      <div className="max-w-4xl mx-auto p-8 brutal-card text-center mt-10">
        <h1 className="text-2xl font-bold text-danger mb-2 font-display uppercase tracking-widest">
          Sign in required
        </h1>
        <p className="text-navy">Please sign in to view this request.</p>
      </div>
    );
  }

  if (!request || error === "not_found") {
    return (
      <div className="max-w-4xl mx-auto p-8 brutal-card text-center mt-10">
        <h1 className="text-2xl font-bold text-danger mb-2 font-display uppercase tracking-widest">
          Error
        </h1>
        <p className="text-navy">
          Request not found or you do not have permission to view it.
        </p>
      </div>
    );
  }

  const units = request.units as
    | { properties?: { address?: string } }
    | undefined;
  const propertyAddress =
    units?.properties?.address || "Address not available";
  const rawDiagnosis = request.diagnosis as Record<string, unknown> | null;
  const pipelineError =
    typeof rawDiagnosis?.pipeline_error === "string"
      ? rawDiagnosis.pipeline_error
      : null;
  const diagnosisForCard =
    rawDiagnosis != null &&
    typeof rawDiagnosis.category === "string" &&
    typeof rawDiagnosis.severity === "number"
      ? (rawDiagnosis as {
          category: string;
          severity: number;
          urgency: string;
          description: string;
          affected_system: string;
          recommended_action: string;
          tenant_safety_note: string | null;
          confidence: number;
        })
      : null;
  const isEmergency =
    diagnosisForCard?.urgency?.toLowerCase() === "emergency";
  const voiceLanguageLabel =
    typeof rawDiagnosis?.voice_transcript_language_label === "string"
      ? rawDiagnosis.voice_transcript_language_label
      : typeof rawDiagnosis?.preferred_language_label === "string"
        ? rawDiagnosis.preferred_language_label
        : null;
  const originalVoiceTranscript =
    typeof rawDiagnosis?.voice_transcript_original === "string"
      ? rawDiagnosis.voice_transcript_original
      : null;

  return (
    <div className={`max-w-6xl mx-auto space-y-12 pb-20 ${isEmergency ? 'border-t-4 border-danger pt-4' : ''}`}>
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <div className="w-full lg:w-1/3 shrink-0">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="brutal-card p-2 bg-white sticky top-8 z-10"
          >
            <div className="aspect-[3/4] border-2 border-navy overflow-hidden bg-gray-100 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={String(request.photo_url)}
                alt="Maintenance Issue"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 right-2 bg-white font-bold text-navy text-xs px-2 py-1 border-2 border-navy shadow-[2px_2px_0_0_var(--navy)]">
                ID: {id.slice(0, 8)}
              </div>
            </div>

            {request.description != null &&
              String(request.description).trim() !== "" && (
                <div className="mt-4 p-4 bg-[#F4F5F7] border-2 border-navy shadow-[4px_4px_0_0_rgba(10,20,40,0.1)] text-sm font-medium text-navy italic">
                  &quot;{String(request.description)}&quot;
                </div>
              )}
          </motion.div>
        </div>

        <div className="w-full lg:w-2/3 space-y-12">
          <div className="w-full">
            <PipelineStatus request={request} />
          </div>
          {pipelineError && (
            <div className="brutal-card border-danger bg-red-50 p-4 text-danger font-medium text-sm">
              <p className="font-display font-bold uppercase tracking-wide mb-1">
                Pipeline error
              </p>
              <p className="text-navy">{pipelineError}</p>
            </div>
          )}
          <section>
            <h2 className="text-2xl font-display font-bold uppercase tracking-wide text-navy mb-6 flex items-center gap-4">
              <span className="bg-navy text-white w-10 h-10 flex items-center justify-center text-lg shadow-[2px_2px_0_0_var(--accent)]">
                1
              </span>
              AI Diagnosis
            </h2>
            {!diagnosisForCard ? (
              <div className="brutal-card h-[300px] bg-gray-100 animate-pulse border-dashed border-gray-300 flex items-center justify-center">
                <span className="text-navy/50 font-bold uppercase tracking-widest text-sm">Analyzing Photo...</span>
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <DiagnosisCard
                  diagnosis={
                    request.diagnosis as {
                      category: string;
                      severity: number;
                      urgency: string;
                      description: string;
                      affected_system: string;
                      recommended_action: string;
                      tenant_safety_note: string | null;
                      confidence: number;
                    } | null
                  }
                  status={String(request.status ?? "")}
                />
              </div>
            )}
          </section>

          <section>
            <h2 className="text-2xl font-display font-bold uppercase tracking-wide text-navy mb-6 flex items-center gap-4">
              <span className="bg-navy text-white w-10 h-10 flex items-center justify-center text-lg shadow-[2px_2px_0_0_var(--accent)]">
                2
              </span>
              Recommended Contractors
            </h2>

            {!request.contractors ? (
              pipelineError ? (
                <div className="brutal-card p-8 border-dashed border-gray-400 opacity-60 flex justify-center items-center h-48">
                  <span className="text-navy font-bold uppercase tracking-widest text-sm text-center">
                    Contractors were not loaded because the pipeline stopped
                    early.
                    <br />
                    <span className="text-xs font-normal opacity-70 mt-2 block">
                      See the error message above.
                    </span>
                  </span>
                </div>
              ) : (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="brutal-card h-32 bg-gray-100 animate-pulse border-dashed border-gray-300"></div>
                  ))}
                </div>
              )
            ) : (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <ContractorMap
                  contractors={request.contractors as never[]}
                  propertyAddress={propertyAddress}
                  requestId={String(request.id)}
                  assignedContractor={request.assigned_contractor}
                  onAssigned={(c) =>
                    setRequest((prev) =>
                      prev
                        ? { ...prev, assigned_contractor: c }
                        : prev
                    )
                  }
                />
              </div>
            )}
          </section>

          {/* Section 3: Vetting Results */}
          <section>
            <h2 className="text-2xl font-display font-bold uppercase tracking-wide text-navy mb-6 flex items-center gap-4">
              <span className="bg-navy text-white w-10 h-10 flex items-center justify-center text-lg shadow-[2px_2px_0_0_var(--accent)]">
                3
              </span>
              Contractor Vetting Results
            </h2>
            {!request.vetting || (request.vetting as any[]).length === 0 ? (
              <div className="brutal-card h-40 bg-gray-100 animate-pulse border-dashed border-gray-300 flex flex-col items-center justify-center gap-2">
                <span className="text-navy/50 font-bold uppercase tracking-widest text-sm text-center px-4">Running Background Checks...</span>
                <span className="text-xs text-navy/40 font-medium">Verifying licenses, reviews, and cost estimates</span>
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <VettingCard contractors={request.vetting as any[]} />
              </div>
            )}
          </section>

          {/* Section 4: Contractor quote & approval (from contractor outreach) */}
          {!!(rawDiagnosis?.quote_status || rawDiagnosis?.contractor_quote) && (
            <section>
              <h2 className="text-2xl font-display font-bold uppercase tracking-wide text-navy mb-6 flex items-center gap-4">
                <span className="bg-navy text-white w-10 h-10 flex items-center justify-center text-lg shadow-[2px_2px_0_0_var(--accent)]">
                  4
                </span>
                Contractor Quote
              </h2>
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <ContractorQuote
                  requestId={String(request.id)}
                  quoteText={
                    typeof rawDiagnosis?.contractor_quote === "string"
                      ? rawDiagnosis.contractor_quote
                      : null
                  }
                  quoteConfidence={
                    typeof rawDiagnosis?.contractor_quote_confidence === "number"
                      ? rawDiagnosis.contractor_quote_confidence
                      : null
                  }
                  quoteReceivedAt={
                    typeof rawDiagnosis?.contractor_quote_received_at === "string"
                      ? rawDiagnosis.contractor_quote_received_at
                      : null
                  }
                  quoteStatus={
                    typeof rawDiagnosis?.quote_status === "string"
                      ? rawDiagnosis.quote_status
                      : null
                  }
                  quoteSource={
                    Array.isArray(rawDiagnosis?.quote_source)
                      ? rawDiagnosis.quote_source.filter(
                          (value): value is string => typeof value === "string"
                        )
                      : null
                  }
                  status={String(request.status ?? "")}
                  landlordApproved={
                    request.landlord_approved === true ? true :
                    request.landlord_approved === false ? false : null
                  }
                  onRequestUpdated={(nextRequest) => setRequest(nextRequest)}
                />
              </div>
            </section>
          )}

          <section>
            <h2 className="text-2xl font-display font-bold uppercase tracking-wide text-navy mb-6 flex items-center gap-4">
              <span className="bg-navy text-white w-10 h-10 flex items-center justify-center text-lg shadow-[2px_2px_0_0_var(--accent)]">
                5
              </span>
              Voice Update
            </h2>
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <VoiceUpdate
                audioUrl={
                  typeof request.voice_update_url === "string"
                    ? request.voice_update_url
                    : null
                }
                transcript={
                  typeof request.voice_transcript === "string"
                    ? request.voice_transcript
                    : null
                }
                languageLabel={voiceLanguageLabel}
                originalTranscript={originalVoiceTranscript}
                originalLanguageLabel={originalVoiceTranscript ? "English (UK)" : null}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
