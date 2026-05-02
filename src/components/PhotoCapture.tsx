"use client";

import { useState, useRef, ChangeEvent } from "react";
import { Camera, RefreshCw, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PhotoCaptureProps {
  onCapture: (file: File) => void;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const REENCODE_THRESHOLD_BYTES = 5 * 1024 * 1024;
const MIN_IMAGE_DIMENSION = 200;

export default function PhotoCapture({ onCapture }: PhotoCaptureProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const replacePreview = (nextUrl: string | null) => {
    setPreview((current) => {
      if (current?.startsWith("blob:")) {
        URL.revokeObjectURL(current);
      }
      return nextUrl;
    });
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsProcessing(true);
    let objectUrl: string | null = null;

    try {
      // 1. Validate File Size & Type
      if (file.size > MAX_FILE_BYTES) {
        throw new Error("File exceeds 10MB limit. Please upload a smaller photo.");
      }
      
      const validTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!validTypes.includes(file.type)) {
        throw new Error("Only JPEG, PNG, or WebP formats are supported.");
      }

      // 2. Validate Resolution & Render Preview
      const img = new Image();
      objectUrl = URL.createObjectURL(file);
      const currentObjectUrl = objectUrl;
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Failed to read image."));
        img.src = currentObjectUrl;
      });

      // 3. Upscale very small images and compress large ones.
      let finalFile = file;
      const needsUpscale =
        img.width < MIN_IMAGE_DIMENSION || img.height < MIN_IMAGE_DIMENSION;
      const needsReencode = needsUpscale || file.size > REENCODE_THRESHOLD_BYTES;

      if (needsReencode) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not create canvas context");

        const scale = needsUpscale
          ? Math.max(
              MIN_IMAGE_DIMENSION / img.width,
              MIN_IMAGE_DIMENSION / img.height,
              1
            )
          : 1;

        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", needsUpscale ? 0.92 : 0.8)
        );

        if (!blob) throw new Error("Could not process image.");

        finalFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
          type: "image/jpeg",
        });
      }

      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      replacePreview(URL.createObjectURL(finalFile));
      onCapture(finalFile);

    } catch (err: any) {
      setError(err.message || "An unknown error occurred.");
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      setIsProcessing(false);
      // Reset input so the same file could be selected again if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRetake = () => {
    replacePreview(null);
    setError(null);
  };

  return (
    <div className="w-full flex-shrink-0">
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 bg-[#FEF9E7] border-2 border-warning p-3 flex items-start gap-3 shadow-[4px_4px_0px_0px_var(--warning)]"
        >
          <AlertTriangle className="text-warning shrink-0" size={20} />
          <p className="text-sm font-bold text-navy">{error}</p>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {!preview ? (
          <motion.button
            key="empty-state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="w-full h-64 md:h-80 flex flex-col items-center justify-center gap-4 bg-white border-4 border-dashed border-navy border-opacity-50 hover:border-accent hover:border-solid hover:bg-[#FFF5F0] transition-all duration-200 group relative"
          >
            {isProcessing ? (
              <RefreshCw className="animate-spin text-navy" size={48} />
            ) : (
              <>
                <div className="p-4 bg-navy text-white rounded-full group-hover:bg-accent group-hover:scale-110 transition-transform">
                  <Camera size={32} />
                </div>
                <div className="text-center font-bold text-navy space-y-1">
                  <span className="block text-lg font-display uppercase tracking-wider">Tap to Capture Issue</span>
                  <span className="block text-sm opacity-60">or click to upload file (Max 10MB, small images auto-adjust)</span>
                </div>
              </>
            )}
          </motion.button>
        ) : (
          <motion.div
            key="preview-state"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="brutal-card p-2 relative overflow-hidden group"
          >
            <div className="relative w-full aspect-[4/3] bg-gray-100 border border-navy">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={preview} 
                alt="Maintenance Issue Preview" 
                className="w-full h-full object-cover"
              />
              
              <div className="absolute inset-0 bg-navy/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                <button
                  onClick={handleRetake}
                  className="brutal-btn-secondary px-6 py-3 flex items-center gap-2 text-sm"
                >
                  <RefreshCw size={16} />
                  Retake Photo
                </button>
              </div>
            </div>
            
            <div className="absolute top-4 left-4 right-4 flex justify-between items-center pointer-events-none">
              <span className="bg-success text-white px-3 py-1 font-bold text-xs border-2 border-navy uppercase tracking-widest shadow-[2px_2px_0px_0px_var(--navy)]">
                Photo Captured
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
