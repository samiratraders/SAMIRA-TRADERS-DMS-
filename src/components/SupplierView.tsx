/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Truck, Plus, Search, Phone, MapPin, Building2, Save, X, RefreshCw, Trash2, Coins, CheckCircle } from 'lucide-react';
import { collection, getDocs, setDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Supplier, Company } from '../types';

export default function SupplierView() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkPayments, setBulkPayments] = useState<{ [supplierId: string]: number }>({});

  // New Supplier Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [companyId, setCompanyId] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch companies and suppliers in parallel
      const [compSnap, supSnap] = await Promise.all([
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'suppliers'))
      ]);

      const compList: Company[] = [];
      compSnap.forEach(d => compList.push(d.data() as Company));
      setCompanies(compList);

      const supList: any[] = [];
      supSnap.forEach(d => {
        const data = d.data();
        supList.push({
          ...data,
          outstandingBalance: data.outstandingBalance !== undefined ? data.outstandingBalance : 75000
        });
      });
      setSuppliers(supList);
    } catch (err) {
      console.error('Error loading supplier data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSupplier = async (supplierId: string, supplierName: string) => {
    const isConfirmed = window.confirm(`Are you sure you want to permanently delete supplier "${supplierName}"? This action cannot be undone.`);
    if (!isConfirmed) return;

    try {
      setLoading(true);
      await deleteDoc(doc(db, 'suppliers', supplierId));
      alert(`Supplier "${supplierName}" deleted successfully.`);
      loadData();
    } catch (err) {
      console.error('Error deleting supplier:', err);
      alert('Failed to delete supplier from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !companyId) {
      alert('Supplier Name and Brand Company are required!');
      return;
    }

    try {
      const selectedComp = companies.find(c => c.id === companyId);
      const companyName = selectedComp ? selectedComp.name : 'Unknown Company';
      const id = 'sup-' + Date.now();

      const supplierObj: Supplier = {
        id,
        name,
        phone: phone || '01700000000',
        address: address || 'Barishal Division',
        companyId,
        companyName,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'suppliers', id), supplierObj);
      setIsAddModalOpen(false);
      // Reset form
      setName('');
      setPhone('');
      setAddress('');
      setCompanyId('');
      loadData();
    } catch (err) {
      console.error('Error creating supplier:', err);
    }
  };

  const handleBulkPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const batch = writeBatch(db);
      let paymentCount = 0;

      Object.keys(bulkPayments).forEach(supId => {
        const amount = bulkPayments[supId];
        if (amount && amount > 0) {
          const supplier = suppliers.find(s => s.id === supId);
          if (supplier) {
            const currentBalance = supplier.outstandingBalance !== undefined ? supplier.outstandingBalance : 75000;
            const newBalance = Math.max(0, currentBalance - amount);
            
            // Update supplier outstanding balance
            batch.update(doc(db, 'suppliers', supId), {
              outstandingBalance: newBalance
            });
            paymentCount++;
          }
        }
      });

      if (paymentCount === 0) {
        alert('দয়া করে অন্তত একটি সাপ্লায়ারের ঘরে পেমেন্ট এমাউন্ট প্রদান করুন!');
        setLoading(false);
        return;
      }

      await batch.commit();
      alert(`সফলভাবে ${paymentCount} টি সাপ্লায়ারের বাল্ক পেমেন্ট এন্ট্রি সেভ করা হয়েছে!`);
      setIsBulkModalOpen(false);
      setBulkPayments({});
      loadData();
    } catch (err) {
      console.error('Error recording bulk supplier payments:', err);
      alert('বাল্ক পেমেন্ট সেভ করতে সমস্যা হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  const getBulkTotal = () => {
    let total = 0;
    Object.values(bulkPayments).forEach(v => {
      total += Number(v) || 0;
    });
    return total;
  };

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.companyName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6" id="suppliers-module">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Suppliers Register</h2>
          <p className="text-sm text-gray-500">Record supplier details for purchasing inventory from companies</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              const initial: { [supplierId: string]: number } = {};
              suppliers.forEach(s => {
                if ((s.outstandingBalance !== undefined ? s.outstandingBalance : 75000) > 0) {
                  initial[s.id] = 0;
                }
              });
              setBulkPayments(initial);
              setIsBulkModalOpen(true);
            }}
            className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm cursor-pointer"
          >
            <Coins className="w-4 h-4" />
            <span>বাল্ক সাপ্লায়ার পেমেন্ট (Bulk Payment)</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            id="btn-add-supplier"
            className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Supplier</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="relative">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search suppliers by name or partner company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            id="input-supplier-search"
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-500">Syncing supplier register...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No suppliers recorded</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="suppliers-grid">
          {filtered.map(sup => (
            <div key={sup.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm" id={`supplier-card-${sup.id}`}>
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                  <Truck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 leading-tight text-base">{sup.name}</h3>
                  <p className="text-xs text-gray-400 flex items-center mt-1">
                    <Building2 className="w-3.5 h-3.5 mr-1" />
                    <span>{sup.companyName}</span>
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-xs text-gray-600 border-t border-slate-50 pt-4">
                {sup.phone && (
                  <div className="flex items-center">
                    <Phone className="w-3.5 h-3.5 mr-2 text-gray-400" />
                    <span>Phone: {sup.phone}</span>
                  </div>
                )}
                {sup.address && (
                  <div className="flex items-center">
                    <MapPin className="w-3.5 h-3.5 mr-2 text-gray-400" />
                    <span>Address: {sup.address}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-50 flex justify-end">
                <button
                  onClick={() => handleDeleteSupplier(sup.id, sup.name)}
                  className="flex items-center space-x-1 text-xs text-rose-500 hover:text-rose-600 font-bold cursor-pointer transition-colors"
                  title="Delete Supplier Representative"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Supplier</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Register Supplier Representative</h3>
            <form onSubmit={handleCreateSupplier} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Supplier/Contact Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. M/S Kamal Traders"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Brand Company Association *</label>
                <select
                  required
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="">Select Company Partner</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Representative Phone</label>
                <input
                  type="text"
                  placeholder="e.g. 01711223344"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Business Address</label>
                <input
                  type="text"
                  placeholder="e.g. Amtali, Barguna"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
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
                  <Save className="w-4 h-4" />
                  <span>Save Supplier</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Supplier Payments Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative border border-slate-100">
            <button 
              type="button"
              onClick={() => setIsBulkModalOpen(false)} 
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 text-gray-400 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                <Coins className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 leading-tight">বাল্ক সাপ্লায়ার পেমেন্ট এন্ট্রি</h3>
                <p className="text-xs text-gray-400">যে সকল সাপ্লায়ারের বকেয়া আছে তাদের একসাথে পেমেন্ট পরিশোধ রশিদ এন্ট্রি করুন</p>
              </div>
            </div>

            <form onSubmit={handleBulkPaymentSubmit} className="space-y-4">
              <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50 max-h-[350px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-gray-500 font-bold border-b">
                    <tr>
                      <th className="p-3">সাপ্লায়ার / কোম্পানি</th>
                      <th className="p-3 text-right">বকেয়া পরিমাণ</th>
                      <th className="p-3 text-center">পরিশোধ এমাউন্ট (৳)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
                    {suppliers.filter(s => (s.outstandingBalance !== undefined ? s.outstandingBalance : 75000) > 0).map(sup => {
                      const bal = sup.outstandingBalance !== undefined ? sup.outstandingBalance : 75000;
                      return (
                        <tr key={sup.id} className="hover:bg-slate-50/50">
                          <td className="p-3">
                            <p className="font-bold text-slate-900">{sup.name}</p>
                            <p className="text-[10px] text-gray-400">{sup.companyName}</p>
                          </td>
                          <td className="p-3 text-right font-black text-rose-700">
                            ৳{bal.toLocaleString()}
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              max={bal}
                              placeholder="৳0"
                              value={bulkPayments[sup.id] || ''}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setBulkPayments(prev => ({
                                  ...prev,
                                  [sup.id]: val
                                }));
                              }}
                              className="w-32 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold font-mono text-center text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs">
                  <span className="text-gray-400">সর্বমোট পেমেন্ট পোস্টিং:</span>
                  <strong className="text-slate-900 text-base font-black ml-1.5 font-mono">
                    ৳{getBulkTotal().toLocaleString()}
                  </strong>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsBulkModalOpen(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-gray-600 px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                  >
                    বাতিল করুন
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-black flex items-center space-x-1.5 cursor-pointer transition-all shadow-md shadow-emerald-600/10"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>একসাথে সেভ করুন (Save All)</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
