/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  ShoppingCart, 
  User, 
  Package, 
  Plus, 
  Trash2, 
  Coins, 
  CheckCircle,
  Calculator,
  RefreshCw
} from 'lucide-react';
import { collection, getDocs, doc, writeBatch, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Customer, Product, SalesInvoice, InvoiceItem, UserRole } from '../types';
import { logActivity } from '../lib/activityLogger';

interface QuickSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  currentUser?: { id: string; name: string; role: string };
}

export default function QuickSaleModal({ isOpen, onClose, onSuccess, currentUser }: QuickSaleModalProps) {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [items, setItems] = useState<Array<{
    productId: string;
    name: string;
    cartonQty: number;
    pieceQty: number;
    qty: number; // in units
    price: number;
    total: number;
    cartonSize: number;
  }>>([]);
  const [discount, setDiscount] = useState(0);
  const [receivedAmount, setReceivedAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_BANKING' | 'CHEQUE' | 'DUE'>('CASH');

  // For adding a single product line
  const [addProductId, setAddProductId] = useState('');
  const [addCartons, setAddCartons] = useState<number | ''>('');
  const [addPieces, setAddPieces] = useState<number | ''>('');

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [custSnap, prodSnap] = await Promise.all([
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'products'))
      ]);

      const custList: Customer[] = [];
      custSnap.forEach(d => custList.push(d.data() as Customer));
      setCustomers(custList);

      const prodList: Product[] = [];
      prodSnap.forEach(d => prodList.push(d.data() as Product));
      setProducts(prodList);
    } catch (err) {
      console.error('Error loading QuickSale datasets:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  // Add line item to invoice
  const handleAddItem = () => {
    if (!addProductId) return;
    const prod = products.find(p => p.id === addProductId);
    if (!prod) return;

    // Check if product already added
    if (items.some(it => it.productId === addProductId)) {
      alert('প্রোডাক্টটি অলরেডি যুক্ত করা হয়েছে। (Product is already in the list.)');
      return;
    }

    const cartons = Number(addCartons) || 0;
    const pieces = Number(addPieces) || 0;
    const totalUnits = (cartons * prod.cartonSize) + pieces;

    if (totalUnits <= 0) {
      alert('দয়া করে সঠিক পরিমাণ উল্লেখ করুন। (Please enter a valid quantity.)');
      return;
    }

    const lineTotal = totalUnits * prod.retailPrice;

    setItems(prev => [...prev, {
      productId: prod.id,
      name: prod.name,
      cartonQty: cartons,
      pieceQty: pieces,
      qty: totalUnits,
      price: prod.retailPrice,
      total: lineTotal,
      cartonSize: prod.cartonSize
    }]);

    // Reset inputs
    setAddProductId('');
    setAddCartons('');
    setAddPieces('');
  };

  const handleRemoveItem = (productId: string) => {
    setItems(prev => prev.filter(it => it.productId !== productId));
  };

  const subTotal = items.reduce((sum, it) => sum + it.total, 0);
  const grandTotal = Math.max(0, subTotal - discount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomerId) {
      alert('দয়া করে কাস্টমার সিলেক্ট করুন। (Please select a customer.)');
      return;
    }

    if (items.length === 0) {
      alert('দয়া করে অন্ততঃ একটি প্রোডাক্ট যুক্ত করুন। (Please add at least one product.)');
      return;
    }

    const cust = customers.find(c => c.id === selectedCustomerId);
    if (!cust) return;

    try {
      setLoading(true);
      const batch = writeBatch(db);
      const invoiceId = 'inv-' + Date.now();
      const invoiceNo = 'ST-' + Date.now().toString().slice(-6);

      // Construct sales items complying with standard schema
      const invoiceItems: InvoiceItem[] = items.map(it => ({
        productId: it.productId,
        name: it.name,
        qty: it.qty,
        price: it.price,
        total: it.total,
        cartonQty: it.qty / it.cartonSize
      }));

      // Calculate dues increase
      const unpaidAmount = grandTotal - receivedAmount;
      const finalStatus = receivedAmount >= grandTotal ? 'PAID' : (receivedAmount > 0 ? 'PARTIAL' : 'DUE');

      // 1. Create Invoice object
      const newInvoice: SalesInvoice = {
        id: invoiceId,
        invoiceNo,
        date: new Date().toISOString().split('T')[0],
        customerId: cust.id,
        customerName: cust.name,
        shopName: cust.shopName,
        companyId: 'company-samira', // default company id or single-source
        companyName: 'Samira Traders',
        items: invoiceItems,
        subTotal,
        discount,
        grandTotal,
        paymentReceived: receivedAmount,
        paymentMethod,
        route: cust.route || '',
        area: cust.area || '',
        status: finalStatus,
        createdAt: new Date().toISOString(),
        salesManagerId: currentUser?.id || 'system',
        salesManagerName: currentUser?.name || 'Quick Sale Terminal'
      };

      batch.set(doc(db, 'sales', invoiceId), newInvoice);

      // 2. Adjust Product stock
      items.forEach(it => {
        const prodObj = products.find(p => p.id === it.productId);
        if (prodObj) {
          const currentStock = prodObj.stockCount || 0;
          const newStock = Math.max(0, currentStock - it.qty);
          batch.update(doc(db, 'products', it.productId), {
            stockCount: newStock
          });
        }
      });

      // 3. Adjust Customer dues & Customer Ledger (if any remaining dues)
      if (unpaidAmount > 0) {
        const currentDues = cust.dues || {};
        const prevDue = currentDues['company-samira'] || 0;
        const updatedCompanyDue = prevDue + unpaidAmount;
        const updatedDues = {
          ...currentDues,
          ['company-samira']: updatedCompanyDue
        };
        const updatedTotalDue = Object.values(updatedDues).reduce((s: number, val: unknown) => s + (Number(val) || 0), 0);

        batch.update(doc(db, 'customers', cust.id), {
          dues: updatedDues,
          totalDue: updatedTotalDue
        });

        // Add to customer ledger
        const ledgerId = `ledger-qs-${Date.now()}`;
        batch.set(doc(db, 'ledgers', ledgerId), {
          id: ledgerId,
          customerId: cust.id,
          companyId: 'company-samira',
          companyName: 'Samira Traders',
          type: 'INVOICE',
          referenceId: invoiceId,
          referenceNo: invoiceNo,
          date: new Date().toISOString().split('T')[0],
          amount: unpaidAmount,
          balanceAfter: updatedCompanyDue,
          createdAt: new Date().toISOString()
        });
      }

      await batch.commit();

      // Log action
      await logActivity(
        currentUser?.id || 'system',
        currentUser?.name || 'Quick Sale Terminal',
        UserRole.SUPER_ADMIN,
        'INVOICE_CREATE',
        `Generated Quick Sale invoice "${invoiceNo}" for "${cust.shopName}". Total: ৳${grandTotal}, Collected: ৳${receivedAmount}.`,
        { invoiceId, grandTotal, unpaidAmount }
      );

      alert('কুইক সেল মেমো সফলভাবে সম্পন্ন হয়েছে! (Quick Sale generated successfully!)');
      
      // Reset form & close
      setSelectedCustomerId('');
      setItems([]);
      setDiscount(0);
      setReceivedAmount(0);
      setPaymentMethod('CASH');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error executing Quick Sale checkout:', err);
      alert('সঞ্চয় করতে ব্যর্থ হয়েছে। ইন্টারনেট কানেকশন বা ফায়ারবেস সেটিংস চেক করুন।');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto" id="quick-sale-modal-overlay">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden" id="quick-sale-form-container">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-900 to-blue-800 text-white">
          <div className="flex items-center space-x-2">
            <ShoppingCart className="w-5 h-5 text-blue-300 animate-pulse" />
            <div>
              <h3 className="font-extrabold text-sm tracking-wide uppercase">কুইক সেল টার্মিনাল (Quick Sale Terminal)</h3>
              <p className="text-[10px] text-blue-200">Generate distribution invoices instantly</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-white/10 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-xs text-gray-500">সিঙ্ক্রোনাইজ হচ্ছে, দয়া করে অপেক্ষা করুন...</p>
          </div>
        )}

        {!loading && (
          <form onSubmit={handleSubmit} className="p-6 space-y-5 flex-1 overflow-y-auto max-h-[80vh]">
            
            {/* Step 1: Customer Selection */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center">
                <User className="w-3.5 h-3.5 text-blue-600 mr-1" />
                <span>১. গ্রাহক নির্বাচন করুন (Select Customer)</span>
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full bg-slate-50 border border-gray-200 text-slate-800 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              >
                <option value="">গ্রাহক সিলেক্ট করুন (Choose customer shop)</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.shopName} — {c.name} ({c.route || 'No Route'})
                  </option>
                ))}
              </select>
              {selectedCustomer && (
                <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100/60 text-[11px] text-blue-800 flex justify-between font-medium">
                  <span>রুট: {selectedCustomer.route || 'N/A'}</span>
                  <span>বর্তমান বকেয়া: ৳{(selectedCustomer.totalDue || 0).toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Step 2: Product Selection / Carton Calculator */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-gray-100">
              <label className="text-xs font-black uppercase text-slate-600 tracking-wider flex items-center">
                <Package className="w-3.5 h-3.5 text-emerald-600 mr-1" />
                <span>২. প্রোডাক্ট ও কার্টন ক্যালকুলেটর (Product & Qty Calc)</span>
              </label>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <select
                  value={addProductId}
                  onChange={(e) => setAddProductId(e.target.value)}
                  className="bg-white border border-gray-200 rounded-xl p-2.5 text-xs focus:outline-none md:col-span-1"
                >
                  <option value="">প্রোডাক্ট সিলেক্ট...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (৳{p.retailPrice})
                    </option>
                  ))}
                </select>

                <div className="flex space-x-1 md:col-span-2">
                  <input
                    type="number"
                    placeholder="কার্টন (Ctn)"
                    min="0"
                    value={addCartons}
                    onChange={(e) => setAddCartons(e.target.value !== '' ? Math.max(0, parseInt(e.target.value) || 0) : '')}
                    className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-xs text-center font-bold"
                  />
                  <input
                    type="number"
                    placeholder="পিস (Pcs)"
                    min="0"
                    value={addPieces}
                    onChange={(e) => setAddPieces(e.target.value !== '' ? Math.max(0, parseInt(e.target.value) || 0) : '')}
                    className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-xs text-center font-bold"
                  />
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-xl text-xs font-bold flex items-center space-x-1 cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>যুক্ত করুন</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Added Items table */}
            {items.length > 0 && (
              <div className="border border-gray-100 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                      <th className="p-3">প্রোডাক্ট (Item)</th>
                      <th className="p-3 text-center">পরিমাণ (Qty)</th>
                      <th className="p-3 text-right">দর (Rate)</th>
                      <th className="p-3 text-right">টোটাল (Total)</th>
                      <th className="p-3 text-center">মুছুন</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map(it => (
                      <tr key={it.productId} className="hover:bg-slate-50/50">
                        <td className="p-3 font-semibold text-slate-800">{it.name}</td>
                        <td className="p-3 text-center font-mono font-bold text-slate-900">
                          {it.cartonQty > 0 ? `${it.cartonQty} ctn ` : ''}
                          {it.pieceQty > 0 ? `${it.pieceQty} pcs` : ''}
                          <span className="block text-[9px] text-gray-400">({it.qty} units)</span>
                        </td>
                        <td className="p-3 text-right font-mono">৳{it.price}</td>
                        <td className="p-3 text-right font-bold text-slate-900 font-mono">৳{it.total}</td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(it.productId)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Calculations and Billing Footer */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
              
              {/* Payment Details */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">পেমেন্ট মেথড (Payment Method)</label>
                  <select
                    value={paymentMethod}
                    onChange={(e: any) => setPaymentMethod(e.target.value)}
                    className="w-full bg-slate-50 border border-gray-200 text-slate-800 rounded-xl p-2.5 text-xs focus:outline-none"
                  >
                    <option value="CASH">ক্যাশ পেমেন্ট (Cash)</option>
                    <option value="MOBILE_BANKING">মোবাইল ব্যাংকিং (bKash/Nagad)</option>
                    <option value="CHEQUE">ব্যাংক চেক (Cheque)</option>
                    <option value="DUE">বকেয়া (Dues)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">গ্রহনকৃত অর্থ (Received Amount)</label>
                  <div className="relative">
                    <Coins className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="number"
                      min="0"
                      value={receivedAmount || ''}
                      onChange={(e) => setReceivedAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="Enter cash amount"
                      className="w-full bg-slate-50 border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Aggregation Receipt details */}
              <div className="bg-slate-900 text-white p-4 rounded-2xl flex flex-col justify-between space-y-3 font-mono text-xs">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">সাব-টোটাল (Subtotal):</span>
                    <span>৳{subTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">ডিসকাউন্ট (Discount):</span>
                    <input
                      type="number"
                      min="0"
                      max={subTotal}
                      value={discount || ''}
                      onChange={(e) => setDiscount(Math.min(subTotal, Math.max(0, parseFloat(e.target.value) || 0)))}
                      className="w-20 bg-slate-800 border border-slate-700 text-white rounded px-1.5 py-0.5 text-right font-bold"
                    />
                  </div>
                  <hr className="border-slate-800" />
                  <div className="flex justify-between text-sm font-black text-emerald-400">
                    <span>সর্বমোট বিল (Grand Total):</span>
                    <span>৳{grandTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-amber-400">
                    <span>বাকী থাকবে (Remaining Due):</span>
                    <span>৳{Math.max(0, grandTotal - receivedAmount).toLocaleString()}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 rounded-xl text-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer shadow-lg"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>মেমো সম্পন্ন করুন (Confirm Sale)</span>
                </button>
              </div>

            </div>

          </form>
        )}

      </div>
    </div>
  );
}
