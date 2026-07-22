/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Package, Plus, Search, Building2, Tag, Layers, Save, X, RefreshCw, Trash2, FileSpreadsheet, Upload, Download } from 'lucide-react';
import { collection, getDocs, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Product, Company } from '../types';

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

    return matchesSearch && matchesGlobalDate && matchesGlobalBranch && matchesGlobalStatus;
  });

  return (
    <div className="space-y-6" id="products-module">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Product Catalog</h2>
          <p className="text-sm text-gray-500">Manage products, pack specifications, prices, and default depot stocks</p>
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
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                      {globalFilters?.branch && globalFilters.branch !== 'All' && globalFilters.branch !== 'head-office' 
                        ? 'Branch Stock' 
                        : 'Depot Stock'}
                    </span>
                    {(() => {
                      const stockVal = (globalFilters?.branch && globalFilters.branch !== 'All' && globalFilters.branch !== 'head-office' && prod.subDepotStocks)
                        ? prod.subDepotStocks[globalFilters.branch] || 0
                        : prod.stockCount;
                      return (
                        <span className={`text-sm font-extrabold ${stockVal <= 24 ? 'text-rose-600' : 'text-emerald-600'}`}>
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
    </div>
  );
}
