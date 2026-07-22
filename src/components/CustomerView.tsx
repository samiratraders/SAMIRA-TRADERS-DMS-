/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Plus, 
  MapPin, 
  Phone, 
  Building2, 
  DollarSign, 
  Filter, 
  X,
  FileText,
  Save,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Trash2,
  Edit,
  FileDown
} from 'lucide-react';
import { 
  collection, 
  getDocs, 
  addDoc, 
  doc, 
  setDoc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Customer, Company } from '../types';

interface CustomerViewProps {
  onSelectCustomerForLedger?: (customerId: string) => void;
  globalFilters?: {
    dateFrom: string;
    dateTo: string;
    branch: string;
    status: string;
  };
}

export default function CustomerView({ onSelectCustomerForLedger, globalFilters }: CustomerViewProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
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
  
  // Filtering states
  const [selectedRoute, setSelectedRoute] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  
  // Available filter options compiled dynamically from customer list
  const [routes, setRoutes] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);

  // Modal open states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // New Customer Form states
  const [newCustName, setNewCustName] = useState('');
  const [newCustShop, setNewCustShop] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustRoute, setNewCustRoute] = useState('');
  const [newCustArea, setNewCustArea] = useState('');
  const [newCustDues, setNewCustDues] = useState<{ [companyId: string]: number }>({});

  // Edit Customer Form states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editCustName, setEditCustName] = useState('');
  const [editCustShop, setEditCustShop] = useState('');
  const [editCustPhone, setEditCustPhone] = useState('');
  const [editCustAddress, setEditCustAddress] = useState('');
  const [editCustRoute, setEditCustRoute] = useState('');
  const [editCustArea, setEditCustArea] = useState('');
  const [editCustDues, setEditCustDues] = useState<{ [companyId: string]: number }>({});

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Fetch companies and customers in parallel
      const [compSnap, custSnap] = await Promise.all([
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'customers'))
      ]);

      const compList: Company[] = [];
      compSnap.forEach(d => compList.push(d.data() as Company));
      setCompanies(compList);

      const custList: Customer[] = [];
      custSnap.forEach(d => {
        const c = d.data() as Customer;
        // Ensure totalDue is synced
        const total = Object.values(c.dues || {}).reduce((s: number, a: unknown) => s + (Number(a) || 0), 0);
        custList.push({ ...c, totalDue: total });
      });
      
      setCustomers(custList);

      // Compile unique routes and areas
      const uniqueRoutes = Array.from(new Set(custList.map(c => c.route).filter(Boolean)));
      const uniqueAreas = Array.from(new Set(custList.map(c => c.area).filter(Boolean)));
      setRoutes(uniqueRoutes);
      setAreas(uniqueAreas);
    } catch (err) {
      console.error('Error loading customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCustomer = async (customerId: string, shopName: string) => {
    const isConfirmed = window.confirm(`Are you sure you want to permanently delete customer outlet "${shopName}"? This action cannot be undone and will delete all their balance metrics.`);
    if (!isConfirmed) return;

    try {
      setLoading(true);
      await deleteDoc(doc(db, 'customers', customerId));
      alert(`Customer outlet "${shopName}" deleted successfully.`);
      loadData();
    } catch (err) {
      console.error('Error deleting customer:', err);
      alert('Failed to delete customer outlet.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAddModal = () => {
    // Reset form
    setNewCustName('');
    setNewCustShop('');
    setNewCustPhone('');
    setNewCustAddress('');
    setNewCustRoute('');
    setNewCustArea('');
    // prefill dues with 0 for all companies
    const initialDues: { [companyId: string]: number } = {};
    companies.forEach(comp => {
      initialDues[comp.id] = 0;
    });
    setNewCustDues(initialDues);
    setIsAddModalOpen(true);
  };

  const handleDueChange = (companyId: string, val: string) => {
    const num = parseFloat(val) || 0;
    setNewCustDues(prev => ({
      ...prev,
      [companyId]: num
    }));
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName || !newCustShop) {
      alert('Please fill out Customer Name and Shop Name.');
      return;
    }

    const isConfirmed = window.confirm(`Are you sure you want to add the new customer "${newCustShop}"?`);
    if (!isConfirmed) return;

    try {
      const custId = 'cust-' + Date.now();
      const totalDue = Object.values(newCustDues).reduce((s: number, a: any) => s + a, 0) as number;

      const customerObj: Customer = {
        id: custId,
        name: newCustName,
        shopName: newCustShop,
        phone: newCustPhone || '01700000000',
        address: newCustAddress || 'Barguna',
        route: newCustRoute || 'Barguna Route',
        area: newCustArea || 'Local Bazar',
        dues: newCustDues,
        totalDue: totalDue,
        createdAt: new Date().toISOString()
      };

      // Save customer to Firestore
      await setDoc(doc(db, 'customers', custId), customerObj);

      // Seed initial ledgers entries for dues
      for (const [compId, amount] of Object.entries(newCustDues)) {
        if ((amount as number) > 0) {
          const compName = companies.find(c => c.id === compId)?.name || 'Company';
          const ledgerId = `ledger-${custId}-${compId}-init`;
          await setDoc(doc(db, 'ledgers', ledgerId), {
            id: ledgerId,
            customerId: custId,
            companyId: compId,
            companyName: compName,
            type: 'INVOICE',
            referenceId: 'init-due',
            referenceNo: 'INIT-DUE',
            date: new Date().toISOString().split('T')[0],
            amount: amount,
            balanceAfter: amount,
            createdAt: new Date().toISOString()
          });
        }
      }

      setIsAddModalOpen(false);
      alert(`Customer "${newCustShop}" added successfully.`);
      loadData();
    } catch (err) {
      console.error('Error creating customer:', err);
      alert('Failed to register customer. Please try again.');
    }
  };

  const handleOpenEditModal = (cust: Customer) => {
    setSelectedCustomer(cust);
    setEditCustName(cust.name);
    setEditCustShop(cust.shopName);
    setEditCustPhone(cust.phone || '');
    setEditCustAddress(cust.address || '');
    setEditCustRoute(cust.route || '');
    setEditCustArea(cust.area || '');
    setEditCustDues(cust.dues || {});
    setIsEditModalOpen(true);
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    if (!editCustName || !editCustShop) {
      alert('Please fill out Customer Name and Shop Name.');
      return;
    }

    const isConfirmed = window.confirm(`Are you sure you want to save changes for "${editCustShop}"?`);
    if (!isConfirmed) return;

    try {
      setLoading(true);
      const totalDue = Object.values(editCustDues).reduce((s: number, a: any) => s + a, 0) as number;

      const updatedCustomer: Customer = {
        ...selectedCustomer,
        name: editCustName,
        shopName: editCustShop,
        phone: editCustPhone,
        address: editCustAddress,
        route: editCustRoute,
        area: editCustArea,
        dues: editCustDues,
        totalDue: totalDue
      };

      await setDoc(doc(db, 'customers', selectedCustomer.id), updatedCustomer);
      setIsEditModalOpen(false);
      alert(`Customer "${editCustShop}" updated successfully.`);
      loadData();
    } catch (err) {
      console.error('Error updating customer:', err);
      alert('Failed to update customer details.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (cust: Customer) => {
    setSelectedCustomer(cust);
    setIsDetailModalOpen(true);
  };

  const handleExportCSV = () => {
    try {
      if (filteredCustomers.length === 0) {
        alert("কোনো কাস্টমার ডেটা পাওয়া যায়নি! (No customer data found to export)");
        return;
      }

      // Define CSV headers
      const headers = ["ID", "Shop Name", "Proprietor Name", "Phone", "Route", "Area", "Address", "Total Due (BDT)", "Created At"];
      
      // Define CSV rows with double quotes for comma/newline-safe parsing
      const csvRows = [
        headers.join(","),
        ...filteredCustomers.map(c => [
          c.id,
          `"${(c.shopName || '').replace(/"/g, '""')}"`,
          `"${(c.name || '').replace(/"/g, '""')}"`,
          `"${(c.phone || '').replace(/"/g, '""')}"`,
          `"${(c.route || '').replace(/"/g, '""')}"`,
          `"${(c.area || '').replace(/"/g, '""')}"`,
          `"${(c.address || '').replace(/"/g, '""')}"`,
          c.totalDue,
          c.createdAt ? new Date(c.createdAt).toISOString().split('T')[0] : ''
        ].join(","))
      ];

      // Create a Blob with UTF-8 BOM so Excel decodes Bengali text and symbols correctly
      const blob = new Blob(["\uFEFF" + csvRows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `samira_traders_customers_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to export customers to CSV:", err);
      alert("CSV এক্সপোর্ট করতে সমস্যা হয়েছে।");
    }
  };

  // Filters search results
  const filteredCustomers = customers.filter(cust => {
    const matchesSearch = 
      cust.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cust.shopName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cust.phone.includes(searchTerm);
    const matchesRoute = selectedRoute ? cust.route === selectedRoute : true;
    const matchesArea = selectedArea ? cust.area === selectedArea : true;
    
    // Global filter matches
    const matchesGlobalDate = (() => {
      if (!globalFilters?.dateFrom && !globalFilters?.dateTo) return true;
      if (!cust.createdAt) return true;
      const createdDate = cust.createdAt.split('T')[0];
      if (globalFilters.dateFrom && createdDate < globalFilters.dateFrom) return false;
      if (globalFilters.dateTo && createdDate > globalFilters.dateTo) return false;
      return true;
    })();

    const matchesGlobalStatus = (() => {
      if (!globalFilters?.status || globalFilters.status === 'All') return true;
      if (globalFilters.status === 'WITH_DUES') return cust.totalDue > 0;
      if (globalFilters.status === 'NO_DUES') return cust.totalDue === 0;
      return true;
    })();

    return matchesSearch && matchesRoute && matchesArea && matchesGlobalDate && matchesGlobalStatus;
  });

  return (
    <div className="space-y-6" id="customers-module">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Customer Directory</h2>
          <p className="text-sm text-gray-500">Manage distribution outlets, routes, and company-wise ledger balances</p>
        </div>
        <div className="flex items-center space-x-3 shrink-0">
          <button
            onClick={handleExportCSV}
            id="btn-export-customers-csv"
            className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer border border-emerald-500"
          >
            <FileDown className="w-4.5 h-4.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleOpenAddModal}
            id="btn-add-customer"
            className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Customer</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search customer by name, shop name, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            id="input-customer-search"
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        
        {/* Route Filter */}
        <div className="flex items-center space-x-2 min-w-[180px]">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={selectedRoute}
            onChange={(e) => setSelectedRoute(e.target.value)}
            id="select-route-filter"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">All Routes</option>
            {routes.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Area Filter */}
        <div className="flex items-center space-x-2 min-w-[180px]">
          <MapPin className="w-4 h-4 text-gray-400" />
          <select
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            id="select-area-filter"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">All Areas</option>
            {areas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Clear Filters */}
        {(selectedRoute || selectedArea || searchTerm) && (
          <button
            onClick={() => {
              setSelectedRoute('');
              setSelectedArea('');
              setSearchTerm('');
            }}
            className="text-xs text-rose-500 hover:text-rose-600 font-semibold cursor-pointer"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-500">Syncing customer registry...</p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No customers found</p>
          <p className="text-xs text-gray-400 mt-1">Try resetting filters or registering a new customer outlet.</p>
        </div>
      ) : (
        /* Customer Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="customers-list-grid">
          {filteredCustomers.map((cust) => (
            <div 
              key={cust.id} 
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow flex flex-col justify-between"
              id={`customer-card-${cust.id}`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-gray-900 leading-snug text-base">{cust.shopName}</h3>
                  <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${
                    cust.totalDue > 0 ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  }`}>
                    {cust.totalDue > 0 ? `৳${cust.totalDue} Due` : 'Paid'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 font-medium mb-4">Proprietor: {cust.name}</p>

                <div className="space-y-2 mb-6">
                  <div className="flex items-center text-xs text-gray-600">
                    <Phone className="w-3.5 h-3.5 mr-2 text-gray-400" />
                    <span>{cust.phone}</span>
                  </div>
                  <div className="flex items-center text-xs text-gray-600">
                    <MapPin className="w-3.5 h-3.5 mr-2 text-gray-400" />
                    <span className="truncate">{cust.route} • {cust.area}</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-50 flex items-center justify-between gap-3">
                <button
                  onClick={() => handleViewDetails(cust)}
                  className="flex-1 bg-slate-50 hover:bg-slate-100 text-gray-700 border border-slate-200 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer text-center"
                >
                  Company Balances
                </button>
                {onSelectCustomerForLedger && (
                  <button
                    onClick={() => onSelectCustomerForLedger(cust.id)}
                    className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer text-center"
                  >
                    View Ledger
                  </button>
                )}
                <button
                  onClick={() => handleOpenEditModal(cust)}
                  className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-blue-600 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                  title="Edit Customer Profile"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteCustomer(cust.id, cust.shopName)}
                  className="p-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                  title="Delete Customer Profile"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: View Company Wise Balances Details */}
      {isDetailModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative">
            <button
              onClick={() => setIsDetailModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
            
            <div className="mb-5">
              <Building2 className="w-8 h-8 text-blue-600 mb-2" />
              <h3 className="text-lg font-bold text-gray-950">{selectedCustomer.shopName}</h3>
              <p className="text-xs text-gray-400">Route: {selectedCustomer.route} | Area: {selectedCustomer.area}</p>
            </div>

            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Company Wise Ledgers</h4>
            <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden mb-6">
              {companies.map(comp => {
                const due = selectedCustomer.dues[comp.id] || 0;
                return (
                  <div key={comp.id} className="flex items-center justify-between px-4 py-3 bg-slate-50/55">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{comp.name}</p>
                      <p className="text-[10px] text-gray-400">Code: {comp.code}</p>
                    </div>
                    <span className={`text-sm font-extrabold ${due > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      ৳{due.toLocaleString()}
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between px-4 py-3 bg-blue-50/70 border-t border-blue-100">
                <span className="text-sm font-bold text-blue-900">Total Dues</span>
                <span className="text-base font-black text-blue-950">৳{selectedCustomer.totalDue.toLocaleString()}</span>
              </div>
            </div>

            <button
              onClick={() => setIsDetailModalOpen(false)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
            >
              Close Balance Details
            </button>
          </div>
        </div>
      )}

      {/* Modal: Add New Customer */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-1">Add Customer Outlet</h3>
            <p className="text-xs text-gray-500 mb-5">Register a retail outlet and define standard outstanding balances per company</p>

            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Proprietor Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Haji Rahim"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Shop/Outlet Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahim Store"
                    value={newCustShop}
                    onChange={(e) => setNewCustShop(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Contact Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. 01712345678"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Route Designation</label>
                  <input
                    type="text"
                    placeholder="e.g. Barguna Sadar Route"
                    value={newCustRoute}
                    onChange={(e) => setNewCustRoute(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Area Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Town Hall Bazar"
                    value={newCustArea}
                    onChange={(e) => setNewCustArea(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Address Detail</label>
                  <input
                    type="text"
                    placeholder="e.g. Sadar Road, Barguna"
                    value={newCustAddress}
                    onChange={(e) => setNewCustAddress(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-bold text-slate-800 mb-3 flex items-center">
                  <Building2 className="w-4 h-4 mr-1 text-slate-500" />
                  <span>Configure Initial Outstanding Balance (Company Wise)</span>
                </p>
                <div className="space-y-3 max-h-[160px] overflow-y-auto pr-1">
                  {companies.map(comp => (
                    <div key={comp.id} className="flex items-center justify-between gap-4 p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-xs font-semibold text-gray-700">{comp.name} ({comp.code})</span>
                      <div className="relative max-w-[140px]">
                        <span className="absolute left-2.5 top-2 text-xs text-gray-400 font-bold">৳</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={newCustDues[comp.id] || ''}
                          onChange={(e) => handleDueChange(comp.id, e.target.value)}
                          className="w-full pl-6 pr-2 py-1 bg-white border border-slate-200 rounded text-xs text-right font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-gray-600 px-4 py-2.5 rounded-lg text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Outlet Profile</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Customer Profile */}
      {isEditModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsEditModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-1">Edit Customer Outlet Profile</h3>
            <p className="text-xs text-gray-500 mb-5">Update outlet details, route, or company-wise ledger balances</p>

            <form onSubmit={handleUpdateCustomer} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Proprietor Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Haji Rahim"
                    value={editCustName}
                    onChange={(e) => setEditCustName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Shop/Outlet Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahim Store"
                    value={editCustShop}
                    onChange={(e) => setEditCustShop(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Contact Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. 01712345678"
                    value={editCustPhone}
                    onChange={(e) => setEditCustPhone(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Route Designation</label>
                  <input
                    type="text"
                    placeholder="e.g. Barguna Sadar Route"
                    value={editCustRoute}
                    onChange={(e) => setEditCustRoute(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Area Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Town Hall Bazar"
                    value={editCustArea}
                    onChange={(e) => setEditCustArea(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Address Detail</label>
                  <input
                    type="text"
                    placeholder="e.g. Sadar Road, Barguna"
                    value={editCustAddress}
                    onChange={(e) => setEditCustAddress(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-bold text-slate-800 mb-3 flex items-center">
                  <Building2 className="w-4 h-4 mr-1 text-slate-500" />
                  <span>Outstanding Balances (Company Wise)</span>
                </p>
                <div className="space-y-3 max-h-[160px] overflow-y-auto pr-1">
                  {companies.map(comp => (
                    <div key={comp.id} className="flex items-center justify-between gap-4 p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-xs font-semibold text-gray-700">{comp.name} ({comp.code})</span>
                      <div className="relative max-w-[140px]">
                        <span className="absolute left-2.5 top-2 text-xs text-gray-400 font-bold">৳</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={editCustDues[comp.id] || ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setEditCustDues(prev => ({ ...prev, [comp.id]: val }));
                          }}
                          className="w-full pl-6 pr-2 py-1 bg-white border border-slate-200 rounded text-xs text-right font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-gray-600 px-4 py-2.5 rounded-lg text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
