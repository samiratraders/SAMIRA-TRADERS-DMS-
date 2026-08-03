/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Package, Plus, Search, Building2, Tag, Layers, Save, X, RefreshCw, Trash2, FileSpreadsheet, Upload, Download, TrendingUp, TrendingDown, AlertTriangle, Clock, BarChart3, Sparkles, ShieldAlert, CheckCircle2, Sliders, Edit2 } from 'lucide-react';
import { collection, getDocs, setDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Product, Company, SalesInvoice } from '../types';

interface ProductViewProps {
  globalFilters?: {
    dateFrom: string;
    dateTo: string;
    branch: string;
    status: string;
  };
}

export default function ProductView({ globalFilters }: ProductViewProps = {}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [demandFilter, setDemandFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'HEALTHY' | 'STAGNANT'>('ALL');
  const [selectedProductForDemand, setSelectedProductForDemand] = useState<Product | null>(null);
  const [editingReorderLevel, setEditingReorderLevel] = useState<number>(0);
  const [isUpdatingReorder, setIsUpdatingReorder] = useState(false);

  const [searchTerm, setSearchTerm] = useState(() => {
    const globalSearch = sessionStorage.getItem('dms_global_search_term');
    if (globalSearch) {
      sessionStorage.removeItem('dms_global_search_term');
      return globalSearch;
    }
    return '';
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Bulk Import State
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);
  const [bulkInputText, setBulkInputText] = useState('');
  const [bulkParsedProducts, setBulkParsedProducts] = useState<any[]>([]);
  const [bulkImportError, setBulkImportError] = useState('');

  // New Product Form State
  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [retailPrice, setRetailPrice] = useState(0);
  const [packSize, setPackSize] = useState('');
  const [cartonSize, setCartonSize] = useState(12);
  const [stockCount, setStockCount] = useState(0);
  const [reorderLevelInput, setReorderLevelInput] = useState<number>(24);

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch companies, products, and sales in parallel
      const [compSnap, prodSnap, salesSnap] = await Promise.all([
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'sales'))
      ]);

      const compList: Company[] = [];
      compSnap.forEach(d => compList.push(d.data() as Company));
      setCompanies(compList);

      const prodList: Product[] = [];
      prodSnap.forEach(d => prodList.push(d.data() as Product));
      setProducts(prodList);

      const salesList: SalesInvoice[] = [];
      salesSnap.forEach(d => salesList.push(d.data() as SalesInvoice));
      setSalesInvoices(salesList);
    } catch (err) {
      console.error('Error loading product data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getDemandMetrics = (prod: Product) => {
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const d14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const d7  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let totalSold30d = 0;
    let totalSold14d = 0;
    let totalSold7d = 0;

    salesInvoices.forEach(inv => {
      const invDate = inv.date ? inv.date.split('T')[0] : '';
      if (!inv.items || !Array.isArray(inv.items)) return;

      inv.items.forEach(item => {
        if (item.productId === prod.id || (item.name && item.name.toLowerCase() === prod.name.toLowerCase())) {
          const qty = item.qty || 0;
          if (invDate >= d30) totalSold30d += qty;
          if (invDate >= d14) totalSold14d += qty;
          if (invDate >= d7)  totalSold7d += qty;
        }
      });
    });

    // Daily velocity based on 30 day window
    const dailyVelocity = parseFloat((totalSold30d / 30).toFixed(2));
    const activeStock = (globalFilters?.branch && globalFilters.branch !== 'All' && globalFilters.branch !== 'head-office' && prod.subDepotStocks)
      ? prod.subDepotStocks[globalFilters.branch] || 0
      : prod.stockCount;

    // Default reorder level if not set
    const reorderLevel = prod.reorderLevel !== undefined 
      ? prod.reorderLevel 
      : (prod.minimumStock !== undefined ? prod.minimumStock : Math.max(12, prod.cartonSize * 2));

    // Estimated days remaining
    const daysRemaining = dailyVelocity > 0 ? parseFloat((activeStock / dailyVelocity).toFixed(1)) : Infinity;
    
    // Suggested reorder quantity for next 14 days buffer
    const targetStock14d = Math.ceil(dailyVelocity * 14);
    const reorderNeededUnits = Math.max(0, targetStock14d - activeStock);
    const reorderNeededCartons = Math.ceil(reorderNeededUnits / (prod.cartonSize || 1));
    const estimatedReorderCost = reorderNeededUnits * prod.purchasePrice;

    // Demand risk status
    let status: 'CRITICAL' | 'WARNING' | 'HEALTHY' | 'STAGNANT' = 'HEALTHY';
    if (dailyVelocity === 0) {
      status = 'STAGNANT';
    } else if (activeStock <= reorderLevel || daysRemaining <= 3) {
      status = 'CRITICAL';
    } else if (daysRemaining <= 7) {
      status = 'WARNING';
    } else {
      status = 'HEALTHY';
    }

    return {
      totalSold7d,
      totalSold14d,
      totalSold30d,
      dailyVelocity,
      activeStock,
      reorderLevel,
      daysRemaining,
      reorderNeededUnits,
      reorderNeededCartons,
      estimatedReorderCost,
      status
    };
  };

  const handleUpdateReorderLevel = async (productId: string, newLevel: number) => {
    if (newLevel < 0) return;
    try {
      setIsUpdatingReorder(true);
      await updateDoc(doc(db, 'products', productId), {
        reorderLevel: newLevel,
        minimumStock: newLevel
      });
      // Update local state
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, reorderLevel: newLevel, minimumStock: newLevel } : p));
      if (selectedProductForDemand && selectedProductForDemand.id === productId) {
        setSelectedProductForDemand(prev => prev ? { ...prev, reorderLevel: newLevel, minimumStock: newLevel } : null);
      }
    } catch (err) {
      console.error('Failed to update reorder level:', err);
      alert('Failed to update reorder level in Firestore.');
    } finally {
      setIsUpdatingReorder(false);
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
        reorderLevel: reorderLevelInput || 24,
        minimumStock: reorderLevelInput || 24,
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
      setReorderLevelInput(24);
      loadData();
    } catch (err) {
      console.error('Error creating product:', err);
    }
  };

  const handleDownloadCSVTemplate = () => {
    const headers = 'Name,BrandPartner,PackSize,PurchasePrice,RetailPrice,CartonSize,StockCount\n';
    const row1 = 'PRAN Spice Powder 100g,PRAN Foods,100g,22.50,28.00,24,120\n';
    const row2 = 'Lux Soap Lavender 150g,Unilever,150g,45.00,55.00,48,240\n';
    const blob = new Blob([headers + row1 + row2], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'samira_products_import_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleParseBulkData = (text: string) => {
    try {
      const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      if (lines.length < 2) {
        setBulkImportError('The CSV file or text is empty or has only headers.');
        return;
      }

      const parsed: Array<{
        name: string;
        brandPartner: string;
        packSize: string;
        purchasePrice: number;
        retailPrice: number;
        cartonSize: number;
        stockCount: number;
        companyId: string;
        isValid: boolean;
        error?: string;
      }> = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const row = line.split(',').map(cell => cell.trim().replace(/['"]/g, ''));
        
        if (row.length < 4) continue; // skip corrupted lines
        
        const prodName = row[0] || '';
        const brand = row[1] || '';
        const pSize = row[2] || '1 Pcs';
        const purchase = parseFloat(row[3]) || 0;
        const retail = parseFloat(row[4]) || 0;
        const carton = parseInt(row[5]) || 12;
        const stock = parseInt(row[6]) || 0;

        // Match company
        const matchedComp = companies.find(c => c.name.toLowerCase() === brand.toLowerCase() || c.id.toLowerCase() === brand.toLowerCase());
        const compId = matchedComp ? matchedComp.id : (companies[0]?.id || '');
        const actualBrandName = matchedComp ? matchedComp.name : (companies[0]?.name || 'Default Brand');

        const isValid = !!(prodName && brand && purchase > 0 && retail > 0 && carton > 0);
        let errorMsg = '';
        if (!prodName) errorMsg += 'Missing name. ';
        if (!brand) errorMsg += 'Missing Brand. ';
        if (purchase <= 0) errorMsg += 'Invalid purchase price. ';
        if (retail <= 0) errorMsg += 'Invalid retail price. ';

        parsed.push({
          name: prodName,
          brandPartner: actualBrandName,
          packSize: pSize,
          purchasePrice: purchase,
          retailPrice: retail,
          cartonSize: carton,
          stockCount: stock,
          companyId: compId,
          isValid,
          error: errorMsg || undefined
        });
      }

      setBulkParsedProducts(parsed);
      setBulkImportError('');
    } catch (err: any) {
      setBulkImportError('Parsing error: ' + err.message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setBulkInputText(text);
      handleParseBulkData(text);
    };
    reader.readAsText(file);
  };

  const handleSaveBulkImport = async () => {
    const validProds = bulkParsedProducts.filter(p => p.isValid);
    if (validProds.length === 0) {
      alert('No valid products to import!');
      return;
    }

    const isConfirmed = window.confirm(`Are you sure you want to import ${validProds.length} products to the catalog?`);
    if (!isConfirmed) return;

    try {
      setLoading(true);
      for (const p of validProds) {
        const id = 'prod-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now();
        const cartonPrice = p.purchasePrice * p.cartonSize;

        const productObj: Product = {
          id,
          name: p.name,
          companyId: p.companyId,
          companyName: p.brandPartner,
          purchasePrice: p.purchasePrice,
          retailPrice: p.retailPrice,
          packSize: p.packSize || '1 Pcs',
          cartonSize: p.cartonSize,
          cartonPrice,
          stockCount: p.stockCount,
          subDepotStocks: {
            'depot-1': 0,
            'depot-2': 0
          },
          createdAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'products', id), productObj);
      }

      alert(`Successfully imported ${validProds.length} products!`);
      setIsBulkImportModalOpen(false);
      setBulkInputText('');
      setBulkParsedProducts([]);
      loadData();
    } catch (err: any) {
      console.error('Error in bulk importing:', err);
      alert('Import failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const summaryCounts = products.reduce((acc, p) => {
    const m = getDemandMetrics(p);
    acc[m.status] = (acc[m.status] || 0) + 1;
    acc.totalVelocity += m.dailyVelocity;
    if (m.status === 'CRITICAL' || m.status === 'WARNING') {
      acc.totalReorderCartons += m.reorderNeededCartons;
      acc.totalReorderCost += m.estimatedReorderCost;
    }
    return acc;
  }, { CRITICAL: 0, WARNING: 0, HEALTHY: 0, STAGNANT: 0, totalVelocity: 0, totalReorderCartons: 0, totalReorderCost: 0 });

  const filtered = products.filter(p => {
    const matchesSearch = 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.companyName.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Global filter matches
    const matchesGlobalDate = (() => {
      if (!globalFilters?.dateFrom && !globalFilters?.dateTo) return true;
      if (!p.createdAt) return true;
      const createdDate = p.createdAt.split('T')[0];
      if (globalFilters.dateFrom && createdDate < globalFilters.dateFrom) return false;
      if (globalFilters.dateTo && createdDate > globalFilters.dateTo) return false;
      return true;
    })();

    const matchesGlobalBranch = (() => {
      if (!globalFilters?.branch || globalFilters.branch === 'All') return true;
      if (globalFilters.branch === 'head-office') return p.stockCount !== undefined;
      return p.subDepotStocks && p.subDepotStocks[globalFilters.branch] !== undefined;
    })();

    const matchesGlobalStatus = (() => {
      if (!globalFilters?.status || globalFilters.status === 'All') return true;
      
      const activeStock = (globalFilters?.branch && globalFilters.branch !== 'All' && globalFilters.branch !== 'head-office' && p.subDepotStocks)
        ? p.subDepotStocks[globalFilters.branch] || 0
        : p.stockCount;
      
      const threshold = p.reorderLevel !== undefined ? p.reorderLevel : (p.minimumStock !== undefined ? p.minimumStock : 10);
      const isLow = activeStock <= threshold;
      if (globalFilters.status === 'LOW_STOCK') return isLow;
      if (globalFilters.status === 'IN_STOCK') return !isLow;
      return true;
    })();

    const matchesDemandFilter = (() => {
      if (demandFilter === 'ALL') return true;
      const m = getDemandMetrics(p);
      return m.status === demandFilter;
    })();

    return matchesSearch && matchesGlobalDate && matchesGlobalBranch && matchesGlobalStatus && matchesDemandFilter;
  });

  return (
    <div className="space-y-6" id="products-module">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Product Catalog & Demand Forecast</h2>
          <p className="text-sm text-gray-500">Manage products, pack specifications, prices, and predictive reorder demands</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsBulkImportModalOpen(true)}
            id="btn-bulk-import-products"
            className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Bulk Import</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            id="btn-add-product"
            className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Product</span>
          </button>
        </div>
      </div>

      {/* Stock Demand Forecast Summary Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-5 rounded-2xl shadow-lg border border-slate-700 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/80 pb-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-indigo-300">
              <TrendingUp className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Predictive Stock Demand Indicator</span>
                <span className="text-[10px] bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 px-2 py-0.5 rounded-full font-semibold">
                  30-Day Sales Velocity
                </span>
              </h3>
              <p className="text-xs text-slate-300">Estimates stock depletion timelines based on historical sales invoice volume</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Total Sales Run-Rate</span>
            <span className="text-lg font-black text-emerald-400">{summaryCounts.totalVelocity.toFixed(1)} <span className="text-xs font-normal text-slate-300">Units/Day</span></span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => setDemandFilter('CRITICAL')}
            className={`p-3 rounded-xl border transition-all text-left cursor-pointer ${
              demandFilter === 'CRITICAL' 
                ? 'bg-rose-500/20 border-rose-400 text-white ring-2 ring-rose-400/50' 
                : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800 text-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-rose-300">Critical Reorder</span>
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            </div>
            <p className="text-xl font-black text-rose-400 mt-1">{summaryCounts.CRITICAL}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Stock &le; Reorder level or &le;3d left</p>
          </button>

          <button
            type="button"
            onClick={() => setDemandFilter('WARNING')}
            className={`p-3 rounded-xl border transition-all text-left cursor-pointer ${
              demandFilter === 'WARNING' 
                ? 'bg-amber-500/20 border-amber-400 text-white ring-2 ring-amber-400/50' 
                : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800 text-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-amber-300">Low Runway (&le;7d)</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-xl font-black text-amber-400 mt-1">{summaryCounts.WARNING}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Depleted within 4-7 days</p>
          </button>

          <button
            type="button"
            onClick={() => setDemandFilter('HEALTHY')}
            className={`p-3 rounded-xl border transition-all text-left cursor-pointer ${
              demandFilter === 'HEALTHY' 
                ? 'bg-emerald-500/20 border-emerald-400 text-white ring-2 ring-emerald-400/50' 
                : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800 text-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-emerald-300">Healthy Stock</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-xl font-black text-emerald-400 mt-1">{summaryCounts.HEALTHY}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Sufficient stock (&gt;7d runway)</p>
          </button>

          <button
            type="button"
            onClick={() => setDemandFilter('STAGNANT')}
            className={`p-3 rounded-xl border transition-all text-left cursor-pointer ${
              demandFilter === 'STAGNANT' 
                ? 'bg-slate-700 border-slate-500 text-white ring-2 ring-slate-400/50' 
                : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800 text-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-300">Low Demand</span>
              <BarChart3 className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-xl font-black text-slate-300 mt-1">{summaryCounts.STAGNANT}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">0 sales in last 30 days</p>
          </button>
        </div>

        {summaryCounts.totalReorderCartons > 0 && (
          <div className="bg-rose-950/60 border border-rose-800/80 p-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-rose-200">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                <strong>Automated Reorder Plan:</strong> Reorder <strong>{summaryCounts.totalReorderCartons} Cartons</strong> to maintain a 14-day stock safety buffer across critical items.
              </span>
            </div>
            <span className="font-mono font-bold text-rose-300 shrink-0">
              Est. Reorder Cost: ৳{summaryCounts.totalReorderCost.toLocaleString('bn-BD', { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>

      {/* Filter and Search Section */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search products by brand or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            id="input-product-search"
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        {/* Demand Filter Segment Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setDemandFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              demandFilter === 'ALL'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            All Products ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setDemandFilter('CRITICAL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1 ${
              demandFilter === 'CRITICAL'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            <span>Critical ({summaryCounts.CRITICAL})</span>
          </button>
          <button
            type="button"
            onClick={() => setDemandFilter('WARNING')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1 ${
              demandFilter === 'WARNING'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>Low Runway ({summaryCounts.WARNING})</span>
          </button>
          <button
            type="button"
            onClick={() => setDemandFilter('HEALTHY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1 ${
              demandFilter === 'HEALTHY'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>Healthy ({summaryCounts.HEALTHY})</span>
          </button>
          <button
            type="button"
            onClick={() => setDemandFilter('STAGNANT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1 ${
              demandFilter === 'STAGNANT'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>Stagnant ({summaryCounts.STAGNANT})</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-500">Syncing products catalog & computing demand metrics...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No products match search or demand criteria</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="products-grid">
          {filtered.map(prod => {
            const margin = prod.retailPrice - prod.purchasePrice;
            const marginPct = ((margin / prod.purchasePrice) * 100).toFixed(1);
            const metrics = getDemandMetrics(prod);

            return (
              <div key={prod.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between space-y-4" id={`product-card-${prod.id}`}>
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
                  <p className="text-xs text-gray-400 flex items-center mb-3">
                    <Building2 className="w-3.5 h-3.5 mr-1" />
                    <span>{prod.companyName}</span>
                  </p>

                  <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl mb-3 border border-slate-100">
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

                  {/* Stock Demand Indicator Widget Box */}
                  <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900">Stock Demand Forecast</span>
                      </div>
                      
                      {metrics.status === 'CRITICAL' && (
                        <span className="text-[10px] font-black bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full border border-rose-200 flex items-center space-x-1 animate-pulse">
                          <AlertTriangle className="w-3 h-3" />
                          <span>{metrics.daysRemaining <= 0 ? 'Reorder Needed' : `${metrics.daysRemaining} Days Left`}</span>
                        </span>
                      )}
                      {metrics.status === 'WARNING' && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200 flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{metrics.daysRemaining} Days Left</span>
                        </span>
                      )}
                      {metrics.status === 'HEALTHY' && (
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{metrics.daysRemaining === Infinity ? 'Healthy Supply' : `${metrics.daysRemaining} Days Runway`}</span>
                        </span>
                      )}
                      {metrics.status === 'STAGNANT' && (
                        <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full border border-slate-300">
                          Low Demand
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-[10px] text-slate-500 block font-medium">30D Velocity</span>
                        <span className="font-bold text-slate-900">{metrics.dailyVelocity} units/day</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block font-medium">Reorder Level</span>
                        <span className="font-bold text-slate-900">{metrics.reorderLevel} units</span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all rounded-full ${
                          metrics.status === 'CRITICAL' 
                            ? 'bg-rose-500' 
                            : metrics.status === 'WARNING' 
                              ? 'bg-amber-500' 
                              : metrics.status === 'HEALTHY' 
                                ? 'bg-emerald-500' 
                                : 'bg-slate-400'
                        }`}
                        style={{
                          width: `${Math.min(100, (metrics.activeStock / Math.max(1, metrics.reorderLevel * 2)) * 100)}%`
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProductForDemand(prod);
                        setEditingReorderLevel(metrics.reorderLevel);
                      }}
                      className="w-full text-center py-1.5 bg-white hover:bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200 rounded-lg transition-colors cursor-pointer flex items-center justify-center space-x-1 shadow-2xs"
                    >
                      <BarChart3 className="w-3 h-3 text-indigo-600" />
                      <span>Demand Analytics & Reorder Settings</span>
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                      {globalFilters?.branch && globalFilters.branch !== 'All' && globalFilters.branch !== 'head-office' 
                        ? 'Branch Stock' 
                        : 'Depot Stock'}
                    </span>
                    {(() => {
                      const stockVal = metrics.activeStock;
                      return (
                        <span className={`text-sm font-extrabold ${stockVal <= metrics.reorderLevel ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {stockVal} Units ({(stockVal / prod.cartonSize).toFixed(1)} Ctn)
                        </span>
                      );
                    })()}
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

      {/* Bulk Import Modal */}
      {isBulkImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto text-slate-800">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl relative max-h-[90vh] overflow-y-auto space-y-6">
            <button
              onClick={() => {
                setIsBulkImportModalOpen(false);
                setBulkInputText('');
                setBulkParsedProducts([]);
                setBulkImportError('');
              }}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <span>Bulk Import Products</span>
              </h3>
              <p className="text-xs text-gray-400">Synchronize your inventory catalog by uploading a CSV or pasting records below.</p>
            </div>

            {/* Step 1: Instructions & Template */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs">
              <div className="space-y-2">
                <h4 className="font-bold text-slate-800">CSV Template Format</h4>
                <p className="text-gray-500">Your CSV file or pasted text must contain headers and columns in this exact order:</p>
                <div className="bg-slate-900 text-slate-200 font-mono text-[10px] p-2.5 rounded-lg overflow-x-auto">
                  Name,BrandPartner,PackSize,PurchasePrice,RetailPrice,CartonSize,StockCount
                </div>
                <button
                  type="button"
                  onClick={handleDownloadCSVTemplate}
                  className="flex items-center space-x-1.5 text-blue-600 hover:text-blue-800 font-bold cursor-pointer mt-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Sample CSV Template</span>
                </button>
              </div>
              <div className="space-y-1.5 text-gray-600">
                <h4 className="font-bold text-slate-800">Important Instructions</h4>
                <ul className="list-disc list-inside space-y-1 text-[11px]">
                  <li><strong>BrandPartner</strong> should match existing Brand/Company names.</li>
                  <li><strong>PurchasePrice</strong> and <strong>RetailPrice</strong> must be positive decimal values.</li>
                  <li><strong>CartonSize</strong> is the count of individual pieces in a full carton (integer).</li>
                  <li>Duplicate products with existing names will be created as new catalog entries.</li>
                </ul>
              </div>
            </div>

            {/* Step 2: Data Input (File or Paste) */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="block text-xs font-bold text-gray-700">Choose CSV File or Paste Data</label>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer shadow-sm">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload CSV File</span>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <textarea
                placeholder="Name,BrandPartner,PackSize,PurchasePrice,RetailPrice,CartonSize,StockCount&#10;Lux Soap Lavender 100g,Unilever,100g,45.00,55.00,48,240"
                value={bulkInputText}
                onChange={(e) => {
                  setBulkInputText(e.target.value);
                  handleParseBulkData(e.target.value);
                }}
                className="w-full h-32 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {/* Error Message */}
            {bulkImportError && (
              <div className="p-3 bg-rose-50 text-rose-800 text-xs rounded-lg border border-rose-100 font-semibold">
                {bulkImportError}
              </div>
            )}

            {/* Step 3: Parsed Data Preview */}
            {bulkParsedProducts.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Parsed Records Preview ({bulkParsedProducts.length} entries, {bulkParsedProducts.filter(p => p.isValid).length} valid)
                </h4>
                <div className="border border-slate-100 rounded-xl overflow-hidden bg-white max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-[10px] border-collapse">
                    <thead className="bg-slate-50 text-gray-500 font-bold border-b sticky top-0">
                      <tr>
                        <th className="p-2">Product Name</th>
                        <th className="p-2">Brand Partner</th>
                        <th className="p-2">Pack</th>
                        <th className="p-2 text-right">Purchase</th>
                        <th className="p-2 text-right">Retail</th>
                        <th className="p-2 text-center">Ctn Size</th>
                        <th className="p-2 text-center">Stock</th>
                        <th className="p-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-slate-700">
                      {bulkParsedProducts.map((p, index) => (
                        <tr key={index} className="hover:bg-slate-50/50">
                          <td className="p-2 font-bold max-w-[150px] truncate" title={p.name}>{p.name}</td>
                          <td className="p-2">{p.brandPartner}</td>
                          <td className="p-2">{p.packSize}</td>
                          <td className="p-2 text-right">৳{p.purchasePrice.toFixed(2)}</td>
                          <td className="p-2 text-right">৳{p.retailPrice.toFixed(2)}</td>
                          <td className="p-2 text-center">{p.cartonSize}</td>
                          <td className="p-2 text-center">{p.stockCount}</td>
                          <td className="p-2 text-center">
                            {p.isValid ? (
                              <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded font-bold">
                                Ready
                              </span>
                            ) : (
                              <span className="inline-block bg-rose-50 text-rose-700 border border-rose-100 px-1.5 py-0.5 rounded font-bold" title={p.error}>
                                Error
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Actions Footer */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setIsBulkImportModalOpen(false);
                  setBulkInputText('');
                  setBulkParsedProducts([]);
                  setBulkImportError('');
                }}
                className="bg-slate-100 text-gray-600 px-4 py-2.5 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveBulkImport}
                disabled={bulkParsedProducts.filter(p => p.isValid).length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 cursor-pointer transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Import {bulkParsedProducts.filter(p => p.isValid).length} Products</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Demand Analytics & Reorder Settings Modal */}
      {selectedProductForDemand && (() => {
        const p = selectedProductForDemand;
        const m = getDemandMetrics(p);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto space-y-5 text-slate-800">
              <button
                onClick={() => setSelectedProductForDemand(null)}
                className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-start space-x-3 pr-8">
                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl text-indigo-600 shrink-0">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-gray-900">{p.name}</h3>
                    <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                      {p.packSize}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{p.companyName} &bull; Carton Size: {p.cartonSize} units</p>
                </div>
              </div>

              {/* Status Header Bar */}
              <div className="p-4 rounded-xl border flex items-center justify-between bg-slate-50 border-slate-200">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Current Stock</span>
                  <span className="text-lg font-black text-slate-900">
                    {m.activeStock} Units <span className="text-xs font-bold text-slate-500">({(m.activeStock / p.cartonSize).toFixed(1)} Cartons)</span>
                  </span>
                </div>

                <div>
                  {m.status === 'CRITICAL' && (
                    <span className="text-xs font-black bg-rose-100 text-rose-800 px-3 py-1 rounded-full border border-rose-200 flex items-center space-x-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Critical (&le;3 Days Left)</span>
                    </span>
                  )}
                  {m.status === 'WARNING' && (
                    <span className="text-xs font-bold bg-amber-100 text-amber-800 px-3 py-1 rounded-full border border-amber-200 flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Low Supply (&le;7 Days Left)</span>
                    </span>
                  )}
                  {m.status === 'HEALTHY' && (
                    <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full border border-emerald-200 flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Healthy Stock Runway</span>
                    </span>
                  )}
                  {m.status === 'STAGNANT' && (
                    <span className="text-xs font-bold bg-slate-200 text-slate-700 px-3 py-1 rounded-full border border-slate-300">
                      Stagnant Demand
                    </span>
                  )}
                </div>
              </div>

              {/* Historical Sales Velocity Cards */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Historical Invoice Sales Velocity</span>
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-bold block">Last 7 Days</span>
                    <span className="text-sm font-black text-slate-800">{m.totalSold7d} Units</span>
                    <span className="text-[10px] text-slate-500 block">{(m.totalSold7d / 7).toFixed(1)} u/day</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-bold block">Last 14 Days</span>
                    <span className="text-sm font-black text-slate-800">{m.totalSold14d} Units</span>
                    <span className="text-[10px] text-slate-500 block">{(m.totalSold14d / 14).toFixed(1)} u/day</span>
                  </div>
                  <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100">
                    <span className="text-[10px] text-indigo-500 font-bold block">30-Day Velocity</span>
                    <span className="text-sm font-black text-indigo-950">{m.totalSold30d} Units</span>
                    <span className="text-[10px] text-indigo-600 font-extrabold block">{m.dailyVelocity} u/day</span>
                  </div>
                </div>
              </div>

              {/* Reorder Level Configurator */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Reorder Threshold Level</h4>
                    <p className="text-[11px] text-slate-500">Triggers critical reorder warning when stock drops to or below this count</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <input
                    type="number"
                    min="0"
                    value={editingReorderLevel}
                    onChange={(e) => setEditingReorderLevel(parseInt(e.target.value) || 0)}
                    className="w-32 p-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-500 font-medium">Units ({(editingReorderLevel / p.cartonSize).toFixed(1)} Cartons)</span>

                  <button
                    type="button"
                    disabled={isUpdatingReorder || editingReorderLevel === m.reorderLevel}
                    onClick={() => handleUpdateReorderLevel(p.id, editingReorderLevel)}
                    className="ml-auto bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isUpdatingReorder ? 'Saving...' : 'Update Level'}</span>
                  </button>
                </div>
              </div>

              {/* Automated 14-Day Reorder Proposal */}
              <div className="p-4 bg-indigo-950 text-white rounded-xl space-y-2">
                <div className="flex items-center justify-between border-b border-indigo-800/80 pb-2">
                  <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>14-Day Reorder Plan Proposal</span>
                  </span>
                  <span className="text-xs font-bold text-emerald-400">
                    Est. Cost: ৳{m.estimatedReorderCost.toLocaleString('bn-BD', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Recommended Purchase Qty:</span>
                    <span className="font-bold text-white text-sm">
                      {m.reorderNeededUnits} Units ({m.reorderNeededCartons} Full Cartons)
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Unit Purchase Price:</span>
                    <span className="font-bold text-white text-sm">৳{p.purchasePrice.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedProductForDemand(null)}
                  className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2 rounded-lg text-xs font-bold cursor-pointer"
                >
                  Close Analytics
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
