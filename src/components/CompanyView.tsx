/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Building2, Plus, Search, MapPin, Phone, User, Save, X, RefreshCw, Trash2 } from 'lucide-react';
import { collection, getDocs, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Company } from '../types';

export default function CompanyView() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New Company Form
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  const loadCompanies = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'companies'));
      const list: Company[] = [];
      snap.forEach(d => list.push(d.data() as Company));
      setCompanies(list);
    } catch (err) {
      console.error('Error loading companies:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCompany = async (companyId: string, companyName: string) => {
    const isConfirmed = window.confirm(`Are you sure you want to permanently delete company "${companyName}"? This action cannot be undone.`);
    if (!isConfirmed) return;

    try {
      setLoading(true);
      await deleteDoc(doc(db, 'companies', companyId));
      alert(`Company "${companyName}" deleted successfully.`);
      loadCompanies();
    } catch (err) {
      console.error('Error deleting company:', err);
      alert('Failed to delete company from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code) {
      alert('Company Name and Code are required!');
      return;
    }

    try {
      const id = 'comp-' + Date.now();
      const companyObj: Company = {
        id,
        name,
        code: code.trim().toUpperCase(),
        contactPerson,
        phone,
        address,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'companies', id), companyObj);
      setIsAddModalOpen(false);
      // Reset form
      setName('');
      setCode('');
      setContactPerson('');
      setPhone('');
      setAddress('');
      loadCompanies();
    } catch (err) {
      console.error('Error creating company:', err);
    }
  };

  const filtered = companies.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6" id="companies-module">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Partner Companies</h2>
          <p className="text-sm text-gray-500">Add and manage distribution manufacturing companies</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          id="btn-add-company"
          className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Company</span>
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="relative">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search company by name or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            id="input-company-search"
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-500">Syncing brand lists...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No company records</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="companies-grid">
          {filtered.map(comp => (
            <div key={comp.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm" id={`company-card-${comp.id}`}>
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 leading-tight text-base">{comp.name}</h3>
                  <span className="text-[10px] font-mono tracking-wider bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold uppercase mt-1 inline-block">
                    {comp.code}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-xs text-gray-600 border-t border-slate-50 pt-4">
                {comp.contactPerson && (
                  <div className="flex items-center">
                    <User className="w-3.5 h-3.5 mr-2 text-gray-400" />
                    <span>Contact: {comp.contactPerson}</span>
                  </div>
                )}
                {comp.phone && (
                  <div className="flex items-center">
                    <Phone className="w-3.5 h-3.5 mr-2 text-gray-400" />
                    <span>Phone: {comp.phone}</span>
                  </div>
                )}
                {comp.address && (
                  <div className="flex items-center">
                    <MapPin className="w-3.5 h-3.5 mr-2 text-gray-400" />
                    <span className="truncate">Address: {comp.address}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-50 flex justify-end">
                <button
                  onClick={() => handleDeleteCompany(comp.id, comp.name)}
                  className="flex items-center space-x-1 text-xs text-rose-500 hover:text-rose-600 font-bold cursor-pointer transition-colors"
                  title="Delete Company Brand"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Brand</span>
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
            <h3 className="text-lg font-bold text-gray-900 mb-4">Register New Company</h3>
            <form onSubmit={handleCreateCompany} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Company Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Square Pharmaceuticals Ltd"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Company Code (Short Code) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SQL (3 Characters)"
                  maxLength={5}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Contact Person Name</label>
                <input
                  type="text"
                  placeholder="e.g. manager"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Contact Phone</label>
                <input
                  type="text"
                  placeholder="e.g. 01711223344"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">HQ Address</label>
                <input
                  type="text"
                  placeholder="e.g. Mohakhali, Dhaka"
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
                  <span>Save Company</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
