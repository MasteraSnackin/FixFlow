"use client";

import { useState } from "react";
import { CheckCircle, XCircle, MessageSquareQuote, Loader2, Clock } from "lucide-react";
import {
  isBrowserDemoRequestId,
  updateBrowserDemoRequest,
} from "@/lib/browser-demo-store";

interface ContractorQuoteProps {
  requestId: string;
  quoteText: string | null;
  quoteConfidence: number | null;
  quoteReceivedAt: string | null;
  quoteStatus: string | null;
  quoteSource?: string[] | null;
  status: string;
  landlordApproved: boolean | null;
  onRequestUpdated?: (request: Record<string, unknown>) => void;
}

export default function ContractorQuote({
  requestId,
  quoteText,
  quoteConfidence,
  quoteReceivedAt,
  quoteStatus,
  quoteSource,
  status,
  landlordApproved,
  onRequestUpdated,
}: ContractorQuoteProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localStatus, setLocalStatus] = useState<"idle" | "accepted" | "declined">("idle");
  const [actionError, setActionError] = useState<string | null>(null);

  const isAlreadyApproved =
    landlordApproved === true || status === "dispatched" || localStatus === "accepted";
  const isDeclined = localStatus === "declined";
  const normalizedQuoteSource = quoteSource ?? [];
  const isAiEstimate =
    normalizedQuoteSource.includes("gemini_estimate") ||
    quoteStatus === "estimated";
  const itemLabel = isAiEstimate ? "AI estimate" : "Contractor said";
  const headerLabel = isAiEstimate
    ? "AI QUOTE ESTIMATE READY"
    : "CONTRACTOR QUOTE RECEIVED";
  const acceptedLabel = isAiEstimate ? "ESTIMATE ACCEPTED" : "QUOTE ACCEPTED";
  const declinedLabel = isAiEstimate ? "ESTIMATE DECLINED" : "QUOTE DECLINED";
  const actionLabel = isAiEstimate
    ? "ACCEPT ESTIMATE & DISPATCH"
    : "ACCEPT QUOTE & DISPATCH";

  const handleAccept = async () => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      if (isBrowserDemoRequestId(requestId)) {
        const updated = updateBrowserDemoRequest(requestId, {
          landlord_approved: true,
          status: "dispatched",
        });

        if (!updated) {
          throw new Error("Demo request could not be updated.");
        }

        setLocalStatus("accepted");
        onRequestUpdated?.(updated as Record<string, unknown>);
        return;
      }

      const response = await fetch(`/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landlord_approved: true,
          status: "dispatched",
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Failed to accept quote."
        );
      }

      setLocalStatus("accepted");
      if (payload.request && typeof payload.request === "object") {
        onRequestUpdated?.(payload.request as Record<string, unknown>);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to accept quote.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecline = async () => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      if (isBrowserDemoRequestId(requestId)) {
        const updated = updateBrowserDemoRequest(requestId, {
          diagnosis_patch: { quote_status: "declined" },
        });

        if (!updated) {
          throw new Error("Demo request could not be updated.");
        }

        setLocalStatus("declined");
        onRequestUpdated?.(updated as Record<string, unknown>);
        return;
      }

      const response = await fetch(`/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagnosis_patch: { quote_status: "declined" },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Failed to decline quote."
        );
      }

      setLocalStatus("declined");
      if (payload.request && typeof payload.request === "object") {
        onRequestUpdated?.(payload.request as Record<string, unknown>);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to decline quote.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayedQuoteText =
    quoteText ||
    (quoteStatus === "received"
      ? "Contractor quote received."
      : null);

  if (quoteStatus === "declined" || isDeclined) {
    return (
      <div className="brutal-card p-6 bg-red-50 border-danger border-l-8 border-l-danger">
        <div className="flex items-center gap-3 mb-3">
          <XCircle className="text-danger" size={24} />
          <h3 className="text-xl font-display font-bold text-danger">{declinedLabel}</h3>
        </div>
        {displayedQuoteText && (
          <div className="bg-white p-4 border-2 border-navy/10 mb-2">
            <p className="text-sm font-bold uppercase tracking-widest text-navy/50 mb-1">{itemLabel}:</p>
            <p className="text-navy font-bold text-lg italic">&quot;{displayedQuoteText}&quot;</p>
          </div>
        )}
      </div>
    );
  }

  if (isAlreadyApproved) {
    return (
      <div className="brutal-card p-6 bg-successbg border-successborder border-l-8 border-l-successborder">
        <div className="flex items-center gap-3 mb-3">
          <CheckCircle className="text-successborder" size={24} />
          <h3 className="text-xl font-display font-bold text-success">{acceptedLabel}</h3>
        </div>
        {displayedQuoteText && (
          <div className="bg-white p-4 border-2 border-navy/10 mb-2">
            <p className="text-sm font-bold uppercase tracking-widest text-navy/50 mb-1">{itemLabel}:</p>
            <p className="text-navy font-bold text-lg italic">&quot;{displayedQuoteText}&quot;</p>
          </div>
        )}
        <p className="text-sm text-navy/70 font-medium">Work has been dispatched.</p>
      </div>
    );
  }

  if (!quoteText && quoteStatus !== "received") {
    if (quoteStatus === "requested" || quoteStatus === "mock_requested") {
      return (
        <div className="brutal-card p-6 bg-gray-50 border-gray-300 border-l-8 border-l-accent">
          <div className="flex items-center gap-3 mb-2">
            <Clock size={20} className="text-accent animate-pulse" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-navy">
              Waiting for Contractor Response...
            </h3>
          </div>
          <p className="text-sm text-navy/70 font-medium">
            We&apos;ve reached out to the contractor (call or email). Their quote will show here as soon as we capture it.
          </p>
        </div>
      );
    }

    if (quoteStatus === "requested_no_capture") {
      return (
        <div className="brutal-card p-6 bg-warningbg border-warningborder border-l-8 border-l-warningborder">
          <div className="flex items-center gap-3 mb-2">
            <Clock size={20} className="text-warningborder" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-warningborder">
              Call Worked, Speech Capture Is Off
            </h3>
          </div>
          <p className="text-sm text-navy/80 font-medium">
            Twilio reached the contractor, but this environment cannot receive the speech callback yet.
            Set APP_URL to a public HTTPS URL (ngrok or deployment) so spoken quotes can appear here.
          </p>
        </div>
      );
    }

    return null;
  }

  const receivedTime = quoteReceivedAt
    ? new Date(quoteReceivedAt).toLocaleString()
    : null;

  return (
      <div className="brutal-card p-6 bg-warningbg border-warningborder border-l-8 border-l-accent">
        <h3 className="text-sm font-bold uppercase tracking-widest text-navy mb-4 flex items-center gap-2">
        <MessageSquareQuote size={16} className="text-accent" /> {headerLabel}
      </h3>

      <div className="bg-white p-4 border-2 border-navy/10 mb-4">
        <p className="text-sm font-bold uppercase tracking-widest text-navy/50 mb-1">{itemLabel}:</p>
        <p className="text-navy font-bold text-lg italic">&quot;{displayedQuoteText}&quot;</p>
        {quoteConfidence != null && (
          <p className="text-xs text-navy/40 mt-2">
            Speech confidence: {Math.round(quoteConfidence * 100)}%
          </p>
        )}
        {receivedTime && (
          <p className="text-xs text-navy/40 mt-1">Received: {receivedTime}</p>
        )}
        {isAiEstimate && (
          <p className="text-xs text-navy/60 mt-2">
            Generated from the live FixFlow AI provider and search tools. This is a grounded estimate, not a confirmed spoken callback from the contractor.
          </p>
        )}
      </div>

      {actionError && (
        <div className="bg-red-50 border-2 border-danger text-danger p-3 text-sm font-bold">
          {actionError}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          onClick={handleAccept}
          disabled={isSubmitting}
          className="brutal-btn-primary w-full py-4 bg-success border-success flex items-center justify-center gap-2 hover:bg-success/90 text-white font-bold uppercase tracking-widest"
        >
          {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
          {actionLabel}
        </button>

        <button
          onClick={handleDecline}
          disabled={isSubmitting}
          className="brutal-btn-secondary w-full py-3 bg-white border-2 border-danger text-danger flex items-center justify-center gap-2 hover:bg-dangerbg shadow-[2px_2px_0_0_var(--danger)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase tracking-widest"
        >
          <XCircle size={18} />
          DECLINE QUOTE
        </button>
      </div>
    </div>
  );
}
