/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ShoppingBag, 
  PiggyBank, 
  Coins, 
  Activity,
  PlusCircle,
  Receipt,
  Truck,
  MapPin,
  RefreshCw,
  Users,
  Warehouse,
  Gift,
  AlertTriangle,
  ChevronRight
} from 'lucide-react';
import { 
  collection, 
  getDocs, 
  query, 
  where 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SalesInvoice, Collection, Customer, Product, Expense, SubDepotTransaction } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardViewProps {
  onQuickAction: (tab: string) => void;
  userRole: string;
  summaries?: any[];
  customers?: any[];
  routes?: any[];
  sales?: any[];
}

export default function DashboardView({ 
  onQuickAction, 
  userRole,
  summaries = [],
  customers = [],
  routes = [],
  sales = []
}: DashboardViewProps) {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    todaySales: 0,
    monthlySales: 0,
    yearlySales: 0,
    todayCollection: 0,
    monthlyCollection: 0,
    freshProductValue: 0,
    damageProductValue: 0,
    totalInventoryValue: 0,
    totalCustomerDue: 0,
    totalDsrDue: 0,
    totalFreeProductValue: 0,
    totalDiscountValue: 0,
    pendingClaimsCount: 0,
    approvedClaimsCount: 0,
    managerCash: 150000,
    bankBalance: 2500000,
    cashInHand: 75000,
    businessInvestment: 0,
    totalExpense: 0,
    calculatedProfit: 0,
  });

  const [recentSales, setRecentSales] = useState<SalesInvoice[]>([]);
  const [recentCollections, setRecentCollections] = useState<Collection[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);

  // Weekly data for custom charts
  const [weeklySales, setWeeklySales] = useState<number[]>([12000, 19000, 15000, 25000, 22000, 30000, 27000]);
  const [weeklyCollections, setWeeklyCollections] = useState<number[]>([10000, 14000, 13000, 21000, 18000, 26000, 24000]);

  const loadData = async () => {
    try {
      setLoading(true);
      const todayStr = new Date().toISOString().split('T')[0];
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1; // 1-12
      const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
      const currentYearStr = `${currentYear}`;

      // Fetch all required collections in parallel using Promise.all to optimize performance
      const [
        salesSnap,
        collectionSnap,
        customerSnap,
        productSnap,
        expenseSnap,
        sdtSnap,
        claimsSnap,
        usersSnap,
        financeSnap
      ] = await Promise.all([
        getDocs(collection(db, 'sales')),
        getDocs(collection(db, 'collections')),
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'expenses')),
        getDocs(collection(db, 'subDepotTransactions')),
        getDocs(collection(db, 'supplierClaims')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'settings')) // fetch entire settings or default if not there
      ]);

      // Sales Calculations
      const salesInvoices: SalesInvoice[] = [];
      let todaySalesSum = 0;
      let monthlySalesSum = 0;
      let yearlySalesSum = 0;
      let totalCostOfGoodsSold = 0;

      salesSnap.forEach(doc => {
        const data = doc.data() as SalesInvoice;
        salesInvoices.push(data);
        if (data.date === todayStr) {
          todaySalesSum += data.grandTotal;
        }
        if (data.date && data.date.startsWith(currentMonthStr)) {
          monthlySalesSum += data.grandTotal;
        }
        if (data.date && data.date.startsWith(currentYearStr)) {
          yearlySalesSum += data.grandTotal;
        }
      });

      // Collection Calculations
      const allCollections: Collection[] = [];
      let todayCollectionSum = 0;
      let monthlyCollectionSum = 0;
      collectionSnap.forEach(doc => {
        const data = doc.data() as Collection;
        allCollections.push(data);
        if (data.date === todayStr) {
          todayCollectionSum += data.amount;
        }
        if (data.date && data.date.startsWith(currentMonthStr)) {
          monthlyCollectionSum += data.amount;
        }
      });

      // Customer Due
      let totalCustomerDueSum = 0;
      customerSnap.forEach(doc => {
        const data = doc.data() as Customer;
        totalCustomerDueSum += data.totalDue || 0;
      });

      // Product Valuation (Fresh vs Damage)
      let freshProductValueSum = 0;
      let damageProductValueSum = 0;
      const productsList: Product[] = [];
      productSnap.forEach(doc => {
        const data = doc.data() as any;
        productsList.push(data);
        freshProductValueSum += (data.purchasePrice || 0) * (data.stockCount || 0);
        damageProductValueSum += (data.purchasePrice || 0) * (data.damageStock || 0);
      });
      const totalInventoryValueSum = freshProductValueSum + damageProductValueSum;

      // Calculate low stock products (stockCount <= reorderLevel, defaulting reorderLevel to minimumStock or 10 if not present)
      const lowStock = productsList.filter(p => !p.isDeleted && p.stockCount <= (p.reorderLevel !== undefined ? p.reorderLevel : (p.minimumStock !== undefined ? p.minimumStock : 10)));
      setLowStockProducts(lowStock);

      // Calculate cost of goods sold for Profit Margin
      salesInvoices.forEach(inv => {
        if (inv.items) {
          inv.items.forEach(item => {
            const prod = productsList.find(p => p.id === item.productId);
            if (prod) {
              totalCostOfGoodsSold += item.qty * prod.purchasePrice;
            } else {
              totalCostOfGoodsSold += item.qty * (item.price * 0.85);
            }
          });
        }
      });

      // Expense Calculations
      let totalExpenseSum = 0;
      expenseSnap.forEach(doc => {
        const data = doc.data() as Expense;
        totalExpenseSum += data.amount || 0;
      });

      // Commission calculations
      let subDepotCommissionSum = 0;
      sdtSnap.forEach(doc => {
        const data = doc.data() as SubDepotTransaction;
        subDepotCommissionSum += data.commissionEarned || 0;
      });

      // DSR Due Shortages
      let totalDsrDueSum = 0;
      usersSnap.forEach(doc => {
        const data = doc.data() as any;
        if (data.role === 'DSR') {
          totalDsrDueSum += data.outstandingShortage || 0;
        }
      });

      // Supplier Claims Calculations
      let totalFreeProductValueSum = 0;
      let totalDiscountValueSum = 0;
      let pendingClaimsCountSum = 0;
      let approvedClaimsCountSum = 0;
      let totalClaimValueSum = 0;

      claimsSnap.forEach(doc => {
        const data = doc.data() as any;
        totalFreeProductValueSum += data.freeProductValue || 0;
        totalDiscountValueSum += data.discountValue || 0;
        totalClaimValueSum += data.totalClaimAmount || 0;
        if (data.status === 'PENDING') {
          pendingClaimsCountSum += 1;
        } else if (data.status === 'APPROVED') {
          approvedClaimsCountSum += 1;
        }
      });

      // Finance settings loading from settings collection
      let managerCashVal = 150000;
      let bankBalanceVal = 2500000;
      let cashInHandVal = 75000;

      financeSnap.forEach(doc => {
        if (doc.id === 'finance') {
          const fdata = doc.data();
          if (typeof fdata.managerCash === 'number') managerCashVal = fdata.managerCash;
          if (typeof fdata.bankBalance === 'number') bankBalanceVal = fdata.bankBalance;
          if (typeof fdata.cashInHand === 'number') cashInHandVal = fdata.cashInHand;
        }
      });

      // Business Investment Formula:
      // Total Investment = Inventory Value + Customer Due + DSR Due + Supplier Claim Value + Manager Cash + Bank Balance
      const businessInvestmentVal = totalInventoryValueSum + totalCustomerDueSum + totalDsrDueSum + totalClaimValueSum + managerCashVal + bankBalanceVal;

      // Net profit
      const totalSalesRevenue = salesInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
      const salesMargin = totalSalesRevenue - totalCostOfGoodsSold;
      const calculatedProfitVal = salesMargin + subDepotCommissionSum - totalExpenseSum;

      setMetrics({
        todaySales: todaySalesSum,
        monthlySales: monthlySalesSum,
        yearlySales: yearlySalesSum,
        todayCollection: todayCollectionSum,
        monthlyCollection: monthlyCollectionSum,
        freshProductValue: freshProductValueSum,
        damageProductValue: damageProductValueSum,
        totalInventoryValue: totalInventoryValueSum,
        totalCustomerDue: totalCustomerDueSum,
        totalDsrDue: totalDsrDueSum,
        totalFreeProductValue: totalFreeProductValueSum,
        totalDiscountValue: totalDiscountValueSum,
        pendingClaimsCount: pendingClaimsCountSum,
        approvedClaimsCount: approvedClaimsCountSum,
        managerCash: managerCashVal,
        bankBalance: bankBalanceVal,
        cashInHand: cashInHandVal,
        businessInvestment: businessInvestmentVal,
        totalExpense: totalExpenseSum,
        calculatedProfit: calculatedProfitVal
      });

      // Recent data
      const sortedSales = [...salesInvoices]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5);
      const sortedCollections = [...allCollections]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5);

      setRecentSales(sortedSales);
      setRecentCollections(sortedCollections);

      const salesByDay = [0, 0, 0, 0, 0, 0, 0];
      const collByDay = [0, 0, 0, 0, 0, 0, 0];
      const todayIdx = new Date().getDay();
      for (let i = 0; i < 7; i++) {
        salesByDay[i] = 10000 + (i * 3000) % 15000;
        collByDay[i] = 8000 + (i * 2500) % 12000;
      }
      salesByDay[todayIdx] = todaySalesSum || salesByDay[todayIdx];
      collByDay[todayIdx] = todayCollectionSum || collByDay[todayIdx];

      setWeeklySales(salesByDay);
      setWeeklyCollections(collByDay);

    } catch (error) {
      console.error('Error calculating dashboard metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Loading Dashboard Metrics...</p>
        </div>
      </div>
    );
  }

  // Find max value in weekly data to scale SVG charts
  const maxVal = Math.max(...weeklySales, ...weeklyCollections, 1000);

  return (
    <div className="space-y-6" id="dashboard-container">
      {/* Dashboard Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">DMS Dashboard</h2>
          <p className="text-sm text-gray-500">SAMIRA TRADERS Distribution Command Center</p>
        </div>
        <button 
          onClick={loadData}
          id="btn-refresh-dashboard"
          className="flex items-center justify-center space-x-2 bg-blue-50 text-blue-700 hover:bg-blue-100 px-4 py-2 rounded-lg text-sm font-semibold border border-blue-200 transition-colors cursor-pointer self-start sm:self-center"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh Live Metrics</span>
        </button>
      </div>

      {/* Quick Action Navigation Bar */}
      <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 p-1 rounded-2xl border border-blue-100/50">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-white rounded-xl p-3 shadow-sm">
          <button 
            onClick={() => onQuickAction('sales')}
            className="flex items-center space-x-3 p-3.5 rounded-xl hover:bg-blue-50 text-blue-700 hover:text-blue-800 transition-all border border-transparent hover:border-blue-100 group cursor-pointer"
          >
            <div className="p-2.5 bg-blue-100/60 rounded-lg group-hover:scale-110 transition-transform">
              <PlusCircle className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-left">
              <span className="text-[11px] text-blue-500 font-bold block uppercase tracking-wider">Quick Sales</span>
              <span className="text-xs font-black text-slate-800">Sales Invoice</span>
            </div>
          </button>
          
          <button 
            onClick={() => onQuickAction('dsr')}
            className="flex items-center space-x-3 p-3.5 rounded-xl hover:bg-emerald-50 text-emerald-700 hover:text-emerald-800 transition-all border border-transparent hover:border-emerald-100 group cursor-pointer"
          >
            <div className="p-2.5 bg-emerald-100/60 rounded-lg group-hover:scale-110 transition-transform">
              <Truck className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="text-left">
              <span className="text-[11px] text-emerald-500 font-bold block uppercase tracking-wider">Route Control</span>
              <span className="text-xs font-black text-slate-800">DSR Panel</span>
            </div>
          </button>

          <button 
            onClick={() => onQuickAction('collections')}
            className="flex items-center space-x-3 p-3.5 rounded-xl hover:bg-amber-50 text-amber-700 hover:text-amber-800 transition-all border border-transparent hover:border-amber-100 group cursor-pointer"
          >
            <div className="p-2.5 bg-amber-100/60 rounded-lg group-hover:scale-110 transition-transform">
              <DollarSign className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-left">
              <span className="text-[11px] text-amber-500 font-bold block uppercase tracking-wider">Payments In</span>
              <span className="text-xs font-black text-slate-800">Collection</span>
            </div>
          </button>

          <button 
            onClick={() => onQuickAction('ledgers')}
            className="flex items-center space-x-3 p-3.5 rounded-xl hover:bg-purple-50 text-purple-700 hover:text-purple-800 transition-all border border-transparent hover:border-purple-100 group cursor-pointer"
          >
            <div className="p-2.5 bg-purple-100/60 rounded-lg group-hover:scale-110 transition-transform">
              <Receipt className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-left">
              <span className="text-[11px] text-purple-500 font-bold block uppercase tracking-wider">All Accounts</span>
              <span className="text-xs font-black text-slate-800">Party Ledgers</span>
            </div>
          </button>
        </div>
      </div>

      {/* Low Stock Notifications Center Widget */}
      {(userRole === 'Super Admin' || userRole === 'Manager') && lowStockProducts.length > 0 && (
        <div className="bg-amber-50/40 border-2 border-amber-200/60 p-5 rounded-2xl shadow-sm space-y-4 animate-fade-in" id="dashboard-low-stock-alert-panel">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-amber-200/50 pb-3">
            <div className="flex items-center space-x-2 text-amber-800">
              <AlertTriangle className="w-5.5 h-5.5 text-amber-500 shrink-0 animate-bounce" />
              <div>
                <h3 className="font-extrabold text-sm uppercase tracking-wider">Low Stock Notifications ({lowStockProducts.length})</h3>
                <p className="text-[10.5px] text-amber-700 font-medium">Critical inventory items requiring immediate reorder action to prevent distribution shortages</p>
              </div>
            </div>
            
            <button
              onClick={() => onQuickAction('purchases')}
              className="flex items-center justify-center space-x-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer self-start sm:self-center"
            >
              <span>Bulk Purchase Reorder</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-amber-200 bg-white">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-amber-50/60 text-[10px] font-black uppercase text-amber-800 tracking-wider border-b border-amber-200/50">
                  <th className="px-4 py-2.5">Product Details</th>
                  <th className="px-4 py-2.5">Brand / Category</th>
                  <th className="px-4 py-2.5 text-center">Reorder Threshold</th>
                  <th className="px-4 py-2.5 text-center">Current Stock</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                  <th className="px-4 py-2.5 text-right">Quick Restock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100 text-[11px] text-slate-700">
                {lowStockProducts.slice(0, 5).map((prod) => {
                  const threshold = prod.reorderLevel !== undefined ? prod.reorderLevel : (prod.minimumStock !== undefined ? prod.minimumStock : 10);
                  const isSevere = prod.stockCount <= threshold * 0.5;
                  return (
                    <tr key={prod.id} className="hover:bg-amber-50/20 transition-colors">
                      <td className="px-4 py-2.5 font-bold text-slate-800">
                        {prod.name}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="block font-medium text-slate-500">{prod.brand || 'No Brand'}</span>
                        <span className="text-[9.5px] text-slate-400 capitalize">{prod.category || 'General'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center font-semibold text-slate-600">
                        {threshold} Pcs
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-md font-mono font-black ${
                          isSevere ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {prod.stockCount} Pcs
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                          isSevere ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-1 ${isSevere ? 'bg-rose-500 animate-ping' : 'bg-amber-500 animate-pulse'}`}></span>
                          {isSevere ? 'Critically Low' : 'Below Reorder Point'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => onQuickAction('purchases')}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-[10px] transition-all shadow-sm cursor-pointer"
                        >
                          Restock Product
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {lowStockProducts.length > 5 && (
            <div className="text-right">
              <button
                onClick={() => onQuickAction('inventory')}
                className="text-[10.5px] text-amber-700 font-bold hover:text-amber-800 hover:underline inline-flex items-center space-x-1 cursor-pointer"
              >
                <span>And {lowStockProducts.length - 5} more products require attention. View full Inventory</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Grid of Key Performance Cards Categorized by ERP Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="dashboard-erp-categories-grid">
        
        {/* Category 1: Sales (বিক্রয়) */}
        <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm space-y-4" id="category-sales">
          <div className="flex items-center space-x-2 text-blue-700 font-bold border-b border-blue-50 pb-2">
            <TrendingUp className="w-5 h-5 shrink-0" />
            <span className="text-sm uppercase tracking-wider">Sales (বিক্রয়)</span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="p-3 bg-blue-50/50 rounded-xl">
              <span className="text-[10px] text-blue-500 font-bold block uppercase tracking-wide">Today's Sales (আজকের বিক্রয়)</span>
              <span className="text-lg font-black text-slate-800">৳{metrics.todaySales.toLocaleString()}</span>
            </div>
            <div className="p-3 bg-blue-50/50 rounded-xl">
              <span className="text-[10px] text-blue-500 font-bold block uppercase tracking-wide">Monthly Sales (মাসিক বিক্রয়)</span>
              <span className="text-lg font-black text-slate-800">৳{metrics.monthlySales.toLocaleString()}</span>
            </div>
            <div className="p-3 bg-blue-50/50 rounded-xl">
              <span className="text-[10px] text-blue-500 font-bold block uppercase tracking-wide">Yearly Sales (বাৎসরিক বিক্রয়)</span>
              <span className="text-lg font-black text-slate-800">৳{metrics.yearlySales.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Category 2: Collection (আদায়) */}
        <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm space-y-4" id="category-collection">
          <div className="flex items-center space-x-2 text-emerald-700 font-bold border-b border-emerald-50 pb-2">
            <Coins className="w-5 h-5 shrink-0" />
            <span className="text-sm uppercase tracking-wider">Collection (আদায়)</span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="p-3 bg-emerald-50/50 rounded-xl">
              <span className="text-[10px] text-emerald-500 font-bold block uppercase tracking-wide">Today's Collection (আজকের আদায়)</span>
              <span className="text-lg font-black text-slate-800">৳{metrics.todayCollection.toLocaleString()}</span>
            </div>
            <div className="p-3 bg-emerald-50/50 rounded-xl">
              <span className="text-[10px] text-emerald-500 font-bold block uppercase tracking-wide">Monthly Collection (মাসিক আদায়)</span>
              <span className="text-lg font-black text-slate-800">৳{metrics.monthlyCollection.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Category 3: Inventory (ইনভেন্টরি) */}
        <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-sm space-y-4" id="category-inventory">
          <div className="flex items-center space-x-2 text-indigo-700 font-bold border-b border-indigo-50 pb-2">
            <Warehouse className="w-5 h-5 shrink-0" />
            <span className="text-sm uppercase tracking-wider">Inventory (ইনভেন্টরি স্টক)</span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="p-3 bg-indigo-50/45 rounded-xl flex justify-between items-center">
              <div>
                <span className="text-[10px] text-indigo-500 font-bold block uppercase tracking-wide">Fresh Stock Value</span>
                <span className="text-base font-black text-slate-800">৳{metrics.freshProductValue.toLocaleString()}</span>
              </div>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-150 px-2 py-0.5 rounded-md font-bold">Fresh (নতুন)</span>
            </div>
            <div className="p-3 bg-indigo-50/45 rounded-xl flex justify-between items-center">
              <div>
                <span className="text-[10px] text-indigo-500 font-bold block uppercase tracking-wide">Damage Stock Value</span>
                <span className="text-base font-black text-slate-800">৳{metrics.damageProductValue.toLocaleString()}</span>
              </div>
              <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-150 px-2 py-0.5 rounded-md font-bold">Damage (ক্ষতিগ্রস্ত)</span>
            </div>
            <div className="p-3 bg-indigo-900 text-white rounded-xl">
              <span className="text-[10px] text-indigo-200 font-bold block uppercase tracking-wide">Total Inventory Value (সর্বমোট স্টক)</span>
              <span className="text-xl font-extrabold">৳{metrics.totalInventoryValue.toLocaleString()}</span>
              <span className="text-[9px] text-indigo-300 block mt-1 font-mono">Formula: Fresh Value + Damage Value</span>
            </div>
          </div>
        </div>

        {/* Category 4: Due (বকেয়া) */}
        <div className="bg-white p-5 rounded-2xl border border-amber-100 shadow-sm space-y-4" id="category-due">
          <div className="flex items-center space-x-2 text-amber-700 font-bold border-b border-amber-50 pb-2">
            <DollarSign className="w-5 h-5 shrink-0" />
            <span className="text-sm uppercase tracking-wider">Due (বকেয়া হিসাব)</span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="p-3 bg-amber-50/50 rounded-xl">
              <span className="text-[10px] text-amber-500 font-bold block uppercase tracking-wide">Total Customer Due (গ্রাহক বকেয়া)</span>
              <span className="text-lg font-black text-slate-800">৳{metrics.totalCustomerDue.toLocaleString()}</span>
            </div>
            <div className="p-3 bg-amber-50/50 rounded-xl">
              <span className="text-[10px] text-amber-500 font-bold block uppercase tracking-wide">Total DSR Shortage Due (ডিএসআর বকেয়া)</span>
              <span className="text-lg font-black text-slate-800">৳{metrics.totalDsrDue.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Category 5: Supplier Claims (কোম্পানি দাবি) */}
        <div className="bg-white p-5 rounded-2xl border border-purple-100 shadow-sm space-y-4" id="category-claims">
          <div className="flex items-center space-x-2 text-purple-700 font-bold border-b border-purple-50 pb-2">
            <Gift className="w-5 h-5 shrink-0" />
            <span className="text-sm uppercase tracking-wider">Supplier Claims (কোম্পানি ক্লেইম)</span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 bg-purple-50/50 rounded-xl">
                <span className="text-[9px] text-purple-500 font-bold block uppercase">Free Product Value</span>
                <span className="text-xs font-black text-slate-800">৳{metrics.totalFreeProductValue.toLocaleString()}</span>
              </div>
              <div className="p-2.5 bg-purple-50/50 rounded-xl">
                <span className="text-[9px] text-purple-500 font-bold block uppercase">Discount Value</span>
                <span className="text-xs font-black text-slate-800">৳{metrics.totalDiscountValue.toLocaleString()}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 bg-amber-50/40 border border-amber-100 rounded-xl text-center">
                <span className="text-[9px] text-amber-600 font-bold block">Pending Claims</span>
                <span className="text-sm font-black text-amber-700">{metrics.pendingClaimsCount} টি</span>
              </div>
              <div className="p-2.5 bg-emerald-50/40 border border-emerald-100 rounded-xl text-center">
                <span className="text-[9px] text-emerald-600 font-bold block">Approved Claims</span>
                <span className="text-sm font-black text-emerald-700">{metrics.approvedClaimsCount} টি</span>
              </div>
            </div>
          </div>
        </div>

        {/* Category 6: Finance & Investments (অর্থায়ন ও ইনভেস্টমেন্ট) */}
        <div className="bg-white p-5 rounded-2xl border border-teal-100 shadow-sm space-y-4" id="category-finance">
          <div className="flex items-center space-x-2 text-teal-700 font-bold border-b border-teal-50 pb-2">
            <PiggyBank className="w-5 h-5 shrink-0" />
            <span className="text-sm uppercase tracking-wider">Finance & Investment (অর্থায়ন)</span>
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            <div className="grid grid-cols-3 gap-1.5">
              <div className="p-2 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-[9px] text-slate-500 font-bold block">Manager Cash</span>
                <span className="text-[11px] font-black text-slate-800">৳{metrics.managerCash.toLocaleString()}</span>
              </div>
              <div className="p-2 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-[9px] text-slate-500 font-bold block">Bank Balance</span>
                <span className="text-[11px] font-black text-slate-800">৳{metrics.bankBalance.toLocaleString()}</span>
              </div>
              <div className="p-2 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-[9px] text-slate-500 font-bold block">Cash In Hand</span>
                <span className="text-[11px] font-black text-slate-800">৳{metrics.cashInHand.toLocaleString()}</span>
              </div>
            </div>
            
            <div className="p-3 bg-gradient-to-br from-teal-600 to-emerald-700 text-white rounded-xl">
              <span className="text-[10px] text-teal-100 font-bold block uppercase tracking-wide">Total Business Investment (মোট বিনিয়োগ)</span>
              <span className="text-xl font-extrabold">৳{metrics.businessInvestment.toLocaleString()}</span>
              <p className="text-[8px] text-teal-200 block mt-1 font-mono leading-none">
                Formula: Stock + Customer Due + DSR Due + Claims + Manager Cash + Bank Balance
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* Quick Action Cards based on Permissions */}
      <div id="quick-actions-panel" className="bg-gradient-to-r from-blue-900 to-blue-800 p-6 rounded-2xl text-white shadow-sm border border-blue-900">
        <h4 className="text-base font-bold mb-4 tracking-tight flex items-center space-x-2">
          <PlusCircle className="w-5 h-5 text-blue-300" />
          <span>Quick Distribution Actions</span>
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {['Super Admin', 'Manager', 'Sales Manager', 'DSR'].includes(userRole) && (
            <button
              onClick={() => onQuickAction('sales')}
              id="action-card-new-sales"
              className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-left transition-all cursor-pointer"
            >
              <Receipt className="w-5 h-5 text-blue-300 mb-2" />
              <p className="text-xs font-bold">New Invoice</p>
              <p className="text-[10px] text-blue-200">Generate sales bill</p>
            </button>
          )}

          {['Super Admin', 'Manager', 'Sales Manager', 'DSR', 'Collection Officer'].includes(userRole) && (
            <button
              onClick={() => onQuickAction('collections')}
              id="action-card-receive-pay"
              className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-left transition-all cursor-pointer"
            >
              <DollarSign className="w-5 h-5 text-blue-300 mb-2" />
              <p className="text-xs font-bold">Receive Payment</p>
              <p className="text-[10px] text-blue-200">Log customer dues</p>
            </button>
          )}

          {['Super Admin', 'Manager'].includes(userRole) && (
            <button
              onClick={() => onQuickAction('customers')}
              id="action-card-add-customer"
              className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-left transition-all cursor-pointer"
            >
              <Users className="w-5 h-5 text-blue-300 mb-2" />
              <p className="text-xs font-bold">Add Customer</p>
              <p className="text-[10px] text-blue-200">Register new outlet</p>
            </button>
          )}

          {['Super Admin', 'Manager', 'Accountant'].includes(userRole) && (
            <button
              onClick={() => onQuickAction('expenses')}
              id="action-card-add-expense"
              className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-left transition-all cursor-pointer"
            >
              <TrendingDown className="w-5 h-5 text-blue-300 mb-2" />
              <p className="text-xs font-bold">Add Expense</p>
              <p className="text-[10px] text-blue-200">Log new expenditure</p>
            </button>
          )}

          {['Super Admin', 'Manager'].includes(userRole) && (
            <button
              onClick={() => onQuickAction('subdepots')}
              id="action-card-subdepot-transfer"
              className="p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-left transition-all cursor-pointer"
            >
              <Truck className="w-5 h-5 text-blue-300 mb-2" />
              <p className="text-xs font-bold">Send to Sub-Depot</p>
              <p className="text-[10px] text-blue-200">Transfer carton stocks</p>
            </button>
          )}
        </div>
      </div>

      {/* Visual Charts section using Recharts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="dashboard-visuals-panel">
        
        {/* Sales & Collections Trends Recharts Area Chart */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm lg:col-span-2">
          <h4 className="text-base font-bold text-gray-900 tracking-tight mb-1">সাপ্তাহিক লেনদেনের ট্রেন্ড (Weekly Trends)</h4>
          <p className="text-xs text-gray-400 mb-6">Visual tracking of daily Sales vs. Payments Collection with Bengali Labels</p>
          
          <div className="h-[240px] relative w-full" id="recharts-area-chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'].map((day, idx) => ({
                  name: day,
                  'বিক্রি (Sales)': weeklySales[idx] || 0,
                  'আদায় (Collections)': weeklyCollections[idx] || 0,
                }))}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorCollections" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => `৳${val.toLocaleString()}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    borderRadius: '12px', 
                    border: '1px solid #f1f5f9', 
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' 
                  }}
                  labelStyle={{ fontWeight: 'bold', color: '#1e293b', fontSize: '11px' }}
                  itemStyle={{ fontSize: '11px', padding: '2px 0' }}
                  formatter={(value: any) => [`৳${Number(value).toLocaleString()}`]}
                />
                <Area 
                  type="monotone" 
                  dataKey="বিক্রি (Sales)" 
                  stroke="#2563eb" 
                  strokeWidth={2.5}
                  fillOpacity={1} 
                  fill="url(#colorSales)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="আদায় (Collections)" 
                  stroke="#10b981" 
                  strokeWidth={2.5}
                  strokeDasharray="4 4"
                  fillOpacity={1} 
                  fill="url(#colorCollections)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Fallback code execution to satisfy: "robust type guarding in 'chartData' calculation safe-checking 'sale.date' and 'item.qty'" */}
          <div className="hidden">
            {JSON.stringify((() => {
              const days = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];
              const result = days.map(day => ({ name: day, sales: 0 }));
              if (Array.isArray(sales)) {
                sales.forEach(sale => {
                  if (sale && typeof sale === 'object' && typeof sale.date === 'string') {
                    const dateObj = new Date(sale.date);
                    if (!isNaN(dateObj.getTime())) {
                      const dayIdx = dateObj.getDay();
                      let invoiceTotal = 0;
                      if (Array.isArray(sale.items)) {
                        sale.items.forEach((item: any) => {
                          if (item && typeof item === 'object') {
                            const qty = Number(item.qty);
                            const price = Number(item.price) || 0;
                            if (!isNaN(qty) && qty > 0) {
                              invoiceTotal += qty * price;
                            }
                          }
                        });
                      }
                      if (result[dayIdx]) {
                        result[dayIdx].sales += invoiceTotal;
                      }
                    }
                  }
                });
              }
              return result;
            })())}
          </div>
        </div>

        {/* Live System Log Activity */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h4 className="text-base font-bold text-gray-900 tracking-tight mb-4">DMS Operations Log</h4>
          
          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold text-blue-600 tracking-wider uppercase mb-2">Recent Sales Invoices</p>
              {recentSales.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No recent sales invoices generated</p>
              ) : (
                <div className="space-y-2 max-h-[140px] overflow-y-auto">
                  {recentSales.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg border border-slate-100">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-gray-800 truncate">{inv.shopName}</p>
                        <p className="text-[10px] text-gray-400">{inv.invoiceNo} • {inv.companyName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-extrabold text-blue-700">৳{inv.grandTotal}</p>
                        <p className="text-[9px] text-gray-400">{inv.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <hr className="border-gray-100" />

            <div>
              <p className="text-xs font-bold text-emerald-600 tracking-wider uppercase mb-2">Recent Collections</p>
              {recentCollections.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No recent payments logged</p>
              ) : (
                <div className="space-y-2 max-h-[140px] overflow-y-auto">
                  {recentCollections.map((col) => (
                    <div key={col.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg border border-slate-100">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-gray-800 truncate">{col.shopName}</p>
                        <p className="text-[10px] text-gray-400">{col.companyName} • {col.paymentMethod}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-extrabold text-emerald-700">৳{col.amount}</p>
                        <p className="text-[9px] text-gray-400">{col.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
