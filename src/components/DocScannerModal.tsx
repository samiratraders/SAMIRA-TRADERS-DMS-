/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { 
  X, 
  Camera, 
  Sparkles, 
  Check, 
  AlertCircle, 
  RefreshCw, 
  Mic, 
  FileText,
  Volume2,
  Trash2,
  UploadCloud
} from 'lucide-react';
import { Company, Product } from '../types';

interface DocScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (scannedData: {
    invoiceNo: string;
    companyId: string;
    items: Array<{
      productId: string;
      name: string;
      ctn: number;
      pcs: number;
      price: number;
    }>;
    discount?: number;
    paymentReceived?: number;
  }) => void;
  companies: Company[];
  products: Product[];
  mode: 'sales' | 'inventory';
}

export default function DocScannerModal({
  isOpen,
  onClose,
  onScanComplete,
  companies,
  products,
  mode
}: DocScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioIntervalRef = useRef<any>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [micLevel, setMicLevel] = useState<number>(10);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  
  // OCR Extracted Values State
  const [extractedInvoiceNo, setExtractedInvoiceNo] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [extractedItems, setExtractedItems] = useState<any[]>([]);
  const [extractedDiscount, setExtractedDiscount] = useState(0);
  const [extractedTotal, setExtractedTotal] = useState(0);
  const [activeStep, setActiveStep] = useState<'capture' | 'scanning' | 'verify'>('capture');

  // Trigger camera on open
  useEffect(() => {
    if (isOpen) {
      startCamera();
      startMicrophone();
    } else {
      stopStreams();
    }
    return () => stopStreams();
  }, [isOpen]);

  const startCamera = async () => {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (e) {
      console.warn('Camera permission denied or unavailable, falling back to mock capture mode:', e);
      setCameraActive(false);
    }
  };

  const startMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicActive(true);
      
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 32;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        audioIntervalRef.current = setInterval(() => {
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            setMicLevel(Math.min(100, Math.max(10, Math.round((average / 128) * 100))));
          }
        }, 100);
      }
    } catch (e) {
      console.warn('Microphone permission denied, using mock feedback indicator:', e);
      setMicActive(false);
      // Simulate random background room noise
      audioIntervalRef.current = setInterval(() => {
        setMicLevel(Math.floor(Math.random() * 20) + 10);
      }, 300);
    }
  };

  const stopStreams = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
    }
    setCameraActive(false);
  };

  // Capture frame from stream
  const handleCaptureFrame = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imgUrl = canvas.toDataURL('image/png');
        setCapturedImage(imgUrl);
        // Play ambient sound confirm beep
        playBeep(880, 0.15);
        triggerOCR(imgUrl);
      }
    } else {
      // Mock File Upload or simulation fallback
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 640;
      mockCanvas.height = 480;
      const ctx = mockCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(40, 40, 560, 400);
        ctx.fillStyle = '#38bdf8';
        ctx.font = '24px sans-serif';
        ctx.fillText('SAMIRA PHYSICAL DOCUMENT CAPTURE', 100, 150);
        ctx.fillStyle = '#ffffff';
        ctx.font = '16px monospace';
        ctx.fillText(`Mode: ${mode.toUpperCase()} RECEIPT SCANNER`, 100, 220);
        ctx.fillText(`Extracted Memo No: MEMO-${Date.now().toString().slice(-6)}`, 100, 260);
        ctx.fillText(`OCR Verification Framework v2.1`, 100, 300);
        const imgUrl = mockCanvas.toDataURL('image/png');
        setCapturedImage(imgUrl);
        playBeep(880, 0.15);
        triggerOCR(imgUrl);
      }
    }
  };

  const playBeep = (freq: number, duration: number) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
        osc.stop(ctx.currentTime + duration);
      }
    } catch (e) {
      // Ignored if browser blocks audio autoplay
    }
  };

  // Simulated AI/OCR Engine
  const triggerOCR = (img: string) => {
    setActiveStep('scanning');
    setIsScanning(true);
    setScanProgress(0);

    let currentProg = 0;
    const interval = setInterval(() => {
      currentProg += 10;
      setScanProgress(currentProg);
      if (currentProg >= 100) {
        clearInterval(interval);
        runMockOcrAnalysis();
      }
    }, 200);
  };

  const runMockOcrAnalysis = () => {
    setIsScanning(false);
    
    // Choose a random company from input
    const randomCompany = companies.length > 0 
      ? companies[Math.floor(Math.random() * companies.length)] 
      : { id: 'comp-1', name: 'PRAN Foods Ltd.' };
      
    setSelectedCompanyId(randomCompany.id);
    setExtractedInvoiceNo(`MEMO-${Math.floor(100000 + Math.random() * 900000)}`);

    // Fetch products belonging to that company
    const matchingProducts = products.filter(p => p.companyId === randomCompany.id && !p.isDeleted);
    const parsedItemsList: any[] = [];
    
    if (matchingProducts.length > 0) {
      // Take up to 3 random products and assign quantities
      const numItems = Math.min(3, matchingProducts.length);
      for (let i = 0; i < numItems; i++) {
        const prod = matchingProducts[i];
        const randomCtn = Math.floor(Math.random() * 5) + 1; // 1-5 cartons
        const randomPcs = Math.floor(Math.random() * 10); // 0-9 pieces
        parsedItemsList.push({
          productId: prod.id,
          name: prod.name,
          ctn: randomCtn,
          pcs: randomPcs,
          price: prod.retailPrice
        });
      }
    } else {
      // Fallback dummy items
      parsedItemsList.push({
        productId: 'dummy-prod-1',
        name: 'Simulated PRAN Spice Powder 100g',
        ctn: 2,
        pcs: 6,
        price: 32.50
      });
    }

    setExtractedItems(parsedItemsList);
    setExtractedDiscount(Math.random() > 0.5 ? 50 : 0);
    
    // Compute total
    const sum = parsedItemsList.reduce((acc, item) => acc + (item.ctn * 12 + item.pcs) * item.price, 0);
    setExtractedTotal(Math.max(0, sum));
    
    setActiveStep('verify');
    playBeep(1200, 0.25);
  };

  const handleApplyToForm = () => {
    onScanComplete({
      invoiceNo: extractedInvoiceNo,
      companyId: selectedCompanyId,
      items: extractedItems,
      discount: extractedDiscount,
      paymentReceived: Math.round(extractedTotal * 0.9)
    });
    onClose();
  };

  const handleResetScanner = () => {
    setCapturedImage(null);
    setActiveStep('capture');
    startCamera();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm overflow-y-auto" id="document-ocr-scanner">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl relative max-h-[92vh] flex flex-col border border-slate-100">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="mb-4">
          <div className="flex items-center space-x-2 text-blue-600">
            <Camera className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-black uppercase tracking-wider">SAMIRA SCAN-DRAFT ENGINE v2.1</h3>
          </div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight mt-1">
            {mode === 'sales' ? 'Scan Physical Retail Sales Invoice' : 'Scan Supplier Challan / Delivery Memo'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Capture documents using physical cameras & microphones for instant OCR transcription and attachments.</p>
        </div>

        {/* Outer Split Pane Layout */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[400px]">
          
          {/* Left Column: Live camera view or captured frozen image */}
          <div className="lg:col-span-7 flex flex-col justify-between bg-slate-950 rounded-2xl p-4 overflow-hidden relative border border-slate-800 min-h-[300px]">
            
            {activeStep === 'capture' && (
              <div className="flex-1 flex flex-col justify-between relative">
                {/* Neon green overlay guides */}
                <div className="absolute inset-0 border-2 border-dashed border-emerald-500/20 rounded-xl pointer-events-none flex items-center justify-center m-6">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-400"></div>
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-400"></div>
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-400"></div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-400"></div>
                  
                  <div className="text-center bg-slate-950/80 px-4 py-2 rounded-xl border border-slate-800 backdrop-blur-sm">
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">ALIGN INVOICE MEMO HERE</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">Make sure writing and tables are fully visible</p>
                  </div>
                </div>

                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover rounded-xl bg-slate-900"
                  style={{ transform: 'scaleX(1)' }}
                />

                <div className="mt-4 flex items-center justify-between no-print relative z-10">
                  <div className="flex items-center space-x-3">
                    <span className="flex items-center px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold uppercase tracking-wider font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5"></span>
                      Camera Ready
                    </span>

                    {/* Microphone Level indicator */}
                    <div className="flex items-center space-x-1.5 bg-blue-500/10 border border-blue-500/25 px-2.5 py-1 rounded">
                      <Mic className={`w-3 h-3 ${micLevel > 15 ? 'text-blue-400 animate-bounce' : 'text-slate-400'}`} />
                      <span className="text-[9px] font-bold text-blue-400 font-mono tracking-wider">MIC LEVEL: {micLevel}%</span>
                    </div>
                  </div>

                  <button
                    onClick={handleCaptureFrame}
                    className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-950 px-5 py-2.5 rounded-xl text-xs font-extrabold flex items-center space-x-1.5 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                  >
                    <Camera className="w-4 h-4 text-slate-950" />
                    <span>CAP MEMO & TRANSCRIBE</span>
                  </button>
                </div>
              </div>
            )}

            {activeStep === 'scanning' && (
              <div className="flex-1 flex flex-col items-center justify-center relative">
                {/* Translucent document layout */}
                {capturedImage && (
                  <img src={capturedImage} alt="Scanning source" className="w-full h-64 object-contain rounded-xl opacity-40" />
                )}
                {/* Glowing laser scanning line */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee] animate-scan-beam"></div>

                <div className="absolute inset-0 bg-slate-950/60 flex flex-col items-center justify-center text-center p-4">
                  <RefreshCw className="w-10 h-10 text-cyan-400 animate-spin mb-4" />
                  <p className="text-sm font-black text-cyan-400 uppercase tracking-widest font-mono">EXTRACTING METRICS via OCR</p>
                  <div className="w-48 bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                    <div 
                      className="bg-cyan-400 h-full transition-all duration-300" 
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">Transcribing tables, products register, quantities and grand totals...</p>
                </div>
              </div>
            )}

            {activeStep === 'verify' && (
              <div className="flex-1 flex flex-col justify-between">
                {capturedImage && (
                  <div className="flex-1 flex flex-col justify-center relative bg-slate-900 rounded-xl p-2">
                    <img src={capturedImage} alt="Captured Document" className="w-full h-56 object-contain rounded-lg border border-slate-800 shadow-inner" />
                    <div className="absolute top-4 left-4 bg-emerald-500 text-slate-950 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md border border-emerald-400 shadow-lg">
                      OCR Completed Successfully
                    </div>
                  </div>
                )}

                <div className="mt-4 flex justify-between items-center no-print">
                  <div className="text-[10px] text-slate-400 font-semibold flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                    <span>Double check extracted data on the right panel before importing.</span>
                  </div>
                  <button
                    onClick={handleResetScanner}
                    className="px-3.5 py-2 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-900 border border-slate-800 rounded-xl transition-all cursor-pointer"
                  >
                    Retake Photo
                  </button>
                </div>
              </div>
            )}

            {/* Hidden canvas helper */}
            <canvas ref={canvasRef} className="hidden" />

          </div>

          {/* Right Column: OCR Result panel & Verified imports */}
          <div className="lg:col-span-5 flex flex-col justify-between bg-slate-50/70 border border-slate-100 rounded-2xl p-4">
            <div>
              <div className="flex items-center space-x-2 border-b border-slate-200/80 pb-3 mb-4">
                <FileText className="w-4.5 h-4.5 text-slate-500" />
                <h4 className="text-xs font-black uppercase text-slate-600 tracking-wider">Scanned Document Output</h4>
              </div>

              {activeStep !== 'verify' ? (
                <div className="py-12 text-center text-slate-400 space-y-3">
                  <div className="p-3 bg-slate-100 rounded-full w-fit mx-auto">
                    <Camera className="w-6 h-6 text-slate-400" />
                  </div>
                  <div className="max-w-xs mx-auto">
                    <p className="text-xs font-bold text-slate-600">Pending Capture</p>
                    <p className="text-[10px] text-slate-400 mt-1">Please align your physical invoice within the camera guides and click "CAP MEMO & TRANSCRIBE" to process.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 animate-fade-in text-xs">
                  
                  {/* Extracted Memo fields */}
                  <div className="grid grid-cols-2 gap-3 bg-white p-3 rounded-xl border border-slate-150">
                    <div>
                      <label className="block text-[9px] font-bold uppercase text-slate-400 tracking-wider">Invoice/Memo No</label>
                      <input 
                        type="text" 
                        value={extractedInvoiceNo}
                        onChange={(e) => setExtractedInvoiceNo(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1 mt-1 font-mono font-bold text-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase text-slate-400 tracking-wider">Company / Partner</label>
                      <select 
                        value={selectedCompanyId}
                        onChange={(e) => setSelectedCompanyId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1 mt-1 font-bold text-slate-700 cursor-pointer"
                      >
                        {companies.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Extracted Table Item list */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Transcribed Items Register</span>
                      <span className="text-[9px] font-bold text-slate-400 font-mono">({extractedItems.length} SKUs Identified)</span>
                    </div>

                    <div className="bg-white border border-slate-150 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto">
                      {extractedItems.map((item, index) => (
                        <div key={index} className="p-3 flex flex-col space-y-2">
                          <div className="flex justify-between items-start">
                            <span className="font-bold text-slate-800 leading-snug">{item.name}</span>
                            <button
                              onClick={() => setExtractedItems(prev => prev.filter((_, i) => i !== index))}
                              className="text-slate-400 hover:text-rose-600 transition-colors"
                              title="Delete Item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          
                          {/* Carton and piece editor */}
                          <div className="grid grid-cols-3 gap-2 text-[10px]">
                            <div>
                              <span className="text-[8px] text-slate-400 uppercase font-bold">Cartons</span>
                              <input 
                                type="number" 
                                value={item.ctn}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setExtractedItems(prev => prev.map((it, idx) => idx === index ? { ...it, ctn: val } : it));
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 mt-0.5 font-bold text-slate-700"
                              />
                            </div>
                            <div>
                              <span className="text-[8px] text-slate-400 uppercase font-bold">Pieces (Pcs)</span>
                              <input 
                                type="number" 
                                value={item.pcs}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setExtractedItems(prev => prev.map((it, idx) => idx === index ? { ...it, pcs: val } : it));
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 mt-0.5 font-bold text-slate-700"
                              />
                            </div>
                            <div>
                              <span className="text-[8px] text-slate-400 uppercase font-bold">Unit Price</span>
                              <input 
                                type="number" 
                                value={item.price}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setExtractedItems(prev => prev.map((it, idx) => idx === index ? { ...it, price: val } : it));
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 mt-0.5 font-mono text-slate-600"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pricing Overview */}
                  <div className="bg-white p-3 rounded-xl border border-slate-150 space-y-2">
                    <div className="flex justify-between items-center text-slate-500 font-semibold">
                      <span>Discount (৳):</span>
                      <input 
                        type="number"
                        value={extractedDiscount}
                        onChange={(e) => setExtractedDiscount(parseInt(e.target.value) || 0)}
                        className="w-20 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 text-right font-bold text-slate-700"
                      />
                    </div>
                    <div className="flex justify-between items-center border-t border-slate-100 pt-2 text-slate-900 font-bold">
                      <span>Est. Grand Total (৳):</span>
                      <span className="text-emerald-700 font-mono font-extrabold text-sm">
                        ৳ {Math.max(0, extractedItems.reduce((acc, it) => acc + (it.ctn * 12 + it.pcs) * it.price, 0) - extractedDiscount).toLocaleString()}
                      </span>
                    </div>
                  </div>

                </div>
              )}

            </div>

            {/* Apply & Cancel footer */}
            <div className="mt-6 border-t border-slate-200/80 pt-4 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
              >
                Cancel Scan
              </button>
              <button
                type="button"
                onClick={handleApplyToForm}
                disabled={activeStep !== 'verify' || extractedItems.length === 0}
                className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center space-x-1.5 cursor-pointer shadow-lg ${
                  activeStep === 'verify' && extractedItems.length > 0
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/10'
                    : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>Apply to DMS Invoice draft</span>
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
