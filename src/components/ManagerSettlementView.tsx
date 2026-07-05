/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Printer, 
  Coins, 
  ShoppingBag, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw,
  Award,
  BookOpen,
  CheckCircle,
  AlertTriangle,
  UserCheck,
  Eye,
  ChevronDown,
  X,
  FileText,
  Clock
} from 'lucide-react';
import { collection, getDocs, doc, setDoc, updateDoc, writeBatch, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SalesInvoice, Collection, Expense, Product, Supplier, Purchase, DailySettlement, UserRole, UserProfile } from '../types';
import { logActivity } from '../lib/activityLogger';

// Local interface for DSR Sheets matching DSRView
interface DSRSheetItem {
  productId: string;
  name: string;
  rate: number;
  cartonSize: number;
  assignedUnits: number;
  returnedUnits: number;
  soldUnits: number;
  totalAmount: number;
}

interface DSRSheet {
  id: string;
  dsrId: string;
  dsrName: string;
  route: string;
  date: string;
  status: 'assigned' | 'submitted_by_dsr' | 'reviewed_by_manager' | 'approved_by_admin' | 'closed';
  createdAt: string;
  closedAt?: string;
  invoiceIds: string[];
  items: DSRSheetItem[];
  reconciliation?: {
    netSales: number;
    totalDamage: number;
    totalFree: number;
    totalDiscount: number;
    totalCustomerDue: number;
    totalExpense: number;
    netDueDsr: number;
    cashReceived: number;
    shortage: number;
    damages: Array<{ productId: string; name: string; pieces: number; unitValue: number; totalValue: number }>;
    freeProducts: Array<{ productId: string; name: string; pieces: number; unitValue: number; totalValue: number }>;
    discounts: Array<{ productId: string; name: string; amount: number }>;
    expenses: Array<{ category: string; amount: number }>;
    customerDues: Array<{ customerId: string; customerName: string; shopName: string; companyId: string; companyName: string; amount: number }>;
  };
}

