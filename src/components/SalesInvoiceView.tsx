/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  FileText, 
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
  Eye,
  Route,
  Printer
} from 'lucide-react';
import { collection, getDocs, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SalesInvoice, Customer, Company, Product, InvoiceItem, UserRole } from '../types';
import { logActivity } from '../lib/activityLogger';
import PrintWrapper from './PrintWrapper';

interface SalesInvoiceViewProps {
  userRole: UserRole;
  userId: string;
  userName: string;
}

export default function SalesInvoiceView({ userRole, userId, userName }: SalesInvoiceViewProps) {
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(() => {
    const globalSearch = sessionStorage.getItem('dms_global_search_term');
    if (globalSearch) {
      sessionStorage.removeItem('dms_global_search_term');
      return globalSearch;
    }
    return '';
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);

  // Print Wrapper States
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printData, setPrintData] = useState<any>(null);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);

  // New Invoice Form
  const [customerId, setCustomerId] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [paymentReceived, setPaymentReceived] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_BANKING' | 'CHEQUE' | 'DUE'>('CASH');

  // Auto-save states
  const [hasAutosavedDraft, setHasAutosavedDraft] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isFlashActive, setIsFlashActive] = useState(false);

  // Check for auto-saved draft when modal opens
  useEffect(() => {
    if (isAddModalOpen) {
      const saved = localStorage.getItem('dms_autosave_sales_invoice');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.customerId || parsed.selectedRoute || parsed.companyId || (parsed.items && parsed.items.length > 0)) {
            setHasAutosavedDraft(true);
          }
        } catch (e) {
          console.error("Failed to parse auto-saved sales draft", e);
        }
      }
    } else {
      setHasAutosavedDraft(false);
    }
  }, [isAddModalOpen]);

  // Periodic auto-save effect
  useEffect(() => {
    if (!isAddModalOpen) return;

    const interval = setInterval(() => {
      const draft = {
        customerId,
        selectedRoute,
        companyId,
        invoiceDate,
        items,
        discount,
        paymentReceived,
        paymentMethod
      };

      if (customerId || selectedRoute || companyId || items.length > 0 || discount > 0 || paymentReceived > 0) {
        localStorage.setItem('dms_autosave_sales_invoice', JSON.stringify(draft));
        const now = new Date().toLocaleTimeString();
        setLastSavedTime(now);
        setIsFlashActive(true);
        setTimeout(() => setIsFlashActive(false), 2000);
        console.log(`[Auto-Save] Sales invoice form saved at ${now}`);
      }
    }, 30000); // every 30s

    return () => clearInterval(interval);
  }, [isAddModalOpen, customerId, selectedRoute, companyId, invoiceDate, items, discount, paymentReceived, paymentMethod]);

  const handleRestoreDraft = () => {
    const saved = localStorage.getItem('dms_autosave_sales_invoice');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.customerId !== undefined) setCustomerId(parsed.customerId);
        if (parsed.selectedRoute !== undefined) setSelectedRoute(parsed.selectedRoute);
        if (parsed.companyId !== undefined) setCompanyId(parsed.companyId);
        if (parsed.invoiceDate !== undefined) setInvoiceDate(parsed.invoiceDate);
        if (parsed.items !== undefined) setItems(parsed.items);
        if (parsed.discount !== undefined) setDiscount(parsed.discount);
        if (parsed.paymentReceived !== undefined) setPaymentReceived(parsed.paymentReceived);
        if (parsed.paymentMethod !== undefined) setPaymentMethod(parsed.paymentMethod);

        setHasAutosavedDraft(false);
        alert('Invoice draft restored successfully! (ইনভয়েস ড্রাফট সফলভাবে পুনরুদ্ধার করা হয়েছে)');
      } catch (e) {
        console.error("Failed to restore invoice draft", e);
      }
    }
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem('dms_autosave_sales_invoice');
    setHasAutosavedDraft(false);
  };

  // Single item adder state
  const [currentProductId, setCurrentProductId] = useState('');
  const [currentCtn, setCurrentCtn] = useState<number>(0);
  const [currentPcs, setCurrentPcs] = useState<number>(0);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Fetch companies, customers, products, and sales invoices in parallel
      const [compSnap, custSnap, prodSnap, invSnap] = await Promise.all([
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'sales'))
      ]);

      const compList: Company[] = [];
      compSnap.forEach(d => compList.push(d.data() as Company));
      setCompanies(compList);

      const custList: Customer[] = [];
      custSnap.forEach(d => custList.push(d.data() as Customer));
      setCustomers(custList);

      const prodList: Product[] = [];
      prodSnap.forEach(d => prodList.push(d.data() as Product));
      setProducts(prodList);

      const invList: SalesInvoice[] = [];
      invSnap.forEach(d => invList.push(d.data() as SalesInvoice));
      
      // Sort invoices by date and time descending
      invList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setInvoices(invList);

    } catch (err) {
      console.error('Error loading sales data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAddModal = () => {
    setCustomerId('');
    setSelectedRoute('');
    setCompanyId('');
    setItems([]);
    setDiscount(0);
    setPaymentReceived(0);
    setPaymentMethod('CASH');
    setCurrentProductId('');
    setCurrentCtn(0);
    setCurrentPcs(0);
    setIsAddModalOpen(true);
  };

  // Filter products by selected Company
  const availableProducts = products.filter(p => p.companyId === companyId);

  const handleAddItem = () => {
    if (!currentProductId) return;
    const prod = products.find(p => p.id === currentProductId);
    if (!prod) return;

    // Calculate final units qty based on carton and pieces inputs
    const units = (currentCtn * prod.cartonSize) + currentPcs;
    if (units <= 0) {
      alert('দয়া করে কার্টুন অথবা পিস এর ঘরে সঠিক পরিমাণ লিখুন!');
      return;
    }
    const cartonQty = units / prod.cartonSize;

    // Check primary stock
    if (prod.stockCount < units) {
      alert(`স্টকে পর্যাপ্ত পরিমাণ পণ্য নেই! উপলব্ধ স্টক: ${prod.stockCount} পিস, এন্ট্রি করেছেন: ${units} পিস।`);
      return;
    }

    // Check if already added
    const existing = items.find(i => i.productId === currentProductId);
    if (existing) {
      const newQty = existing.qty + units;
      if (prod.stockCount < newQty) {
        alert(`স্টকে পর্যাপ্ত পরিমাণ পণ্য নেই!`);
        return;
      }
      setItems(prev => prev.map(i => i.productId === currentProductId ? {
        ...i,
        qty: newQty,
        cartonQty: newQty / prod.cartonSize,
        total: newQty * prod.retailPrice
      } : i));
    } else {
      const newItem: InvoiceItem = {
        productId: prod.id,
        name: prod.name,
        qty: units,
        price: prod.retailPrice,
        total: units * prod.retailPrice,
        cartonQty: cartonQty
      };
      setItems(prev => [...prev, newItem]);
    }

    // Reset single item state
    setCurrentProductId('');
    setCurrentCtn(0);
    setCurrentPcs(0);
  };

  const handleRemoveItem = (prodId: string) => {
    setItems(prev => prev.filter(i => i.productId !== prodId));
  };

  const calculateSubTotal = () => {
    return items.reduce((sum, item) => sum + item.total, 0);
  };

  const calculateGrandTotal = () => {
    return Math.max(0, calculateSubTotal() - discount);
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !selectedRoute || items.length === 0) {
      alert('Please fill out SR Route/Area, Brand Company, and add at least one product SKU.');
      return;
    }

    const companyObj = companies.find(c => c.id === companyId);
    if (!companyObj) return;

    const customerObj = customerId ? customers.find(c => c.id === customerId) : null;

    try {
      setLoading(true);
      const batch = writeBatch(db);
      const invoiceId = 'inv-' + Date.now();
      const invoiceNo = 'INV-' + Date.now().toString().slice(-6);
      const subTotal = calculateSubTotal();
      const grandTotal = calculateGrandTotal();
      
      const dueAmt = Math.max(0, grandTotal - paymentReceived);
      const status = paymentReceived >= grandTotal ? 'PAID' : (paymentReceived > 0 ? 'PARTIAL' : 'DUE');

      // 1. Create Sales Invoice Record
      const invoiceObj: SalesInvoice = {
        id: invoiceId,
        invoiceNo,
        date: invoiceDate,
        customerId: customerId || 'walk-in',
        customerName: customerObj ? customerObj.name : 'Spot Client',
        shopName: customerObj ? customerObj.shopName : 'Generic Outlet / Area Sale',
        companyId,
        companyName: companyObj.name,
        items,
        subTotal,
        discount,
        grandTotal,
        paymentReceived,
        paymentMethod,
        route: customerObj ? customerObj.route : selectedRoute,
        area: customerObj ? customerObj.area : selectedRoute,
        status,
        createdAt: new Date().toISOString()
      };

      batch.set(doc(db, 'sales', invoiceId), invoiceObj);

      // 2. Adjust Product Stocks
      for (const item of items) {
        const prod = products.find(p => p.id === item.productId);
        if (prod) {
          const newStock = Math.max(0, prod.stockCount - item.qty);
          batch.update(doc(db, 'products', prod.id), { stockCount: newStock });
        }
      }

      // 3. Update Customer Outstanding Company-Wise Dues & Ledger (if customer is selected)
      if (customerObj) {
        const currentDues = customerObj.dues || {};
        const previousCompanyDue = currentDues[companyId] || 0;
        
        // If payment mode is DUE or there is partial due, increase company due
        const newCompanyDue = previousCompanyDue + dueAmt;
        const updatedDues = {
          ...currentDues,
          [companyId]: newCompanyDue
        };
        
        const newTotalDue = Object.values(updatedDues).reduce((s: number, a: unknown) => s + (Number(a) || 0), 0);

        batch.update(doc(db, 'customers', customerId), {
          dues: updatedDues,
          totalDue: newTotalDue
        });

        // 4. Record Customer Ledger Entry
        const ledgerEntryId = `ledger-${invoiceId}`;
        batch.set(doc(db, 'ledgers', ledgerEntryId), {
          id: ledgerEntryId,
          customerId,
          companyId,
          companyName: companyObj.name,
          type: 'INVOICE',
          referenceId: invoiceId,
          referenceNo: invoiceNo,
          date: invoiceDate,
          amount: grandTotal,
          balanceAfter: newCompanyDue,
          createdAt: new Date().toISOString()
        });
      }

      await batch.commit();

      // Log action to Firestore
      await logActivity(
        userId,
        userName,
        userRole,
        'INVOICE_CREATE',
        `Created Sales Invoice #${invoiceNo} for customer ${customerObj ? customerObj.name : 'Spot Client'} (${customerObj ? customerObj.shopName : 'Generic Outlet'}) - Total: ৳${grandTotal}`,
        { invoiceId, invoiceNo, grandTotal, customerId: customerId || 'walk-in', companyId }
      );

      localStorage.removeItem('dms_autosave_sales_invoice');
      setIsAddModalOpen(false);
      loadData();
    } catch (err) {
      console.error('Error creating invoice:', err);
      alert('Failed to generate sales invoice. Please check internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewInvoiceDetails = (inv: SalesInvoice) => {
    setSelectedInvoice(inv);
    setIsDetailModalOpen(true);
  };

  return (
    <div className="space-y-6" id="sales-module">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Sales Invoicing</h2>
          <p className="text-sm text-gray-500">Record retail outlet invoices, adjust company ledgers, and manage stock outflows</p>
        </div>
        <button
          onClick={handleOpenAddModal}
          id="btn-new-invoice"
          className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Create Sales Invoice</span>
        </button>
      </div>

      {/* Invoice Records Table */}
      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-500">Loading sales journal...</p>
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No sales invoices recorded yet</p>
          <p className="text-xs text-gray-400 mt-1">Click the top-right button to generate your first distribution sales bill.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Quick Search Filtering Bar */}
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center space-x-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
              <input
                type="text"
                placeholder="মেমো নং, দোকান বা কোম্পানির নাম দিয়ে ইনভয়েস খুঁজুন (Search by Invoice No, shop name or company...)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                id="input-sales-search"
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 placeholder-gray-400 pl-10 pr-4 py-2.5 rounded-xl text-xs focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-semibold"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 font-bold text-xs cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {(() => {
            const filteredInvoices = invoices.filter(inv => {
              const term = searchTerm.toLowerCase();
              return (
                inv.invoiceNo.toLowerCase().includes(term) ||
                inv.shopName.toLowerCase().includes(term) ||
                inv.companyName.toLowerCase().includes(term) ||
                (inv.route && inv.route.toLowerCase().includes(term)) ||
                (inv.customerName && inv.customerName.toLowerCase().includes(term))
              );
            });

            if (filteredInvoices.length === 0) {
              return (
                <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 shadow-sm">
                  <p className="text-sm font-semibold text-gray-600">কোনো মেলানো ইনভয়েস পাওয়া যায়নি (No matching invoices found)</p>
                  <p className="text-xs text-gray-400 mt-1">অনুগ্রহ করে অন্য কীওয়ার্ড দিয়ে চেষ্টা করুন। (Try checking spelling or use a different search keyword.)</p>
                </div>
              );
            }

            return (
              <div className="space-y-4">
                {/* Bulk actions panel */}
                {selectedInvoiceIds.length > 0 && (
                  <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fadeIn">
                    <div className="flex items-center space-x-2.5">
                      <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs">
                        {selectedInvoiceIds.length}
                      </div>
                      <span className="text-xs font-bold text-blue-800">
                        ইনভয়েস নির্বাচন করা হয়েছে (Invoices selected for bulk action)
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <button
                        type="button"
                        onClick={() => setSelectedInvoiceIds([])}
                        className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-blue-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-colors"
                      >
                        Clear Selection
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const selectedInvs = invoices.filter(inv => selectedInvoiceIds.includes(inv.id));
                          setPrintData({ invoices: selectedInvs });
                          setShowPrintModal(true);
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl cursor-pointer transition-colors flex items-center space-x-2 shadow-sm"
                      >
                        <Printer className="w-4 h-4" />
                        <span>Bulk Print Selected (বাল্ক প্রিন্ট)</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" id="sales-table-container">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-gray-100">
                          <th className="px-4 py-4 text-center w-12">
                            <input
                              type="checkbox"
                              checked={filteredInvoices.length > 0 && filteredInvoices.every(inv => selectedInvoiceIds.includes(inv.id))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const newSelections = [...selectedInvoiceIds];
                                  filteredInvoices.forEach(inv => {
                                    if (!newSelections.includes(inv.id)) {
                                      newSelections.push(inv.id);
                                    }
                                  });
                                  setSelectedInvoiceIds(newSelections);
                                } else {
                                  const filteredIds = filteredInvoices.map(inv => inv.id);
                                  setSelectedInvoiceIds(selectedInvoiceIds.filter(id => !filteredIds.includes(id)));
                                }
                              }}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                            />
                          </th>
                          <th className="px-6 py-4">Invoice No</th>
                          <th className="px-6 py-4">Outlet / Shop Name</th>
                          <th className="px-6 py-4">Brand / Company</th>
                          <th className="px-6 py-4 text-right">Bill Value</th>
                          <th className="px-6 py-4 text-center">Status</th>
                          <th className="px-6 py-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-sm">
                        {filteredInvoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-4 text-center w-12">
                              <input
                                type="checkbox"
                                checked={selectedInvoiceIds.includes(inv.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedInvoiceIds([...selectedInvoiceIds, inv.id]);
                                  } else {
                                    setSelectedInvoiceIds(selectedInvoiceIds.filter(id => id !== inv.id));
                                  }
                                }}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                              />
                            </td>
                            <td className="px-6 py-4 font-bold text-blue-700 font-mono">{inv.invoiceNo}</td>
                            <td className="px-6 py-4">
                              <p className="font-semibold text-gray-950">{inv.shopName}</p>
                              <p className="text-[10px] text-gray-400">{inv.route} • {inv.date}</p>
                            </td>
                            <td className="px-6 py-4 text-gray-500 font-medium">{inv.companyName}</td>
                            <td className="px-6 py-4 text-right font-black text-gray-950">৳{inv.grandTotal.toLocaleString()}</td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                inv.status === 'PAID' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                inv.status === 'PARTIAL' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                              }`}>
                                {inv.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center space-x-2">
                                <button
                                  onClick={() => handleViewInvoiceDetails(inv)}
                                  className="text-blue-600 hover:text-blue-800 p-1.5 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                  title="View Detailed Invoice"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    setPrintData(inv);
                                    setShowPrintModal(true);
                                  }}
                                  className="text-slate-600 hover:text-slate-800 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                  title="Print Preview"
                                >
                                  <Printer className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Modal: New Invoice Builder */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl relative max-h-[95vh] overflow-y-auto">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-1">Sales Invoice Builder</h3>
            <p className="text-xs text-gray-400 mb-6">Build a retail distribution receipt. Outstanding dues accrue per-company based on payment modes.</p>

            {hasAutosavedDraft && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs animate-fadeIn">
                <div className="flex items-center space-x-2 text-blue-700">
                  <span className="p-1 bg-blue-100 rounded text-base">📝</span>
                  <div>
                    <span className="font-extrabold block">We found an auto-saved draft! (একটি ড্রাফট পাওয়া গেছে)</span>
                    <span className="text-[10px] text-blue-500 font-medium">Would you like to restore your previous progress?</span>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={handleRestoreDraft}
                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg cursor-pointer transition-colors text-[10px]"
                  >
                    Restore Progress
                  </button>
                  <button
                    type="button"
                    onClick={handleDiscardDraft}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer transition-colors text-[10px] border border-slate-250"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}

            {lastSavedTime && (
              <div className="absolute top-4 left-6 flex items-center space-x-1.5 text-[10px] font-bold text-slate-400">
                <span className={`w-1.5 h-1.5 rounded-full ${isFlashActive ? 'bg-emerald-500 animate-ping' : 'bg-slate-300'}`}></span>
                <span>Last auto-saved: {lastSavedTime}</span>
              </div>
            )}

            <form onSubmit={handleCreateInvoice} className="space-y-4">
              {/* Header Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Bill Date *</label>
                  <input
                    type="date"
                    required
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">SR Area / Route * (Mandatory)</label>
                  <div className="flex gap-2">
                    <select
                      value={selectedRoute}
                      onChange={(e) => setSelectedRoute(e.target.value)}
                      className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                    >
                      <option value="">Select Existing Route</option>
                      {Array.from(new Set(customers.map(c => c.route).filter(Boolean))).map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="বা নতুন রুট লিখুন"
                      value={selectedRoute}
                      onChange={(e) => setSelectedRoute(e.target.value)}
                      className="w-1/2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-blue-700"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Customer / Retail Outlet (Optional)</label>
                  <select
                    value={customerId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setCustomerId(id);
                      const selectedCust = customers.find(c => c.id === id);
                      if (selectedCust && selectedCust.route) {
                        setSelectedRoute(selectedCust.route);
                      }
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="">Select Customer (ঐচ্ছিক)</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.shopName} ({c.name}) - {c.route}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Manufacturer Partner *</label>
                  <select
                    required
                    value={companyId}
                    onChange={(e) => {
                      setCompanyId(e.target.value);
                      setItems([]); // Clear items if company changes to prevent brand mixing
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                  >
                    <option value="">Select Company</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Add Item Form (Only if company is selected) */}
              {companyId ? (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs font-bold text-slate-800 mb-3 flex items-center">
                    <ShoppingCart className="w-4 h-4 mr-1 text-slate-500" />
                    <span>সিলেক্ট করুন (Select Products of Selected Company)</span>
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">পণ্য (Product SKU)</label>
                      <select
                        value={currentProductId}
                        onChange={(e) => {
                          setCurrentProductId(e.target.value);
                          setCurrentCtn(0);
                          setCurrentPcs(0);
                        }}
                        className="w-full p-2 bg-white border border-slate-200 rounded text-xs focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="">Select Product SKU</option>
                        {availableProducts.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} (স্টক: {p.stockCount} পিস)
                          </option>
                        ))}
                      </select>
                      {currentProductId && products.find(p => p.id === currentProductId) && (
                        <div className="text-[10px] text-blue-600 font-bold mt-1">
                          📦 প্যাকিং সাইজ: ১ কার্টুন = {products.find(p => p.id === currentProductId)?.cartonSize} পিস (৳{((products.find(p => p.id === currentProductId)?.retailPrice || 0) * (products.find(p => p.id === currentProductId)?.cartonSize || 1)).toLocaleString()} / কার্টুন)
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">কার্টুন পরিমাণ (Carton)</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={currentCtn || ''}
                        onChange={(e) => setCurrentCtn(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full p-2 bg-white border border-slate-200 rounded text-xs text-center font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">পিস পরিমাণ (Pieces / Loose)</label>
                      <div className="flex space-x-1">
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={currentPcs || ''}
                          onChange={(e) => setCurrentPcs(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full p-2 bg-white border border-slate-200 rounded text-xs text-center font-bold"
                        />
                        <button
                          type="button"
                          onClick={handleAddItem}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 rounded font-bold text-xs shrink-0 cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-gray-400 italic">
                  * Please choose a customer and company first to view compatible inventory SKUs.
                </div>
              )}

              {/* Added Products Grid */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Invoice Roster</label>
                {items.length === 0 ? (
                  <div className="text-center py-6 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-xs text-gray-400 italic">
                    Add inventory items from above to populate the active invoice bill
                  </div>
                ) : (
                  <div className="border border-slate-100 rounded-lg overflow-hidden bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-gray-500 font-bold">
                        <tr>
                          <th className="p-3">Product Description</th>
                          <th className="p-3 text-right">Unit Price</th>
                          <th className="p-3 text-center">Cartons Equivalent</th>
                          <th className="p-3 text-center">Total Units</th>
                          <th className="p-3 text-right">Total (৳)</th>
                          <th className="p-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {items.map(item => (
                          <tr key={item.productId}>
                            <td className="p-3 font-semibold text-gray-800">{item.name}</td>
                            <td className="p-3 text-right">৳{item.price.toFixed(2)}</td>
                            <td className="p-3 text-center font-semibold text-slate-600">{item.cartonQty.toFixed(1)} Ctn</td>
                            <td className="p-3 text-center font-bold">{item.qty} Pcs</td>
                            <td className="p-3 text-right font-bold text-gray-900">৳{item.total.toLocaleString()}</td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.productId)}
                                className="text-rose-500 hover:text-rose-600 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4 mx-auto" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Invoice Calculations Footer */}
              {items.length > 0 && (
                <div className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  {/* Payment Info */}
                  <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200 sm:w-1/2">
                    <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">Ledger Payment Settlement</p>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Received Amt (৳)</label>
                        <input
                          type="number"
                          value={paymentReceived || ''}
                          placeholder="0.00"
                          onChange={(e) => setPaymentReceived(parseFloat(e.target.value) || 0)}
                          className="w-full p-2 bg-white border border-slate-200 rounded text-xs font-extrabold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Payment Method</label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as any)}
                          className="w-full p-2 bg-white border border-slate-200 rounded text-xs"
                        >
                          <option value="CASH">Cash Payment</option>
                          <option value="MOBILE_BANKING">bKash/Nagad/Rocket</option>
                          <option value="CHEQUE">Bank Cheque</option>
                          <option value="DUE">DUE / On Credit</option>
                        </select>
                      </div>
                    </div>

                    {calculateGrandTotal() - paymentReceived > 0 && (
                      <div className="p-2 bg-amber-50 text-amber-900 rounded text-[10px] font-medium border border-amber-100">
                        ৳{(calculateGrandTotal() - paymentReceived).toLocaleString()} will be automatically logged to {customers.find(c => c.id === customerId)?.shopName}'s ledger for {companies.find(c => c.id === companyId)?.name}.
                      </div>
                    )}
                  </div>

                  {/* Pricing Info */}
                  <div className="space-y-2 sm:w-1/3 text-right">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Sub-total:</span>
                      <span className="font-semibold">৳{calculateSubTotal().toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <span>Discount (৳):</span>
                      <input
                        type="number"
                        placeholder="0"
                        value={discount || ''}
                        onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                        className="w-24 p-1 text-right bg-slate-50 border border-slate-200 rounded text-xs font-bold"
                      />
                    </div>
                    <hr className="border-slate-100" />
                    <div className="flex justify-between text-sm font-bold text-gray-900">
                      <span>Grand Total:</span>
                      <span className="text-lg font-black text-blue-700">৳{calculateGrandTotal().toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

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
                  disabled={items.length === 0}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>File Distribution Bill</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Sales Invoice Details */}
      {isDetailModalOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl relative">
            <button onClick={() => setIsDetailModalOpen(false)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>

            {/* Letterhead */}
            <div className="text-center border-b border-slate-100 pb-4 mb-4">
              <h1 className="text-xl font-extrabold text-blue-900 tracking-tight">SAMIRA TRADERS</h1>
              <p className="text-[10px] text-gray-400 font-mono">Barguna Sadar, Barguna | Phone: 01712-345678</p>
              <span className="text-xs font-bold text-slate-800 uppercase mt-2 tracking-widest inline-block bg-slate-50 border border-slate-200 px-3 py-1 rounded">
                Sales Invoice Receipt
              </span>
            </div>

            {/* Invoice Meta */}
            <div className="grid grid-cols-2 gap-4 text-xs mb-4">
              <div>
                <p className="text-gray-400">Customer Outlet:</p>
                <p className="font-bold text-gray-900">{selectedInvoice.shopName}</p>
                <p className="text-gray-500">Route: {selectedInvoice.route}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-400">Invoice Reference:</p>
                <p className="font-bold text-blue-700 font-mono">{selectedInvoice.invoiceNo}</p>
                <p className="text-gray-500">Date: {selectedInvoice.date}</p>
              </div>
            </div>

            {/* Items table */}
            <div className="border border-slate-150 rounded-lg overflow-hidden mb-4">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 font-bold text-gray-600">
                  <tr>
                    <th className="p-2.5">Product</th>
                    <th className="p-2.5 text-center">Cartons</th>
                    <th className="p-2.5 text-center">Qty (loose)</th>
                    <th className="p-2.5 text-right">Unit Price</th>
                    <th className="p-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedInvoice.items.map(item => (
                    <tr key={item.productId}>
                      <td className="p-2.5 font-semibold text-gray-800">{item.name}</td>
                      <td className="p-2.5 text-center">{item.cartonQty.toFixed(1)}</td>
                      <td className="p-2.5 text-center">{item.qty} Pcs</td>
                      <td className="p-2.5 text-right">৳{item.price.toFixed(2)}</td>
                      <td className="p-2.5 text-right font-bold text-gray-900">৳{item.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pricing calculations */}
            <div className="space-y-1 text-xs border-b border-slate-100 pb-3 mb-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Sub-total:</span>
                <span className="font-semibold">৳{selectedInvoice.subTotal.toLocaleString()}</span>
              </div>
              {selectedInvoice.discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Discount:</span>
                  <span className="font-semibold text-rose-600">- ৳{selectedInvoice.discount}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-1">
                <span>Grand Total:</span>
                <span>৳{selectedInvoice.grandTotal.toLocaleString()}</span>
              </div>
            </div>

            {/* Payment info */}
            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
              <div>
                <p className="text-gray-400">Payment Status ({selectedInvoice.paymentMethod}):</p>
                <p className="font-bold text-emerald-700">Paid: ৳{selectedInvoice.paymentReceived.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-400">Outflow Balance (Due):</p>
                <p className={`font-extrabold ${selectedInvoice.grandTotal - selectedInvoice.paymentReceived > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                  ৳{(selectedInvoice.grandTotal - selectedInvoice.paymentReceived).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="mt-6 flex space-x-3">
              <button
                onClick={() => {
                  setPrintData(selectedInvoice);
                  setShowPrintModal(true);
                }}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-gray-700 font-bold py-2.5 rounded-xl text-xs cursor-pointer text-center flex items-center justify-center space-x-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Print Preview</span>
              </button>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs cursor-pointer text-center"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Print Wrapper Modal for Invoices */}
      {showPrintModal && printData && (
        <PrintWrapper
          type="invoice"
          title="বিক্রয় ইনভয়েস মেমো (Sales Invoice Memo)"
          data={printData}
          onClose={() => {
            setShowPrintModal(false);
            setPrintData(null);
          }}
        />
      )}
    </div>
  );
}
