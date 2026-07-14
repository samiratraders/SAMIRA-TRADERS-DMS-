/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  FileText, 
  Printer, 
  DollarSign, 
  ShoppingBag, 
  Users, 
  Warehouse, 
  Truck, 
  Building2, 
  UserCheck, 
  Coins, 
  Calendar,
  RefreshCw,
  ArrowUpDown,
  Filter,
  ArrowUpRight,
  BarChart2
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  SalesInvoice, 
  Collection, 
  Customer, 
  Product, 
  Expense, 
  Supplier, 
  Company, 
  SubDepotTransaction,
  CustomerLedgerEntry,
  Purchase
} from '../types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend, 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';

export default function ReportsView() {
  const [activeReport, setActiveReport] = useState<'sales' | 'collection' | 'stock' | 'profit' | 'expense' | 'dsr' | 'valuation' | 'ledger' | 'supplier'>('profit');
  const [loading, setLoading] = useState(true);

  // Raw data stores
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [subTrans, setSubTrans] = useState<SubDepotTransaction[]>([]);
  const [ledgers, setLedgers] = useState<CustomerLedgerEntry[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  // Filters State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedRepName, setSelectedRepName] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  // Sorting State
  const [sortField, setSortField] = useState<string>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Derived filtered & sorted data
  const filteredInvoices = invoices.filter(inv => {
    if (startDate && inv.date < startDate) return false;
    if (endDate && inv.date > endDate) return false;
    if (selectedCustomerId && inv.customerId !== selectedCustomerId) return false;
    if (selectedCompanyId && inv.companyId !== selectedCompanyId) return false;
    if (selectedRepName && inv.dsrName !== selectedRepName) return false;
    if (selectedProductId && !inv.items.some(item => item.productId === selectedProductId)) return false;
    if (selectedArea && inv.area !== selectedArea && inv.route !== selectedArea) return false;
    if (selectedCategory && !inv.items.some(item => {
      const prod = products.find(p => p.id === item.productId);
      return (prod?.category || 'General') === selectedCategory;
    })) return false;
    return true;
  });

  const sortedInvoices = [...filteredInvoices].sort((a, b) => {
    let valA: any = a[sortField as keyof SalesInvoice];
    let valB: any = b[sortField as keyof SalesInvoice];

    if (sortField === 'due') {
      valA = a.grandTotal - a.paymentReceived;
      valB = b.grandTotal - b.paymentReceived;
    }

    if (valA === undefined) valA = '';
    if (valB === undefined) valB = '';

    if (typeof valA === 'string') {
      return sortDirection === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    }
    return sortDirection === 'asc' ? valA - valB : valB - valA;
  });

  const filteredCollections = collections.filter(col => {
    if (startDate && col.date < startDate) return false;
    if (endDate && col.date > endDate) return false;
    if (selectedCustomerId && col.customerId !== selectedCustomerId) return false;
    if (selectedCompanyId && col.companyId !== selectedCompanyId) return false;
    if (selectedRepName && col.collectedByName !== selectedRepName) return false;
    if (selectedArea && col.area !== selectedArea && col.route !== selectedArea) return false;
    if (selectedCategory) {
      const custInvoices = invoices.filter(i => i.customerId === col.customerId);
      const hasCategoryPurchase = custInvoices.some(inv => 
        inv.items.some(item => {
          const prod = products.find(p => p.id === item.productId);
          return (prod?.category || 'General') === selectedCategory;
        })
      );
      if (!hasCategoryPurchase) return false;
    }
    return true;
  });

  const sortedCollections = [...filteredCollections].sort((a, b) => {
    let valA: any = a[sortField as keyof Collection];
    let valB: any = b[sortField as keyof Collection];

    if (valA === undefined) valA = '';
    if (valB === undefined) valB = '';

    if (typeof valA === 'string') {
      return sortDirection === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    }
    return sortDirection === 'asc' ? valA - valB : valB - valA;
  });

  const filteredExpenses = expenses.filter(exp => {
    if (startDate && exp.date < startDate) return false;
    if (endDate && exp.date > endDate) return false;
    if (selectedRepName && exp.staffName !== selectedRepName) return false;
    if (selectedArea && !(
      (exp.description && exp.description.toLowerCase().includes(selectedArea.toLowerCase())) ||
      (exp.routeName && exp.routeName.toLowerCase().includes(selectedArea.toLowerCase()))
    )) return false;
    return true;
  });

  const sortedExpenses = [...filteredExpenses].sort((a, b) => {
    let valA: any = a[sortField as keyof Expense];
    let valB: any = b[sortField as keyof Expense];

    if (valA === undefined) valA = '';
    if (valB === undefined) valB = '';

    if (typeof valA === 'string') {
      return sortDirection === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    }
    return sortDirection === 'asc' ? valA - valB : valB - valA;
  });

  const filteredSubTrans = subTrans.filter(t => {
    if (startDate && t.date < startDate) return false;
    if (endDate && t.date > endDate) return false;
    return true;
  });

  const filteredLedgers = ledgers.filter(entry => {
    if (startDate && entry.date < startDate) return false;
    if (endDate && entry.date > endDate) return false;
    if (selectedCustomerId && entry.customerId !== selectedCustomerId) return false;
    if (selectedCompanyId && entry.companyId !== selectedCompanyId) return false;
    if (selectedArea) {
      const custObj = customers.find(c => c.id === entry.customerId);
      if (!custObj || (custObj.area !== selectedArea && custObj.route !== selectedArea)) return false;
    }
    if (selectedCategory && entry.type === 'INVOICE') {
      const invObj = invoices.find(i => i.id === entry.referenceId || i.invoiceNo === entry.referenceNo);
      if (invObj) {
        const hasCategory = invObj.items.some(item => {
          const prod = products.find(p => p.id === item.productId);
          return (prod?.category || 'General') === selectedCategory;
        });
        if (!hasCategory) return false;
      } else {
        return false;
      }
    }
    return true;
  });

  const sortedLedgers = [...filteredLedgers].sort((a, b) => {
    let valA: any = a[sortField as keyof CustomerLedgerEntry];
    let valB: any = b[sortField as keyof CustomerLedgerEntry];

    if (valA === undefined) valA = '';
    if (valB === undefined) valB = '';

    if (typeof valA === 'string') {
      return sortDirection === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    }
    return sortDirection === 'asc' ? valA - valB : valB - valA;
  });

  const filteredPurchases = purchases.filter(pur => {
    if (startDate && pur.date < startDate) return false;
    if (endDate && pur.date > endDate) return false;
    if (selectedCompanyId && pur.companyId !== selectedCompanyId) return false;
    if (selectedProductId && !pur.items.some(item => item.productId === selectedProductId)) return false;
    if (selectedCategory && !pur.items.some(item => {
      const prod = products.find(p => p.id === item.productId);
      return (prod?.category || 'General') === selectedCategory;
    })) return false;
    return true;
  });

  const sortedPurchases = [...filteredPurchases].sort((a, b) => {
    let valA: any = a[sortField as keyof Purchase];
    let valB: any = b[sortField as keyof Purchase];

    if (valA === undefined) valA = '';
    if (valB === undefined) valB = '';

    if (typeof valA === 'string') {
      return sortDirection === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    }
    return sortDirection === 'asc' ? valA - valB : valB - valA;
  });

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [
        salesSnap,
        colSnap,
        custSnap,
        prodSnap,
        expSnap,
        supSnap,
        compSnap,
        sdtSnap,
        ledgerSnap,
        purchaseSnap
      ] = await Promise.all([
        getDocs(collection(db, 'sales')),
        getDocs(collection(db, 'collections')),
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'expenses')),
        getDocs(collection(db, 'suppliers')),
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'subDepotTransactions')),
        getDocs(collection(db, 'ledgers')),
        getDocs(collection(db, 'purchases'))
      ]);

      const salesList: SalesInvoice[] = [];
      salesSnap.forEach(d => salesList.push(d.data() as SalesInvoice));
      setInvoices(salesList);

      const colList: Collection[] = [];
      colSnap.forEach(d => colList.push(d.data() as Collection));
      setCollections(colList);

      const custList: Customer[] = [];
      custSnap.forEach(d => custList.push(d.data() as Customer));
      setCustomers(custList);

      const prodList: Product[] = [];
      prodSnap.forEach(d => prodList.push(d.data() as Product));
      setProducts(prodList);

      const expList: Expense[] = [];
      expSnap.forEach(d => expList.push(d.data() as Expense));
      setExpenses(expList);

      const supList: Supplier[] = [];
      supSnap.forEach(d => supList.push(d.data() as Supplier));
      setSuppliers(supList);

      const compList: Company[] = [];
      compSnap.forEach(d => compList.push(d.data() as Company));
      setCompanies(compList);

      const sdtList: SubDepotTransaction[] = [];
      sdtSnap.forEach(d => sdtList.push(d.data() as SubDepotTransaction));
      setSubTrans(sdtList);

      const ledgList: CustomerLedgerEntry[] = [];
      ledgerSnap.forEach(d => ledgList.push(d.data() as CustomerLedgerEntry));
      setLedgers(ledgList);

      const purList: Purchase[] = [];
      purchaseSnap.forEach(d => purList.push(d.data() as Purchase));
      setPurchases(purList);

    } catch (err) {
      console.error('Error loading reports data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
        <p className="text-sm text-gray-500">Compiling statistics databases...</p>
      </div>
    );
  }

  // --- REPORT GENERATION HELPERS ---

  // Profit Calculation helper
  const getProfitReport = () => {
    let totalSalesRevenue = filteredInvoices.reduce((sum, i) => sum + i.grandTotal, 0);
    
    // Calculate Cost of Goods Sold (COGS)
    let cogs = 0;
    filteredInvoices.forEach(inv => {
      inv.items.forEach(item => {
        const prod = products.find(p => p.id === item.productId);
        if (prod) {
          cogs += item.qty * prod.purchasePrice;
        } else {
          cogs += item.qty * (item.price * 0.85); // fallback estimate
        }
      });
    });

    const salesMargin = totalSalesRevenue - cogs;
    
    // Sub depot commissions (other income!)
    const subdepotCommissionIncome = filteredSubTrans.reduce((sum, t) => sum + (t.commissionEarned || 0), 0);
    
    // Expenses
    const totalExp = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    const netProfit = salesMargin + subdepotCommissionIncome - totalExp;

    return {
      totalSalesRevenue,
      cogs,
      salesMargin,
      subdepotCommissionIncome,
      totalExp,
      netProfit
    };
  };

  const profitData = getProfitReport();

  // Valuation helper calculations
  const isValuationFiltered = !!(startDate || endDate);
  const targetSalesInvoices = isValuationFiltered 
    ? filteredInvoices 
    : invoices.filter(inv => inv.date === new Date().toISOString().split('T')[0]);
  const valuationSalesVal = targetSalesInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
  const valuationDamageVal = products.reduce((sum, p) => {
    if (selectedCompanyId && p.companyId !== selectedCompanyId) return sum;
    if (selectedProductId && p.id !== selectedProductId) return sum;
    return sum + ((p.damageStock || 0) * p.purchasePrice);
  }, 0);
  const valuationClosingVal = products.reduce((sum, p) => {
    if (selectedCompanyId && p.companyId !== selectedCompanyId) return sum;
    if (selectedProductId && p.id !== selectedProductId) return sum;
    return sum + (p.stockCount * p.purchasePrice);
  }, 0);

  const SortHeader = ({ field, label, alignClass = "" }: { field: string; label: string; alignClass?: string }) => {
    const isSorted = sortField === field;
    return (
      <th 
        onClick={() => toggleSort(field)}
        className={`p-3 cursor-pointer hover:bg-slate-100 transition-colors select-none print:pointer-events-none ${alignClass}`}
      >
        <div className={`flex items-center space-x-1.5 ${alignClass.includes('right') ? 'justify-end' : ''}`}>
          <span>{label}</span>
          <ArrowUpDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isSorted ? 'text-blue-600' : 'text-slate-300 print:hidden'}`} />
        </div>
      </th>
    );
  };

  const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

  const getSalesChartData = () => {
    const daily: { [date: string]: number } = {};
    filteredInvoices.forEach(inv => {
      daily[inv.date] = (daily[inv.date] || 0) + inv.grandTotal;
    });
    return Object.keys(daily).sort().map(date => ({
      date,
      'Sales Volume': daily[date]
    }));
  };

  const getCollectionChartData = () => {
    const repData: { [rep: string]: number } = {};
    filteredCollections.forEach(col => {
      const rep = col.collectedByName || 'Unknown';
      repData[rep] = (repData[rep] || 0) + col.amount;
    });
    return Object.keys(repData).map(rep => ({
      rep,
      'Collected (৳)': repData[rep]
    }));
  };

  const getStockChartData = () => {
    const brandData: { [brand: string]: number } = {};
    products.forEach(p => {
      const val = p.purchasePrice * p.stockCount;
      if (selectedCompanyId && p.companyId !== selectedCompanyId) return;
      if (selectedProductId && p.id !== selectedProductId) return;
      const brand = p.companyName || 'Generic';
      brandData[brand] = (brandData[brand] || 0) + val;
    });
    return Object.keys(brandData).map(brand => ({
      brand,
      'Valuation (৳)': brandData[brand]
    }));
  };

  const getExpenseChartData = () => {
    const catData: { [cat: string]: number } = {};
    filteredExpenses.forEach(exp => {
      catData[exp.category] = (catData[exp.category] || 0) + exp.amount;
    });
    return Object.keys(catData).map(cat => ({
      name: cat,
      value: catData[cat]
    }));
  };

  const getPLChartData = () => {
    return [
      { name: 'Revenue', amount: profitData.totalSalesRevenue },
      { name: 'COGS', amount: profitData.cogs },
      { name: 'Margin', amount: profitData.salesMargin },
      { name: 'Expenses', amount: profitData.totalExp },
      { name: 'Net Profit', amount: profitData.netProfit }
    ];
  };

  return (
    <div className="space-y-6" id="reports-module">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Business Reports Suite</h2>
          <p className="text-sm text-gray-500">Generate, audit, and print complete distribution performance reports</p>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>Print/Save PDF Report</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-gray-100 gap-1 bg-white p-1 rounded-xl shadow-sm border print:hidden">
        {[
          { id: 'profit', label: 'Profit & Loss', icon: TrendingUp },
          { id: 'sales', label: 'Sales Journal', icon: FileText },
          { id: 'collection', label: 'Cash Collections', icon: Coins },
          { id: 'ledger', label: 'Customer Ledgers', icon: Users },
          { id: 'supplier', label: 'Supplier Purchases', icon: Truck },
          { id: 'stock', label: 'Depot Stock', icon: Warehouse },
          { id: 'expense', label: 'Expenses Summary', icon: FileText },
          { id: 'dsr', label: 'DSR Sheets', icon: UserCheck },
          { id: 'valuation', label: 'Inventory Valuation', icon: Warehouse },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeReport === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveReport(tab.id as any);
                setSortField('date');
                setSortDirection('desc');
              }}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Global Filter Panel */}
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4 print:hidden" id="global-reports-filters">
        <div className="flex items-center space-x-3 text-slate-700">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <Filter className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Advanced Report Filters</h4>
            <p className="text-xs text-gray-400">Apply multi-criteria filtering across customer outlets, product categories, brands, and sales reps.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          {/* Date range from */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Date range to */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Customer filter */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Customer / Outlet</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-gray-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Customer Outlets</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.shopName}</option>
              ))}
            </select>
          </div>

          {/* Product filter */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Product Filter</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-gray-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Products</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Sales Representative filter */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sales Rep (DSR)</label>
            <select
              value={selectedRepName}
              onChange={(e) => setSelectedRepName(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-gray-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Sales Reps</option>
              {Array.from(new Set([
                ...invoices.map(i => i.dsrName).filter(Boolean),
                ...collections.map(c => c.collectedByName).filter(Boolean),
                ...expenses.map(e => e.staffName).filter(Boolean)
              ])).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Brand/Company filter */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Manufacturer / Brand</label>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-gray-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Brands</option>
              {companies.map(comp => (
                <option key={comp.id} value={comp.id}>{comp.name}</option>
              ))}
            </select>
          </div>

          {/* Area filter */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Area / Route</label>
            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-gray-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Areas</option>
              {Array.from(new Set([
                ...customers.map(c => c.area).filter(Boolean),
                ...customers.map(c => c.route).filter(Boolean),
                ...invoices.map(i => i.area).filter(Boolean),
                ...invoices.map(i => i.route).filter(Boolean)
              ])).map(area => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>
          </div>

          {/* Category filter */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Product Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-gray-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              {Array.from(new Set(products.map(p => p.category || 'General').filter(Boolean))).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Clear filter and filter state summary */}
        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
          <div className="text-gray-400">
            Active conditions: {[
              startDate && 'From: ' + startDate,
              endDate && 'To: ' + endDate,
              selectedCustomerId && 'Customer selected',
              selectedProductId && 'Product selected',
              selectedRepName && 'Rep: ' + selectedRepName,
              selectedCompanyId && 'Company selected',
              selectedArea && 'Area: ' + selectedArea,
              selectedCategory && 'Category: ' + selectedCategory
            ].filter(Boolean).join(', ') || 'None (Showing full dataset)'}
          </div>
          {(startDate || endDate || selectedCustomerId || selectedProductId || selectedRepName || selectedCompanyId || selectedArea || selectedCategory) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSelectedCustomerId('');
                setSelectedProductId('');
                setSelectedRepName('');
                setSelectedCompanyId('');
                setSelectedArea('');
                setSelectedCategory('');
              }}
              className="text-xs text-rose-600 hover:text-rose-700 font-bold bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-200 transition-colors cursor-pointer"
            >
              Clear All Filters
            </button>
          )}
        </div>
      </div>

      {/* Report Canvas */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6" id="report-print-canvas">
        
        {/* Printable Letterhead header */}
        <div className="text-center border-b border-slate-200 pb-4">
          <h1 className="text-2xl font-black text-blue-950 tracking-tight">SAMIRA TRADERS (DMS)</h1>
          <p className="text-xs text-gray-400 font-mono">Barguna Sadar, Barguna | Phone: 01712-345678</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mt-2">
            <span className="text-xs font-bold text-gray-700 bg-slate-100 px-3 py-1 rounded border">
              System Audit Statement
            </span>
            <span className="text-xs font-semibold text-slate-500">
              {startDate || endDate ? (
                <span className="text-blue-700 font-bold">
                  Period: {startDate || 'Beginning'} to {endDate || 'Today'}
                </span>
              ) : (
                'All-Time Consolidated'
              )}
            </span>
            <span className="text-xs text-gray-400">| Date Compiled: {new Date().toLocaleDateString()}</span>
          </div>
        </div>

            {/* 1. Profit and Loss Report */}
            {activeReport === 'profit' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="font-extrabold text-gray-900 text-lg">Profit & Loss Performance Statement</h3>
                    <p className="text-xs text-gray-400">Condensed performance statistics for distribution and logistics commissions</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-gray-400 font-bold uppercase block">Total Sales Revenue</span>
                    <span className="text-lg font-black text-slate-800">৳{profitData.totalSalesRevenue.toLocaleString()}</span>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-gray-400 font-bold uppercase block">Cost of Goods Sold (COGS)</span>
                    <span className="text-lg font-black text-slate-800">৳{profitData.cogs.toLocaleString()}</span>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <span className="text-[10px] text-blue-500 font-bold uppercase block">Gross Margin Profit</span>
                    <span className="text-lg font-black text-blue-900">৳{profitData.salesMargin.toLocaleString()}</span>
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                    <span className="text-[10px] text-emerald-500 font-bold uppercase block">Total Net Profit</span>
                    <span className="text-lg font-black text-emerald-800">৳{profitData.netProfit.toLocaleString()}</span>
                  </div>
                </div>

                {/* PL Chart */}
                <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 print:hidden">
                  <p className="text-xs font-bold text-slate-700 uppercase mb-3 flex items-center space-x-2">
                    <BarChart2 className="w-4 h-4 text-blue-600" />
                    <span>Visual Profit & Loss breakdown</span>
                  </p>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={getPLChartData()}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(value: any) => [`৳${value.toLocaleString()}`, 'Amount']} />
                        <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                          {getPLChartData().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === 4 ? '#10b981' : index === 3 ? '#ef4444' : '#3b82f6'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <hr className="border-slate-100" />

                <div className="max-w-md mx-auto space-y-3 p-4 bg-slate-50/60 rounded-2xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-2">Net Profit Calculations</p>
                  
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Sales Margin (Revenues - COGS):</span>
                    <span className="font-semibold text-gray-900">৳{profitData.salesMargin.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Other Income (Sub-depot Commissions):</span>
                    <span className="font-semibold text-emerald-700">+ ৳{profitData.subdepotCommissionIncome.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Operating Expenditures (Expenses):</span>
                    <span className="font-semibold text-rose-600">- ৳{profitData.totalExp.toLocaleString()}</span>
                  </div>
                  <hr className="border-slate-200" />
                  <div className="flex justify-between text-sm font-black text-gray-900">
                    <span>Final Net Profit:</span>
                    <span className="text-base text-emerald-700">৳{profitData.netProfit.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Sales Journal Report */}
            {activeReport === 'sales' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="font-extrabold text-gray-900 text-lg">Sales Invoices Log Journal</h3>
                    <p className="text-xs text-gray-400">Total {sortedInvoices.length} invoices generated matching active criteria</p>
                  </div>
                </div>

                {/* Sales Chart */}
                {getSalesChartData().length > 0 && (
                  <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 print:hidden">
                    <p className="text-xs font-bold text-slate-700 uppercase mb-3">Daily Sales Trend</p>
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={getSalesChartData()}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip formatter={(value: any) => [`৳${value.toLocaleString()}`, 'Sales Volume']} />
                          <Area type="monotone" dataKey="Sales Volume" stroke="#3b82f6" fill="#eff6ff" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-gray-500 font-bold">
                      <tr>
                        <SortHeader field="invoiceNo" label="Invoice No" />
                        <SortHeader field="date" label="Date" />
                        <SortHeader field="shopName" label="Customer Shop" />
                        <SortHeader field="companyName" label="Brand Partner" />
                        <SortHeader field="grandTotal" label="Invoice Total" alignClass="text-right" />
                        <SortHeader field="paymentReceived" label="Cash Received" alignClass="text-right" />
                        <SortHeader field="due" label="Balance Due" alignClass="text-right" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sortedInvoices.map(inv => (
                        <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3 font-bold font-mono text-blue-800">{inv.invoiceNo}</td>
                          <td className="p-3 text-gray-500">{inv.date}</td>
                          <td className="p-3 font-semibold text-gray-900">{inv.shopName}</td>
                          <td className="p-3 text-gray-500">{inv.companyName}</td>
                          <td className="p-3 text-right font-bold text-gray-950">৳{inv.grandTotal.toLocaleString()}</td>
                          <td className="p-3 text-right text-emerald-700 font-bold">৳{inv.paymentReceived.toLocaleString()}</td>
                          <td className="p-3 text-right text-amber-600 font-black">৳{(inv.grandTotal - inv.paymentReceived).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 3. Cash Collections Report */}
            {activeReport === 'collection' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="font-extrabold text-gray-900 text-lg">Cash Collections Audit Sheet</h3>
                    <p className="text-xs text-gray-400">Total {sortedCollections.length} payments collected</p>
                  </div>
                </div>

                {/* Collections Chart */}
                {getCollectionChartData().length > 0 && (
                  <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 print:hidden">
                    <p className="text-xs font-bold text-slate-700 uppercase mb-3">Collections by Sales Representative (DSR)</p>
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={getCollectionChartData()}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="rep" />
                          <YAxis />
                          <Tooltip formatter={(value: any) => [`৳${value.toLocaleString()}`, 'Amount']} />
                          <Bar dataKey="Collected (৳)" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-gray-500 font-bold">
                      <tr>
                        <SortHeader field="collectionNo" label="Ref Receipt No" />
                        <SortHeader field="date" label="Date" />
                        <SortHeader field="shopName" label="Customer Shop" />
                        <SortHeader field="companyName" label="Company Ledger" />
                        <SortHeader field="paymentMethod" label="Method" />
                        <SortHeader field="collectedByName" label="Representative" />
                        <SortHeader field="amount" label="Amount Credited" alignClass="text-right" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sortedCollections.map(col => (
                        <tr key={col.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3 font-bold font-mono text-blue-800">{col.collectionNo}</td>
                          <td className="p-3 text-gray-400">{col.date}</td>
                          <td className="p-3 font-semibold text-gray-900">{col.shopName}</td>
                          <td className="p-3 text-gray-500">{col.companyName}</td>
                          <td className="p-3 font-medium text-slate-600">{col.paymentMethod}</td>
                          <td className="p-3 text-gray-500">{col.collectedByName}</td>
                          <td className="p-3 text-right font-black text-emerald-700">৳{col.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. Customer Ledgers Report */}
            {activeReport === 'ledger' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="font-extrabold text-gray-900 text-lg">Customer Dues & Ledger Register</h3>
                    <p className="text-xs text-gray-400">Total {sortedLedgers.length} ledger history entries matched</p>
                  </div>
                </div>

                {/* Ledger metrics overview */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-50 border p-3.5 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-gray-400 block">Total Dues Raised (Debits)</span>
                    <span className="text-base font-black text-rose-600 font-mono">
                      ৳{sortedLedgers.filter(l => l.type === 'INVOICE').reduce((sum, l) => sum + l.amount, 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-slate-50 border p-3.5 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-gray-400 block">Total Payments Credited</span>
                    <span className="text-base font-black text-emerald-700 font-mono">
                      ৳{sortedLedgers.filter(l => l.type === 'PAYMENT').reduce((sum, l) => sum + l.amount, 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-slate-50 border p-3.5 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-gray-400 block">DSR Adjustments / Returns</span>
                    <span className="text-base font-black text-amber-600 font-mono">
                      ৳{sortedLedgers.filter(l => l.type === 'ADJUSTMENT' || l.type === 'RETURN').reduce((sum, l) => sum + l.amount, 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-gray-500 font-bold">
                      <tr>
                        <SortHeader field="referenceNo" label="Reference No" />
                        <SortHeader field="date" label="Date" />
                        <SortHeader field="shopName" label="Outlet / Shop" />
                        <SortHeader field="companyName" label="Brand / Company" />
                        <SortHeader field="type" label="Tx Type" />
                        <SortHeader field="amount" label="Amount" alignClass="text-right" />
                        <SortHeader field="balanceAfter" label="Balance After" alignClass="text-right" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sortedLedgers.map((entry, index) => {
                        const targetCustomer = customers.find(c => c.id === entry.customerId);
                        return (
                          <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-3 font-bold font-mono text-blue-800">{entry.referenceNo}</td>
                            <td className="p-3 text-gray-400">{entry.date}</td>
                            <td className="p-3 font-semibold text-slate-800">{targetCustomer?.shopName || 'Unknown Customer'}</td>
                            <td className="p-3 text-gray-500">{entry.companyName}</td>
                            <td className="p-3 font-medium">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                entry.type === 'INVOICE' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                                entry.type === 'PAYMENT' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                'bg-amber-50 text-amber-700 border border-amber-100'
                              }`}>
                                {entry.type}
                              </span>
                            </td>
                            <td className="p-3 text-right font-bold text-gray-900">৳{entry.amount.toLocaleString()}</td>
                            <td className="p-3 text-right font-black text-slate-900">৳{entry.balanceAfter.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 5. Supplier Purchases Report */}
            {activeReport === 'supplier' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="font-extrabold text-gray-900 text-lg">Supplier Purchases & Sourcing Log</h3>
                    <p className="text-xs text-gray-400">Consolidated history of procurement orders matching manufacturer credentials</p>
                  </div>
                </div>

                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-gray-500 font-bold">
                      <tr>
                        <SortHeader field="purchaseNo" label="Purchase Order" />
                        <SortHeader field="date" label="Date" />
                        <SortHeader field="supplierName" label="Supplier Distributor" />
                        <SortHeader field="companyName" label="Company Brand" />
                        <SortHeader field="status" label="Status" />
                        <SortHeader field="grandTotal" label="Purchased Amount" alignClass="text-right" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sortedPurchases.map((pur) => (
                        <tr key={pur.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3 font-bold font-mono text-blue-800">{pur.purchaseNo}</td>
                          <td className="p-3 text-gray-400">{pur.date}</td>
                          <td className="p-3 font-semibold text-slate-800">{pur.supplierName}</td>
                          <td className="p-3 text-gray-500">{pur.companyName}</td>
                          <td className="p-3">
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded">
                              {pur.status}
                            </span>
                          </td>
                          <td className="p-3 text-right font-black text-gray-900">৳{pur.grandTotal.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 6. Depot Stock Report */}
            {activeReport === 'stock' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="font-extrabold text-gray-900 text-lg">Physical Stock Inventory Audit</h3>
                    <p className="text-xs text-gray-400">Total {products.length} cataloged products monitored at depot</p>
                  </div>
                </div>

                {/* Stock Chart */}
                {getStockChartData().length > 0 && (
                  <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 print:hidden">
                    <p className="text-xs font-bold text-slate-700 uppercase mb-3">Stock Valuation by Manufacturer Brand</p>
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={getStockChartData()}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="brand" />
                          <YAxis />
                          <Tooltip formatter={(value: any) => [`৳${value.toLocaleString()}`, 'Valuation']} />
                          <Bar dataKey="Valuation (৳)" fill="#2563eb" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-gray-500 font-bold">
                      <tr>
                        <SortHeader field="name" label="Product Description" />
                        <SortHeader field="companyName" label="Brand Partner" />
                        <SortHeader field="cartonSize" label="Carton Size" alignClass="text-center" />
                        <SortHeader field="stockCount" label="Depot Stock Units" alignClass="text-right" />
                        <SortHeader field="purchasePrice" label="Stock Valuation" alignClass="text-right" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {products
                        .filter(p => {
                          if (selectedCompanyId && p.companyId !== selectedCompanyId) return false;
                          if (selectedProductId && p.id !== selectedProductId) return false;
                          return true;
                        })
                        .sort((a, b) => {
                          if (sortField === 'name') {
                            return sortDirection === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
                          }
                          if (sortField === 'stockCount') {
                            return sortDirection === 'asc' ? a.stockCount - b.stockCount : b.stockCount - a.stockCount;
                          }
                          const valA = a.purchasePrice * a.stockCount;
                          const valB = b.purchasePrice * b.stockCount;
                          return sortDirection === 'asc' ? valA - valB : valB - valA;
                        })
                        .map(p => {
                          const valuation = p.purchasePrice * p.stockCount;
                          return (
                            <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-3">
                                <p className="font-bold text-gray-950">{p.name}</p>
                                <p className="text-[10px] text-gray-400 font-semibold uppercase">Pack: {p.packSize}</p>
                              </td>
                              <td className="p-3 text-gray-500 font-medium">{p.companyName}</td>
                              <td className="p-3 text-center text-gray-400 font-bold">{p.cartonSize} units/ctn</td>
                              <td className="p-3 text-right font-extrabold text-blue-900">
                                {p.stockCount} Pcs ({ (p.stockCount / p.cartonSize).toFixed(1) } Ctn)
                              </td>
                              <td className="p-3 text-right font-black text-slate-900">৳{valuation.toLocaleString()}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 7. Expense Summary */}
            {activeReport === 'expense' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="font-extrabold text-gray-900 text-lg">Operating Expenditures Statement</h3>
                    <p className="text-xs text-gray-400">Consolidated list of dynamic business expenses</p>
                  </div>
                </div>

                {/* Expenses Pie Chart */}
                {getExpenseChartData().length > 0 && (
                  <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col md:flex-row items-center gap-6 print:hidden">
                    <div className="w-full md:w-1/2">
                      <p className="text-xs font-bold text-slate-700 uppercase mb-3">Expenses Distribution by Category</p>
                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={getExpenseChartData()}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={4}
                              dataKey="value"
                            >
                              {getExpenseChartData().map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: any) => `৳${value.toLocaleString()}`} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="w-full md:w-1/2 grid grid-cols-2 gap-2 text-xs">
                      {getExpenseChartData().map((entry, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}></span>
                          <span className="text-slate-600 truncate">{entry.name}:</span>
                          <span className="font-black text-slate-900">৳{entry.value.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-gray-500 font-bold">
                      <tr>
                        <SortHeader field="title" label="Ledger Name" />
                        <SortHeader field="date" label="Date" />
                        <SortHeader field="category" label="Category" />
                        <SortHeader field="description" label="Description Allocation" />
                        <SortHeader field="amount" label="Debit Cash" alignClass="text-right" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sortedExpenses.map(e => (
                        <tr key={e.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3 font-bold text-gray-950">{e.title}</td>
                          <td className="p-3 text-gray-400">{e.date}</td>
                          <td className="p-3 font-semibold text-slate-700">{e.category}</td>
                          <td className="p-3 text-gray-500 truncate max-w-[240px]">{e.description}</td>
                          <td className="p-3 text-right font-black text-rose-600">৳{e.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 8. DSR Sheets */}
            {activeReport === 'dsr' && (
              <div className="space-y-6">
                <h3 className="font-extrabold text-gray-900 text-lg">Sales Representative Sheets (DSR)</h3>
                
                {/* Compile list of collections grouped by DSR */}
                {Array.from(new Set(filteredCollections.map(c => c.collectedByName))).map(dsrName => {
                  const dsrCollections = filteredCollections.filter(c => c.collectedByName === dsrName);
                  const dsrTotal = dsrCollections.reduce((sum, c) => sum + c.amount, 0);

                  return (
                    <div key={dsrName} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                      <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                        <span className="text-sm font-black text-slate-800 flex items-center">
                          <UserCheck className="w-4 h-4 mr-1.5 text-blue-600" />
                          <span>{dsrName} (Field Rep Account)</span>
                        </span>
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded">
                          Sum Collections: ৳{dsrTotal.toLocaleString()}
                        </span>
                      </div>

                      <div className="border border-slate-100 rounded-lg overflow-hidden bg-white">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-50 font-bold text-gray-500">
                            <tr>
                              <th className="p-2">Memo Ref</th>
                              <th className="p-2">Customer Shop</th>
                              <th className="p-2">Company</th>
                              <th className="p-2 text-right">Amount Credited</th>
                              <th className="p-2 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {dsrCollections.map(c => (
                              <tr key={c.id}>
                                <td className="p-2 font-mono font-bold text-blue-800">{c.collectionNo}</td>
                                <td className="p-2 font-semibold text-slate-800">{c.shopName}</td>
                                <td className="p-2 text-gray-400">{c.companyName}</td>
                                <td className="p-2 text-right font-bold text-gray-950">৳{c.amount.toLocaleString()}</td>
                                <td className="p-2 text-center text-gray-500 font-medium">{c.status}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 9. Inventory Valuation */}
            {activeReport === 'valuation' && (
              <div className="space-y-6">
                <h3 className="font-extrabold text-gray-900 text-lg">Inventory Valuation Report</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <span className="text-[10px] text-blue-600 font-bold uppercase block">
                      {isValuationFiltered ? 'Period Sales Value' : "Today's Sales Value"}
                    </span>
                    <span className="text-xl font-black text-blue-900 font-mono">৳{valuationSalesVal.toLocaleString()}</span>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                    <span className="text-[10px] text-amber-600 font-bold uppercase block">
                      {isValuationFiltered ? 'Period Damage Return Value' : "Today's Damage Return Value"}
                    </span>
                    <span className="text-xl font-black text-amber-950 font-mono">৳{valuationDamageVal.toLocaleString()}</span>
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                    <span className="text-[10px] text-emerald-600 font-bold uppercase block">
                      {isValuationFiltered ? 'Period Closing Stock Value' : 'Closing Inventory Sales Value'}
                    </span>
                    <span className="text-xl font-black text-emerald-900 font-mono">৳{valuationClosingVal.toLocaleString()}</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-50/60 rounded-2xl border border-slate-100 space-y-3">
                  <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    {isValuationFiltered ? 'Period Stock Value Calculation' : 'Closing Inventory Sales Value Calculation'}
                  </p>
                  <div className="text-xs text-gray-600 space-y-2">
                    <div className="flex justify-between">
                      <span>{isValuationFiltered ? 'Period Total Sales Value:' : "Today's Total Sales Value:"}</span>
                      <span className="font-bold text-slate-800 font-mono">৳{valuationSalesVal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{isValuationFiltered ? 'Period Damage Return Value:' : "Today's Damage Return Value:"}</span>
                      <span className="font-bold text-slate-800 font-mono">+ ৳{valuationDamageVal.toLocaleString()}</span>
                    </div>
                    <hr className="border-slate-200" />
                    <div className="flex justify-between text-sm font-black text-emerald-700">
                      <span>{isValuationFiltered ? 'Period Closing Stock Value:' : 'Closing Inventory Sales Value:'}</span>
                      <span>৳{valuationClosingVal.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-100 rounded-xl overflow-hidden bg-white p-5 space-y-3">
                  <div className="flex items-center space-x-2 text-rose-600">
                    <span className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-pulse"></span>
                    <p className="text-xs font-bold uppercase">Damaged Items Register (P&L Exclusion)</p>
                  </div>
                  <p className="text-xs text-gray-400">
                    Note: Damaged items are tracked separately under physical stock valuation. They do not impact the Profit & Loss calculation to preserve accurate margin evaluations.
                  </p>
                  
                  <table className="w-full text-xs text-left mt-2">
                    <thead className="bg-slate-50 font-bold text-gray-500">
                      <tr>
                        <th className="p-3">Product Name</th>
                        <th className="p-3 text-center">Damaged Qty</th>
                        <th className="p-3 text-right">Unit Price</th>
                        <th className="p-3 text-right">Total Damaged Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {products.filter(p => {
                        if (selectedCompanyId && p.companyId !== selectedCompanyId) return false;
                        if (selectedProductId && p.id !== selectedProductId) return false;
                        return (p.damageStock || 0) > 0;
                      }).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-gray-400 italic">
                            No damaged items recorded in physical inventory
                          </td>
                        </tr>
                      ) : (
                        <>
                          {products
                            .filter(p => {
                              if (selectedCompanyId && p.companyId !== selectedCompanyId) return false;
                              if (selectedProductId && p.id !== selectedProductId) return false;
                              return (p.damageStock || 0) > 0;
                            })
                            .map(p => {
                              const qty = p.damageStock || 0;
                              const rate = p.purchasePrice;
                              const total = qty * rate;
                              return (
                                <tr key={p.id}>
                                  <td className="p-3 font-semibold text-slate-800">{p.name}</td>
                                  <td className="p-3 text-center font-bold text-rose-600">{qty} Pcs</td>
                                  <td className="p-3 text-right">৳{rate.toLocaleString()}</td>
                                  <td className="p-3 text-right font-bold text-slate-800">৳{total.toLocaleString()}</td>
                                </tr>
                              );
                            })}
                          <tr className="bg-rose-50/40 font-bold">
                            <td className="p-3">Total Damaged Value:</td>
                            <td className="p-3 text-center text-rose-600">
                              {products
                                .filter(p => {
                                  if (selectedCompanyId && p.companyId !== selectedCompanyId) return false;
                                  if (selectedProductId && p.id !== selectedProductId) return false;
                                  return (p.damageStock || 0) > 0;
                                })
                                .reduce((sum, p) => sum + (p.damageStock || 0), 0)} Pcs
                            </td>
                            <td className="p-3"></td>
                            <td className="p-3 text-right font-mono text-slate-950">৳{valuationDamageVal.toLocaleString()}</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        </div>
      );
    }
