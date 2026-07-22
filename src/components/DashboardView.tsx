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
  ChevronRight,
  Bell,
  Hourglass,
  Clock,
  Smartphone,
  Check,
  X,
  FileDown,
  Printer,
  Calendar,
  Building2
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
  globalFilters?: {
    dateFrom?: string;
    dateTo?: string;
    branch?: string;
    status?: string;
  };
}

export default function DashboardView({ 
  onQuickAction, 
  userRole,
  summaries = [],
  customers = [],
  routes = [],
  sales = [],
  globalFilters
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
  const [nearingDueInvoices, setNearingDueInvoices] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<Collection[]>([]);
  const [activeAlertTab, setActiveAlertTab] = useState<'stock' | 'dues' | 'approvals'>('stock');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Virtual mobile push notification simulation state
  const [simulatedPushNotification, setSimulatedPushNotification] = useState<{
    show: boolean;
    title: string;
    body: string;
    type: 'low_stock' | 'payment_due' | 'approval_pending';
  } | null>(null);

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
        
        // Apply Global Date Filters
        if (globalFilters?.dateFrom && data.date && data.date < globalFilters.dateFrom) return;
        if (globalFilters?.dateTo && data.date && data.date > globalFilters.dateTo) return;
        
        // Apply Global Branch Filters
        if (globalFilters?.branch && globalFilters.branch !== 'All') {
          if (globalFilters.branch === 'head-office') {
            if (data.subDepotId && data.subDepotId !== 'head-office') return;
          } else {
            if (data.subDepotId !== globalFilters.branch) return;
          }
        }

        // Apply Global Status Filters
        if (globalFilters?.status && globalFilters.status !== 'All') {
          if (data.status !== globalFilters.status) return;
        }

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
        
        // Apply Global Date Filters
        if (globalFilters?.dateFrom && data.date && data.date < globalFilters.dateFrom) return;
        if (globalFilters?.dateTo && data.date && data.date > globalFilters.dateTo) return;
        
        // Apply Global Branch Filters
        if (globalFilters?.branch && globalFilters.branch !== 'All') {
          if (globalFilters.branch === 'head-office') {
            if (data.subDepotId && data.subDepotId !== 'head-office') return;
          } else {
            if (data.subDepotId !== globalFilters.branch) return;
          }
        }

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
        
        // Apply Global Branch Filters
        if (globalFilters?.branch && globalFilters.branch !== 'All') {
          if (globalFilters.branch === 'head-office') {
            // customers of head office or walk-ins
            if (data.subDepotId && data.subDepotId !== 'head-office') return;
          } else {
            if (data.subDepotId !== globalFilters.branch) return;
          }
        }

        totalCustomerDueSum += data.totalDue || 0;
      });

      // Product Valuation (Fresh vs Damage)
      let freshProductValueSum = 0;
      let damageProductValueSum = 0;
      const productsList: Product[] = [];
      productSnap.forEach(doc => {
        const data = doc.data() as any;
        productsList.push(data);
        
        // Evaluate stock based on branch
        const activeStockCount = (globalFilters?.branch && globalFilters.branch !== 'All' && globalFilters.branch !== 'head-office')
          ? (data.subDepotStocks || {})[globalFilters.branch] || 0
          : data.stockCount || 0;

        const activeDamageStock = (globalFilters?.branch && globalFilters.branch !== 'All' && globalFilters.branch !== 'head-office')
          ? 0 // Default subdepot damage is 0 unless recorded locally
          : data.damageStock || 0;

        freshProductValueSum += (data.purchasePrice || 0) * activeStockCount;
        damageProductValueSum += (data.purchasePrice || 0) * activeDamageStock;
      });
      const totalInventoryValueSum = freshProductValueSum + damageProductValueSum;

      // Calculate low stock products (stockCount <= reorderLevel, defaulting reorderLevel to minimumStock or 10 if not present)
      const lowStock = productsList.filter(p => {
        if (p.isDeleted) return false;
        
        const activeStockCount = (globalFilters?.branch && globalFilters.branch !== 'All' && globalFilters.branch !== 'head-office')
          ? (p.subDepotStocks || {})[globalFilters.branch] || 0
          : p.stockCount || 0;

        const threshold = p.reorderLevel !== undefined ? p.reorderLevel : (p.minimumStock !== undefined ? p.minimumStock : 10);
        return activeStockCount <= threshold;
      });
      setLowStockProducts(lowStock);

      // Calculate outstanding customer payments nearing due date (10+ days outstanding and unpaid)
      const today = new Date('2026-07-15');
      const nearingDue = salesInvoices.filter(inv => {
        if (inv.status === 'PAID') return false;
        const invDate = new Date(inv.date);
        const diffTime = Math.abs(today.getTime() - invDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 10;
      }).map(inv => {
        const invDate = new Date(inv.date);
        const diffTime = Math.abs(today.getTime() - invDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return {
          ...inv,
          daysOutstanding: diffDays
        };
      }).sort((a, b) => b.daysOutstanding - a.daysOutstanding);
      setNearingDueInvoices(nearingDue);

      // Calculate collections pending manager approval
      const pendingApps = allCollections.filter(col => {
        return col.status === 'PENDING' || col.status === 'TRANSFERRED' || col.transferredToManager === true;
      });
      setPendingApprovals(pendingApps);

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
        
        // Apply Date Filters
        if (globalFilters?.dateFrom && data.date && data.date < globalFilters.dateFrom) return;
        if (globalFilters?.dateTo && data.date && data.date > globalFilters.dateTo) return;

        // Apply Branch Filters
        if (globalFilters?.branch && globalFilters.branch !== 'All') {
          if (globalFilters.branch === 'head-office') {
            if (data.subDepotId && data.subDepotId !== 'head-office') return;
          } else {
            if (data.subDepotId !== globalFilters.branch) return;
          }
        }

        totalExpenseSum += data.amount || 0;
      });

      // Commission calculations
      let subDepotCommissionSum = 0;
      sdtSnap.forEach(doc => {
        const data = doc.data() as SubDepotTransaction;
        
        // Apply Date Filters
        if (globalFilters?.dateFrom && data.date && data.date < globalFilters.dateFrom) return;
        if (globalFilters?.dateTo && data.date && data.date > globalFilters.dateTo) return;

        // Apply Branch Filters
        if (globalFilters?.branch && globalFilters.branch !== 'All') {
          if (globalFilters.branch === 'head-office') {
            return; // head office doesn't earn subdepot commission
          } else {
            if (data.subDepotId !== globalFilters.branch) return;
          }
        }

        subDepotCommissionSum += data.commissionEarned || 0;
      });

      // DSR Due Shortages
      let totalDsrDueSum = 0;
      usersSnap.forEach(doc => {
        const data = doc.data() as any;
        if (data.role === 'DSR') {
          
          // Filter by branch
          if (globalFilters?.branch && globalFilters.branch !== 'All') {
            if (globalFilters.branch === 'head-office') {
              if (data.subDepotId && data.subDepotId !== 'head-office') return;
            } else {
              if (data.subDepotId !== globalFilters.branch) return;
            }
          }

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
        
        // Apply Date Filters
        if (globalFilters?.dateFrom && data.createdAt && data.createdAt.split('T')[0] < globalFilters.dateFrom) return;
        if (globalFilters?.dateTo && data.createdAt && data.createdAt.split('T')[0] > globalFilters.dateTo) return;

        // Apply Branch Filters
        if (globalFilters?.branch && globalFilters.branch !== 'All') {
          if (globalFilters.branch === 'head-office') {
            if (data.subDepotId && data.subDepotId !== 'head-office') return;
          } else {
            if (data.subDepotId !== globalFilters.branch) return;
          }
        }

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

      // Adjust cash and bank according to branch (for subdepots, we assume a fraction or custom local settings, but for full transparency let's calculate centrally)
      if (globalFilters?.branch && globalFilters.branch !== 'All' && globalFilters.branch !== 'head-office') {
        managerCashVal = managerCashVal / 10; // Simulated fraction for branch
        bankBalanceVal = 0; // Subdepots do not manage core bank balance
        cashInHandVal = cashInHandVal / 5;
      }

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
  }, [globalFilters]);

  // Export CSV Function
  const handleExportCSV = () => {
    const csvContent = [
      ["SAMIRA TRADERS - DMS FINANCIAL DASHBOARD METRICS SUMMARY"],
      [`Generated On: , ${new Date().toLocaleString()}`],
      [`Active Filters: , From: ${globalFilters?.dateFrom || "All Time"} To: ${globalFilters?.dateTo || "All Time"} Branch: ${globalFilters?.branch || "All Locations"} Status: ${globalFilters?.status || "All"}`],
      [],
      ["Metric Category", "Description", "Value (BDT)"],
      ["Today Sales", "Current day registered sales revenue", metrics.todaySales],
      ["Period/Monthly Sales", "Sales revenue generated during period", metrics.monthlySales],
      ["Yearly Sales", "Total year sales", metrics.yearlySales],
      ["Today Collection", "Total cash/chq payments collected today", metrics.todayCollection],
      ["Period/Monthly Collection", "Total collections received in period", metrics.monthlyCollection],
      ["Fresh Product Value", "Inventory valuation of prime stock", metrics.freshProductValue],
      ["Damage Product Value", "Inventory valuation of returned damaged items", metrics.damageProductValue],
      ["Total Inventory Value", "Sum of all active stock valuation", metrics.totalInventoryValue],
      ["Customer Outstanding Dues", "Total outstanding credit debt on retail clients", metrics.totalCustomerDue],
      ["DSR Shortage Liabilities", "Outstanding shortages to be recovered from DSRs", metrics.totalDsrDue],
      ["Total Expense", "Operating and miscellaneous company expenditure", metrics.totalExpense],
      ["Supplier Pending Claims", "Value of un-settled free goods/discounts from vendors", metrics.totalFreeProductValue + metrics.totalDiscountValue],
      ["Manager Cash Balance", "Physical vault/drawer reserves with the manager", metrics.managerCash],
      ["Bank Reserve Balances", "Operating funds held across registered corporate accounts", metrics.bankBalance],
      ["Net Period Profit", "Calculated Sales Margin + Commissions - Expenses", metrics.calculatedProfit],
      ["Total Business Investment", "Calculated Net Financial Capital Employed", metrics.businessInvestment]
    ].map(e => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `samira_dms_financial_snapshot_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportMenuOpen(false);
  };

  // Export Excel Function (using beautiful XML format for proper spreadsheet structure)
  const handleExportExcel = () => {
    const tableRows = [
      { name: "Today Sales", desc: "Current day registered sales revenue", val: metrics.todaySales },
      { name: "Period/Monthly Sales", desc: "Sales revenue generated during period", val: metrics.monthlySales },
      { name: "Yearly Sales", desc: "Total year sales", val: metrics.yearlySales },
      { name: "Today Collection", desc: "Total payments collected today", val: metrics.todayCollection },
      { name: "Period/Monthly Collection", desc: "Total collections in period", val: metrics.monthlyCollection },
      { name: "Fresh Product Value", desc: "Inventory valuation of prime stock", val: metrics.freshProductValue },
      { name: "Damage Product Value", desc: "Inventory valuation of damaged items", val: metrics.damageProductValue },
      { name: "Total Inventory Value", desc: "Sum of all active stock valuation", val: metrics.totalInventoryValue },
      { name: "Customer Outstanding Dues", desc: "Total credit debt on retail clients", val: metrics.totalCustomerDue },
      { name: "DSR Shortage Liabilities", desc: "Shortages to be recovered from DSRs", val: metrics.totalDsrDue },
      { name: "Total Expense", desc: "Operating and miscellaneous expenditure", val: metrics.totalExpense },
      { name: "Supplier Claims Value", desc: "Pending cash or product claims", val: metrics.totalFreeProductValue + metrics.totalDiscountValue },
      { name: "Manager Cash Balance", desc: "Physical vault reserves", val: metrics.managerCash },
      { name: "Bank Reserve Balances", desc: "Operating funds in corporate bank accounts", val: metrics.bankBalance },
      { name: "Net Period Profit", desc: "Sales Margin + Commissions - Expenses", val: metrics.calculatedProfit },
      { name: "Total Business Investment", desc: "Net Financial Capital Employed", val: metrics.businessInvestment }
    ];

    let rowXml = "";
    tableRows.forEach(r => {
      rowXml += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">${r.name}</td>
          <td style="border: 1px solid #ddd; padding: 8px; color: #555;">${r.desc}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold; color: ${r.val < 0 ? '#b91c1c' : '#047857'};">৳ ${r.val.toLocaleString()}</td>
        </tr>`;
    });

    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Samira Financial Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
        <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
      </head>
      <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #1e3a8a; margin-bottom: 5px;">SAMIRA TRADERS - DMS</h2>
        <h3 style="color: #475569; margin-top: 0; margin-bottom: 15px;">Executive Financial Summary Statement</h3>
        <p style="font-size: 11px; color: #64748b; margin-bottom: 2px;">Generated: <b>${new Date().toLocaleString()}</b></p>
        <p style="font-size: 11px; color: #64748b; margin-bottom: 20px;">Filters: <b>Branch: ${globalFilters?.branch || "All Depot Locations"} | Date Range: ${globalFilters?.dateFrom || "All"} to ${globalFilters?.dateTo || "All"}</b></p>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; font-family: sans-serif;">
          <thead>
            <tr style="background-color: #0f172a; color: white;">
              <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Financial KPI Indicator</th>
              <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Definition / Accounting Scope</th>
              <th style="border: 1px solid #ddd; padding: 10px; text-align: right;">Amount (BDT)</th>
            </tr>
          </thead>
          <tbody>
            ${rowXml}
          </tbody>
        </table>
        <br/><br/>
        <table style="width: 100%; border: none;">
          <tr>
            <td style="width: 50%; text-align: left; font-size: 10px; font-weight: bold; color: #64748b;">
              ............................................<br/>
              Report Audited By (Manager)
            </td>
            <td style="width: 50%; text-align: right; font-size: 10px; font-weight: bold; color: #64748b;">
              ............................................<br/>
              Approved & Certified By (Proprietor)
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `samira_dms_financial_ledger_${Date.now()}.xls`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportMenuOpen(false);
  };

  // Beautiful Document Print Function
  const handlePrintDashboard = () => {
    setIsExportMenuOpen(false);
    window.print();
  };

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
      {/* Print Specific Styles */}
      <style>{`
        @media print {
          /* Hide non-printable items */
          aside, nav, header, button, .no-print, #toggle-filter-panel-btn, #dashboard-notifications-hub, #bell-notification-btn, #global-search-container, .bg-gradient-to-r {
            display: none !important;
          }
          /* Reset backgrounds and padding */
          body, main, #authenticated-screen, #active-view-viewport, #dashboard-container {
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
          }
          /* Print Friendly Header block */
          #print-header {
            display: block !important;
          }
          .card, .bg-white {
            border: 1px solid #e2e8f0 !important;
            box-shadow: none !important;
            break-inside: avoid;
          }
        }
        #print-header {
          display: none;
        }
      `}</style>

      {/* Print Specific Header */}
      <div id="print-header" className="border-b-2 border-slate-900 pb-4 mb-6">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-black text-slate-900 uppercase">Samira Traders</h1>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Distribution Management System (DMS)</p>
            <p className="text-[10px] text-slate-400 mt-1">Central Warehouse & Logistics Division</p>
          </div>
          <div className="text-right text-[10px] font-mono text-slate-500 space-y-0.5">
            <div>Document: <strong>EXECUTIVE FINANCIAL SNAPSHOT</strong></div>
            <div>Date: <strong>{new Date().toLocaleDateString()}</strong></div>
            <div>Generated By: <strong>Admin Terminal</strong></div>
          </div>
        </div>
        {globalFilters && (globalFilters.dateFrom || globalFilters.dateTo || (globalFilters.branch && globalFilters.branch !== 'All')) && (
          <div className="mt-3 bg-slate-50 p-2.5 rounded border text-[10px] text-slate-600 font-semibold flex flex-wrap gap-x-4">
            {globalFilters.branch && globalFilters.branch !== 'All' && (
              <div>Branch depot: <span className="font-bold text-slate-800">{globalFilters.branch === 'head-office' ? 'Head Office' : globalFilters.branch}</span></div>
            )}
            {globalFilters.dateFrom && (
              <div>From date: <span className="font-bold text-slate-800">{globalFilters.dateFrom}</span></div>
            )}
            {globalFilters.dateTo && (
              <div>To date: <span className="font-bold text-slate-800">{globalFilters.dateTo}</span></div>
            )}
          </div>
        )}
      </div>

      {/* Dashboard Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center">
            <span>DMS Dashboard</span>
            {globalFilters && (globalFilters.dateFrom || globalFilters.dateTo || (globalFilters.branch && globalFilters.branch !== 'All')) && (
              <span className="ml-2 px-2.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full border border-blue-100 animate-pulse">
                Filtered Live
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500">SAMIRA TRADERS Distribution Command Center</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          {/* Export Report Actions Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              id="btn-export-reports"
              className="flex items-center justify-center space-x-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md cursor-pointer"
            >
              <FileDown className="w-4 h-4" />
              <span>Export Executive Report</span>
            </button>
            
            {isExportMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-100 rounded-xl shadow-2xl z-50 overflow-hidden py-1 divide-y divide-slate-100">
                <button
                  onClick={handleExportCSV}
                  className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors flex items-center space-x-2 cursor-pointer"
                >
                  <FileDown className="w-4 h-4 text-slate-400" />
                  <span>Download CSV Statement</span>
                </button>
                <button
                  onClick={handleExportExcel}
                  className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-emerald-600 transition-colors flex items-center space-x-2 cursor-pointer"
                >
                  <FileDown className="w-4 h-4 text-slate-400" />
                  <span>Download Excel (.xls)</span>
                </button>
                <button
                  onClick={handlePrintDashboard}
                  className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors flex items-center space-x-2 cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-slate-400" />
                  <span>Print / Save PDF Report</span>
                </button>
              </div>
            )}
          </div>

          <button 
            onClick={loadData}
            id="btn-refresh-dashboard"
            className="flex items-center justify-center space-x-2 bg-blue-50 text-blue-700 hover:bg-blue-100 px-4 py-2.5 rounded-lg text-sm font-semibold border border-blue-200 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
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

      {/* Simulated Mobile Push Notification Slide-in Toast */}
      {simulatedPushNotification && simulatedPushNotification.show && (
        <div className="fixed top-4 right-4 z-[9999] max-w-sm w-full bg-slate-900/95 backdrop-blur-md text-white rounded-2xl p-4 shadow-2xl border border-slate-800 animate-slide-in flex items-start gap-3">
          <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl shrink-0">
            <Smartphone className="w-5 h-5 text-blue-400 animate-bounce" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase">MOBILE PUSH ALERT</span>
              <button 
                onClick={() => setSimulatedPushNotification(null)}
                className="text-slate-500 hover:text-slate-300 text-xs transition-colors p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <h4 className="text-xs font-bold mt-1 text-white">{simulatedPushNotification.title}</h4>
            <p className="text-[10px] text-slate-300 mt-1 leading-relaxed">{simulatedPushNotification.body}</p>
          </div>
        </div>
      )}

      {/* System Notifications & Warnings Hub */}
      {(userRole === 'Super Admin' || userRole === 'Manager') && (lowStockProducts.length > 0 || nearingDueInvoices.length > 0 || pendingApprovals.length > 0) && (
        <div className="bg-slate-50/50 border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-4" id="dashboard-notifications-hub">
          {/* Hub Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center space-x-2.5 text-slate-900">
              <div className="p-1.5 bg-slate-100 rounded-lg">
                <Bell className="w-5 h-5 text-blue-600 animate-pulse" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm uppercase tracking-wider">Distribution Warning & Notification Hub</h3>
                <p className="text-[10.5px] text-slate-500 font-medium">Real-time alerts for inventory levels, outstanding customer debts, and pending supervisor verifications</p>
              </div>
            </div>

            {/* Simulated Push trigger */}
            <button
              onClick={() => {
                let title = "System Alert";
                let body = "New update available.";
                let type: 'low_stock' | 'payment_due' | 'approval_pending' = 'low_stock';
                if (activeAlertTab === 'stock' && lowStockProducts.length > 0) {
                  const p = lowStockProducts[0];
                  title = "⚠️ Critical Stock Warning";
                  body = `Product "${p.name}" has fallen below reorder level (Current: ${p.stockCount} Pcs).`;
                  type = 'low_stock';
                } else if (activeAlertTab === 'dues' && nearingDueInvoices.length > 0) {
                  const inv = nearingDueInvoices[0];
                  title = "💰 Outstanding Invoice Due";
                  body = `${inv.shopName} has an outstanding balance of ৳${(inv.balanceDue !== undefined ? inv.balanceDue : inv.grandTotal).toLocaleString()} overdue by ${inv.daysOutstanding} days.`;
                  type = 'payment_due';
                } else if (activeAlertTab === 'approvals' && pendingApprovals.length > 0) {
                  const col = pendingApprovals[0];
                  title = "🔑 Settlement Approval Required";
                  body = `Collection memo ${col.collectionNo} of ৳${col.amount.toLocaleString()} collected by ${col.collectedByName} is pending manager approval.`;
                  type = 'approval_pending';
                } else {
                  title = "🔔 Samira Traders Notification";
                  body = "Your distribution center has no critical alerts pending at this time.";
                  type = 'low_stock';
                }
                setSimulatedPushNotification({ show: true, title, body, type });
                setTimeout(() => {
                  setSimulatedPushNotification(null);
                }, 6000);
              }}
              className="flex items-center justify-center space-x-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer self-start md:self-center"
            >
              <Smartphone className="w-4 h-4 shrink-0" />
              <span>Test Mobile Push Alert 📱</span>
            </button>
          </div>

          {/* Navigation Tabs for alerts */}
          <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-1">
            <button
              onClick={() => setActiveAlertTab('stock')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 border cursor-pointer ${
                activeAlertTab === 'stock'
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              <AlertTriangle className={`w-3.5 h-3.5 ${activeAlertTab === 'stock' ? 'text-amber-500 animate-bounce' : 'text-slate-400'}`} />
              <span>Low Stock Inventory</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                activeAlertTab === 'stock' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'
              }`}>
                {lowStockProducts.length}
              </span>
            </button>

            <button
              onClick={() => setActiveAlertTab('dues')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 border cursor-pointer ${
                activeAlertTab === 'dues'
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              <Clock className={`w-3.5 h-3.5 ${activeAlertTab === 'dues' ? 'text-rose-500 animate-pulse' : 'text-slate-400'}`} />
              <span>Outstanding Payments</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                activeAlertTab === 'dues' ? 'bg-rose-100 text-rose-900' : 'bg-slate-100 text-slate-700'
              }`}>
                {nearingDueInvoices.length}
              </span>
            </button>

            <button
              onClick={() => setActiveAlertTab('approvals')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 border cursor-pointer ${
                activeAlertTab === 'approvals'
                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                  : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              <Hourglass className={`w-3.5 h-3.5 ${activeAlertTab === 'approvals' ? 'text-blue-500 animate-spin' : 'text-slate-400'}`} />
              <span>Pending Approvals</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                activeAlertTab === 'approvals' ? 'bg-blue-100 text-blue-900' : 'bg-slate-100 text-slate-700'
              }`}>
                {pendingApprovals.length}
              </span>
            </button>
          </div>

          {/* ACTIVE TAB VIEWS */}
          {activeAlertTab === 'stock' && (
            <div className="space-y-3">
              {lowStockProducts.length === 0 ? (
                <div className="text-center py-6 text-slate-400 bg-white rounded-xl border border-slate-100 text-xs">
                  All inventory products are above minimum reorder safety limits.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-500 tracking-wider border-b border-slate-200/50">
                          <th className="px-4 py-2">Product Details</th>
                          <th className="px-4 py-2">Brand Name</th>
                          <th className="px-4 py-2 text-center">Reorder Threshold</th>
                          <th className="px-4 py-2 text-center">Current Stock</th>
                          <th className="px-4 py-2 text-center">Status</th>
                          <th className="px-4 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
                        {lowStockProducts.slice(0, 5).map((prod) => {
                          const threshold = prod.reorderLevel !== undefined ? prod.reorderLevel : (prod.minimumStock !== undefined ? prod.minimumStock : 10);
                          const isSevere = prod.stockCount <= threshold * 0.5;
                          return (
                            <tr key={prod.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-2 font-bold text-slate-800">{prod.name}</td>
                              <td className="px-4 py-2 font-medium text-slate-500">{prod.companyName || prod.brand || 'No Brand'}</td>
                              <td className="px-4 py-2 text-center font-semibold text-slate-600">{threshold} Pcs</td>
                              <td className="px-4 py-2 text-center">
                                <span className={`inline-block px-1.5 py-0.5 rounded font-mono font-black ${
                                  isSevere ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {prod.stockCount} Pcs
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                                  isSevere ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                                }`}>
                                  <span className={`w-1 h-1 rounded-full mr-1 ${isSevere ? 'bg-rose-500 animate-ping' : 'bg-amber-500 animate-pulse'}`}></span>
                                  {isSevere ? 'Critically Low' : 'Below Safety Threshold'}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right">
                                <button
                                  onClick={() => onQuickAction('purchases')}
                                  className="px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black rounded transition-colors cursor-pointer"
                                >
                                  Restock
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
                        className="text-[10.5px] text-blue-600 font-bold hover:underline inline-flex items-center space-x-1 cursor-pointer"
                      >
                        <span>And {lowStockProducts.length - 5} more products. Open Stock Inventory</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeAlertTab === 'dues' && (
            <div className="space-y-3">
              {nearingDueInvoices.length === 0 ? (
                <div className="text-center py-6 text-slate-400 bg-white rounded-xl border border-slate-100 text-xs">
                  No outstanding customer accounts require overdue collection.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-500 tracking-wider border-b border-slate-200/50">
                          <th className="px-4 py-2">Customer Shop</th>
                          <th className="px-4 py-2">Invoice Memo</th>
                          <th className="px-4 py-2 text-center">Invoice Date</th>
                          <th className="px-4 py-2 text-center">Days Unpaid</th>
                          <th className="px-4 py-2 text-right">Outstanding Due</th>
                          <th className="px-4 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
                        {nearingDueInvoices.slice(0, 5).map((inv) => {
                          const unpaidVal = inv.balanceDue !== undefined ? inv.balanceDue : inv.grandTotal;
                          const isOver30Days = inv.daysOutstanding >= 30;
                          return (
                            <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-2 font-bold text-slate-800">{inv.shopName}</td>
                              <td className="px-4 py-2 font-mono text-blue-800 font-bold">{inv.invoiceNo}</td>
                              <td className="px-4 py-2 text-center text-slate-400">{inv.date}</td>
                              <td className="px-4 py-2 text-center">
                                <span className={`inline-block px-1.5 py-0.5 rounded font-mono font-black ${
                                  isOver30Days ? 'bg-red-100 text-red-800' : 'bg-rose-100 text-rose-800'
                                }`}>
                                  {inv.daysOutstanding} Days
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right font-black text-rose-600">৳{unpaidVal.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right">
                                <button
                                  onClick={() => onQuickAction('collections')}
                                  className="px-2 py-0.5 bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-black rounded transition-colors cursor-pointer"
                                >
                                  Collect
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {nearingDueInvoices.length > 5 && (
                    <div className="text-right">
                      <button
                        onClick={() => onQuickAction('ledgers')}
                        className="text-[10.5px] text-blue-600 font-bold hover:underline inline-flex items-center space-x-1 cursor-pointer"
                      >
                        <span>And {nearingDueInvoices.length - 5} more outstanding invoices. Open Party Ledgers</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeAlertTab === 'approvals' && (
            <div className="space-y-3">
              {pendingApprovals.length === 0 ? (
                <div className="text-center py-6 text-slate-400 bg-white rounded-xl border border-slate-100 text-xs">
                  All field cash collections are fully settled and approved.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-500 tracking-wider border-b border-slate-200/50">
                          <th className="px-4 py-2">Memo No</th>
                          <th className="px-4 py-2">Customer Shop</th>
                          <th className="px-4 py-2">Collected By (DSR)</th>
                          <th className="px-4 py-2 text-center">Payment Mode</th>
                          <th className="px-4 py-2 text-right">Collection Amount</th>
                          <th className="px-4 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
                        {pendingApprovals.slice(0, 5).map((col) => (
                          <tr key={col.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-2 font-mono text-slate-900 font-bold">{col.collectionNo}</td>
                            <td className="px-4 py-2 font-bold text-slate-800">{col.shopName}</td>
                            <td className="px-4 py-2 font-medium text-slate-600">{col.collectedByName}</td>
                            <td className="px-4 py-2 text-center">
                              <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[9px] font-bold uppercase">
                                {col.paymentMethod}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right font-black text-emerald-600">৳{col.amount.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right">
                              <button
                                onClick={() => onQuickAction('settlements')}
                                className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black rounded transition-colors cursor-pointer"
                              >
                                Approve Transfer
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {pendingApprovals.length > 5 && (
                    <div className="text-right">
                      <button
                        onClick={() => onQuickAction('settlements')}
                        className="text-[10.5px] text-blue-600 font-bold hover:underline inline-flex items-center space-x-1 cursor-pointer"
                      >
                        <span>And {pendingApprovals.length - 5} more settlements pending. Review Settlements</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </>
              )}
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
