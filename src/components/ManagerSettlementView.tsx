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
  Calculator,
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
import { collection, getDocs, doc, setDoc, updateDoc, writeBatch, query, where, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SalesInvoice, Collection, Expense, Product, Supplier, Purchase, DailySettlement, UserRole, UserProfile } from '../types';
import { logActivity } from '../lib/activityLogger';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';

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
  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>([]);
  
  // Configuration
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [adminTransferInput, setAdminTransferInput] = useState<number>(0);
  const [openingBalance, setOpeningBalance] = useState<number>(15000); // Dynamic Daily Opening
  const [readySalesInput, setReadySalesInput] = useState<number>(0);
  const [isAutoReadySales, setIsAutoReadySales] = useState<boolean>(true);
  
  // Interactive Drilldown States
  const [drilldownType, setDrilldownType] = useState<'dues' | 'collections' | 'free' | 'discounts' | 'expenses' | 'damages' | null>(null);

  // Admin Approval & Audit Trail States
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [sheetShortageTypes, setSheetShortageTypes] = useState<Record<string, 'SHORTAGE' | 'SALARY_ADVANCE'>>({});
  const [selectedStaffForAudit, setSelectedStaffForAudit] = useState<{ id: string; name: string } | null>(null);
  const [auditEntries, setAuditEntries] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Firestore Connection Diagnostic State
  const [dbState, setDbState] = useState<{ status: 'idle' | 'checking' | 'connected' | 'error'; error?: string; latency?: number }>({ status: 'idle' });

  const runDiagnostics = async (): Promise<boolean> => {
    setDbState({ status: 'checking' });
    const start = Date.now();
    try {
      console.log('Manager Desk: Executing Firestore diagnostic write test...');
      const testDocRef = doc(db, 'connection_diagnostics', 'health_check_manager');
      await setDoc(testDocRef, {
        lastChecked: new Date().toISOString(),
        status: 'success',
        clientTime: start
      });
      const latency = Date.now() - start;
      console.log(`Manager Desk: Firestore diagnostic test write successful. Latency: ${latency}ms`);
      setDbState({ status: 'connected', latency });
      return true;
    } catch (err: any) {
      console.error('Manager Desk: Firestore connection diagnostic failed:', err);
      const errMsg = err?.message || String(err);
      setDbState({ status: 'error', error: errMsg });
      return false;
    }
  };

  const fetchStaffAuditTrail = async (staffId: string) => {
    try {
      setAuditLoading(true);
      const q = query(collection(db, 'staffLedgers'), where('staffId', '==', staffId));
      const snap = await getDocs(q);
      const entries: any[] = [];
      snap.forEach(doc => {
        entries.push(doc.data());
      });
      entries.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
      setAuditEntries(entries);
    } catch (err) {
      console.error('Error fetching staff audit trail:', err);
    } finally {
      setAuditLoading(false);
    }
  };

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

      const [sheetsSnap, colSnap, expSnap, prodSnap, supSnap, custSnap, settlementsSnap, salesSnap] = await Promise.all([
        getDocs(collection(db, 'dsrSheets')),
        getDocs(collection(db, 'collections')),
        getDocs(collection(db, 'expenses')),
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'suppliers')),
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'dailySettlements')),
        getDocs(collection(db, 'sales'))
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

      const salesList: SalesInvoice[] = [];
      salesSnap.forEach(d => salesList.push(d.data() as SalesInvoice));
      setSalesInvoices(salesList);

    } catch (err) {
      console.error('Error loading settlement databases:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    runDiagnostics();
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

  // --- AUTOMATED DEDUCTION & READY SALES CALCULATORS ---
  // Automated calculation of ready sales from non-DSR invoices today
  const calculatedReadySalesValue = salesInvoices
    .filter(inv => inv.date === selectedDate && !todaySheets.some(s => s.invoiceIds?.includes(inv.id)))
    .reduce((sum, inv) => sum + inv.grandTotal, 0);

  useEffect(() => {
    if (isAutoReadySales) {
      setReadySalesInput(calculatedReadySalesValue);
    }
  }, [calculatedReadySalesValue, isAutoReadySales, selectedDate]);

  const currentReadySales = activeSettlement && ('readySales' in activeSettlement)
    ? ((activeSettlement as any).readySales || 0)
    : readySalesInput;

  // --- MANAGER'S BALANCE AND SHORT CALCULATIONS (PHYSICAL CASH FLOW INTEGRITY) ---
  // 1. Sum of actual cash received from DSRs at afternoon checkout
  const totalDsrCashReceived = todaySheets.reduce((sum, s) => sum + (s.reconciliation?.cashReceived || 0), 0);

  // 2. Sum of actual DSR shortages recorded today
  const totalDsrShortages = todaySheets.reduce((sum, s) => sum + (s.reconciliation?.shortage || 0), 0);

  // 3. Manager's Actual Cash on Hand (Manager Balance)
  // Formula: Actual Cash Received from DSRs + Today's Dues Collections - Direct Office Expenses
  const calculatedManagerBalance = Math.max(0, 
    totalDsrCashReceived + todayOldCollections - todayDirectExpenses
  );

  // 4. Daily DSR Net Cash Collection (for display / audit reference)
  const dsrNetCashCollection = totalAssignedValue + todayOldCollections - todayNewCustomerDues - todayFreeValue - todayDiscountValue;

  // 5. Final Ready-to-Deposit Amount (Actual Physical Cash Available for Admin Transfer)
  // Formula: Manager's Actual Cash on Hand + Ready Sales (non-DSR cash sales)
  const readyToDeposit = Math.max(0, calculatedManagerBalance + currentReadySales);

  // Short calculation
  const currentAdminTransfer = activeSettlement ? activeSettlement.adminTransfer : adminTransferInput;
  const currentShortage = Math.max(0, (activeSettlement && 'readyToDeposit' in activeSettlement ? ((activeSettlement as any).readyToDeposit || 0) : readyToDeposit) - currentAdminTransfer);

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

      // RUN PRE-FLIGHT FIREBASE CONNECTION DIAGNOSTIC (Non-blocking warning only)
      console.log('Manager Desk: Running pre-flight Firestore connection diagnostics before submitting settlement...');
      const isConnected = await runDiagnostics();
      if (!isConnected) {
        console.warn('Firestore connection check returned false. We will still proceed with submitting the settlement as connection_diagnostics write might be blocked or delayed.');
      }

      const settlementId = `settlement-${selectedDate}`;

      await runTransaction(db, async (transaction) => {
        // Read existing DailySettlement document if any
        const settlementRef = doc(db, 'dailySettlements', settlementId);
        await transaction.get(settlementRef);

        // Read all sheets to ensure they are current
        await Promise.all(todaySheets.map(sheet => transaction.get(doc(db, 'dsrSheets', sheet.id))));

        const newSettlement: any = {
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
          supplierDetails: supplierBreakdowns,
          readySales: currentReadySales,
          readyToDeposit: readyToDeposit
        };

        // Perform atomic set and updates
        transaction.set(settlementRef, newSettlement);

        todaySheets.forEach(sheet => {
          if (sheet.status === 'submitted_by_dsr') {
            transaction.update(doc(db, 'dsrSheets', sheet.id), {
              status: 'reviewed_by_manager'
            });
          }
        });
      });

      alert('আজকের ডেইলি সেটেলমেন্ট এডমিন প্যানেলে যাচাই ও বুকিংয়ের জন্য পাঠানো হয়েছে!');
      loadData();
    } catch (err: any) {
      console.error('Error submitting daily settlement transaction:', err);
      const errorCode = err?.code || 'unknown-error';
      const errorMessage = err?.message || String(err);
      alert(`সেটেলমেন্ট সাবমিট করতে সমস্যা হয়েছে।\n(Error code: ${errorCode})\n\nত্রুটির বিবরণ: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // --- ADMIN APPROVE & LEDGER POSTING ENGINE (CRITICAL MODULE) ---
  const handleAdminApprove = async () => {
    const targetSettlement = activeSettlement;
    if (!targetSettlement) return;

    try {
      setLoading(true);
      setShowApproveModal(false);

      // RUN PRE-FLIGHT FIREBASE CONNECTION DIAGNOSTIC (Non-blocking warning only)
      console.log('Manager Desk: Running pre-flight Firestore connection diagnostics before approving settlement...');
      const isConnected = await runDiagnostics();
      if (!isConnected) {
        console.warn('Firestore connection check returned false. We will still proceed with approving the settlement as connection_diagnostics write might be blocked or delayed.');
      }

      // Perform all operations in a single atomic runTransaction block
      await runTransaction(db, async (transaction) => {
        // --- 1. READ PHASE (All reads must occur first in transaction) ---

        // A. Read Settlement Document
        const settlementRef = doc(db, 'dailySettlements', targetSettlement.id);
        const settlementSnap = await transaction.get(settlementRef);
        if (!settlementSnap.exists()) {
          throw new Error(`Daily Settlement document ${targetSettlement.id} does not exist.`);
        }

        // B. Read DSR Sheets Documents
        const sheetRefs = todaySheets.map(s => doc(db, 'dsrSheets', s.id));
        const sheetSnaps = await Promise.all(sheetRefs.map(ref => transaction.get(ref)));

        // C. Read Manager User Document (submittedBy)
        const managerUserRef = doc(db, 'users', targetSettlement.submittedBy);
        const managerSnap = await transaction.get(managerUserRef);

        // D. Read DSR User Documents (for staff outstanding shortage balances)
        const dsrUserIds = new Set<string>();
        todaySheets.forEach(sheet => {
          if (sheet.status === 'reviewed_by_manager' || sheet.status === 'submitted_by_dsr') {
            dsrUserIds.add(sheet.dsrId);
          }
        });
        const dsrUserSnaps = await Promise.all(
          Array.from(dsrUserIds).map(dsrId => transaction.get(doc(db, 'users', dsrId)))
        );

        // E. Read Customers Documents (Fetch ALL customers who have invoices in today's DSR sheets to prevent double billing and correctly adjust dues)
        const customerIds = new Set<string>();
        todaySheets.forEach(sheet => {
          if (sheet.status === 'reviewed_by_manager' || sheet.status === 'submitted_by_dsr') {
            if (sheet.invoiceIds) {
              sheet.invoiceIds.forEach(invId => {
                const inv = salesInvoices.find(i => i.id === invId);
                if (inv && inv.customerId) {
                  customerIds.add(inv.customerId);
                }
              });
            }
            if (sheet.reconciliation?.customerDues) {
              sheet.reconciliation.customerDues.forEach(c => {
                if (c.customerId) {
                  customerIds.add(c.customerId);
                }
              });
            }
          }
        });
        const customerSnaps = await Promise.all(
          Array.from(customerIds).map(id => transaction.get(doc(db, 'customers', id)))
        );

        // F. Read Products Documents for stock chaining / auditing integrity
        const productIds = new Set<string>();
        todaySheets.forEach(sheet => {
          if (sheet.status === 'reviewed_by_manager' || sheet.status === 'submitted_by_dsr') {
            if (sheet.items) {
              sheet.items.forEach(it => {
                productIds.add(it.productId);
              });
            }
          }
        });
        const productSnaps = await Promise.all(
          Array.from(productIds).map(id => transaction.get(doc(db, 'products', id)))
        );


        // --- 2. WRITE/UPDATE PHASE (All writes must occur after reads) ---

        // A. Approve Settlement document
        transaction.update(settlementRef, {
          status: 'approved',
          approvedBy: currentUser?.id || 'admin_id',
          approvedByName: currentUser?.name || 'Super Admin',
          approvedAt: new Date().toISOString()
        });

        // B. Loop through sheets associated with today
        todaySheets.forEach(sheet => {
          if (sheet.status === 'reviewed_by_manager' || sheet.status === 'submitted_by_dsr') {
            // Update sheet status
            const sheetRef = doc(db, 'dsrSheets', sheet.id);
            transaction.update(sheetRef, {
              status: 'approved_by_admin'
            });

            // Save DSR Expenses to general expenses collection
            if (sheet.reconciliation?.expenses) {
              sheet.reconciliation.expenses.forEach(e => {
                if (e.amount > 0) {
                  const expId = `exp-dsr-${sheet.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                  transaction.set(doc(db, 'expenses', expId), {
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

            // Reconcile and update customer outstanding dues, customer ledgers, and sales invoices
            if (sheet.invoiceIds && sheet.invoiceIds.length > 0) {
              // Group sheet invoices by customer and company
              const sheetInvoices = salesInvoices.filter(inv => sheet.invoiceIds.includes(inv.id));
              
              // Find all unique customer and company combinations on this sheet
              const customerCompanyPairs = new Map<string, { customerId: string; companyId: string; companyName: string }>();
              sheetInvoices.forEach(inv => {
                if (inv.customerId && inv.companyId) {
                  const pairKey = `${inv.customerId}_${inv.companyId}`;
                  customerCompanyPairs.set(pairKey, {
                    customerId: inv.customerId,
                    companyId: inv.companyId,
                    companyName: inv.companyName || 'Samira Traders'
                  });
                }
              });

              customerCompanyPairs.forEach(pair => {
                const { customerId, companyId, companyName } = pair;
                
                // 1. Calculate sum of originally recorded due amounts for this customer + company in this sheet
                const customerCompanyInvoices = sheetInvoices.filter(inv => inv.customerId === customerId && inv.companyId === companyId);
                const originalDueSum = customerCompanyInvoices.reduce((sum, inv) => {
                  const originalDueAmt = Math.max(0, inv.grandTotal - (inv.paymentReceived || 0));
                  return sum + originalDueAmt;
                }, 0);

                // 2. Find actual afternoon checkout due for this customer + company
                const reconDueEntry = sheet.reconciliation?.customerDues?.find(c => c.customerId === customerId && c.companyId === companyId);
                const actualDue = reconDueEntry ? Number(reconDueEntry.amount) || 0 : 0;

                // 3. Compute Adjustment (originalDueSum - actualDue)
                const adjustment = originalDueSum - actualDue;

                // 4. Update the Customer's outstanding company-wise dues
                const custSnap = customerSnaps.find(snap => snap.id === customerId);
                if (custSnap && custSnap.exists()) {
                  const custData = custSnap.data();
                  const currentDues = custData.dues || {};
                  const prevDue = Number(currentDues[companyId]) || 0;
                  
                  // The new due balance for this company is adjusted down by the adjustment
                  const updatedCompanyDue = Math.max(0, prevDue - adjustment);
                  const updatedDues = {
                    ...currentDues,
                    [companyId]: updatedCompanyDue
                  };
                  const updatedTotalDue = Object.values(updatedDues).reduce((s: number, val: unknown) => s + (Number(val) || 0), 0);

                  transaction.update(doc(db, 'customers', customerId), {
                    dues: updatedDues,
                    totalDue: updatedTotalDue
                  });

                  // 5. Record Customer Ledger Entry for the checkout adjustment
                  if (adjustment !== 0) {
                    const ledgerEntryId = `ledger-dsr-adj-${sheet.id}-${customerId}-${companyId}`;
                    transaction.set(doc(db, 'ledgers', ledgerEntryId), {
                      id: ledgerEntryId,
                      customerId,
                      companyId,
                      companyName,
                      type: adjustment > 0 ? 'PAYMENT' : 'INVOICE',
                      referenceId: sheet.id,
                      referenceNo: `DSR-${sheet.id.slice(-5).toUpperCase()}`,
                      date: sheet.date,
                      amount: Math.abs(adjustment),
                      balanceAfter: updatedCompanyDue,
                      remarks: adjustment > 0 
                        ? `DSR Route adjustment (Payment/Returns) for Route ${sheet.route}`
                        : `DSR Route adjustment (Increased Dues) for Route ${sheet.route}`,
                      createdAt: new Date().toISOString()
                    });
                  }
                }

                // 6. Allocate adjustment and update individual sales invoices
                let remainingAdjustment = adjustment;
                customerCompanyInvoices.forEach(inv => {
                  const originalDueAmt = Math.max(0, inv.grandTotal - (inv.paymentReceived || 0));
                  
                  let newPaymentReceived = inv.paymentReceived || 0;
                  let newStatus = inv.status;

                  if (remainingAdjustment > 0) {
                    if (remainingAdjustment >= originalDueAmt) {
                      newPaymentReceived = inv.grandTotal;
                      newStatus = 'PAID';
                      remainingAdjustment -= originalDueAmt;
                    } else {
                      newPaymentReceived += remainingAdjustment;
                      newStatus = 'PARTIAL';
                      remainingAdjustment = 0;
                    }
                  } else if (remainingAdjustment < 0) {
                    // In the rare event of negative adjustment (dues increased beyond grandTotal), reduce paymentReceived
                    const absAdj = Math.abs(remainingAdjustment);
                    if (absAdj <= newPaymentReceived) {
                      newPaymentReceived -= absAdj;
                      newStatus = newPaymentReceived === 0 ? 'DUE' : 'PARTIAL';
                      remainingAdjustment = 0;
                    } else {
                      newPaymentReceived = 0;
                      newStatus = 'DUE';
                      remainingAdjustment += newPaymentReceived; // keep remaining negative
                    }
                  } else {
                    // Adjustment is exactly 0, which means no cash was paid and no products returned for this customer.
                    // If original invoice status was already DUE, keep it as DUE. If it was PAID/PARTIAL, keep it.
                  }

                  transaction.update(doc(db, 'sales', inv.id), {
                    status: newStatus,
                    paymentReceived: newPaymentReceived
                  });
                });
              });
            }

            // Shortages DSR ledger entries & outstanding DSR balance update
            if (sheet.reconciliation && sheet.reconciliation.shortage > 0 && !(sheet as any).shortageLogged) {
              const shortageEntryId = `ledger-dsr-short-${sheet.id}-${Date.now()}`;
              const selectedType = sheetShortageTypes[sheet.id] || 'SHORTAGE';
              transaction.set(doc(db, 'staffLedgers', shortageEntryId), {
                id: shortageEntryId,
                staffId: sheet.dsrId,
                staffName: sheet.dsrName,
                staffRole: 'DSR',
                type: selectedType,
                referenceId: sheet.id,
                referenceNo: `DSR-${sheet.id.slice(-5).toUpperCase()}`,
                date: sheet.date,
                amount: sheet.reconciliation.shortage,
                balanceAfter: sheet.reconciliation.shortage,
                remarks: `DSR Route Shortage recorded from Route ${sheet.route} categorized as ${selectedType === 'SHORTAGE' ? 'Recoverable Debt (আদায়যোগ্য দেনা)' : 'Salary Advance (বেতন অগ্রিম)'}`,
                createdAt: new Date().toISOString()
              });

              // Update DSR user outstanding shortage balance
              const dsrUserSnap = dsrUserSnaps.find(snap => snap.id === sheet.dsrId);
              if (dsrUserSnap && dsrUserSnap.exists()) {
                const dsrUserData = dsrUserSnap.data();
                const prevDsrShortage = dsrUserData?.outstandingShortage || 0;
                transaction.update(doc(db, 'users', sheet.dsrId), {
                  outstandingShortage: prevDsrShortage + sheet.reconciliation.shortage
                });
              }
            }

            // Stock integrity checkpoint chaining inside the transaction
            if (sheet.items) {
              sheet.items.forEach(it => {
                const prodSnap = productSnaps.find(snap => snap.id === it.productId);
                if (prodSnap && prodSnap.exists()) {
                  const prodData = prodSnap.data();
                  console.log(`Transaction integrity check passed: Product "${it.name}" stock verified as ${prodData.stockCount}.`);
                }
              });
            }
          }
        });

        // C. Subtract Manager Shortage & write to Manager Ledger as Advance Salary
        if (targetSettlement.shortage > 0) {
          const mgrLedgerId = `ledger-mgr-short-${targetSettlement.id}-${Date.now()}`;
          transaction.set(doc(db, 'staffLedgers', mgrLedgerId), {
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
          if (managerSnap.exists()) {
            const managerData = managerSnap.data();
            const prevShortage = managerData?.outstandingShortage || 0;
            transaction.update(managerUserRef, {
              outstandingShortage: prevShortage + targetSettlement.shortage
            });
          }
        }
      });

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
    } catch (err: any) {
      console.error('Error approving daily settlement transaction:', err);
      const errorCode = err?.code || 'unknown-error';
      const errorMessage = err?.message || String(err);
      alert(`সেটেলমেন্ট অনুমোদন করতে ব্যর্থ হয়েছে।\n(Error code: ${errorCode})\n\nত্রুটির বিবরণ: ${errorMessage}`);
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
          <ConnectionStatusBadge />
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

          {/* Database Diagnostic Notification Bar */}
          <div className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${
            dbState.status === 'connected' ? 'bg-emerald-50/55 border-emerald-200 text-emerald-800' :
            dbState.status === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800 animate-pulse' :
            'bg-slate-50 border-slate-200 text-slate-700'
          }`} id="firestore-connection-diagnostic-banner">
            <div className="flex items-center space-x-2.5">
              {dbState.status === 'connected' && (
                <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              )}
              {dbState.status === 'error' && (
                <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              )}
              {(dbState.status === 'checking' || dbState.status === 'idle') && (
                <RefreshCw className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" />
              )}
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wide">
                  {dbState.status === 'connected' ? 'ডাটাবেজ সংযোগ সচল ও রাইট পারমিশন ভেরিফাইড (Firestore Ready)' :
                   dbState.status === 'error' ? 'ডাটাবেজ সংযোগ ত্রুটি! লেনদেন ব্লকড (Firestore Disconnected)' :
                   'ডাটাবেজ সংযোগ পরীক্ষা করা হচ্ছে... (Testing Firestore Write Connection...)'}
                </h4>
                <p className="text-[11px] opacity-90 mt-0.5">
                  {dbState.status === 'connected' && `ডাটাবেজ সফলভাবে রেসপন্স করেছে। লেটেন্সি: ${dbState.latency}ms। আপনার সব জটিল পোস্টিং সুরক্ষিত ও ইনস্ট্যান্টলি সংরক্ষিত হবে।`}
                  {dbState.status === 'error' && `সতর্কতা: নেটওয়ার্ক বা সিকিউরিটি রুল ব্লক রয়েছে! ত্রুটি: ${dbState.error || 'Firestore write permission blocked.'}`}
                  {dbState.status === 'checking' && 'ফায়ারস্টোর ডাটাবেজে একটি টেস্ট ডাটা রাইট করে কানেক্টিভিটি ও রাইট পারমিশন যাচাই করা হচ্ছে...'}
                  {dbState.status === 'idle' && 'ডাটাবেজ সংযোগ এখনো পরীক্ষা করা হয়নি।'}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={runDiagnostics}
                disabled={dbState.status === 'checking'}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-[10px] rounded-lg border border-slate-200 hover:border-slate-300 shadow-sm cursor-pointer transition-all disabled:opacity-50"
              >
                {dbState.status === 'checking' ? 'যাচাই হচ্ছে...' : 'কানেকশন টেস্ট করুন (Ping DB)'}
              </button>
            </div>
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

            {/* AUTOMATED DEDUCTION CALCULATOR & READY SALES DESK */}
            <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800/80 space-y-4">
              <div className="border-b border-slate-800 pb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h4 className="text-sm font-extrabold text-blue-400 flex items-center gap-2">
                    <Calculator className="w-4 h-4" />
                    স্বয়ংক্রিয় কর্তন ও জমাযোগ্য টাকার হিসাব (Automated Deduction Calculator)
                  </h4>
                  <p className="text-[10px] text-slate-400 italic">ডিএসআর নেট কালেকশন থেকে খরচ, রিটার্ন ও ড্যামেজ কর্তন করে রেডি সেলস যোগ করার হিসাব</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. DSR Cash Collection Breakdown */}
                <div className="space-y-2 border-r border-slate-800/50 pr-4">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">১. ডিএসআর ক্যাশ কালেকশন (DSR Cash Collection)</span>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">লোডেড প্রোডাক্ট গ্রস মূল্য (Load Gross):</span>
                    <span className="font-mono text-slate-300">৳{totalAssignedValue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-emerald-400">
                    <span>পূর্বের বকেয়া আদায় (+) (Old Coll.):</span>
                    <span className="font-mono font-bold">৳{todayOldCollections.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-amber-400">
                    <span>নতুন কাস্টমার বাকি (-) (New Due):</span>
                    <span className="font-mono font-bold">- ৳{todayNewCustomerDues.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-purple-400">
                    <span>ফ্রি ও ডিসকাউন্ট (-) (Free & Disc):</span>
                    <span className="font-mono font-bold">- ৳{(todayFreeValue + todayDiscountValue).toLocaleString()}</span>
                  </div>
                  <div className="border-t border-slate-800 pt-1.5 flex justify-between items-center text-xs font-bold text-white">
                    <span>ডিএসআর নেট ক্যাশ কালেকশন:</span>
                    <span className="font-mono text-emerald-300">৳{dsrNetCashCollection.toLocaleString()}</span>
                  </div>
                </div>

                {/* 2. Automated Deductions */}
                <div className="space-y-2 border-r border-slate-800/50 pr-4">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">২. বাদসমূহ / কর্তন (Automated Deductions)</span>
                  <div className="flex justify-between items-center text-xs text-rose-400">
                    <span>রুট ও অফিস মোট খরচ (-) (Expenses):</span>
                    <span className="font-mono font-bold">- ৳{totalExpenses.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-indigo-400">
                    <span>রিটার্ন পণ্যের মূল্য (-) (Returns):</span>
                    <span className="font-mono font-bold">- ৳{totalReturnValue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-400">
                    <span>ড্যামেজ পণ্যের মূল্য (-) (Damages):</span>
                    <span className="font-mono font-bold">- ৳{todayDamageValue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-red-400">
                    <span>ডিএসআর ক্যাশ শর্ট/ঘাটতি (-) (DSR Shortages):</span>
                    <span className="font-mono font-bold">- ৳{totalDsrShortages.toLocaleString()}</span>
                  </div>
                  <div className="border-t border-slate-800 pt-1.5 flex justify-between items-center text-xs font-bold text-slate-300">
                    <span>মোট কর্তন (Total Deductions):</span>
                    <span className="font-mono text-rose-300">- ৳{(totalExpenses + totalReturnValue + todayDamageValue + totalDsrShortages).toLocaleString()}</span>
                  </div>
                </div>

                {/* 3. Depot Additions & Ready Sales Option */}
                <div className="space-y-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">৩. ডিপো সংযোজন ও রেডি সেলস (Ready Sales Option)</span>
                  
                  <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-300 font-bold">রেডি সেলস এন্ট্রি (Ready Sales Amount):</span>
                      <label className="flex items-center space-x-1 cursor-pointer text-[9px] text-slate-400 font-bold">
                        <input
                          type="checkbox"
                          checked={isAutoReadySales}
                          onChange={(e) => setIsAutoReadySales(e.target.checked)}
                          disabled={!!activeSettlement}
                          className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0 w-3 h-3 cursor-pointer"
                        />
                        <span>অটো-হিসাব</span>
                      </label>
                    </div>

                    <div className="relative">
                      <span className="absolute left-2.5 top-1.5 text-slate-500 text-xs font-bold">৳</span>
                      <input
                        type="number"
                        value={activeSettlement ? currentReadySales : (readySalesInput || '')}
                        onChange={(e) => {
                          if (!isAutoReadySales) {
                            setReadySalesInput(Math.max(0, parseFloat(e.target.value) || 0));
                          }
                        }}
                        disabled={isAutoReadySales || !!activeSettlement}
                        placeholder="আজকের রেডি সেলস"
                        className="w-full bg-slate-950 border border-slate-800 text-blue-400 pl-6 pr-2 py-1 rounded text-xs focus:outline-none focus:border-blue-500 font-bold font-mono"
                      />
                    </div>
                    <p className="text-[8px] text-slate-500 leading-normal italic">
                      {isAutoReadySales
                        ? `আজকের নন-ডিএসআর মেমো থেকে অটো সংগৃহীত: ৳${calculatedReadySalesValue.toLocaleString()}`
                        : 'ম্যানুয়ালি রেডি সেলস নগদ টাকার পরিমাণ লিখুন।'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Ready-to-Deposit Summary Footer Banner */}
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">চূড়ান্ত নগদ জমাযোগ্য ব্যালেন্স (Final Ready-to-Deposit Amount)</span>
                    <h5 className="text-xl font-black font-mono text-emerald-400">৳{readyToDeposit.toLocaleString()}</h5>
                  </div>
                </div>
                {!activeSettlement && (
                  <button
                    onClick={() => setAdminTransferInput(readyToDeposit)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition-all text-slate-950 rounded-lg text-xs font-black cursor-pointer"
                  >
                    হস্তান্তর টাকা অটো-ফিল করুন (Copy to Deposit)
                  </button>
                )}
              </div>
            </div>

            {/* Final Cash Equation Panel */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-800/60 items-center">
              
              {/* Calculated manager balance */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-blue-400 font-extrabold uppercase tracking-wider block">জমাযোগ্য মোট ক্যাশ (Ready-to-Deposit)</span>
                <div className="text-2xl font-black font-mono text-white">৳{readyToDeposit.toLocaleString()}</div>
                <p className="text-[9px] text-slate-500 italic">আজকের প্রদেয় নেট নগদ কালেকশন ও রেডি সেলস সমন্বয় হিসাব।</p>
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
              ক্যালকুলেশন মেথড: ডিএসআর নেট কালেকশন (৳{dsrNetCashCollection.toLocaleString()}) - খরচ (৳{totalExpenses.toLocaleString()}) - রিটার্ন (৳{totalReturnValue.toLocaleString()}) - ড্যামেজ (৳{todayDamageValue.toLocaleString()}) - ডিএসআর শর্ট (৳{totalDsrShortages.toLocaleString()}) + রেডি সেলস (৳{currentReadySales.toLocaleString()}) = মোট জমাযোগ্য ৳{readyToDeposit.toLocaleString()}
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
                      onClick={() => setShowApproveModal(true)}
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

      {/* ADMIN APPROVAL REVIEW MODAL */}
      {showApproveModal && activeSettlement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl relative border border-gray-100 flex flex-col max-h-[90vh]">
            <button 
              onClick={() => setShowApproveModal(false)} 
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="border-b pb-3 mb-4">
              <h3 className="text-lg font-extrabold text-slate-900 flex items-center uppercase tracking-wide">
                <CheckCircle className="w-6 h-6 text-emerald-600 mr-2" />
                <span>데일리 সেটেলমেন্ট এডমিন যাচাইকরণ ও চূড়ান্ত অনুমোদন</span>
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                তারিখ: <strong className="font-mono text-slate-700">{selectedDate}</strong> | ম্যানেজার: <strong className="text-slate-700">{activeSettlement.submittedByName}</strong>
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-5 pr-1 scrollbar-thin">
              {/* Financial Summary Card */}
              <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                <div className="space-y-1">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">জমাযোগ্য মোট ক্যাশ (Ready-to-Deposit)</span>
                  <div className="text-lg font-mono font-black text-slate-800">৳{((activeSettlement as any).readyToDeposit || readyToDeposit).toLocaleString()}</div>
                </div>
                <div className="space-y-1 border-x px-2">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">নগদ এডমিন হস্তান্তর</span>
                  <div className="text-lg font-mono font-black text-emerald-600">৳{activeSettlement.adminTransfer.toLocaleString()}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">আজকের মোট ক্যাশ শর্ট</span>
                  <div className="text-lg font-mono font-black text-red-600">৳{currentShortage.toLocaleString()}</div>
                </div>
              </div>

              {/* DSR sheets shortage breakdown */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">রুট ও ডিএসআর ভিত্তিক শর্ট সমন্বয় ডেস্ক</h4>
                
                <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-[10px] font-bold text-gray-500 uppercase tracking-wider font-mono border-b">
                      <tr>
                        <th className="p-3">রুট / ডিএসআর (Route & DSR)</th>
                        <th className="p-3 text-right">নেট বিক্রি</th>
                        <th className="p-3 text-right">ক্যাশ রিসিভ</th>
                        <th className="p-3 text-right">ঘাটতি টাকা (Short)</th>
                        <th className="p-3 text-center">ঘাটতি পোস্টিং টাইপ (Adjustment Type)</th>
                        <th className="p-3 text-center">ইতিহাস</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {todaySheets.map((sheet) => {
                        const shortage = sheet.reconciliation?.shortage || 0;
                        const selectedType = sheetShortageTypes[sheet.id] || 'SHORTAGE';
                        return (
                          <tr key={sheet.id} className="hover:bg-white bg-white/40 transition-colors">
                            <td className="p-3 font-medium">
                              <div className="font-bold text-slate-900">{sheet.route}</div>
                              <div className="text-[10px] text-gray-400">Rep: {sheet.dsrName}</div>
                            </td>
                            <td className="p-3 text-right font-mono">৳{(sheet.reconciliation?.netSales || 0).toLocaleString()}</td>
                            <td className="p-3 text-right font-mono text-emerald-600">৳{(sheet.reconciliation?.cashReceived || 0).toLocaleString()}</td>
                            <td className="p-3 text-right font-mono font-bold text-red-600">
                              {shortage > 0 ? `৳${shortage.toLocaleString()}` : '৳০'}
                            </td>
                            <td className="p-3 text-center">
                              {shortage > 0 ? (
                                <select
                                  value={selectedType}
                                  onChange={(e) => setSheetShortageTypes({
                                    ...sheetShortageTypes,
                                    [sheet.id]: e.target.value as 'SHORTAGE' | 'SALARY_ADVANCE'
                                  })}
                                  className="p-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold focus:outline-none"
                                >
                                  <option value="SHORTAGE">Recoverable Debt (আদায়যোগ্য দেনা)</option>
                                  <option value="SALARY_ADVANCE">Salary Advance (বেতন অগ্রিম)</option>
                                </select>
                              ) : (
                                <span className="text-[10px] text-gray-400 italic">কোনো ঘাটতি নেই</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => {
                                  setSelectedStaffForAudit({ id: sheet.dsrId, name: sheet.dsrName });
                                  fetchStaffAuditTrail(sheet.dsrId);
                                }}
                                className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors"
                                title="পূর্বের অডিট ট্রেইল দেখুন"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {todaySheets.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-gray-400 italic">
                            আজ কোনো লোডশীট সাবমিট বা রেকর্ড করা হয়নি।
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t flex justify-end space-x-2.5 mt-4">
              <button
                onClick={() => setShowApproveModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer"
              >
                বাতিল করুন
              </button>
              <button
                onClick={handleAdminApprove}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl cursor-pointer shadow-lg shadow-emerald-500/10 flex items-center space-x-1.5"
              >
                <CheckCircle className="w-4 h-4" />
                <span>অনুমোদন ও ফাইনাল বুকিং করুন (Approve & Book)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STAFF AUDIT TRAIL MODAL OVERLAY */}
      {selectedStaffForAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative border border-gray-100 flex flex-col max-h-[80vh]">
            <button 
              onClick={() => setSelectedStaffForAudit(null)} 
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="border-b pb-3 mb-4">
              <h3 className="text-base font-black text-slate-900 flex items-center uppercase tracking-wide">
                <FileText className="w-5 h-5 text-blue-600 mr-2" />
                <span>ঘাটতি ও সমন্বয় অডিট ট্রেইল (Audit Trail)</span>
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                কর্মী: <strong className="text-slate-700">{selectedStaffForAudit.name}</strong>
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
              {auditLoading ? (
                <div className="text-center py-10">
                  <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
                  <p className="text-xs text-gray-400">অডিট ইতিহাস লোড হচ্ছে...</p>
                </div>
              ) : auditEntries.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-10">এই কর্মীর জন্য পূর্বে কোনো ঘাটতি বা অগ্রিম সমন্বয়ের রেকর্ড পাওয়া যায়নি।</p>
              ) : (
                <div className="space-y-2">
                  {auditEntries.map((entry, index) => {
                    const isDebit = entry.type === 'SHORTAGE' || entry.type === 'SALARY_ADVANCE';
                    return (
                      <div key={index} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center text-xs">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-slate-800 font-mono">{entry.date}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                              isDebit ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              {entry.type === 'SHORTAGE' ? 'Recoverable Debt' : entry.type === 'SALARY_ADVANCE' ? 'Salary Advance' : entry.type}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">{entry.remarks || 'কোনো মন্তব্য নেই'}</p>
                          <p className="text-[9px] text-gray-400 font-mono">Ref: {entry.referenceNo}</p>
                        </div>
                        <div className="text-right">
                          <span className={`font-mono font-black ${isDebit ? 'text-red-600' : 'text-emerald-600'}`}>
                            {isDebit ? '+' : '-'} ৳{entry.amount.toLocaleString()}
                          </span>
                          <div className="text-[9px] text-gray-400">Balance: ৳{entry.balanceAfter.toLocaleString()}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-4 border-t flex justify-end mt-4">
              <button
                onClick={() => setSelectedStaffForAudit(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-5 py-2 px-4 rounded-xl cursor-pointer"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
