/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Plus, 
  Search, 
  Filter, 
  MapPin, 
  TrendingUp, 
  CheckCircle, 
  Clock, 
  ArrowRight,
  RefreshCw,
  Save,
  X,
  UserCheck
} from 'lucide-react';
import { collection, getDocs, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Collection, Customer, Company, UserRole } from '../types';
import { logActivity } from '../lib/activityLogger';

interface CollectionViewProps {
  userRole: UserRole;
  userId: string;
  userName: string;
}

export default function CollectionView({ userRole, userId, userName }: CollectionViewProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [selectedArea, setSelectedArea] = useState('');

  const [routes, setRoutes] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);

  // Modals
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [isMultiCollectModalOpen, setIsMultiCollectModalOpen] = useState(false);

  // Form State
  const [customerId, setCustomerId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_BANKING' | 'CHEQUE'>('CASH');
  const [referenceNo, setReferenceNo] = useState('');
  const [collectionDate, setCollectionDate] = useState(new Date().toISOString().split('T')[0]);

  // Multi-Supplier State
  const [multiCustomerId, setMultiCustomerId] = useState('');
  const [multiAmounts, setMultiAmounts] = useState<{ [companyId: string]: number }>({});
  const [multiPaymentMethod, setMultiPaymentMethod] = useState<'CASH' | 'MOBILE_BANKING' | 'CHEQUE'>('CASH');
  const [multiReferenceNo, setMultiReferenceNo] = useState('');
  const [multiCollectionDate, setMultiCollectionDate] = useState(new Date().toISOString().split('T')[0]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Fetch companies, customers, and collections in parallel
      const [compSnap, custSnap, colSnap] = await Promise.all([
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'collections'))
      ]);

      const compList: Company[] = [];
      compSnap.forEach(d => compList.push(d.data() as Company));
      setCompanies(compList);

      const custList: Customer[] = [];
      custSnap.forEach(d => custList.push(d.data() as Customer));
      setCustomers(custList);

      const colList: Collection[] = [];
      colSnap.forEach(d => colList.push(d.data() as Collection));
      colList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setCollections(colList);

      // Compile unique routes & areas
      const uniqueRoutes = Array.from(new Set(custList.map(c => c.route).filter(Boolean)));
      const uniqueAreas = Array.from(new Set(custList.map(c => c.area).filter(Boolean)));
      setRoutes(uniqueRoutes);
      setAreas(uniqueAreas);

    } catch (err) {
      console.error('Error loading collections:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCollectModal = () => {
    setCustomerId('');
    setCompanyId('');
    setAmount(0);
    setPaymentMethod('CASH');
    setReferenceNo('');
    setIsCollectModalOpen(true);
  };

  // Find remaining due of selected customer for selected company
  const getSelectedDue = () => {
    if (!customerId || !companyId) return 0;
    const cust = customers.find(c => c.id === customerId);
    if (!cust) return 0;
    return cust.dues?.[companyId] || 0;
  };

  const handleReceivePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !companyId || amount <= 0) {
      alert('Please fill out customer, company, and entering a positive amount.');
      return;
    }

    const customerObj = customers.find(c => c.id === customerId);
    const companyObj = companies.find(c => c.id === companyId);
    if (!customerObj || !companyObj) return;

    const currentDue = customerObj.dues?.[companyId] || 0;
    if (amount > currentDue) {
      alert(`Entered payment (৳${amount}) exceeds outstanding ledger due (৳${currentDue}).`);
      return;
    }

    try {
      setLoading(true);
      const batch = writeBatch(db);
      const collectionId = 'col-' + Date.now();
      const collectionNo = 'COL-' + Date.now().toString().slice(-6);

      // 1. Create Collection Receipt
      const collectionObj: Collection = {
        id: collectionId,
        collectionNo,
        date: collectionDate,
        customerId,
        customerName: customerObj.name,
        shopName: customerObj.shopName,
        companyId,
        companyName: companyObj.name,
        amount,
        paymentMethod,
        referenceNo: referenceNo || '',
        route: customerObj.route,
        area: customerObj.area,
        collectedById: userId || 'dsr_fallback_uid',
        collectedByName: userName || 'DSR Sales Field Rep',
        status: 'PENDING', // starts as pending, DSR transfers, Manager approves
        transferredToManager: false,
        createdAt: new Date().toISOString()
      };

      batch.set(doc(db, 'collections', collectionId), collectionObj);

      // 2. Adjust Customer Outstanding Company Dues immediately so ledgers are accurate
      const updatedCompanyDue = Math.max(0, currentDue - amount);
      const updatedDues = {
        ...(customerObj.dues || {}),
        [companyId]: updatedCompanyDue
      };
      const updatedTotalDue = Object.values(updatedDues).reduce((s: number, a: unknown) => s + (Number(a) || 0), 0);

      batch.update(doc(db, 'customers', customerId), {
        dues: updatedDues,
        totalDue: updatedTotalDue
      });

      // 3. Log to Customer Ledger
      const ledgerEntryId = `ledger-${collectionId}`;
      batch.set(doc(db, 'ledgers', ledgerEntryId), {
        id: ledgerEntryId,
        customerId,
        companyId,
        companyName: companyObj.name,
        type: 'PAYMENT',
        referenceId: collectionId,
        referenceNo: collectionNo,
        date: collectionDate,
        amount,
        balanceAfter: updatedCompanyDue,
        createdAt: new Date().toISOString()
      });

      await batch.commit();

      // Log payment entry action to Firestore
      await logActivity(
        userId,
        userName,
        userRole,
        'PAYMENT_ENTRY',
        `Recorded Collection Receipt #${collectionNo} from customer ${customerObj.name} (${customerObj.shopName}) - Amount: ৳${amount} [Pending Approval]`,
        { collectionId, collectionNo, amount, customerId, companyId }
      );

      setIsCollectModalOpen(false);
      loadData();
    } catch (err) {
      console.error('Error logging payment collection:', err);
      alert('Failed to log payment. Please check database connectivity.');
    } finally {
      setLoading(false);
    }
  };

  const handleMultiReceivePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!multiCustomerId) {
      alert('Please select a customer.');
      return;
    }

    const customerObj = customers.find(c => c.id === multiCustomerId);
    if (!customerObj) return;

    const paymentsToProcess = Object.entries(multiAmounts)
      .map(([compId, amt]) => ({
        companyId: compId,
        amount: amt,
        companyObj: companies.find(c => c.id === compId)
      }))
      .filter(p => p.amount > 0 && p.companyObj);

    if (paymentsToProcess.length === 0) {
      alert('Please enter a received amount for at least one company.');
      return;
    }

    for (const p of paymentsToProcess) {
      const currentDue = customerObj.dues?.[p.companyId] || 0;
      if (p.amount > currentDue) {
        alert(`Entered payment (৳${p.amount}) for ${p.companyObj?.name} exceeds outstanding due (৳${currentDue}).`);
        return;
      }
    }

    try {
      setLoading(true);
      const batch = writeBatch(db);
      const updatedDues = { ...(customerObj.dues || {}) };

      for (const p of paymentsToProcess) {
        const companyObj = p.companyObj!;
        const collectionId = 'col-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        const collectionNo = 'COL-' + Date.now().toString().slice(-4) + '-' + (companyObj.code || 'GEN');

        const collectionObj: Collection = {
          id: collectionId,
          collectionNo,
          date: multiCollectionDate,
          customerId: multiCustomerId,
          customerName: customerObj.name,
          shopName: customerObj.shopName,
          companyId: p.companyId,
          companyName: companyObj.name,
          amount: p.amount,
          paymentMethod: multiPaymentMethod,
          referenceNo: multiReferenceNo || '',
          route: customerObj.route,
          area: customerObj.area,
          collectedById: userId || 'dsr_fallback_uid',
          collectedByName: userName || 'DSR Sales Field Rep',
          status: 'PENDING',
          transferredToManager: false,
          createdAt: new Date().toISOString()
        };

        batch.set(doc(db, 'collections', collectionId), collectionObj);

        const currentDue = customerObj.dues?.[p.companyId] || 0;
        updatedDues[p.companyId] = Math.max(0, currentDue - p.amount);

        const ledgerEntryId = `ledger-${collectionId}`;
        batch.set(doc(db, 'ledgers', ledgerEntryId), {
          id: ledgerEntryId,
          customerId: multiCustomerId,
          companyId: p.companyId,
          companyName: companyObj.name,
          type: 'PAYMENT',
          referenceId: collectionId,
          referenceNo: collectionNo,
          date: multiCollectionDate,
          amount: p.amount,
          balanceAfter: updatedDues[p.companyId],
          createdAt: new Date().toISOString()
        });
      }

      const updatedTotalDue = Object.values(updatedDues).reduce((s: number, a: unknown) => s + (Number(a) || 0), 0);
      batch.update(doc(db, 'customers', multiCustomerId), {
        dues: updatedDues,
        totalDue: updatedTotalDue
      });

      await batch.commit();

      const totalRec = paymentsToProcess.reduce((sum, p) => sum + p.amount, 0);
      await logActivity(
        userId,
        userName,
        userRole,
        'PAYMENT_ENTRY',
        `Recorded Multi-Brand Payment Collection from customer ${customerObj.shopName} - Total: ৳${totalRec} [Pending Approval]`,
        { customerId: multiCustomerId, totalAmount: totalRec }
      );

      setIsMultiCollectModalOpen(false);
      setMultiCustomerId('');
      setMultiAmounts({});
      setMultiReferenceNo('');
      loadData();
    } catch (err: any) {
      console.error('Error logging multi payment collection:', err);
      alert('Failed to log payment: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Field Staff: Click to Transfer Collections to Manager
  const handleTransferToManager = async (colId: string) => {
    try {
      setLoading(true);
      await updateDoc(doc(db, 'collections', colId), {
        transferredToManager: true,
        status: 'TRANSFERRED'
      });

      // Log transfer action
      const colObj = collections.find(c => c.id === colId);
      if (colObj) {
        await logActivity(
          userId,
          userName,
          userRole,
          'PAYMENT_ENTRY',
          `Transferred Collection Receipt #${colObj.collectionNo} (${colObj.shopName}) to Manager for verification - Amount: ৳${colObj.amount}`,
          { collectionId: colId, collectionNo: colObj.collectionNo, amount: colObj.amount }
        );
      }

      loadData();
    } catch (err) {
      console.error('Error transferring collection:', err);
    } finally {
      setLoading(false);
    }
  };

  // Manager: Click to Approve Received Cash Handover
  const handleApproveCollection = async (colId: string) => {
    try {
      setLoading(true);
      await updateDoc(doc(db, 'collections', colId), {
        status: 'APPROVED',
        approvedBy: userId,
        approvedByName: userName
      });

      // Log approve action
      const colObj = collections.find(c => c.id === colId);
      if (colObj) {
        await logActivity(
          userId,
          userName,
          userRole,
          'PAYMENT_ENTRY',
          `Approved Collection Receipt Handover #${colObj.collectionNo} (${colObj.shopName}) - Amount: ৳${colObj.amount}`,
          { collectionId: colId, collectionNo: colObj.collectionNo, amount: colObj.amount }
        );
      }

      loadData();
    } catch (err) {
      console.error('Error approving collection:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredCollections = collections.filter(col => {
    const matchesSearch = 
      col.shopName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      col.collectedByName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRoute = selectedRoute ? col.route === selectedRoute : true;
    const matchesArea = selectedArea ? col.area === selectedArea : true;
    return matchesSearch && matchesRoute && matchesArea;
  });

  return (
    <div className="space-y-6" id="collections-module">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Payments Collection</h2>
          <p className="text-sm text-gray-500">Receive outlet cash payments, handle field-rep handovers, and execute manager approvals</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setMultiCustomerId('');
              setMultiAmounts({});
              setMultiReferenceNo('');
              setIsMultiCollectModalOpen(true);
            }}
            id="btn-receive-multi-payment"
            className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Multi-Supplier Cashier Screen</span>
          </button>
          <button
            onClick={handleOpenCollectModal}
            id="btn-receive-payment"
            className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Receive Customer Payment</span>
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search collections by shop or field representative..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none"
          />
        </div>

        <div className="flex items-center space-x-2 min-w-[180px]">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={selectedRoute}
            onChange={(e) => setSelectedRoute(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm"
          >
            <option value="">All Routes</option>
            {routes.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div className="flex items-center space-x-2 min-w-[180px]">
          <MapPin className="w-4 h-4 text-gray-400" />
          <select
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm"
          >
            <option value="">All Areas</option>
            {areas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Collections Table with Approval Workflows */}
      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-500">Checking vault logs...</p>
        </div>
      ) : filteredCollections.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No payments received matching search</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" id="collections-table-container">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-gray-100">
                  <th className="px-6 py-4">Receipt Reference</th>
                  <th className="px-6 py-4">Outlet Outlet Name</th>
                  <th className="px-6 py-4">Company Target</th>
                  <th className="px-6 py-4 text-right">Payment received</th>
                  <th className="px-6 py-4">Field rep log</th>
                  <th className="px-6 py-4 text-center">Vault Status</th>
                  <th className="px-6 py-4 text-center">Action pipeline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredCollections.map((col) => (
                  <tr key={col.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-bold text-blue-700 font-mono">{col.collectionNo}</td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-gray-950">{col.shopName}</p>
                      <p className="text-[10px] text-gray-400">{col.route} • {col.date}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-500 font-medium">{col.companyName}</td>
                    <td className="px-6 py-4 text-right font-black text-gray-950">৳{col.amount.toLocaleString()}</td>
                    <td className="px-6 py-4 text-gray-500">{col.collectedByName}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        col.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                        col.status === 'TRANSFERRED' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                      }`}>
                        {col.status === 'APPROVED' && <CheckCircle className="w-3.5 h-3.5" />}
                        {col.status === 'TRANSFERRED' && <ArrowRight className="w-3.5 h-3.5 animate-pulse" />}
                        {col.status === 'PENDING' && <Clock className="w-3.5 h-3.5" />}
                        <span>{col.status}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {/* DSR workflow: pending -> transfer to manager */}
                      {col.status === 'PENDING' && col.collectedById === userId && (
                        <button
                          onClick={() => handleTransferToManager(col.id)}
                          className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                        >
                          Submit to Manager
                        </button>
                      )}

                      {/* Manager workflow: transferred -> approve vault deposit */}
                      {col.status === 'TRANSFERRED' && ['Super Admin', 'Manager', 'Accountant'].includes(userRole) && (
                        <button
                          onClick={() => handleApproveCollection(col.id)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all mx-auto cursor-pointer"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Approve Safe Deposit</span>
                        </button>
                      )}

                      {/* Default empty action if already approved */}
                      {col.status === 'APPROVED' && (
                        <span className="text-[10px] text-gray-400 font-medium">Approved by {col.approvedByName || 'Manager'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Receive Cash Payment */}
      {isCollectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative">
            <button onClick={() => setIsCollectModalOpen(false)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-1">Receive Cash Payment</h3>
            <p className="text-xs text-gray-400 mb-5">Record cash collections. All collections are allocated to specific partner companies.</p>

            <form onSubmit={handleReceivePayment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Payment Log Date</label>
                <input
                  type="date"
                  required
                  value={collectionDate}
                  onChange={(e) => setCollectionDate(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Customer Outlet *</label>
                <select
                  required
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                >
                  <option value="">Select Customer</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.shopName} (Due: ৳{c.totalDue})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Manufacturer Ledger *</label>
                <select
                  required
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  disabled={!customerId}
                >
                  <option value="">Select Company Ledger</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Outstanding: ৳{customerId ? (customers.find(cu => cu.id === customerId)?.dues?.[c.id] || 0) : 0})
                    </option>
                  ))}
                </select>
              </div>

              {customerId && companyId && (
                <div className="p-3 bg-blue-50 border border-blue-100 text-blue-900 text-xs rounded-lg font-medium flex justify-between items-center">
                  <span>Current Outstanding Company Balance:</span>
                  <span className="font-bold text-base">৳{getSelectedDue().toLocaleString()}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Received Amt (৳) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={amount || ''}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Transfer Mode</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="CASH">Cash Deposit</option>
                    <option value="MOBILE_BANKING">Mobile Banking</option>
                    <option value="CHEQUE">Bank Cheque</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Reference No / Memo</label>
                <input
                  type="text"
                  placeholder="e.g. bKash TxID or Cheque Ref"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsCollectModalOpen(false)}
                  className="bg-slate-100 text-gray-600 px-4 py-2.5 rounded-lg text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>File Payment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Multi-Supplier Payment Receipt */}
      {isMultiCollectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto text-slate-800">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-xl relative max-h-[90vh] overflow-y-auto space-y-4">
            <button 
              onClick={() => {
                setIsMultiCollectModalOpen(false);
                setMultiCustomerId('');
                setMultiAmounts({});
                setMultiReferenceNo('');
              }} 
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <div>
              <h3 className="text-lg font-extrabold text-gray-900 mb-0.5">Multi-Supplier Cashier Panel</h3>
              <p className="text-xs text-gray-400">Record a single payment from an outlet across multiple partner brands/suppliers.</p>
            </div>

            <form onSubmit={handleMultiReceivePayment} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Collection Date</label>
                  <input
                    type="date"
                    required
                    value={multiCollectionDate}
                    onChange={(e) => setMultiCollectionDate(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Payment Method</label>
                  <select
                    value={multiPaymentMethod}
                    onChange={(e) => setMultiPaymentMethod(e.target.value as any)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  >
                    <option value="CASH">Cash Payment</option>
                    <option value="MOBILE_BANKING">Mobile Banking</option>
                    <option value="CHEQUE">Bank Cheque</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Customer / Outlet *</label>
                <select
                  required
                  value={multiCustomerId}
                  onChange={(e) => {
                    const cId = e.target.value;
                    setMultiCustomerId(cId);
                    setMultiAmounts({});
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                >
                  <option value="">Select Customer Outlet</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.shopName} (Total Due: ৳{c.totalDue})</option>
                  ))}
                </select>
              </div>

              {/* Company wise Previous Due and Input List */}
              {multiCustomerId && (
                <div className="space-y-2.5">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Manufacturer / Brand breakdown</span>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 max-h-60 overflow-y-auto space-y-3">
                    {companies.map(comp => {
                      const cust = customers.find(c => c.id === multiCustomerId);
                      const prevDue = cust?.dues?.[comp.id] || 0;
                      const val = multiAmounts[comp.id] || '';

                      return (
                        <div key={comp.id} className="flex items-center justify-between gap-4 py-1.5 border-b border-dashed border-slate-200 text-xs">
                          <div className="w-1/3 min-w-0">
                            <p className="font-extrabold text-slate-800 truncate">{comp.name}</p>
                            <p className="text-[10px] text-gray-400 font-mono">Code: {comp.code}</p>
                          </div>
                          <div className="w-1/3 text-gray-500 font-bold">
                            Previous Due: ৳{prevDue.toLocaleString()}
                          </div>
                          <div className="w-1/3 text-right">
                            <input
                              type="number"
                              step="any"
                              placeholder="Receive"
                              value={val}
                              onChange={(e) => {
                                const num = parseFloat(e.target.value) || 0;
                                setMultiAmounts(prev => ({ ...prev, [comp.id]: num }));
                              }}
                              className="w-28 p-2 bg-white border border-slate-200 rounded-xl text-center font-black text-xs text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary display */}
                  <div className="p-4 bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between items-center text-gray-400">
                      <span>Total Due:</span>
                      <span>৳{(() => {
                        const cust = customers.find(c => c.id === multiCustomerId);
                        return (cust?.totalDue || 0).toLocaleString();
                      })()}</span>
                    </div>
                    <div className="flex justify-between items-center text-emerald-400 font-bold text-sm border-t border-slate-800 pt-1.5">
                      <span>Receiving:</span>
                      <span>৳{Object.values(multiAmounts).reduce((sum, v) => sum + (v || 0), 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Reference No / Receipt Memo</label>
                <input
                  type="text"
                  placeholder="e.g. Multi-Brand payment reference"
                  value={multiReferenceNo}
                  onChange={(e) => setMultiReferenceNo(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsMultiCollectModalOpen(false);
                    setMultiCustomerId('');
                    setMultiAmounts({});
                    setMultiReferenceNo('');
                  }}
                  className="bg-slate-100 text-gray-600 px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!multiCustomerId || Object.values(multiAmounts).reduce((sum, v) => sum + (v || 0), 0) === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-xs font-black flex items-center space-x-1 cursor-pointer transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>File Multi Payment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
