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
  const [layoutMode, setLayoutMode] = useState<'A4' | 'POS' | 'POS_58'>('A4');

  // Print Column Visibility Config
  const [showUnitPrice, setShowUnitPrice] = useState(true);
  const [showDiscount, setShowDiscount] = useState(true);
  const [showTax, setShowTax] = useState(true);

  // Generate WhatsApp text description & return the share link
  const getWhatsAppShareLink = () => {
    let text = '';
    if (type === 'invoice') {
      if (data.invoices && Array.isArray(data.invoices)) {
        text = `*সামীরা ট্রেডার্স (Samira Traders)*\n` +
               `*বাল্ক বিক্রয় ইনভয়েস তালিকা (${data.invoices.length} মেমো)*\n` +
               `---------------------------------\n` +
               data.invoices.map((inv: any, idx: number) => `${idx + 1}. মেমো নং: ${inv.invoiceNo} - ${inv.shopName} (৳${inv.grandTotal?.toLocaleString()})`).join('\n') + `\n` +
               `---------------------------------\n` +
               `*মোট নির্বাচিত ইনভয়েস বিল:* ৳${data.invoices.reduce((sum: number, inv: any) => sum + (inv.grandTotal || 0), 0).toLocaleString()}\n` +
               `_ধন্যবাদ, আমাদের সাথেই থাকুন!_`;
      } else {
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
      }
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
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setLayoutMode('A4')}
                  className={`py-2 px-1 rounded-xl font-bold text-[10px] flex flex-col items-center justify-center space-y-1 border transition-all cursor-pointer ${
                    layoutMode === 'A4'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-lg'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Layout className="w-3.5 h-3.5" />
                  <span>A4 পেজ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode('POS')}
                  className={`py-2 px-1 rounded-xl font-bold text-[10px] flex flex-col items-center justify-center space-y-1 border transition-all cursor-pointer ${
                    layoutMode === 'POS'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-lg'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>POS (80mm)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode('POS_58')}
                  className={`py-2 px-1 rounded-xl font-bold text-[10px] flex flex-col items-center justify-center space-y-1 border transition-all cursor-pointer ${
                    layoutMode === 'POS_58'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-lg'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>POS (58mm)</span>
                </button>
              </div>
            </div>

            {type === 'invoice' && (
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">রশিদ কলাম কনফিগারেশন (Column Visibility)</p>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2.5 text-xs font-semibold text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showUnitPrice}
                      onChange={(e) => setShowUnitPrice(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-blue-500 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                    />
                    <span>Unit Price (একক মূল্য)</span>
                  </label>
                  <label className="flex items-center space-x-2.5 text-xs font-semibold text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDiscount}
                      onChange={(e) => setShowDiscount(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-blue-500 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                    />
                    <span>Discount (ছাড় বিবরণ)</span>
                  </label>
                  <label className="flex items-center space-x-2.5 text-xs font-semibold text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showTax}
                      onChange={(e) => setShowTax(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-blue-500 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                    />
                    <span>Tax Column (ভ্যাট / ট্যাক্স)</span>
                  </label>
                </div>
              </div>
            )}

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
            className={`print-section bg-white text-slate-900 shadow-xl transition-all duration-300 ${
              layoutMode === 'A4' ? 'w-full max-w-[210mm] min-h-[297mm] rounded-2xl p-6 font-sans' : 
              layoutMode === 'POS' ? 'w-full max-w-[80mm] text-xs rounded-xl p-4 font-sans' : 
              'w-full max-w-[58mm] text-[10px] p-2 rounded-lg font-mono leading-tight tracking-tighter'
            }`}
            style={layoutMode === 'POS_58' ? { fontSize: '9px', lineHeight: '1.15', wordBreak: 'break-all' } : {}}
            id="printable-content"
          >
            {layoutMode === 'POS_58' ? (
              <div className="text-black space-y-4 select-none font-mono tracking-tighter text-[9px] leading-tight">
                {type === 'invoice' && data.invoices && Array.isArray(data.invoices) ? (
                  <div className="space-y-6">
                    {data.invoices.map((inv: any, idx: number) => (
                      <div 
                        key={inv.id} 
                        className={`${idx > 0 ? 'border-t border-dashed border-black pt-4 mt-4 print:break-before-page' : ''}`}
                        style={idx > 0 ? { breakBefore: 'page', pageBreakBefore: 'always' } : {}}
                      >
                        {/* 58mm Header */}
                        <div className="text-center font-bold uppercase space-y-0.5">
                          <p className="text-[11px] font-black">SAMIRA TRADERS</p>
                          <p className="text-[7px] font-normal tracking-normal text-gray-600">Barguna Sadar | Phone: 01712-345678</p>
                          <div className="border-y border-black py-0.5 my-1 text-[7px] font-bold">
                            SALES INVOICE ({idx + 1}/{data.invoices.length})
                          </div>
                        </div>

                        {/* 58mm Meta */}
                        <div className="space-y-0.5 text-[8px] text-left">
                          <p><strong>MEMO:</strong> {inv.invoiceNo}</p>
                          <p><strong>DATE:</strong> {inv.date}</p>
                          <p><strong>CUST:</strong> {inv.shopName}</p>
                          {inv.route && <p><strong>ROUTE:</strong> {inv.route}</p>}
                          <p><strong>CO:</strong> {inv.companyName}</p>
                        </div>

                        {/* 58mm Table separator */}
                        <div className="border-t border-dashed border-black my-1"></div>

                        {/* 58mm Product items */}
                        <div className="space-y-1 text-[8px] text-left">
                          {(inv.items || []).map((item: any, itemIdx: number) => {
                            const taxAmt = (item.total || 0) * 0.05;
                            return (
                              <div key={itemIdx} className="flex justify-between items-start gap-1">
                                <div className="flex-1 min-w-0">
                                  <p className="font-bold truncate">{item.name}</p>
                                  <p className="text-[7px] text-gray-700">
                                    {item.qty} Pcs
                                    {showUnitPrice && ` x ৳${item.price}`}
                                    {showDiscount && ` (Disc: ৳0)`}
                                    {showTax && ` (Tax: ৳${taxAmt.toFixed(1)})`}
                                  </p>
                                </div>
                                <span className="font-bold shrink-0">৳{item.total?.toLocaleString()}</span>
                              </div>
                            );
                          })}
                        </div>

                        <div className="border-t border-dashed border-black my-1"></div>

                        {/* 58mm Totals */}
                        <div className="space-y-0.5 text-[8px] font-bold text-right max-w-[140px] ml-auto">
                          <div className="flex justify-between">
                            <span>Subtotal:</span>
                            <span>৳{inv.subTotal?.toLocaleString()}</span>
                          </div>
                          {inv.discount > 0 && (
                            <div className="flex justify-between text-rose-700">
                              <span>Discount:</span>
                              <span>-৳{inv.discount?.toLocaleString()}</span>
                            </div>
                          )}
                          <div className="flex justify-between border-t border-black pt-0.5 text-[9px] font-black">
                            <span>Total:</span>
                            <span>৳{inv.grandTotal?.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-emerald-800">
                            <span>Paid:</span>
                            <span>৳{inv.paymentReceived?.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between border-t border-dashed border-black pt-0.5 text-red-700 font-black">
                            <span>Due:</span>
                            <span>৳{(inv.grandTotal - inv.paymentReceived)?.toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="text-center text-[7px] mt-4 pt-1 border-t border-dashed border-black uppercase font-bold">
                          Thank you! Samira Traders
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    {type === 'invoice' && (
                      <div>
                        {/* 58mm Header */}
                        <div className="text-center font-bold uppercase space-y-0.5">
                          <p className="text-[11px] font-black">SAMIRA TRADERS</p>
                          <p className="text-[7px] font-normal tracking-normal text-gray-600">Barguna Sadar | Phone: 01712-345678</p>
                          <div className="border-y border-black py-0.5 my-1 text-[7px] font-bold">
                            SALES INVOICE
                          </div>
                        </div>

                        {/* 58mm Meta */}
                        <div className="space-y-0.5 text-[8px] text-left">
                          <p><strong>MEMO:</strong> {data.invoiceNo}</p>
                          <p><strong>DATE:</strong> {data.date}</p>
                          <p><strong>CUST:</strong> {data.shopName}</p>
                          {data.route && <p><strong>ROUTE:</strong> {data.route}</p>}
                          <p><strong>CO:</strong> {data.companyName}</p>
                        </div>

                        {/* 58mm Table separator */}
                        <div className="border-t border-dashed border-black my-1"></div>

                        {/* 58mm Product items */}
                        <div className="space-y-1 text-[8px] text-left">
                          {(data.items || []).map((item: any, itemIdx: number) => {
                            const taxAmt = (item.total || 0) * 0.05;
                            return (
                              <div key={itemIdx} className="flex justify-between items-start gap-1">
                                <div className="flex-1 min-w-0">
                                  <p className="font-bold truncate">{item.name}</p>
                                  <p className="text-[7px] text-gray-700">
                                    {item.qty} Pcs
                                    {showUnitPrice && ` x ৳${item.price}`}
                                    {showDiscount && ` (Disc: ৳0)`}
                                    {showTax && ` (Tax: ৳${taxAmt.toFixed(1)})`}
                                  </p>
                                </div>
                                <span className="font-bold shrink-0">৳{item.total?.toLocaleString()}</span>
                              </div>
                            );
                          })}
                        </div>

                        <div className="border-t border-dashed border-black my-1"></div>

                        {/* 58mm Totals */}
                        <div className="space-y-0.5 text-[8px] font-bold text-right max-w-[140px] ml-auto">
                          <div className="flex justify-between">
                            <span>Subtotal:</span>
                            <span>৳{data.subTotal?.toLocaleString()}</span>
                          </div>
                          {data.discount > 0 && (
                            <div className="flex justify-between text-rose-700">
                              <span>Discount:</span>
                              <span>-৳{data.discount?.toLocaleString()}</span>
                            </div>
                          )}
                          <div className="flex justify-between border-t border-black pt-0.5 text-[9px] font-black">
                            <span>Total:</span>
                            <span>৳{data.grandTotal?.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-emerald-800">
                            <span>Paid:</span>
                            <span>৳{data.paymentReceived?.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between border-t border-dashed border-black pt-0.5 text-red-700 font-black">
                            <span>Due:</span>
                            <span>৳{(data.grandTotal - data.paymentReceived)?.toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="text-center text-[7px] mt-4 pt-1 border-t border-dashed border-black uppercase font-bold">
                          Thank you! Samira Traders
                        </div>
                      </div>
                    )}

                    {type === 'settlement' && (
                      <div>
                        {/* 58mm Header */}
                        <div className="text-center font-bold uppercase space-y-0.5">
                          <p className="text-[11px] font-black">SAMIRA TRADERS</p>
                          <div className="border-y border-black py-0.5 my-1 text-[7px] font-bold">
                            DSR SETTLEMENT RECEIPT
                          </div>
                        </div>

                        {/* 58mm Meta */}
                        <div className="space-y-0.5 text-[8px] text-left">
                          <p><strong>ID:</strong> {data.id}</p>
                          <p><strong>DATE:</strong> {data.date || new Date().toISOString().split('T')[0]}</p>
                          <p><strong>DSR:</strong> {data.dsrName}</p>
                          <p><strong>ROUTE:</strong> {data.route || 'N/A'}</p>
                        </div>

                        <div className="border-t border-dashed border-black my-1"></div>

                        {/* 58mm Settlement Values */}
                        <div className="space-y-1 text-[8px] text-left font-bold">
                          <div className="flex justify-between font-normal">
                            <span>Total Cartons:</span>
                            <span>{data.totalCartons || 0} CTN</span>
                          </div>
                          <div className="flex justify-between font-normal">
                            <span>Total Sales Value:</span>
                            <span>৳{data.totalSales?.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Cash Collected:</span>
                            <span>৳{data.cashCollected?.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Market Dues:</span>
                            <span>৳{data.marketDues?.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between font-black border-t border-dashed border-black pt-0.5">
                            <span>Cash Shortage:</span>
                            <span>৳{data.shortageAmount?.toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="text-center text-[7px] mt-4 pt-1 border-t border-dashed border-black uppercase font-bold">
                          HISAAB APPROVED
                        </div>
                      </div>
                    )}

                    {type === 'ledger' && (
                      <div>
                        {/* 58mm Header */}
                        <div className="text-center font-bold uppercase space-y-0.5">
                          <p className="text-[11px] font-black">SAMIRA TRADERS</p>
                          <div className="border-y border-black py-0.5 my-1 text-[7px] font-bold">
                            CUSTOMER LEDGER
                          </div>
                        </div>

                        {/* 58mm Meta */}
                        <div className="space-y-0.5 text-[8px] text-left">
                          <p><strong>SHOP:</strong> {data.shopName || data.name}</p>
                          <p><strong>OWNER:</strong> {data.name}</p>
                          <p><strong>ROUTE:</strong> {data.route || 'N/A'}</p>
                          <p><strong>DATE:</strong> {new Date().toLocaleDateString()}</p>
                        </div>

                        <div className="border-t border-dashed border-black my-1"></div>

                        {/* 58mm Ledger Details */}
                        <div className="space-y-1 text-[8px] text-left font-bold">
                          {Object.entries(data.dues || {}).map(([cId, due]: any) => (
                            <div key={cId} className="flex justify-between">
                              <span className="text-gray-600 font-normal">Company ID: {cId}</span>
                              <span>৳{due.toLocaleString()}</span>
                            </div>
                          ))}
                          <div className="flex justify-between font-black border-t border-black pt-0.5 text-[9px]">
                            <span>TOTAL DUE:</span>
                            <span>৳{data.totalDue?.toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="text-center text-[7px] mt-4 pt-1 border-t border-dashed border-black uppercase font-bold">
                          STATEMENT VERIFIED
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              type === 'invoice' && data.invoices && Array.isArray(data.invoices) ? (
                <div className="space-y-12 print:space-y-0">
                  {data.invoices.map((inv: any, idx: number) => (
                    <div 
                      key={inv.id} 
                      className={`${idx > 0 ? 'border-t-2 border-dashed border-slate-300 pt-10 print:border-t-0 print:pt-0 print:break-before-page' : ''}`}
                      style={idx > 0 ? { breakBefore: 'page', pageBreakBefore: 'always' } : {}}
                    >
                      {/* Header Brand */}
                      <div className="text-center space-y-1 mb-4 pb-3 border-b border-gray-200">
                        <h2 className="text-base font-black text-slate-900 tracking-tight">সামীরা ট্রেডার্স (Samira Traders)</h2>
                        <p className="text-[10px] text-gray-500 font-medium">প্রোপ্রাইটার: আলহাজ্ব মো: সমির উদ্দিন</p>
                        <p className="text-[9px] text-gray-400">রুট ডিস্ট্রিবিউশন অ্যান্ড হোলসেল পার্টনার, নেত্রকোনা</p>
                        <p className="text-[9px] text-gray-400">মোবাইল: ০১৭১৫-XXXXXX, ০১৮১৯-XXXXXX</p>
                        <div className="inline-block bg-slate-100 text-slate-800 font-bold px-2 py-0.5 rounded text-[8px] uppercase tracking-wider mt-1.5 font-sans">
                          বিক্রয় ইনভয়েস মেমো (Sales Invoice Memo) - {idx + 1}/{data.invoices.length}
                        </div>
                      </div>

                      {/* Structured Invoice View */}
                      <div className="space-y-4 text-left">
                        <div className="grid grid-cols-2 gap-2 text-[9px] text-gray-600 border-b pb-2">
                          <div>
                            <p><strong className="text-slate-900">মেমো নং:</strong> <span className="font-mono font-bold">{inv.invoiceNo || inv.id}</span></p>
                            <p><strong className="text-slate-900">তারিখ:</strong> {inv.date}</p>
                            <p><strong className="text-slate-900">রুট/এরিয়া:</strong> {inv.route || 'N/A'}</p>
                          </div>
                          <div className="text-right">
                            <p><strong className="text-slate-900">গ্রাহক:</strong> {inv.shopName || 'Spot Client'}</p>
                            <p><strong className="text-slate-900">মালিক:</strong> {inv.customerName || 'Spot Client'}</p>
                            <p><strong className="text-slate-900">কোম্পানি:</strong> {inv.companyName || 'N/A'}</p>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">পণ্য তালিকা ও বিল বিবরণী:</p>
                          <table className="w-full text-left text-[9px] border-collapse">
                            <thead>
                              <tr className="border-b border-gray-200 bg-slate-50 text-gray-500 font-bold">
                                <th className="py-1 px-1">আইটেম নাম</th>
                                <th className="py-1 px-1 text-center">পরিমাণ</th>
                                {showUnitPrice && <th className="py-1 px-1 text-right">দর (Unit Price)</th>}
                                {showDiscount && <th className="py-1 px-1 text-right">ছাড় (Discount)</th>}
                                {showTax && <th className="py-1 px-1 text-right">ট্যাক্স (Tax 5%)</th>}
                                <th className="py-1 px-1 text-right">মোট (Total)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 font-medium">
                              {(inv.items || []).map((item: any, itemIdx: number) => {
                                const taxAmt = (item.total || 0) * 0.05;
                                return (
                                  <tr key={itemIdx}>
                                    <td className="py-1 px-1 font-bold text-slate-800">{item.name}</td>
                                    <td className="py-1 px-1 text-center">{item.qty} পিস</td>
                                    {showUnitPrice && <td className="py-1 px-1 text-right">৳{item.price}</td>}
                                    {showDiscount && <td className="py-1 px-1 text-right text-rose-600">৳0.00</td>}
                                    {showTax && <td className="py-1 px-1 text-right text-gray-500">৳{taxAmt.toFixed(2)}</td>}
                                    <td className="py-1 px-1 text-right font-bold">৳{item.total?.toLocaleString()}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="border-t pt-2 text-[9px] font-bold space-y-1 text-right max-w-xs ml-auto">
                          <div className="flex justify-between">
                            <span className="text-gray-400">সাব-টোটাল:</span>
                            <span>৳{inv.subTotal?.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-rose-600">
                            <span>ডিসকাউন্ট:</span>
                            <span>-৳{inv.discount?.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between border-t pt-1 text-slate-950 font-black">
                            <span>সর্বমোট বিল:</span>
                            <span>৳{inv.grandTotal?.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-emerald-700">
                            <span>আজ নগদ জমা:</span>
                            <span>৳{inv.paymentReceived?.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between border-t border-dashed pt-1 text-red-600 font-black">
                            <span>বাকি/বকেয়া:</span>
                            <span>৳{(inv.grandTotal - inv.paymentReceived)?.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

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
                  ))}
                </div>
              ) : (
                <>
                  {/* Header Brand */}
                  <div className="text-center space-y-1 mb-4 pb-3 border-b border-gray-200">
                    <h2 className="text-base font-black text-slate-900 tracking-tight">সামীরা ট্রেডার্স (Samira Traders)</h2>
                    <p className="text-[10px] text-gray-500 font-medium">প্রোপ্রাইটার: আলহাজ্ব মো: সমির উদ্দিন</p>
                    <p className="text-[9px] text-gray-400">রুট ডিস্ট্রিবিউশন অ্যান্ড হোলসেল পার্টনার, নেত্রকোনা</p>
                    <p className="text-[9px] text-gray-400">মোবাইল: ০১৭১৫-XXXXXX, ০১৮১৯-XXXXXX</p>
                    <div className="inline-block bg-slate-100 text-slate-800 font-bold px-2 py-0.5 rounded text-[8px] uppercase tracking-wider mt-1.5 font-sans">
                      {title}
                    </div>
                  </div>

                  {/* Structured Invoice View */}
                  {type === 'invoice' && (
                    <div className="space-y-4 text-left">
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
                              {showUnitPrice && <th className="py-1 px-1 text-right">দর (Unit Price)</th>}
                              {showDiscount && <th className="py-1 px-1 text-right">ছাড় (Discount)</th>}
                              {showTax && <th className="py-1 px-1 text-right">ট্যাক্স (Tax 5%)</th>}
                              <th className="py-1 px-1 text-right">মোট (Total)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 font-medium">
                            {(data.items || []).map((item: any, idx: number) => {
                              const taxAmt = (item.total || 0) * 0.05;
                              return (
                                <tr key={idx}>
                                  <td className="py-1 px-1 font-bold text-slate-800">{item.name}</td>
                                  <td className="py-1 px-1 text-center">{item.qty} পিস</td>
                                  {showUnitPrice && <td className="py-1 px-1 text-right">৳{item.price}</td>}
                                  {showDiscount && <td className="py-1 px-1 text-right text-rose-600">৳0.00</td>}
                                  {showTax && <td className="py-1 px-1 text-right text-gray-500">৳{taxAmt.toFixed(2)}</td>}
                                  <td className="py-1 px-1 text-right font-bold">৳{item.total?.toLocaleString()}</td>
                                </tr>
                              );
                            })}
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
                    <div className="space-y-4 text-[9px] text-left">
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
                    <div className="space-y-4 text-left">
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
                </>
              )
            )}

          </div>

        </div>

      </div>
    </div>
  );
}
