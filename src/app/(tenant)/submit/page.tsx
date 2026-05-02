"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import PhotoCapture from "@/components/PhotoCapture";
import {
  AlertCircle,
  FileText,
  Loader2,
  Mic,
  MicOff,
  Send,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  normalizeRequestLanguage,
  REQUEST_LANGUAGE_OPTIONS,
} from "@/lib/request-language";

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = {
  error: string;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;

  const speechWindow = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };

  return (
    speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null
  );
}

function appendTranscript(current: string, addition: string) {
  const trimmedAddition = addition.trim();
  if (!trimmedAddition) return current;

  const withSpacing =
    current.trim().length > 0
      ? `${current.trimEnd()} ${trimmedAddition}`
      : trimmedAddition;

  return withSpacing.slice(0, 500);
}

export default function SubmitRequestPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const [units, setUnits] = useState<{ id: string; unit_label: string }[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("en-GB");
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setSelectedLanguage(normalizeRequestLanguage(navigator.language).code);
  }, []);

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = selectedLanguage;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceError(null);
      setInterimTranscript("");
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
    };

    recognition.onerror = (event) => {
      const messageMap: Record<string, string> = {
        "audio-capture": "No microphone was detected. Check your device audio input and try again.",
        "not-allowed": "Microphone access was blocked. Allow microphone permission in your browser and try again.",
        "service-not-allowed": "This browser blocked speech recognition for this page.",
        network: "Speech recognition could not reach the browser service. Check your connection and try again.",
        "no-speech": "No speech was detected. Try speaking a little closer to the microphone.",
      };

      setVoiceError(
        messageMap[event.error] ||
          "Voice input stopped unexpectedly. Try the microphone button again."
      );
      setIsListening(false);
      setInterimTranscript("");
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let nextInterim = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript?.trim();
        if (!transcript) continue;

        if (result.isFinal) {
          finalText = `${finalText} ${transcript}`.trim();
        } else {
          nextInterim = `${nextInterim} ${transcript}`.trim();
        }
      }

      if (finalText) {
        setDescription((current) => appendTranscript(current, finalText));
      }

      setInterimTranscript(nextInterim);
    };

    recognitionRef.current = recognition;
    setSpeechSupported(true);

    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [selectedLanguage]);

  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = selectedLanguage;
    }
  }, [selectedLanguage]);

  useEffect(() => {
    async function fetchUnits() {
      if (!user?.id) return;

      const response = await fetch("/api/units", { method: "GET" });
      const payload = await response.json();
      if (!response.ok) {
        setError(
          payload.details
            ? `${payload.error || "Failed to fetch units"}: ${payload.details}`
            : payload.error || "Failed to fetch units"
        );
        setUnits([]);
        setSelectedUnit("");
        return;
      }

      const fetchedUnits = payload.units as { id: string; unit_label: string }[];
      if (fetchedUnits && fetchedUnits.length > 0) {
        setUnits(fetchedUnits);
        setSelectedUnit(fetchedUnits[0].id);
      } else {
        setUnits([]);
        setSelectedUnit("");
      }
    }
    if (isLoaded) fetchUnits();
  }, [user?.id, isLoaded]);

  const startVoiceInput = () => {
    if (!recognitionRef.current) {
      setVoiceError("Voice input is not available in this browser.");
      return;
    }

    setVoiceError(null);
    setInterimTranscript("");

    try {
      recognitionRef.current.start();
    } catch {
      setVoiceError("Voice input is already starting. Try again in a moment.");
    }
  };

  const stopVoiceInput = () => {
    recognitionRef.current?.stop();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo || !user?.id || !selectedUnit) return;

    if (isListening) {
      stopVoiceInput();
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Send multipart form to the backend orchestrator route.
      // Backend handles storage upload + DB insert + AI pipeline trigger.
      const formData = new FormData();
      formData.append("photo", photo);
      formData.append("unit_id", selectedUnit);
      formData.append("tenant_id", user.id);
      formData.append("description", description);
      formData.append("preferred_language", selectedLanguage);

      const response = await fetch("/api/requests", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to submit request to API.");
      }

      const result = await response.json();
      
      // Redirect to detail page where realtime updates render diagnosis/contractors.
      router.push(`/requests/${result.requestId}`);

    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during submission.");
      setIsSubmitting(false);
    }
  };

  if (!isLoaded) return <div className="p-8 text-navy font-display font-bold">LOADING...</div>;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-xl mx-auto space-y-8"
    >
      <div>
        <h1 className="text-3xl font-display font-bold uppercase tracking-tight text-navy mb-2">
          New Maintenance Request
        </h1>
        <p className="text-navy/70 border-l-4 border-accent pl-4 py-1 font-bold">
          Submit an issue with a photo to get an instant AI diagnosis and contractor recommendation.
        </p>
      </div>

      {error && (
        <div className="bg-[#FEF9E7] border-2 border-warning p-4 hazard-border">
          <div className="bg-white p-3 border-2 border-navy flex items-start gap-3">
            <AlertCircle className="text-warning shrink-0" />
            <span className="font-bold text-navy text-sm uppercase">{error}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="block text-sm uppercase font-bold text-navy tracking-widest">
            1. Capture Issue <span className="text-accent">*</span>
          </label>
          <PhotoCapture onCapture={(file) => setPhoto(file)} />
        </div>

        <div className="brutal-card p-6 space-y-6">
          <div className="space-y-2">
            <label className="block text-sm uppercase font-bold text-navy tracking-widest">
              2. Select Unit <span className="text-accent">*</span>
            </label>
            <select 
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="w-full bg-background border-2 border-navy p-3 font-bold text-navy focus:outline-none focus:border-accent shadow-[2px_2px_0px_0px_var(--navy)]"
              disabled={units.length === 0}
            >
              <option value="" disabled>Select your unit...</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.unit_label}</option>
              ))}
            </select>
            {units.length === 0 && !error && (
              <p className="text-xs text-danger font-bold uppercase tracking-wide">
                No unit linked to your account yet. Ask the admin to seed `units.tenant_id`
                with your Clerk user ID.
                {user?.id && (
                  <>
                    <br />
                    Current Clerk user ID: {user.id}
                  </>
                )}
              </p>
            )}
          </div>

          <div className="space-y-2 cursor-text">
            <div className="flex justify-between items-end">
              <label className="block text-sm uppercase font-bold text-navy tracking-widest">
                3. Description <span className="text-navy/50 tracking-normal capitalize font-normal">(Optional)</span>
              </label>
              <span className={`text-xs font-bold ${description.length > 500 ? "text-danger" : "text-navy/50"}`}>
                {description.length}/500
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={isListening ? stopVoiceInput : startVoiceInput}
                disabled={!speechSupported || isSubmitting}
                className={`inline-flex items-center gap-2 border-2 px-3 py-2 text-xs font-bold uppercase tracking-widest shadow-[2px_2px_0px_0px_var(--navy)] transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                  isListening
                    ? "border-danger bg-red-50 text-danger"
                    : "border-navy bg-white text-navy hover:border-accent hover:text-accent"
                }`}
              >
                {isListening ? <MicOff size={14} /> : <Mic size={14} />}
                {isListening ? "Stop Voice Input" : "Use Voice Input"}
              </button>
              <span className="text-xs font-bold text-navy/60">
                {speechSupported
                  ? isListening
                    ? "Listening now. Speak naturally and pause when you're done."
                    : "Dictate your description with your microphone."
                  : "Voice input is only available in supported browsers such as Chrome, Edge, or Safari."}
              </span>
            </div>
            <div className="relative border-2 border-navy shadow-[2px_2px_0px_0px_var(--navy)] bg-white focus-within:border-accent focus-within:shadow-[2px_2px_0px_0px_var(--accent)] transition-all">
              <div className="absolute top-3 left-3 text-navy/30">
                <FileText size={18} />
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                placeholder="Describe the issue in your own words..."
                className="w-full min-h-[120px] p-3 pl-10 bg-transparent resize-y focus:outline-none text-navy"
              />
            </div>
            {(interimTranscript || voiceError) && (
              <div className="space-y-2">
                {interimTranscript && (
                  <p className="text-xs font-bold text-accent">
                    Live transcript: {interimTranscript}
                  </p>
                )}
                {voiceError && (
                  <p className="text-xs font-bold text-danger">
                    {voiceError}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm uppercase font-bold text-navy tracking-widest">
              4. Request Language
            </label>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="w-full bg-background border-2 border-navy p-3 font-bold text-navy focus:outline-none focus:border-accent shadow-[2px_2px_0px_0px_var(--navy)]"
              disabled={isSubmitting}
            >
              {REQUEST_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs font-bold text-navy/60">
              Voice input listens in this language, and FixFlow will translate the generated voice update before playback when possible.
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={!photo || isSubmitting || !selectedUnit}
          className="w-full brutal-btn-primary py-4 flex items-center justify-center gap-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              PROCESSING...
            </>
          ) : (
            <>
              <Send />
              SUBMIT REPORT
            </>
          )}
        </button>
      </form>
    </motion.div>
  );
}
