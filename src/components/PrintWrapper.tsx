/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  X, 
  Printer, 
  FileText, 
  Share2, 
  Smartphone, 
  Layout, 
  Check, 
  Download,
  AlertCircle
} from 'lucide-react';

interface PrintWrapperProps {
  type: 'invoice' | 'settlement' | 'ledger' | 'general';
  title?: string;
  data: any;
  onClose: () => void;
}

export default function PrintWrapper({ type, title = 'রিপোর্ট স্টেটমেন্ট', data, onClose }: PrintWrapperProps) {
  const [layoutMode, setLayoutMode] = useState<'A4' | 'POS'>('A4');

  // Generate WhatsApp text description & return the share link
  const getWhatsAppShareLink = () => {
    let text = '';
    if (type === 'invoice') {
      text = `*সামীরা ট্রেডার্স (Samira Traders)*\n` +
             `*সেলস ইনভয়েস মেমো*\n` +
             `---------------------------------\n` +
             `*মেমো নম্বর:* ${data.invoiceNo || data.id}\n` +
             `*তারিখ:* ${data.date}\n` +
             `*গ্রাহক:* ${data.shopName || 'Spot Client'}\n` +
             `*রুট/এরিয়া:* ${data.route || 'N/A'}\n` +
             `*কোম্পানি:* ${data.companyName || 'N/A'}\n` +
             `---------------------------------\n` +
             `*আইটেম বিবরণী:*\n` +
             (data.items || []).map((item: any) => `• ${item.name} - ${item.qty} পিস @ ৳${item.price} = ৳${item.total}`).join('\n') + `\n` +
             `---------------------------------\n` +
             `*সাব-টোটাল:* ৳${data.subTotal?.toLocaleString()}\n` +
             `*ডিসকাউন্ট:* ৳${data.discount?.toLocaleString()}\n` +
             `*সর্বমোট বিল:* ৳${data.grandTotal?.toLocaleString()}\n` +
             `*আজ জমা:* ৳${data.paymentReceived?.toLocaleString()}\n` +
             `*বকেয়া:* ৳${(data.grandTotal - data.paymentReceived)?.toLocaleString()}\n` +
             `---------------------------------\n` +
             `_ধন্যবাদ, আমাদের সাথেই থাকুন!_`;
    } else if (type === 'settlement') {
      text = `*সামীরা ট্রেডার্স (Samira Traders)*\n` +
             `*ডিএসআর সেটেলমেন্ট রশিদ*\n` +
             `---------------------------------\n` +
             `*সেটেলমেন্ট আইডি:* ${data.id || 'N/A'}\n` +
             `*তারিখ:* ${data.date || new Date().toISOString().split('T')[0]}\n` +
             `*ডিএসআর কর্মী:* ${data.dsrName || 'N/A'}\n` +
             `*রুট/এরিয়া:* ${data.route || 'N/A'}\n` +
             `---------------------------------\n` +
             `*মোট সেলস ভ্যালু:* ৳${data.totalSales?.toLocaleString()}\n` +
             `*নগদ কালেকশন জমা:* ৳${data.cashCollected?.toLocaleString()}\n` +
             `*মার্কেট বকেয়া:* ৳${data.marketDues?.toLocaleString()}\n` +
             `*আজকের শর্টেজ/ঘাটতি:* ৳${data.shortageAmount?.toLocaleString()}\n` +
             `---------------------------------\n` +
             `_হিসাব যাচাইপূর্বক চূড়ান্ত অনুমোদিত_`;
    } else if (type === 'ledger') {
      text = `*সামীরা ট্রেডার্স (Samira Traders)*\n` +
             `*গ্রাহক খতিয়ান স্টেটমেন্ট*\n` +
             `---------------------------------\n` +
             `*গ্রাহক আউটলেট:* ${data.shopName || data.name}\n` +
             `*মালিকের নাম:* ${data.name || 'N/A'}\n` +
             `*রুট/এরিয়া:* ${data.route || 'N/A'}\n` +
             `*তারিখ:* ${new Date().toLocaleDateString()}\n` +
             `---------------------------------\n` +
             `*কোম্পানি ভিত্তিক বকেয়া:*\n` +
             Object.entries(data.dues || {}).map(([cId, due]: any) => `• কোম্পানি আইডি (${cId}): ৳${due.toLocaleString()}`).join('\n') + `\n` +
             `---------------------------------\n` +
             `*মোট বকেয়ার পরিমাণ:* ৳${data.totalDue?.toLocaleString()}\n` +
             `---------------------------------\n` +
             `_যেকোনো তথ্যের জন্য যোগাযোগ করুন_`;
    } else {
      text = `*সামীরা ট্রেডার্স (Samira Traders)*\n` +
             `*রিপোর্ট বিবরণী*\n` +
             `*তারিখ:* ${new Date().toLocaleDateString()}\n` +
             `*বিবরণী:* ${data.remarks || 'N/A'}`;
    }
    
    return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto no-print" id="print-utility-modal">
      <div className="bg-slate-900 text-slate-100 rounded-3xl max-w-4xl w-full grid grid-cols-1 md:grid-cols-12 overflow-hidden shadow-2xl border border-slate-800">
        
        {/* Left Side: Layout Toggles and Actions */}
        <div className="md:col-span-5 p-6 bg-slate-950 border-r border-slate-800 flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black tracking-tight text-white flex items-center">
                <Printer className="w-5 h-5 text-blue-500 mr-2" />
                <span>প্রিন্ট ও শেয়ার প্যানেল</span>
              </h3>
              <button 
                onClick={onClose}
                className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">রশিদ লেআউট নির্বাচন (Printer Layout)</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLayoutMode('A4')}
                  className={`py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 border transition-all cursor-pointer ${
                    layoutMode === 'A4'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/20'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Layout className="w-4 h-4" />
                  <span>A4 সাইজ পেজ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode('POS')}
                  className={`py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 border transition-all cursor-pointer ${
                    layoutMode === 'POS'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/20'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  <span>POS থার্মাল (80mm)</span>
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl space-y-2">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center">
                <AlertCircle className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                <span>প্রিন্ট টিপস (Print Tips)</span>
              </p>
              <ul className="text-[10px] text-slate-400 space-y-1 list-disc list-inside">
                <li>A4 প্রিন্টিং এর জন্য 'Margins' ডিফাল্ট রাখুন।</li>
                <li>থার্মাল রোল (POS 80mm) প্রিন্টের ক্ষেত্রে মার্জিন 'None' করুন।</li>
                <li>PDF হিসেবে সেভ করতে প্রিন্টার হিসেবে 'Save as PDF' নির্বাচন করুন।</li>
              </ul>
            </div>
          </div>

          <div className="space-y-2.5 pt-6 border-t border-slate-800">
            <button
              onClick={handlePrint}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs py-3 rounded-xl flex items-center justify-center space-x-2 cursor-pointer transition-all shadow-lg shadow-blue-600/25"
            >
              <Printer className="w-4 h-4" />
              <span>রশিদ প্রিন্ট করুন / PDF ডাউনলোড</span>
            </button>

            <a
              href={getWhatsAppShareLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-3 rounded-xl flex items-center justify-center space-x-2 cursor-pointer transition-all shadow-lg shadow-emerald-600/25"
            >
              <Share2 className="w-4 h-4" />
              <span>হোয়াটসঅ্যাপে শেয়ার (Share)</span>
            </a>

            <button
              onClick={onClose}
              className="w-full bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold text-xs py-3 rounded-xl transition-all border border-slate-800"
            >
              বন্ধ করুন (Close)
            </button>
          </div>
        </div>

        {/* Right Side: Live Interactive Printable Preview (Styled to look like paper) */}
        <div className="md:col-span-7 bg-slate-950 p-6 overflow-y-auto max-h-[75vh] flex justify-center items-start">
          
          <div 
            className={`print-section bg-white text-slate-900 shadow-xl p-6 font-sans transition-all duration-300 ${
              layoutMode === 'A4' ? 'w-full max-w-[210mm] min-h-[297mm] rounded-2xl' : 'w-full max-w-[80mm] text-xs rounded-xl'
            }`}
            id="printable-content"
          >
            {/* Header Brand */}
            <div className="text-center space-y-1 mb-4 pb-3 border-b border-gray-200">
              <h2 className="text-base font-black text-slate-900 tracking-tight">সামীরা ট্রেডার্স (Samira Traders)</h2>
              <p className="text-[10px] text-gray-500 font-medium">প্রোপ্রাইটার: আলহাজ্ব মো: সমির উদ্দিন</p>
              <p className="text-[9px] text-gray-400">রুট ডিস্ট্রিবিউশন অ্যান্ড হোলসেল পার্টনার, নেত্রকোনা</p>
              <p className="text-[9px] text-gray-400">মোবাইল: ০১৭১৫-XXXXXX, ০১৮১৯-XXXXXX</p>
              <div className="inline-block bg-slate-100 text-slate-800 font-bold px-2 py-0.5 rounded text-[8px] uppercase tracking-wider mt-1.5">
                {title}
              </div>
            </div>

            {/* Structured Invoice View */}
            {type === 'invoice' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-[9px] text-gray-600 border-b pb-2">
                  <div>
                    <p><strong className="text-slate-900">মেমো নং:</strong> <span className="font-mono font-bold">{data.invoiceNo || data.id}</span></p>
                    <p><strong className="text-slate-900">তারিখ:</strong> {data.date}</p>
                    <p><strong className="text-slate-900">রুট/এরিয়া:</strong> {data.route || 'N/A'}</p>
                  </div>
                  <div className="text-right">
                    <p><strong className="text-slate-900">গ্রাহক:</strong> {data.shopName || 'Spot Client'}</p>
                    <p><strong className="text-slate-900">মালিক:</strong> {data.customerName || 'Spot Client'}</p>
                    <p><strong className="text-slate-900">কোম্পানি:</strong> {data.companyName || 'N/A'}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">পণ্য তালিকা ও বিল বিবরণী:</p>
                  <table className="w-full text-left text-[9px] border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 bg-slate-50 text-gray-500 font-bold">
                        <th className="py-1 px-1">আইটেম নাম</th>
                        <th className="py-1 px-1 text-center">পরিমাণ</th>
                        <th className="py-1 px-1 text-right">দর</th>
                        <th className="py-1 px-1 text-right">মোট</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {(data.items || []).map((item: any, idx: number) => (
                        <tr key={idx}>
                          <td className="py-1 px-1 font-bold text-slate-800">{item.name}</td>
                          <td className="py-1 px-1 text-center">{item.qty} পিস</td>
                          <td className="py-1 px-1 text-right">৳{item.price}</td>
                          <td className="py-1 px-1 text-right font-bold">৳{item.total?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t pt-2 text-[9px] font-bold space-y-1 text-right max-w-xs ml-auto">
                  <div className="flex justify-between">
                    <span className="text-gray-400">সাব-টোটাল:</span>
                    <span>৳{data.subTotal?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-rose-600">
                    <span>ডিসকাউন্ট:</span>
                    <span>-৳{data.discount?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 text-slate-950 font-black">
                    <span>সর্বমোট বিল:</span>
                    <span>৳{data.grandTotal?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>আজ নগদ জমা:</span>
                    <span>৳{data.paymentReceived?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t border-dashed pt-1 text-red-600 font-black">
                    <span>বাকি/বকেয়া:</span>
                    <span>৳{(data.grandTotal - data.paymentReceived)?.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Structured Settlement View */}
            {type === 'settlement' && (
              <div className="space-y-4 text-[9px]">
                <div className="grid grid-cols-2 gap-2 text-gray-600 border-b pb-2">
                  <div>
                    <p><strong className="text-slate-900">সেটেলমেন্ট আইডি:</strong> <span className="font-mono font-bold">{data.id || 'N/A'}</span></p>
                    <p><strong className="text-slate-900">তারিখ:</strong> {data.date || new Date().toISOString().split('T')[0]}</p>
                  </div>
                  <div className="text-right">
                    <p><strong className="text-slate-900">ডিএসআর কর্মী:</strong> {data.dsrName || 'N/A'}</p>
                    <p><strong className="text-slate-900">রুট/এরিয়া:</strong> {data.route || 'N/A'}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="p-2.5 bg-slate-50 border rounded-xl grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-gray-400">মোট ডেলিভারি কার্টন:</p>
                      <p className="text-xs font-black text-slate-800">{data.totalCartons || 0} CTN</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-400">মোট বিক্রয় পরিমাণ:</p>
                      <p className="text-xs font-black text-blue-700">৳{data.totalSales?.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 border rounded-xl space-y-1.5 font-bold">
                    <div className="flex justify-between text-slate-800">
                      <span>আজকের মোট ক্যাশ আদায়:</span>
                      <span className="text-emerald-700">৳{data.cashCollected?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-800">
                      <span>মার্কেট বকেয়া (ক্রেডিট সেলস):</span>
                      <span className="text-amber-600">৳{data.marketDues?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between border-t border-dashed pt-1 text-slate-950">
                      <span>আজকের শর্টেজ/ক্যাশ শর্ট:</span>
                      <span className={data.shortageAmount > 0 ? 'text-red-600' : 'text-emerald-600'}>
                        ৳{data.shortageAmount?.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {data.remarks && (
                  <div className="p-2 bg-slate-50 border rounded text-[8px] text-gray-500 italic">
                    <strong>মন্তব্য:</strong> {data.remarks}
                  </div>
                )}
              </div>
            )}

            {/* Structured Ledger View */}
            {type === 'ledger' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-[9px] text-gray-600 border-b pb-2">
                  <div>
                    <p><strong className="text-slate-900">আউটলেট নাম:</strong> {data.shopName || data.name}</p>
                    <p><strong className="text-slate-900">মালিকের নাম:</strong> {data.name || 'N/A'}</p>
                  </div>
                  <div className="text-right">
                    <p><strong className="text-slate-900">রুট/এরিয়া:</strong> {data.route || 'N/A'}</p>
                    <p><strong className="text-slate-900">তারিখ:</strong> {new Date().toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">কোম্পানি ভিত্তিক বকেয়া খতিয়ান:</p>
                  <table className="w-full text-left text-[9px] border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 bg-slate-50 text-gray-500 font-bold">
                        <th className="py-1 px-1">কোম্পানি বিবরণ</th>
                        <th className="py-1 px-1 text-right">বকেয়ার পরিমাণ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-bold text-slate-800">
                      {Object.entries(data.dues || {}).map(([cId, due]: any) => (
                        <tr key={cId}>
                          <td className="py-1 px-1 text-gray-500">কোম্পানি ID: {cId}</td>
                          <td className="py-1 px-1 text-right text-amber-600">৳{due.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t pt-2 flex justify-between text-xs font-black text-slate-950">
                  <span>সর্বমোট সমন্বিত বকেয়া:</span>
                  <span>৳{data.totalDue?.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Footer Signatures */}
            <div className="pt-10 border-t border-dashed border-gray-200 mt-12 grid grid-cols-2 gap-4 text-center text-[8px] font-bold text-gray-400">
              <div>
                <p className="border-t border-gray-300 pt-1 w-2/3 mx-auto">ক্রেতার স্বাক্ষর</p>
              </div>
              <div>
                <p className="border-t border-gray-300 pt-1 w-2/3 mx-auto">কর্তৃপক্ষের স্বাক্ষর</p>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
