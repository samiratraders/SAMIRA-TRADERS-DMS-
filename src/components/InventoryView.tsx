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
  Eye
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
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase text-[9px] font-extrabold tracking-wider border-b border-gray-100">
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

    </div>
  );
}
