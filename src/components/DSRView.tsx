/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, 
  Plus, 
  Search, 
  Trash2, 
  Save, 
  X, 
  Building2, 
  User, 
  ShoppingCart,
  CheckCircle,
  RefreshCw,
  FileText,
  DollarSign,
  Briefcase,
  AlertTriangle,
  Gift,
  Tag,
  Check,
  Calendar,
  Layers,
  FileSpreadsheet,
  ArrowRightLeft
} from 'lucide-react';
import { collection, getDocs, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SalesInvoice, Customer, Product, UserProfile, UserRole } from '../types';
import { logActivity } from '../lib/activityLogger';

// Extend types with local ones for DSR sheets
export interface DSRSheetItem {
  productId: string;
  name: string;
  rate: number;
  cartonSize: number;
  assignedUnits: number;
  returnedUnits: number;
  soldUnits: number;
  totalAmount: number;
}

export interface DSRSheet {
  id: string;
  dsrId: string;
  dsrName: string;
  route: string;
  date: string;
  status: 'assigned' | 'closed';
  createdAt: string;
  closedAt?: string;
  invoiceIds: string[];
  items: DSRSheetItem[];
  reconciliation?: {
    netSales: number;
    totalDamage: number;
    totalFree: number;
    totalDiscount: number;
    totalCustomerDue: number;
    totalExpense: number;
    netDueDsr: number;
    cashReceived: number;
    shortage: number;
    damages: Array<{ productId: string; name: string; pieces: number; unitValue: number; totalValue: number }>;
    freeProducts: Array<{ productId: string; name: string; pieces: number; unitValue: number; totalValue: number }>;
    discounts: Array<{ productId: string; name: string; amount: number }>;
    expenses: Array<{ category: string; amount: number }>;
    customerDues: Array<{ customerId: string; customerName: string; shopName: string; companyId: string; companyName: string; amount: number }>;
  };
}

