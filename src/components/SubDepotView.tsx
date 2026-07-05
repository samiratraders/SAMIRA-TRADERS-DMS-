/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Map, MapPin, BadgeCent, Warehouse, RefreshCw, Plus, X, Save, Eye, Layers } from 'lucide-react';
import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SubDepot, SubDepotTransaction, Product } from '../types';

export default function SubDepotView() {
  const [subDepots, setSubDepots] = useState<SubDepot[]>([]);
  const [transactions, setTransactions] = useState<SubDepotTransaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal view for stock or transaction detail
  const [selectedDepot, setSelectedDepot] = useState<SubDepot | null>(null);
  const [selectedTx, setSelectedTx] = useState<SubDepotTransaction | null>(null);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);

  // New Depot form
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [managerName, setManagerName] = useState('');
  const [cartonCommissionRate, setCartonCommissionRate] = useState(15);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Fetch sub depots, products, and transactions in parallel
      const [sdSnap, prodSnap, txSnap] = await Promise.all([
        getDocs(collection(db, 'subDepots')),
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'subDepotTransactions'))
      ]);

      const sdList: SubDepot[] = [];
      sdSnap.forEach(d => sdList.push(d.data() as SubDepot));
      setSubDepots(sdList);

      const prodList: Product[] = [];
      prodSnap.forEach(d => prodList.push(d.data() as Product));
      setProducts(prodList);

      const txList: SubDepotTransaction[] = [];
      txSnap.forEach(d => txList.push(d.data() as SubDepotTransaction));
      txList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setTransactions(txList);

    } catch (err) {
      console.error('Error loading subdepot module data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateDepot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || cartonCommissionRate <= 0) {
      alert('Name and positive Commission rate are required!');
      return;
    }

    try {
      const id = 'depot-' + Date.now();
      const depotObj: SubDepot = {
        id,
        name,
        location: location || 'Barguna District',
        managerId: 'mgr-' + Date.now().toString().slice(-4),
        managerName: managerName || 'Assigned Manager',
        cartonCommissionRate,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'subDepots', id), depotObj);
      setIsAddModalOpen(false);
      setName('');
      setLocation('');
      setManagerName('');
      setCartonCommissionRate(15);
      loadData();
    } catch (err) {
      console.error('Error creating sub-depot:', err);
    }
  };

  const handleOpenStockDetails = (depot: SubDepot) => {
    setSelectedDepot(depot);
    setIsStockModalOpen(true);
  };

  const handleOpenTxDetails = (tx: SubDepotTransaction) => {
    setSelectedTx(tx);
    setIsTxModalOpen(true);
  };

  return (
    <div className="space-y-6" id="subdepots-module">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Sub-Depot Franchises</h2>
          <p className="text-sm text-gray-500">Monitor regional branch depots, audit carton commissions, and check inventory levels</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          id="btn-add-subdepot"
          className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Register Sub-Depot</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-500">Checking sub-depot branches...</p>
        </div>
      ) : subDepots.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <Map className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No Sub-Depots Registered</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="subdepots-cards-grid">
          {subDepots.map(depot => {
            // Calculate total items in this subdepot
            const totalUnits = products.reduce((sum, p) => sum + (p.subDepotStocks?.[depot.id] || 0), 0);
            const totalCommissionPaid = transactions
              .filter(t => t.subDepotId === depot.id)
              .reduce((sum, t) => sum + (t.commissionEarned || 0), 0);

            return (
              <div key={depot.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between" id={`subdepot-card-${depot.id}`}>
                <div>
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                        <Map className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-950 leading-tight text-base">{depot.name}</h3>
                        <p className="text-[10px] text-gray-400 mt-0.5 font-medium flex items-center">
                          <MapPin className="w-3.5 h-3.5 mr-1" />
                          <span>{depot.location}</span>
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 shrink-0">
                      Commission: ৳{depot.cartonCommissionRate}/Ctn
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-slate-50 pt-4 mb-6">
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Manager Assigned</span>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">{depot.managerName}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Allocated Stock</span>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">{totalUnits} units in hand</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Accumulated Commissions Paid</span>
                      <p className="text-base font-black text-emerald-600 mt-0.5">৳{totalCommissionPaid.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <button
                    onClick={() => handleOpenStockDetails(depot)}
                    className="w-full bg-slate-50 hover:bg-slate-100 text-gray-700 border border-slate-200 font-bold py-2 rounded-xl text-xs transition-colors cursor-pointer text-center"
                  >
                    Auditing Depot Stocks
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Historic Carton Transfers Logs */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm" id="subdepots-transactions-ledger">
        <h3 className="font-extrabold text-gray-900 text-base mb-1">Sub-Depot Stock Handovers History</h3>
        <p className="text-xs text-gray-400 mb-5">Chronological record of stock transfers from the primary depot and calculated carton commissions</p>

        {transactions.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-6 text-center bg-slate-50 border border-dashed rounded-xl">No handovers verified yet.</p>
        ) : (
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-gray-500 font-bold">
                <tr>
                  <th className="p-3">Handover Reference</th>
                  <th className="p-3">Franchise Branch</th>
                  <th className="p-3 text-center">Transferred Cartons</th>
                  <th className="p-3 text-right">Commission Accrued</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-bold font-mono text-blue-800">{tx.id}</td>
                    <td className="p-3">
                      <p className="font-semibold text-gray-900">{tx.subDepotName}</p>
                      <p className="text-[9px] text-gray-400">{tx.date}</p>
                    </td>
                    <td className="p-3 text-center font-bold">{tx.totalCartons} Ctn</td>
                    <td className="p-3 text-right font-bold text-emerald-700">৳{tx.commissionEarned.toLocaleString()}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleOpenTxDetails(tx)}
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
        )}
      </div>

      {/* Modal: View Subdepot stocks */}
      {isStockModalOpen && selectedDepot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl relative max-h-[85vh] overflow-y-auto">
            <button onClick={() => setIsStockModalOpen(false)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>
            
            <h3 className="text-lg font-bold text-gray-900 mb-1">{selectedDepot.name} Stock Balance</h3>
            <p className="text-xs text-gray-400 mb-5">Available inventory counts at {selectedDepot.location}</p>

            <div className="border border-slate-100 rounded-xl overflow-hidden mb-6">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-gray-500 font-bold">
                  <tr>
                    <th className="p-3">Product Name</th>
                    <th className="p-3 text-center">Unit Pack</th>
                    <th className="p-3 text-right">Franchise Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {products.map(p => {
                    const qty = p.subDepotStocks?.[selectedDepot.id] || 0;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-semibold text-gray-800">{p.name}</td>
                        <td className="p-3 text-center text-gray-400">{p.packSize}</td>
                        <td className="p-3 text-right font-bold text-blue-900 font-mono">
                          {qty} Pcs ({ (qty / p.cartonSize).toFixed(1) } Ctn)
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => setIsStockModalOpen(false)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
            >
              Close Inventory Audit
            </button>
          </div>
        </div>
      )}

      {/* Modal: View Handover Tx details */}
      {isTxModalOpen && selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl relative">
            <button onClick={() => setIsTxModalOpen(false)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-1">Handover Voucher Details</h3>
            <p className="text-xs text-gray-400 mb-4 font-mono">ID: {selectedTx.id} | Date: {selectedTx.date}</p>

            <div className="border border-slate-100 rounded-lg overflow-hidden mb-4">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 font-bold text-gray-600">
                  <tr>
                    <th className="p-2.5">Product Item</th>
                    <th className="p-2.5 text-center">Cartons</th>
                    <th className="p-2.5 text-right">Units Equivalent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedTx.items.map(item => (
                    <tr key={item.productId}>
                      <td className="p-2.5 font-semibold text-gray-850">{item.name}</td>
                      <td className="p-2.5 text-center font-bold text-gray-900">{item.qtyCartons} Ctn</td>
                      <td className="p-2.5 text-right text-gray-500">{item.qtyUnits} units</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg text-xs font-bold text-emerald-950 flex justify-between items-center">
              <span>Franchise Profit Earned:</span>
              <span className="text-base text-emerald-800 font-black">৳{selectedTx.commissionEarned.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Register Franchise Sub-Depot</h3>
            <form onSubmit={handleCreateFranchise} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Franchise Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Amtali Sub Depot"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Territory Location</label>
                <input
                  type="text"
                  placeholder="e.g. Amtali Upazila, Barguna"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Franchise Manager Name</label>
                <input
                  type="text"
                  placeholder="e.g. Habibur Rahman"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Carton Commission Rate (৳ per Carton) *</label>
                <input
                  type="number"
                  required
                  placeholder="15"
                  value={cartonCommissionRate || ''}
                  onChange={(e) => setCartonCommissionRate(parseInt(e.target.value) || 0)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
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
                  <span>Register Franchise</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  // Fallback for typescript binding
  function handleCreateFranchise(e: React.FormEvent) {
    handleCreateDepot(e);
  }
}
