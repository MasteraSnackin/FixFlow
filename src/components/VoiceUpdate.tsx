"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, Download, Mic } from "lucide-react";

interface VoiceUpdateProps {
  audioUrl?: string | null;
  transcript?: string | null;
  languageLabel?: string | null;
  originalTranscript?: string | null;
  originalLanguageLabel?: string | null;
}

export default function VoiceUpdate({
  audioUrl,
  transcript,
  languageLabel,
  originalTranscript,
  originalLanguageLabel,
}: VoiceUpdateProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateProgress);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioUrl]);

  const togglePlay = async () => {
    if (!audioRef.current) return;
    const audio = audioRef.current;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    try {
      setPlaybackError(null);
      await audio.play();
      setIsPlaying(true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Playback is not supported for this audio source in your browser.";
      setPlaybackError(message);
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (audio && audio.duration) {
      const time = (Number(e.target.value) / 100) * audio.duration;
      audio.currentTime = time;
      setProgress(Number(e.target.value));
    }
  };

  if (!audioUrl) {
    return (
      <div className="brutal-card p-8 border-dashed border-gray-400 flex flex-col items-center justify-center gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-navy/10 flex items-center justify-center relative">
          <Mic size={24} className="text-navy/50" />
          <div className="absolute inset-0 border-2 border-navy border-dashed rounded-full animate-[spin_4s_linear_infinite] opacity-30"></div>
        </div>
        <div>
          <h3 className="font-display font-bold uppercase tracking-widest text-navy mb-1">Generating Voice Update...</h3>
          <p className="text-sm text-navy/60 font-medium">The FixFlow AI agent is synthesizing an audio brief of your maintenance status.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="brutal-card bg-[#F4F5F7] p-6 lg:p-8">
      {/* Audio Element (Hidden) */}
      <audio ref={audioRef} src={audioUrl} />

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Custom Player Controls */}
        <div className="w-full lg:w-1/3 flex flex-col gap-6 p-6 bg-white border-2 border-navy shadow-[4px_4px_0_0_var(--navy)]">
          <div className="flex items-center gap-3 mb-2">
            <Volume2 size={20} className="text-accent" />
            <span className="font-display font-bold uppercase tracking-widest text-navy text-sm">
              Briefing Audio
            </span>
          </div>
          
          <button 
            onClick={togglePlay}
            className="w-20 h-20 rounded-full border-4 border-navy bg-accent text-white flex items-center justify-center hover:bg-navy hover:text-white transition-colors shadow-[4px_4px_0_0_var(--navy)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none mx-auto outline-none"
          >
            {isPlaying ? <Pause size={32} className="ml-1" /> : <Play size={32} className="ml-2" />}
          </button>
          
          <div className="w-full relative py-2">
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={progress || 0} 
              onChange={handleSeek}
              className="w-full appearance-none h-2 bg-gray-200 border-2 border-navy"
            />
            {/* Custom Progress Fill */}
            <div 
              className="absolute top-2 left-0 h-2 bg-navy border-y-2 border-l-2 border-navy pointer-events-none"
              style={{ width: `${progress}%` }}
            ></div>
          </div>

          <a 
            href={audioUrl} 
            download="FixFlow_Status_Update.mp3"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-navy hover:text-accent mt-4"
          >
            <Download size={14} /> Download Local Copy
          </a>
          {playbackError && (
            <p className="text-xs font-bold text-danger text-center">
              Could not play audio inline. Open or download the audio file instead.
            </p>
          )}
        </div>

        {/* Transcript Area */}
        <div className="w-full lg:w-2/3">
          <h4 className="font-display font-bold text-sm uppercase tracking-widest text-navy mb-4 border-b-2 border-navy pb-2">
            Transcript
            {languageLabel ? ` (${languageLabel})` : ""}
          </h4>
          <div className="space-y-4 font-mono text-sm leading-relaxed text-navy bg-white border-2 border-navy p-4 overflow-y-auto max-h-[260px] custom-scrollbar">
            {transcript ? (
              <p>{transcript}</p>
            ) : (
              <p className="italic opacity-50">Transcript not available for this audio clip.</p>
            )}
            {originalTranscript &&
              transcript &&
              originalTranscript.trim() !== transcript.trim() && (
                <div className="border-t-2 border-dashed border-navy/20 pt-4">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-navy/60 mb-2">
                    Original
                    {originalLanguageLabel ? ` (${originalLanguageLabel})` : ""}
                  </p>
                  <p>{originalTranscript}</p>
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
