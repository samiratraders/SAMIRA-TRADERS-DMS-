/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Plus, 
  Search, 
  Filter, 
  MapPin, 
  TrendingUp, 
  CheckCircle, 
  Clock, 
  ArrowRight,
  RefreshCw,
  Save,
  X,
  UserCheck,
  MessageSquare,
  Send,
  Copy,
  Check,
  ExternalLink,
  Share2,
  Phone,
  Smartphone,
  ShieldCheck,
  BarChart3,
  Calendar,
  AlertTriangle,
  Printer,
  FileText,
  Layers,
  CreditCard,
  Building2,
  Users,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet
} from 'lucide-react';
import { collection, getDocs, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Collection, Customer, Company, UserRole, SalesInvoice } from '../types';
import { logActivity } from '../lib/activityLogger';
import PrintWrapper from './PrintWrapper';

export interface NotificationModalData {
  collectionNo: string;
  shopName: string;
  customerName: string;
  phone: string;
  amount: number;
  companyName: string;
  date: string;
  paymentMethod: string;
  referenceNo?: string;
  remainingDue: number;
  route?: string;
  area?: string;
}

interface CollectionViewProps {
  userRole: UserRole;
  userId: string;
  userName: string;
}

export default function CollectionView({ userRole, userId, userName }: CollectionViewProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [selectedArea, setSelectedArea] = useState('');

  const [routes, setRoutes] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);

  // Collection Audit Feature State
  const [auditDate, setAuditDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [auditRepFilter, setAuditRepFilter] = useState<string>('');
  const [auditCompanyFilter, setAuditCompanyFilter] = useState<string>('');
  const [isAuditExpanded, setIsAuditExpanded] = useState<boolean>(true);
  const [printAuditReport, setPrintAuditReport] = useState<any>(null);

  // Modals
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [isMultiCollectModalOpen, setIsMultiCollectModalOpen] = useState(false);

  // Form State
  const [customerId, setCustomerId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_BANKING' | 'CHEQUE'>('CASH');
  const [referenceNo, setReferenceNo] = useState('');
  const [collectionDate, setCollectionDate] = useState(new Date().toISOString().split('T')[0]);

  // Multi-Supplier State
  const [multiCustomerId, setMultiCustomerId] = useState('');
  const [multiAmounts, setMultiAmounts] = useState<{ [companyId: string]: number }>({});
  const [multiPaymentMethod, setMultiPaymentMethod] = useState<'CASH' | 'MOBILE_BANKING' | 'CHEQUE'>('CASH');
  const [multiReferenceNo, setMultiReferenceNo] = useState('');
  const [multiCollectionDate, setMultiCollectionDate] = useState(new Date().toISOString().split('T')[0]);

  // Automated Notification Trigger Modal State
  const [notificationModalData, setNotificationModalData] = useState<NotificationModalData | null>(null);
  const [notificationPhone, setNotificationPhone] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (notificationModalData) {
      setNotificationPhone(notificationModalData.phone || '');
      setIsCopied(false);
    }
  }, [notificationModalData]);

  const formatWhatsAppPhone = (phoneStr?: string): string => {
    if (!phoneStr) return '';
    let cleaned = phoneStr.replace(/\D/g, '');
    if (cleaned.startsWith('880')) return cleaned;
    if (cleaned.startsWith('0')) return '88' + cleaned;
    if (cleaned.length === 10 && cleaned.startsWith('1')) return '880' + cleaned;
    return cleaned;
  };

  const generateNotificationMessage = (data: NotificationModalData) => {
    const pMethodName = data.paymentMethod === 'CASH' ? 'নগদ জমা (Cash)' : data.paymentMethod === 'MOBILE_BANKING' ? 'মোবাইল ব্যাংকিং (bKash/Nagad)' : 'ব্যাংক চেক (Cheque)';
    return (
      `*সামীরা ট্রেডার্স (Samira Traders)*\n` +
      `*পেমেন্ট প্রাপ্তি নিশ্চিতকরণ (Payment Receipt)*\n` +
      `---------------------------------\n` +
      `*রসিদ নং:* ${data.collectionNo}\n` +
      `*আউটলেট:* ${data.shopName} (${data.customerName})\n` +
      `*তারিখ:* ${data.date}\n` +
      `*ব্র্যান্ড/কোম্পানি:* ${data.companyName}\n` +
      `*প্রাপ্ত পেমেন্ট:* ৳${data.amount.toLocaleString()} [${pMethodName}]\n` +
      (data.referenceNo ? `*রেফারেন্স/মেমো:* ${data.referenceNo}\n` : '') +
      `*অবশিষ্ট মোট বকেয়া:* ৳${data.remainingDue.toLocaleString()}\n` +
      `---------------------------------\n` +
      `আপনার পেমেন্ট সফলভাবে সংরক্ষিত হয়েছে। আমাদের সাথে ব্যবসা করার জন্য ধন্যবাদ!`
    );
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Fetch companies, customers, collections, and sales invoices in parallel
      const [compSnap, custSnap, colSnap, salesSnap] = await Promise.all([
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'collections')),
        getDocs(collection(db, 'sales'))
      ]);

      const compList: Company[] = [];
      compSnap.forEach(d => compList.push(d.data() as Company));
      setCompanies(compList);

      const custList: Customer[] = [];
      custSnap.forEach(d => custList.push(d.data() as Customer));
      setCustomers(custList);

      const colList: Collection[] = [];
      colSnap.forEach(d => colList.push(d.data() as Collection));
      colList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setCollections(colList);

      const salesList: SalesInvoice[] = [];
      salesSnap.forEach(d => salesList.push(d.data() as SalesInvoice));
      salesList.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setSalesInvoices(salesList);

      // Compile unique routes & areas
      const uniqueRoutes = Array.from(new Set(custList.map(c => c.route).filter(Boolean)));
      const uniqueAreas = Array.from(new Set(custList.map(c => c.area).filter(Boolean)));
      setRoutes(uniqueRoutes);
      setAreas(uniqueAreas);

    } catch (err) {
      console.error('Error loading collections and sales audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  // Collection Audit Daily Reconciliation Computation
  const getDailyAuditMetrics = () => {
    const isAllDates = auditDate === 'ALL';

    // 1. Filter sales invoices for selected date & rep/company
    const filteredInvoices = salesInvoices.filter(inv => {
      const invDate = inv.date ? inv.date.split('T')[0] : '';
      const dateMatch = isAllDates || invDate === auditDate;
      const repMatch = !auditRepFilter || inv.dsrId === auditRepFilter || inv.dsrName === auditRepFilter;
      const compMatch = !auditCompanyFilter || inv.companyId === auditCompanyFilter;
      return dateMatch && repMatch && compMatch;
    });

    // 2. Filter collections for selected date & rep/company
    const filteredCols = collections.filter(col => {
      const colDate = col.date ? col.date.split('T')[0] : '';
      const dateMatch = isAllDates || colDate === auditDate;
      const repMatch = !auditRepFilter || col.collectedById === auditRepFilter || col.collectedByName === auditRepFilter;
      const compMatch = !auditCompanyFilter || col.companyId === auditCompanyFilter;
      return dateMatch && repMatch && compMatch;
    });

    // Invoiced Totals
    const totalInvoicedSales = filteredInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
    const invoiceCashCollected = filteredInvoices.reduce((sum, inv) => sum + (inv.paymentReceived || 0), 0);
    const invoiceCreditIncurred = Math.max(0, totalInvoicedSales - invoiceCashCollected);

    // Ledger Dues Collections
    const collectionsReceived = filteredCols.reduce((sum, col) => sum + (col.amount || 0), 0);
    const collectionsApproved = filteredCols.filter(c => c.status === 'APPROVED').reduce((sum, c) => sum + (c.amount || 0), 0);
    const collectionsPending = filteredCols.filter(c => c.status !== 'APPROVED').reduce((sum, c) => sum + (c.amount || 0), 0);

    // Total Cash Inflow (Immediate Invoice Cash + Ledger Collections Received)
    const totalCashInflow = invoiceCashCollected + collectionsReceived;

    // Payment Channel Breakdown
    let cashTotal = 0;
    let mobileTotal = 0;
    let chequeTotal = 0;

    filteredInvoices.forEach(inv => {
      if (inv.paymentMethod === 'CASH') cashTotal += (inv.paymentReceived || 0);
      else if (inv.paymentMethod === 'MOBILE_BANKING') mobileTotal += (inv.paymentReceived || 0);
      else if (inv.paymentMethod === 'CHEQUE') chequeTotal += (inv.paymentReceived || 0);
      else cashTotal += (inv.paymentReceived || 0);
    });

    filteredCols.forEach(col => {
      if (col.paymentMethod === 'CASH') cashTotal += col.amount;
      else if (col.paymentMethod === 'MOBILE_BANKING') mobileTotal += col.amount;
      else if (col.paymentMethod === 'CHEQUE') chequeTotal += col.amount;
      else cashTotal += col.amount;
    });

    // Rep-wise (DSR/Collector) Reconciliation Mapping
    const repMap: { [repName: string]: {
      repName: string;
      invoicesCount: number;
      invoicedTotal: number;
      salesCash: number;
      duesCollected: number;
      totalHandled: number;
      approvedAmount: number;
      pendingAmount: number;
    } } = {};

    filteredInvoices.forEach(inv => {
      const repKey = inv.dsrName || 'Spot Cashier / Store Direct';
      if (!repMap[repKey]) {
        repMap[repKey] = { repName: repKey, invoicesCount: 0, invoicedTotal: 0, salesCash: 0, duesCollected: 0, totalHandled: 0, approvedAmount: 0, pendingAmount: 0 };
      }
      repMap[repKey].invoicesCount += 1;
      repMap[repKey].invoicedTotal += (inv.grandTotal || 0);
      repMap[repKey].salesCash += (inv.paymentReceived || 0);
      repMap[repKey].totalHandled += (inv.paymentReceived || 0);
    });

    filteredCols.forEach(col => {
      const repKey = col.collectedByName || 'Field Representative';
      if (!repMap[repKey]) {
        repMap[repKey] = { repName: repKey, invoicesCount: 0, invoicedTotal: 0, salesCash: 0, duesCollected: 0, totalHandled: 0, approvedAmount: 0, pendingAmount: 0 };
      }
      repMap[repKey].duesCollected += col.amount;
      repMap[repKey].totalHandled += col.amount;
      if (col.status === 'APPROVED') {
        repMap[repKey].approvedAmount += col.amount;
      } else {
        repMap[repKey].pendingAmount += col.amount;
      }
    });

    const repSummaryList = Object.values(repMap);

    return {
      filteredInvoices,
      filteredCols,
      totalInvoicedSales,
      invoiceCashCollected,
      invoiceCreditIncurred,
      collectionsReceived,
      collectionsApproved,
      collectionsPending,
      totalCashInflow,
      cashTotal,
      mobileTotal,
      chequeTotal,
      repSummaryList
    };
  };

  const handleApproveAllPendingForDate = async () => {
    const auditMetrics = getDailyAuditMetrics();
    const pendingCols = auditMetrics.filteredCols.filter(c => c.status !== 'APPROVED');

    if (pendingCols.length === 0) {
      alert('There are no pending collections to approve for the selected audit date/filters.');
      return;
    }

    const dateLabel = auditDate === 'ALL' ? 'all dates' : auditDate;
    const confirmMsg = `Are you sure you want to batch approve all ${pendingCols.length} pending collections for ${dateLabel} totaling ৳${auditMetrics.collectionsPending.toLocaleString()}?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setLoading(true);
      const batch = writeBatch(db);
      pendingCols.forEach(c => {
        batch.update(doc(db, 'collections', c.id), {
          status: 'APPROVED',
          approvedBy: userId,
          approvedByName: userName
        });
      });
      await batch.commit();

      await logActivity(
        userId,
        userName,
        userRole,
        'PAYMENT_ENTRY',
        `Batch approved ${pendingCols.length} collections for audit date ${auditDate} - Total: ৳${auditMetrics.collectionsPending}`,
        { auditDate, count: pendingCols.length, total: auditMetrics.collectionsPending }
      );

      loadData();
    } catch (err) {
      console.error('Error batch approving collections:', err);
      alert('Failed to batch approve pending collections.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCollectModal = () => {
    setCustomerId('');
    setCompanyId('');
    setAmount(0);
    setPaymentMethod('CASH');
    setReferenceNo('');
    setIsCollectModalOpen(true);
  };

  // Find remaining due of selected customer for selected company
  const getSelectedDue = () => {
    if (!customerId || !companyId) return 0;
    const cust = customers.find(c => c.id === customerId);
    if (!cust) return 0;
    return cust.dues?.[companyId] || 0;
  };

  const handleReceivePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !companyId || amount <= 0) {
      alert('Please fill out customer, company, and entering a positive amount.');
      return;
    }

    const customerObj = customers.find(c => c.id === customerId);
    const companyObj = companies.find(c => c.id === companyId);
    if (!customerObj || !companyObj) return;

    const currentDue = customerObj.dues?.[companyId] || 0;
    if (amount > currentDue) {
      alert(`Entered payment (৳${amount}) exceeds outstanding ledger due (৳${currentDue}).`);
      return;
    }

    try {
      setLoading(true);
      const batch = writeBatch(db);
      const collectionId = 'col-' + Date.now();
      const collectionNo = 'COL-' + Date.now().toString().slice(-6);

      // 1. Create Collection Receipt
      const collectionObj: Collection = {
        id: collectionId,
        collectionNo,
        date: collectionDate,
        customerId,
        customerName: customerObj.name,
        shopName: customerObj.shopName,
        companyId,
        companyName: companyObj.name,
        amount,
        paymentMethod,
        referenceNo: referenceNo || '',
        route: customerObj.route,
        area: customerObj.area,
        collectedById: userId || 'dsr_fallback_uid',
        collectedByName: userName || 'DSR Sales Field Rep',
        status: 'PENDING', // starts as pending, DSR transfers, Manager approves
        transferredToManager: false,
        createdAt: new Date().toISOString()
      };

      batch.set(doc(db, 'collections', collectionId), collectionObj);

      // 2. Adjust Customer Outstanding Company Dues immediately so ledgers are accurate
      const updatedCompanyDue = Math.max(0, currentDue - amount);
      const updatedDues = {
        ...(customerObj.dues || {}),
        [companyId]: updatedCompanyDue
      };
      const updatedTotalDue = Object.values(updatedDues).reduce((s: number, a: unknown) => s + (Number(a) || 0), 0);

      batch.update(doc(db, 'customers', customerId), {
        dues: updatedDues,
        totalDue: updatedTotalDue
      });

      // 3. Log to Customer Ledger
      const ledgerEntryId = `ledger-${collectionId}`;
      batch.set(doc(db, 'ledgers', ledgerEntryId), {
        id: ledgerEntryId,
        customerId,
        companyId,
        companyName: companyObj.name,
        type: 'PAYMENT',
        referenceId: collectionId,
        referenceNo: collectionNo,
        date: collectionDate,
        amount,
        balanceAfter: updatedCompanyDue,
        createdAt: new Date().toISOString()
      });

      await batch.commit();

      // Log payment entry action to Firestore
      await logActivity(
        userId,
        userName,
        userRole,
        'PAYMENT_ENTRY',
        `Recorded Collection Receipt #${collectionNo} from customer ${customerObj.name} (${customerObj.shopName}) - Amount: ৳${amount} [Pending Approval]`,
        { collectionId, collectionNo, amount, customerId, companyId }
      );

      setIsCollectModalOpen(false);
      
      // Automatically trigger WhatsApp / SMS Payment Received Notification
      setNotificationModalData({
        collectionNo,
        shopName: customerObj.shopName,
        customerName: customerObj.name,
        phone: customerObj.phone || '',
        amount,
        companyName: companyObj.name,
        date: collectionDate,
        paymentMethod,
        referenceNo: referenceNo || '',
        remainingDue: updatedCompanyDue,
        route: customerObj.route,
        area: customerObj.area
      });

      loadData();
    } catch (err) {
      console.error('Error logging payment collection:', err);
      alert('Failed to log payment. Please check database connectivity.');
    } finally {
      setLoading(false);
    }
  };

  const handleMultiReceivePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!multiCustomerId) {
      alert('Please select a customer.');
      return;
    }

    const customerObj = customers.find(c => c.id === multiCustomerId);
    if (!customerObj) return;

    const paymentsToProcess = Object.entries(multiAmounts)
      .map(([compId, amt]) => ({
        companyId: compId,
        amount: amt,
        companyObj: companies.find(c => c.id === compId)
      }))
      .filter(p => p.amount > 0 && p.companyObj);

    if (paymentsToProcess.length === 0) {
      alert('Please enter a received amount for at least one company.');
      return;
    }

    for (const p of paymentsToProcess) {
      const currentDue = customerObj.dues?.[p.companyId] || 0;
      if (p.amount > currentDue) {
        alert(`Entered payment (৳${p.amount}) for ${p.companyObj?.name} exceeds outstanding due (৳${currentDue}).`);
        return;
      }
    }

    try {
      setLoading(true);
      const batch = writeBatch(db);
      const updatedDues = { ...(customerObj.dues || {}) };

      for (const p of paymentsToProcess) {
        const companyObj = p.companyObj!;
        const collectionId = 'col-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        const collectionNo = 'COL-' + Date.now().toString().slice(-4) + '-' + (companyObj.code || 'GEN');

        const collectionObj: Collection = {
          id: collectionId,
          collectionNo,
          date: multiCollectionDate,
          customerId: multiCustomerId,
          customerName: customerObj.name,
          shopName: customerObj.shopName,
          companyId: p.companyId,
          companyName: companyObj.name,
          amount: p.amount,
          paymentMethod: multiPaymentMethod,
          referenceNo: multiReferenceNo || '',
          route: customerObj.route,
          area: customerObj.area,
          collectedById: userId || 'dsr_fallback_uid',
          collectedByName: userName || 'DSR Sales Field Rep',
          status: 'PENDING',
          transferredToManager: false,
          createdAt: new Date().toISOString()
        };

        batch.set(doc(db, 'collections', collectionId), collectionObj);

        const currentDue = customerObj.dues?.[p.companyId] || 0;
        updatedDues[p.companyId] = Math.max(0, currentDue - p.amount);

        const ledgerEntryId = `ledger-${collectionId}`;
        batch.set(doc(db, 'ledgers', ledgerEntryId), {
          id: ledgerEntryId,
          customerId: multiCustomerId,
          companyId: p.companyId,
          companyName: companyObj.name,
          type: 'PAYMENT',
          referenceId: collectionId,
          referenceNo: collectionNo,
          date: multiCollectionDate,
          amount: p.amount,
          balanceAfter: updatedDues[p.companyId],
          createdAt: new Date().toISOString()
        });
      }

      const updatedTotalDue = Object.values(updatedDues).reduce((s: number, a: unknown) => s + (Number(a) || 0), 0);
      batch.update(doc(db, 'customers', multiCustomerId), {
        dues: updatedDues,
        totalDue: updatedTotalDue
      });

      await batch.commit();

      const totalRec = paymentsToProcess.reduce((sum, p) => sum + p.amount, 0);
      await logActivity(
        userId,
        userName,
        userRole,
        'PAYMENT_ENTRY',
        `Recorded Multi-Brand Payment Collection from customer ${customerObj.shopName} - Total: ৳${totalRec} [Pending Approval]`,
        { customerId: multiCustomerId, totalAmount: totalRec }
      );

      const brandNames = paymentsToProcess.map(p => p.companyObj?.name).filter(Boolean).join(', ');

      setIsMultiCollectModalOpen(false);
      setMultiCustomerId('');
      setMultiAmounts({});
      setMultiReferenceNo('');

      // Automatically trigger WhatsApp / SMS Payment Received Notification
      setNotificationModalData({
        collectionNo: 'COL-MULTI-' + Date.now().toString().slice(-6),
        shopName: customerObj.shopName,
        customerName: customerObj.name,
        phone: customerObj.phone || '',
        amount: totalRec,
        companyName: brandNames || 'Multiple Partner Brands',
        date: multiCollectionDate,
        paymentMethod: multiPaymentMethod,
        referenceNo: multiReferenceNo || '',
        remainingDue: updatedTotalDue,
        route: customerObj.route,
        area: customerObj.area
      });

      loadData();
    } catch (err: any) {
      console.error('Error logging multi payment collection:', err);
      alert('Failed to log payment: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Field Staff: Click to Transfer Collections to Manager
  const handleTransferToManager = async (colId: string) => {
    try {
      setLoading(true);
      await updateDoc(doc(db, 'collections', colId), {
        transferredToManager: true,
        status: 'TRANSFERRED'
      });

      // Log transfer action
      const colObj = collections.find(c => c.id === colId);
      if (colObj) {
        await logActivity(
          userId,
          userName,
          userRole,
          'PAYMENT_ENTRY',
          `Transferred Collection Receipt #${colObj.collectionNo} (${colObj.shopName}) to Manager for verification - Amount: ৳${colObj.amount}`,
          { collectionId: colId, collectionNo: colObj.collectionNo, amount: colObj.amount }
        );
      }

      loadData();
    } catch (err) {
      console.error('Error transferring collection:', err);
    } finally {
      setLoading(false);
    }
  };

  // Manager: Click to Approve Received Cash Handover
  const handleApproveCollection = async (colId: string) => {
    try {
      setLoading(true);
      await updateDoc(doc(db, 'collections', colId), {
        status: 'APPROVED',
        approvedBy: userId,
        approvedByName: userName
      });

      // Log approve action
      const colObj = collections.find(c => c.id === colId);
      if (colObj) {
        await logActivity(
          userId,
          userName,
          userRole,
          'PAYMENT_ENTRY',
          `Approved Collection Receipt Handover #${colObj.collectionNo} (${colObj.shopName}) - Amount: ৳${colObj.amount}`,
          { collectionId: colId, collectionNo: colObj.collectionNo, amount: colObj.amount }
        );
      }

      loadData();
    } catch (err) {
      console.error('Error approving collection:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredCollections = collections.filter(col => {
    const matchesSearch = 
      col.shopName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      col.collectedByName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRoute = selectedRoute ? col.route === selectedRoute : true;
    const matchesArea = selectedArea ? col.area === selectedArea : true;
    return matchesSearch && matchesRoute && matchesArea;
  });

  return (
    <div className="space-y-6" id="collections-module">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Payments Collection & Vault Audit</h2>
          <p className="text-sm text-gray-500">Receive outlet cash payments, perform daily cash-to-invoice audits, and approve field-rep handovers</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setMultiCustomerId('');
              setMultiAmounts({});
              setMultiReferenceNo('');
              setIsMultiCollectModalOpen(true);
            }}
            id="btn-receive-multi-payment"
            className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Multi-Supplier Cashier Screen</span>
          </button>
          <button
            onClick={handleOpenCollectModal}
            id="btn-receive-payment"
            className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Receive Customer Payment</span>
          </button>
        </div>
      </div>

      {/* COLLECTION AUDIT & DAILY RECONCILIATION PANEL */}
      {(() => {
        const audit = getDailyAuditMetrics();
        const todayStr = new Date().toISOString().split('T')[0];
        const yesterdayStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Unique field reps from both collections and sales
        const fieldRepsList = Array.from(new Set([
          ...collections.map(c => c.collectedByName).filter(Boolean),
          ...salesInvoices.map(s => s.dsrName).filter(Boolean)
        ]));

        return (
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl shadow-xl border border-slate-800 p-5 space-y-5" id="collection-audit-panel">
            {/* Header & Controls Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-700/80 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-emerald-500/20 border border-emerald-400/30 rounded-xl text-emerald-300">
                  <ShieldCheck className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">Daily Collection Audit & Reconciliation</h3>
                    <span className="text-[10px] bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded-full font-bold">
                      Real-time Vault Log
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">Comparing cash sales invoice totals against collected receipts & field rep vault handovers</p>
                </div>
              </div>

              {/* Audit Date & Filter Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Date Quick Presets */}
                <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
                  <button
                    type="button"
                    onClick={() => setAuditDate(todayStr)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                      auditDate === todayStr ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuditDate(yesterdayStr)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                      auditDate === yesterdayStr ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuditDate('ALL')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                      auditDate === 'ALL' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    All Dates
                  </button>
                </div>

                {/* Custom Date Picker */}
                <div className="flex items-center space-x-1 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="date"
                    value={auditDate === 'ALL' ? '' : auditDate}
                    onChange={(e) => setAuditDate(e.target.value || 'ALL')}
                    className="bg-transparent text-white focus:outline-none cursor-pointer"
                  />
                </div>

                {/* Field Rep Filter */}
                <select
                  value={auditRepFilter}
                  onChange={(e) => setAuditRepFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="">All Field Representatives</option>
                  {fieldRepsList.map(rep => (
                    <option key={rep} value={rep}>{rep}</option>
                  ))}
                </select>

                {/* Toggle Detail Expansion */}
                <button
                  type="button"
                  onClick={() => setIsAuditExpanded(!isAuditExpanded)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-2 rounded-xl border border-slate-700 transition-colors cursor-pointer"
                  title={isAuditExpanded ? "Collapse Audit Breakdown" : "Expand Audit Breakdown"}
                >
                  {isAuditExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Audit Summary Stat Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Card 1: Invoiced Sales Summary */}
              <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700 space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                  <span>Daily Invoiced Sales</span>
                  <BarChart3 className="w-4 h-4 text-indigo-400" />
                </div>
                <p className="text-xl font-black text-white">৳{audit.totalInvoicedSales.toLocaleString('bn-BD', { minimumFractionDigits: 2 })}</p>
                <div className="flex items-center justify-between text-[11px] text-slate-300 pt-1 border-t border-slate-700/60">
                  <span>Paid Spot: <strong className="text-emerald-400">৳{audit.invoiceCashCollected.toLocaleString()}</strong></span>
                  <span>Credit: <strong className="text-rose-400">৳{audit.invoiceCreditIncurred.toLocaleString()}</strong></span>
                </div>
              </div>

              {/* Card 2: Total Cash & Digital Collections */}
              <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700 space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                  <span>Total Cash Inflow</span>
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-xl font-black text-emerald-400">৳{audit.totalCashInflow.toLocaleString('bn-BD', { minimumFractionDigits: 2 })}</p>
                <div className="flex items-center justify-between text-[11px] text-slate-300 pt-1 border-t border-slate-700/60">
                  <span>Ledger Dues Recv: <strong className="text-emerald-300">৳{audit.collectionsReceived.toLocaleString()}</strong></span>
                </div>
              </div>

              {/* Card 3: Payment Channel Breakdown */}
              <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700 space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                  <span>Channel Breakdown</span>
                  <CreditCard className="w-4 h-4 text-sky-400" />
                </div>
                <div className="text-xs space-y-0.5 pt-0.5">
                  <div className="flex justify-between text-slate-200">
                    <span>💵 Cash:</span>
                    <strong className="font-mono">৳{audit.cashTotal.toLocaleString()}</strong>
                  </div>
                  <div className="flex justify-between text-sky-300">
                    <span>📱 Mobile Banking:</span>
                    <strong className="font-mono">৳{audit.mobileTotal.toLocaleString()}</strong>
                  </div>
                  <div className="flex justify-between text-amber-300">
                    <span>🏦 Cheque:</span>
                    <strong className="font-mono">৳{audit.chequeTotal.toLocaleString()}</strong>
                  </div>
                </div>
              </div>

              {/* Card 4: Manager Vault & Approval Reconciliation */}
              <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700 space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                  <span>Vault Verification</span>
                  <UserCheck className="w-4 h-4 text-amber-400" />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-black text-emerald-400">৳{audit.collectionsApproved.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-400 font-bold">Approved</span>
                </div>
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-700/60">
                  <span className="text-amber-300 flex items-center gap-1 font-bold">
                    <Clock className="w-3 h-3" />
                    <span>Pending Manager Approval:</span>
                  </span>
                  <span className="font-black text-amber-400 font-mono">৳{audit.collectionsPending.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Expanded Detailed Audit Reconciliation View */}
            {isAuditExpanded && (
              <div className="space-y-4 pt-2 border-t border-slate-700/80">
                {/* Rep-Wise Reconciliation Audit Table */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-emerald-400" />
                      <span>Field Representative Cash & Collection Reconciliation Audit ({audit.repSummaryList.length} Reps)</span>
                    </h4>

                    <div className="flex items-center space-x-2">
                      {audit.collectionsPending > 0 && (userRole === UserRole.SUPER_ADMIN || userRole === UserRole.MANAGER || userRole === UserRole.ACCOUNTANT) && (
                        <button
                          type="button"
                          onClick={handleApproveAllPendingForDate}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer shadow-xs"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Batch Approve Pending (৳{audit.collectionsPending.toLocaleString()})</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setPrintAuditReport({
                            date: auditDate,
                            metrics: audit
                          });
                        }}
                        className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print Audit Summary</span>
                      </button>
                    </div>
                  </div>

                  {audit.repSummaryList.length === 0 ? (
                    <div className="p-4 bg-slate-800/50 rounded-xl text-center text-xs text-slate-400">
                      No sales or collections logged for the selected date or rep filter.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-700">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-800 text-slate-300 font-bold uppercase text-[10px] tracking-wider border-b border-slate-700">
                          <tr>
                            <th className="p-3">Field Representative</th>
                            <th className="p-3 text-right">Invoices / Value</th>
                            <th className="p-3 text-right">Spot Invoice Cash</th>
                            <th className="p-3 text-right">Dues Collections</th>
                            <th className="p-3 text-right">Total Cash Handled</th>
                            <th className="p-3 text-center">Approved Vault</th>
                            <th className="p-3 text-center">Pending Handover</th>
                            <th className="p-3 text-center">Audit Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/60 bg-slate-800/40 text-slate-200">
                          {audit.repSummaryList.map((r, idx) => {
                            const isBalanced = r.pendingAmount === 0;
                            return (
                              <tr key={idx} className="hover:bg-slate-800/80 transition-colors">
                                <td className="p-3 font-bold text-white flex items-center space-x-1.5">
                                  <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{r.repName}</span>
                                </td>
                                <td className="p-3 text-right font-mono">
                                  <span className="block font-bold text-slate-200">৳{r.invoicedTotal.toLocaleString()}</span>
                                  <span className="text-[10px] text-slate-400">{r.invoicesCount} Invoices</span>
                                </td>
                                <td className="p-3 text-right font-mono text-emerald-400 font-bold">
                                  ৳{r.salesCash.toLocaleString()}
                                </td>
                                <td className="p-3 text-right font-mono text-sky-300 font-bold">
                                  ৳{r.duesCollected.toLocaleString()}
                                </td>
                                <td className="p-3 text-right font-mono text-white font-black">
                                  ৳{r.totalHandled.toLocaleString()}
                                </td>
                                <td className="p-3 text-center font-mono text-emerald-400">
                                  ৳{r.approvedAmount.toLocaleString()}
                                </td>
                                <td className="p-3 text-center font-mono text-amber-400 font-bold">
                                  ৳{r.pendingAmount.toLocaleString()}
                                </td>
                                <td className="p-3 text-center">
                                  {isBalanced ? (
                                    <span className="inline-flex items-center space-x-1 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                                      <CheckCircle className="w-3 h-3" />
                                      <span>Vault Verified</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center space-x-1 bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2.5 py-0.5 rounded-full text-[10px] font-bold animate-pulse">
                                      <Clock className="w-3 h-3" />
                                      <span>Approval Pending</span>
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-900 text-white font-black text-xs border-t-2 border-slate-700">
                          <tr>
                            <td className="p-3">Audit Grand Total</td>
                            <td className="p-3 text-right font-mono text-indigo-300">৳{audit.totalInvoicedSales.toLocaleString()}</td>
                            <td className="p-3 text-right font-mono text-emerald-400">৳{audit.invoiceCashCollected.toLocaleString()}</td>
                            <td className="p-3 text-right font-mono text-sky-300">৳{audit.collectionsReceived.toLocaleString()}</td>
                            <td className="p-3 text-right font-mono text-emerald-300 text-sm">৳{audit.totalCashInflow.toLocaleString()}</td>
                            <td className="p-3 text-center font-mono text-emerald-400">৳{audit.collectionsApproved.toLocaleString()}</td>
                            <td className="p-3 text-center font-mono text-amber-400">৳{audit.collectionsPending.toLocaleString()}</td>
                            <td className="p-3 text-center">
                              {audit.collectionsPending === 0 ? (
                                <span className="text-[10px] text-emerald-400 uppercase font-bold">100% Reconciled</span>
                              ) : (
                                <span className="text-[10px] text-amber-300 uppercase font-bold">Reconciliation Action Required</span>
                              )}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search collections by shop or field representative..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none"
          />
        </div>

        <div className="flex items-center space-x-2 min-w-[180px]">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={selectedRoute}
            onChange={(e) => setSelectedRoute(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm"
          >
            <option value="">All Routes</option>
            {routes.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div className="flex items-center space-x-2 min-w-[180px]">
          <MapPin className="w-4 h-4 text-gray-400" />
          <select
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm"
          >
            <option value="">All Areas</option>
            {areas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Collections Table with Approval Workflows */}
      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-500">Checking vault logs...</p>
        </div>
      ) : filteredCollections.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No payments received matching search</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" id="collections-table-container">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-gray-100">
                  <th className="px-6 py-4">Receipt Reference</th>
                  <th className="px-6 py-4">Outlet Outlet Name</th>
                  <th className="px-6 py-4">Company Target</th>
                  <th className="px-6 py-4 text-right">Payment received</th>
                  <th className="px-6 py-4">Field rep log</th>
                  <th className="px-6 py-4 text-center">Vault Status</th>
                  <th className="px-6 py-4 text-center">Action pipeline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredCollections.map((col) => (
                  <tr key={col.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-bold text-blue-700 font-mono">{col.collectionNo}</td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-gray-950">{col.shopName}</p>
                      <p className="text-[10px] text-gray-400">{col.route} • {col.date}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-500 font-medium">{col.companyName}</td>
                    <td className="px-6 py-4 text-right font-black text-gray-950">৳{col.amount.toLocaleString()}</td>
                    <td className="px-6 py-4 text-gray-500">{col.collectedByName}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        col.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                        col.status === 'TRANSFERRED' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                      }`}>
                        {col.status === 'APPROVED' && <CheckCircle className="w-3.5 h-3.5" />}
                        {col.status === 'TRANSFERRED' && <ArrowRight className="w-3.5 h-3.5 animate-pulse" />}
                        {col.status === 'PENDING' && <Clock className="w-3.5 h-3.5" />}
                        <span>{col.status}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => {
                            const cust = customers.find(c => c.id === col.customerId);
                            const companyDue = cust?.dues?.[col.companyId] || 0;
                            setNotificationModalData({
                              collectionNo: col.collectionNo,
                              shopName: col.shopName,
                              customerName: col.customerName,
                              phone: cust?.phone || '',
                              amount: col.amount,
                              companyName: col.companyName,
                              date: col.date,
                              paymentMethod: col.paymentMethod,
                              referenceNo: col.referenceNo,
                              remainingDue: companyDue,
                              route: col.route,
                              area: col.area
                            });
                          }}
                          title="Send Payment Confirmation via WhatsApp or SMS"
                          className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer shadow-xs"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="hidden sm:inline">WhatsApp / SMS</span>
                        </button>

                        {/* DSR workflow: pending -> transfer to manager */}
                        {col.status === 'PENDING' && col.collectedById === userId && (
                          <button
                            onClick={() => handleTransferToManager(col.id)}
                            className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                          >
                            Submit
                          </button>
                        )}

                        {/* Manager workflow: transferred -> approve vault deposit */}
                        {col.status === 'TRANSFERRED' && ['Super Admin', 'Manager', 'Accountant'].includes(userRole) && (
                          <button
                            onClick={() => handleApproveCollection(col.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                        )}

                        {/* Default approved label */}
                        {col.status === 'APPROVED' && (
                          <span className="text-[10px] text-gray-400 font-medium hidden md:inline">✓ Verified</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Receive Cash Payment */}
      {isCollectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative">
            <button onClick={() => setIsCollectModalOpen(false)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-1">Receive Cash Payment</h3>
            <p className="text-xs text-gray-400 mb-5">Record cash collections. All collections are allocated to specific partner companies.</p>

            <form onSubmit={handleReceivePayment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Payment Log Date</label>
                <input
                  type="date"
                  required
                  value={collectionDate}
                  onChange={(e) => setCollectionDate(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Customer Outlet *</label>
                <select
                  required
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                >
                  <option value="">Select Customer</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.shopName} (Due: ৳{c.totalDue})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Manufacturer Ledger *</label>
                <select
                  required
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  disabled={!customerId}
                >
                  <option value="">Select Company Ledger</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Outstanding: ৳{customerId ? (customers.find(cu => cu.id === customerId)?.dues?.[c.id] || 0) : 0})
                    </option>
                  ))}
                </select>
              </div>

              {customerId && companyId && (
                <div className="p-3 bg-blue-50 border border-blue-100 text-blue-900 text-xs rounded-lg font-medium flex justify-between items-center">
                  <span>Current Outstanding Company Balance:</span>
                  <span className="font-bold text-base">৳{getSelectedDue().toLocaleString()}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Received Amt (৳) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={amount || ''}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Transfer Mode</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="CASH">Cash Deposit</option>
                    <option value="MOBILE_BANKING">Mobile Banking</option>
                    <option value="CHEQUE">Bank Cheque</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Reference No / Memo</label>
                <input
                  type="text"
                  placeholder="e.g. bKash TxID or Cheque Ref"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsCollectModalOpen(false)}
                  className="bg-slate-100 text-gray-600 px-4 py-2.5 rounded-lg text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>File Payment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Multi-Supplier Payment Receipt */}
      {isMultiCollectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto text-slate-800">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-xl relative max-h-[90vh] overflow-y-auto space-y-4">
            <button 
              onClick={() => {
                setIsMultiCollectModalOpen(false);
                setMultiCustomerId('');
                setMultiAmounts({});
                setMultiReferenceNo('');
              }} 
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <div>
              <h3 className="text-lg font-extrabold text-gray-900 mb-0.5">Multi-Supplier Cashier Panel</h3>
              <p className="text-xs text-gray-400">Record a single payment from an outlet across multiple partner brands/suppliers.</p>
            </div>

            <form onSubmit={handleMultiReceivePayment} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Collection Date</label>
                  <input
                    type="date"
                    required
                    value={multiCollectionDate}
                    onChange={(e) => setMultiCollectionDate(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Payment Method</label>
                  <select
                    value={multiPaymentMethod}
                    onChange={(e) => setMultiPaymentMethod(e.target.value as any)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  >
                    <option value="CASH">Cash Payment</option>
                    <option value="MOBILE_BANKING">Mobile Banking</option>
                    <option value="CHEQUE">Bank Cheque</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Customer / Outlet *</label>
                <select
                  required
                  value={multiCustomerId}
                  onChange={(e) => {
                    const cId = e.target.value;
                    setMultiCustomerId(cId);
                    setMultiAmounts({});
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                >
                  <option value="">Select Customer Outlet</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.shopName} (Total Due: ৳{c.totalDue})</option>
                  ))}
                </select>
              </div>

              {/* Company wise Previous Due and Input List */}
              {multiCustomerId && (
                <div className="space-y-2.5">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Manufacturer / Brand breakdown</span>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 max-h-60 overflow-y-auto space-y-3">
                    {companies.map(comp => {
                      const cust = customers.find(c => c.id === multiCustomerId);
                      const prevDue = cust?.dues?.[comp.id] || 0;
                      const val = multiAmounts[comp.id] || '';

                      return (
                        <div key={comp.id} className="flex items-center justify-between gap-4 py-1.5 border-b border-dashed border-slate-200 text-xs">
                          <div className="w-1/3 min-w-0">
                            <p className="font-extrabold text-slate-800 truncate">{comp.name}</p>
                            <p className="text-[10px] text-gray-400 font-mono">Code: {comp.code}</p>
                          </div>
                          <div className="w-1/3 text-gray-500 font-bold">
                            Previous Due: ৳{prevDue.toLocaleString()}
                          </div>
                          <div className="w-1/3 text-right">
                            <input
                              type="number"
                              step="any"
                              placeholder="Receive"
                              value={val}
                              onChange={(e) => {
                                const num = parseFloat(e.target.value) || 0;
                                setMultiAmounts(prev => ({ ...prev, [comp.id]: num }));
                              }}
                              className="w-28 p-2 bg-white border border-slate-200 rounded-xl text-center font-black text-xs text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary display */}
                  <div className="p-4 bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between items-center text-gray-400">
                      <span>Total Due:</span>
                      <span>৳{(() => {
                        const cust = customers.find(c => c.id === multiCustomerId);
                        return (cust?.totalDue || 0).toLocaleString();
                      })()}</span>
                    </div>
                    <div className="flex justify-between items-center text-emerald-400 font-bold text-sm border-t border-slate-800 pt-1.5">
                      <span>Receiving:</span>
                      <span>৳{Object.values(multiAmounts).reduce((sum, v) => sum + (v || 0), 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Reference No / Receipt Memo</label>
                <input
                  type="text"
                  placeholder="e.g. Multi-Brand payment reference"
                  value={multiReferenceNo}
                  onChange={(e) => setMultiReferenceNo(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsMultiCollectModalOpen(false);
                    setMultiCustomerId('');
                    setMultiAmounts({});
                    setMultiReferenceNo('');
                  }}
                  className="bg-slate-100 text-gray-600 px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!multiCustomerId || Object.values(multiAmounts).reduce((sum, v) => sum + (v || 0), 0) === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-xs font-black flex items-center space-x-1 cursor-pointer transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>File Multi Payment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Automated Notification Trigger Modal (WhatsApp / SMS Payment Received Confirmation) */}
      {notificationModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative border border-emerald-100 animate-in fade-in zoom-in-95 duration-200 text-slate-800">
            <button
              onClick={() => setNotificationModalData(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header Badge */}
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-inner shrink-0">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider mb-1">
                  পেমেন্ট সফলভাবে এন্ট্রি হয়েছে
                </span>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                  কাস্টমার রিমাইন্ডার ও রসিদ বার্তা (Notification Trigger)
                </h3>
              </div>
            </div>

            {/* Receipt Quick Summary */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 mb-4 space-y-2 text-xs">
              <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                <span className="font-bold text-slate-500">মেমো / রসিদ নম্বর:</span>
                <span className="font-black font-mono text-blue-700 text-sm">{notificationModalData.collectionNo}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-500">গ্রাহক আউটলেট:</span>
                <span className="font-extrabold text-slate-900">{notificationModalData.shopName} ({notificationModalData.customerName})</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-500">গ্রহণের পরিমাণ:</span>
                <span className="font-black text-emerald-700 text-base">৳{notificationModalData.amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-500">কোম্পানি / ব্র্যান্ড:</span>
                <span className="font-bold text-slate-800">{notificationModalData.companyName}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                <span className="font-bold text-slate-500">অবশিষ্ট মোট বকেয়া:</span>
                <span className="font-black text-rose-600">৳{notificationModalData.remainingDue.toLocaleString()}</span>
              </div>
            </div>

            {/* Editable Customer Phone */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>গ্রাহকের মোবাইল নম্বর (Customer Phone)</span>
                <span className="text-[10px] font-normal text-slate-400">WhatsApp / SMS এর জন্য প্রযোজ্য</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={notificationPhone}
                  onChange={(e) => setNotificationPhone(e.target.value)}
                  placeholder="017XXXXXXXX"
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            {/* Notification Live Message Preview */}
            <div className="mb-5">
              <label className="block text-xs font-bold text-slate-700 mb-1 flex justify-between items-center">
                <span>প্রেরণযোগ্য বার্তা প্রিভিউ (Message Preview)</span>
                <span className="text-[10px] text-emerald-600 font-bold">অটো-ফরম্যাট করা বার্তা</span>
              </label>
              <div className="p-3 bg-slate-900 text-emerald-300 rounded-2xl text-[11px] font-mono leading-relaxed whitespace-pre-wrap border border-slate-800 max-h-40 overflow-y-auto shadow-inner">
                {generateNotificationMessage({
                  ...notificationModalData,
                  phone: notificationPhone
                })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-3">
                {/* WhatsApp Button */}
                <a
                  href={`https://api.whatsapp.com/send?phone=${formatWhatsAppPhone(notificationPhone)}&text=${encodeURIComponent(
                    generateNotificationMessage({
                      ...notificationModalData,
                      phone: notificationPhone
                    })
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-2xl text-xs transition-all shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>WhatsApp এ পাঠান</span>
                </a>

                {/* SMS Button */}
                <a
                  href={`sms:${notificationPhone}?body=${encodeURIComponent(
                    generateNotificationMessage({
                      ...notificationModalData,
                      phone: notificationPhone
                    })
                  )}`}
                  className="flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-2xl text-xs transition-all shadow-md shadow-indigo-600/20 active:scale-95 cursor-pointer"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>SMS ট্রাইগার করুন</span>
                </a>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Copy Text Button */}
                <button
                  type="button"
                  onClick={() => {
                    const textToCopy = generateNotificationMessage({
                      ...notificationModalData,
                      phone: notificationPhone
                    });
                    navigator.clipboard.writeText(textToCopy);
                    setIsCopied(true);
                    setTimeout(() => setIsCopied(false), 2500);
                  }}
                  className="flex items-center justify-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-2xl text-xs transition-colors cursor-pointer"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-700">কপি হয়েছে!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-500" />
                      <span>টেক্সট কপি করুন</span>
                    </>
                  )}
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setNotificationModalData(null)}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-2xl text-xs transition-colors cursor-pointer"
                >
                  সম্পন্ন (Done)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Audit Reconciliation Report Modal */}
      {printAuditReport && (
        <PrintWrapper
          type="general"
          title={`Daily Collection Audit Reconciliation Summary (${printAuditReport.date === 'ALL' ? 'All Dates' : printAuditReport.date})`}
          data={{
            date: printAuditReport.date,
            totalInvoicedSales: printAuditReport.metrics.totalInvoicedSales,
            invoiceCashCollected: printAuditReport.metrics.invoiceCashCollected,
            invoiceCreditIncurred: printAuditReport.metrics.invoiceCreditIncurred,
            collectionsReceived: printAuditReport.metrics.collectionsReceived,
            totalCashInflow: printAuditReport.metrics.totalCashInflow,
            cashTotal: printAuditReport.metrics.cashTotal,
            mobileTotal: printAuditReport.metrics.mobileTotal,
            chequeTotal: printAuditReport.metrics.chequeTotal,
            collectionsApproved: printAuditReport.metrics.collectionsApproved,
            collectionsPending: printAuditReport.metrics.collectionsPending,
            repSummaryList: printAuditReport.metrics.repSummaryList
          }}
          onClose={() => setPrintAuditReport(null)}
        />
      )}
    </div>
  );
}
