/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Package, Plus, Search, Building2, Tag, Layers, Save, X, RefreshCw, Trash2 } from 'lucide-react';
import { collection, getDocs, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Product, Company } from '../types';

export default function ProductView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New Product Form State
  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [retailPrice, setRetailPrice] = useState(0);
  const [packSize, setPackSize] = useState('');
  const [cartonSize, setCartonSize] = useState(12);
  const [stockCount, setStockCount] = useState(0);

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch companies and products in parallel
      const [compSnap, prodSnap] = await Promise.all([
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'products'))
      ]);

      const compList: Company[] = [];
      compSnap.forEach(d => compList.push(d.data() as Company));
      setCompanies(compList);

      const prodList: Product[] = [];
      prodSnap.forEach(d => prodList.push(d.data() as Product));
      setProducts(prodList);
    } catch (err) {
      console.error('Error loading product data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (productId: string, productName: string) => {
    const isConfirmed = window.confirm(`Are you sure you want to permanently delete product "${productName}"? This will delete its record and primary stock count.`);
    if (!isConfirmed) return;

    try {
      setLoading(true);
      await deleteDoc(doc(db, 'products', productId));
      alert(`Product "${productName}" deleted successfully.`);
      loadData();
    } catch (err) {
      console.error('Error deleting product:', err);
      alert('Failed to delete product from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !companyId || purchasePrice <= 0 || retailPrice <= 0 || cartonSize <= 0) {
      alert('Please fill out all required fields with positive numbers!');
      return;
    }

    try {
      const selectedComp = companies.find(c => c.id === companyId);
      const companyName = selectedComp ? selectedComp.name : 'Unknown Company';
      const id = 'prod-' + Date.now();

      const cartonPrice = purchasePrice * cartonSize;

      const productObj: Product = {
        id,
        name,
        companyId,
        companyName,
        purchasePrice,
        retailPrice,
        packSize: packSize || '1 Pcs',
        cartonSize,
        cartonPrice,
        stockCount,
        subDepotStocks: {
          'depot-1': 0,
          'depot-2': 0
        },
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'products', id), productObj);
      setIsAddModalOpen(false);
      // Reset form
      setName('');
      setCompanyId('');
      setPurchasePrice(0);
      setRetailPrice(0);
      setPackSize('');
      setCartonSize(12);
      setStockCount(0);
      loadData();
    } catch (err) {
      console.error('Error creating product:', err);
    }
  };

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.companyName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6" id="products-module">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Product Catalog</h2>
          <p className="text-sm text-gray-500">Manage products, pack specifications, prices, and default depot stocks</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          id="btn-add-product"
          className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Product</span>
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="relative">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search products by brand name or company partner..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            id="input-product-search"
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-500">Syncing products catalog...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No products in register</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="products-grid">
          {filtered.map(prod => {
            const margin = prod.retailPrice - prod.purchasePrice;
            const marginPct = ((margin / prod.purchasePrice) * 100).toFixed(1);

            return (
              <div key={prod.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between" id={`product-card-${prod.id}`}>
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-gray-900 leading-tight text-base">{prod.name}</h3>
                    <div className="flex items-center space-x-1.5 shrink-0">
                      <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full border border-blue-100">
                        {prod.packSize}
                      </span>
                      <button
                        onClick={() => handleDeleteProduct(prod.id, prod.name)}
                        className="p-1 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete Product"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 flex items-center mb-4">
                    <Building2 className="w-3.5 h-3.5 mr-1" />
                    <span>{prod.companyName}</span>
                  </p>

                  <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl mb-4 border border-slate-100">
                    <div>
                      <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Purchase Price</span>
                      <p className="text-sm font-black text-slate-800">৳{prod.purchasePrice.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Retail Price</span>
                      <p className="text-sm font-black text-blue-700">৳{prod.retailPrice.toFixed(2)}</p>
                    </div>
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Carton Size</span>
                      <p className="text-xs font-bold text-slate-800">{prod.cartonSize} units</p>
                    </div>
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Carton Cost</span>
                      <p className="text-xs font-bold text-slate-800">৳{prod.cartonPrice.toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-50 pt-4 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Depot Stock</span>
                    <span className={`text-sm font-extrabold ${prod.stockCount <= 24 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {prod.stockCount} Units ({(prod.stockCount / prod.cartonSize).toFixed(1)} Ctn)
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Sales Margin</span>
                    <span className="text-xs font-bold text-emerald-600">৳{margin.toFixed(2)} ({marginPct}%)</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Add New Product</h3>
            <p className="text-xs text-gray-400 mb-5">Create a single stock-keeping unit with primary carton specifications</p>
            
            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Product Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lux Soap Lavender"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Brand Partner *</label>
                  <select
                    required
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="">Select Brand</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Pack Size (e.g. 100g, 1L)</label>
                  <input
                    type="text"
                    placeholder="e.g. 100g or 250ml"
                    value={packSize}
                    onChange={(e) => setPackSize(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Purchase Cost (Unit) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={purchasePrice || ''}
                    onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Retail Price (Unit) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={retailPrice || ''}
                    onChange={(e) => setRetailPrice(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Carton Size (Units/Ctn) *</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 24 or 48"
                    value={cartonSize || ''}
                    onChange={(e) => setCartonSize(parseInt(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Starting Depot Stock (Units)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={stockCount || ''}
                    onChange={(e) => setStockCount(parseInt(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              {purchasePrice > 0 && cartonSize > 0 && (
                <div className="p-3 bg-blue-50 text-blue-900 text-xs rounded-lg border border-blue-100 font-medium">
                  Computed Carton Purchasing Cost: ৳{(purchasePrice * cartonSize).toFixed(2)}
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
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Product</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
