/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  Tag, 
  DollarSign, 
  Calendar, 
  Save, 
  X, 
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Briefcase,
  Home,
  User,
  ShieldAlert
} from 'lucide-react';
import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Expense } from '../types';

export default function ExpenseView() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New Expense Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'ROUTE' | 'SALARY' | 'OTHER' | 'DSR' | 'MANAGER' | 'OFFICE' | 'ADMIN'>('DSR');
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [routeName, setRouteName] = useState('');
  const [staffName, setStaffName] = useState('');

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'expenses'));
      const list: Expense[] = [];
      snap.forEach(d => list.push(d.data() as Expense));
      
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setExpenses(list);
    } catch (err) {
      console.error('Error loading expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, []);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || amount <= 0) {
      alert('Please enter a Title and a positive Amount!');
      return;
    }

    try {
      const id = 'exp-' + Date.now();
      const expenseObj: Expense = {
        id,
        title,
        category,
        amount,
        description: description || 'N/A',
        date: expenseDate,
        routeName: (category === 'ROUTE' || category === 'DSR') ? routeName : '',
        staffName: (category === 'SALARY' || category === 'MANAGER') ? staffName : '',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'expenses', id), expenseObj);
      setIsAddModalOpen(false);
      
      // Reset
      setTitle('');
      setCategory('DSR');
      setAmount(0);
      setDescription('');
      setRouteName('');
      setStaffName('');

      loadExpenses();
    } catch (err) {
      console.error('Error creating expense:', err);
    }
  };

  const filtered = expenses.filter(e =>
    e.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Consolidated expense calculation by category
  const getConsolidatedTotals = () => {
    const totals = {
      DSR: 0,
      MANAGER: 0,
      OFFICE: 0,
      ADMIN: 0,
      ROUTE: 0,
      SALARY: 0,
      OTHER: 0
    };
    expenses.forEach(e => {
      if (totals[e.category] !== undefined) {
        totals[e.category] += e.amount;
      } else {
        totals[e.category] = e.amount;
      }
    });
    return totals;
  };

  const consolidated = getConsolidatedTotals();
  const totalSum = Object.values(consolidated).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6" id="expenses-module">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Consolidated Expense Ledger</h2>
          <p className="text-sm text-gray-500">Track and route all distribution, helper, manager, office, and administrative expenses in one ledger</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          id="btn-add-expense"
          className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Record Consolidated Expense</span>
        </button>
      </div>

      {/* Central Consolidated Expense Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5" id="expense-dashboard-panel">
        
        {/* Total Unified Expenses */}
        <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow-xl flex flex-col justify-between">
          <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest block">Unified Expense Flow</span>
          <div className="my-3">
            <h3 className="text-3xl font-black font-mono">৳{totalSum.toLocaleString()}</h3>
            <p className="text-[10px] text-slate-400 mt-1">Sum of DSR, Manager, Office & Admin pipelines</p>
          </div>
          <div className="flex items-center space-x-1.5 text-xs text-rose-400 font-bold bg-rose-950/40 p-2 rounded-xl border border-rose-900/30">
            <TrendingDown className="w-4 h-4 shrink-0" />
            <span>Debit ledger active</span>
          </div>
        </div>

        {/* DSR & Field Expenses */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">DSR & Route (মাঠ খরচ)</span>
              <h4 className="text-xl font-extrabold mt-1 text-slate-900 font-mono">৳{(consolidated.DSR + consolidated.ROUTE).toLocaleString()}</h4>
            </div>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <User className="w-4 h-4" />
            </div>
          </div>
          <p className="text-[10px] text-gray-400 mt-4">Fuel, allowances & delivery costs</p>
        </div>

        {/* Manager & Staff Salaries */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">Manager & Staff (বেতন)</span>
              <h4 className="text-xl font-extrabold mt-1 text-slate-900 font-mono">৳{(consolidated.MANAGER + consolidated.SALARY).toLocaleString()}</h4>
            </div>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <p className="text-[10px] text-gray-400 mt-4">Field rep salaries & helper allowances</p>
        </div>

        {/* Office & Admin Overheads */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">Office & Admin (অফিস খরচ)</span>
              <h4 className="text-xl font-extrabold mt-1 text-slate-900 font-mono">৳{(consolidated.OFFICE + consolidated.ADMIN + consolidated.OTHER).toLocaleString()}</h4>
            </div>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Home className="w-4 h-4" />
            </div>
          </div>
          <p className="text-[10px] text-gray-400 mt-4">Utilities, internet & rent expenses</p>
        </div>

      </div>

      {/* Filter and Table List */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="relative">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search expenses by title or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            id="input-expense-search"
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-500">Loading consolidated ledger...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No consolidated expense records found</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" id="expenses-table-container">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-gray-100">
                  <th className="px-6 py-4">Expense Title</th>
                  <th className="px-6 py-4">Financial Category Source</th>
                  <th className="px-6 py-4">Allocation & Notes</th>
                  <th className="px-6 py-4 text-right">Debit amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filtered.map(exp => (
                  <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-950">{exp.title}</p>
                      <p className="text-[10px] text-gray-400">{exp.date}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2.5 py-1 rounded text-[10px] font-bold ${
                        ['DSR', 'ROUTE'].includes(exp.category) ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                        ['MANAGER', 'SALARY'].includes(exp.category) ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                        'bg-amber-50 text-amber-700 border border-amber-100'
                      }`}>
                        {exp.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-gray-600 truncate max-w-[280px]">{exp.description}</p>
                      {(exp.routeName || exp.category === 'ROUTE' || exp.category === 'DSR') && (
                        <p className="text-[10px] text-gray-400 font-semibold mt-0.5">Route: {exp.routeName || 'All Routes'}</p>
                      )}
                      {(exp.staffName || exp.category === 'SALARY' || exp.category === 'MANAGER') && (
                        <p className="text-[10px] text-gray-400 font-semibold mt-0.5">Staff/Manager: {exp.staffName || 'General Staff'}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-extrabold text-rose-600 font-mono">৳{exp.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative border border-gray-100">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center">
              <ShieldAlert className="w-5 h-5 text-rose-500 mr-2" />
              <span>Record Ledger Expense</span>
            </h3>
            
            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Expense Title / Ledger Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DSR Food Allowance"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Expense Source Pipeline *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="DSR">DSR Field Source</option>
                    <option value="MANAGER">Manager Operation Source</option>
                    <option value="OFFICE">Office Utility Source</option>
                    <option value="ADMIN">Administrative Source</option>
                    <option value="ROUTE">Route Delivery Source</option>
                    <option value="SALARY">General Staff Salary</option>
                    <option value="OTHER">Other Misc Source</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Date Logged</label>
                  <input
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              {['ROUTE', 'DSR'].includes(category) && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">DSR / Route Name (Destination)</label>
                  <input
                    type="text"
                    placeholder="e.g. Amtali Route / DSR Kamal"
                    value={routeName}
                    onChange={(e) => setRouteName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              )}

              {['SALARY', 'MANAGER'].includes(category) && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Staff / Manager Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Rahim (Staff Manager)"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Debit Amount (৳ Cash) *</label>
                  <input
                    type="number"
                    required
                    placeholder="0"
                    value={amount || ''}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-black font-mono text-rose-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Detailed Notes</label>
                <textarea
                  placeholder="e.g. Internet bill receipt No #2343"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="bg-slate-100 text-gray-600 px-4 py-2.5 rounded-lg text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Log Expense</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