export default function ManagerSettlementView() {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  
  // Database States
  const [dsrSheets, setDsrSheets] = useState<DSRSheet[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [dailySettlements, setDailySettlements] = useState<DailySettlement[]>([]);
  
  // Configuration
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [adminTransferInput, setAdminTransferInput] = useState<number>(0);
  const [openingBalance, setOpeningBalance] = useState<number>(15000); // Dynamic Daily Opening
  
  // Interactive Drilldown States
  const [drilldownType, setDrilldownType] = useState<'dues' | 'collections' | 'free' | 'discounts' | 'expenses' | 'damages' | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load logged-in user role from session
      const userProfileLocal = localStorage.getItem('user_profile_cache');
      if (userProfileLocal) {
        try {
          setCurrentUser(JSON.parse(userProfileLocal));
        } catch (_) {}
      }

      // If cache not found, fall back to checking standard user in database
      const usersSnap = await getDocs(collection(db, 'users'));
      const activeUserSession = usersSnap.docs[0]?.data() as UserProfile; // Fallback
      if (!currentUser && activeUserSession) {
        setCurrentUser(activeUserSession);
      }

      const [sheetsSnap, colSnap, expSnap, prodSnap, supSnap, custSnap, settlementsSnap] = await Promise.all([
        getDocs(collection(db, 'dsrSheets')),
        getDocs(collection(db, 'collections')),
        getDocs(collection(db, 'expenses')),
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'suppliers')),
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'dailySettlements'))
      ]);

      const sheetsList: DSRSheet[] = [];
      sheetsSnap.forEach(d => sheetsList.push(d.data() as DSRSheet));
      setDsrSheets(sheetsList);

      const colList: Collection[] = [];
      colSnap.forEach(d => colList.push(d.data() as Collection));
      setCollections(colList);

      const expList: Expense[] = [];
      expSnap.forEach(d => expList.push(d.data() as Expense));
      setExpenses(expList);

      const prodList: Product[] = [];
      prodSnap.forEach(d => prodList.push(d.data() as Product));
      setProducts(prodList);

      const supList: Supplier[] = [];
      supSnap.forEach(d => supList.push(d.data() as Supplier));
      setSuppliers(supList);

      const custList: any[] = [];
      custSnap.forEach(d => custList.push({ id: d.id, ...d.data() }));
      setCustomers(custList);

      const settlementsList: DailySettlement[] = [];
      settlementsSnap.forEach(d => settlementsList.push(d.data() as DailySettlement));
      setDailySettlements(settlementsList);

    } catch (err) {
      console.error('Error loading settlement databases:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter relevant today's sheets and calculations
  const todaySheets = dsrSheets.filter(s => s.date === selectedDate);
  const activeOrPendingSheets = todaySheets.filter(s => s.status === 'submitted_by_dsr' || s.status === 'reviewed_by_manager');
  const approvedSheets = todaySheets.filter(s => s.status === 'approved_by_admin');
  
  // Find current daily settlement record if already saved
  const activeSettlement = dailySettlements.find(ds => ds.date === selectedDate);

  // --- SUPPLIER WISE BREAKDOWNS ---
  const calculateSupplierBreakdown = () => {
    return suppliers.map(sup => {
      let assignedValue = 0;
      let returnVal = 0;

      todaySheets.forEach(sheet => {
        if (!sheet.items || !sheet.reconciliation) return;
        sheet.items.forEach(it => {
          // Find if product belongs to company of supplier
          const prod = products.find(p => p.id === it.productId);
          if (prod && prod.companyId === sup.companyId) {
            assignedValue += it.assignedUnits * it.rate;
            returnVal += it.returnedUnits * it.rate;
          }
        });
      });

      const netSales = Math.max(0, assignedValue - returnVal);
      const returnPercent = assignedValue > 0 ? (returnVal / assignedValue) * 100 : 0;

      return {
        supplierId: sup.id,
        supplierName: sup.name,
        companyName: sup.companyName,
        assignedValue,
        returnVal,
        netSales,
        returnPercent
      };
    }).filter(s => s.assignedValue > 0); // Only suppliers with active load sheets today
  };

  const supplierBreakdowns = calculateSupplierBreakdown();
  const totalAssignedValue = supplierBreakdowns.reduce((s, r) => s + r.assignedValue, 0);
  const totalReturnValue = supplierBreakdowns.reduce((s, r) => s + r.returnVal, 0);
  const totalNetSalesValue = supplierBreakdowns.reduce((s, r) => s + r.netSales, 0);
  const overallReturnRate = totalAssignedValue > 0 ? (totalReturnValue / totalAssignedValue) * 100 : 0;

  // --- DETAILED AGGREGATES FOR CASH POSITION & DRILLDOWNS ---
  // Today's Sales value (computed as net sales)
  const todaySalesValue = totalNetSalesValue;

  // Old collections from previous dues collected today
  const todayOldCollections = collections
    .filter(c => c.date === selectedDate)
    .reduce((sum, c) => sum + c.amount, 0);

  // New Customer Dues generated from today's sheets
  const todayNewCustomerDues = todaySheets.reduce((sum, s) => {
    return sum + (s.reconciliation?.totalCustomerDue || 0);
  }, 0);

  // Free product values
  const todayFreeValue = todaySheets.reduce((sum, s) => {
    return sum + (s.reconciliation?.totalFree || 0);
  }, 0);

  // Discount values
  const todayDiscountValue = todaySheets.reduce((sum, s) => {
    return sum + (s.reconciliation?.totalDiscount || 0);
  }, 0);

  // DSR Expenses
  const todayDsrExpenses = todaySheets.reduce((sum, s) => {
    return sum + (s.reconciliation?.totalExpense || 0);
  }, 0);

  // General office expenses recorded directly today
  const todayDirectExpenses = expenses
    .filter(e => e.date === selectedDate && e.category !== 'ROUTE')
    .reduce((sum, e) => sum + e.amount, 0);

  const totalExpenses = todayDsrExpenses + todayDirectExpenses;

  // Damages
  const todayDamageValue = todaySheets.reduce((sum, s) => {
    return sum + (s.reconciliation?.totalDamage || 0);
  }, 0);

  // --- COMPARISON GRIDS (Yesterday vs Today) ---
  const getComparisonData = () => {
    // Yesterday Date String
    const prevDateObj = new Date(selectedDate);
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    const yesterdayStr = prevDateObj.toISOString().split('T')[0];

    // Yesterday's customer dues (static starting reference 100000 + previous dynamic settlements)
    const yesterdaySettlement = dailySettlements.find(ds => ds.date === yesterdayStr);
    const yesterdayDues = yesterdaySettlement ? yesterdaySettlement.totalCustomerDue : 100000;

    // Yesterday's inventory selling value
    const totalInventoryValue = products.reduce((sum, p) => sum + (p.stockCount * p.retailPrice), 0);
    const yesterdayInventoryVal = yesterdaySettlement ? (yesterdaySettlement.todaySalesValue * 40) : 5500000;

    // Today's closing inventory = Total current inventory selling value + today's damages returned
    const todayClosingInventoryVal = totalInventoryValue + todayDamageValue;

    // Closing customer dues calculation: Yesterday Dues - Collections + New Dues
    const todayClosingCustomerDue = Math.max(0, yesterdayDues - todayOldCollections + todayNewCustomerDues);

    return {
      yesterdayInventoryVal,
      todayClosingInventoryVal,
      yesterdayDues,
      todayClosingCustomerDue,
      yesterdayExpenses: yesterdaySettlement ? yesterdaySettlement.totalExpenses : 1200,
      closingExpenses: totalExpenses,
      yesterdayDamages: yesterdaySettlement ? yesterdaySettlement.totalDamageValue : 1500,
      closingDamages: todayDamageValue,
      yesterdayDiscounts: yesterdaySettlement ? yesterdaySettlement.totalDiscountValue : 800,
      closingDiscounts: todayDiscountValue
    };
  };

  const comparisons = getComparisonData();

  // --- MANAGER'S BALANCE AND SHORT CALCULATIONS ---
  // Formula: Net Sales + Dues Collections - New Dues - Free - Discounts - Expenses - Damages
  const calculatedManagerBalance = Math.max(0, 
    todaySalesValue + todayOldCollections - todayNewCustomerDues - todayFreeValue - todayDiscountValue - totalExpenses - todayDamageValue
  );

  // Short calculation
  const currentAdminTransfer = activeSettlement ? activeSettlement.adminTransfer : adminTransferInput;
  const currentShortage = Math.max(0, calculatedManagerBalance - currentAdminTransfer);

  // --- INTERACTIVE DRILLDOWNS CONTEXT DATA ---
  const getDrilldownContent = () => {
    const list: Array<{ title: string; subtitle: string; value: number }> = [];

    switch (drilldownType) {
      case 'dues':
        todaySheets.forEach(sheet => {
          if (!sheet.reconciliation?.customerDues) return;
          sheet.reconciliation.customerDues.forEach(c => {
            list.push({
              title: `${c.shopName} (${c.customerName})`,
              subtitle: `Route: ${sheet.route} | Company: ${c.companyName || 'Samira Traders'}`,
              value: c.amount
            });
          });
        });
        break;

      case 'collections':
        collections.filter(c => c.date === selectedDate).forEach(c => {
          list.push({
            title: `${c.shopName} (${c.customerName})`,
            subtitle: `Collected By: ${c.collectedByName} | Method: ${c.paymentMethod}`,
            value: c.amount
          });
        });
        break;

      case 'free':
        todaySheets.forEach(sheet => {
          if (!sheet.reconciliation?.freeProducts) return;
          sheet.reconciliation.freeProducts.forEach(f => {
            list.push({
              title: f.name,
              subtitle: `Given by DSR: ${sheet.dsrName} | Route: ${sheet.route}`,
              value: f.pieces
            });
          });
        });
        break;

      case 'discounts':
        todaySheets.forEach(sheet => {
          if (!sheet.reconciliation?.discounts) return;
          sheet.reconciliation.discounts.forEach(d => {
            list.push({
              title: d.name,
              subtitle: `Discount on product in route: ${sheet.route}`,
              value: d.amount
            });
          });
        });
        break;

      case 'expenses':
        // DSR Sheet expenses
        todaySheets.forEach(sheet => {
          if (!sheet.reconciliation?.expenses) return;
          sheet.reconciliation.expenses.forEach(e => {
            if (e.amount > 0) {
              list.push({
                title: `${e.category} - DSR Route Expense`,
                subtitle: `Route: ${sheet.route} | DSR: ${sheet.dsrName}`,
                value: e.amount
              });
            }
          });
        });
        // Direct office/admin expenses
        expenses.filter(e => e.date === selectedDate && e.category !== 'ROUTE').forEach(e => {
          list.push({
            title: e.title,
            subtitle: `Category: ${e.category} | Description: ${e.description}`,
            value: e.amount
          });
        });
        break;

      case 'damages':
        todaySheets.forEach(sheet => {
          if (!sheet.reconciliation?.damages) return;
          sheet.reconciliation.damages.forEach(d => {
            list.push({
              title: d.name,
              subtitle: `Rate: ৳${d.unitValue} per piece | DSR: ${sheet.dsrName}`,
              value: d.pieces
            });
          });
        });
        break;
    }

    return list;
  };

  // --- MANAGER SUBMIT TO ADMIN ---
  const handleManagerSubmit = async () => {
    if (adminTransferInput <= 0) {
      alert('দয়া করে এডমিন একাউন্টে ট্রান্সফার টাকার পরিমাণ সঠিকভাবে প্রবেশ করান!');
      return;
    }

    if (!window.confirm('আপনি কি আজকের সমন্বিত ডেইলি সেটেলমেন্ট এডমিন অনুমোদনের জন্য পাঠাতে চান?')) {
      return;
    }

    try {
      setLoading(true);
      const batch = writeBatch(db);

      const settlementId = `settlement-${selectedDate}`;
      const newSettlement: DailySettlement = {
        id: settlementId,
        date: selectedDate,
        status: 'submitted',
        openingBalance,
        todaySalesValue,
        todayCollection: todayOldCollections,
        totalCustomerDue: todayNewCustomerDues,
        totalFreeValue: todayFreeValue,
        totalDiscountValue: todayDiscountValue,
        totalExpenses,
        totalDamageValue: todayDamageValue,
        managerBalance: calculatedManagerBalance,
        adminTransfer: adminTransferInput,
        shortage: currentShortage,
        submittedBy: currentUser?.id || 'manager_id',
        submittedByName: currentUser?.name || 'Manager Office',
        submittedAt: new Date().toISOString(),
        sheetIds: todaySheets.map(s => s.id),
        supplierDetails: supplierBreakdowns
      };

      // 1. Create Settlement document
      batch.set(doc(db, 'dailySettlements', settlementId), newSettlement);

      // 2. Mark DSR sheets as reviewed_by_manager
      todaySheets.forEach(sheet => {
        if (sheet.status === 'submitted_by_dsr') {
          batch.update(doc(db, 'dsrSheets', sheet.id), {
            status: 'reviewed_by_manager'
          });
        }
      });

      await batch.commit();
      alert('আজকের ডেইলি সেটেলমেন্ট এডমিন প্যানেলে যাচাই ও বুকিংয়ের জন্য পাঠানো হয়েছে!');
      loadData();
    } catch (err) {
      console.error('Error submitting daily settlement:', err);
      alert('সেটেলমেন্ট সাবমিট করতে সমস্যা হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  // --- ADMIN APPROVE & LEDGER POSTING ENGINE (CRITICAL MODULE) ---
  const handleAdminApprove = async () => {
    const targetSettlement = activeSettlement;
    if (!targetSettlement) return;

    if (!window.confirm('আপনি কি এই ডেইলি সেটেলমেন্ট এবং সমন্বিত সকল লেনদেন চূড়ান্ত বুকিং করতে চান? এটি ইনভেন্টরি হ্রাস এবং লেজার খতিয়ান আপডেট করবে।')) {
      return;
    }

    try {
      setLoading(true);
      const usersSnap = await getDocs(collection(db, 'users'));
      const batch = writeBatch(db);

      // 1. Approve Settlement document
      batch.update(doc(db, 'dailySettlements', targetSettlement.id), {
        status: 'approved',
        approvedBy: currentUser?.id || 'admin_id',
        approvedByName: currentUser?.name || 'Super Admin',
        approvedAt: new Date().toISOString()
      });

      // 2. Loop through sheets associated with today
      for (const sheet of todaySheets) {
        if (sheet.status === 'reviewed_by_manager' || sheet.status === 'submitted_by_dsr') {
          // A. Update sheet status
          batch.update(doc(db, 'dsrSheets', sheet.id), {
            status: 'approved_by_admin'
          });

          // B. Stock Deductions (Defer adjustment completed here)
          if (sheet.items) {
            sheet.items.forEach(it => {
              const matchedProduct = products.find(p => p.id === it.productId);
              if (matchedProduct) {
                const currentStock = matchedProduct.stockCount;
                const newStock = Math.max(0, currentStock - it.soldUnits);
                batch.update(doc(db, 'products', it.productId), {
                  stockCount: newStock
                });
              }
            });
          }

          // C. Save DSR Expenses to general expenses collection
          if (sheet.reconciliation?.expenses) {
            sheet.reconciliation.expenses.forEach(e => {
              if (e.amount > 0) {
                const expId = `exp-dsr-${sheet.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                batch.set(doc(db, 'expenses', expId), {
                  id: expId,
                  title: `DSR Expense - ${e.category} (${sheet.dsrName})`,
                  category: 'ROUTE',
                  amount: Number(e.amount),
                  description: `Auto-logged from approved route "${sheet.route}" DSR checkout.`,
                  date: sheet.date,
                  routeName: sheet.route,
                  staffId: sheet.dsrId,
                  staffName: sheet.dsrName,
                  createdAt: new Date().toISOString()
                });
              }
            });
          }

          // D. Customer outstanding dues adjustments & Customer ledger entries
          if (sheet.reconciliation?.customerDues) {
            sheet.reconciliation.customerDues.forEach(c => {
              if (c.amount > 0) {
                const cust = customers.find(custObj => custObj.id === c.customerId);
                if (cust) {
                  const currentDues = cust.dues || {};
                  const prevDue = currentDues[c.companyId] || 0;
                  const updatedCompanyDue = prevDue + c.amount;
                  const updatedDues = {
                    ...currentDues,
                    [c.companyId]: updatedCompanyDue
                  };
                  const updatedTotalDue = Object.values(updatedDues).reduce((s: number, val: unknown) => s + (Number(val) || 0), 0);

                  batch.update(doc(db, 'customers', c.customerId), {
                    dues: updatedDues,
                    totalDue: updatedTotalDue
                  });

                  // Log customer ledger entry
                  const ledgerEntryId = `ledger-dsr-${sheet.id}-${c.customerId}`;
                  batch.set(doc(db, 'ledgers', ledgerEntryId), {
                    id: ledgerEntryId,
                    customerId: c.customerId,
                    companyId: c.companyId,
                    companyName: 'Samira Traders',
                    type: 'INVOICE',
                    referenceId: sheet.id,
                    referenceNo: `DSR-${sheet.id.slice(-5).toUpperCase()}`,
                    date: sheet.date,
                    amount: c.amount,
                    balanceAfter: updatedCompanyDue,
                    createdAt: new Date().toISOString()
                  });
                }
              }
            });
          }

          // E. Mark Associated Invoices as PAID
          if (sheet.invoiceIds) {
            sheet.invoiceIds.forEach(invId => {
              batch.update(doc(db, 'sales', invId), {
                status: 'PAID',
                paymentReceived: sheet.reconciliation?.netSales || 0
              });
            });
          }

          // F. Shortages DSR ledger entries
          if (sheet.reconciliation && sheet.reconciliation.shortage > 0) {
            const shortageEntryId = `ledger-dsr-short-${sheet.id}-${Date.now()}`;
            batch.set(doc(db, 'staffLedgers', shortageEntryId), {
              id: shortageEntryId,
              staffId: sheet.dsrId,
              staffName: sheet.dsrName,
              staffRole: 'DSR',
              type: 'SHORTAGE',
              referenceId: sheet.id,
              referenceNo: `DSR-${sheet.id.slice(-5).toUpperCase()}`,
              date: sheet.date,
              amount: sheet.reconciliation.shortage,
              balanceAfter: sheet.reconciliation.shortage,
              remarks: `DSR Route Shortage shortage recorded from Route ${sheet.route}`,
              createdAt: new Date().toISOString()
            });
          }
        }
      }

      // 3. Subtract Manager Shortage & write to Manager Ledger as Advance Salary
      if (targetSettlement.shortage > 0) {
        const mgrLedgerId = `ledger-mgr-short-${targetSettlement.id}-${Date.now()}`;
        batch.set(doc(db, 'staffLedgers', mgrLedgerId), {
          id: mgrLedgerId,
          staffId: targetSettlement.submittedBy,
          staffName: targetSettlement.submittedByName,
          staffRole: 'Manager',
          type: 'SALARY_ADVANCE',
          referenceId: targetSettlement.id,
          referenceNo: `SETTLE-${targetSettlement.id.slice(-5).toUpperCase()}`,
          date: targetSettlement.date,
          amount: targetSettlement.shortage,
          balanceAfter: targetSettlement.shortage,
          remarks: `Manager daily transfer cash shortage logged as salary advance. Approval ID: ${targetSettlement.id}`,
          createdAt: new Date().toISOString()
        });

        // Update manager's user profile outstanding shortages
        const managerRef = doc(db, 'users', targetSettlement.submittedBy);
        // Find if user profile exists from fetched usersSnap
        const managerObj = usersSnap.docs.find(u => u.id === targetSettlement.submittedBy)?.data() as UserProfile | undefined;
        const prevShortage = managerObj?.outstandingShortage || 0;
        batch.update(managerRef, {
          outstandingShortage: prevShortage + targetSettlement.shortage
        });
      }

      await batch.commit();

      // Log completion activity
      await logActivity(
        currentUser?.id || 'admin_id',
        currentUser?.name || 'Super Admin',
        UserRole.SUPER_ADMIN,
        'PAYMENT_ENTRY',
        `Approved consolidated daily settlement for ${selectedDate}. Net Sales: ৳${targetSettlement.todaySalesValue}, Admin Transfer: ৳${targetSettlement.adminTransfer}, Manager Short: ৳${targetSettlement.shortage}`,
        { settlementId: targetSettlement.id }
      );

      alert('সমন্বিত ডেইলি সেটেলমেন্ট চূড়ান্তভাবে অনুমোদিত হয়েছে! ইনভেন্টরি, মার্কেট খতিয়ান, এবং ম্যানেজার লেজারে বেতন অগ্রিম পোস্টিং করা হয়েছে।');
      loadData();
    } catch (err) {
      console.error('Error approving daily settlement:', err);
      alert('সেটেলমেন্ট অনুমোদন করতে ব্যর্থ হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6" id="manager-settlement-module">
      
      {/* Drilldown modal wrapper */}
      {drilldownType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative border border-gray-100">
            <button 
              onClick={() => setDrilldownType(null)} 
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-black text-slate-900 mb-4 flex items-center uppercase tracking-wide border-b pb-2">
              <FileText className="w-5 h-5 text-blue-600 mr-2" />
              <span>
                {drilldownType === 'dues' ? 'বাকি বিবরণী (Dues Breakdown)' :
                 drilldownType === 'collections' ? 'কালেকশন বিবরণী (Collections)' :
                 drilldownType === 'free' ? 'ফ্রি প্রোডাক্ট বিবরণী (Free Products)' :
                 drilldownType === 'discounts' ? 'ডিসকাউন্ট বিবরণী (Discounts)' :
                 drilldownType === 'expenses' ? 'খরচ বিবরণী (Expenses)' :
                 'ড্যামেজ রিটার্ন বিবরণী (Damages)'}
              </span>
            </h3>

            <div className="max-h-96 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
              {getDrilldownContent().length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-8">আজ এই খাতের কোনো রেকর্ড দাখিল করা হয়নি।</p>
              ) : (
                getDrilldownContent().map((item, index) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-xl">
                    <div>
                      <p className="font-bold text-xs text-slate-800">{item.title}</p>
                      <p className="text-[10px] text-gray-400">{item.subtitle}</p>
                    </div>
                    <span className="font-mono font-bold text-xs text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">
                      {drilldownType === 'free' || drilldownType === 'damages' ? `${item.value} পিস` : `৳${item.value.toLocaleString()}`}
                    </span>
                  </div>
                ))
              )}
            </div>
            
            <div className="mt-5 pt-3 border-t flex justify-end">
              <button 
                onClick={() => setDrilldownType(null)} 
                className="bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-xl"
              >
                বন্ধ করুন (Close)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900 flex items-center space-x-2">
            <FileSpreadsheet className="w-6 h-6 text-blue-600" />
            <span>ম্যানেজার প্যানেল ও সমন্বিত ডেইলি সেটেলমেন্ট (Daily Settlement Desk)</span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            আজকের রুটের মোট বিক্রি, কালেকশন, ড্যামেজ ও খরচের সমাপনী হিসাব মিলিয়ে এডমিন অনুমোদন ও খতিয়ান বুকিং করুন।
          </p>
        </div>
        <div className="flex space-x-2 items-center">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="p-2.5 bg-white border border-gray-200 rounded-lg text-xs font-mono font-bold text-slate-700"
          />
          <button
            onClick={loadData}
            className="flex items-center justify-center p-2.5 bg-white border border-gray-200 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>প্রিন্ট করুন (Print Report)</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-gray-100 shadow-sm">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-xs text-gray-500">Reconciling ledger flows...</p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* Workflow Status Warning Bar */}
          <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-blue-800">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>
                আজকের দিনে <strong>{todaySheets.length}টি DSR লোডশীট</strong> আছে। অবস্থা: {' '}
                <strong>{todaySheets.filter(s => s.status === 'assigned').length}টি সক্রিয় (Active)</strong>, {' '}
                <strong>{todaySheets.filter(s => s.status === 'submitted_by_dsr').length}টি দাখিলকৃত (Submitted)</strong>, {' '}
                <strong>{todaySheets.filter(s => s.status === 'reviewed_by_manager').length}টি রিভিউড (Reviewed)</strong>, {' '}
                <strong>{todaySheets.filter(s => s.status === 'approved_by_admin').length}টি চূড়ান্ত বুকড (Approved)</strong>.
              </span>
            </div>
            {activeSettlement && (
              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider ${
                activeSettlement.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-orange-100 text-orange-800 border border-orange-200 animate-pulse'
              }`}>
                সেটেলমেন্ট অবস্থা: {activeSettlement.status === 'approved' ? 'APPROVED & BOOKED' : 'PENDING ADMIN APPROVAL'}
              </span>
            )}
          </div>

          {/* 1. SUPPLIER WISE BREAKDOWN SECTION */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-extrabold text-sm text-slate-800 flex items-center">
                <ShoppingBag className="w-4 h-4 text-blue-600 mr-2" />
                <span>সাপ্লাইয়ার ওয়াইজ ডেলিভারি ও রিকনসিলিয়েশন (Supplier Wise Product Summary)</span>
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 text-[10px] text-gray-500 font-bold uppercase tracking-wider border-b border-gray-100 font-mono">
                  <tr>
                    <th className="p-4">সাপ্লাইয়ার (Supplier Partner)</th>
                    <th className="p-4">ব্র্যান্ড কোম্পানি (Brand)</th>
                    <th className="p-4 text-right">এ্যাসাইন প্রোডাক্ট মূল্য (Assigned Value)</th>
                    <th className="p-4 text-right">রিটার্ন প্রোডাক্ট মূল্য (Returned Value)</th>
                    <th className="p-4 text-right">নেট বিক্রি (Net Sales Value)</th>
                    <th className="p-4 text-center">রিটার্নের হার (Return %)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-slate-700">
                  {supplierBreakdowns.map(row => (
                    <tr key={row.supplierId} className="hover:bg-slate-50/40">
                      <td className="p-4 font-bold text-slate-900">{row.supplierName}</td>
                      <td className="p-4 text-gray-500">{row.companyName}</td>
                      <td className="p-4 text-right font-mono font-bold text-slate-900">৳{row.assignedValue.toLocaleString()}</td>
                      <td className="p-4 text-right font-mono text-rose-600">- ৳{row.returnVal.toLocaleString()}</td>
                      <td className="p-4 text-right font-mono font-black text-blue-700">৳{row.netSales.toLocaleString()}</td>
                      <td className="p-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold ${
                          row.returnPercent > 10 ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        }`}>
                          {row.returnPercent.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  
                  {/* TOTAL SUM ROW */}
                  {supplierBreakdowns.length > 0 && (
                    <tr className="bg-slate-50 font-black text-slate-900 border-t">
                      <td className="p-4" colSpan={2}>মোট হিসাব (CONSOLIDATED TOTAL)</td>
                      <td className="p-4 text-right font-mono">৳{totalAssignedValue.toLocaleString()}</td>
                      <td className="p-4 text-right font-mono text-rose-600">- ৳{totalReturnValue.toLocaleString()}</td>
                      <td className="p-4 text-right font-mono text-emerald-700">৳{totalNetSalesValue.toLocaleString()}</td>
                      <td className="p-4 text-center">
                        <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-bold">
                          {overallReturnRate.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  )}

                  {supplierBreakdowns.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-gray-400 italic">
                        আজকের দিনে কোনো DSR বিকেলে রিটার্ন জমা দেয়নি অথবা লোডশীট ক্লোজ করা হয়নি।
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. COMPARISON STATS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            
            {/* Inventory Comparitive Card */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs font-black text-slate-800 uppercase">ইনভেন্টরি বিক্রয় ভ্যালু</span>
                <span className="text-[10px] font-bold text-gray-400">Inventory Status</span>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-gray-400 font-bold uppercase">গতকাল (Yesterday)</p>
                <h4 className="text-sm font-bold font-mono text-slate-700">৳{comparisons.yesterdayInventoryVal.toLocaleString()}</h4>
              </div>
              <div className="space-y-1 border-t pt-2 text-blue-700">
                <p className="text-[10px] text-blue-500 font-bold uppercase">আজকের ক্লোজিং স্টক (Closing)</p>
                <h4 className="text-lg font-black font-mono">৳{comparisons.todayClosingInventoryVal.toLocaleString()}</h4>
              </div>
              <p className="text-[9px] text-gray-400 italic">আজকের স্টক ভ্যালু + ড্যামেজ সামগ্রীর স্টক ভ্যালু</p>
            </div>

            {/* Customer Due Comparitive Card */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs font-black text-slate-800 uppercase">কাস্টমার মোট বাকি</span>
                <span className="text-[10px] font-bold text-gray-400">Customer Outstanding</span>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-gray-400 font-bold uppercase">গতকাল (Yesterday)</p>
                <h4 className="text-sm font-bold font-mono text-slate-700">৳{comparisons.yesterdayDues.toLocaleString()}</h4>
              </div>
              <div className="space-y-1 border-t pt-2 text-orange-700">
                <p className="text-[10px] text-orange-500 font-bold uppercase">আজকের ক্লোজিং বাকি (Closing)</p>
                <h4 className="text-lg font-black font-mono">৳{comparisons.todayClosingCustomerDue.toLocaleString()}</h4>
              </div>
              <p className="text-[9px] text-gray-400 italic">গতকাল বাকি - কালেকশন + আজকের নতুন বাকি</p>
            </div>

            {/* Direct Expense Comparative Card */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs font-black text-slate-800 uppercase">মার্কেট ও অফিস খরচ</span>
                <span className="text-[10px] font-bold text-gray-400">Unified Expenses</span>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-gray-400 font-bold uppercase">গতকাল (Yesterday)</p>
                <h4 className="text-sm font-bold font-mono text-slate-700">৳{comparisons.yesterdayExpenses.toLocaleString()}</h4>
              </div>
              <div className="space-y-1 border-t pt-2 text-rose-700">
                <p className="text-[10px] text-rose-500 font-bold uppercase">আজকের মোট খরচ (Today)</p>
                <h4 className="text-lg font-black font-mono">৳{comparisons.closingExpenses.toLocaleString()}</h4>
              </div>
              <p className="text-[9px] text-gray-400 italic">DSR রুট খরচ + অফিসের সরাসরি রেকর্ডকৃত খরচ</p>
            </div>

            {/* Damages Comparative Card */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs font-black text-slate-800 uppercase">ড্যামেজ ও রিটার্ন ভ্যালু</span>
                <span className="text-[10px] font-bold text-gray-400">Damages & Returns</span>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-gray-400 font-bold uppercase">গতকাল (Yesterday)</p>
                <h4 className="text-sm font-bold font-mono text-slate-700">৳{comparisons.yesterdayDamages.toLocaleString()}</h4>
              </div>
              <div className="space-y-1 border-t pt-2 text-slate-700">
                <p className="text-[10px] text-slate-500 font-bold uppercase">আজকের ড্যামেজ (Today)</p>
                <h4 className="text-lg font-black font-mono">৳{comparisons.closingDamages.toLocaleString()}</h4>
              </div>
              <p className="text-[9px] text-gray-400 italic">আজ বিকেল বেলার চেকআউটে সংগৃহীত ড্যামেজ স্টক</p>
            </div>

          </div>

          {/* 3. CASH POSITION CALCULATION DESK */}
          <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-3">
              <div>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block">Operational Cash Desk</span>
                <h3 className="text-lg font-extrabold text-white">আজকের মোট ক্যাশ রিকনসিলিয়েশন হিসাব (Daily Cash Balance)</h3>
              </div>
              
              <div className="flex items-center space-x-2 bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-xl text-xs text-slate-300">
                <span>আজকের প্রারম্ভিক ক্যাশ (Opening Till):</span>
                <input
                  type="number"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(Math.max(0, parseFloat(e.target.value) || 0))}
                  disabled={!!activeSettlement}
                  className="w-20 bg-slate-950 border border-slate-700 text-white text-center rounded text-xs font-bold font-mono py-0.5 px-1 focus:outline-none"
                />
              </div>
            </div>

            {/* Calculations items with click-to-view details indicators */}
            <div className="grid grid-cols-2 md:grid-cols-7 gap-3 text-xs">
              
              <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-800/50">
                <span className="text-[9px] text-slate-400 font-bold uppercase block tracking-wider mb-1">আজকের মোট সেলস</span>
                <span className="text-base font-black font-mono">৳{todaySalesValue.toLocaleString()}</span>
              </div>

              {/* Dues Collection - Click to view customers who paid today */}
              <button 
                onClick={() => setDrilldownType('collections')}
                className="p-4 bg-emerald-950/20 rounded-2xl border border-emerald-900/30 hover:border-emerald-600 transition-all text-left group"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">কাস্টমার কালেকশন (+)</span>
                  <Eye className="w-3.5 h-3.5 text-emerald-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="text-base font-black font-mono text-emerald-300">৳{todayOldCollections.toLocaleString()}</span>
              </button>

              {/* Customer Due - Click to view due lists */}
              <button 
                onClick={() => setDrilldownType('dues')}
                className="p-4 bg-amber-950/20 rounded-2xl border border-amber-900/30 hover:border-amber-600 transition-all text-left group"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[9px] text-amber-400 font-bold uppercase tracking-wider">কাস্টমার মোট বাকি (-)</span>
                  <Eye className="w-3.5 h-3.5 text-amber-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="text-base font-black font-mono text-amber-300">- ৳{todayNewCustomerDues.toLocaleString()}</span>
              </button>

              {/* Free Products - Click to view free list */}
              <button 
                onClick={() => setDrilldownType('free')}
                className="p-4 bg-purple-950/20 rounded-2xl border border-purple-900/30 hover:border-purple-600 transition-all text-left group"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[9px] text-purple-400 font-bold uppercase tracking-wider">ফ্রি প্রোডাক্ট (-)</span>
                  <Eye className="w-3.5 h-3.5 text-purple-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="text-base font-black font-mono text-purple-300">- ৳{todayFreeValue.toLocaleString()}</span>
              </button>

              {/* Discounts - Click to view discounts */}
              <button 
                onClick={() => setDrilldownType('discounts')}
                className="p-4 bg-indigo-950/20 rounded-2xl border border-indigo-900/30 hover:border-indigo-600 transition-all text-left group"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider">মোট ডিসকাউন্ট (-)</span>
                  <Eye className="w-3.5 h-3.5 text-indigo-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="text-base font-black font-mono text-indigo-300">- ৳{todayDiscountValue.toLocaleString()}</span>
              </button>

              {/* Expenses - Click to view expenses list */}
              <button 
                onClick={() => setDrilldownType('expenses')}
                className="p-4 bg-rose-950/20 rounded-2xl border border-rose-900/30 hover:border-rose-600 transition-all text-left group"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[9px] text-rose-400 font-bold uppercase tracking-wider">মার্কেট খরচ (-)</span>
                  <Eye className="w-3.5 h-3.5 text-rose-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="text-base font-black font-mono text-rose-300">- ৳{totalExpenses.toLocaleString()}</span>
              </button>

              {/* Damage return - Click to view damages returned */}
              <button 
                onClick={() => setDrilldownType('damages')}
                className="p-4 bg-slate-800/40 rounded-2xl border border-slate-700/30 hover:border-slate-500 transition-all text-left group"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">ড্যামেজ রিটার্ন (-)</span>
                  <Eye className="w-3.5 h-3.5 text-slate-400 opacity-50 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="text-base font-black font-mono text-slate-300">- ৳{todayDamageValue.toLocaleString()}</span>
              </button>

            </div>

            {/* Final Cash Equation Panel */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-800/60 items-center">
              
              {/* Calculated manager balance */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-blue-400 font-extrabold uppercase tracking-wider block">ম্যানেজার একাউন্টে ব্যালেন্স (Manager Balance)</span>
                <div className="text-2xl font-black font-mono text-white">৳{calculatedManagerBalance.toLocaleString()}</div>
                <p className="text-[9px] text-slate-500 italic">আজকের প্রদেয় নেট নগদ কালেকশন যা ম্যানেজারের ক্যাশে থাকার কথা।</p>
              </div>

              {/* Input for Admin Transfer */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                <label className="block text-[10px] text-emerald-400 font-extrabold uppercase tracking-wider">এডমিন একাউন্টে ট্রান্সফার (Admin Transfer Amount) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-500 text-xs font-bold">৳</span>
                  <input
                    type="number"
                    placeholder="এডমিনকে বুঝিয়ে দেওয়া নগদ টাকার পরিমাণ"
                    value={activeSettlement ? activeSettlement.adminTransfer : (adminTransferInput || '')}
                    onChange={(e) => setAdminTransferInput(Math.max(0, parseFloat(e.target.value) || 0))}
                    disabled={!!activeSettlement}
                    className="w-full bg-slate-900 border border-slate-800 text-emerald-300 pl-7 pr-3 py-2.5 rounded-xl text-sm focus:outline-none focus:border-emerald-500 font-bold font-mono"
                  />
                </div>
              </div>

              {/* Output for Shortage */}
              <div className={`p-4 rounded-2xl border space-y-1 ${
                currentShortage > 0 ? 'bg-red-950/20 border-red-900/40 text-red-300' : 'bg-emerald-950/20 border-emerald-900/40 text-emerald-300'
              }`}>
                <span className="text-[10px] font-extrabold uppercase tracking-wider block">আজকের শর্ট / ঘাটতি (Today's Cash Short)</span>
                <div className="text-2xl font-black font-mono">৳{currentShortage.toLocaleString()}</div>
                <p className="text-[9px] opacity-75 italic">
                  {currentShortage > 0 
                    ? 'ঘাটতি টাকা রয়েছে! এটি অনুমোদন সাবমিট করলে স্বয়ংক্রিয়ভাবে ম্যানেজারের বেতন খতিয়ানে অগ্রিম বা শর্ট ট্রান্সফার হিসেবে পোস্টিং হবে।' 
                    : 'ক্যাশ ব্যালেন্স সম্পূর্ণ মিলেছে! কোনো ঘাটতি টাকা নেই।'}
                </p>
              </div>

            </div>

            {/* Balance formula details text */}
            <p className="text-[10px] text-slate-500 text-center italic font-mono">
              ক্যালকুলেশন মেথড: আজকের মোট নেট বিক্রি (৳{todaySalesValue.toLocaleString()}) + পূর্বের বকেয়া কালেকশন (৳{todayOldCollections.toLocaleString()}) - নতুন কাস্টমার বাকি (৳{todayNewCustomerDues.toLocaleString()}) - ফ্রী প্রোডাক্ট (৳{todayFreeValue.toLocaleString()}) - ডিসকাউন্ট (৳{todayDiscountValue.toLocaleString()}) - মার্কেট খরচ (৳{totalExpenses.toLocaleString()}) - ড্যামেজ রিটার্ন (৳{todayDamageValue.toLocaleString()}) = ৳{calculatedManagerBalance.toLocaleString()}
            </p>
          </div>

          {/* 4. TOTAL RESPONSIBILITIES & SIGNATURES SECTION */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-center bg-slate-50 p-5 rounded-2xl border border-slate-100">
              <div className="space-y-1">
                <span className="text-[10px] text-gray-400 font-bold uppercase block tracking-wider">ম্যানেজারের কাছে টোটাল ইনভেন্টরি ভ্যালু</span>
                <h4 className="text-lg font-black text-slate-800 font-mono">৳{comparisons.todayClosingInventoryVal.toLocaleString()}</h4>
              </div>
              <div className="space-y-1 border-y md:border-y-0 md:border-x py-3 md:py-0">
                <span className="text-[10px] text-gray-400 font-bold uppercase block tracking-wider">মার্কেট বা কাস্টমার বকেয়া খতিয়ান বাকি</span>
                <h4 className="text-lg font-black text-slate-800 font-mono">৳{comparisons.todayClosingCustomerDue.toLocaleString()}</h4>
              </div>
              <div className="space-y-1 text-slate-900">
                <span className="text-[10px] text-blue-600 font-bold uppercase block tracking-wider">ম্যানেজারের কাছে মোট দায়বদ্ধতা (পাওনা)</span>
                <h4 className="text-xl font-black text-blue-700 font-mono">৳{(comparisons.todayClosingInventoryVal + comparisons.todayClosingCustomerDue).toLocaleString()}</h4>
              </div>
            </div>

            {/* Workflow Action Panel based on User Role */}
            <div className="flex justify-end space-x-3 pt-4 border-t items-center bg-slate-50/40 p-4 rounded-2xl border border-slate-100">
              
              {/* If no settlement recorded yet today, allow submission (Manager / Admin can submit) */}
              {!activeSettlement ? (
                <>
                  <span className="text-xs text-gray-500 italic mr-2">
                    * আজকের সেটেলমেন্ট ড্রাফট অবস্থায় রয়েছে। অনুগ্রহ করে এডমিন অনুমোদনের জন্য সাবমিট করুন।
                  </span>
                  <button
                    onClick={handleManagerSubmit}
                    className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-xl text-xs shadow-lg shadow-blue-500/10 cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>ম্যানেজার যাচাই পূর্বক সাবমিট করুন (Submit to Admin)</span>
                  </button>
                </>
              ) : activeSettlement.status === 'submitted' ? (
                // If submitted, show action buttons
                <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-3">
                  <div className="flex items-center space-x-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span>আজকের ডেইলি সেটেলমেন্ট এডমিন যাচাইয়ের জন্য অপেক্ষমাণ।</span>
                  </div>
                  
                  {/* Admin role can approve */}
                  {currentUser?.role === UserRole.SUPER_ADMIN ? (
                    <button
                      onClick={handleAdminApprove}
                      className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-xl text-xs shadow-lg shadow-emerald-500/15 cursor-pointer"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>চূড়ান্ত অনুমোদন ও বুকিং (Approve & Finalize)</span>
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400 italic">
                      * চূড়ান্ত বুকিং অনুমোদন করার অনুমতি কেবল এডমিনের রয়েছে।
                    </span>
                  )}
                </div>
              ) : (
                // Approved state
                <div className="flex items-center space-x-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-xl w-full justify-center font-bold">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>এই ডেইলি সেটেলমেন্ট ও ক্যাশ রিকনসিলিয়েশন এডমিন কর্তৃক চূড়ান্ত অনুমোদিত ও পোস্টিং সম্পূর্ণ হয়েছে! (Approved & Posted)</span>
                </div>
              )}

            </div>

            {/* Physical Signatures Section matching Samira Traders corporate ledger requirements */}
            <div className="pt-16 grid grid-cols-2 gap-8 text-xs text-slate-500 text-center">
              <div className="space-y-1.5">
                <div className="border-t border-dashed border-gray-400 w-44 mx-auto pt-2" />
                <p className="font-bold">ম্যানেজারের স্বাক্ষর</p>
                <p className="text-[10px] text-gray-400">ম্যানেজার ডেইলি সেটেলমেন্ট ডেস্ক</p>
              </div>
              <div className="space-y-1.5">
                <div className="border-t border-dashed border-gray-400 w-44 mx-auto pt-2" />
                <p className="font-bold">এডমিন/প্রোপাইটারের স্বাক্ষর</p>
                <p className="text-[10px] text-gray-400">সামীরা ট্রেডার্স ডিস্ট্রিবিউশন</p>
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