export default function DSRView() {
  const [dsrSheets, setDsrSheets] = useState<DSRSheet[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [dsrUsers, setDsrUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // View control
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'create'>('list');
  const [selectedSheetForReturn, setSelectedSheetForReturn] = useState<DSRSheet | null>(null);

  // Create Form State
  const [selectedRoute, setSelectedRoute] = useState('');
  const [selectedDsrId, setSelectedDsrId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedInvoicesForLoad, setSelectedInvoicesForLoad] = useState<string[]>([]);

  // Return Processing States
  const [returnItems, setReturnItems] = useState<{ [productId: string]: { returnedCartons: number; returnedPieces: number } }>({});
  
  // Return Sub-Modules States
  const [damages, setDamages] = useState<Array<{ productId: string; name: string; pieces: number; unitValue: number }>>([]);
  const [freeProducts, setFreeProducts] = useState<Array<{ productId: string; name: string; pieces: number; unitValue: number }>>([]);
  const [discounts, setDiscounts] = useState<Array<{ productId: string; name: string; amount: number }>>([]);
  const [expenses, setExpenses] = useState<Array<{ category: string; amount: number }>>([
    { category: 'গাড়িভাড়া (Vehicle Fare)', amount: 0 },
    { category: 'নাস্তা (Snacks)', amount: 0 },
    { category: 'লেবার / কুলি (Labor/Coolie)', amount: 0 },
    { category: 'অন্যান্য (Others)', amount: 0 },
  ]);
  const [customerDues, setCustomerDues] = useState<Array<{ customerId: string; companyId: string; amount: number }>>([]);
  const [cashReceived, setCashReceived] = useState<number>(0);

  // Fetch all necessary data
  const loadData = async () => {
    try {
      setLoading(true);
      const [sheetsSnap, custSnap, prodSnap, invSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'dsrSheets')),
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'sales')),
        getDocs(collection(db, 'users'))
      ]);

      const sheetsList: DSRSheet[] = [];
      sheetsSnap.forEach(d => sheetsList.push(d.data() as DSRSheet));
      sheetsList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setDsrSheets(sheetsList);

      const custList: Customer[] = [];
      custSnap.forEach(d => custList.push(d.data() as Customer));
      setCustomers(custList);

      const prodList: Product[] = [];
      prodSnap.forEach(d => prodList.push(d.data() as Product));
      setProducts(prodList);

      const invList: SalesInvoice[] = [];
      invSnap.forEach(d => invList.push(d.data() as SalesInvoice));
      setInvoices(invList);

      const usersList: UserProfile[] = [];
      usersSnap.forEach(d => {
        const u = d.data() as UserProfile;
        if (u.role === UserRole.DSR || u.role === UserRole.SUPER_ADMIN || u.role === UserRole.MANAGER) {
          usersList.push(u);
        }
      });
      setDsrUsers(usersList);

    } catch (err) {
      console.error('Error loading DSR sheet datasets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Unique routes derived from customers
  const routes = Array.from(new Set(customers.map(c => c.route).filter(Boolean)));

  // Filter invoices belonging to selected route that are PENDING or DUE (or has remaining payment to be received)
  const routeInvoices = invoices.filter(inv => {
    const isMatchingRoute = inv.route === selectedRoute;
    const isUnclosed = inv.status !== 'PAID';
    return isMatchingRoute && isUnclosed;
  });

  // Automatically pre-select all invoices when Route changes
  useEffect(() => {
    setSelectedInvoicesForLoad(routeInvoices.map(inv => inv.id));
  }, [selectedRoute, invoices]);

  // Aggregate products from selected invoices
  const getAggregatedProducts = () => {
    const aggregated: { [productId: string]: { productId: string; name: string; qty: number; rate: number; cartonSize: number } } = {};
    
    invoices.forEach(inv => {
      if (selectedInvoicesForLoad.includes(inv.id)) {
        inv.items.forEach(item => {
          const prodObj = products.find(p => p.id === item.productId);
          const cartonSize = prodObj?.cartonSize || 1;
          if (aggregated[item.productId]) {
            aggregated[item.productId].qty += item.qty;
          } else {
            aggregated[item.productId] = {
              productId: item.productId,
              name: item.name,
              qty: item.qty,
              rate: item.price,
              cartonSize
            };
          }
        });
      }
    });

    return Object.values(aggregated);
  };

  const handleCreateDsrSheet = async () => {
    if (!selectedRoute || !selectedDsrId || selectedInvoicesForLoad.length === 0) {
      alert('দয়া করে রুট, ডিএসআর এবং অন্ততঃ একটি মেমো সিলেক্ট করুন। (Please select Route, DSR and at least one invoice.)');
      return;
    }

    const dsrUser = dsrUsers.find(u => u.id === selectedDsrId);
    if (!dsrUser) return;

    try {
      setLoading(true);
      const sheetId = 'dsr-sheet-' + Date.now();
      const aggregatedProducts = getAggregatedProducts();

      const itemsList: DSRSheetItem[] = aggregatedProducts.map(p => ({
        productId: p.productId,
        name: p.name,
        rate: p.rate,
        cartonSize: p.cartonSize,
        assignedUnits: p.qty,
        returnedUnits: 0,
        soldUnits: 0,
        totalAmount: 0
      }));

      const newSheet: DSRSheet = {
        id: sheetId,
        dsrId: selectedDsrId,
        dsrName: dsrUser.name,
        route: selectedRoute,
        date: selectedDate,
        status: 'assigned',
        createdAt: new Date().toISOString(),
        invoiceIds: selectedInvoicesForLoad,
        items: itemsList
      };

      await setDoc(doc(db, 'dsrSheets', sheetId), newSheet);

      // Log assignment activity
      await logActivity(
        'system_admin',
        'Manager / Admin',
        UserRole.SUPER_ADMIN,
        'SETTINGS_UPDATE',
        `Assigned route "${selectedRoute}" load sheet to DSR "${dsrUser.name}" on ${selectedDate} containing ${itemsList.length} items.`,
        { sheetId, route: selectedRoute, dsrName: dsrUser.name }
      );

      alert('ডিএসআর লোডশীট সফলভাবে তৈরি করা হয়েছে! (DSR Load Sheet successfully created and assigned!)');
      
      // Reset creation form
      setSelectedRoute('');
      setSelectedDsrId('');
      setSelectedInvoicesForLoad([]);
      setActiveSubTab('list');
      loadData();
    } catch (err) {
      console.error('Error creating DSR sheet:', err);
      alert('লোডশীট তৈরিতে সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।');
    } finally {
      setLoading(false);
    }
  };

  // Open Afternoon return page for a specific DSR Sheet
  const handleOpenReturnPage = (sheet: DSRSheet) => {
    setSelectedSheetForReturn(sheet);
    
    // Initialize returned cartons/pieces state to 0 for all items
    const returnsInit: typeof returnItems = {};
    sheet.items.forEach(it => {
      returnsInit[it.productId] = { returnedCartons: 0, returnedPieces: 0 };
    });
    setReturnItems(returnsInit);

    // Reset module inputs
    setDamages([]);
    setFreeProducts([]);
    setDiscounts([]);
    setExpenses([
      { category: 'গাড়িভাড়া (Vehicle Fare)', amount: 0 },
      { category: 'নাস্তা (Snacks)', amount: 0 },
      { category: 'লেবার / কুলি (Labor/Coolie)', amount: 0 },
      { category: 'অন্যান্য (Others)', amount: 0 },
    ]);
    setCustomerDues([]);
    setCashReceived(0);
  };

  // Helper to retrieve details of current sheet item
  const calculateItemSold = (productId: string, assignedUnits: number, rate: number, cartonSize: number) => {
    const ret = returnItems[productId] || { returnedCartons: 0, returnedPieces: 0 };
    const returnedUnits = (Number(ret.returnedCartons) * cartonSize) + Number(ret.returnedPieces);
    const soldUnits = Math.max(0, assignedUnits - returnedUnits);
    const soldValue = soldUnits * rate;

    // Display values
    const soldCartons = Math.floor(soldUnits / cartonSize);
    const soldPieces = soldUnits % cartonSize;

    return {
      returnedUnits,
      soldUnits,
      soldValue,
      soldCartons,
      soldPieces
    };
  };

  // Afternoon totals
  const getReconciliationTotals = () => {
    if (!selectedSheetForReturn) return { netSales: 0, totalDamage: 0, totalFree: 0, totalDiscount: 0, totalCustomerDue: 0, totalExpense: 0, netDueDsr: 0, shortage: 0 };

    // 1. Net Sales
    let netSales = 0;
    selectedSheetForReturn.items.forEach(it => {
      const { soldValue } = calculateItemSold(it.productId, it.assignedUnits, it.rate, it.cartonSize);
      netSales += soldValue;
    });

    // 2. Damages
    const totalDamage = damages.reduce((sum, d) => sum + (d.pieces * d.unitValue), 0);

    // 3. Free Products
    const totalFree = freeProducts.reduce((sum, f) => sum + (f.pieces * f.unitValue), 0);

    // 4. Discounts
    const totalDiscount = discounts.reduce((sum, d) => sum + d.amount, 0);

    // 5. Customer Dues
    const totalCustomerDue = customerDues.reduce((sum, c) => sum + c.amount, 0);

    // 6. Expenses
    const totalExpense = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    // 7. Net Due DSR
    const netDueDsr = netSales - totalDamage - totalFree - totalDiscount - totalCustomerDue - totalExpense;

    // 8. Shortage
    const shortage = netDueDsr - cashReceived;

    return {
      netSales,
      totalDamage,
      totalFree,
      totalDiscount,
      totalCustomerDue,
      totalExpense,
      netDueDsr,
      shortage
    };
  };

  // Submit checkout/returns to Firestore and close sheet
  const handleSubmitReturns = async () => {
    if (!selectedSheetForReturn) return;

    if (!window.confirm('আপনি কি হিসাব ক্লোজ করে রিটার্ন সাবমিট করতে চান? (Are you sure you want to close this load sheet?)')) {
      return;
    }

    try {
      setLoading(true);
      const batch = writeBatch(db);
      const { netSales, totalDamage, totalFree, totalDiscount, totalCustomerDue, totalExpense, netDueDsr, shortage } = getReconciliationTotals();

      // 1. Update DSR Sheet Status & items and reconciliation object
      const updatedItems = selectedSheetForReturn.items.map(it => {
        const { returnedUnits, soldUnits, soldValue } = calculateItemSold(it.productId, it.assignedUnits, it.rate, it.cartonSize);
        return {
          ...it,
          returnedUnits,
          soldUnits,
          totalAmount: soldValue
        };
      });

      const reconciliationObj = {
        netSales,
        totalDamage,
        totalFree,
        totalDiscount,
        totalCustomerDue,
        totalExpense,
        netDueDsr,
        cashReceived,
        shortage,
        damages: damages.map(d => ({ ...d, totalValue: d.pieces * d.unitValue })),
        freeProducts: freeProducts.map(f => ({ ...f, totalValue: f.pieces * f.unitValue })),
        discounts,
        expenses,
        customerDues: customerDues.map(c => {
          const cust = customers.find(custObj => custObj.id === c.customerId);
          return {
            customerId: c.customerId,
            customerName: cust?.name || 'Unknown',
            shopName: cust?.shopName || 'Unknown',
            companyId: c.companyId,
            companyName: 'Samira Traders',
            amount: c.amount
          };
        })
      };

      const sheetRef = doc(db, 'dsrSheets', selectedSheetForReturn.id);
      batch.update(sheetRef, {
        status: 'submitted_by_dsr',
        closedAt: new Date().toISOString(),
        items: updatedItems,
        reconciliation: reconciliationObj
      });

      await batch.commit();

      // Log completion activity
      await logActivity(
        'system_admin',
        'DSR / Manager',
        UserRole.MANAGER,
        'PAYMENT_ENTRY',
        `Submitted Route Load Sheet for DSR "${selectedSheetForReturn.dsrName}". Total Sales: ৳${netSales}, Cash Received: ৳${cashReceived}, Shortage: ৳${shortage}. Pending approval.`,
        { sheetId: selectedSheetForReturn.id, shortage, cashReceived }
      );

      alert('হিসাব দাখিল করা হয়েছে! ম্যানেজার যাচাইয়ের পর এডমিন চূড়ান্ত অনুমোদন দিলে ইনভেন্টরি ও খতিয়ান আপডেট হবে। (DSR afternoon checkout has been submitted! Inventory and ledgers will update upon Admin approval.)');
      setSelectedSheetForReturn(null);
      loadData();
    } catch (err) {
      console.error('Error submitting DSR afternoon returns:', err);
      alert('রিটার্ন সাবমিট করতে সমস্যা হয়েছে। দয়া করে ইন্টারনেট কানেকশন চেক করুন।');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6" id="dsr-panel-container">
      
      {/* Header and navigation tabs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-4 border-b border-gray-100">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900 flex items-center space-x-2">
            <ClipboardList className="w-6 h-6 text-blue-600" />
            <span>ডিএসআর লোডশীট ও বিকেল বেলার রিটার্ন (DSR load sheets & afternoon checkout)</span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            রুটের সব মেমো একত্রে সামারি তৈরি করে সকালে ডিএসআরকে অ্যাসাইন করুন এবং বিকেলে ফিরতি প্রোডাক্ট, খরচ ও রিকনসিলিয়েশন হিসাব বুঝে নিন।
          </p>
        </div>

        {!selectedSheetForReturn && (
          <div className="flex bg-slate-100 p-1.5 rounded-xl mt-4 md:mt-0 max-w-max self-start border border-gray-200">
            <button
              onClick={() => setActiveSubTab('list')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeSubTab === 'list' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              লোডশীট তালিকা (Assignments)
            </button>
            <button
              onClick={() => setActiveSubTab('create')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeSubTab === 'create' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              + নতুন অ্যাসাইনমেন্ট (New Load Sheet)
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="p-12 text-center flex flex-col items-center justify-center space-y-3 bg-white border border-gray-100 rounded-3xl shadow-sm">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-xs text-gray-500">ডাটাবেজ সিঙ্ক্রোনাইজ হচ্ছে, দয়া করে অপেক্ষা করুন...</p>
        </div>
      )}

      {/* Return Page Overlay (Afternoon Checkout Mode) */}
      {!loading && selectedSheetForReturn && (
        <div className="bg-slate-50 rounded-3xl p-4 md:p-6 border border-gray-200/80 space-y-6" id="afternoon-return-checkout-panel">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <span className="px-2.5 py-1 bg-yellow-50 text-yellow-700 text-[10px] font-extrabold uppercase rounded-lg tracking-wider border border-yellow-200">বিকেল বেলার রিটার্ন ও মিলকরণ (DSR Checkout)</span>
              <h3 className="text-lg font-extrabold text-slate-800 mt-1">হিসাব মিলকরণ: {selectedSheetForReturn.dsrName}</h3>
              <p className="text-xs text-slate-500 font-mono">রুট: {selectedSheetForReturn.route} | তারিখ: {selectedSheetForReturn.date}</p>
            </div>
            <button 
              onClick={() => setSelectedSheetForReturn(null)}
              className="p-2 bg-white text-gray-400 hover:text-slate-700 rounded-xl border border-gray-200 shadow-sm cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Columns - Inputs and lists */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Module 1: Product returns table */}
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                <h4 className="text-sm font-bold text-slate-800 flex items-center space-x-2 border-b pb-2">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  <span>১. প্রোডাক্ট রিটার্ন এন্ট্রি (Product Returns checkout)</span>
                </h4>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-gray-100 text-[10px] uppercase font-mono text-slate-500">
                        <th className="py-2.5 px-3">প্রোডাক্টের নাম (Product)</th>
                        <th className="py-2.5 px-3 text-center">সকালে লোড (Assigned)</th>
                        <th className="py-2.5 px-3 text-center bg-blue-50/50 text-blue-900 font-bold">রিটার্ন কার্টন (Ret Ctn)</th>
                        <th className="py-2.5 px-3 text-center bg-blue-50/50 text-blue-900 font-bold">রিটার্ন পিস (Ret Pcs)</th>
                        <th className="py-2.5 px-3 text-center">বিক্রি পরিমাণ (Net Sold)</th>
                        <th className="py-2.5 px-3 text-right">বিক্রি মূল্য (Value)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedSheetForReturn.items.map(it => {
                        const { returnedUnits, soldUnits, soldValue, soldCartons, soldPieces } = calculateItemSold(it.productId, it.assignedUnits, it.rate, it.cartonSize);
                        const ret = returnItems[it.productId] || { returnedCartons: 0, returnedPieces: 0 };
                        
                        // Formulate assigned carton & pieces
                        const assignedCartons = Math.floor(it.assignedUnits / it.cartonSize);
                        const assignedPieces = it.assignedUnits % it.cartonSize;

                        return (
                          <tr key={it.productId} className="hover:bg-slate-50/50">
                            <td className="py-3 px-3 font-semibold text-slate-800">{it.name}</td>
                            <td className="py-3 px-3 text-center font-mono">
                              {assignedCartons > 0 ? `${assignedCartons} ctn ` : ''}
                              {assignedPieces > 0 ? `${assignedPieces} pcs` : ''}
                              {assignedCartons === 0 && assignedPieces === 0 ? '0' : ''}
                              <span className="block text-[9px] text-gray-400">({it.assignedUnits} units)</span>
                            </td>
                            <td className="py-3 px-2 text-center bg-blue-50/20">
                              <input
                                type="number"
                                min="0"
                                value={ret.returnedCartons}
                                onChange={(e) => setReturnItems(prev => ({
                                  ...prev,
                                  [it.productId]: { ...prev[it.productId], returnedCartons: Math.max(0, parseInt(e.target.value) || 0) }
                                }))}
                                className="w-16 bg-white border border-gray-300 rounded px-1.5 py-1 text-center font-mono font-bold"
                              />
                            </td>
                            <td className="py-3 px-2 text-center bg-blue-50/20">
                              <input
                                type="number"
                                min="0"
                                max={it.cartonSize - 1}
                                value={ret.returnedPieces}
                                onChange={(e) => setReturnItems(prev => ({
                                  ...prev,
                                  [it.productId]: { ...prev[it.productId], returnedPieces: Math.max(0, parseInt(e.target.value) || 0) }
                                }))}
                                className="w-16 bg-white border border-gray-300 rounded px-1.5 py-1 text-center font-mono font-bold"
                              />
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-bold text-slate-900">
                              {soldCartons > 0 ? `${soldCartons} ctn ` : ''}
                              {soldPieces > 0 ? `${soldPieces} pcs` : ''}
                              {soldCartons === 0 && soldPieces === 0 ? '0' : ''}
                              <span className="block text-[9px] text-emerald-600">({soldUnits} sold)</span>
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-slate-900 font-mono">৳{soldValue.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Module 2: Free Products given */}
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                <h4 className="text-sm font-bold text-slate-800 flex items-center justify-between border-b pb-2">
                  <div className="flex items-center space-x-2">
                    <Gift className="w-4 h-4 text-purple-600" />
                    <span>২. ফ্রি প্রোডাক্ট এন্ট্রি (Free Products Entries)</span>
                  </div>
                  <button
                    onClick={() => setFreeProducts(prev => [...prev, { productId: '', name: '', pieces: 1, unitValue: 0 }])}
                    className="text-[11px] font-extrabold text-blue-600 hover:text-blue-800 flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ফ্রি প্রোডাক্ট যোগ করুন</span>
                  </button>
                </h4>

                {freeProducts.length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-2">কোন ফ্রি প্রোডাক্ট যোগ করা হয়নি।</p>
                ) : (
                  <div className="space-y-2">
                    {freeProducts.map((f, idx) => (
                      <div key={idx} className="flex flex-col md:flex-row items-center gap-2 bg-slate-50 p-2 rounded-xl">
                        <select
                          value={f.productId}
                          onChange={(e) => {
                            const pObj = products.find(prod => prod.id === e.target.value);
                            setFreeProducts(prev => prev.map((item, i) => i === idx ? {
                              ...item,
                              productId: e.target.value,
                              name: pObj?.name || '',
                              unitValue: pObj?.retailPrice || 0
                            } : item));
                          }}
                          className="flex-1 text-xs bg-white border border-gray-200 rounded-lg p-2 focus:outline-none"
                        >
                          <option value="">প্রোডাক্ট সিলেক্ট করুন (Select Product)</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            placeholder="পিস"
                            min="1"
                            value={f.pieces}
                            onChange={(e) => setFreeProducts(prev => prev.map((item, i) => i === idx ? { ...item, pieces: Math.max(1, parseInt(e.target.value) || 0) } : item))}
                            className="w-16 text-xs bg-white border border-gray-200 rounded-lg p-2 text-center"
                          />
                          <input
                            type="number"
                            placeholder="একক দর"
                            value={f.unitValue}
                            onChange={(e) => setFreeProducts(prev => prev.map((item, i) => i === idx ? { ...item, unitValue: Math.max(0, parseFloat(e.target.value) || 0) } : item))}
                            className="w-20 text-xs bg-white border border-gray-200 rounded-lg p-2 text-right"
                          />
                          <div className="w-20 text-xs font-bold font-mono text-slate-800 text-right">
                            ৳{(f.pieces * f.unitValue).toFixed(2)}
                          </div>
                          <button
                            onClick={() => setFreeProducts(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-rose-500 hover:bg-rose-100 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Module 3: Discounts */}
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                <h4 className="text-sm font-bold text-slate-800 flex items-center justify-between border-b pb-2">
                  <div className="flex items-center space-x-2">
                    <Tag className="w-4 h-4 text-blue-600" />
                    <span>৩. প্রোডাক্ট ডিসকাউন্ট (Product Discounts)</span>
                  </div>
                  <button
                    onClick={() => setDiscounts(prev => [...prev, { productId: '', name: '', amount: 0 }])}
                    className="text-[11px] font-extrabold text-blue-600 hover:text-blue-800 flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ডিসকাউন্ট যোগ করুন</span>
                  </button>
                </h4>

                {discounts.length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-2">কোন ডিসকাউন্ট এন্ট্রি যোগ করা হয়নি।</p>
                ) : (
                  <div className="space-y-2">
                    {discounts.map((d, idx) => (
                      <div key={idx} className="flex flex-col md:flex-row items-center gap-2 bg-slate-50 p-2 rounded-xl">
                        <select
                          value={d.productId}
                          onChange={(e) => {
                            const pObj = products.find(prod => prod.id === e.target.value);
                            setDiscounts(prev => prev.map((item, i) => i === idx ? {
                              ...item,
                              productId: e.target.value,
                              name: pObj?.name || ''
                            } : item));
                          }}
                          className="flex-1 text-xs bg-white border border-gray-200 rounded-lg p-2 focus:outline-none"
                        >
                          <option value="">প্রোডাক্ট সিলেক্ট করুন (Select Product)</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            placeholder="ডিসকাউন্ট টাকা"
                            value={d.amount}
                            onChange={(e) => setDiscounts(prev => prev.map((item, i) => i === idx ? { ...item, amount: Math.max(0, parseFloat(e.target.value) || 0) } : item))}
                            className="w-32 text-xs bg-white border border-gray-200 rounded-lg p-2 text-right font-bold"
                          />
                          <button
                            onClick={() => setDiscounts(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-rose-500 hover:bg-rose-100 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Module 4: Market Expenses */}
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                <h4 className="text-sm font-bold text-slate-800 flex items-center space-x-2 border-b pb-2">
                  <Briefcase className="w-4 h-4 text-amber-600" />
                  <span>৪. মার্কেট খরচ এন্ট্রি (Route Expenses)</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {expenses.map((e, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl">
                      <span className="text-xs font-bold text-slate-700">{e.category}</span>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs text-gray-400">৳</span>
                        <input
                          type="number"
                          value={e.amount || ''}
                          onChange={(eVal) => setExpenses(prev => prev.map((item, i) => i === idx ? { ...item, amount: Math.max(0, parseFloat(eVal.target.value) || 0) } : item))}
                          className="w-24 bg-white border border-gray-200 rounded-lg p-1.5 text-right text-xs font-bold font-mono"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Module 5: Customer dues / Credits */}
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                <h4 className="text-sm font-bold text-slate-800 flex items-center justify-between border-b pb-2">
                  <div className="flex items-center space-x-2">
                    <DollarSign className="w-4 h-4 text-rose-600" />
                    <span>৫. কআর বাকী / মেমো ট্রান্সফার (Customer Dues / Credits)</span>
                  </div>
                  <button
                    onClick={() => setCustomerDues(prev => [...prev, { customerId: '', companyId: '', amount: 0 }])}
                    className="text-[11px] font-extrabold text-blue-600 hover:text-blue-800 flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>বাকী মেমো যোগ করুন</span>
                  </button>
                </h4>

                {customerDues.length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-2">কোন বাকী মেমো ট্রান্সফার যোগ করা হয়নি।</p>
                ) : (
                  <div className="space-y-2">
                    {customerDues.map((c, idx) => (
                      <div key={idx} className="flex flex-col md:flex-row items-center gap-2 bg-slate-50 p-2 rounded-xl">
                        <select
                          value={c.customerId}
                          onChange={(e) => {
                            setCustomerDues(prev => prev.map((item, i) => i === idx ? {
                              ...item,
                              customerId: e.target.value
                            } : item));
                          }}
                          className="flex-1 text-xs bg-white border border-gray-200 rounded-lg p-2 focus:outline-none"
                        >
                          <option value="">গ্রাহক সিলেক্ট করুন (Select Customer)</option>
                          {customers.filter(cust => cust.route === selectedSheetForReturn.route).map(cust => (
                            <option key={cust.id} value={cust.id}>{cust.shopName} ({cust.name})</option>
                          ))}
                        </select>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            placeholder="বাকী টাকা"
                            value={c.amount || ''}
                            onChange={(e) => setCustomerDues(prev => prev.map((item, i) => i === idx ? { ...item, amount: Math.max(0, parseFloat(e.target.value) || 0) } : item))}
                            className="w-28 text-xs bg-white border border-gray-200 rounded-lg p-2 text-right font-bold"
                          />
                          <button
                            onClick={() => setCustomerDues(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-rose-500 hover:bg-rose-100 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Module 6: Unsold Damages */}
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                <h4 className="text-sm font-bold text-slate-800 flex items-center justify-between border-b pb-2">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    <span>৬. ড্যামেজ প্রোডাক্ট এন্ট্রি (Damage Product Entry)</span>
                  </div>
                  <button
                    onClick={() => setDamages(prev => [...prev, { productId: '', name: '', pieces: 1, unitValue: 0 }])}
                    className="text-[11px] font-extrabold text-blue-600 hover:text-blue-800 flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ড্যামেজ প্রোডাক্ট যোগ করুন</span>
                  </button>
                </h4>

                {damages.length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-2">কোন ড্যামেজ প্রোডাক্ট যোগ করা হয়নি।</p>
                ) : (
                  <div className="space-y-2">
                    {damages.map((d, idx) => (
                      <div key={idx} className="flex flex-col md:flex-row items-center gap-2 bg-slate-50 p-2 rounded-xl">
                        <select
                          value={d.productId}
                          onChange={(e) => {
                            const pObj = products.find(prod => prod.id === e.target.value);
                            setDamages(prev => prev.map((item, i) => i === idx ? {
                              ...item,
                              productId: e.target.value,
                              name: pObj?.name || '',
                              unitValue: pObj?.retailPrice || 0
                            } : item));
                          }}
                          className="flex-1 text-xs bg-white border border-gray-200 rounded-lg p-2 focus:outline-none"
                        >
                          <option value="">প্রোডাক্ট সিলেক্ট করুন (Select Product)</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            placeholder="পিস"
                            min="1"
                            value={d.pieces}
                            onChange={(e) => setDamages(prev => prev.map((item, i) => i === idx ? { ...item, pieces: Math.max(1, parseInt(e.target.value) || 0) } : item))}
                            className="w-16 text-xs bg-white border border-gray-200 rounded-lg p-2 text-center"
                          />
                          <input
                            type="number"
                            placeholder="একক দর"
                            value={d.unitValue}
                            onChange={(e) => setDamages(prev => prev.map((item, i) => i === idx ? { ...item, unitValue: Math.max(0, parseFloat(e.target.value) || 0) } : item))}
                            className="w-20 text-xs bg-white border border-gray-200 rounded-lg p-2 text-right"
                          />
                          <div className="w-20 text-xs font-bold font-mono text-slate-800 text-right">
                            ৳{(d.pieces * d.unitValue).toFixed(2)}
                          </div>
                          <button
                            onClick={() => setDamages(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-rose-500 hover:bg-rose-100 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Right Column - Beautiful Cash Reconciliation Receipt Panel */}
            <div className="space-y-6">
              
              <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-xl space-y-6 sticky top-6">
                <div className="text-center border-b border-slate-800 pb-4 space-y-1">
                  <h4 className="text-xs text-blue-400 font-mono tracking-widest uppercase">Samira Traders</h4>
                  <h5 className="font-bold text-sm tracking-wider">ক্যাশ মিলকরণ রশিদ (Reconciliation)</h5>
                  <p className="text-[10px] text-slate-500">তারিখ: {selectedSheetForReturn.date}</p>
                </div>

                {/* Calculations summary lists matching picture calculations */}
                <div className="space-y-3 text-xs">
                  
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">মোট সামারি মূল্য (Assigned Load Value)</span>
                    <span className="font-bold font-mono">
                      ৳{selectedSheetForReturn.items.reduce((s, it) => s + (it.assignedUnits * it.rate), 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-800/60 text-rose-400">
                    <span className="text-slate-400">ফিরতি প্রোডাক্ট মূল্য (-) (Returned Value)</span>
                    <span className="font-bold font-mono">
                      - ৳{selectedSheetForReturn.items.reduce((s, it) => {
                        const ret = returnItems[it.productId] || { returnedCartons: 0, returnedPieces: 0 };
                        const returnedUnits = (ret.returnedCartons * it.cartonSize) + ret.returnedPieces;
                        return s + (returnedUnits * it.rate);
                      }, 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 font-bold text-sm text-emerald-400">
                    <span>১. মোট বিক্রি (Net Sales)</span>
                    <span className="font-mono">৳{getReconciliationTotals().netSales.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 text-rose-300">
                    <span className="text-slate-400">২. মোট ড্যামেজ মূল্য (-) (Damages)</span>
                    <span className="font-bold font-mono">- ৳{getReconciliationTotals().totalDamage.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 text-purple-300">
                    <span className="text-slate-400">৩. ফ্রি প্রোডাক্ট মূল্য (-) (Free Products)</span>
                    <span className="font-bold font-mono">- ৳{getReconciliationTotals().totalFree.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 text-blue-300">
                    <span className="text-slate-400">৪. টোটাল ডিসকাউন্ট (-) (Discounts)</span>
                    <span className="font-bold font-mono">- ৳{getReconciliationTotals().totalDiscount.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 text-rose-300">
                    <span className="text-slate-400">৫. কাস্টমার মোট বাকী (-) (Customer Credits)</span>
                    <span className="font-bold font-mono">- ৳{getReconciliationTotals().totalCustomerDue.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 text-amber-300 border-b border-slate-800 pb-3">
                    <span className="text-slate-400">৬. মোট মার্কেট খরচ (-) (Expenses)</span>
                    <span className="font-bold font-mono">- ৳{getReconciliationTotals().totalExpense.toFixed(2)}</span>
                  </div>

                  {/* Highlighted DSR Balance Payable */}
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5 text-center">
                    <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-widest block">মোট প্রদেয় DSR (Net Due DSR)</span>
                    <div className="text-2xl font-black font-mono text-white">৳{getReconciliationTotals().netDueDsr.toFixed(2)}</div>
                  </div>

                  {/* Input for cash submitted */}
                  <div className="space-y-1.5 pt-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">নগদ জমা রশিদ (Cash Received from DSR)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-500 text-xs">৳</span>
                      <input
                        type="number"
                        placeholder="জমাকৃত নগদ টাকার পরিমাণ"
                        value={cashReceived || ''}
                        onChange={(e) => setCashReceived(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-700 pl-7 pr-3 py-2.5 rounded-xl text-sm focus:outline-none focus:border-emerald-500 font-bold font-mono"
                      />
                    </div>
                  </div>

                  {/* Shortage indicator */}
                  <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center">
                    <span className="text-slate-400 font-bold">বাকী / ঘাটতি (Shortage / Balance)</span>
                    <span className={`font-mono font-black text-sm ${getReconciliationTotals().shortage > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      ৳{getReconciliationTotals().shortage.toFixed(2)}
                    </span>
                  </div>

                </div>

                <button
                  onClick={handleSubmitReturns}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-xs transition-all flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/20 cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>রিটার্ন সাবমিট ও হিসাব মিলান (Submit & Close)</span>
                </button>

              </div>

            </div>

          </div>
        </div>
      )}

      {/* CREATE DSR LOAD SHEET PANEL */}
      {!loading && !selectedSheetForReturn && activeSubTab === 'create' && (
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6" id="dsr-create-panel">
          <div className="border-b pb-3">
            <h3 className="text-base font-extrabold text-slate-800">নতুন DSR লোডশীট ও মাল্টিপল মেমো এসেন্ড</h3>
            <p className="text-xs text-gray-500">নির্দিষ্ট রুট এবং ডিএসআর সিলেক্ট করে মেমোগুলোকে একটি লোডশীটে কনভার্ট করুন।</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Input fields */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5 tracking-wider">রুট সিলেক্ট করুন (Select Route)</label>
              <select
                value={selectedRoute}
                onChange={(e) => setSelectedRoute(e.target.value)}
                className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">রুট সিলেক্ট করুন</option>
                {routes.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5 tracking-wider">ডিএসআর সিলেক্ট করুন (Select DSR)</label>
              <select
                value={selectedDsrId}
                onChange={(e) => setSelectedDsrId(e.target.value)}
                className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">ডিএসআর সিলেক্ট করুন</option>
                {dsrUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5 tracking-wider">তারিখ (Date)</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
            </div>

          </div>

          {selectedRoute && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t">
              
              {/* Left pane - memos checking */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-700">১. মেমো নির্বাচন করুন ({routeInvoices.length}টি মেমো পাওয়া গেছে)</h4>
                  <button
                    onClick={() => {
                      if (selectedInvoicesForLoad.length === routeInvoices.length) {
                        setSelectedInvoicesForLoad([]);
                      } else {
                        setSelectedInvoicesForLoad(routeInvoices.map(i => i.id));
                      }
                    }}
                    className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    সব সিলেক্ট/আনসিলেক্ট করুন
                  </button>
                </div>

                {routeInvoices.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-gray-200">
                    <p className="text-xs text-gray-400 italic">এই রুটে কোনো বকেয়া মেমো পাওয়া যায়নি।</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-2 scrollbar-thin">
                    {routeInvoices.map(inv => {
                      const isSelected = selectedInvoicesForLoad.includes(inv.id);
                      return (
                        <div
                          key={inv.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedInvoicesForLoad(prev => prev.filter(id => id !== inv.id));
                            } else {
                              setSelectedInvoicesForLoad(prev => [...prev, inv.id]);
                            }
                          }}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex justify-between items-center ${
                            isSelected ? 'bg-blue-50/50 border-blue-200' : 'bg-white border-gray-100 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`p-1.5 rounded-lg border ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                              <Check className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-800">{inv.shopName} ({inv.customerName})</p>
                              <span className="text-[10px] text-gray-500 font-mono">মেমো: {inv.invoiceNo} | কোম্পানি: {inv.companyName}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black text-slate-800 font-mono">৳{inv.grandTotal}</span>
                            <span className="block text-[9px] text-rose-500 font-bold font-mono">৳{inv.grandTotal - inv.paymentReceived} বাকী</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right pane - Load Sheet Product Aggregation */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100 space-y-4">
                <h4 className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>২. লোডশীট মাল্টিপল সামারি (Load Sheet Summary)</span>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-lg font-mono">
                    {getAggregatedProducts().length}টি আইটেম
                  </span>
                </h4>

                <div className="overflow-x-auto bg-white rounded-xl border border-gray-200/60 shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-100/80 text-[10px] uppercase font-mono text-slate-600 border-b border-gray-200">
                        <th className="py-2 px-3">নাম</th>
                        <th className="py-2 px-3 text-center">মোট পরিমাণ (Units)</th>
                        <th className="py-2 px-3 text-center">কার্টন + পিস (Ctn/Pcs)</th>
                        <th className="py-2 px-3 text-right">মূল্য (Trade Value)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {getAggregatedProducts().length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-gray-400 italic">কোনো মেমো সিলেক্ট করা হয়নি</td>
                        </tr>
                      ) : (
                        getAggregatedProducts().map(p => {
                          const cartons = Math.floor(p.qty / p.cartonSize);
                          const pieces = p.qty % p.cartonSize;
                          const totalVal = p.qty * p.rate;

                          return (
                            <tr key={p.productId}>
                              <td className="py-2.5 px-3 font-semibold text-slate-800">{p.name}</td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-blue-600">{p.qty}</td>
                              <td className="py-2.5 px-3 text-center font-mono">
                                {cartons > 0 ? `${cartons} ctn ` : ''}
                                {pieces > 0 ? `${pieces} pcs` : ''}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700">৳{totalVal.toFixed(2)}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {getAggregatedProducts().length > 0 && (
                  <div className="flex justify-between items-center pt-2 font-black border-t text-sm text-slate-800">
                    <span>মোট লোড ভ্যালু:</span>
                    <span className="font-mono text-blue-700">
                      ৳{getAggregatedProducts().reduce((sum, p) => sum + (p.qty * p.rate), 0).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              onClick={() => {
                setSelectedRoute('');
                setActiveSubTab('list');
              }}
              className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              বাতিল (Cancel)
            </button>
            <button
              onClick={handleCreateDsrSheet}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-lg shadow-blue-500/15 cursor-pointer"
            >
              লোডশীট অ্যাসাইন করুন (Assign Load Sheet)
            </button>
          </div>
        </div>
      )}

      {/* DSR ASSIGNMENT LIST TAB */}
      {!loading && !selectedSheetForReturn && activeSubTab === 'list' && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden" id="dsr-list-panel">
          
          <div className="p-5 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                placeholder="রুট বা ডিএসআরের নাম খুঁজুন..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            
            <div className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">
              {dsrSheets.length}টি অ্যাসাইনমেন্ট রেকর্ড পাওয়া গেছে
            </div>
          </div>

          {dsrSheets.length === 0 ? (
            <div className="p-16 text-center text-gray-400 italic space-y-2">
              <ClipboardList className="w-10 h-10 mx-auto text-gray-300 animate-pulse" />
              <p>কোনো ডিএসআর লোডশীট অ্যাসাইনমেন্ট পাওয়া যায়নি।</p>
              <button
                onClick={() => setActiveSubTab('create')}
                className="text-xs text-blue-600 font-bold hover:underline"
              >
                + প্রথম অ্যাসাইনমেন্ট তৈরি করুন
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-mono text-slate-500 border-b border-gray-100">
                    <th className="py-3.5 px-5">রুট (Route)</th>
                    <th className="py-3.5 px-5">ডিএসআর (DSR)</th>
                    <th className="py-3.5 px-5">তারিখ (Date)</th>
                    <th className="py-3.5 px-5">লোড আইটেম (Items)</th>
                    <th className="py-3.5 px-5">অবস্থা (Status)</th>
                    <th className="py-3.5 px-5 text-right">নেট বিক্রি / নগদ রিসিভড</th>
                    <th className="py-3.5 px-5 text-center">অ্যাকশন (Actions)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dsrSheets.map(sheet => {
                    const isClosed = sheet.status === 'closed' || sheet.status === 'submitted_by_dsr' || sheet.status === 'reviewed_by_manager' || sheet.status === 'approved_by_admin';
                    const itemsCount = sheet.items.length;
                    
                    return (
                      <tr key={sheet.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-4 px-5 font-bold text-slate-900">{sheet.route}</td>
                        <td className="py-4 px-5 text-slate-700">{sheet.dsrName}</td>
                        <td className="py-4 px-5 font-mono text-gray-500">{sheet.date}</td>
                        <td className="py-4 px-5">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-semibold font-mono rounded text-[10px]">
                            {itemsCount} Products
                          </span>
                        </td>
                        <td className="py-4 px-5">
                          {sheet.status === 'assigned' && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 bg-yellow-50 text-yellow-700 font-bold rounded-lg border border-yellow-200 animate-pulse">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span>মাঠে আছে (Active)</span>
                            </span>
                          )}
                          {sheet.status === 'submitted_by_dsr' && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 bg-orange-50 text-orange-700 font-bold rounded-lg border border-orange-200">
                              <RefreshCw className="w-3 h-3" />
                              <span>হিসাব দাখিলকৃত (Pending Review)</span>
                            </span>
                          )}
                          {sheet.status === 'reviewed_by_manager' && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 bg-blue-50 text-blue-700 font-bold rounded-lg border border-blue-200">
                              <RefreshCw className="w-3 h-3" />
                              <span>ম্যানেজার যাচাইকৃত (Pending Admin)</span>
                            </span>
                          )}
                          {(sheet.status === 'approved_by_admin' || sheet.status === 'closed') && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded-lg border border-emerald-200">
                              <CheckCircle className="w-3 h-3" />
                              <span>চূড়ান্ত অনুমোদিত (Approved)</span>
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-5 text-right font-mono font-bold text-slate-800">
                          {isClosed && sheet.reconciliation ? (
                            <div>
                              <span>৳{sheet.reconciliation.netSales.toFixed(2)}</span>
                              <span className="block text-[10px] text-emerald-600">নগদ: ৳{sheet.reconciliation.cashReceived.toFixed(2)}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">হিসাব হয়নি</span>
                          )}
                        </td>
                        <td className="py-4 px-5 text-center">
                          {sheet.status === 'assigned' ? (
                            <button
                              onClick={() => handleOpenReturnPage(sheet)}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3.5 rounded-lg text-[11px] transition-all cursor-pointer shadow-sm shadow-blue-500/10 hover:shadow"
                            >
                              হিসাব মিলান (Checkout Returns)
                            </button>
                          ) : sheet.status === 'submitted_by_dsr' ? (
                            <div className="text-[10px] text-orange-600 bg-orange-50 font-bold py-1 px-2.5 rounded-lg border border-orange-100 max-w-max mx-auto">
                              ম্যানেজার যাচাই পেন্ডিং
                            </div>
                          ) : sheet.status === 'reviewed_by_manager' ? (
                            <div className="text-[10px] text-blue-600 bg-blue-50 font-bold py-1 px-2.5 rounded-lg border border-blue-100 max-w-max mx-auto">
                              এডমিন অনুমোদন পেন্ডিং
                            </div>
                          ) : (
                            <div className="flex items-center justify-center space-x-2 text-[11px] font-bold text-emerald-600 bg-emerald-50 py-1 px-2.5 rounded-lg max-w-max mx-auto">
                              <Check className="w-3.5 h-3.5" />
                              <span>হিসাব সম্পন্ন</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
