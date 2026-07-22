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
  PlusCircle,
  History,
  Archive,
  Eye,
  UploadCloud,
  CheckCircle2
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
  const [adjustType, setAdjustType] = useState<'ADD' | 'SALES_RETURN' | 'DAMAGE_RETURN' | 'WRITE_OFF_DAMAGE'>('ADD');
  const [adjustRemarks, setAdjustRemarks] = useState('');

  // FMCG SPECIFICATION v2.0 - NEW FIELDS
  const [newProdBrand, setNewProdBrand] = useState('');
  const [newProdBarcode, setNewProdBarcode] = useState('');
  const [newProdSku, setNewProdSku] = useState('');
  const [newProdUnit, setNewProdUnit] = useState('Piece');
  const [newProdWholesalePrice, setNewProdWholesalePrice] = useState<number>(0);
  const [newProdSubDistributorPrice, setNewProdSubDistributorPrice] = useState<number>(0);
  const [newProdDealerPrice, setNewProdDealerPrice] = useState<number>(0);
  const [newProdOpeningStock, setNewProdOpeningStock] = useState<number>(0);
  const [newProdDamageStock, setNewProdDamageStock] = useState<number>(0);
  const [newProdMinimumStock, setNewProdMinimumStock] = useState<number>(5);
  const [newProdReorderLevel, setNewProdReorderLevel] = useState<number>(10);
  const [newProdProductImage, setNewProdProductImage] = useState('');

  const [editProdBrand, setEditProdBrand] = useState('');
  const [editProdBarcode, setEditProdBarcode] = useState('');
  const [editProdSku, setEditProdSku] = useState('');
  const [editProdUnit, setEditProdUnit] = useState('Piece');
  const [editProdWholesalePrice, setEditProdWholesalePrice] = useState<number>(0);
  const [editProdSubDistributorPrice, setEditProdSubDistributorPrice] = useState<number>(0);
  const [editProdDealerPrice, setEditProdDealerPrice] = useState<number>(0);
  const [editProdOpeningStock, setEditProdOpeningStock] = useState<number>(0);
  const [editProdDamageStock, setEditProdDamageStock] = useState<number>(0);
  const [editProdMinimumStock, setEditProdMinimumStock] = useState<number>(5);
  const [editProdReorderLevel, setEditProdReorderLevel] = useState<number>(10);
  const [editProdProductImage, setEditProdProductImage] = useState('');

  // Soft delete, filters, and history states
  const [showDeletedProducts, setShowDeletedProducts] = useState(false);
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<Product | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedFilterStatus, setSelectedFilterStatus] = useState<string>('ALL'); // ALL, LOW_STOCK, DAMAGE, OUT_OF_STOCK

  // Bulk JSON Import modal states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [parsedRecords, setParsedRecords] = useState<any[]>([]);
  const [importSummary, setImportSummary] = useState<{ updated: number; created: number } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Selected product ids for bulk operations
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  
  // Bulk Min Stock Modal
  const [isBulkMinStockModalOpen, setIsBulkMinStockModalOpen] = useState(false);
  const [bulkMinStockValue, setBulkMinStockValue] = useState<number>(5);
  const [bulkMinStockCategories, setBulkMinStockCategories] = useState<string[]>([]);

  // Bulk Price Increase Modal
  const [isBulkPriceModalOpen, setIsBulkPriceModalOpen] = useState(false);
  const [bulkPriceIncreasePct, setBulkPriceIncreasePct] = useState<number>(0);

  // Bulk Category Reassign Modal
  const [isBulkCategoryModalOpen, setIsBulkCategoryModalOpen] = useState(false);
  const [bulkNewCategory, setBulkNewCategory] = useState<string>('');

  // QR Scan Simulation Modal
  const [isQrSimulateModalOpen, setIsQrSimulateModalOpen] = useState(false);
  const [simulateProductId, setSimulateProductId] = useState<string>('');
  const [simulateReplenishQty, setSimulateReplenishQty] = useState<number>(50);

  const handleJsonFileImport = async (jsonText: string) => {
    try {
      const parsed = JSON.parse(jsonText);
      const list = Array.isArray(parsed) ? parsed : [parsed];

      if (list.length === 0) {
        throw new Error("The uploaded list is empty.");
      }

      const validatedRecords: any[] = [];
      let updatedCount = 0;
      let createdCount = 0;

      for (const record of list) {
        if (!record.name) {
          throw new Error("Each product record must have at least a 'name' field.");
        }

        // Match existing product
        const existingProduct = products.find(p => 
          (record.id && p.id === record.id) ||
          (record.sku && p.sku === record.sku) ||
          (record.barcode && p.barcode === record.barcode) ||
          (p.name.toLowerCase() === record.name.toLowerCase())
        );

        if (existingProduct) {
          const updatedFields: any = {
            ...existingProduct,
            history: [
              ...(existingProduct.history || []),
              {
                date: new Date().toISOString().split('T')[0],
                action: 'BULK_IMPORT_UPDATE',
                user: localStorage.getItem('samira_current_user_name') || 'Admin',
                details: `Bulk imported inventory values update. Stock Count: ${existingProduct.stockCount} -> ${record.stockCount ?? existingProduct.stockCount}`
              }
            ]
          };

          if (record.stockCount !== undefined) updatedFields.stockCount = Number(record.stockCount);
          if (record.purchasePrice !== undefined) updatedFields.purchasePrice = Number(record.purchasePrice);
          if (record.retailPrice !== undefined) updatedFields.retailPrice = Number(record.retailPrice);
          if (record.wholesalePrice !== undefined) updatedFields.wholesalePrice = Number(record.wholesalePrice);
          if (record.subDistributorPrice !== undefined) updatedFields.subDistributorPrice = Number(record.subDistributorPrice);
          if (record.dealerPrice !== undefined) updatedFields.dealerPrice = Number(record.dealerPrice);
          if (record.minimumStock !== undefined) updatedFields.minimumStock = Number(record.minimumStock);
          if (record.reorderLevel !== undefined) updatedFields.reorderLevel = Number(record.reorderLevel);
          if (record.damageStock !== undefined) updatedFields.damageStock = Number(record.damageStock);
          if (record.cartonSize !== undefined) updatedFields.cartonSize = Number(record.cartonSize);
          if (record.category !== undefined) updatedFields.category = record.category;
          if (record.brand !== undefined) updatedFields.brand = record.brand;
          if (record.packSize !== undefined) updatedFields.packSize = record.packSize;
          if (record.sku !== undefined) updatedFields.sku = record.sku;
          if (record.barcode !== undefined) updatedFields.barcode = record.barcode;

          updatedFields.cartonPrice = updatedFields.purchasePrice * updatedFields.cartonSize;

          validatedRecords.push({ action: 'UPDATE', id: existingProduct.id, data: updatedFields });
          updatedCount++;
        } else {
          // Verify purchasePrice and retailPrice
          if (record.purchasePrice === undefined || record.retailPrice === undefined) {
            throw new Error(`Product "${record.name}" is new but missing 'purchasePrice' or 'retailPrice' fields.`);
          }

          const companyId = record.companyId || (suppliers[0]?.companyId || 'general_company_id');
          const companyName = record.companyName || (suppliers[0]?.companyName || 'General Company');
          const supplierId = record.supplierId || (suppliers[0]?.id || 'general_supplier_id');

          const newId = record.id || 'prod-' + Date.now() + Math.random().toString(36).substr(2, 5);
          const purchasePrice = Number(record.purchasePrice);
          const cartonSize = Number(record.cartonSize || 12);

          const newProd: any = {
            id: newId,
            name: record.name,
            companyId,
            companyName,
            supplierId,
            category: record.category || 'General',
            brand: record.brand || record.companyName || 'General Brand',
            purchasePrice,
            retailPrice: Number(record.retailPrice),
            wholesalePrice: record.wholesalePrice !== undefined ? Number(record.wholesalePrice) : purchasePrice * 1.05,
            subDistributorPrice: record.subDistributorPrice !== undefined ? Number(record.subDistributorPrice) : purchasePrice * 1.03,
            dealerPrice: record.dealerPrice !== undefined ? Number(record.dealerPrice) : purchasePrice * 1.02,
            packSize: record.packSize || '1 Pcs',
            cartonSize,
            cartonPrice: purchasePrice * cartonSize,
            stockCount: Number(record.stockCount || 0),
            subDepotStocks: record.subDepotStocks || {},
            openingStock: Number(record.openingStock || record.stockCount || 0),
            damageStock: Number(record.damageStock || 0),
            minimumStock: Number(record.minimumStock || 5),
            reorderLevel: Number(record.reorderLevel || 10),
            productImage: record.productImage || '',
            sku: record.sku || 'SKU-' + newId.toUpperCase(),
            barcode: record.barcode || '',
            isDeleted: false,
            createdAt: new Date().toISOString(),
            history: [{
              date: new Date().toISOString().split('T')[0],
              action: 'CREATED',
              user: localStorage.getItem('samira_current_user_name') || 'Admin',
              details: `Created via JSON Bulk Import operation.`
            }]
          };

          validatedRecords.push({ action: 'CREATE', id: newId, data: newProd });
          createdCount++;
        }
      }

      return { validatedRecords, updatedCount, createdCount };
    } catch (err: any) {
      throw new Error(err.message || "Invalid JSON array of products.");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const processFile = (file: File) => {
    setImportFileName(file.name);
    setImportError(null);
    setImportSuccess(null);
    setParsedRecords([]);
    setImportSummary(null);

    if (!file.name.endsWith('.json')) {
      setImportError('Please upload a valid .json file representing the prepared product list.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const { validatedRecords, updatedCount, createdCount } = await handleJsonFileImport(text);
        setParsedRecords(validatedRecords);
        setImportSummary({ updated: updatedCount, created: createdCount });
      } catch (err: any) {
        setImportError(err.message || 'Error parsing product file.');
      }
    };
    reader.onerror = () => {
      setImportError('Failed to read file.');
    };
    reader.readAsText(file);
  };

  const handleExecuteBulkImport = async () => {
    if (parsedRecords.length === 0) return;
    setIsImporting(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const batch = writeBatch(db);

      for (const record of parsedRecords) {
        const docRef = doc(db, 'products', record.id);
        batch.set(docRef, record.data, { merge: true });
      }

      await batch.commit();

      setImportSuccess(`Successfully processed ${parsedRecords.length} product records (${importSummary?.updated} updated, ${importSummary?.created} created).`);
      setParsedRecords([]);
      setImportSummary(null);
      setImportFileName('');
      loadData();
    } catch (err: any) {
      console.error("Bulk import failed:", err);
      setImportError(err.message || "Failed to save records to Firestore. Please try again.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleBulkUpdateMinStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bulkMinStockCategories.length === 0) {
      alert("দয়া করে অন্তত একটি ক্যাটাগরি সিলেক্ট করুন। (Please select at least one category)");
      return;
    }
    const val = Number(bulkMinStockValue);
    if (isNaN(val) || val < 0) {
      alert("দয়া করে সঠিক সংখ্যা প্রদান করুন। (Please enter a valid number)");
      return;
    }

    try {
      setLoading(true);
      const batch = writeBatch(db);
      const affectedProducts = products.filter(p => bulkMinStockCategories.includes((p as any).category || 'General'));
      
      const currentUserName = localStorage.getItem('samira_current_user_name') || 'Admin';
      const todayStr = new Date().toISOString().split('T')[0];

      for (const prod of affectedProducts) {
        const docRef = doc(db, 'products', prod.id);
        const originalHistory = prod.history || [];
        const updatedHistory = [
          ...originalHistory,
          {
            date: todayStr,
            action: 'BULK_UPDATE_MIN_STOCK',
            user: currentUserName,
            details: `Minimum Stock level bulk-updated to ${val} Pcs.`
          }
        ];
        batch.update(docRef, {
          minimumStock: val,
          history: updatedHistory
        });
      }

      await batch.commit();
      alert(`সফলভাবে ${affectedProducts.length}টি পণ্যের মিনিমাম স্টক ${val} পিসে আপডেট করা হয়েছে।`);
      setIsBulkMinStockModalOpen(false);
      setBulkMinStockCategories([]);
      loadData();
    } catch (err: any) {
      console.error("Failed to bulk update min stock:", err);
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkPriceIncrease = async (e: React.FormEvent) => {
    e.preventDefault();
    const pct = Number(bulkPriceIncreasePct);
    if (isNaN(pct) || pct <= 0) {
      alert("দয়া করে সঠিক শতকরা হার লিখুন (>0%)।");
      return;
    }

    try {
      setLoading(true);
      const batch = writeBatch(db);
      const currentUserName = localStorage.getItem('samira_current_user_name') || 'Admin';
      const todayStr = new Date().toISOString().split('T')[0];

      const selectedProds = products.filter(p => selectedProductIds.includes(p.id));

      for (const prod of selectedProds) {
        const docRef = doc(db, 'products', prod.id);
        
        // Calculate price increases
        const multiplier = 1 + (pct / 100);
        const purchasePrice = prod.purchasePrice * multiplier;
        const retailPrice = prod.retailPrice * multiplier;
        const wholesalePrice = (prod.wholesalePrice || prod.purchasePrice * 1.05) * multiplier;
        const subDistributorPrice = (prod.subDistributorPrice || prod.purchasePrice * 1.03) * multiplier;
        const dealerPrice = (prod.dealerPrice || prod.purchasePrice * 1.02) * multiplier;
        const cartonPrice = purchasePrice * prod.cartonSize;

        const originalHistory = prod.history || [];
        const updatedHistory = [
          ...originalHistory,
          {
            date: todayStr,
            action: 'BULK_PRICE_INCREASE',
            user: currentUserName,
            details: `Prices increased by ${pct}% via bulk action.`
          }
        ];

        batch.update(docRef, {
          purchasePrice,
          retailPrice,
          wholesalePrice,
          subDistributorPrice,
          dealerPrice,
          cartonPrice,
          history: updatedHistory
        });
      }

      await batch.commit();
      alert(`সফলভাবে ${selectedProds.length}টি পণ্যের দাম ${pct}% বাড়ানো হয়েছে।`);
      setIsBulkPriceModalOpen(false);
      setSelectedProductIds([]);
      loadData();
    } catch (err: any) {
      console.error("Bulk price increase failed:", err);
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkCategoryReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCat = bulkNewCategory.trim();
    if (!trimmedCat) {
      alert("দয়া করে নতুন ক্যাটাগরির নাম দিন।");
      return;
    }

    try {
      setLoading(true);
      const batch = writeBatch(db);
      const currentUserName = localStorage.getItem('samira_current_user_name') || 'Admin';
      const todayStr = new Date().toISOString().split('T')[0];

      const selectedProds = products.filter(p => selectedProductIds.includes(p.id));

      for (const prod of selectedProds) {
        const docRef = doc(db, 'products', prod.id);
        const originalHistory = prod.history || [];
        const updatedHistory = [
          ...originalHistory,
          {
            date: todayStr,
            action: 'BULK_CATEGORY_REASSIGN',
            user: currentUserName,
            details: `Category reassigned from "${(prod as any).category || 'General'}" to "${trimmedCat}".`
          }
        ];

        batch.update(docRef, {
          category: trimmedCat,
          history: updatedHistory
        });
      }

      await batch.commit();
      alert(`সফলভাবে ${selectedProds.length}টি পণ্যের ক্যাটাগরি "${trimmedCat}" এ পরিবর্তন করা হয়েছে।`);
      setIsBulkCategoryModalOpen(false);
      setSelectedProductIds([]);
      setBulkNewCategory('');
      loadData();
    } catch (err: any) {
      console.error("Bulk category reassign failed:", err);
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteMockScanReplenish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulateProductId) {
      alert("দয়া করে একটি পণ্য সিলেক্ট করুন।");
      return;
    }
    const qty = Number(simulateReplenishQty);
    if (isNaN(qty) || qty <= 0) {
      alert("সঠিক পরিমাণ প্রদান করুন।");
      return;
    }

    try {
      setLoading(true);
      const prod = products.find(p => p.id === simulateProductId);
      if (!prod) return;

      const newStock = prod.stockCount + qty;
      const docRef = doc(db, 'products', prod.id);

      const currentUserName = localStorage.getItem('samira_current_user_name') || 'Admin';
      const todayStr = new Date().toISOString().split('T')[0];
      const originalHistory = prod.history || [];
      const updatedHistory = [
        ...originalHistory,
        {
          date: todayStr,
          action: 'REPLENISHED_VIA_SCAN',
          user: currentUserName,
          details: `Replenished ${qty} Pieces (via Simulated QR Code Barcode Scan replenishment flow).`
        }
      ];

      await updateDoc(docRef, {
        stockCount: newStock,
        history: updatedHistory
      });

      alert(`সফলভাবে কিউআর কোড স্ক্যান সিমুলেশন সম্পন্ন হয়েছে! পণ্য: ${prod.name}, নতুন স্টক: ${newStock} পিস (+${qty} Pcs)`);
      setIsQrSimulateModalOpen(false);
      setSimulateProductId('');
      loadData();
    } catch (err: any) {
      console.error("Simulated scan replenishment failed:", err);
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

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
      const currentUserName = localStorage.getItem('samira_current_user_name') || 'Admin';

      const history = [{
        date: new Date().toISOString().split('T')[0],
        action: 'CREATED',
        user: currentUserName,
        details: `Product created with opening stock ${newProdOpeningStock} ${newProdUnit}`
      }];

      const productObj: Product = {
        id,
        name: newProdName,
        companyId: newProdSupplierId,
        companyName,
        purchasePrice: newProdPurchasePrice,
        retailPrice: newProdRetailPrice,
        packSize: newProdPackSize || '1 Pcs',
        cartonSize: newProdCartonSize,
        cartonPrice,
        stockCount: newProdStockCount + (newProdOpeningStock || 0),
        subDepotStocks: {},
        category: newProdCategory || 'General',
        brand: newProdBrand || companyName,
        supplierId: newProdSupplierId,
        supplierName: companyName,
        barcode: newProdBarcode,
        sku: newProdSku || `SKU-${id.slice(-6).toUpperCase()}`,
        unit: newProdUnit,
        wholesalePrice: newProdWholesalePrice || newProdPurchasePrice * 1.05,
        subDistributorPrice: newProdSubDistributorPrice || newProdPurchasePrice * 1.03,
        dealerPrice: newProdDealerPrice || newProdPurchasePrice * 1.02,
        openingStock: newProdOpeningStock,
        damageStock: newProdDamageStock || 0,
        minimumStock: newProdMinimumStock || 5,
        reorderLevel: newProdReorderLevel || 10,
        productImage: newProdProductImage || '',
        isDeleted: false,
        history,
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
      setNewProdCategory('');
      setNewProdBrand('');
      setNewProdBarcode('');
      setNewProdSku('');
      setNewProdUnit('Piece');
      setNewProdWholesalePrice(0);
      setNewProdSubDistributorPrice(0);
      setNewProdDealerPrice(0);
      setNewProdOpeningStock(0);
      setNewProdDamageStock(0);
      setNewProdMinimumStock(5);
      setNewProdReorderLevel(10);
      setNewProdProductImage('');
      
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
    setEditProdCategory(prod.category || 'General');

    // Populate FMCG SPECIFICATION v2.0 - NEW FIELDS
    setEditProdBrand(prod.brand || '');
    setEditProdBarcode(prod.barcode || '');
    setEditProdSku(prod.sku || '');
    setEditProdUnit(prod.unit || 'Piece');
    setEditProdWholesalePrice(prod.wholesalePrice || prod.purchasePrice * 1.05);
    setEditProdSubDistributorPrice(prod.subDistributorPrice || prod.purchasePrice * 1.03);
    setEditProdDealerPrice(prod.dealerPrice || prod.purchasePrice * 1.02);
    setEditProdOpeningStock(prod.openingStock || 0);
    setEditProdDamageStock(prod.damageStock || 0);
    setEditProdMinimumStock(prod.minimumStock || 5);
    setEditProdReorderLevel(prod.reorderLevel || 10);
    setEditProdProductImage(prod.productImage || '');
    
    // Reset stock increase inputs
    setIsIncreaseStockOpen(false);
    setIncreaseCtn(0);
    setIncreasePcs(0);
    setAdjustType('ADD');
    setAdjustRemarks('');
    
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
      const currentUserName = localStorage.getItem('samira_current_user_name') || 'Admin';

      // Calculate stock count including any additions/returns/damages
      let updatedStockCount = selectedProductForEdit.stockCount || 0;
      let updatedDamageStockCount = editProdDamageStock || 0;
      let stockChangeDetails = '';

      if (isIncreaseStockOpen) {
        const extraUnits = (increaseCtn * editProdCartonSize) + increasePcs;
        if (adjustType === 'ADD') {
          updatedStockCount += extraUnits;
          stockChangeDetails = ` [Manual Stock Add] Added ${increaseCtn} Cartons, ${increasePcs} Pieces. Reason: ${adjustRemarks || 'N/A'}`;
        } else if (adjustType === 'SALES_RETURN') {
          updatedStockCount += extraUnits;
          stockChangeDetails = ` [Sales Return] Added back ${increaseCtn} Cartons, ${increasePcs} Pieces to active stock. Reason: ${adjustRemarks || 'Customer Return'}`;
        } else if (adjustType === 'DAMAGE_RETURN') {
          updatedDamageStockCount += extraUnits;
          stockChangeDetails = ` [Damage Return] Added ${increaseCtn} Cartons, ${increasePcs} Pieces to damage stock. Reason: ${adjustRemarks || 'Damaged in transit / market'}`;
        } else if (adjustType === 'WRITE_OFF_DAMAGE') {
          const unitsToMove = Math.min(updatedStockCount, extraUnits);
          updatedStockCount -= unitsToMove;
          updatedDamageStockCount += unitsToMove;
          stockChangeDetails = ` [Stock Damage Write-off] Moved ${unitsToMove} pieces from active stock to damage stock. Reason: ${adjustRemarks || 'Damaged in warehouse'}`;
        }
      }

      const originalHistory = selectedProductForEdit.history || [];
      const updatedHistory = [
        ...originalHistory,
        {
          date: new Date().toISOString().split('T')[0],
          action: 'EDITED',
          user: currentUserName,
          details: `Product updated.${stockChangeDetails} Purchase Price: ৳${editProdPurchasePrice}, Wholesale Price: ৳${editProdWholesalePrice}, Minimum Stock alert level set to ${editProdMinimumStock}`
        }
      ];

      const updatedProduct: Product = {
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
        category: editProdCategory,
        brand: editProdBrand || companyName,
        supplierId: editProdSupplierId,
        supplierName: companyName,
        barcode: editProdBarcode,
        sku: editProdSku || `SKU-${selectedProductForEdit.id.slice(-6).toUpperCase()}`,
        unit: editProdUnit,
        wholesalePrice: editProdWholesalePrice,
        subDistributorPrice: editProdSubDistributorPrice,
        dealerPrice: editProdDealerPrice,
        openingStock: editProdOpeningStock,
        damageStock: updatedDamageStockCount,
        minimumStock: editProdMinimumStock,
        reorderLevel: editProdReorderLevel,
        productImage: editProdProductImage,
        history: updatedHistory
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

  // Delete Product (Soft-delete / Archive)
  const handleDeleteProduct = async (prodId: string, prodName: string) => {
    const isConfirmed = window.confirm(`Are you sure you want to soft-delete product "${prodName}"? It will be archived and can be restored from the active filters list.`);
    if (!isConfirmed) return;

    try {
      setLoading(true);
      const productToEdit = products.find(p => p.id === prodId);
      if (!productToEdit) return;

      const currentUserName = localStorage.getItem('samira_current_user_name') || 'Admin';
      const originalHistory = productToEdit.history || [];
      const updatedHistory = [
        ...originalHistory,
        {
          date: new Date().toISOString().split('T')[0],
          action: 'SOFT_DELETED',
          user: currentUserName,
          details: `Product soft-deleted by ${currentUserName}`
        }
      ];

      const updatedProduct = {
        ...productToEdit,
        isDeleted: true,
        history: updatedHistory
      };

      await setDoc(doc(db, 'products', prodId), updatedProduct);
      alert(`Product "${prodName}" soft-deleted/archived successfully.`);
      loadData();
    } catch (err) {
      console.error('Error soft-deleting product:', err);
      alert('Failed to delete product.');
    } finally {
      setLoading(false);
    }
  };

  // Restore Product (Un-archive)
  const handleRestoreProduct = async (prodId: string, prodName: string) => {
    const isConfirmed = window.confirm(`Are you sure you want to restore product "${prodName}" to the active roster?`);
    if (!isConfirmed) return;

    try {
      setLoading(true);
      const productToEdit = products.find(p => p.id === prodId);
      if (!productToEdit) return;

      const currentUserName = localStorage.getItem('samira_current_user_name') || 'Admin';
      const originalHistory = productToEdit.history || [];
      const updatedHistory = [
        ...originalHistory,
        {
          date: new Date().toISOString().split('T')[0],
          action: 'RESTORED',
          user: currentUserName,
          details: `Product restored to active roster by ${currentUserName}`
        }
      ];

      const updatedProduct = {
        ...productToEdit,
        isDeleted: false,
        history: updatedHistory
      };

      await setDoc(doc(db, 'products', prodId), updatedProduct);
      alert(`Product "${prodName}" successfully restored to active roster.`);
      loadData();
    } catch (err) {
      console.error('Error restoring product:', err);
      alert('Failed to restore product.');
    } finally {
      setLoading(false);
    }
  };

  // Unique categories for filtering
  const categoriesList = Array.from(new Set(products.map(p => (p as any).category || 'General').filter(Boolean)));

  // Filtered Products Roster
  const filteredProducts = products.filter(p => {
    // Soft-delete filter
    const isDeletedMatch = showDeletedProducts ? p.isDeleted === true : !p.isDeleted;

    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.brand || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.sku || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.barcode || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesBrand = selectedBrandFilter ? p.companyId === selectedBrandFilter : true;
    const matchesCategory = selectedCategoryFilter ? ((p as any).category || 'General') === selectedCategoryFilter : true;

    // Status filter
    let matchesStatus = true;
    if (selectedFilterStatus === 'LOW_STOCK') {
      matchesStatus = p.stockCount <= (p.minimumStock || p.reorderLevel || 10);
    } else if (selectedFilterStatus === 'DAMAGE') {
      matchesStatus = (p.damageStock || 0) > 0;
    } else if (selectedFilterStatus === 'OUT_OF_STOCK') {
      matchesStatus = p.stockCount === 0;
    }

    return isDeletedMatch && matchesSearch && matchesBrand && matchesCategory && matchesStatus;
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
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => {
                  setImportFileName('');
                  setImportError(null);
                  setImportSuccess(null);
                  setParsedRecords([]);
                  setImportSummary(null);
                  setIsImportModalOpen(true);
                }}
                id="btn-bulk-import-inventory"
                className="flex items-center justify-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm cursor-pointer border border-slate-200"
              >
                <UploadCloud className="w-4 h-4 text-slate-500" />
                <span>Bulk Import (JSON)</span>
              </button>

              <button
                onClick={() => setIsAddProductModalOpen(true)}
                id="btn-add-product"
                className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Product</span>
              </button>
            </div>
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

      {/* Utilities & Quick Modals Trigger Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setBulkMinStockCategories([]);
            setBulkMinStockValue(5);
            setIsBulkMinStockModalOpen(true);
          }}
          className="flex items-center space-x-1.5 bg-amber-50/70 hover:bg-amber-100 text-amber-700 border border-amber-200/40 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
        >
          <span>📦 Bulk Update Minimum Stock</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setSimulateProductId('');
            setSimulateReplenishQty(50);
            setIsQrSimulateModalOpen(true);
          }}
          className="flex items-center space-x-1.5 bg-sky-50/70 hover:bg-sky-100 text-sky-700 border border-sky-200/40 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
        >
          <span>📷 Simulate QR Code Scanned</span>
        </button>
      </div>

      {/* Toolbar Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search catalog by name, brand, SKU or barcode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Brand Filter */}
        <div className="flex items-center space-x-2 min-w-[160px]">
          <Building2 className="w-4 h-4 text-gray-400" />
          <select
            value={selectedBrandFilter}
            onChange={(e) => setSelectedBrandFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none font-medium text-slate-700"
          >
            <option value="">All Brands / Suppliers</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Category Filter */}
        <div className="flex items-center space-x-2 min-w-[150px]">
          <Layers className="w-4 h-4 text-gray-400" />
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none font-medium text-slate-700"
          >
            <option value="">All Categories</option>
            {categoriesList.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center space-x-2 min-w-[150px]">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={selectedFilterStatus}
            onChange={(e) => setSelectedFilterStatus(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none font-medium text-slate-700"
          >
            <option value="ALL">All Stocks Status</option>
            <option value="LOW_STOCK">⚠️ Low Stock Alerts</option>
            <option value="DAMAGE">❌ Damage Stocks</option>
            <option value="OUT_OF_STOCK">🚨 Out Of Stock</option>
          </select>
        </div>

        {/* Active vs Soft-deleted Archive Toggle */}
        <div className="flex items-center space-x-2 border-l pl-4 border-slate-100">
          <label className="inline-flex items-center cursor-pointer space-x-2 text-xs font-bold text-slate-600">
            <input
              type="checkbox"
              checked={showDeletedProducts}
              onChange={(e) => setShowDeletedProducts(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
            />
            <span>Show Archived</span>
          </label>
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
          
          {/* Dynamic Bulk Action Bar */}
          {selectedProductIds.length > 0 && (
            <div className="bg-blue-50 border-b border-blue-100 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-center space-x-2">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                </span>
                <span className="text-xs font-black text-blue-800">
                  {selectedProductIds.length}টি পণ্য সিলেক্ট করা হয়েছে (Selected Products)
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBulkPriceIncreasePct(5);
                    setIsBulkPriceModalOpen(true);
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-[10px] uppercase tracking-wider cursor-pointer transition-all hover:scale-105"
                >
                  Percentage Price Increase
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBulkNewCategory('');
                    setIsBulkCategoryModalOpen(true);
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-[10px] uppercase tracking-wider cursor-pointer transition-all hover:scale-105"
                >
                  Category Reassignment
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedProductIds([])}
                  className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg text-[10px] cursor-pointer transition-all"
                >
                  Deselect All
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase text-[9px] font-extrabold tracking-wider border-b border-gray-100">
                  <th className="px-4 py-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredProducts.length > 0 && selectedProductIds.length === filteredProducts.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedProductIds(filteredProducts.map(p => p.id));
                        } else {
                          setSelectedProductIds([]);
                        }
                      }}
                      className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-5 py-4">Product Specs</th>
                  <th className="px-5 py-4">Brand / Category</th>
                  <th className="px-5 py-4 text-right">Purchase Price</th>
                  <th className="px-5 py-4 text-right">Wholesale / Sub-D</th>
                  <th className="px-5 py-4 text-right">Dealer / Retail</th>
                  <th className="px-5 py-4 text-center">Depot Stock Status</th>
                  <th className="px-5 py-4 text-center">Action Options</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredProducts.map(prod => {
                  const isLowStock = prod.stockCount <= (prod.minimumStock || prod.reorderLevel || 10);
                  const hasDamage = (prod.damageStock || 0) > 0;
                  const isOutOfStock = prod.stockCount === 0;

                  return (
                    <tr key={prod.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedProductIds.includes(prod.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProductIds(prev => [...prev, prod.id]);
                            } else {
                              setSelectedProductIds(prev => prev.filter(id => id !== prod.id));
                            }
                          }}
                          className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center space-x-3">
                          {prod.productImage ? (
                            <img src={prod.productImage} alt={prod.name} className="w-10 h-10 object-cover rounded-lg border border-slate-200" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-10 h-10 bg-slate-100 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 font-bold text-[10px]">
                              {prod.unit || 'PCS'}
                            </div>
                          )}
                          <div>
                            <p className="font-extrabold text-slate-900 text-xs">{prod.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                              SKU: <strong className="text-slate-600">{prod.sku || 'N/A'}</strong> | Barcode: <strong className="text-slate-600">{prod.barcode || 'N/A'}</strong>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-semibold text-slate-700 block">{prod.brand || prod.companyName}</span>
                        <span className="inline-block bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded text-[9px] uppercase font-mono mt-0.5">
                          {prod.category || 'General'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-slate-800">
                        <p className="font-bold">৳{prod.purchasePrice.toFixed(2)}</p>
                        <p className="text-[9px] text-slate-400">Ctn: ৳{prod.cartonPrice.toFixed(2)} ({prod.cartonSize} Pcs)</p>
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-slate-800">
                        <p className="font-bold">W: ৳{(prod.wholesalePrice || prod.purchasePrice * 1.05).toFixed(2)}</p>
                        <p className="text-[10px] text-indigo-600 font-medium">S-D: ৳{(prod.subDistributorPrice || prod.purchasePrice * 1.03).toFixed(2)}</p>
                      </td>
                      <td className="px-5 py-4 text-right font-mono">
                        <p className="font-bold text-slate-700">D: ৳{(prod.dealerPrice || prod.purchasePrice * 1.02).toFixed(2)}</p>
                        <p className="text-[10px] text-blue-600 font-extrabold">R: ৳{prod.retailPrice.toFixed(2)}</p>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex flex-col items-center justify-center space-y-1">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            isOutOfStock 
                              ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                              : isLowStock 
                                ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {prod.stockCount} {prod.unit || 'Pieces'} ({(prod.stockCount / prod.cartonSize).toFixed(1)} Ctn)
                          </span>
                          {hasDamage && (
                            <span className="inline-block bg-red-50 text-red-700 font-semibold px-2 py-0.5 rounded text-[9px] border border-red-100">
                              ⚠️ Damage: {prod.damageStock} Pcs
                            </span>
                          )}
                          {isLowStock && !isOutOfStock && (
                            <span className="text-[9px] text-amber-600 font-bold uppercase tracking-wider block">⚠️ Low stock alert</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            onClick={() => handleOpenEditProduct(prod)}
                            className="p-1.5 bg-slate-50 hover:bg-slate-100 text-blue-600 border border-slate-200 rounded-lg transition-all cursor-pointer"
                            title="Edit Specs & Adjust Inventory"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          
                          <button
                            onClick={() => {
                              setSelectedProductForHistory(prod);
                              setIsHistoryModalOpen(true);
                            }}
                            className="p-1.5 bg-slate-50 hover:bg-slate-100 text-indigo-600 border border-slate-200 rounded-lg transition-all cursor-pointer"
                            title="Audit Change History Log"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>

                          {prod.isDeleted ? (
                            <button
                              onClick={() => handleRestoreProduct(prod.id, prod.name)}
                              className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-lg transition-all cursor-pointer"
                              title="Restore archived product"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDeleteProduct(prod.id, prod.name)}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg transition-all cursor-pointer"
                              title="Soft Delete Product"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setIsAddProductModalOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <h3 className="text-lg font-extrabold text-gray-900 mb-1 flex items-center">
              <PlusCircle className="w-5 h-5 text-emerald-600 mr-2" />
              <span>Add New Product to Catalog</span>
            </h3>
            <p className="text-xs text-gray-400 mb-5">Define comprehensive FMCG distribution specs, barcodes, multi-level pricing grids, and alert safety bounds.</p>

            <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
              
              {/* SECTION 1: CORE IDENTITY */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">1. Product Identity & Branding</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Product Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Mojo Cola 250ml"
                      value={newProdName}
                      onChange={(e) => setNewProdName(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Category Group *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Beverages"
                      value={newProdCategory}
                      onChange={(e) => setNewProdCategory(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Supplier Entity *</label>
                    <select
                      required
                      value={newProdSupplierId}
                      onChange={(e) => setNewProdSupplierId(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold focus:outline-none text-slate-700"
                    >
                      <option value="">-- Select supplier / manufacturer --</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.companyName})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Brand Name (Lighter Identifier)</label>
                    <input
                      type="text"
                      placeholder="e.g. Akij Food"
                      value={newProdBrand}
                      onChange={(e) => setNewProdBrand(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: IDENTIFICATION & UNIT SPECS */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">2. Barcode scanner & Pack specification</p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">SKU Code (Auto-gen if empty)</label>
                    <input
                      type="text"
                      placeholder="e.g. BEV-MOJO-250"
                      value={newProdSku}
                      onChange={(e) => setNewProdSku(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono uppercase focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">EAN/Barcode (Scanner Field)</label>
                    <input
                      type="text"
                      placeholder="e.g. 894110012015"
                      value={newProdBarcode}
                      onChange={(e) => setNewProdBarcode(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Base Unit of Measure</label>
                    <select
                      value={newProdUnit}
                      onChange={(e) => setNewProdUnit(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold focus:outline-none text-slate-700"
                    >
                      <option value="Piece">Piece / Single (পিস)</option>
                      <option value="Bottle">Bottle (বোতল)</option>
                      <option value="Pack">Pack (প্যাকেট)</option>
                      <option value="Box">Box (বাক্স)</option>
                      <option value="Case">Case (কেস)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Carton Size (Base Units) *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={newProdCartonSize || ''}
                      onChange={(e) => setNewProdCartonSize(parseInt(e.target.value) || 12)}
                      className="w-full p-2.5 bg-white border border-emerald-200 rounded-xl font-black font-mono focus:outline-none text-center text-emerald-900"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: PRICING GRID */}
              <div className="bg-emerald-50/15 p-4 rounded-2xl border border-emerald-100 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800">3. FMCG Trade Pricing Matrix (Multi-Level Selling Tiers)</p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">Unit Purchase (DP) *</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      placeholder="৳"
                      value={newProdPurchasePrice || ''}
                      onChange={(e) => setNewProdPurchasePrice(parseFloat(e.target.value) || 0)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-black font-mono focus:outline-none text-right"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold text-indigo-700 uppercase mb-1">Wholesale Price (WP)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="৳"
                      value={newProdWholesalePrice || ''}
                      onChange={(e) => setNewProdWholesalePrice(parseFloat(e.target.value) || 0)}
                      className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-black font-mono focus:outline-none text-right text-indigo-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold text-blue-700 uppercase mb-1">Sub-Distributor Price</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="৳"
                      value={newProdSubDistributorPrice || ''}
                      onChange={(e) => setNewProdSubDistributorPrice(parseFloat(e.target.value) || 0)}
                      className="w-full p-2.5 bg-white border border-blue-200 rounded-xl font-black font-mono focus:outline-none text-right text-blue-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold text-amber-700 uppercase mb-1">Dealer Price (DP)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="৳"
                      value={newProdDealerPrice || ''}
                      onChange={(e) => setNewProdDealerPrice(parseFloat(e.target.value) || 0)}
                      className="w-full p-2.5 bg-white border border-amber-200 rounded-xl font-black font-mono focus:outline-none text-right text-amber-700"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[10px] font-extrabold text-emerald-800 uppercase mb-1">Retail MRP Selling *</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      placeholder="৳"
                      value={newProdRetailPrice || ''}
                      onChange={(e) => setNewProdRetailPrice(parseFloat(e.target.value) || 0)}
                      className="w-full p-2.5 bg-white border border-emerald-300 rounded-xl font-black font-mono focus:outline-none text-right text-emerald-900"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 4: STOCK LEVELS & ALERTS */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">4. Physical Inventory & Safety Bounds</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Opening Depot Stock</label>
                    <input
                      type="number"
                      min="0"
                      value={newProdOpeningStock || ''}
                      onChange={(e) => setNewProdOpeningStock(parseInt(e.target.value) || 0)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-black font-mono focus:outline-none text-right"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-red-500 uppercase mb-1">Initial Damage Stock</label>
                    <input
                      type="number"
                      min="0"
                      value={newProdDamageStock || ''}
                      onChange={(e) => setNewProdDamageStock(parseInt(e.target.value) || 0)}
                      className="w-full p-2.5 bg-white border border-red-200 rounded-xl font-black font-mono focus:outline-none text-right text-red-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-amber-600 uppercase mb-1">Minimum Alert Level</label>
                    <input
                      type="number"
                      min="1"
                      value={newProdMinimumStock || ''}
                      onChange={(e) => setNewProdMinimumStock(parseInt(e.target.value) || 5)}
                      className="w-full p-2.5 bg-white border border-amber-200 rounded-xl font-black font-mono focus:outline-none text-right text-amber-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-indigo-600 uppercase mb-1">Reorder Level (Units)</label>
                    <input
                      type="number"
                      min="1"
                      value={newProdReorderLevel || ''}
                      onChange={(e) => setNewProdReorderLevel(parseInt(e.target.value) || 10)}
                      className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-black font-mono focus:outline-none text-right text-indigo-700"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 5: MEDIA */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Product Image URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/photo-..."
                  value={newProdProductImage}
                  onChange={(e) => setNewProdProductImage(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium focus:outline-none"
                />
              </div>

              {/* ACTION BUTTONS */}
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
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setIsEditProductModalOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <h3 className="text-lg font-extrabold text-gray-900 mb-1 flex items-center">
              <Edit className="w-5 h-5 text-blue-600 mr-2" />
              <span>Edit Product Specifications & Stock</span>
            </h3>
            <p className="text-xs text-gray-400 mb-5">Amend specifications, modify multi-tier trade pricing schedules, or increase physical depot stock.</p>

            <form onSubmit={handleSaveEditedProduct} className="space-y-4 text-xs">
              
              {/* SECTION 1: IDENTITY */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">1. Product Identity & Branding</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Product Name *</label>
                    <input
                      type="text"
                      required
                      value={editProdName}
                      onChange={(e) => setEditProdName(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Category Group *</label>
                    <input
                      type="text"
                      required
                      value={editProdCategory}
                      onChange={(e) => setEditProdCategory(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Supplier Entity *</label>
                    <select
                      required
                      value={editProdSupplierId}
                      onChange={(e) => setEditProdSupplierId(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold focus:outline-none text-slate-700"
                    >
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.companyName})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Brand Name</label>
                    <input
                      type="text"
                      value={editProdBrand}
                      onChange={(e) => setEditProdBrand(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: SPECS */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">2. Barcode scanner & Pack specification</p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">SKU Code</label>
                    <input
                      type="text"
                      value={editProdSku}
                      onChange={(e) => setEditProdSku(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono uppercase focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">EAN/Barcode</label>
                    <input
                      type="text"
                      value={editProdBarcode}
                      onChange={(e) => setEditProdBarcode(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Base Unit</label>
                    <select
                      value={editProdUnit}
                      onChange={(e) => setEditProdUnit(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold focus:outline-none text-slate-700"
                    >
                      <option value="Piece">Piece / Single (পিস)</option>
                      <option value="Bottle">Bottle (বোতল)</option>
                      <option value="Pack">Pack (প্যাকেট)</option>
                      <option value="Box">Box (বাক্স)</option>
                      <option value="Case">Case (কেস)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Carton Size (Units) *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={editProdCartonSize}
                      onChange={(e) => setEditProdCartonSize(parseInt(e.target.value) || 12)}
                      className="w-full p-2.5 bg-white border border-emerald-200 rounded-xl font-black font-mono focus:outline-none text-center text-emerald-900"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: PRICING GRID */}
              <div className="bg-emerald-50/15 p-4 rounded-2xl border border-emerald-100 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800">3. Trade Pricing Matrix (Multi-Level Selling Tiers)</p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">Unit Purchase (DP) *</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={editProdPurchasePrice || ''}
                      onChange={(e) => setEditProdPurchasePrice(parseFloat(e.target.value) || 0)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-black font-mono focus:outline-none text-right"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold text-indigo-700 uppercase mb-1">Wholesale Price (WP)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editProdWholesalePrice || ''}
                      onChange={(e) => setEditProdWholesalePrice(parseFloat(e.target.value) || 0)}
                      className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-black font-mono focus:outline-none text-right text-indigo-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold text-blue-700 uppercase mb-1">Sub-Distributor Price</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editProdSubDistributorPrice || ''}
                      onChange={(e) => setEditProdSubDistributorPrice(parseFloat(e.target.value) || 0)}
                      className="w-full p-2.5 bg-white border border-blue-200 rounded-xl font-black font-mono focus:outline-none text-right text-blue-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold text-amber-700 uppercase mb-1">Dealer Price (DP)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editProdDealerPrice || ''}
                      onChange={(e) => setEditProdDealerPrice(parseFloat(e.target.value) || 0)}
                      className="w-full p-2.5 bg-white border border-amber-200 rounded-xl font-black font-mono focus:outline-none text-right text-amber-700"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[10px] font-extrabold text-emerald-800 uppercase mb-1">Retail MRP Selling *</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={editProdRetailPrice || ''}
                      onChange={(e) => setEditProdRetailPrice(parseFloat(e.target.value) || 0)}
                      className="w-full p-2.5 bg-white border border-emerald-300 rounded-xl font-black font-mono focus:outline-none text-right text-emerald-900"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 4: INVENTORY LEVELS & ALERTS */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">4. Inventory Balances & Alerts</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Current Active Depot Stock</label>
                    <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl font-black text-slate-700 text-right font-mono">
                      {selectedProductForEdit.stockCount} Pcs ({(selectedProductForEdit.stockCount / editProdCartonSize).toFixed(1)} Ctn)
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-red-500 uppercase mb-1">Damage / Return Claims</label>
                    <input
                      type="number"
                      min="0"
                      value={editProdDamageStock}
                      onChange={(e) => setEditProdDamageStock(parseInt(e.target.value) || 0)}
                      className="w-full p-2.5 bg-white border border-red-200 rounded-xl font-black font-mono focus:outline-none text-right text-red-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-amber-600 uppercase mb-1">Minimum Alert Level</label>
                    <input
                      type="number"
                      min="1"
                      value={editProdMinimumStock}
                      onChange={(e) => setEditProdMinimumStock(parseInt(e.target.value) || 5)}
                      className="w-full p-2.5 bg-white border border-amber-200 rounded-xl font-black font-mono focus:outline-none text-right text-amber-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-indigo-600 uppercase mb-1">Reorder Point</label>
                    <input
                      type="number"
                      min="1"
                      value={editProdReorderLevel}
                      onChange={(e) => setEditProdReorderLevel(parseInt(e.target.value) || 10)}
                      className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-black font-mono focus:outline-none text-right text-indigo-700"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 5: IMAGE */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Pack Spec Format</label>
                  <input
                    type="text"
                    value={editProdPackSize}
                    onChange={(e) => setEditProdPackSize(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Product Image URL</label>
                  <input
                    type="url"
                    value={editProdProductImage}
                    onChange={(e) => setEditProdProductImage(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                  />
                </div>
              </div>

              {/* INCREMENTAL STOCK ADDER */}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black text-slate-800 uppercase flex items-center">
                    <Warehouse className="w-4 h-4 text-emerald-600 mr-1" />
                    <span>স্টক ও রিটার্ন অ্যাডজাস্টমেন্ট প্যানেল (Stock & Returns Adjustment)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsIncreaseStockOpen(!isIncreaseStockOpen)}
                    className="text-[10px] font-extrabold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                  >
                    {isIncreaseStockOpen ? 'ফর্ম লুকান (Hide)' : 'প্যানেল খুলুন (Open Panel)'}
                  </button>
                </div>

                {isIncreaseStockOpen && (
                  <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">অপারেশন টাইপ (Operation Type)</label>
                        <select
                          value={adjustType}
                          onChange={(e) => setAdjustType(e.target.value as any)}
                          className="w-full p-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-800 focus:outline-none"
                        >
                          <option value="ADD">নতুন স্টক যোগ করুন (Add Depot Stock)</option>
                          <option value="SALES_RETURN">সেলস রিটার্ন / গ্রাহক ফেরত (Sales Return)</option>
                          <option value="DAMAGE_RETURN">ড্যামেজ রিটার্ন (Damage Return directly from market)</option>
                          <option value="WRITE_OFF_DAMAGE">ডিপো ড্যামেজ স্থানান্তর (Move Depot Stock to Damage)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">মন্তব্য / বিবরণ (Reason / Details)</label>
                        <input
                          type="text"
                          placeholder="রিটার্ন মেমো নং বা স্টক এন্ট্রি মন্তব্য..."
                          value={adjustRemarks}
                          onChange={(e) => setAdjustRemarks(e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 rounded text-xs focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div>
                        <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">কার্টুন পরিমাণ (Cartons)</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={increaseCtn || ''}
                          onChange={(e) => setIncreaseCtn(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full p-2.5 bg-white border border-emerald-200 rounded-xl font-black font-mono focus:outline-none text-center text-emerald-900"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">পিস পরিমাণ (Loose Pieces)</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={increasePcs || ''}
                          onChange={(e) => setIncreasePcs(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full p-2.5 bg-white border border-emerald-200 rounded-xl font-black font-mono focus:outline-none text-center text-emerald-900"
                        />
                      </div>
                      
                      <div className="col-span-2 text-right text-[10px] text-emerald-700 font-extrabold bg-emerald-50/25 px-3 py-1.5 rounded-lg border border-emerald-100">
                        {adjustType === 'ADD' && `ডিপো স্টকে যোগ হবে: ${(increaseCtn * editProdCartonSize) + increasePcs} পিস`}
                        {adjustType === 'SALES_RETURN' && `সেলস রিটার্ন (স্টকে যোগ হবে): ${(increaseCtn * editProdCartonSize) + increasePcs} পিস`}
                        {adjustType === 'DAMAGE_RETURN' && `ড্যামেজ স্টকে যোগ হবে: ${(increaseCtn * editProdCartonSize) + increasePcs} পিস`}
                        {adjustType === 'WRITE_OFF_DAMAGE' && `সক্রিয় স্টক থেকে বাদ দিয়ে ড্যামেজ স্টকে যাবে: ${(increaseCtn * editProdCartonSize) + increasePcs} পিস`}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ACTION BUTTONS */}
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
                  Save & Update Product Specifications
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- MODAL: AUDIT HISTORY LOG ---------------- */}
      {isHistoryModalOpen && selectedProductForHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-xl relative max-h-[85vh] flex flex-col">
            <button 
              onClick={() => {
                setIsHistoryModalOpen(false);
                setSelectedProductForHistory(null);
              }} 
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <div className="mb-4">
              <h3 className="text-lg font-extrabold text-gray-900 mb-1 flex items-center">
                <History className="w-5 h-5 text-indigo-600 mr-2" />
                <span>Audit History & Operations Log</span>
              </h3>
              <p className="text-xs text-gray-400">
                Detailed transaction log and updates for product: <strong className="text-slate-700">{selectedProductForHistory.name}</strong>
              </p>
            </div>

            {/* History Table/List */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-3 max-h-[50vh]">
              {!selectedProductForHistory.history || selectedProductForHistory.history.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  No audit history records available for this product.
                </div>
              ) : (
                selectedProductForHistory.history.map((log: any, idx: number) => (
                  <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs flex flex-col space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded font-black text-[9px] ${
                        log.action === 'CREATED' 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : log.action === 'SOFT_DELETED' 
                            ? 'bg-rose-100 text-rose-800' 
                            : log.action === 'RESTORED' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-amber-100 text-amber-800'
                      }`}>
                        {log.action}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">{log.date}</span>
                    </div>
                    <p className="text-slate-700 font-medium leading-relaxed">{log.details}</p>
                    <div className="text-[10px] text-slate-400 text-right mt-1 font-semibold">
                      Operator: <span className="text-slate-600 font-bold">{log.user || 'Unknown'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 border-t flex justify-end mt-4">
              <button
                type="button"
                onClick={() => {
                  setIsHistoryModalOpen(false);
                  setSelectedProductForHistory(null);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2 rounded-xl cursor-pointer text-xs transition-colors"
              >
                Close Audit Logs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- MODAL: BULK IMPORT (JSON) ---------------- */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto" id="bulk-import-modal">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-xl relative max-h-[90vh] flex flex-col">
            <button 
              onClick={() => setIsImportModalOpen(false)} 
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 cursor-pointer"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <div className="mb-4">
              <h3 className="text-lg font-extrabold text-gray-900 mb-1 flex items-center">
                <UploadCloud className="w-5 h-5 text-blue-600 mr-2" />
                <span>Bulk Import & Stock Update (JSON)</span>
              </h3>
              <p className="text-xs text-gray-400">
                Upload a prepared JSON file to quickly update stock quantities, modify specifications, or register new items into the distributing roster.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              
              {/* Dropzone area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/40'
                    : importFileName
                    ? 'border-emerald-200 bg-emerald-50/10'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/40'
                }`}
              >
                <input
                  type="file"
                  id="bulk-product-file-input"
                  accept=".json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                
                <label htmlFor="bulk-product-file-input" className="cursor-pointer block space-y-2">
                  <UploadCloud className={`w-10 h-10 mx-auto ${importFileName ? 'text-emerald-500' : 'text-slate-400'}`} />
                  <div>
                    <p className="text-xs font-bold text-slate-700">
                      {importFileName ? `Selected: ${importFileName}` : 'Drag & Drop your prepared products .json file here'}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">or click to browse your local device storage</p>
                  </div>
                </label>
              </div>

              {/* Status & Validation Message Areas */}
              {importError && (
                <div className="bg-rose-50 border border-rose-100 text-rose-700 p-3.5 rounded-xl text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="font-medium leading-tight">{importError}</p>
                </div>
              )}

              {importSuccess && (
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-3.5 rounded-xl text-xs flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                  <p className="font-bold leading-tight">{importSuccess}</p>
                </div>
              )}

              {parsedRecords.length > 0 && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center space-x-1">
                      <Check className="w-4 h-4 text-emerald-600 font-bold" />
                      <span>Validated Products: {parsedRecords.length} records ready</span>
                    </span>
                    <span className="text-blue-600">
                      ({importSummary?.updated} Updates, {importSummary?.created} New Products)
                    </span>
                  </div>

                  {/* Previews scrollable section */}
                  <div className="max-h-36 overflow-y-auto border border-slate-150 rounded-lg bg-white divide-y divide-slate-100 font-mono text-[10px]">
                    {parsedRecords.slice(0, 15).map((rec, idx) => (
                      <div key={idx} className="p-2 flex items-center justify-between">
                        <div className="truncate pr-4 font-semibold text-slate-700">
                          {rec.data.name}
                        </div>
                        <div className="shrink-0 flex items-center space-x-2">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                            rec.action === 'UPDATE' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {rec.action}
                          </span>
                          <span className="text-slate-500 font-bold">
                            Stock: {rec.data.stockCount} Pcs
                          </span>
                        </div>
                      </div>
                    ))}
                    {parsedRecords.length > 15 && (
                      <div className="p-2 text-center text-[9px] text-slate-400 font-bold bg-slate-50">
                        ...and {parsedRecords.length - 15} more records to parse.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Sample Template Section */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500">JSON Template & Format Guidelines</h4>
                  <button 
                    type="button"
                    onClick={() => {
                      const template = `[
  {
    "name": "Mojo Cola 250ml",
    "stockCount": 120,
    "purchasePrice": 12.5,
    "retailPrice": 15,
    "sku": "BEV-MOJO-250",
    "barcode": "894110012015"
  },
  {
    "name": "Super Fresh Water 500ml",
    "stockCount": 240,
    "purchasePrice": 10,
    "retailPrice": 12,
    "sku": "WAT-SF-500",
    "barcode": "894110012018"
  }
]`;
                      navigator.clipboard.writeText(template);
                      alert('JSON template copied to clipboard!');
                    }}
                    className="text-[10px] text-blue-600 font-bold hover:underline cursor-pointer"
                  >
                    Copy Template
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  The tool automatically matches products by <strong>exact name, barcode, or SKU code</strong> to overwrite active inventory values. Missing products can be created on-the-fly if both <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[9px]">purchasePrice</code> and <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[9px]">retailPrice</code> are provided.
                </p>
                <pre className="p-2 bg-slate-900 text-blue-400 rounded-lg text-[9px] font-mono overflow-x-auto max-h-28">
{`[
  {
    "name": "Mojo Cola 250ml",
    "stockCount": 120,
    "purchasePrice": 12.5,
    "retailPrice": 15,
    "sku": "BEV-MOJO-250",
    "barcode": "894110012015"
  }
]`}
                </pre>
              </div>

            </div>

            {/* Actions Footer */}
            <div className="pt-4 border-t flex justify-between items-center mt-4">
              <button
                type="button"
                onClick={() => {
                  setParsedRecords([]);
                  setImportSummary(null);
                  setImportFileName('');
                  setImportError(null);
                  setImportSuccess(null);
                }}
                className="text-xs text-rose-600 hover:underline font-bold"
                disabled={parsedRecords.length === 0}
              >
                Reset List
              </button>
              
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleExecuteBulkImport}
                  disabled={parsedRecords.length === 0 || isImporting}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center space-x-2 cursor-pointer shadow-md"
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Writing Records...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Execute Bulk Import</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Bulk Update Minimum Stock level for selected categories */}
      {isBulkMinStockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-5 text-slate-800">
            <button 
              onClick={() => setIsBulkMinStockModalOpen(false)} 
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">
                Bulk Update Minimum Stock (মিনিমাম স্টক আপডেট)
              </h3>
              <p className="text-xs text-slate-500 font-medium">Select product categories and specify the default minimum stock alert level in bulk.</p>
            </div>

            <form onSubmit={handleBulkUpdateMinStock} className="space-y-4">
              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-500 mb-2 tracking-wider">Select Categories *</label>
                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-1.5">
                  {categoriesList.map(cat => (
                    <label key={cat} className="flex items-center space-x-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bulkMinStockCategories.includes(cat)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setBulkMinStockCategories(prev => [...prev, cat]);
                          } else {
                            setBulkMinStockCategories(prev => prev.filter(c => c !== cat));
                          }
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                      />
                      <span>{cat}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-500 mb-1.5 tracking-wider">Minimum Stock Value (পিস পরিমাণ)</label>
                <input
                  type="number"
                  min="0"
                  required
                  placeholder="5"
                  value={bulkMinStockValue}
                  onChange={(e) => setBulkMinStockValue(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsBulkMinStockModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs cursor-pointer transition-all shadow-md"
                >
                  Update Minimum Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Bulk Percentage Price Increase */}
      {isBulkPriceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-5 text-slate-800">
            <button 
              onClick={() => setIsBulkPriceModalOpen(false)} 
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">
                Percentage Price Increase (দাম বৃদ্ধি করুন)
              </h3>
              <p className="text-xs text-slate-500 font-medium">Apply a percentage price increase across all {selectedProductIds.length} selected items.</p>
            </div>

            <form onSubmit={handleBulkPriceIncrease} className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-800 font-semibold leading-relaxed">
                ⚠️ This action will modify purchase, retail (MRP), wholesale, sub-distributor, and dealer price margins for the selected items. It cannot be undone automatically.
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-500 mb-1.5 tracking-wider">Percentage Increase (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    required
                    placeholder="5.0"
                    value={bulkPriceIncreasePct || ''}
                    onChange={(e) => setBulkPriceIncreasePct(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none pr-8"
                  />
                  <span className="absolute right-3 top-3 text-xs font-bold text-slate-400">%</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsBulkPriceModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs cursor-pointer transition-all shadow-md"
                >
                  Apply Price Increase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Bulk Category Reassignment */}
      {isBulkCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-5 text-slate-800">
            <button 
              onClick={() => setIsBulkCategoryModalOpen(false)} 
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">
                Category Reassignment (ক্যাটাগরি রিঅ্যাসাইন)
              </h3>
              <p className="text-xs text-slate-500 font-medium">Reassign {selectedProductIds.length} products to a new or existing category simultaneously.</p>
            </div>

            <form onSubmit={handleBulkCategoryReassign} className="space-y-4">
              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-500 mb-1.5 tracking-wider">New Category Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Energy Drinks, Cosmetics"
                  value={bulkNewCategory}
                  onChange={(e) => setBulkNewCategory(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wide mb-1.5">Or Choose From Existing Categories</label>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {categoriesList.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setBulkNewCategory(cat)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[10px] cursor-pointer"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsBulkCategoryModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs cursor-pointer transition-all shadow-md"
                >
                  Reassign Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: QR Code Scan Simulation Panel */}
      {isQrSimulateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-5 text-slate-800">
            <button 
              onClick={() => setIsQrSimulateModalOpen(false)} 
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">
                📷 Simulate QR Code Scan (স্টক বাড়ানোর কিউআর সিমুলেটর)
              </h3>
              <p className="text-xs text-slate-500 font-medium">Simulate scanning a product QR/barcode block during delivery replenishment flows.</p>
            </div>

            <form onSubmit={handleExecuteMockScanReplenish} className="space-y-4">
              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-500 mb-1.5 tracking-wider">Select Product to Scan *</label>
                <select
                  required
                  value={simulateProductId}
                  onChange={(e) => setSimulateProductId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none"
                >
                  <option value="">Choose compatible product</option>
                  {products.filter(p => !p.isDeleted).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (ID: {p.id.substr(0, 8)}... | Barcode: {p.barcode || 'N/A'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-500 mb-1.5 tracking-wider">Replenishment Quantity (Pcs)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={simulateReplenishQty}
                  onChange={(e) => setSimulateReplenishQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl text-[10px] font-bold">
                💡 This simulates scanning a delivery crate barcode. The system instantly detects the product and increments central depot stock count without opening your camera feed.
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsQrSimulateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs cursor-pointer transition-all shadow-md"
                >
                  Trigger Simulation Scan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
