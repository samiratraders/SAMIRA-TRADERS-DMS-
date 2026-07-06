/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ShoppingBag, Plus, Search, Trash2, Save, X, Building2, Truck, RefreshCw, Eye } from 'lucide-react';
import { collection, getDocs, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Purchase, Supplier, Company, Product, PurchaseItem } from '../types';

export default function PurchaseView() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);

  // New Purchase Form State
  const [supplierId, setSupplierId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [paymentPaid, setPaymentPaid] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'CREDIT'>('CASH');

  // Product single adder
  const [currentProductId, setCurrentProductId] = useState('');
  const [currentCtn, setCurrentCtn] = useState<number>(0);
  const [currentPcs, setCurrentPcs] = useState<number>(0);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Fetch companies, suppliers, products, and purchases in parallel
      const [compSnap, supSnap, prodSnap, purSnap] = await Promise.all([
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'suppliers')),
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'purchases'))
      ]);

      const compList: Company[] = [];
      compSnap.forEach(d => compList.push(d.data() as Company));
      setCompanies(compList);

      const supList: Supplier[] = [];
      supSnap.forEach(d => supList.push(d.data() as Supplier));
      setSuppliers(supList);

      const prodList: Product[] = [];
      prodSnap.forEach(d => prodList.push(d.data() as Product));
      setProducts(prodList);

      const purList: Purchase[] = [];
      purSnap.forEach(d => purList.push(d.data() as Purchase));
      
      purList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setPurchases(purList);

    } catch (err) {
      console.error('Error loading purchase data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAddModal = () => {
    setSupplierId('');
    setCompanyId('');
    setItems([]);
    setPaymentPaid(0);
    setPaymentMethod('CASH');
    setCurrentProductId('');
    setCurrentCtn(0);
    setCurrentPcs(0);
    setIsAddModalOpen(true);
  };

  // Filters suppliers and products based on selected Company
  const availableSuppliers = suppliers.filter(s => s.companyId === companyId);
  const availableProducts = products.filter(p => p.companyId === companyId);

  const handleAddItem = () => {
    if (!currentProductId) return;
    const prod = products.find(p => p.id === currentProductId);
    if (!prod) return;

    const units = (currentCtn * prod.cartonSize) + currentPcs;
    if (units <= 0) {
      alert('দয়া করে কার্টুন বা পিস এর ঘরে সঠিক সংখ্যা দিন।');
      return;
    }
    const cartonQty = units / prod.cartonSize;

    const existing = items.find(i => i.productId === currentProductId);

    if (existing) {
      const newQty = existing.qty + units;
      const newCartons = newQty / prod.cartonSize;
      setItems(prev => prev.map(i => i.productId === currentProductId ? {
        ...i,
        qtyCarton: newCartons,
        qty: newQty,
        total: newQty * prod.purchasePrice
      } : i));
    } else {
      const newItem: PurchaseItem = {
        productId: prod.id,
        name: prod.name,
        qtyCarton: cartonQty,
        qty: units,
        price: prod.purchasePrice,
        total: units * prod.purchasePrice
      };
      setItems(prev => [...prev, newItem]);
    }

    setCurrentProductId('');
    setCurrentCtn(0);
    setCurrentPcs(0);
  };

  const handleRemoveItem = (prodId: string) => {
    setItems(prev => prev.filter(i => i.productId !== prodId));
  };

  const calculateGrandTotal = () => {
    return items.reduce((sum, item) => sum + item.total, 0);
  };

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || !companyId || items.length === 0) {
      alert('Please fill out all required fields.');
      return;
    }

    const supplierObj = suppliers.find(s => s.id === supplierId);
    const companyObj = companies.find(c => c.id === companyId);
    if (!supplierObj || !companyObj) return;

    try {
      setLoading(true);
      const batch = writeBatch(db);
      const purchaseId = 'pur-' + Date.now();
      const purchaseNo = 'PUR-' + Date.now().toString().slice(-6);
      const grandTotal = calculateGrandTotal();

      // 1. Create Purchase Order Record
      const purchaseObj: Purchase = {
        id: purchaseId,
        purchaseNo,
        date: purchaseDate,
        supplierId,
        supplierName: supplierObj.name,
        companyId,
        companyName: companyObj.name,
        items,
        grandTotal,
        paymentPaid,
        paymentMethod,
        status: 'RECEIVED',
        createdAt: new Date().toISOString()
      };

      batch.set(doc(db, 'purchases', purchaseId), purchaseObj);

      // 2. Increase Product Stocks
      for (const item of items) {
        const prod = products.find(p => p.id === item.productId);
        if (prod) {
          const newStock = prod.stockCount + item.qty;
          batch.update(doc(db, 'products', prod.id), { stockCount: newStock });
        }
      }

      await batch.commit();
      setIsAddModalOpen(false);
      loadData();
    } catch (err) {
      console.error('Error creating purchase order:', err);
      alert('Failed to log purchase order. Please check connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6" id="purchases-module">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Purchase Procurement</h2>
          <p className="text-sm text-gray-500">Record stock purchasing bills, log manufacturer supplier orders, and increment depot stock</p>
        </div>
        <button
          onClick={handleOpenAddModal}
          id="btn-new-purchase"
          className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Record New Purchase</span>
        </button>
      </div>

      {/* Purchases log list */}
      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-500">Syncing procurement registry...</p>
        </div>
      ) : purchases.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No purchase bills filed yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" id="purchases-table-container">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-gray-100">
                  <th className="px-6 py-4">Bill Reference</th>
                  <th className="px-6 py-4">Supplier Rep</th>
                  <th className="px-6 py-4">Brand / Company</th>
                  <th className="px-6 py-4 text-right">Cost Value</th>
                  <th className="px-6 py-4 text-center">Procure Status</th>
                  <th className="px-6 py-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {purchases.map((pur) => (
                  <tr key={pur.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-bold text-blue-700 font-mono">{pur.purchaseNo}</td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-gray-950">{pur.supplierName}</p>
                      <p className="text-[10px] text-gray-400">{pur.date}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-500 font-medium">{pur.companyName}</td>
                    <td className="px-6 py-4 text-right font-black text-gray-950">৳{pur.grandTotal.toLocaleString()}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                        {pur.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => {
                          setSelectedPurchase(pur);
                          setIsDetailModalOpen(true);
                        }}
                        className="text-blue-600 hover:text-blue-800 p-1.5 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
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
      )}

      {/* Modal: New Purchase */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl relative max-h-[95vh] overflow-y-auto">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-1">Log Purchase Procurement</h3>
            <p className="text-xs text-gray-400 mb-6">File a factory order or supply invoice. Upon submittal, primary depot stocks increase instantly.</p>

            <form onSubmit={handleCreatePurchase} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Purchasing Date</label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Company Partner *</label>
                  <select
                    required
                    value={companyId}
                    onChange={(e) => {
                      setCompanyId(e.target.value);
                      setSupplierId('');
                      setItems([]);
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="">Select Company</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Supplier Representative *</label>
                  <select
                    required
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    disabled={!companyId}
                  >
                    <option value="">Select Supplier</option>
                    {availableSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Add item */}
              {companyId ? (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs font-bold text-slate-800 mb-3 flex items-center">
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
                        className="w-full p-2.5 bg-white border border-slate-200 rounded text-xs focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="">Select Product to Procurement</option>
                        {availableProducts.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Unit cost: ৳{p.purchasePrice})
                          </option>
                        ))}
                      </select>
                      {currentProductId && products.find(p => p.id === currentProductId) && (
                        <div className="text-[10px] text-blue-600 font-bold mt-1">
                          📦 প্যাকিং সাইজ: ১ কার্টুন = {products.find(p => p.id === currentProductId)?.cartonSize} পিস (৳{((products.find(p => p.id === currentProductId)?.purchasePrice || 0) * (products.find(p => p.id === currentProductId)?.cartonSize || 1)).toLocaleString()} / কার্টুন)
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
                        className="w-full p-2.5 bg-white border border-slate-200 rounded text-xs text-center font-bold"
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
                          className="w-full p-2.5 bg-white border border-slate-200 rounded text-xs text-center font-bold"
                        />
                        <button
                          type="button"
                          onClick={handleAddItem}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 rounded font-bold text-xs shrink-0 cursor-pointer"
                        >
                          Add Product
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-gray-400 italic">
                  * Please choose a company partner first to query compatible wholesale SKUs.
                </div>
              )}

              {/* Added Products Grid */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Procured Cartons list</label>
                {items.length === 0 ? (
                  <div className="text-center py-6 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-xs text-gray-400 italic">
                    Add cartons from above to populate procurement receipts
                  </div>
                ) : (
                  <div className="border border-slate-100 rounded-lg overflow-hidden bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-gray-500 font-bold">
                        <tr>
                          <th className="p-3">Product Name</th>
                          <th className="p-3 text-right">Wholesale Price</th>
                          <th className="p-3 text-center">Cartons</th>
                          <th className="p-3 text-center">Loose Units</th>
                          <th className="p-3 text-right">Line Total (৳)</th>
                          <th className="p-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {items.map(item => (
                          <tr key={item.productId}>
                            <td className="p-3 font-semibold text-gray-800">{item.name}</td>
                            <td className="p-3 text-right">৳{item.price.toFixed(2)}/unit</td>
                            <td className="p-3 text-center font-bold">{item.qtyCarton} Ctn</td>
                            <td className="p-3 text-center text-gray-400">{item.qty} Pcs</td>
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

              {/* Total Procurement Cost Footer */}
              {items.length > 0 && (
                <div className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  {/* Payment */}
                  <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200 sm:w-1/2">
                    <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">Procurement Payment Settlement</p>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Paid Amount (৳)</label>
                        <input
                          type="number"
                          value={paymentPaid || ''}
                          placeholder="0.00"
                          onChange={(e) => setPaymentPaid(parseFloat(e.target.value) || 0)}
                          className="w-full p-2 bg-white border border-slate-200 rounded text-xs font-extrabold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Transfer Mode</label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as any)}
                          className="w-full p-2 bg-white border border-slate-200 rounded text-xs"
                        >
                          <option value="CASH">Cash Settlement</option>
                          <option value="BANK_TRANSFER">Bank Wire Transfer</option>
                          <option value="CREDIT">Supplier Credit</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Calculations */}
                  <div className="sm:w-1/3 text-right pt-4">
                    <span className="text-xs text-gray-400 block mb-1">Total Procurement Cost:</span>
                    <span className="text-2xl font-black text-blue-700">৳{calculateGrandTotal().toLocaleString()}</span>
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
                  <span>Log Stock Procured</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Details */}
      {isDetailModalOpen && selectedPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl relative">
            <button onClick={() => setIsDetailModalOpen(false)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <div className="text-center border-b border-slate-100 pb-4 mb-4">
              <h1 className="text-xl font-extrabold text-blue-900 tracking-tight">SAMIRA TRADERS</h1>
              <span className="text-xs font-bold text-slate-800 uppercase mt-2 tracking-widest inline-block bg-slate-50 border border-slate-200 px-3 py-1 rounded">
                Procurement Invoice
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs mb-4">
              <div>
                <p className="text-gray-400">Supplier / Vendor Representative:</p>
                <p className="font-bold text-gray-900">{selectedPurchase.supplierName}</p>
                <p className="text-gray-500">Company: {selectedPurchase.companyName}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-400">Procure Bill Reference:</p>
                <p className="font-bold text-blue-700 font-mono">{selectedPurchase.purchaseNo}</p>
                <p className="text-gray-500">Date Filed: {selectedPurchase.date}</p>
              </div>
            </div>

            <div className="border border-slate-150 rounded-lg overflow-hidden mb-4">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 font-bold text-gray-600">
                  <tr>
                    <th className="p-2.5">Product</th>
                    <th className="p-2.5 text-center">Cartons</th>
                    <th className="p-2.5 text-center">Loose Units</th>
                    <th className="p-2.5 text-right">Loose Unit Cost</th>
                    <th className="p-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedPurchase.items.map(item => (
                    <tr key={item.productId}>
                      <td className="p-2.5 font-semibold text-gray-800">{item.name}</td>
                      <td className="p-2.5 text-center">{item.qtyCarton} Ctn</td>
                      <td className="p-2.5 text-center">{item.qty} Pcs</td>
                      <td className="p-2.5 text-right">৳{item.price.toFixed(2)}</td>
                      <td className="p-2.5 text-right font-bold text-gray-900">৳{item.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
              <div>
                <p className="text-gray-400">Payment Status ({selectedPurchase.paymentMethod}):</p>
                <p className="font-bold text-emerald-700">Paid: ৳{selectedPurchase.paymentPaid.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-400">Total Purchase Cost:</p>
                <p className="font-extrabold text-blue-900 text-base">
                  ৳{selectedPurchase.grandTotal.toLocaleString()}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsDetailModalOpen(false)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer mt-6"
            >
              Close Procurement Detail
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
