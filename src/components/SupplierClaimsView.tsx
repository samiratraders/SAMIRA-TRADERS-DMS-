/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Plus, 
  CheckCircle, 
  XCircle, 
  History, 
  Printer, 
  TrendingDown, 
  Coins, 
  RefreshCw,
  Gift,
  Tag
} from 'lucide-react';
import { collection, getDocs, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Supplier } from '../types';

interface Claim {
  id: string;
  supplierId: string;
  supplierName: string;
  companyName: string;
  month: string; // e.g. "2026-06"
  freeProductValue: number;
  discountValue: number;
  totalClaimAmount: number;
  notes: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy?: string;
  approvalDate?: string;
  createdAt: string;
}

export default function SupplierClaimsView() {
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form states
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [month, setMonth] = useState('2026-06');
  const [freeProductValue, setFreeProductValue] = useState(0);
  const [discountValue, setDiscountValue] = useState(0);
  const [notes, setNotes] = useState('');

  // Selected claim for print bill
  const [selectedClaimForBill, setSelectedClaimForBill] = useState<Claim | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [supSnap, claimSnap] = await Promise.all([
        getDocs(collection(db, 'suppliers')),
        getDocs(collection(db, 'supplierClaims'))
      ]);

      const supList: any[] = [];
      supSnap.forEach(d => {
        const data = d.data();
        supList.push({
          ...data,
          // default outstanding balance to 50000 if not set, for demo
          outstandingBalance: data.outstandingBalance !== undefined ? data.outstandingBalance : 75000
        });
      });
      setSuppliers(supList);

      const claimList: Claim[] = [];
      claimSnap.forEach(d => claimList.push(d.data() as Claim));
      setClaims(claimList);
    } catch (err) {
      console.error('Error loading claims data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) {
      alert('Supplier selection is required!');
      return;
    }

    const sup = suppliers.find(s => s.id === selectedSupplierId);
    if (!sup) return;

    try {
      setLoading(true);
      const id = 'claim-' + Date.now();
      const totalClaim = freeProductValue + discountValue;

      const newClaim: Claim = {
        id,
        supplierId: sup.id,
        supplierName: sup.name,
        companyName: sup.companyName,
        month,
        freeProductValue,
        discountValue,
        totalClaimAmount: totalClaim,
        notes,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'supplierClaims', id), newClaim);
      setIsAddModalOpen(false);
      // Reset form
      setSelectedSupplierId('');
      setFreeProductValue(0);
      setDiscountValue(0);
      setNotes('');
      
      alert('Claim request submitted successfully!');
      loadData();
    } catch (err) {
      console.error('Error saving claim:', err);
      alert('Failed to save claim.');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessClaim = async (claimId: string, status: 'APPROVED' | 'REJECTED') => {
    const claim = claims.find(c => c.id === claimId);
    if (!claim) return;

    const actionText = status === 'APPROVED' ? 'approve' : 'reject';
    const isConfirmed = window.confirm(`Are you sure you want to ${actionText} this claim for ৳${claim.totalClaimAmount.toLocaleString()}?`);
    if (!isConfirmed) return;

    try {
      setLoading(true);
      const batch = writeBatch(db);

      // 1. Update claim status
      const claimRef = doc(db, 'supplierClaims', claimId);
      batch.update(claimRef, {
        status,
        approvedBy: 'Admin / Manager',
        approvalDate: new Date().toISOString()
      });

      // 2. If APPROVED, decrease supplier's outstanding balance
      if (status === 'APPROVED') {
        const sup = suppliers.find(s => s.id === claim.supplierId);
        if (sup) {
          const currentBal = sup.outstandingBalance || 0;
          const updatedBal = Math.max(0, currentBal - claim.totalClaimAmount);
          
          const supRef = doc(db, 'suppliers', claim.supplierId);
          // Also set the field on firestore doc
          batch.set(supRef, {
            ...sup,
            outstandingBalance: updatedBal
          });
        }
      }

      await batch.commit();
      alert(`Claim has been successfully ${status.toLowerCase()}!`);
      loadData();
    } catch (err) {
      console.error('Error processing claim approval:', err);
      alert('Error updating claim workflow.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintBill = (claim: Claim) => {
    setSelectedClaimForBill(claim);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  return (
    <div className="space-y-6" id="supplier-claims-module">
      {/* Print View Wrapper */}
      {selectedClaimForBill && (
        <div className="hidden print:block fixed inset-0 bg-white z-50 p-10 font-sans text-slate-900" id="print-bill-container">
          <div className="text-center border-b pb-4 mb-6">
            <h1 className="text-2xl font-black text-blue-900 uppercase">SAMIRA TRADERS</h1>
            <p className="text-xs text-gray-500">Barguna Sadar, Barguna | Phone: 01712-345678</p>
            <h2 className="text-lg font-bold mt-2 text-slate-800">MONTHLY SUPPLIER CLAIM BILL</h2>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-xs mb-6">
            <div>
              <p><strong>Supplier:</strong> {selectedClaimForBill.supplierName}</p>
              <p><strong>Company Brand:</strong> {selectedClaimForBill.companyName}</p>
              <p><strong>Billing Month:</strong> {selectedClaimForBill.month}</p>
            </div>
            <div className="text-right">
              <p><strong>Claim Ref ID:</strong> {selectedClaimForBill.id}</p>
              <p><strong>Created Date:</strong> {new Date(selectedClaimForBill.createdAt).toLocaleDateString()}</p>
              <p><strong>Status:</strong> {selectedClaimForBill.status}</p>
            </div>
          </div>

          <table className="w-full text-xs border border-collapse mb-6">
            <thead>
              <tr className="bg-slate-100 text-left border-b font-bold">
                <th className="p-3 border">Description of Allowance</th>
                <th className="p-3 border text-right">Value (৳)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3 border">Free Products (Offer values / sample claims)</td>
                <td className="p-3 border text-right font-mono">৳{selectedClaimForBill.freeProductValue.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="p-3 border">Promotional Discounts / Commission Allowances</td>
                <td className="p-3 border text-right font-mono">৳{selectedClaimForBill.discountValue.toLocaleString()}</td>
              </tr>
              <tr className="bg-slate-50 font-bold text-sm">
                <td className="p-3 border">Total Claim Value:</td>
                <td className="p-3 border text-right font-mono text-emerald-800">৳{selectedClaimForBill.totalClaimAmount.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <div className="mt-8 text-xs text-gray-500">
            <p><strong>Notes:</strong> {selectedClaimForBill.notes || 'No notes provided.'}</p>
          </div>

          <div className="mt-20 flex justify-between text-xs pt-4">
            <div className="border-t w-40 text-center">Supplier Signature</div>
            <div className="border-t w-40 text-center">Authorized Signature</div>
          </div>
          <button 
            onClick={() => setSelectedClaimForBill(null)} 
            className="print:hidden mt-6 bg-slate-800 text-white px-4 py-2 rounded-lg text-xs"
          >
            Close Print View
          </button>
        </div>
      )}

      {/* Main View */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Supplier Claim Ledger</h2>
          <p className="text-sm text-gray-500">Track and generate free product allowances, promotional discounts, and claims bills</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          id="btn-add-claim"
          className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Claim Request</span>
        </button>
      </div>

      {/* Grid of Supplier outstanding balances */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {suppliers.map(sup => (
          <div key={sup.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{sup.companyName}</span>
              <h3 className="text-base font-bold text-slate-800">{sup.name}</h3>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Outstanding Balance</p>
              <h4 className="text-lg font-black text-rose-600">৳{(sup.outstandingBalance || 0).toLocaleString()}</h4>
            </div>
          </div>
        ))}
      </div>

      {/* Claims List Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="font-extrabold text-sm text-slate-700 tracking-wide flex items-center">
            <History className="w-4 h-4 text-blue-600 mr-2" />
            <span>Claims Approval History & Pipeline</span>
          </h3>
          <button onClick={loadData} className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
            <p className="text-xs">Processing database claims...</p>
          </div>
        ) : claims.length === 0 ? (
          <div className="p-16 text-center text-gray-400">
            <FileText className="w-12 h-12 mx-auto text-gray-200 mb-3" />
            <p className="font-semibold text-sm">No claims submitted yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 text-[10px] text-gray-500 font-bold uppercase tracking-wider border-b border-gray-100">
                <tr>
                  <th className="p-4">Supplier & Brand</th>
                  <th className="p-4">Billing Period</th>
                  <th className="p-4 text-right">Free Product Allowance</th>
                  <th className="p-4 text-right">Discount Allowance</th>
                  <th className="p-4 text-right">Total Claim</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Actions / Reports</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {claims.map(claim => (
                  <tr key={claim.id} className="hover:bg-slate-50/40">
                    <td className="p-4">
                      <p className="font-bold text-slate-900">{claim.supplierName}</p>
                      <p className="text-[10px] text-gray-400">{claim.companyName}</p>
                    </td>
                    <td className="p-4 font-semibold text-slate-600">{claim.month}</td>
                    <td className="p-4 text-right font-mono text-emerald-700 font-semibold">৳{claim.freeProductValue.toLocaleString()}</td>
                    <td className="p-4 text-right font-mono text-blue-700 font-semibold">৳{claim.discountValue.toLocaleString()}</td>
                    <td className="p-4 text-right font-black font-mono text-slate-900">৳{claim.totalClaimAmount.toLocaleString()}</td>
                    <td className="p-4 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        claim.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        claim.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {claim.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center space-x-2">
                        {claim.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleProcessClaim(claim.id, 'APPROVED')}
                              className="flex items-center space-x-1 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() => handleProcessClaim(claim.id, 'REJECTED')}
                              className="flex items-center space-x-1 text-[10px] bg-rose-50 text-rose-600 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer border border-rose-200"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handlePrintBill(claim)}
                          className="flex items-center space-x-1 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Print Bill</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Claim Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative border border-gray-100">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100">
              <XCircle className="w-5 h-5 text-gray-400" />
            </button>
            <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center">
              <Gift className="w-5 h-5 text-blue-600 mr-2" />
              <span>Submit New Claim Bill</span>
            </h3>
            
            <form onSubmit={handleCreateClaim} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Select Supplier Partnership *</label>
                <select
                  required
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
                >
                  <option value="">Choose Supplier</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.companyName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Billing Month *</label>
                <input
                  type="month"
                  required
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Free Products Value (৳)</label>
                  <div className="relative">
                    <Gift className="w-4 h-4 text-gray-400 absolute left-2.5 top-3" />
                    <input
                      type="number"
                      min="0"
                      value={freeProductValue || ''}
                      onChange={(e) => setFreeProductValue(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full pl-8 pr-2.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold font-mono text-emerald-800"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Promotional Discounts (৳)</label>
                  <div className="relative">
                    <Tag className="w-4 h-4 text-gray-400 absolute left-2.5 top-3" />
                    <input
                      type="number"
                      min="0"
                      value={discountValue || ''}
                      onChange={(e) => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full pl-8 pr-2.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold font-mono text-blue-800"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Claim Explanations & Ref</label>
                <textarea
                  placeholder="e.g., June Promotional allowance for 10% free stock on product 'Cocoa'"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="bg-slate-100 text-gray-600 px-4 py-2.5 rounded-lg text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <span>Submit Claim Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
