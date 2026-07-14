/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, AlertTriangle, RefreshCw } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function ConnectionStatusBadge() {
  const [status, setStatus] = useState<'online' | 'offline' | 'high_latency' | 'checking'>('checking');
  const [latency, setLatency] = useState<number | null>(null);

  const checkConnection = async () => {
    if (!navigator.onLine) {
      setStatus('offline');
      setLatency(null);
      return;
    }

    const start = Date.now();
    try {
      // Light getDoc read test to verify connectivity and latency
      const docRef = doc(db, 'connection_diagnostics', 'health_check_manager');
      await getDoc(docRef);
      
      const duration = Date.now() - start;
      setLatency(duration);

      if (duration > 3000) {
        setStatus('high_latency');
      } else {
        setStatus('online');
      }
    } catch (err: any) {
      console.warn('ConnectionStatusBadge: Firestore connection probe failed:', err);
      setStatus('offline');
      setLatency(null);
    }
  };

  useEffect(() => {
    // Initial connection verify
    checkConnection();

    // Listen to window offline and online events
    const handleOnline = () => {
      setStatus('checking');
      checkConnection();
    };
    const handleOffline = () => {
      setStatus('offline');
      setLatency(null);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Active real-time checking loop every 10 seconds
    const interval = setInterval(() => {
      checkConnection();
    }, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="relative group inline-flex items-center" id="firestore-realtime-status-badge">
      <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full border text-xs font-bold shadow-sm transition-all ${
        status === 'online' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
        status === 'high_latency' ? 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse' :
        'bg-rose-50 border-rose-200 text-rose-700 animate-pulse'
      }`}>
        {status === 'online' && (
          <>
            <Wifi className="w-3.5 h-3.5 text-emerald-600" />
            <span>সচল ({latency !== null ? `${latency}ms` : 'Connected'})</span>
          </>
        )}
        {status === 'high_latency' && (
          <>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 animate-bounce" />
            <span className="cursor-help">কানেকশন ধীর ({latency}ms)</span>
          </>
        )}
        {status === 'offline' && (
          <>
            <WifiOff className="w-3.5 h-3.5 text-rose-600" />
            <span className="cursor-help">অফলাইন</span>
          </>
        )}
        {status === 'checking' && (
          <>
            <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
            <span>যাচাই হচ্ছে...</span>
          </>
        )}
      </div>

      {/* Warning/Reconnecting Tooltip for offline or high latency states */}
      {(status === 'offline' || status === 'high_latency') && (
        <div className="absolute right-0 top-full mt-2 hidden group-hover:flex flex-col bg-slate-900 text-white text-[11px] p-3 rounded-xl shadow-xl z-50 w-56 border border-slate-800 transition-all">
          <p className="font-extrabold text-amber-400 flex items-center mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mr-1 flex-shrink-0 animate-pulse" />
            Reconnecting...
          </p>
          <p className="opacity-90 leading-relaxed font-medium">
            {status === 'offline' 
              ? 'ডাটাবেজ সংযোগ বিচ্ছিন্ন রয়েছে। অনুগ্রহ করে ইন্টারনেট কানেকশন চেক করুন।' 
              : `ডাটাবেজ রেসপন্স ধীর (${latency}ms)। সংযোগ পুনস্থাপনের চেষ্টা চলছে।`}
          </p>
        </div>
      )}
    </div>
  );
}
