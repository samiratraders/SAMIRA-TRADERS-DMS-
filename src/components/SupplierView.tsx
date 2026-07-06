/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Truck, 
  Plus, 
  Search, 
  Phone, 
  MapPin, 
  Building2, 
  Save, 
  X, 
  RefreshCw, 
  Trash2, 
  Coins, 
  CheckCircle, 
  Edit, 
  PlusCircle,
  FileText
} from 'lucide-react';
import { collection, getDocs, setDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Supplier, Company } from '../types';

export default function SupplierView() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkPayments, setBulkPayments] = useState<{ [supplierId: string]: number }>({});
  const [selectedSupplierForEdit, setSelectedSupplierForEdit] = useState<any | null>(null);

  // Form State - Add Supplier
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [initialBalance, setInitialBalance] = useState<number>(0);

  // Form State - Edit Supplier
  const [editName, setEditName] = useState('');
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editCompanyCode, setEditCompanyCode] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editOutstandingBalance, setEditOutstandingBalance] = useState<number>(0);

  const loadData = async () => {
    try {
      setLoading(true);
      const supSnap = await getDocs(collection(db, 'suppliers'));

      const supList: any[] = [];
      supSnap.forEach(d => {
        const data = d.data();
        supList.push({
          ...data,
          outstandingBalance: data.outstandingBalance !== undefined ? data.outstandingBalance : 0
        });
      });
      setSuppliers(supList);
    } catch (err) {
      console.error('Error loading supplier data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !companyName || !companyCode) {
      alert('সাপ্লাইয়ার নাম, কোম্পানি নাম ও কোড আবশ্যক!');
      return;
    }

    const isConfirmed = window.confirm(`আপনি কি "${name}" নামক সাপ্লাইয়ার ও উনার ব্র্যান্ড কোম্পানি "${companyName}" যুক্ত করতে চান?`);
    if (!isConfirmed) return;

    try {
      setLoading(true);
      const id = 'sup-' + Date.now();

      // Create supplier document
      const supplierObj = {
        id,
        name,
        companyId: id, // Link company ID directly to supplier ID to merge entities!
        companyName,
        companyCode,
        phone: phone || '01700000000',
        address: address || 'Barishal Division',
        outstandingBalance: initialBalance,
        createdAt: new Date().toISOString()
      };

      // Create company document for backwards compatibility with other files
      const companyObj = {
        id,
        name: companyName,
        code: companyCode,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'suppliers', id), supplierObj);
      await setDoc(doc(db, 'companies', id), companyObj);

      setIsAddModalOpen(false);
      // Reset form
      setName('');
      setCompanyName('');
      setCompanyCode('');
      setPhone('');
      setAddress('');
      setInitialBalance(0);
      
      alert('সাপ্লাইয়ার এবং উনার ব্র্যান্ড কোম্পানি সফলভাবে যুক্ত করা হয়েছে!');
      loadData();
    } catch (err) {
      console.error('Error creating supplier:', err);
      alert('সাপ্লাইয়ার সেভ করতে সমস্যা হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEditSupplier = (sup: any) => {
    setSelectedSupplierForEdit(sup);
    setEditName(sup.name);
    setEditCompanyName(sup.companyName || sup.name);
    setEditCompanyCode(sup.companyCode || sup.code || sup.id.slice(-4).toUpperCase());
    setEditPhone(sup.phone || '');
    setEditAddress(sup.address || '');
    setEditOutstandingBalance(sup.outstandingBalance || 0);
    setIsEditModalOpen(true);
  };

  const handleSaveEditedSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierForEdit) return;

    if (!editName || !editCompanyName || !editCompanyCode) {
      alert('সাপ্লাইয়ার নাম, কোম্পানি নাম ও কোড আবশ্যক!');
      return;
    }

    const isConfirmed = window.confirm(`আপনি কি "${editName}" সাপ্লাইয়ারের তথ্য আপডেট করতে চান?`);
    if (!isConfirmed) return;

    try {
      setLoading(true);

      const updatedSupplier = {
        ...selectedSupplierForEdit,
        name: editName,
        companyName: editCompanyName,
        companyCode: editCompanyCode,
        phone: editPhone,
        address: editAddress,
        outstandingBalance: editOutstandingBalance
      };

      const updatedCompany = {
        id: selectedSupplierForEdit.id,
        name: editCompanyName,
        code: editCompanyCode
      };

      await setDoc(doc(db, 'suppliers', selectedSupplierForEdit.id), updatedSupplier);
      await setDoc(doc(db, 'companies', selectedSupplierForEdit.id), updatedCompany);

      setIsEditModalOpen(false);
      setSelectedSupplierForEdit(null);
      alert('সাপ্লাইয়ার এবং ব্র্যান্ড কোম্পানির তথ্য সফলভাবে আপডেট করা হয়েছে!');
      loadData();
    } catch (err) {
      console.error('Error updating supplier:', err);
      alert('আপডেট ব্যর্থ হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSupplier = async (supplierId: string, supplierName: string) => {
    const isConfirmed = window.confirm(`আপনি কি নিশ্চিতভাবে সাপ্লাইয়ার "${supplierName}" এবং উনার কোম্পানিটি ডাটাবেজ থেকে মুছে ফেলতে চান? এটি আর ফিরিয়ে আনা যাবে না!`);
    if (!isConfirmed) return;

    try {
      setLoading(true);
      await deleteDoc(doc(db, 'suppliers', supplierId));
      await deleteDoc(doc(db, 'companies', supplierId));
      alert(`সাপ্লাইয়ার "${supplierName}" সফলভাবে মুছে ফেলা হয়েছে।`);
      loadData();
    } catch (err) {
      console.error('Error deleting supplier:', err);
      alert('মুছে ফেলতে সমস্যা হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isConfirmed = window.confirm('আপনি কি এই বাল্ক পেমেন্ট এন্ট্রিগুলো সেভ করতে চান?');
    if (!isConfirmed) return;

    try {
      setLoading(true);
      const batch = writeBatch(db);
      let paymentCount = 0;

      Object.keys(bulkPayments).forEach(supId => {
        const amount = bulkPayments[supId];
        if (amount && amount > 0) {
          const supplier = suppliers.find(s => s.id === supId);
          if (supplier) {
            const currentBalance = supplier.outstandingBalance !== undefined ? supplier.outstandingBalance : 0;
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
    (s.companyName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6" id="suppliers-module">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Suppliers & Brands Register</h2>
          <p className="text-sm text-gray-500">Record supplier details and company brands unified under a single dashboard registry</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              const initial: { [supplierId: string]: number } = {};
              suppliers.forEach(s => {
                if ((s.outstandingBalance !== undefined ? s.outstandingBalance : 0) > 0) {
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

      {/* Search Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="relative">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search suppliers by name, phone or partner brand..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            id="input-supplier-search"
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Main Grid View */}
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
            <div key={sup.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between" id={`supplier-card-${sup.id}`}>
              <div>
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                    <Truck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 leading-tight text-base">{sup.name}</h3>
                    <p className="text-xs text-gray-400 flex items-center mt-1">
                      <Building2 className="w-3.5 h-3.5 mr-1 text-slate-400" />
                      <span className="font-bold text-slate-700">{sup.companyName || 'No Company'}</span>
                    </p>
                    <span className="inline-block bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px] uppercase font-mono mt-1">
                      Code: {sup.companyCode || 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-xs text-gray-600 border-t border-slate-50 pt-4 mb-4">
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
                  <div className="flex items-center justify-between p-2 bg-rose-50/50 rounded-lg border border-rose-100 font-bold text-[11px] text-rose-950 mt-2">
                    <span>Outstanding Due:</span>
                    <span className="font-mono text-rose-700 text-xs">৳{(sup.outstandingBalance || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-50 flex items-center justify-between">
                <button
                  onClick={() => handleOpenEditSupplier(sup)}
                  className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-700 font-bold cursor-pointer transition-colors"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Edit Profile</span>
                </button>
                <button
                  onClick={() => handleDeleteSupplier(sup.id, sup.name)}
                  className="flex items-center space-x-1 text-xs text-rose-500 hover:text-rose-600 font-bold cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Add Supplier & Brand */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 text-gray-400">
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <h3 className="text-lg font-extrabold text-gray-900 mb-1 flex items-center">
              <PlusCircle className="w-5 h-5 text-blue-600 mr-2" />
              <span>Register New Supplier</span>
            </h3>
            <p className="text-xs text-gray-400 mb-5">Adds a combined Supplier contact & Brand company profile to the system</p>
            
            <form onSubmit={handleCreateSupplier} className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Supplier Representative / Outlet Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. M/S Kamal Traders"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Brand / Company Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Akij Food & Beverage"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Company Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AFBL"
                    value={companyCode}
                    onChange={(e) => setCompanyCode(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Representative Phone</label>
                <input
                  type="text"
                  placeholder="e.g. 01711223344"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Business Address</label>
                <input
                  type="text"
                  placeholder="e.g. Amtali, Barguna"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Initial Outstanding Due (৳) *</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={initialBalance || ''}
                  onChange={(e) => setInitialBalance(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 text-right"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="bg-slate-100 text-gray-600 px-4 py-2.5 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Supplier & Brand</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Supplier & Brand */}
      {isEditModalOpen && selectedSupplierForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <button onClick={() => setIsEditModalOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 text-gray-400">
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <h3 className="text-lg font-extrabold text-gray-900 mb-1 flex items-center">
              <Edit className="w-5 h-5 text-blue-600 mr-2" />
              <span>Edit Supplier Profile</span>
            </h3>
            <p className="text-xs text-gray-400 mb-5">Update supplier representative details and brand configuration</p>
            
            <form onSubmit={handleSaveEditedSupplier} className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Supplier Representative Name *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Brand / Company Name *</label>
                  <input
                    type="text"
                    required
                    value={editCompanyName}
                    onChange={(e) => setEditCompanyName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Company Code *</label>
                  <input
                    type="text"
                    required
                    value={editCompanyCode}
                    onChange={(e) => setEditCompanyCode(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Phone Number</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Business Address</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Outstanding Balance (৳)</label>
                <input
                  type="number"
                  min="0"
                  value={editOutstandingBalance}
                  onChange={(e) => setEditOutstandingBalance(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black font-mono focus:outline-none text-right"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="bg-slate-100 text-gray-600 px-4 py-2.5 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer shadow-md"
                >
                  <Save className="w-4 h-4" />
                  <span>Update Supplier Details</span>
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
                    {suppliers.filter(s => (s.outstandingBalance !== undefined ? s.outstandingBalance : 0) > 0).map(sup => {
                      const bal = sup.outstandingBalance !== undefined ? sup.outstandingBalance : 0;
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
