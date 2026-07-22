import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => void;
  title: string;
  description: string;
  type: 'employee' | 'product';
  mockOptions?: Array<{ label: string; value: string }>;
}

export default function QrScannerModal({
  isOpen,
  onClose,
  onScan,
  title,
  description,
  type,
  mockOptions = []
}: QrScannerModalProps) {
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    setScanError(null);
    setIsCameraStarting(true);
    setIsCameraActive(false);

    // Short delay to let the DOM element mount completely
    const timer = setTimeout(() => {
      startScanner();
    }, 300);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [isOpen]);

  const startScanner = async () => {
    try {
      const html5QrCode = new Html5Qrcode("modal-qr-reader");
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
        },
        (decodedText) => {
          onScan(decodedText);
          onClose(); // Auto close on successful scan
        },
        () => {
          // Silent scan frame ticks
        }
      );

      setIsCameraStarting(false);
      setIsCameraActive(true);
    } catch (err: any) {
      console.warn("Failed to start modal QR camera feed", err);
      setIsCameraStarting(false);
      setIsCameraActive(false);
      setScanError(
        "ক্যামেরা এক্সেস পাওয়া যায়নি। দয়া করে নিচের সিমুলেটর ব্যবহার করুন।"
      );
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
      } catch (e) {
        console.error("Failed to stop scanner cleanly:", e);
      } finally {
        scannerRef.current = null;
        setIsCameraActive(false);
        setIsCameraStarting(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn" id="qr-scanner-modal-backdrop">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-5 text-slate-100">
        
        {/* Close Button */}
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex p-3 bg-blue-600/10 text-blue-400 rounded-2xl border border-blue-500/20">
            <Camera className="w-6 h-6 animate-pulse" />
          </div>
          <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center justify-center gap-2">
            <span>{title}</span>
          </h3>
          <p className="text-xs text-slate-400 font-medium">{description}</p>
        </div>

        {/* Camera Container */}
        <div className="relative mx-auto w-64 h-64 bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden flex items-center justify-center shadow-inner">
          {isCameraStarting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 z-20 space-y-3">
              <RefreshCw className="w-7 h-7 text-blue-500 animate-spin" />
              <span className="text-[10px] font-bold text-slate-400 font-mono">Activating camera...</span>
            </div>
          )}

          {/* HTML5 QR Code DOM Target */}
          <div id="modal-qr-reader" className="w-full h-full object-cover"></div>

          {/* Hologram Target Frames */}
          {isCameraActive && (
            <div className="absolute inset-0 pointer-events-none border-2 border-emerald-500/10 rounded-2xl z-10">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-emerald-500"></div>
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-emerald-500"></div>
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-emerald-500"></div>
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-emerald-500"></div>
              {/* Laser line effect */}
              <div className="w-full h-[2px] bg-emerald-400/80 shadow-[0_0_12px_#10b981] absolute top-1/2 left-0 pointer-events-none animate-[scan_2s_infinite_ease-in-out]"></div>
            </div>
          )}
        </div>

        {scanError && (
          <div className="p-3 bg-rose-950/30 border border-rose-900/40 text-rose-300 text-[11px] rounded-xl flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{scanError}</span>
          </div>
        )}

        {/* Scan Simulator (Mock Scan Interface) */}
        <div className="bg-slate-950 border border-slate-850 p-4 rounded-2xl space-y-3">
          <div className="text-center">
            <span className="text-[10px] text-blue-400 font-extrabold uppercase tracking-wider flex items-center justify-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>QR/Barcode Simulation Panel</span>
            </span>
            <p className="text-[9px] text-slate-500 mt-0.5">Physical camera unavailable? Use these simulation tokens.</p>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            {mockOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onScan(opt.value);
                  onClose();
                }}
                type="button"
                className="p-2 bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-xl text-center cursor-pointer hover:bg-slate-850 transition-all focus:outline-none"
              >
                <span className="text-[10px] font-black block text-slate-200 truncate">{opt.label}</span>
                <span className="text-[8px] font-mono text-slate-500 block truncate">Val: {opt.value}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Close Button at bottom */}
        <button
          type="button"
          onClick={onClose}
          className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer border border-slate-700/50"
        >
          Cancel
        </button>

      </div>
    </div>
  );
}
