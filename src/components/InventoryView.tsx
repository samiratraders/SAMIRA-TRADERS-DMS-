/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Warehouse, 
  ArrowRightLeft, 
  Filter, 
  Search, 
  Plus, 
  Check, 
  Trash2,
  RefreshCw,
  Send,
  Building2,
  MapPin,
  AlertCircle,
  X
} from 'lucide-react';
import { collection, getDocs, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Product, Company, SubDepot, SubDepotTransaction, SubDepotTransactionItem } from '../types';

export default function InventoryView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [subDepots, setSubDepots] = useState<SubDepot[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  // Stock Transfer Modal State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedSubDepotId, setSelectedSubDepotId] = useState('');
  const [transferCartons, setTransferCartons] = useState<number>(0);
  const [transferProducts, setTransferProducts] = useState<{ productId: string; qtyCartons: number }[]>([]);

  // Selected single product to add to transaction list
  const [currentProductId, setCurrentProductId] = useState('');
  const [currentQtyCartons, setCurrentQtyCartons] = useState(1);

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch companies, sub depots, and products in parallel
      const [compSnap, sdSnap, prodSnap] = await Promise.all([
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'subDepots')),
        getDocs(collection(db, 'products'))
      ]);

      const compList: Company[] = [];
      compSnap.forEach(d => compList.push(d.data() as Company));
      setCompanies(compList);

      const sdList: SubDepot[] = [];
      sdSnap.forEach(d => sdList.push(d.data() as SubDepot));
      setSubDepots(sdList);

      const prodList: Product[] = [];
      prodSnap.forEach(d => prodList.push(d.data() as Product));
      setProducts(prodList);
    } catch (err) {
      console.error('Error loading inventory data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddTransferItem = () => {
    if (!currentProductId || currentQtyCartons <= 0) {
      alert('Please select a product and positive carton quantity.');
      return;
    }

    const prod = products.find(p => p.id === currentProductId);
    if (!prod) return;

    // Check if enough primary stock exists
    const totalRequiredUnits = currentQtyCartons * prod.cartonSize;
    if (prod.stockCount < totalRequiredUnits) {
      alert(`Insufficient stock in Primary Depot. Available: ${prod.stockCount} units, Required: ${totalRequiredUnits} units.`);
      return;
    }

    // Check if already in list
    const existing = transferProducts.find(item => item.productId === currentProductId);
    if (existing) {
      const newQty = existing.qtyCartons + currentQtyCartons;
      if (prod.stockCount < newQty * prod.cartonSize) {
        alert('Insufficient stock for the updated quantity.');
        return;
      }
      setTransferProducts(prev => prev.map(item => 
        item.productId === currentProductId ? { ...item, qtyCartons: newQty } : item
      ));
    } else {
      setTransferProducts(prev => [...prev, { productId: currentProductId, qtyCartons: currentQtyCartons }]);
    }

    // Reset selectors
    setCurrentProductId('');
    setCurrentQtyCartons(1);
  };

  const handleRemoveTransferItem = (prodId: string) => {
    setTransferProducts(prev => prev.filter(p => p.productId !== prodId));
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubDepotId || transferProducts.length === 0) {
      alert('Please select a Sub-Depot and add at least one product.');
      return;
    }

    const depot = subDepots.find(d => d.id === selectedSubDepotId);
    if (!depot) {
      alert('Selected Sub-Depot not found.');
      return;
    }

    try {
      setLoading(true);
      const batch = writeBatch(db);
      const transactionId = 'sdt-' + Date.now();
      const transactionDate = new Date().toISOString().split('T')[0];

      const transactionItems: SubDepotTransactionItem[] = [];
      let totalCartonsSum = 0;

      for (const item of transferProducts) {
        const prod = products.find(p => p.id === item.productId);
        if (!prod) continue;

        const qtyUnits = item.qtyCartons * prod.cartonSize;
        totalCartonsSum += item.qtyCartons;

        // Build item profile
        transactionItems.push({
          productId: prod.id,
          name: prod.name,
          qtyUnits,
          qtyCartons: item.qtyCartons,
          purchasePrice: prod.purchasePrice,
          retailPrice: prod.retailPrice
        });

        // Calculate new primary stock and subdepot stocks
        const newPrimaryStock = prod.stockCount - qtyUnits;
        const currentSubStock = prod.subDepotStocks?.[selectedSubDepotId] || 0;
        const newSubStock = currentSubStock + qtyUnits;

        const updatedSubDepotStocks = {
          ...(prod.subDepotStocks || {}),
          [selectedSubDepotId]: newSubStock
        };

        // Enqueue update to product stock
        batch.update(doc(db, 'products', prod.id), {
          stockCount: newPrimaryStock,
          subDepotStocks: updatedSubDepotStocks
        });
      }

      // Profit earned is calculated by Carton Commission (carton commission rate * total cartons transferred)
      const commissionEarned = totalCartonsSum * (depot.cartonCommissionRate || 10);

      // Create transaction log
      const transactionObj: SubDepotTransaction = {
        id: transactionId,
        subDepotId: selectedSubDepotId,
        subDepotName: depot.name,
        date: transactionDate,
        items: transactionItems,
        totalCartons: totalCartonsSum,
        commissionEarned,
        status: 'APPROVED',
        createdBy: 'admin_uid',
        createdByName: 'Super Admin',
        createdAt: new Date().toISOString()
      };

      batch.set(doc(db, 'subDepotTransactions', transactionId), transactionObj);

      await batch.commit();

      setIsTransferModalOpen(false);
      setTransferProducts([]);
      setSelectedSubDepotId('');
      loadData();
    } catch (err) {
      console.error('Error executing sub-depot transfer:', err);
      alert('Transfer failed. Please check internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCompany = selectedCompanyId ? p.companyId === selectedCompanyId : true;
    return matchesSearch && matchesCompany;
  });

  return (
    <div className="space-y-6" id="inventory-module">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Depot Stock Register</h2>
          <p className="text-sm text-gray-500">View real-time physical units, track sub-depots, and manage stock allocations</p>
        </div>
        <button
          onClick={() => {
            setTransferProducts([]);
            setIsTransferModalOpen(true);
          }}
          id="btn-stock-transfer"
          className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
        >
          <ArrowRightLeft className="w-4 h-4" />
          <span>Transfer to Sub-Depot</span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search stock by product name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none"
          />
        </div>

        <div className="flex items-center space-x-2 min-w-[200px]">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm"
          >
            <option value="">All Companies</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Inventory Table */}
      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-500">Checking physical counts...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <Warehouse className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No stock matching filters</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" id="inventory-table-container">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-gray-100">
                  <th className="px-6 py-4">Product details</th>
                  <th className="px-6 py-4">Company</th>
                  <th className="px-6 py-4 text-center">Carton pack</th>
                  <th className="px-6 py-4 text-right">Primary depot</th>
                  {subDepots.map(dep => (
                    <th key={dep.id} className="px-6 py-4 text-right bg-blue-50/20 text-blue-900/60 font-semibold">
                      {dep.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredProducts.map(prod => (
                  <tr key={prod.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-gray-950">{prod.name}</p>
                      <p className="text-[10px] text-gray-400 font-mono">Pack: {prod.packSize}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-500 font-medium">{prod.companyName}</td>
                    <td className="px-6 py-4 text-center text-gray-600 font-mono">{prod.cartonSize} Pcs/Ctn</td>
                    
                    {/* Primary Depot Stock */}
                    <td className="px-6 py-4 text-right">
                      <span className={`font-bold inline-block px-2.5 py-1 rounded-lg ${
                        prod.stockCount <= 24 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {prod.stockCount} ({ (prod.stockCount / prod.cartonSize).toFixed(1) } Ctn)
                      </span>
                    </td>

                    {/* Sub Depot Stocks */}
                    {subDepots.map(dep => {
                      const qty = prod.subDepotStocks?.[dep.id] || 0;
                      return (
                        <td key={dep.id} className="px-6 py-4 text-right bg-blue-50/10 font-medium text-blue-950 font-mono">
                          {qty} ({ (qty / prod.cartonSize).toFixed(1) })
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Transfer to Sub-depot */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setIsTransferModalOpen(false)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-1">Transfer Stock to Sub-Depot</h3>
            <p className="text-xs text-gray-500 mb-5">Decrease primary depot inventory to populate secondary regional sub-depot branches</p>

            <form onSubmit={handleExecuteTransfer} className="space-y-4">
              {/* Select Depot */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Target Sub-Depot Branch *</label>
                <select
                  required
                  value={selectedSubDepotId}
                  onChange={(e) => setSelectedSubDepotId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="">Select Sub-Depot</option>
                  {subDepots.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.location})</option>
                  ))}
                </select>
              </div>

              {/* Add Product Line Section */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <p className="text-xs font-bold text-slate-800 mb-3 flex items-center">
                  <Warehouse className="w-4 h-4 mr-1 text-slate-500" />
                  <span>Choose Product to Allocate</span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">Product</label>
                    <select
                      value={currentProductId}
                      onChange={(e) => setCurrentProductId(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded text-xs"
                    >
                      <option value="">Select product to transfer</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} (Avail: {p.stockCount} units)</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">Cartons Qty</label>
                    <div className="flex space-x-1">
                      <input
                        type="number"
                        min={1}
                        value={currentQtyCartons}
                        onChange={(e) => setCurrentQtyCartons(parseInt(e.target.value) || 1)}
                        className="w-full p-2 bg-white border border-slate-200 rounded text-xs text-center font-bold"
                      />
                      <button
                        type="button"
                        onClick={handleAddTransferItem}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 rounded font-bold text-xs shrink-0 cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Added Products Table */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Selected Stocks to Transfer</label>
                {transferProducts.length === 0 ? (
                  <div className="text-center py-6 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    <p className="text-xs text-gray-400 italic">No items added to the transfer roster yet</p>
                  </div>
                ) : (
                  <div className="border border-gray-100 rounded-lg overflow-hidden bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-gray-500 font-bold">
                        <tr>
                          <th className="p-3">Product Name</th>
                          <th className="p-3 text-center">Cartons</th>
                          <th className="p-3 text-center">Total Units</th>
                          <th className="p-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {transferProducts.map(item => {
                          const prod = products.find(p => p.id === item.productId);
                          if (!prod) return null;
                          return (
                            <tr key={item.productId}>
                              <td className="p-3 font-semibold text-gray-800">{prod.name}</td>
                              <td className="p-3 text-center font-bold">{item.qtyCartons}</td>
                              <td className="p-3 text-center text-gray-400">{item.qtyCartons * prod.cartonSize} units</td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTransferItem(item.productId)}
                                  className="text-rose-500 hover:text-rose-600 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4 mx-auto" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Dynamic commission calculation */}
              {selectedSubDepotId && transferProducts.length > 0 && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-950 rounded-lg text-xs font-medium">
                  Estimated Carton Commission to Sub-Depot Manager:{' '}
                  <span className="font-bold text-emerald-800">
                    ৳{ (transferProducts.reduce((sum, item) => sum + item.qtyCartons, 0) * (subDepots.find(d => d.id === selectedSubDepotId)?.cartonCommissionRate || 10)).toFixed(2) }
                  </span>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="bg-slate-100 text-gray-600 px-4 py-2.5 rounded-lg text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={transferProducts.length === 0}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-sm"
                >
                  <Send className="w-4 h-4" />
                  <span>Execute Transfer</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
