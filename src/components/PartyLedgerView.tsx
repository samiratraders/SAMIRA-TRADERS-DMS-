/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Receipt, 
  Search, 
  Building2, 
  FileText, 
  Calendar, 
  TrendingUp, 
  DollarSign, 
  RefreshCw, 
  ArrowLeftRight,
  Eye,
  Printer,
  User,
  Plus,
  Coins,
  CheckCircle,
  X,
  PlusCircle,
  FileSpreadsheet,
  Share2,
  Save
} from 'lucide-react';
import { collection, getDocs, query, where, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { logActivity } from '../lib/activityLogger';
import { Customer, Company, CustomerLedgerEntry, UserProfile, UserRole } from '../types';
import PrintWrapper from './PrintWrapper';

interface PartyLedgerViewProps {
  preselectedCustomerId?: string;
}

interface StaffLedgerEntry {
  id: string;
  staffId: string;
  staffName: string;
  staffRole: 'DSR' | 'Manager';
  type: 'SHORTAGE' | 'PAYMENT' | 'ADJUSTMENT' | 'SALARY_ADVANCE';
  referenceId: string;
  referenceNo: string;
  date: string;
  amount: number;
  balanceAfter: number;
  remarks: string;
  createdAt: string;
}

export default function PartyLedgerView({ preselectedCustomerId }: PartyLedgerViewProps) {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'customer' | 'dsr' | 'manager'>('customer');
  
  // Base Data States
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [staffUsers, setStaffUsers] = useState<UserProfile[]>([]);
  const [staffLedgerEntries, setStaffLedgerEntries] = useState<StaffLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Advanced Filters
  const [selectedArea, setSelectedArea] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected Entities
  const [selectedCustomerId, setSelectedCustomerId] = useState(preselectedCustomerId || '');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [ledgerEntries, setLedgerEntries] = useState<CustomerLedgerEntry[]>([]);
  
  const [selectedStaffId, setSelectedStaffId] = useState('');

  // --- MODAL POPUP STATES ---
  const [showStaffCreditModal, setShowStaffCreditModal] = useState(false);
  const [showExtraSalesModal, setShowExtraSalesModal] = useState(false);

  // Print Wrapper States
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printType, setPrintType] = useState<'invoice' | 'settlement' | 'ledger' | 'general'>('general');
  const [printTitle, setPrintTitle] = useState('');
  const [printData, setPrintData] = useState<any>(null);

  // Invoice Details Modal
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [showInvoiceDetailsModal, setShowInvoiceDetailsModal] = useState(false);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  // Form States - Staff Credit Adjustments
  const [staffCreditDate, setStaffCreditDate] = useState(new Date().toISOString().split('T')[0]);
  const [staffCreditType, setStaffCreditType] = useState<'PAYMENT' | 'ADJUSTMENT' | 'SALARY_ADVANCE' | 'SHORTAGE'>('PAYMENT');
  const [staffCreditAmount, setStaffCreditAmount] = useState<number>(0);
  const [staffCreditRemarks, setStaffCreditRemarks] = useState('');

  // Form States - Extra Sales Debit
  const [extraSalesDate, setExtraSalesDate] = useState(new Date().toISOString().split('T')[0]);
  const [extraSalesCompany, setExtraSalesCompany] = useState('');
  const [extraSalesAmount, setExtraSalesAmount] = useState<number>(0);
  const [extraSalesRefNo, setExtraSalesRefNo] = useState('');
  const [extraSalesRemarks, setExtraSalesRemarks] = useState('');

  // --- BULK CUSTOMER PAYMENT STATES ---
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isBulkCustomerModalOpen, setIsBulkCustomerModalOpen] = useState(false);
  const [bulkCustomerPayments, setBulkCustomerPayments] = useState<Record<string, string>>({});
  const [bulkPaymentDate, setBulkPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [bulkSearchTerm, setBulkSearchTerm] = useState('');
  const [bulkSelectedArea, setBulkSelectedArea] = useState('');
  const [bulkSelectedCompanyId, setBulkSelectedCompanyId] = useState('');

  const getBulkCustomerTotal = () => {
    let total = 0;
    Object.values(bulkCustomerPayments).forEach((v: any) => {
      total += parseFloat(v) || 0;
    });
    return total;
  };

  const getBulkDuesList = () => {
    const list: Array<{
      customerId: string;
      customerName: string;
      shopName: string;
      route: string;
      companyId: string;
      companyName: string;
      dueAmount: number;
    }> = [];

    customers.forEach(cust => {
      // Filter by Area/Route inside the modal
      if (bulkSelectedArea && cust.route !== bulkSelectedArea) return;
      
      // Filter by Customer Search Term
      if (bulkSearchTerm) {
        const term = bulkSearchTerm.toLowerCase();
        const matches = cust.shopName.toLowerCase().includes(term) ||
                        cust.name.toLowerCase().includes(term) ||
                        (cust.phone && cust.phone.includes(term));
        if (!matches) return;
      }

      if (cust.dues) {
        Object.keys(cust.dues).forEach(compId => {
          // Filter by Company inside the modal
          if (bulkSelectedCompanyId && compId !== bulkSelectedCompanyId) return;

          const dueAmount = cust.dues?.[compId] || 0;
          if (dueAmount > 0) {
            const comp = companies.find(c => c.id === compId);
            list.push({
              customerId: cust.id,
              customerName: cust.name,
              shopName: cust.shopName,
              route: cust.route || '',
              companyId: compId,
              companyName: comp?.name || 'Unknown Company',
              dueAmount: dueAmount
            });
          }
        });
      }
    });

    return list;
  };

  const loadData = async () => {
    try {
      setLoading(true);

      const userProfileLocal = localStorage.getItem('user_profile_cache');
      if (userProfileLocal) {
        try {
          setCurrentUser(JSON.parse(userProfileLocal));
        } catch (_) {}
      }

      const [compSnap, custSnap, usersSnap, staffLedgersSnap] = await Promise.all([
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'staffLedgers'))
      ]);

      const compList: Company[] = [];
      compSnap.forEach(d => compList.push(d.data() as Company));
      setCompanies(compList);

      const custList: Customer[] = [];
      custSnap.forEach(d => {
        const c = d.data() as Customer;
        const total = Object.values(c.dues || {}).reduce((s, a) => s + (Number(a) || 0), 0);
        custList.push({ ...c, totalDue: total });
      });
      setCustomers(custList);

      const usersList: UserProfile[] = [];
      usersSnap.forEach(d => usersList.push({ id: d.id, ...d.data() } as UserProfile));
      setStaffUsers(usersList);

      if (preselectedCustomerId) {
        setSelectedCustomerId(preselectedCustomerId);
      }
    } catch (err) {
      console.error('Error loading ledger prerequisites:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [preselectedCustomerId]);

  // Fetch historic customer ledger entries
  const fetchCustomerLedgerEntries = async () => {
    if (!selectedCustomerId || !selectedCompanyId) {
      setLedgerEntries([]);
      return;
    }

    try {
      setLoading(true);
      const ledgerRef = collection(db, 'ledgers');
      const q = query(
        ledgerRef,
        where('customerId', '==', selectedCustomerId),
        where('companyId', '==', selectedCompanyId)
      );
      const ledgerSnap = await getDocs(q);
      const entries: CustomerLedgerEntry[] = [];
      ledgerSnap.forEach(d => {
        entries.push(d.data() as CustomerLedgerEntry);
      });

      entries.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
      setLedgerEntries(entries);
    } catch (err) {
      console.error('Error fetching customer ledgers:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch staff ledger entries
  const fetchStaffLedgerEntries = async () => {
    if (!selectedStaffId) {
      setStaffLedgerEntries([]);
      return;
    }

    try {
      setLoading(true);
      const staffLedgersSnap = await getDocs(collection(db, 'staffLedgers'));
      const entries: StaffLedgerEntry[] = [];
      staffLedgersSnap.forEach(d => {
        const entry = d.data() as StaffLedgerEntry;
        if (entry.staffId === selectedStaffId) {
          entries.push(entry);
        }
      });

      entries.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
      setStaffLedgerEntries(entries);
    } catch (err) {
      console.error('Error fetching staff ledgers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewInvoiceDetails = async (entry: CustomerLedgerEntry) => {
    try {
      setLoadingInvoice(true);
      const salesRef = collection(db, 'sales');
      const salesSnap = await getDocs(salesRef);
      let found: any = null;
      salesSnap.forEach(doc => {
        const d = doc.data();
        if (d.invoiceNo === entry.referenceNo || d.id === entry.referenceId) {
          found = d;
        }
      });

      if (found) {
        setSelectedInvoice(found);
        setShowInvoiceDetailsModal(true);
      } else {
        alert('দুঃখিত, এই ইনভয়েসের বিস্তারিত বিবরণ ডাটাবেজে পাওয়া যায়নি!');
      }
    } catch (err) {
      console.error('Error loading invoice details:', err);
      alert('ইনভয়েস লোড করতে সমস্যা হয়েছে।');
    } finally {
      setLoadingInvoice(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'customer') {
      fetchCustomerLedgerEntries();
    } else {
      fetchStaffLedgerEntries();
    }
  }, [selectedCustomerId, selectedCompanyId, selectedStaffId, activeTab]);

  const activeCustomer = customers.find(c => c.id === selectedCustomerId);
  const activeCompany = companies.find(c => c.id === selectedCompanyId);
  const activeStaff = staffUsers.find(u => u.id === selectedStaffId);

  const filteredLedgerEntries = ledgerEntries.filter(entry => {
    if (startDate && entry.date < startDate) return false;
    if (endDate && entry.date > endDate) return false;
    return true;
  });

  const filteredStaffLedgerEntries = staffLedgerEntries.filter(entry => {
    if (startDate && entry.date < startDate) return false;
    if (endDate && entry.date > endDate) return false;
    return true;
  });

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.shopName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesArea = selectedArea ? (c.route === selectedArea || c.area === selectedArea) : true;
    return matchesSearch && matchesArea;
  });

  const dsrList = staffUsers.filter(u => u.role === 'DSR' || u.role === UserRole.DSR);
  const managerList = staffUsers.filter(u => u.role === 'Manager' || u.role === UserRole.MANAGER || u.role === UserRole.SUPER_ADMIN);

  const activeStaffList = activeTab === 'dsr' ? dsrList : managerList;

  const filteredStaffList = activeStaffList.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.phone.includes(searchTerm)
  );

  // --- SUBMIT STAFF PAYMENTS / ADJUSTMENT CREDIT / ADVANCE DEBIT ---
  const handleStaffCreditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId || !activeStaff) return;
    if (staffCreditAmount <= 0) {
      alert('সঠিক অংকের পরিমাণ প্রবেশ করান!');
      return;
    }

    try {
      setLoading(true);
      const batch = writeBatch(db);

      // Fetch active staff current balance
      const currentShortage = activeStaff.outstandingShortage || 0;
      const isCredit = staffCreditType === 'PAYMENT' || staffCreditType === 'ADJUSTMENT';
      const newOutstandingShortage = isCredit 
        ? Math.max(0, currentShortage - staffCreditAmount) 
        : currentShortage + staffCreditAmount;

      // Create staff ledger entry
      const ledgerId = `ledger-staff-${staffCreditType.toLowerCase()}-${Date.now()}`;
      const prefix = staffCreditType === 'PAYMENT' ? 'PAY' : staffCreditType === 'ADJUSTMENT' ? 'ADJ' : staffCreditType === 'SALARY_ADVANCE' ? 'ADV' : 'SHT';
      const newEntry: StaffLedgerEntry = {
        id: ledgerId,
        staffId: selectedStaffId,
        staffName: activeStaff.name,
        staffRole: activeTab === 'dsr' ? 'DSR' : 'Manager',
        type: staffCreditType,
        referenceId: ledgerId,
        referenceNo: `${prefix}-${ledgerId.slice(-5).toUpperCase()}`,
        date: staffCreditDate,
        amount: staffCreditAmount,
        balanceAfter: newOutstandingShortage,
        remarks: staffCreditRemarks || `${staffCreditType === 'PAYMENT' ? 'নগদ জমা গ্রহণ' : staffCreditType === 'ADJUSTMENT' ? 'হিসাব সমন্বয়' : staffCreditType === 'SALARY_ADVANCE' ? 'বেতন অগ্রিম / অ্যাডভান্স গ্রহণ' : 'ঘাটতি ডেবিট এন্ট্রি'} করা হয়েছে।`,
        createdAt: new Date().toISOString()
      };

      // 1. Write ledger entry
      batch.set(doc(db, 'staffLedgers', ledgerId), newEntry);

      // 2. Update user profile shortage balance
      batch.update(doc(db, 'users', selectedStaffId), {
        outstandingShortage: newOutstandingShortage
      });

      await batch.commit();
      alert('স্টাফ লেজার ও অগ্রিম খতিয়ান পোস্টিং সফলভাবে সম্পন্ন হয়েছে!');
      setShowStaffCreditModal(false);
      setStaffCreditAmount(0);
      setStaffCreditRemarks('');
      loadData();
    } catch (err) {
      console.error('Error posting staff credit:', err);
      alert('পোস্টিং করতে ত্রুটি হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  // --- SUBMIT EXTRA SALES DEBIT ---
  const handleExtraSalesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !activeCustomer) return;
    if (!extraSalesCompany) {
      alert('দয়া করে কোম্পানি নির্বাচন করুন!');
      return;
    }
    if (extraSalesAmount <= 0) {
      alert('সঠিক টাকা নির্বাচন করুন!');
      return;
    }

    try {
      setLoading(true);
      const batch = writeBatch(db);

      const compObj = companies.find(c => c.id === extraSalesCompany);
      const currentDues = activeCustomer.dues || {};
      const prevDue = currentDues[extraSalesCompany] || 0;
      const updatedCompanyDue = prevDue + extraSalesAmount;
      const updatedDues = {
        ...currentDues,
        [extraSalesCompany]: updatedCompanyDue
      };
      const updatedTotalDue = Object.values(updatedDues).reduce((s: number, val: any) => s + (Number(val) || 0), 0);

      // 1. Write Customer Ledger Entry
      const ledgerEntryId = `ledger-manual-${selectedCustomerId}-${Date.now()}`;
      const newEntry: CustomerLedgerEntry = {
        id: ledgerEntryId,
        customerId: selectedCustomerId,
        companyId: extraSalesCompany,
        companyName: compObj?.name || 'Samira Traders',
        type: 'INVOICE',
        referenceId: ledgerEntryId,
        referenceNo: extraSalesRefNo || `MAN-${ledgerEntryId.slice(-5).toUpperCase()}`,
        date: extraSalesDate,
        amount: extraSalesAmount,
        balanceAfter: updatedCompanyDue,
        createdAt: new Date().toISOString()
      };

      batch.set(doc(db, 'ledgers', ledgerEntryId), newEntry);

      // 2. Update Customer outstanding balance
      batch.update(doc(db, 'customers', selectedCustomerId), {
        dues: updatedDues,
        totalDue: updatedTotalDue
      });

      await batch.commit();
      alert('গ্রাহকের লেজারে বাড়তি বিক্রয় ডেবিট এন্ট্রি সফলভাবে যুক্ত করা হয়েছে!');
      setShowExtraSalesModal(false);
      setExtraSalesAmount(0);
      setExtraSalesRefNo('');
      setExtraSalesRemarks('');
      loadData();
    } catch (err) {
      console.error('Error posting manual invoice debit:', err);
      alert('ডেবিট পোস্ট করতে সমস্যা হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  // --- SUBMIT BULK CUSTOMER PAYMENTS ---
  const handleBulkCustomerPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const batch = writeBatch(db);
      let paymentCount = 0;

      for (const [key, amountStr] of Object.entries(bulkCustomerPayments)) {
        const amount = parseFloat(amountStr as string) || 0;
        if (amount > 0) {
          const [customerId, companyId] = key.split('_');
          if (!customerId || !companyId) continue;

          const customer = customers.find(c => c.id === customerId);
          const company = companies.find(c => c.id === companyId);

          if (customer && company) {
            const currentDue = customer.dues?.[companyId] || 0;
            const updatedCompanyDue = Math.max(0, currentDue - amount);
            const updatedDues = {
              ...(customer.dues || {}),
              [companyId]: updatedCompanyDue
            };
            const updatedTotalDue = Object.values(updatedDues).reduce((s: number, a: any) => s + (Number(a) || 0), 0);

            // 1. Generate collection record
            const collectionId = 'col-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
            const collectionNo = 'COL-' + Date.now().toString().slice(-4) + Math.random().toString().slice(-2);

            // Save collection doc
            const collectionObj = {
              id: collectionId,
              collectionNo,
              date: bulkPaymentDate,
              customerId,
              customerName: customer.name,
              shopName: customer.shopName,
              companyId,
              companyName: company.name,
              amount,
              paymentMethod: 'CASH',
              referenceNo: 'BULK_RECEIPT',
              route: customer.route || '',
              area: customer.area || customer.route || '',
              collectedById: currentUser?.id || 'admin_office_fallback',
              collectedByName: currentUser?.name || 'Office Admin Desk',
              status: (currentUser?.role === 'Manager' || currentUser?.role === 'Super Admin' || currentUser?.role === 'Accountant') ? 'APPROVED' : 'PENDING',
              transferredToManager: (currentUser?.role === 'Manager' || currentUser?.role === 'Super Admin' || currentUser?.role === 'Accountant'),
              createdAt: new Date().toISOString()
            };

            batch.set(doc(db, 'collections', collectionId), collectionObj);

            // 2. Update customer dues
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
              companyName: company.name,
              type: 'PAYMENT',
              referenceId: collectionId,
              referenceNo: collectionNo,
              date: bulkPaymentDate,
              amount,
              balanceAfter: updatedCompanyDue,
              createdAt: new Date().toISOString()
            });

            paymentCount++;
          }
        }
      }

      if (paymentCount === 0) {
        alert('দয়া করে অন্তত একটি কাস্টমারের ঘরে পেমেন্ট এমাউন্ট প্রদান করুন!');
        setLoading(false);
        return;
      }

      await batch.commit();

      // Log activity
      await logActivity(
        currentUser?.id || 'admin_office_fallback',
        currentUser?.name || 'Office Admin Desk',
        currentUser?.role || 'Manager',
        'PAYMENT_ENTRY',
        `Recorded bulk payment collection for ${paymentCount} customers. Total received: ৳${getBulkCustomerTotal().toLocaleString()}`,
        { paymentCount, totalAmount: getBulkCustomerTotal() }
      );

      alert(`সফলভাবে ${paymentCount}টি কাস্টমার পেমেন্ট রশিদ এন্ট্রি করা হয়েছে ও খতিয়ান আপডেট করা হয়েছে!`);
      setIsBulkCustomerModalOpen(false);
      setBulkCustomerPayments({});
      loadData();
    } catch (err) {
      console.error('Error submitting bulk customer payments:', err);
      alert('কাস্টমার পেমেন্ট পোস্টিং ব্যাহত হয়েছে। পুনরায় চেষ্টা করুন।');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6" id="ledgers-module">
      
      {/* Bulk Customer Payment Modal */}
      {isBulkCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl relative border border-slate-100 flex flex-col my-8">
            <button 
              type="button"
              onClick={() => setIsBulkCustomerModalOpen(false)} 
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 text-gray-400 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                <Coins className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 leading-tight">বাল্ক কাস্টমার পেমেন্ট রশিদ পোস্টিং</h3>
                <p className="text-xs text-gray-400">রুট বা কোম্পানি সিলেক্ট করে কাস্টমারদের বকেয়া কালেকশন পোস্টিং একত্রে সম্পন্ন করুন</p>
              </div>
            </div>

            {/* Date & Filter Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">পেমেন্ট কালেকশন তারিখ</label>
                <input
                  type="date"
                  value={bulkPaymentDate}
                  onChange={(e) => setBulkPaymentDate(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">রুট / এরিয়া ফিল্টার</label>
                <select
                  value={bulkSelectedArea}
                  onChange={(e) => setBulkSelectedArea(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none text-slate-700"
                >
                  <option value="">-- সকল রুট (All Routes) --</option>
                  {Array.from(new Set(customers.map(c => c.route).filter(Boolean))).map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">কোম্পানি / ব্র্যান্ড ফিল্টার</label>
                <select
                  value={bulkSelectedCompanyId}
                  onChange={(e) => setBulkSelectedCompanyId(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none text-slate-700"
                >
                  <option value="">-- সকল ব্র্যান্ড (All Brands) --</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">কাস্টমার খুঁজুন (Search Customer)</label>
                <input
                  type="text"
                  placeholder="আউটলেট বা মালিকের নাম..."
                  value={bulkSearchTerm}
                  onChange={(e) => setBulkSearchTerm(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none"
                />
              </div>
            </div>

            {/* List and Table */}
            <form onSubmit={handleBulkCustomerPaymentSubmit} className="space-y-4 flex-1 flex flex-col min-h-0">
              <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50 max-h-[350px] overflow-y-auto flex-1">
                <table className="w-full text-left text-xs relative">
                  <thead className="bg-slate-100 text-gray-500 font-bold border-b sticky top-0 z-10">
                    <tr>
                      <th className="p-3 text-left">আউটলেট / কাস্টমার</th>
                      <th className="p-3 text-left">রুট / এরিয়া</th>
                      <th className="p-3 text-left">কোম্পানি / ব্র্যান্ড</th>
                      <th className="p-3 text-right">বকেয়া পরিমাণ</th>
                      <th className="p-3 text-center w-40">পরিশোধ এমাউন্ট (৳)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
                    {getBulkDuesList().length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-gray-400">
                          কোনো বকেয়া কাস্টমার তথ্য পাওয়া যায়নি বা ফিল্টার ম্যাচ করেনি।
                        </td>
                      </tr>
                    ) : (
                      getBulkDuesList().map(item => {
                        const key = `${item.customerId}_${item.companyId}`;
                        return (
                          <tr key={key} className="hover:bg-slate-50/50">
                            <td className="p-3 text-left">
                              <p className="font-bold text-slate-900">{item.shopName}</p>
                              <p className="text-[10px] text-gray-400">{item.customerName}</p>
                            </td>
                            <td className="p-3 text-left text-slate-500">
                              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[10px] font-bold">
                                {item.route || 'সাধারণ এরিয়া'}
                              </span>
                            </td>
                            <td className="p-3 text-left text-blue-700 font-bold">
                              {item.companyName}
                            </td>
                            <td className="p-3 text-right font-black text-amber-700 font-mono">
                              ৳{item.dueAmount.toLocaleString()}
                            </td>
                            <td className="p-3 text-center">
                              <input
                                type="number"
                                min="0"
                                max={item.dueAmount}
                                placeholder="৳0"
                                value={bulkCustomerPayments[key] || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setBulkCustomerPayments(prev => ({
                                    ...prev,
                                    [key]: val
                                  }));
                                }}
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold font-mono text-center text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Action and Summary Footer */}
              <div className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
                <div className="text-xs">
                  <span className="text-gray-400">সর্বমোট পোস্টিং কালেকশন:</span>
                  <strong className="text-emerald-700 text-base font-black ml-1.5 font-mono">
                    ৳{getBulkCustomerTotal().toLocaleString()}
                  </strong>
                  <span className="text-gray-400 ml-3">
                    ({Object.values(bulkCustomerPayments).filter((v: any) => parseFloat(v) > 0).length}টি কাস্টমার অ্যাকাউন্ট)
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsBulkCustomerModalOpen(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-gray-600 px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                  >
                    বাতিল করুন
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-black flex items-center space-x-1.5 cursor-pointer transition-all shadow-md shadow-emerald-600/10"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>একসাথে সেভ করুন (Save All Receipts)</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 1. Modal: Staff Credit Adjustment */}
      {showStaffCreditModal && activeStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
          <form onSubmit={handleStaffCreditSubmit} className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative border border-gray-100 space-y-4">
            <button 
              type="button"
              onClick={() => setShowStaffCreditModal(false)} 
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-base font-black text-slate-900 border-b pb-2 flex items-center">
              <Coins className="w-5 h-5 text-blue-600 mr-2" />
              <span>
                {staffCreditType === 'SALARY_ADVANCE' 
                  ? `কর্মচারী অগ্রিম/অ্যাডভান্স পেমেন্ট এন্ট্রি (${activeStaff.name})` 
                  : `পেমেন্ট রিসিভ ও লেজার সমন্বয় (${activeStaff.name})`}
              </span>
            </h3>

            <div className="space-y-3 text-xs">
              
              <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-100">
                <p className="font-semibold text-blue-800">মোট বর্তমান বকেয়া / ঘাটতি পরিমাণ:</p>
                <p className="text-xl font-black font-mono text-blue-900 mt-1">৳{(activeStaff.outstandingShortage || 0).toLocaleString()}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase">পোস্টিং তারিখ (Date)</label>
                  <input
                    type="date"
                    value={staffCreditDate}
                    onChange={(e) => setStaffCreditDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-gray-200 rounded-xl font-mono focus:outline-none text-slate-800 font-bold"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase">লেনদেন / সমন্বয়ের ধরণ</label>
                  <select
                    value={staffCreditType}
                    onChange={(e: any) => setStaffCreditType(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-gray-200 rounded-xl font-bold focus:outline-none text-xs text-slate-800"
                  >
                    <option value="PAYMENT">নগদ জমা গ্রহণ (Payment Credit)</option>
                    <option value="ADJUSTMENT">অফিসিয়াল সমন্বয় (Adjustment Credit)</option>
                    <option value="SALARY_ADVANCE">বেতন অগ্রিম / অ্যাডভান্স প্রদান (Salary Advance Debit)</option>
                    <option value="SHORTAGE">ক্যাশ ঘাটতি পোস্টিং (Shortage Debit)</option>
                  </select>
                </div>
              </div>

              {staffCreditType === 'SALARY_ADVANCE' && (
                <div className="p-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-[11px] leading-relaxed">
                  📌 <strong>বেতন অগ্রিম (Salary Advance):</strong> এটি কর্মচারীকে অগ্রিম বা ধার দেওয়া হিসেবে হিসাবভুক্ত হবে এবং তার চলতি বকেয়া/অগ্রিম সমন্বয়ের মোট ব্যালেন্স বৃদ্ধি করবে।
                </div>
              )}
              {staffCreditType === 'PAYMENT' && (
                <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-[11px] leading-relaxed">
                  📌 <strong>নগদ জমা (Payment Credit):</strong> এটি কর্মচারী থেকে পূর্বে গৃহীত অগ্রিম বা ঘাটতির টাকা ফেরত গ্রহণ হিসেবে জমা হবে এবং তার মোট বকেয়া ব্যালেন্স হ্রাস করবে।
                </div>
              )}
              {staffCreditType === 'SHORTAGE' && (
                <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-[11px] leading-relaxed">
                  📌 <strong>ক্যাশ ঘাটতি (Shortage Debit):</strong> দৈনিক বাজার ডিস্ট্রিবিউশন শেষে হিসাব মেলানোর সময়ে ক্যাশ মেমোতে কোনো শর্টেজ/ঘাটতি হলে তা ডেবিট হিসেবে এখানে পোস্টিং হবে।
                </div>
              )}
              {staffCreditType === 'ADJUSTMENT' && (
                <div className="p-3 bg-blue-50 text-blue-800 border border-blue-200 rounded-xl text-[11px] leading-relaxed">
                  📌 <strong>অফিসিয়াল সমন্বয় (Adjustment Credit):</strong> বিশেষ বিবেচনায় বা বেতন থেকে কর্তনপূর্বক হিসাব সমন্বয় করার জন্য এটি ক্রেডিট পোস্টিং হিসেবে কাজ করবে।
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">
                  {staffCreditType === 'SALARY_ADVANCE' ? 'অগ্রিম টাকার পরিমাণ (Advance Amount ৳) *' : 'টাকার পরিমাণ (Amount ৳) *'}
                </label>
                <input
                  type="number"
                  placeholder={staffCreditType === 'SALARY_ADVANCE' ? 'কত টাকা অগ্রিম বা অ্যাডভান্স দেওয়া হবে' : 'কত টাকা সমন্বয় বা ক্রেডিট হবে'}
                  value={staffCreditAmount || ''}
                  onChange={(e) => setStaffCreditAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full p-2.5 bg-slate-50 border border-gray-200 rounded-xl font-bold font-mono text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">মন্তব্য / রেফারেন্স রশিদ নম্বর (Remarks)</label>
                <textarea
                  rows={2}
                  placeholder={staffCreditType === 'SALARY_ADVANCE' ? 'যেমন: জুলাই মাসের বেতন থেকে কর্তনযোগ্য অগ্রিম' : 'এন্ট্রি সংক্রান্ত মন্তব্য বা রেফারেন্স রশিদ নম্বর লিখুন'}
                  value={staffCreditRemarks}
                  onChange={(e) => setStaffCreditRemarks(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-gray-200 rounded-xl focus:outline-none"
                />
              </div>

            </div>

            <div className="pt-3 border-t flex justify-end space-x-2">
              <button 
                type="button"
                onClick={() => setShowStaffCreditModal(false)} 
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer"
              >
                বাতিল করুন
              </button>
              <button 
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer shadow-lg shadow-blue-500/10"
              >
                {staffCreditType === 'SALARY_ADVANCE' ? 'অগ্রিম এন্ট্রি সেভ করুন' : 'পোস্ট করুন (Post Entry)'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. Modal: Customer Extra Sales Debit */}
      {showExtraSalesModal && activeCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
          <form onSubmit={handleExtraSalesSubmit} className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative border border-gray-100 space-y-4">
            <button 
              type="button"
              onClick={() => setShowExtraSalesModal(false)} 
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-base font-black text-slate-900 border-b pb-2 flex items-center">
              <PlusCircle className="w-5 h-5 text-emerald-600 mr-2" />
              <span>বাড়তি সেলস ডেবিট যুক্তকরণ ({activeCustomer.shopName})</span>
            </h3>

            <div className="space-y-3 text-xs">
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase">তারিখ (Date)</label>
                  <input
                    type="date"
                    value={extraSalesDate}
                    onChange={(e) => setExtraSalesDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-gray-200 rounded-xl font-mono focus:outline-none"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase">মেমো নম্বর (Reference No)</label>
                  <input
                    type="text"
                    placeholder="মেমো নং"
                    value={extraSalesRefNo}
                    onChange={(e) => setExtraSalesRefNo(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-gray-200 rounded-xl font-mono focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">ব্র্যান্ড কোম্পানি নির্বাচন (Manufacturer) *</label>
                <select
                  value={extraSalesCompany}
                  onChange={(e) => setExtraSalesCompany(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-gray-200 rounded-xl font-bold focus:outline-none text-xs"
                  required
                >
                  <option value="">-- কোম্পানি সিলেক্ট করুন --</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">ডেবিট টাকার পরিমাণ (Debit Amount ৳) *</label>
                <input
                  type="number"
                  placeholder="কত টাকার ডেবিট এন্ট্রি হবে"
                  value={extraSalesAmount || ''}
                  onChange={(e) => setExtraSalesAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full p-2.5 bg-slate-50 border border-gray-200 rounded-xl font-bold font-mono focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">মন্তব্য (Remarks)</label>
                <textarea
                  rows={2}
                  placeholder="এন্ট্রি সংক্রান্ত বিস্তারিত মন্তব্য"
                  value={extraSalesRemarks}
                  onChange={(e) => setExtraSalesRemarks(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-gray-200 rounded-xl focus:outline-none"
                />
              </div>

            </div>

            <div className="pt-3 border-t flex justify-end space-x-2">
              <button 
                type="button"
                onClick={() => setShowExtraSalesModal(false)} 
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer"
              >
                বাতিল করুন
              </button>
              <button 
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer shadow-lg shadow-emerald-500/10"
              >
                ডেবিট পোস্ট করুন (Post Debit)
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center">
            <FileSpreadsheet className="w-6 h-6 text-blue-600 mr-2" />
            <span>সামীরা ট্রেডার্স ডিস্ট্রিবিউশন সমন্বিত লেজার রেজিস্ট্রি</span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            গ্রাহক ডিলারের কোম্পানি-ভিত্তিক বাকি লেজার, ডিএসআর ঘাটতি টাকা এবং ম্যানেজারের ক্যাশ শর্ট হিসাব রেজিস্ট্রি ও সমন্বয় ডেস্ক।
          </p>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setBulkPaymentDate(new Date().toISOString().split('T')[0]);
              setBulkCustomerPayments({});
              setBulkSearchTerm('');
              setBulkSelectedArea('');
              setBulkSelectedCompanyId('');
              setIsBulkCustomerModalOpen(true);
            }}
            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl cursor-pointer shadow-md shadow-emerald-600/15 transition-all"
          >
            <Coins className="w-4 h-4" />
            <span>বাল্ক কাস্টমার পেমেন্ট (Bulk Receipt)</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex space-x-1.5 p-1 bg-slate-100 rounded-2xl max-w-md">
        <button
          onClick={() => {
            setActiveTab('customer');
            setSelectedStaffId('');
            setSearchTerm('');
          }}
          className={`flex-1 text-center py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${
            activeTab === 'customer' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          গ্রাহক লেজার (Customer)
        </button>
        <button
          onClick={() => {
            setActiveTab('dsr');
            setSelectedCustomerId('');
            setSelectedCompanyId('');
            setSearchTerm('');
          }}
          className={`flex-1 text-center py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${
            activeTab === 'dsr' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          DSR লেজার
        </button>
        <button
          onClick={() => {
            setActiveTab('manager');
            setSelectedCustomerId('');
            setSelectedCompanyId('');
            setSearchTerm('');
          }}
          className={`flex-1 text-center py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${
            activeTab === 'manager' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          ম্যানেজার লেজার
        </button>
      </div>

      {/* Primary Layout Block */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left pane: Filterable Entity Selection Directory */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
          <h3 className="font-bold text-gray-900 text-sm tracking-tight flex items-center">
            <Search className="w-4 h-4 mr-1.5 text-gray-400" />
            <span>
              {activeTab === 'customer' ? 'গ্রাহক আউটলেট খুজুন' :
               activeTab === 'dsr' ? 'ডিএসআর কর্মচারী তালিকা' :
               'ম্যানেজার ও এডমিন অফিস'}
            </span>
          </h3>

          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder={activeTab === 'customer' ? 'আউটলেট বা মালিকের নাম লিখুন...' : 'নাম বা ফোন নম্বর দিয়ে ফিল্টার করুন...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
            />
          </div>

          {activeTab === 'customer' && (
            <div className="space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <label className="block text-[10px] font-black text-slate-500 uppercase">এরিয়া ফিল্টার (Area/Route Filter)</label>
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="w-full bg-white p-2 border border-slate-200 rounded-lg text-xs font-bold text-blue-700 focus:outline-none"
              >
                <option value="">-- সকল রুট / এরিয়া (All Route Areas) --</option>
                {Array.from(new Set(customers.map(c => c.route).filter(Boolean))).map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin">
            {activeTab === 'customer' ? (
              filteredCustomers.map(cust => (
                <button
                  key={cust.id}
                  onClick={() => {
                    setSelectedCustomerId(cust.id);
                    setSelectedCompanyId(''); // reset company drilldown
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex justify-between items-center ${
                    selectedCustomerId === cust.id 
                      ? 'bg-blue-50 border-blue-200 shadow-sm' 
                      : 'bg-white hover:bg-slate-50 border-slate-100'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-xs text-slate-800 truncate">{cust.shopName}</p>
                    <p className="text-[10px] text-gray-400 truncate">{cust.name} • {cust.route}</p>
                  </div>
                  <span className={`text-xs font-bold shrink-0 ml-2 ${cust.totalDue > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    ৳{cust.totalDue.toLocaleString()}
                  </span>
                </button>
              ))
            ) : (
              // Staff Users (DSR / Manager) List Rendering
              filteredStaffList.map(user => {
                const shortage = user.outstandingShortage || 0;
                return (
                  <button
                    key={user.id}
                    onClick={() => {
                      setSelectedStaffId(user.id);
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex justify-between items-center ${
                      selectedStaffId === user.id 
                        ? 'bg-blue-50 border-blue-200 shadow-sm' 
                        : 'bg-white hover:bg-slate-50 border-slate-100'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-xs text-slate-800 truncate">{user.name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{user.role} • {user.phone}</p>
                    </div>
                    <span className={`text-xs font-bold shrink-0 ml-2 ${shortage > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      ৳{shortage.toLocaleString()}
                    </span>
                  </button>
                );
              })
            )}

            {((activeTab === 'customer' && filteredCustomers.length === 0) ||
              (activeTab !== 'customer' && filteredStaffList.length === 0)) && (
              <p className="text-xs text-gray-400 italic text-center py-10">কোনো তথ্য পাওয়া যায়নি।</p>
            )}
          </div>
        </div>

        {/* Right pane: Drilldown Ledger Statements & Actions */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm lg:col-span-2 space-y-6">
          
          {/* A. CUSTOMER TABS AUDIT DESK */}
          {activeTab === 'customer' && (
            <>
              {!selectedCustomerId ? (
                <div className="text-center py-20">
                  <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium text-sm">কোনো গ্রাহক সিলেক্ট করা হয়নি</p>
                  <p className="text-xs text-gray-400 mt-1">বামদিকের গ্রাহক তালিকা থেকে একটি আউটলেট নির্বাচন করে খতিয়ান হিসাব চালু করুন।</p>
                </div>
              ) : (
                <>
                  {/* Outlet Summary Header & Extra Sales Action */}
                  {activeCustomer && (
                    <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <h3 className="font-extrabold text-gray-900 text-base leading-tight">{activeCustomer.shopName}</h3>
                        <p className="text-[11px] text-gray-400">মালিক: {activeCustomer.name} | মোবাইল: {activeCustomer.phone} | রুট: {activeCustomer.route}</p>
                      </div>
                      <button
                        onClick={() => {
                          setExtraSalesCompany('');
                          setShowExtraSalesModal(true);
                        }}
                        className="flex items-center space-x-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition-colors shadow-sm shadow-emerald-600/10 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>বাড়তি সেলস (Add Extra Sales Debit)</span>
                      </button>
                    </div>
                  )}

                  {/* Company Wise Outstanding Balances */}
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">কোম্পানি ভিত্তিক বকেয়া খতিয়ান সমূহ</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {companies.map(comp => {
                        const compDue = activeCustomer?.dues?.[comp.id] || 0;
                        const isSelected = selectedCompanyId === comp.id;
                        return (
                          <button
                            key={comp.id}
                            onClick={() => setSelectedCompanyId(comp.id)}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex justify-between items-center ${
                              isSelected 
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                                : 'bg-slate-50 hover:bg-slate-100 border-slate-100 text-slate-800'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className={`font-bold text-xs truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>{comp.name}</p>
                              <span className={`text-[9px] ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>কোড: {comp.code}</span>
                            </div>
                            <span className={`text-xs font-black shrink-0 ml-2 ${isSelected ? 'text-white' : (compDue > 0 ? 'text-amber-600' : 'text-emerald-600')}`}>
                              ৳{compDue.toLocaleString()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Drilldown Ledger Statements */}
                  {selectedCompanyId ? (
                    <div className="border-t border-slate-100 pt-5 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h4 className="text-xs font-black text-gray-950 uppercase flex items-center">
                            <FileText className="w-4 h-4 mr-1.5 text-blue-600" />
                            <span>লেজার স্টেটমেন্ট: {activeCompany?.name}</span>
                          </h4>
                          <p className="text-[10px] text-gray-400">মেমো ও কালেকশনের ক্রমানুসারি ডেবিট এবং ক্রেডিট বিবরণী</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setPrintType('ledger');
                              setPrintTitle(`লেজার স্টেটমেন্ট: ${activeCustomer?.shopName} (${activeCompany?.name})`);
                              setPrintData({
                                shopName: activeCustomer?.shopName,
                                name: activeCustomer?.name,
                                route: activeCustomer?.route,
                                dues: { [activeCompany?.id || '']: activeCustomer?.dues?.[activeCompany?.id || ''] || 0 },
                                totalDue: activeCustomer?.dues?.[activeCompany?.id || ''] || 0
                              });
                              setShowPrintModal(true);
                            }}
                            className="flex items-center justify-center space-x-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-all shadow-sm"
                          >
                            <Printer className="w-4 h-4" />
                            <span>প্রিন্ট ও শেয়ার প্যানেল (A4/POS/WhatsApp)</span>
                          </button>
                        </div>
                      </div>

                      {/* Advanced Date Filters */}
                      <div className="flex flex-wrap gap-2 items-center bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs font-semibold text-slate-700">
                        <span className="text-[10px] font-black text-slate-500 uppercase mr-1">তারিখ ফিল্টার:</span>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="bg-white p-2 border border-slate-200 rounded-lg font-mono text-xs focus:outline-none"
                        />
                        <span className="text-gray-400 text-[10px]">থেকে</span>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="bg-white p-2 border border-slate-200 rounded-lg font-mono text-xs focus:outline-none"
                        />
                        {(startDate || endDate) && (
                          <button
                            onClick={() => { setStartDate(''); setEndDate(''); }}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                          >
                            ফিল্টার মুছুন
                          </button>
                        )}
                      </div>

                      {loading ? (
                        <div className="text-center py-8">
                          <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
                          <p className="text-xs text-gray-400">রেকর্ড লোড হচ্ছে...</p>
                        </div>
                      ) : filteredLedgerEntries.length === 0 ? (
                        <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-gray-400 italic">
                          এই ফিল্টার বা তারিখের অধীনে কোনো বকেয়া লেজার লেনদেন পাওয়া যায়নি।
                        </div>
                      ) : (
                        <div className="border border-slate-100 rounded-xl overflow-hidden bg-white shadow-sm overflow-x-auto">
                          <table className="w-full text-[11px] text-left border-collapse min-w-[700px]">
                            <thead className="bg-slate-50 text-gray-500 font-bold border-b text-[10px] uppercase">
                              <tr>
                                <th className="p-3">তারিখ</th>
                                <th className="p-3">রেফারেন্স নং</th>
                                <th className="p-3">এরিয়া/রুট</th>
                                <th className="p-3">আউটলেট/অ্যাকাউন্ট</th>
                                <th className="p-3 text-center">টাইপ</th>
                                <th className="p-3 text-right">ডেবিট (৳ ডেবিট)</th>
                                <th className="p-3 text-right">ক্রেডিট (৳ জমা)</th>
                                <th className="p-3 text-right">অবশিষ্ট বকেয়া</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-slate-700">
                              {filteredLedgerEntries.map((entry) => {
                                const isInvoice = entry.type === 'INVOICE';
                                return (
                                  <tr key={entry.id} className="hover:bg-slate-50/50">
                                    <td className="p-3 font-medium text-gray-500 whitespace-nowrap">{entry.date}</td>
                                    <td className="p-3">
                                      {isInvoice ? (
                                        <button
                                          type="button"
                                          onClick={() => handleViewInvoiceDetails(entry)}
                                          className="font-bold font-mono text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer"
                                          title="সেলস মেমোর সম্পূর্ণ হিস্টরি দেখতে ক্লিক করুন"
                                        >
                                          <Eye className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                          <span>{entry.referenceNo}</span>
                                        </button>
                                      ) : (
                                        <span className="font-bold font-mono text-slate-800">{entry.referenceNo}</span>
                                      )}
                                    </td>
                                    <td className="p-3 text-gray-600 font-semibold">{activeCustomer?.route || 'N/A'}</td>
                                    <td className="p-3">
                                      <p className="font-bold text-slate-900">{activeCustomer?.shopName}</p>
                                      <p className="text-[10px] text-gray-400">মালিক: {activeCustomer?.name}</p>
                                    </td>
                                    <td className="p-3 text-center">
                                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                        isInvoice ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                      }`}>
                                        {entry.type}
                                      </span>
                                    </td>
                                    <td className="p-3 text-right font-black text-gray-900">
                                      {isInvoice ? `৳${entry.amount.toLocaleString()}` : '-'}
                                    </td>
                                    <td className="p-3 text-right font-black text-emerald-700">
                                      {!isInvoice ? `৳${entry.amount.toLocaleString()}` : '-'}
                                    </td>
                                    <td className="p-3 text-right font-black text-slate-950 bg-slate-50/40">
                                      ৳{entry.balanceAfter.toLocaleString()}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-xs text-gray-400 italic">
                      * লেজার স্টেটমেন্ট দেখতে উপরে কোম্পানি ব্র্যান্ড ব্লকে ক্লিক করুন।
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* B. STAFF (DSR / MANAGER) TABS AUDIT DESK */}
          {activeTab !== 'customer' && (
            <>
              {!selectedStaffId ? (
                <div className="text-center py-20">
                  <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium text-sm">কোনো কর্মী নির্বাচন করা হয়নি</p>
                  <p className="text-xs text-gray-400 mt-1">বামদিকের ডিরেক্টরি থেকে {activeTab === 'dsr' ? 'ডিএসআর' : 'ম্যানেজার'} নির্বাচন করে খতিয়ান হিসাব চালু করুন।</p>
                </div>
              ) : (
                <>
                  {/* Staff Summary Header & Receive Payment / Adjust Action */}
                  {activeStaff && (
                    <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <h3 className="font-extrabold text-gray-900 text-base leading-tight">{activeStaff.name}</h3>
                        <p className="text-[11px] text-gray-400">পদবী: {activeStaff.role} | মোবাইল: {activeStaff.phone}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            setStaffCreditDate(new Date().toISOString().split('T')[0]);
                            setStaffCreditType('PAYMENT');
                            setShowStaffCreditModal(true);
                          }}
                          className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-xl text-xs transition-all shadow-sm cursor-pointer"
                        >
                          <Coins className="w-4 h-4" />
                          <span>পেমেন্ট রিসিভ ও লেজার সমন্বয়</span>
                        </button>
                        {activeTab === 'dsr' && (
                          <button
                            onClick={() => {
                              setStaffCreditDate(new Date().toISOString().split('T')[0]);
                              setStaffCreditType('SALARY_ADVANCE');
                              setShowStaffCreditModal(true);
                            }}
                            className="flex items-center space-x-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-3 rounded-xl text-xs transition-all shadow-sm cursor-pointer"
                          >
                            <PlusCircle className="w-4 h-4" />
                            <span>অ্যাডভান্স/অগ্রিম পেমেন্ট পোস্টিং</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Staff Current Shortage Position Card */}
                  {activeStaff && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-red-50 border border-red-100 rounded-2xl">
                        <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider block">চলতি বকেয়া ঘাটতি (Outstanding Shortage)</span>
                        <h3 className="text-xl font-black font-mono text-red-900 mt-1">৳{(activeStaff.outstandingShortage || 0).toLocaleString()}</h3>
                        <p className="text-[9px] text-red-600 mt-1 italic">* দৈনিক হিসাব মেলানোর সময় ক্যাশ শর্ট হলে বেতন থেকে অগ্রিম বা শর্ট ব্যালেন্স হিসেবে এখানে ডেবিট পোস্টিং হয়।</p>
                      </div>
                      <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex flex-col justify-between">
                        <div>
                          <span className="text-[10px] text-emerald-600 font-bold uppercase block tracking-wider">আজকের একাউন্ট স্ট্যাটাস</span>
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-lg border border-emerald-200 mt-1 text-[10px]">
                            <CheckCircle className="w-3 h-3" />
                            <span>সক্রিয় (Active Ledger)</span>
                          </span>
                        </div>
                        <p className="text-[9px] text-emerald-600 italic mt-2">স্টাফ থেকে শর্ট বা ক্যাশ বা সমন্বয় এন্ট্রি এখানে পোস্টিং সম্ভব।</p>
                      </div>
                    </div>
                  )}

                  {/* Historical Staff Ledgers Logs */}
                  <div className="pt-4 border-t border-slate-100 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-bold text-gray-950 uppercase">ক্রমানুসারি ঘাটতি ও সমন্বয় খতিয়ান (Ledger Statement)</h4>
                        <p className="text-[10px] text-gray-400">স্টাফ ক্যাশ শর্ট এবং রিসিভড ক্রেডিট লগের বিস্তারিত বিবরণ</p>
                      </div>
                      <button
                        onClick={() => {
                          setPrintType('settlement');
                          setPrintTitle(`স্টাফ খতিয়ান ও ঘাটতি বিবরণী: ${activeStaff?.name} (${activeStaff?.role})`);
                          setPrintData({
                            id: activeStaff?.id,
                            date: new Date().toISOString().split('T')[0],
                            dsrName: activeStaff?.name,
                            route: activeTab === 'dsr' ? 'DSR Route' : 'Manager Desk',
                            totalSales: 0,
                            cashCollected: 0,
                            marketDues: 0,
                            shortageAmount: activeStaff?.outstandingShortage || 0,
                            remarks: 'কর্মী অগ্রিম ও লেজার সমন্বয় রশিদ'
                          });
                          setShowPrintModal(true);
                        }}
                        className="flex items-center justify-center space-x-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>প্রিন্ট ও শেয়ার প্যানেল</span>
                      </button>
                    </div>

                    {/* Staff Date Filters */}
                    <div className="flex flex-wrap gap-2 items-center bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs font-semibold text-slate-700">
                      <span className="text-[10px] font-black text-slate-500 uppercase mr-1">তারিখ ফিল্টার:</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="bg-white p-1.5 border border-slate-200 rounded-lg font-mono text-xs focus:outline-none"
                      />
                      <span className="text-gray-400 text-[10px]">থেকে</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="bg-white p-1.5 border border-slate-200 rounded-lg font-mono text-xs focus:outline-none"
                      />
                      {(startDate || endDate) && (
                        <button
                          onClick={() => { setStartDate(''); setEndDate(''); }}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                        >
                          মুছুন
                        </button>
                      )}
                    </div>

                    {loading ? (
                      <div className="text-center py-8">
                        <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
                        <p className="text-xs text-gray-400">হিসাব লোড হচ্ছে...</p>
                      </div>
                    ) : filteredStaffLedgerEntries.length === 0 ? (
                      <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-gray-400 italic">
                        কর্মচারীর খাতায় এই ফিল্টার বা তারিখের অধীনে কোনো লেনদেন নেই।
                      </div>
                    ) : (
                      <div className="border border-slate-100 rounded-xl overflow-hidden bg-white">
                        <table className="w-full text-[11px] text-left">
                          <thead className="bg-slate-50 text-gray-500 font-bold border-b">
                            <tr>
                              <th className="p-3">পোস্টিং তারিখ</th>
                              <th className="p-3">রেফারেন্স নং</th>
                              <th className="p-3 text-center">টাইপ</th>
                              <th className="p-3 text-right">শর্ট / অগ্রিম (৳ ডেবিট)</th>
                              <th className="p-3 text-right">জমা / ক্রেডিট (৳ ক্রেডিট)</th>
                              <th className="p-3 text-right">অবশিষ্ট ঘাটতি ব্যালেন্স</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 text-slate-700">
                            {filteredStaffLedgerEntries.map((entry) => {
                              const isDebit = entry.type === 'SHORTAGE' || entry.type === 'SALARY_ADVANCE';
                              return (
                                <tr key={entry.id} className="hover:bg-slate-50/50">
                                  <td className="p-3 font-medium text-gray-500">{entry.date}</td>
                                  <td className="p-3 font-bold font-mono text-blue-800">{entry.referenceNo}</td>
                                  <td className="p-3 text-center">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                      isDebit ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                    }`}>
                                      {entry.type}
                                    </span>
                                  </td>
                                  <td className="p-3 text-right font-bold text-gray-900">
                                    {isDebit ? `৳${entry.amount.toLocaleString()}` : '-'}
                                  </td>
                                  <td className="p-3 text-right font-bold text-emerald-700">
                                    {!isDebit ? `৳${entry.amount.toLocaleString()}` : '-'}
                                  </td>
                                  <td className="p-3 text-right font-black text-slate-900 bg-slate-50/40">
                                    ৳{entry.balanceAfter.toLocaleString()}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

        </div>

      </div>

      {/* Invoice Details Modal */}
      {showInvoiceDetailsModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto no-print">
          <div className="bg-white text-slate-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative border border-gray-100 space-y-4">
            <button 
              type="button"
              onClick={() => {
                setSelectedInvoice(null);
                setShowInvoiceDetailsModal(false);
              }} 
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-base font-black text-slate-900 border-b pb-2 flex items-center">
              <FileText className="w-5 h-5 text-blue-600 mr-2" />
              <span>সেলস মেমো বিস্তারিত তথ্য বিবরণী</span>
            </h3>

            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div>
                <p className="text-gray-400">মেমো নম্বর:</p>
                <p className="font-bold font-mono text-slate-800">{selectedInvoice.invoiceNo}</p>
                <p className="text-gray-400 mt-2">বিল তারিখ:</p>
                <p className="font-bold">{selectedInvoice.date}</p>
              </div>
              <div>
                <p className="text-gray-400">আউটলেট / কাস্টমার:</p>
                <p className="font-bold">{selectedInvoice.shopName || 'Spot Client'}</p>
                <p className="text-gray-400 mt-2">রুট / এরিয়া:</p>
                <p className="font-bold text-blue-700">{selectedInvoice.route || 'N/A'}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">পণ্য বিক্রয় বিবরণী:</p>
              <div className="border border-slate-100 rounded-xl overflow-hidden bg-white max-h-[180px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-gray-500 font-bold border-b">
                    <tr>
                      <th className="p-2">প্রোডাক্ট বিবরণ</th>
                      <th className="p-2 text-center">পরিমাণ</th>
                      <th className="p-2 text-right">দর</th>
                      <th className="p-2 text-right">মোট</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-slate-700">
                    {(selectedInvoice.items || []).map((item: any, i: number) => (
                      <tr key={i}>
                        <td className="p-2 font-bold text-slate-800">{item.name}</td>
                        <td className="p-2 text-center">{item.qty} পিস</td>
                        <td className="p-2 text-right">৳{item.price}</td>
                        <td className="p-2 text-right font-bold">৳{item.total?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border-t pt-3 flex flex-wrap justify-between items-center gap-4 text-xs">
              <div className="space-y-1">
                <p className="text-slate-500">সর্বমোট বিল: <strong className="text-slate-900 font-black">৳{selectedInvoice.grandTotal?.toLocaleString()}</strong></p>
                <p className="text-emerald-600 font-bold">আজ জমা: ৳{selectedInvoice.paymentReceived?.toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setPrintType('invoice');
                    setPrintTitle(`সেলস মেমো: ${selectedInvoice.invoiceNo}`);
                    setPrintData(selectedInvoice);
                    setShowPrintModal(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-4 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>প্রিন্ট ও শেয়ার করুন</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedInvoice(null);
                    setShowInvoiceDetailsModal(false);
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-4 py-2 rounded-xl transition-all"
                >
                  বন্ধ করুন
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reusable A4 & POS Print Wrapper Modal Overlay */}
      {showPrintModal && printData && (
        <PrintWrapper
          type={printType}
          title={printTitle}
          data={printData}
          onClose={() => {
            setShowPrintModal(false);
            setPrintData(null);
          }}
        />
      )}
    </div>
  );
}
