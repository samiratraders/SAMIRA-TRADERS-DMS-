/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Map, 
  MapPin, 
  BadgeCent, 
  Warehouse, 
  RefreshCw, 
  Plus, 
  X, 
  Save, 
  Eye, 
  Layers, 
  Truck, 
  FileText, 
  CheckCircle2, 
  ShieldCheck, 
  Search, 
  Printer, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Building2, 
  Phone, 
  Filter, 
  Calculator, 
  BarChart3, 
  TrendingUp,
  DollarSign
} from 'lucide-react';
import { collection, getDocs, setDoc, doc, updateDoc, writeBatch, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SubDepot, SubDepotTransaction, Product, Company } from '../types';
import PrintWrapper from './PrintWrapper';

export default function SubDepotView() {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'points_directory' | 'new_invoice' | 'payment_collect' | 'point_ledger' | 'reports_dashboard'>('points_directory');

  // Base Data States
  const [subDepots, setSubDepots] = useState<SubDepot[]>([]);
  const [transactions, setTransactions] = useState<SubDepotTransaction[]>([]);
  const [subLedgers, setSubLedgers] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  // Settings & Toggles
  const [managerCreationAllowed, setManagerCreationAllowed] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals & Selections
  const [selectedDepot, setSelectedDepot] = useState<SubDepot | null>(null);
  const [selectedTx, setSelectedTx] = useState<SubDepotTransaction | null>(null);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Print States
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printTitle, setPrintTitle] = useState('');
  const [printData, setPrintData] = useState<any>(null);

  // --- FORM STATES: Register Sub-Dealer Point ---
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newManagerName, setNewManagerName] = useState('');
  const [newCommissionRate, setNewCommissionRate] = useState<number>(15);

  // --- FORM STATES: New Invoice / Chalan ---
  const [chalanDepotId, setChalanDepotId] = useState('');
  const [chalanDate, setChalanDate] = useState(new Date().toISOString().split('T')[0]);
  const [chalanRefNo, setChalanRefNo] = useState('');
  const [chalanCompanyId, setChalanCompanyId] = useState('');
  const [vehicleFreight, setVehicleFreight] = useState<number>(0);
  const [vehicleNote, setVehicleNote] = useState('');

  // Item Builder for Chalan
  const [selectedProdId, setSelectedProdId] = useState('');
  const [itemCartons, setItemCartons] = useState<number>(0);
  const [itemPcs, setItemPcs] = useState<number>(0);
  const [itemPrice, setItemPrice] = useState<number>(0);
  const [chalanItems, setChalanItems] = useState<Array<{
    productId: string;
    name: string;
    packSize: string;
    cartonSize: number;
    qtyCartons: number;
    qtyPcs: number;
    totalUnits: number;
    purchasePrice: number;
    itemTotal: number;
  }>>([]);

  // --- FORM STATES: Payment Collection ---
  const [payDepotId, setPayDepotId] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payRefNo, setPayRefNo] = useState('');
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<'CASH' | 'BANK' | 'MOBILE'>('CASH');
  const [payRemarks, setPayRemarks] = useState('');

  // --- STATES: Point Ledger Book ---
  const [ledgerDepotId, setLedgerDepotId] = useState('');
  const [ledgerStartDate, setLedgerStartDate] = useState('');
  const [ledgerEndDate, setLedgerEndDate] = useState('');

  // Load All Data
  const loadData = async () => {
    try {
      setLoading(true);
      const [sdSnap, prodSnap, txSnap, compSnap, ledgSnap] = await Promise.all([
        getDocs(collection(db, 'subDepots')),
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'subDepotTransactions')),
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'subDepotLedgers'))
      ]);

      const sdList: SubDepot[] = [];
      sdSnap.forEach(d => sdList.push({ id: d.id, ...d.data() } as SubDepot));
      setSubDepots(sdList);

      const prodList: Product[] = [];
      prodSnap.forEach(d => prodList.push({ id: d.id, ...d.data() } as Product));
      setProducts(prodList);

      const compList: Company[] = [];
      compSnap.forEach(d => compList.push({ id: d.id, ...d.data() } as Company));
      setCompanies(compList);

      const txList: SubDepotTransaction[] = [];
      txSnap.forEach(d => txList.push({ id: d.id, ...d.data() } as SubDepotTransaction));
      txList.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setTransactions(txList);

      const lList: any[] = [];
      ledgSnap.forEach(d => lList.push({ id: d.id, ...d.data() }));
      lList.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setSubLedgers(lList);

      if (sdList.length > 0 && !ledgerDepotId) {
        setLedgerDepotId(sdList[0].id);
      }
    } catch (err) {
      console.error('Error loading Sub-Dealer module data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Total Metrics
  const totalSubDues = subDepots.reduce((sum, d) => sum + (d.totalDue || 0), 0);
  const totalSubCartons = transactions.reduce((sum, t) => sum + (t.totalCartons || 0), 0);
  const totalSubCommissions = transactions.reduce((sum, t) => sum + (t.commissionEarned || 0), 0);
  const totalVehicleFreight = transactions.reduce((sum, t) => sum + (t.vehicleFreight || 0), 0);

  // --- CREATE NEW SUB-DEALER POINT ---
  const handleCreateDepot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || newCommissionRate <= 0) {
      alert('দয়া করে সাব-ডিবি পয়েন্টের নাম ও সঠিক কার্টুন কমিশন প্রদান করুন!');
      return;
    }

    try {
      setLoading(true);
      const id = 'subdb-' + Date.now().toString().slice(-6);
      const depotObj: SubDepot = {
        id,
        name: newName.trim(),
        location: newLocation.trim() || 'বাণিজ্যিক এলাকা',
        phone: newPhone.trim() || '+৮৮০১৭১১-০০০০০০',
        managerId: 'mgr-' + Date.now().toString().slice(-4),
        managerName: newManagerName.trim() || 'ইনচার্জ ডিলার',
        cartonCommissionRate: newCommissionRate,
        totalDue: 0,
        status: 'APPROVED',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'subDepots', id), depotObj);
      alert('নতুন সাব-ডিবি পয়েন্ট সফলভাবে নিবন্ধিত হয়েছে!');
      setIsAddModalOpen(false);
      setNewName('');
      setNewLocation('');
      setNewPhone('');
      setNewManagerName('');
      setNewCommissionRate(15);
      loadData();
    } catch (err) {
      console.error('Error creating Sub-Dealer point:', err);
      alert('পয়েন্ট খুলতে ব্যর্থ হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  // --- SUBMIT NEW CHALAN / STOCK DISPATCH ---
  const handleCreateChalan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chalanDepotId) {
      alert('দয়া করে সাব-ডিবি পয়েন্ট নির্বাচন করুন!');
      return;
    }
    if (chalanItems.length === 0) {
      alert('চালানে অন্তত একটি প্রোডাক্ট আইটেম যুক্ত করুন!');
      return;
    }

    const depot = subDepots.find(d => d.id === chalanDepotId);
    if (!depot) return;

    try {
      setLoading(true);
      const batch = writeBatch(db);

      const totalCartons = chalanItems.reduce((s, i) => s + i.qtyCartons, 0);
      const itemsTotalValue = chalanItems.reduce((s, i) => s + i.itemTotal, 0);
      const commissionEarned = totalCartons * (depot.cartonCommissionRate || 0);
      const grandTotalChalan = itemsTotalValue + (vehicleFreight || 0);

      const chalanId = chalanRefNo || `CHL-${Date.now().toString().slice(-6)}`;

      // 1. Deduct Main Depot stock & Add to Sub-Depot Stock
      for (const item of chalanItems) {
        const prod = products.find(p => p.id === item.productId);
        if (prod) {
          const currentMainStock = prod.stockCount || 0;
          const currentSubStock = prod.subDepotStocks?.[chalanDepotId] || 0;

          const updatedSubStocks = {
            ...(prod.subDepotStocks || {}),
            [chalanDepotId]: currentSubStock + item.totalUnits
          };

          batch.update(doc(db, 'products', item.productId), {
            stockCount: Math.max(0, currentMainStock - item.totalUnits),
            subDepotStocks: updatedSubStocks
          });
        }
      }

      // 2. Write Transaction
      const txObj: SubDepotTransaction = {
        id: chalanId,
        subDepotId: chalanDepotId,
        subDepotName: depot.name,
        date: chalanDate,
        items: chalanItems.map(i => ({
          productId: i.productId,
          name: i.name,
          qtyUnits: i.totalUnits,
          qtyCartons: i.qtyCartons,
          purchasePrice: i.purchasePrice,
          retailPrice: i.purchasePrice
        })),
        totalCartons,
        commissionEarned,
        vehicleFreight: vehicleFreight || 0,
        chalanTotal: grandTotalChalan,
        status: 'APPROVED',
        createdBy: 'admin_office',
        createdByName: 'Office Admin',
        createdAt: new Date().toISOString()
      };

      batch.set(doc(db, 'subDepotTransactions', chalanId), txObj);

      // 3. Update SubDepot Dues
      const prevDue = depot.totalDue || 0;
      const updatedDue = prevDue + grandTotalChalan;

      batch.update(doc(db, 'subDepots', chalanDepotId), {
        totalDue: updatedDue
      });

      // 4. Write SubDepot Ledger
      const ledgerId = `subledger-${Date.now()}`;
      const ledgerEntry = {
        id: ledgerId,
        subDepotId: chalanDepotId,
        subDepotName: depot.name,
        type: 'CHALAN',
        referenceNo: chalanId,
        date: chalanDate,
        debit: grandTotalChalan,
        credit: 0,
        balanceAfter: updatedDue,
        totalCartons,
        commissionEarned,
        vehicleFreight: vehicleFreight || 0,
        remarks: `পণ্য চালান ও গাড়ি ভাড়া ড্যাবিট করা হয়েছে। (${totalCartons} কার্টুন)`,
        createdAt: new Date().toISOString()
      };

      batch.set(doc(db, 'subDepotLedgers', ledgerId), ledgerEntry);

      await batch.commit();
      alert(`সাব-ডিবি পয়েন্ট "${depot.name}" এর জন্য চালান সফলভাবে সম্পন্ন হয়েছে!\nমোট কার্টুন: ${totalCartons} Ctn | চালান মূল্য: ৳${grandTotalChalan.toLocaleString()}`);

      // Reset
      setChalanDepotId('');
      setChalanRefNo('');
      setVehicleFreight(0);
      setVehicleNote('');
      setChalanItems([]);
      loadData();
      setActiveTab('point_ledger');
      setLedgerDepotId(chalanDepotId);

    } catch (err) {
      console.error('Error posting subdepot chalan:', err);
      alert('চালান পোস্টিং সফল হয়নি।');
    } finally {
      setLoading(false);
    }
  };

  // --- SUBMIT PAYMENT COLLECTION ---
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payDepotId) {
      alert('দয়া করে সাব-ডিবি পয়েন্ট নির্বাচন করুন!');
      return;
    }
    if (payAmount <= 0) {
      alert('সঠিক টাকা পরিমাণ প্রদান করুন!');
      return;
    }

    const depot = subDepots.find(d => d.id === payDepotId);
    if (!depot) return;

    try {
      setLoading(true);
      const batch = writeBatch(db);

      const refNo = payRefNo || `REC-${Date.now().toString().slice(-6)}`;
      const prevDue = depot.totalDue || 0;
      const updatedDue = Math.max(0, prevDue - payAmount);

      // 1. Update SubDepot Dues
      batch.update(doc(db, 'subDepots', payDepotId), {
        totalDue: updatedDue
      });

      // 2. Write Ledger Entry
      const ledgerId = `subledger-pay-${Date.now()}`;
      const ledgerEntry = {
        id: ledgerId,
        subDepotId: payDepotId,
        subDepotName: depot.name,
        type: 'PAYMENT',
        referenceNo: refNo,
        date: payDate,
        debit: 0,
        credit: payAmount,
        balanceAfter: updatedDue,
        payMethod,
        remarks: payRemarks || `ক্যাশ পেমেন্ট আদায় করা হয়েছে। (${payMethod})`,
        createdAt: new Date().toISOString()
      };

      batch.set(doc(db, 'subDepotLedgers', ledgerId), ledgerEntry);

      await batch.commit();
      alert(`সাব-ডিবি পয়েন্ট "${depot.name}" থেকে ৳${payAmount.toLocaleString()} ক্যাশ সংগ্রহ পোস্টিং সম্পন্ন হয়েছে!`);

      setPayDepotId('');
      setPayRefNo('');
      setPayAmount(0);
      setPayRemarks('');
      loadData();
      setActiveTab('point_ledger');
      setLedgerDepotId(payDepotId);

    } catch (err) {
      console.error('Error posting payment collection:', err);
      alert('পেমেন্ট সংগ্রাহক পোস্টিং ব্যর্থ হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  // Ledger calculation for active point
  const currentLedgerDepot = subDepots.find(d => d.id === ledgerDepotId);
  const activeLedgerEntries = subLedgers.filter(l => l.subDepotId === ledgerDepotId);

  return (
    <div className="space-y-6 text-slate-900" id="subdepots-module">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Warehouse className="w-7 h-7 text-blue-400" />
            <h2 className="text-2xl font-black tracking-tight">সাব-ডিবি ডিস্ট্রিবিউশন (Sub-Dealer Points)</h2>
          </div>
          <p className="text-xs text-blue-200 mt-1">
            সাব-ডিলার পয়েন্টে কেনা দামে কার্টুন অনুযায়ী পণ্য চালান, ক্যাশ ডেবিট-ক্রেডিট লেজার, গাড়ি ভাড়া ও কার্টুন প্রতি আয়ের হিসাব
          </p>
        </div>

        <div className="flex items-center space-x-3 bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/15 shrink-0">
          <div className="text-right">
            <span className="text-[10px] text-blue-200 font-bold uppercase tracking-wider block">সাব-ডিবি মোট বকেয়া</span>
            <span className="text-xl font-black text-amber-300 font-mono">৳{totalSubDues.toLocaleString()}</span>
          </div>
          <div className="h-8 w-px bg-white/20" />
          <div className="text-right">
            <span className="text-[10px] text-blue-200 font-bold uppercase tracking-wider block">নিবন্ধিত পয়েন্ট</span>
            <span className="text-xl font-black text-white font-mono">{subDepots.length} টি</span>
          </div>
        </div>
      </div>

      {/* 5 Main Subtabs Navigation */}
      <div className="flex items-center space-x-2 bg-slate-100 p-1.5 rounded-2xl overflow-x-auto border border-slate-200">
        <button
          onClick={() => setActiveTab('points_directory')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'points_directory'
              ? 'bg-white text-blue-900 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <Building2 className="w-4 h-4 text-blue-600" />
          <span>১. পয়েন্টস ডিরেক্টরি</span>
        </button>

        <button
          onClick={() => setActiveTab('new_invoice')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'new_invoice'
              ? 'bg-white text-blue-900 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <Truck className="w-4 h-4 text-emerald-600" />
          <span>২. নতুন চালান এন্ট্রি</span>
        </button>

        <button
          onClick={() => setActiveTab('payment_collect')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'payment_collect'
              ? 'bg-white text-blue-900 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <DollarSign className="w-4 h-4 text-indigo-600" />
          <span>৩. পেমেন্ট সংগ্রহ</span>
        </button>

        <button
          onClick={() => setActiveTab('point_ledger')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'point_ledger'
              ? 'bg-white text-blue-900 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <FileText className="w-4 h-4 text-amber-600" />
          <span>৪. পয়েন্ট লেজার খাতা</span>
        </button>

        <button
          onClick={() => setActiveTab('reports_dashboard')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'reports_dashboard'
              ? 'bg-white text-blue-900 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-purple-600" />
          <span>৫. রিপোর্ট ও ড্যাশবোর্ড</span>
        </button>
      </div>

      {/* TAB 1: POINTS DIRECTORY */}
      {activeTab === 'points_directory' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700">
                <span>ম্যানেজারদের সাব-ডিবি ক্রিয়েশন:</span>
                <button
                  type="button"
                  onClick={() => setManagerCreationAllowed(!managerCreationAllowed)}
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black transition-colors ${
                    managerCreationAllowed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {managerCreationAllowed ? '[অনুমতি আছে]' : '[বন্ধ]'}
                </button>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="পয়েন্ট নাম বা আইডি খুঁজুন..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs w-48 sm:w-64 focus:outline-none font-bold"
                />
              </div>
            </div>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ সাব-ডিবি পয়েন্ট যোগ করুন</span>
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-500">সাব-ডিবি পয়েন্ট তালিকা লোড হচ্ছে...</p>
            </div>
          ) : subDepots.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <Warehouse className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-600">কোন সাব-ডিবি পয়েন্ট নিবন্ধিত পাওয়া যায়নি</p>
              <p className="text-xs text-slate-400 mt-1">উপরে "+ সাব-ডিবি পয়েন্ট যোগ করুন" বাটনে ক্লিক করে প্রথম পয়েন্ট যোগ করুন</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {subDepots
                .filter(d => !searchTerm || d.name.toLowerCase().includes(searchTerm.toLowerCase()) || d.id.toLowerCase().includes(searchTerm.toLowerCase()))
                .map(depot => {
                  const depotStockCount = products.reduce((sum, p) => sum + (p.subDepotStocks?.[depot.id] || 0), 0);
                  const depotDues = depot.totalDue || 0;

                  return (
                    <div key={depot.id} className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center space-x-3">
                            <div className="p-3 bg-blue-50 text-blue-700 rounded-2xl border border-blue-100">
                              <Building2 className="w-6 h-6" />
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <h3 className="font-extrabold text-slate-900 text-base">{depot.name}</h3>
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                                  অনুমোদিত
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                                আইডি: <span className="font-bold text-slate-800">{depot.id}</span> | ফোন: <span className="font-bold text-slate-800">{depot.phone || '+৮৮০১৭১১-২২৩৩৪৪'}</span>
                              </p>
                            </div>
                          </div>
                          
                          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-xl border border-indigo-100 shrink-0">
                            কমিশন: ৳{depot.cartonCommissionRate}/Ctn
                          </span>
                        </div>

                        <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-2xl mb-4 border border-slate-100 flex items-center space-x-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">ঠিকানা: {depot.location}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 mb-4">
                          <div className="bg-amber-50/70 p-3 rounded-2xl border border-amber-100">
                            <span className="text-[10px] text-amber-800 font-bold uppercase block">বর্তমান বকেয়া দেনা</span>
                            <p className="text-lg font-black text-amber-900 font-mono mt-0.5">৳{depotDues.toLocaleString()}</p>
                          </div>

                          <div className="bg-blue-50/70 p-3 rounded-2xl border border-blue-100">
                            <span className="text-[10px] text-blue-800 font-bold uppercase block">স্টক মজুদ (In Hand)</span>
                            <p className="text-lg font-black text-blue-950 font-mono mt-0.5">{depotStockCount} Pcs</p>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2">
                        <button
                          onClick={() => {
                            setSelectedDepot(depot);
                            setIsStockModalOpen(true);
                          }}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2 px-1 rounded-xl text-[11px] text-center cursor-pointer transition-colors"
                        >
                          স্টক হিসেব
                        </button>
                        <button
                          onClick={() => {
                            setLedgerDepotId(depot.id);
                            setActiveTab('point_ledger');
                          }}
                          className="bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold py-2 px-1 rounded-xl text-[11px] text-center cursor-pointer transition-colors"
                        >
                          লেজার দেখুন
                        </button>
                        <button
                          onClick={() => {
                            setChalanDepotId(depot.id);
                            setActiveTab('new_invoice');
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-1 rounded-xl text-[11px] text-center cursor-pointer transition-colors"
                        >
                          চালান পাঠান
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: NEW INVOICE / CHALAN ENTRY */}
      {activeTab === 'new_invoice' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm max-w-4xl mx-auto">
          <div className="border-b pb-4 mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center">
                <Truck className="w-5 h-5 text-emerald-600 mr-2" />
                <span>নতুন সাব-ডিবি চালান এন্ট্রি (কেনা দামে কার্টুন অনুযায়ী)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                প্রধান ডিপো থেকে সাব-ডিবি পয়েন্টে পণ্য মেমো চালান, গাড়ি ভাড়া ও কার্টুন প্রতি কমিশন এন্ট্রি
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateChalan} className="space-y-5 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">সাব-ডিবি পয়েন্ট নির্বাচন *</label>
                <select
                  value={chalanDepotId}
                  onChange={(e) => setChalanDepotId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none text-slate-900"
                  required
                >
                  <option value="">-- সাব-ডিবি পয়েন্ট নির্বাচন করুন --</option>
                  {subDepots.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.location})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">চালান তারিখ (Date) *</label>
                <input
                  type="date"
                  value={chalanDate}
                  onChange={(e) => setChalanDate(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">চালান নং / রেফারেন্স</label>
                <input
                  type="text"
                  placeholder="স্বয়ংক্রিয় চালান নং"
                  value={chalanRefNo}
                  onChange={(e) => setChalanRefNo(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none"
                />
              </div>
            </div>

            {/* Vehicle Freight Cost Section */}
            <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80 space-y-3">
              <span className="text-xs font-black text-amber-900 flex items-center">
                <Truck className="w-4 h-4 text-amber-700 mr-1.5" />
                গাড়ি ভাড়া ও পরিবহন খরচ (Vehicle Freight)
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase">গাড়ি ভাড়া পরিমাণ (৳)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0.00"
                    value={vehicleFreight || ''}
                    onChange={(e) => setVehicleFreight(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full p-2.5 bg-white border border-amber-200 rounded-xl font-bold font-mono text-amber-900 text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase">গাড়ির বিস্তারিত / চালকের তথ্য</label>
                  <input
                    type="text"
                    placeholder="যেমন: পিকআপ ঢাকা-মেট্রো-ন ১১-২২২৩"
                    value={vehicleNote}
                    onChange={(e) => setVehicleNote(e.target.value)}
                    className="w-full p-2.5 bg-white border border-amber-200 rounded-xl focus:outline-none text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Item Builder Box */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <span className="text-xs font-black text-slate-900 block">চালানে পণ্য আইটেম যুক্ত করুন</span>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">প্রোডাক্ট সিলেক্ট</label>
                  <select
                    value={selectedProdId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      setSelectedProdId(pid);
                      const p = products.find(prod => prod.id === pid);
                      if (p) {
                        setItemPrice(p.purchasePrice || p.tpPrice || 0);
                      }
                    }}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs"
                  >
                    <option value="">-- পণ্য বাছুন --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} (মজুদ: {p.stockCount || 0} Pcs | {p.cartonSize} Pcs/Ctn)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">কার্টুন সংখ্যা (Ctn)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={itemCartons || ''}
                    onChange={(e) => setItemCartons(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">কার্টুন দর (কেনা দাম ৳)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={itemPrice || ''}
                    onChange={(e) => setItemPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold font-mono text-xs"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!selectedProdId) {
                    alert('দয়া করে পণ্য নির্বাচন করুন!');
                    return;
                  }
                  const p = products.find(prod => prod.id === selectedProdId);
                  if (!p) return;
                  if (itemCartons <= 0) {
                    alert('দয়া করে কার্টুনের সংখ্যা প্রদান করুন!');
                    return;
                  }

                  const ctnSize = p.cartonSize || 1;
                  const totalUnits = itemCartons * ctnSize;
                  const itemTotal = itemCartons * itemPrice;

                  const newItem = {
                    productId: p.id,
                    name: p.name,
                    packSize: p.packSize || '',
                    cartonSize: ctnSize,
                    qtyCartons: itemCartons,
                    qtyPcs: 0,
                    totalUnits,
                    purchasePrice: itemPrice,
                    itemTotal
                  };

                  setChalanItems([...chalanItems, newItem]);
                  setSelectedProdId('');
                  setItemCartons(0);
                  setItemPrice(0);
                }}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center space-x-1"
              >
                <Plus className="w-4 h-4" />
                <span>চালান তালিকায় যোগ করুন</span>
              </button>
            </div>

            {/* Added Items Table */}
            {chalanItems.length > 0 && (
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 font-black text-slate-700">
                    <tr>
                      <th className="p-3">পণ্য বিবরণী</th>
                      <th className="p-3 text-center">কার্টুন</th>
                      <th className="p-3 text-center">পিস</th>
                      <th className="p-3 text-right">কার্টুন দর (৳)</th>
                      <th className="p-3 text-right">মোট চালানি মূল্য (৳)</th>
                      <th className="p-3 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {chalanItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-800">{item.name}</td>
                        <td className="p-3 text-center font-mono font-bold text-blue-900">{item.qtyCartons} Ctn</td>
                        <td className="p-3 text-center font-mono text-slate-500">{item.totalUnits} Pcs</td>
                        <td className="p-3 text-right font-mono">৳{item.purchasePrice.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">৳{item.itemTotal.toLocaleString()}</td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => setChalanItems(chalanItems.filter((_, i) => i !== idx))}
                            className="text-red-500 hover:text-red-700 font-bold p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-black text-slate-900 border-t">
                    <tr>
                      <td colSpan={1} className="p-3 text-right">মোট পণ্য মূল্য:</td>
                      <td className="p-3 text-center font-mono text-blue-900">
                        {chalanItems.reduce((s, i) => s + i.qtyCartons, 0)} Ctn
                      </td>
                      <td colSpan={2} className="p-3 text-right">
                        গাড়ি ভাড়া: ৳{vehicleFreight.toLocaleString()}
                      </td>
                      <td className="p-3 text-right font-mono text-emerald-700 text-sm">
                        ৳{(chalanItems.reduce((s, i) => s + i.itemTotal, 0) + vehicleFreight).toLocaleString()}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="pt-3 border-t flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setChalanItems([]);
                  setChalanDepotId('');
                }}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-5 py-2.5 rounded-xl cursor-pointer"
              >
                রিসেট
              </button>
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl flex items-center space-x-2 shadow-lg cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>চালান সেভ ও পোস্ট করুন</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: PAYMENT COLLECTION */}
      {activeTab === 'payment_collect' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm max-w-2xl mx-auto">
          <div className="border-b pb-4 mb-5">
            <h3 className="text-lg font-black text-slate-900 flex items-center">
              <DollarSign className="w-5 h-5 text-indigo-600 mr-2" />
              <span>সাব-ডিবি পেমেন্ট সংগ্রহ এন্ট্রি (Cash Credit)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              সাব-ডিলার পয়েন্ট থেকে প্রাপ্ত ক্যাশ পেমেন্ট জমা করে বকেয়া দেনা হ্রাস করুন
            </p>
          </div>

          <form onSubmit={handlePaymentSubmit} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase">সাব-ডিবি পয়েন্ট নির্বাচন *</label>
              <select
                value={payDepotId}
                onChange={(e) => setPayDepotId(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none text-slate-900"
                required
              >
                <option value="">-- সাব-ডিবি পয়েন্ট নির্বাচন করুন --</option>
                {subDepots.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} (বর্তমান বকেয়া: ৳{(d.totalDue || 0).toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">তারিখ (Date) *</label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">রশিদ নং / মনিটরিং রেফারেন্স</label>
                <input
                  type="text"
                  placeholder="যেমন: REC-102"
                  value={payRefNo}
                  onChange={(e) => setPayRefNo(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">জমা টাকার পরিমাণ (৳) *</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0.00"
                  value={payAmount || ''}
                  onChange={(e) => setPayAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-emerald-700 text-sm focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">পেমেন্ট মাধ্যম *</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none text-slate-900"
                >
                  <option value="CASH">ক্যাশ নগদ (Cash)</option>
                  <option value="BANK">ব্যাংক ট্রান্সফার (Bank)</option>
                  <option value="MOBILE">মোবাইল ব্যাংকিং (Bkash/Nagad)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase">মন্তব্য (Remarks)</label>
              <textarea
                rows={2}
                placeholder="পেমেন্ট প্রাপ্তি সংক্রান্ত মন্তব্য..."
                value={payRemarks}
                onChange={(e) => setPayRemarks(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none text-slate-900"
              />
            </div>

            <div className="pt-3 border-t flex justify-end">
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl flex items-center space-x-2 shadow-lg cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>পেমেন্ট জমা সেভ করুন</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 4: POINT LEDGER BOOK */}
      {activeTab === 'point_ledger' && (
        <div className="space-y-5">
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <Building2 className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">পয়েন্ট খাতা সিলেক্ট করুন</label>
                <select
                  value={ledgerDepotId}
                  onChange={(e) => setLedgerDepotId(e.target.value)}
                  className="bg-slate-50 border border-slate-200 font-extrabold text-sm text-slate-900 px-3 py-1.5 rounded-xl focus:outline-none"
                >
                  <option value="">-- সাব-ডিবি পয়েন্ট নির্বাচন করুন --</option>
                  {subDepots.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.location})</option>
                  ))}
                </select>
              </div>
            </div>

            {currentLedgerDepot && (
              <div className="flex items-center space-x-4 bg-amber-50 px-4 py-2 rounded-2xl border border-amber-200/80">
                <div>
                  <span className="text-[10px] text-amber-800 font-bold uppercase block">বর্তমান বকেয়া দেনা</span>
                  <p className="text-base font-black text-amber-950 font-mono">৳{(currentLedgerDepot.totalDue || 0).toLocaleString()}</p>
                </div>
                <button
                  onClick={() => {
                    setPrintTitle(`সাব-ডিবি লেজার - ${currentLedgerDepot.name}`);
                    setPrintData({ depot: currentLedgerDepot, entries: activeLedgerEntries });
                    setShowPrintModal(true);
                  }}
                  className="bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 px-3 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1 cursor-pointer transition-colors shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>লেজার প্রিন্ট</span>
                </button>
              </div>
            )}
          </div>

          {/* Ledger Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {activeLedgerEntries.length === 0 ? (
              <div className="text-center py-12 text-slate-400 italic text-xs">
                এই সাব-ডিবি পয়েন্টের জন্য কোনো লেজার হিসেব তথ্য পাওয়া যায়নি।
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200">
                    <tr>
                      <th className="p-3">তারিখ</th>
                      <th className="p-3">চালান / রেফারেন্স</th>
                      <th className="p-3">লেনদেনের ধরণ</th>
                      <th className="p-3 text-right">গাড়ি ভাড়া (৳)</th>
                      <th className="p-3 text-right">কমিশন আয় (৳)</th>
                      <th className="p-3 text-right text-red-700">ডেবিট / চালান (৳)</th>
                      <th className="p-3 text-right text-emerald-700">ক্রেডিট / জমা (৳)</th>
                      <th className="p-3 text-right font-black">অবশিষ্ট বকেয়া (৳)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {activeLedgerEntries.map((e, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-3 font-mono text-slate-600">{e.date}</td>
                        <td className="p-3 font-mono font-bold text-blue-900">{e.referenceNo}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            e.type === 'CHALAN' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {e.type === 'CHALAN' ? 'পণ্য চালান' : 'ক্যাশ পেমেন্ট'}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-slate-600">৳{(e.vehicleFreight || 0).toLocaleString()}</td>
                        <td className="p-3 text-right font-mono text-purple-700 font-bold">৳{(e.commissionEarned || 0).toLocaleString()}</td>
                        <td className="p-3 text-right font-mono font-bold text-red-700">
                          {e.debit > 0 ? `+৳${e.debit.toLocaleString()}` : '-'}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-700">
                          {e.credit > 0 ? `-৳${e.credit.toLocaleString()}` : '-'}
                        </td>
                        <td className="p-3 text-right font-mono font-black text-slate-900">
                          ৳{(e.balanceAfter || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: REPORTS & DASHBOARD */}
      {activeTab === 'reports_dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">মোট চালান সংখ্যা</span>
              <p className="text-2xl font-black text-blue-900 font-mono mt-1">{transactions.length} টি</p>
              <span className="text-[11px] text-slate-500 mt-1 block">সর্বমোট ডিস্ট্রিবিউট করা চালান</span>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">মোট কার্টুন পাঠানো হয়েছে</span>
              <p className="text-2xl font-black text-indigo-900 font-mono mt-1">{totalSubCartons} Ctn</p>
              <span className="text-[11px] text-slate-500 mt-1 block">সব সাব-ডিবি পয়েন্টের চালানি কার্টুন</span>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">মোট অর্জিত কমিশন আয়</span>
              <p className="text-2xl font-black text-emerald-700 font-mono mt-1">৳{totalSubCommissions.toLocaleString()}</p>
              <span className="text-[11px] text-slate-500 mt-1 block">কার্টুন কমিশন থেকে প্রাপ্ত আয়</span>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">মোট গাড়ি ভাড়া খরচ</span>
              <p className="text-2xl font-black text-amber-700 font-mono mt-1">৳{totalVehicleFreight.toLocaleString()}</p>
              <span className="text-[11px] text-slate-500 mt-1 block">পরিবহন বা বাবদ গাড়ি ভাড়া ব্যয়</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-extrabold text-slate-900 text-base">চালান হস্তান্তরের সাম্প্রতিক রেকর্ড (Recent Handover History)</h3>
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 font-bold text-slate-700">
                  <tr>
                    <th className="p-3">চালান নং</th>
                    <th className="p-3">পয়েন্ট নাম</th>
                    <th className="p-3 text-center">কার্টুন</th>
                    <th className="p-3 text-right">গাড়ি ভাড়া</th>
                    <th className="p-3 text-right">কমিশন আয়</th>
                    <th className="p-3 text-right">চালান মোট মূল্য</th>
                    <th className="p-3 text-center">ভিউ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.slice(0, 10).map(tx => (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-blue-900">{tx.id}</td>
                      <td className="p-3 font-semibold text-slate-800">{tx.subDepotName}</td>
                      <td className="p-3 text-center font-bold font-mono">{tx.totalCartons} Ctn</td>
                      <td className="p-3 text-right font-mono">৳{(tx.vehicleFreight || 0).toLocaleString()}</td>
                      <td className="p-3 text-right font-mono text-purple-700 font-bold">৳{(tx.commissionEarned || 0).toLocaleString()}</td>
                      <td className="p-3 text-right font-mono text-emerald-800 font-black">৳{(tx.chalanTotal || 0).toLocaleString()}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => {
                            setSelectedTx(tx);
                            setIsTxModalOpen(true);
                          }}
                          className="text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                        >
                          <Eye className="w-4 h-4 mx-auto" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REGISTER SUB-DEALER POINT */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative text-slate-900">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-400">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-black text-slate-900 mb-4 border-b pb-2 flex items-center">
              <Building2 className="w-5 h-5 text-blue-600 mr-2" />
              <span>নতুন সাব-ডিবি পয়েন্ট যোগ করুন</span>
            </h3>

            <form onSubmit={handleCreateDepot} className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">পয়েন্টের নাম *</label>
                <input
                  type="text"
                  required
                  placeholder="যেমন: সাব-ডিলার পয়েন্ট ০১"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">মোবাইল ফোন নম্বর</label>
                <input
                  type="text"
                  placeholder="+৮৮০১৭১১-২২৩৩৪৪"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">ঠিকানা / এরিয়া এলাকা</label>
                <input
                  type="text"
                  placeholder="যেমন: মতিঝিল বাণিজ্যিক এলাকা, ঢাকা"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">পয়েন্ট ম্যানেজার / ইনচার্জের নাম</label>
                <input
                  type="text"
                  placeholder="যেমন: মোঃ হাবিবুর রহমান"
                  value={newManagerName}
                  onChange={(e) => setNewManagerName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">কার্টুন কমিশন হার (৳ প্রতি কার্টুন) *</label>
                <input
                  type="number"
                  required
                  placeholder="15"
                  value={newCommissionRate || ''}
                  onChange={(e) => setNewCommissionRate(parseInt(e.target.value) || 0)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
                />
              </div>

              <div className="pt-3 border-t flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-xs font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>পয়েন্ট নিবন্ধন করুন</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: STOCK AUDIT IN HAND */}
      {isStockModalOpen && selectedDepot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative text-slate-900 max-h-[85vh] overflow-y-auto">
            <button onClick={() => setIsStockModalOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-400">
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-base font-black text-slate-900 mb-0.5">{selectedDepot.name} - স্টক মজুদ ব্যালেন্স</h3>
            <p className="text-xs text-slate-400 mb-4">স্থান: {selectedDepot.location}</p>

            <div className="border border-slate-200 rounded-2xl overflow-hidden mb-5">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-extrabold">
                  <tr>
                    <th className="p-3">পণ্য নাম</th>
                    <th className="p-3 text-center">প্যাক সাইজ</th>
                    <th className="p-3 text-right">মজুদ (In Hand)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {products.map(p => {
                    const qty = p.subDepotStocks?.[selectedDepot.id] || 0;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-800">{p.name}</td>
                        <td className="p-3 text-center text-slate-500">{p.packSize || '-'}</td>
                        <td className="p-3 text-right font-bold text-blue-900 font-mono">
                          {qty} Pcs ({ (qty / (p.cartonSize || 1)).toFixed(1) } Ctn)
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => setIsStockModalOpen(false)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
            >
              বন্ধ করুন
            </button>
          </div>
        </div>
      )}

      {/* MODAL: CHALAN VOUCHER DETAILS */}
      {isTxModalOpen && selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative text-slate-900">
            <button onClick={() => setIsTxModalOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-400">
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-black text-slate-900 mb-0.5">চালান ভাউচার বিস্তারিত</h3>
            <p className="text-xs text-slate-400 mb-4 font-mono">আইডি: {selectedTx.id} | তারিখ: {selectedTx.date}</p>

            <div className="border border-slate-200 rounded-2xl overflow-hidden mb-4 text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-100 font-extrabold text-slate-700">
                  <tr>
                    <th className="p-2.5">পণ্য আইটেম</th>
                    <th className="p-2.5 text-center">কার্টুন</th>
                    <th className="p-2.5 text-right">ইউনিট পিস</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedTx.items.map((item, i) => (
                    <tr key={i}>
                      <td className="p-2.5 font-bold text-slate-800">{item.name}</td>
                      <td className="p-2.5 text-center font-bold text-blue-900">{item.qtyCartons} Ctn</td>
                      <td className="p-2.5 text-right font-mono text-slate-600">{item.qtyUnits} Pcs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl text-xs font-bold text-emerald-950 flex justify-between items-center">
              <span>কার্টুন কমিশন প্রাপ্তি:</span>
              <span className="text-base text-emerald-800 font-black font-mono">৳{selectedTx.commissionEarned.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* PRINT MODAL WRAPPER */}
      {showPrintModal && printData && (
        <PrintWrapper
          type="ledger"
          title={printTitle}
          data={printData}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  );
}
