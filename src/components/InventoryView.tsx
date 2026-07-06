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
  X,
  Edit,
  Package,
  Layers,
  Save,
  PlusCircle
} from 'lucide-react';
import { collection, getDocs, doc, setDoc, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Product, Supplier, SubDepot, SubDepotTransaction, SubDepotTransactionItem } from '../types';

export default function InventoryView() {
  const [activeSubTab, setActiveSubTab] = useState<'stock' | 'products'>('stock');
  
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [subDepots, setSubDepots] = useState<SubDepot[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBrandFilter, setSelectedBrandFilter] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('');

  // Stock Transfer Modal State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedSubDepotId, setSelectedSubDepotId] = useState('');
  const [transferProducts, setTransferProducts] = useState<{ productId: string; qtyCartons: number }[]>([]);

  // Selected single product to add to transfer transaction list
  const [currentProductId, setCurrentProductId] = useState('');
  const [currentCtn, setCurrentCtn] = useState<number>(0);
  const [currentPcs, setCurrentPcs] = useState<number>(0);

  // New Product Modal and Edit Product Modal States
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false);
  const [selectedProductForEdit, setSelectedProductForEdit] = useState<Product | null>(null);

  // Add Product Form State
  const [newProdName, setNewProdName] = useState('');
  const [newProdSupplierId, setNewProdSupplierId] = useState('');
  const [newProdPurchasePrice, setNewProdPurchasePrice] = useState<number>(0);
  const [newProdRetailPrice, setNewProdRetailPrice] = useState<number>(0);
  const [newProdPackSize, setNewProdPackSize] = useState('');
  const [newProdCartonSize, setNewProdCartonSize] = useState<number>(12);
  const [newProdStockCount, setNewProdStockCount] = useState<number>(0);
  const [newProdSubDepotMargin, setNewProdSubDepotMargin] = useState<number>(0);
  const [newProdCartonMargin, setNewProdCartonMargin] = useState<number>(0);
  const [newProdCategory, setNewProdCategory] = useState('');

  // Edit Product Form State
  const [editProdName, setEditProdName] = useState('');
  const [editProdSupplierId, setEditProdSupplierId] = useState('');
  const [editProdPurchasePrice, setEditProdPurchasePrice] = useState<number>(0);
  const [editProdRetailPrice, setEditProdRetailPrice] = useState<number>(0);
  const [editProdPackSize, setEditProdPackSize] = useState('');
  const [editProdCartonSize, setEditProdCartonSize] = useState<number>(12);
  const [editProdSubDepotMargin, setEditProdSubDepotMargin] = useState<number>(0);
  const [editProdCartonMargin, setEditProdCartonMargin] = useState<number>(0);
  const [editProdCategory, setEditProdCategory] = useState('');

  // Increase Stock fields inside Edit Modal
  const [isIncreaseStockOpen, setIsIncreaseStockOpen] = useState(false);
  const [increaseCtn, setIncreaseCtn] = useState<number>(0);
  const [increasePcs, setIncreasePcs] = useState<number>(0);

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch suppliers, sub depots, and products in parallel
      const [supSnap, sdSnap, prodSnap] = await Promise.all([
        getDocs(collection(db, 'suppliers')),
        getDocs(collection(db, 'subDepots')),
        getDocs(collection(db, 'products'))
      ]);

      const supList: Supplier[] = [];
      supSnap.forEach(d => supList.push(d.data() as Supplier));
      setSuppliers(supList);

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
    if (!currentProductId) return;

    const prod = products.find(p => p.id === currentProductId);
    if (!prod) return;

    const units = (currentCtn * prod.cartonSize) + currentPcs;
    if (units <= 0) {
      alert('দয়া করে কার্টুন বা পিস এর ঘরে সঠিক সংখ্যা দিন।');
      return;
    }

    const ctnQty = units / prod.cartonSize;

    // Check if enough primary stock exists
    if (prod.stockCount < units) {
      alert(`স্টকে পর্যাপ্ত পরিমাণ পণ্য নেই! উপলব্ধ স্টক: ${prod.stockCount} পিস, রিকোয়ার্ড: ${units} পিস।`);
      return;
    }

    // Check if already in list
    const existing = transferProducts.find(item => item.productId === currentProductId);
    if (existing) {
      const newQty = existing.qtyCartons + ctnQty;
      if (prod.stockCount < newQty * prod.cartonSize) {
        alert('স্টকে পর্যাপ্ত পরিমাণ পণ্য নেই!');
        return;
      }
      setTransferProducts(prev => prev.map(item => 
        item.productId === currentProductId ? { ...item, qtyCartons: newQty } : item
      ));
    } else {
      setTransferProducts(prev => [...prev, { productId: currentProductId, qtyCartons: ctnQty }]);
    }

    // Reset selectors
    setCurrentProductId('');
    setCurrentCtn(0);
    setCurrentPcs(0);
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

    const isConfirmed = window.confirm(`Are you sure you want to execute this stock transfer to ${depot.name}?`);
    if (!isConfirmed) return;

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
      alert('Stock transfer completed successfully.');
      loadData();
    } catch (err) {
      console.error('Error executing sub-depot transfer:', err);
      alert('Transfer failed. Please check internet connection.');
    } finally {
      setLoading(false);
    }
  };

  // Add Product Submit
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName || !newProdSupplierId || newProdPurchasePrice <= 0 || newProdRetailPrice <= 0 || newProdCartonSize <= 0) {
      alert('Please fill out all required fields with positive numbers!');
      return;
    }

    const isConfirmed = window.confirm(`Are you sure you want to save product "${newProdName}"?`);
    if (!isConfirmed) return;

    try {
      setLoading(true);
      const selectedSup = suppliers.find(s => s.id === newProdSupplierId);
      const companyName = selectedSup ? selectedSup.name : 'Unknown Supplier';
      const id = 'prod-' + Date.now();

      const cartonPrice = newProdPurchasePrice * newProdCartonSize;

      const productObj = {
        id,
        name: newProdName,
        companyId: newProdSupplierId,
        companyName,
        purchasePrice: newProdPurchasePrice,
        retailPrice: newProdRetailPrice,
        packSize: newProdPackSize || '1 Pcs',
        cartonSize: newProdCartonSize,
        cartonPrice,
        stockCount: newProdStockCount,
        subDepotStocks: {},
        subDepotMargin: newProdSubDepotMargin,
        cartonMargin: newProdCartonMargin,
        category: newProdCategory || 'General',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'products', id), productObj);
      setIsAddProductModalOpen(false);
      
      // Reset form
      setNewProdName('');
      setNewProdSupplierId('');
      setNewProdPurchasePrice(0);
      setNewProdRetailPrice(0);
      setNewProdPackSize('');
      setNewProdCartonSize(12);
      setNewProdStockCount(0);
      setNewProdSubDepotMargin(0);
      setNewProdCartonMargin(0);
      setNewProdCategory('');
      
      alert(`Product "${newProdName}" added successfully.`);
      loadData();
    } catch (err) {
      console.error('Error creating product:', err);
      alert('Failed to save product.');
    } finally {
      setLoading(false);
    }
  };

  // Open Edit Product Modal
  const handleOpenEditProduct = (prod: Product) => {
    setSelectedProductForEdit(prod);
    setEditProdName(prod.name);
    setEditProdSupplierId(prod.companyId);
    setEditProdPurchasePrice(prod.purchasePrice);
    setEditProdRetailPrice(prod.retailPrice);
    setEditProdPackSize(prod.packSize || '1 Pcs');
    setEditProdCartonSize(prod.cartonSize || 12);
    setEditProdSubDepotMargin((prod as any).subDepotMargin || 0);
    setEditProdCartonMargin((prod as any).cartonMargin || 0);
    setEditProdCategory((prod as any).category || 'General');
    
    // Reset stock increase inputs
    setIsIncreaseStockOpen(false);
    setIncreaseCtn(0);
    setIncreasePcs(0);
    
    setIsEditProductModalOpen(true);
  };

  // Save Edited Product
  const handleSaveEditedProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForEdit) return;

    if (!editProdName || !editProdSupplierId || editProdPurchasePrice <= 0 || editProdRetailPrice <= 0 || editProdCartonSize <= 0) {
      alert('Please fill out all required fields!');
      return;
    }

    const isConfirmed = window.confirm(`Are you sure you want to update product "${editProdName}"?`);
    if (!isConfirmed) return;

    try {
      setLoading(true);
      const selectedSup = suppliers.find(s => s.id === editProdSupplierId);
      const companyName = selectedSup ? selectedSup.name : 'Unknown Brand';

      // Calculate stock count including any additions
      let updatedStockCount = selectedProductForEdit.stockCount || 0;
      if (isIncreaseStockOpen) {
        const extraUnits = (increaseCtn * editProdCartonSize) + increasePcs;
        updatedStockCount += extraUnits;
      }

      const updatedProduct = {
        ...selectedProductForEdit,
        name: editProdName,
        companyId: editProdSupplierId,
        companyName,
        purchasePrice: editProdPurchasePrice,
        retailPrice: editProdRetailPrice,
        packSize: editProdPackSize,
        cartonSize: editProdCartonSize,
        cartonPrice: editProdPurchasePrice * editProdCartonSize,
        stockCount: updatedStockCount,
        subDepotMargin: editProdSubDepotMargin,
        cartonMargin: editProdCartonMargin,
        category: editProdCategory
      };

      await setDoc(doc(db, 'products', selectedProductForEdit.id), updatedProduct);
      setIsEditProductModalOpen(false);
      setSelectedProductForEdit(null);
      alert('Product updated successfully.');
      loadData();
    } catch (err) {
      console.error('Error editing product:', err);
      alert('Failed to update product.');
    } finally {
      setLoading(false);
    }
  };

  // Delete Product
  const handleDeleteProduct = async (prodId: string, prodName: string) => {
    const isConfirmed = window.confirm(`Are you sure you want to permanently delete product "${prodName}"? This action cannot be undone.`);
    if (!isConfirmed) return;

    try {
      setLoading(true);
      await deleteDoc(doc(db, 'products', prodId));
      alert(`Product "${prodName}" deleted successfully.`);
      loadData();
    } catch (err) {
      console.error('Error deleting product:', err);
      alert('Failed to delete product.');
    } finally {
      setLoading(false);
    }
  };

  // Unique categories for filtering
  const categoriesList = Array.from(new Set(products.map(p => (p as any).category || 'General').filter(Boolean)));

  // Filtered Products Roster
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.companyName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBrand = selectedBrandFilter ? p.companyId === selectedBrandFilter : true;
    const matchesCategory = selectedCategoryFilter ? ((p as any).category || 'General') === selectedCategoryFilter : true;
    return matchesSearch && matchesBrand && matchesCategory;
  });

  return (
    <div className="space-y-6" id="inventory-module">
      
      {/* Module Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Inventory & Products Command</h2>
          <p className="text-sm text-gray-500">Manage central depot stocks, define product catalog specs, carton margins, and sub-depots</p>
        </div>
        
        <div className="flex space-x-2">
          {activeSubTab === 'stock' && (
            <button
              onClick={() => {
                setTransferProducts([]);
                setIsTransferModalOpen(true);
              }}
              id="btn-stock-transfer"
              className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm cursor-pointer"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>Transfer to Sub-Depot</span>
            </button>
          )}

          {activeSubTab === 'products' && (
            <button
              onClick={() => setIsAddProductModalOpen(true)}
              id="btn-add-product"
              className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Product</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="border-b border-gray-100 flex space-x-8 bg-white px-6 py-1 rounded-xl shadow-sm">
        <button
          onClick={() => setActiveSubTab('stock')}
          className={`py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeSubTab === 'stock'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          স্টক ও সাবডিপো কন্ট্রোল (Stock & Sub-Depots)
        </button>
        <button
          onClick={() => setActiveSubTab('products')}
          className={`py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeSubTab === 'products'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          প্রোডাক্ট রেজিস্ট্রি (Product Registry & Margins)
        </button>
      </div>

      {/* Toolbar Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search catalog by name or supplier brand..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Brand Filter */}
        <div className="flex items-center space-x-2 min-w-[200px]">
          <Building2 className="w-4 h-4 text-gray-400" />
          <select
            value={selectedBrandFilter}
            onChange={(e) => setSelectedBrandFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none"
          >
            <option value="">All Brands / Suppliers</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Category Filter */}
        <div className="flex items-center space-x-2 min-w-[180px]">
          <Layers className="w-4 h-4 text-gray-400" />
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none"
          >
            <option value="">All Categories</option>
            {categoriesList.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
      </div>

      {/* View Loading Indicator */}
      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-500">Checking product ledger...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No products matching filters found</p>
        </div>
      ) : activeSubTab === 'stock' ? (
        
        /* ---------------- TAB 1: STOCK & SUBDEPOTS ---------------- */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" id="inventory-table-container">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-gray-100">
                  <th className="px-6 py-4">Product Details</th>
                  <th className="px-6 py-4">Brand Supplier</th>
                  <th className="px-6 py-4 text-center">Packing Format</th>
                  <th className="px-6 py-4 text-right">Primary Depot Stock</th>
                  {subDepots.map(dep => (
                    <th key={dep.id} className="px-6 py-4 text-right bg-blue-50/25 text-blue-900/70 font-bold">
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
                      <span className="inline-block bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded text-[9px] uppercase font-mono mt-0.5">
                        {(prod as any).category || 'General'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500 font-medium">{prod.companyName}</td>
                    <td className="px-6 py-4 text-center text-gray-600 font-mono">{prod.cartonSize} Pcs/Ctn</td>
                    
                    {/* Primary Depot Stock */}
                    <td className="px-6 py-4 text-right">
                      <span className={`font-bold inline-block px-2.5 py-1 rounded-lg ${
                        prod.stockCount <= 24 ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      }`}>
                        {prod.stockCount} Pcs ({ (prod.stockCount / prod.cartonSize).toFixed(1) } Ctn)
                      </span>
                    </td>

                    {/* Sub Depot Stocks */}
                    {subDepots.map(dep => {
                      const qty = prod.subDepotStocks?.[dep.id] || 0;
                      return (
                        <td key={dep.id} className="px-6 py-4 text-right bg-blue-50/10 font-bold text-blue-950 font-mono">
                          {qty} Pcs ({ (qty / prod.cartonSize).toFixed(1) } Ctn)
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (

        /* ---------------- TAB 2: PRODUCT REGISTRY & EDITING ---------------- */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" id="product-registry-container">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-gray-100">
                  <th className="px-6 py-4">Product Details</th>
                  <th className="px-6 py-4">Brand / Manufacturer</th>
                  <th className="px-6 py-4 text-right">Unit Purchase</th>
                  <th className="px-6 py-4 text-right">Carton Size</th>
                  <th className="px-6 py-4 text-right text-emerald-700 bg-emerald-50/10">Carton Margin</th>
                  <th className="px-6 py-4 text-right text-indigo-700 bg-indigo-50/10">Sub-Depot Margin</th>
                  <th className="px-6 py-4 text-right">Unit Retail</th>
                  <th className="px-6 py-4 text-center">Action Options</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredProducts.map(prod => (
                  <tr key={prod.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-950">{prod.name}</p>
                      <p className="text-[10px] text-gray-400">Pack spec: {prod.packSize || '1 Pcs'} | Category: {(prod as any).category || 'General'}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-500 font-medium">{prod.companyName}</td>
                    <td className="px-6 py-4 text-right font-mono text-slate-800">৳{prod.purchasePrice.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-mono">{prod.cartonSize} Pcs</td>
                    <td className="px-6 py-4 text-right font-mono text-emerald-700 bg-emerald-50/5">৳{((prod as any).cartonMargin || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-mono text-indigo-700 bg-indigo-50/5">৳{((prod as any).subDepotMargin || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-mono text-blue-700 font-semibold">৳{prod.retailPrice.toFixed(2)}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => handleOpenEditProduct(prod)}
                          className="p-1.5 bg-slate-50 hover:bg-slate-100 text-blue-600 border border-slate-200 rounded-lg transition-all cursor-pointer"
                          title="Edit Product & Add Stock"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(prod.id, prod.name)}
                          className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg transition-all cursor-pointer"
                          title="Delete Product"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- MODAL: TRANSFER TO SUB-DEPOT ---------------- */}
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

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">Product</label>
                    <select
                      value={currentProductId}
                      onChange={(e) => {
                        setCurrentProductId(e.target.value);
                        setCurrentCtn(0);
                        setCurrentPcs(0);
                      }}
                      className="w-full p-2 bg-white border border-slate-200 rounded text-xs focus:outline-none"
                    >
                      <option value="">Select product to transfer</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} (স্টক: {p.stockCount} পিস)</option>
                      ))}
                    </select>
                    {currentProductId && products.find(p => p.id === currentProductId) && (
                      <div className="text-[10px] text-blue-600 font-bold mt-1">
                        📦 প্যাকিং সাইজ: ১ কার্টুন = {products.find(p => p.id === currentProductId)?.cartonSize} পিস
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


      {/* ---------------- MODAL: ADD PRODUCT ---------------- */}
      {isAddProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setIsAddProductModalOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <h3 className="text-lg font-extrabold text-gray-900 mb-1 flex items-center">
              <PlusCircle className="w-5 h-5 text-emerald-600 mr-2" />
              <span>Add New Product to Catalog</span>
            </h3>
            <p className="text-xs text-gray-400 mb-5">Define product name, branding, pack sizing, margins, and purchase specifications</p>

            <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Product Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mojo 250ml"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Brand Supplier / Manufacturer *</label>
                  <select
                    required
                    value={newProdSupplierId}
                    onChange={(e) => setNewProdSupplierId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none"
                  >
                    <option value="">-- select brand/supplier --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.companyName})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Unit Purchase Price *</label>
                  <input
                    type="number"
                    required
                    min="0.1"
                    step="0.01"
                    value={newProdPurchasePrice || ''}
                    onChange={(e) => setNewProdPurchasePrice(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black font-mono focus:outline-none text-right"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Unit Retail/Selling Price *</label>
                  <input
                    type="number"
                    required
                    min="0.1"
                    step="0.01"
                    value={newProdRetailPrice || ''}
                    onChange={(e) => setNewProdRetailPrice(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black font-mono focus:outline-none text-right text-blue-700"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Category Group</label>
                  <input
                    type="text"
                    placeholder="e.g. Carbonated Drinks"
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-emerald-50/20 p-3 rounded-2xl border border-emerald-50">
                <div className="sm:col-span-1">
                  <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Carton Size (Units) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newProdCartonSize || ''}
                    onChange={(e) => setNewProdCartonSize(parseInt(e.target.value) || 12)}
                    className="w-full p-2.5 bg-white border border-emerald-200 rounded-xl font-black font-mono focus:outline-none text-center text-emerald-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Carton Profit Margin *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="৳"
                    value={newProdCartonMargin || ''}
                    onChange={(e) => setNewProdCartonMargin(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-white border border-emerald-200 rounded-xl font-black font-mono focus:outline-none text-right text-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-indigo-800 uppercase mb-1">Sub-Depot Margin *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="৳"
                    value={newProdSubDepotMargin || ''}
                    onChange={(e) => setNewProdSubDepotMargin(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-black font-mono focus:outline-none text-right text-indigo-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Pack/Bottle Sizing</label>
                  <input
                    type="text"
                    placeholder="e.g. 250ml Pet"
                    value={newProdPackSize}
                    onChange={(e) => setNewProdPackSize(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Initial Primary Depot Stock (Units)</label>
                  <input
                    type="number"
                    min="0"
                    value={newProdStockCount || ''}
                    onChange={(e) => setNewProdStockCount(parseInt(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black font-mono focus:outline-none text-right"
                  />
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddProductModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl cursor-pointer shadow-lg shadow-emerald-500/10"
                >
                  Save Product Specifications
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* ---------------- MODAL: EDIT PRODUCT ---------------- */}
      {isEditProductModalOpen && selectedProductForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setIsEditProductModalOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <h3 className="text-lg font-extrabold text-gray-900 mb-1 flex items-center">
              <Edit className="w-5 h-5 text-blue-600 mr-2" />
              <span>Edit Product & Increase Stock</span>
            </h3>
            <p className="text-xs text-gray-400 mb-5">Update catalog specifications or add stock counts using Cartons & Pieces</p>

            <form onSubmit={handleSaveEditedProduct} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={editProdName}
                    onChange={(e) => setEditProdName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Brand Supplier *</label>
                  <select
                    required
                    value={editProdSupplierId}
                    onChange={(e) => setEditProdSupplierId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none"
                  >
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Unit Purchase Price *</label>
                  <input
                    type="number"
                    required
                    min="0.1"
                    step="0.01"
                    value={editProdPurchasePrice || ''}
                    onChange={(e) => setEditProdPurchasePrice(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black font-mono focus:outline-none text-right"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Unit Retail Price *</label>
                  <input
                    type="number"
                    required
                    min="0.1"
                    step="0.01"
                    value={editProdRetailPrice || ''}
                    onChange={(e) => setEditProdRetailPrice(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black font-mono focus:outline-none text-right text-blue-700"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Category Group</label>
                  <input
                    type="text"
                    value={editProdCategory}
                    onChange={(e) => setEditProdCategory(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-emerald-50/20 p-3 rounded-2xl border border-emerald-50">
                <div>
                  <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Carton Size (Units)</label>
                  <input
                    type="number"
                    required
                    value={editProdCartonSize}
                    onChange={(e) => setEditProdCartonSize(parseInt(e.target.value) || 12)}
                    className="w-full p-2.5 bg-white border border-emerald-200 rounded-xl font-black font-mono focus:outline-none text-center"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Carton Margin</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editProdCartonMargin || ''}
                    onChange={(e) => setEditProdCartonMargin(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-white border border-emerald-200 rounded-xl font-black font-mono focus:outline-none text-right text-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-indigo-800 uppercase mb-1">Sub-Depot Margin</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editProdSubDepotMargin || ''}
                    onChange={(e) => setEditProdSubDepotMargin(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-black font-mono focus:outline-none text-right text-indigo-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Pack Specification</label>
                  <input
                    type="text"
                    value={editProdPackSize}
                    onChange={(e) => setEditProdPackSize(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Current Stock Count</label>
                  <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl font-black text-slate-700 text-right font-mono">
                    {selectedProductForEdit.stockCount} Pcs ({(selectedProductForEdit.stockCount / editProdCartonSize).toFixed(1)} Ctn)
                  </div>
                </div>
              </div>

              {/* Incremental Stock Adder Center (Carton & Pieces) */}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black text-slate-800 uppercase flex items-center">
                    <Warehouse className="w-4 h-4 text-emerald-600 mr-1" />
                    <span>নতুন স্টক যোগ করুন (Increase Stock)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsIncreaseStockOpen(!isIncreaseStockOpen)}
                    className="text-[10px] font-extrabold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                  >
                    {isIncreaseStockOpen ? 'ফর্ম লুকান (Hide)' : 'স্টক বাড়াতে ক্লিক করুন (Open Adder)'}
                  </button>
                </div>

                {isIncreaseStockOpen && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-emerald-50/10 border border-emerald-100 rounded-2xl">
                    <div>
                      <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">যোগ করুন: কার্টুন (Cartons)</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={increaseCtn || ''}
                        onChange={(e) => setIncreaseCtn(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full p-2.5 bg-white border border-emerald-200 rounded-xl font-black font-mono focus:outline-none text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">যোগ করুন: পিস (Pieces)</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={increasePcs || ''}
                        onChange={(e) => setIncreasePcs(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full p-2.5 bg-white border border-emerald-200 rounded-xl font-black font-mono focus:outline-none text-center"
                      />
                    </div>
                    <div className="col-span-2 text-right text-[10px] text-emerald-700 font-extrabold">
                      মোট যোগ হবে: {(increaseCtn * editProdCartonSize) + increasePcs} পিস 
                      ({(((increaseCtn * editProdCartonSize) + increasePcs) / editProdCartonSize).toFixed(1)} কার্টুন)
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsEditProductModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl cursor-pointer shadow-lg shadow-blue-500/10"
                >
                  Save & Update Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
