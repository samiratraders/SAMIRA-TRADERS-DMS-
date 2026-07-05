/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, 
  Search, 
  Trash2, 
  Filter, 
  User, 
  Clock, 
  Database, 
  X, 
  Eye, 
  Activity, 
  AlertCircle,
  FileSpreadsheet,
  DollarSign,
  Settings,
  RefreshCw,
  Terminal
} from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot, getDocs, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ActivityLog, UserRole } from '../types';

export default function ActivityLogView() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActionType, setSelectedActionType] = useState<string>('ALL');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  
  // Detail Modal
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  // Clear Logs verification
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Real-time listener for activity_logs
  useEffect(() => {
    setLoading(true);
    const logsRef = collection(db, 'activity_logs');
    // Order logs by creation date descending, limit to 200 for client-side fluid speed
    const q = query(logsRef, orderBy('createdAt', 'desc'), limit(200));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsList: ActivityLog[] = [];
      snapshot.forEach((docSnap) => {
        logsList.push(docSnap.data() as ActivityLog);
      });
      setLogs(logsList);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching live activity logs:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Filter handlers
  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.userName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesAction = selectedActionType === 'ALL' ? true : log.actionType === selectedActionType;
    const matchesRole = selectedRole === 'ALL' ? true : log.userRole === selectedRole;

    return matchesSearch && matchesAction && matchesRole;
  });

  // KPI calculations
  const invoiceCount = logs.filter(l => l.actionType === 'INVOICE_CREATE').length;
  const paymentCount = logs.filter(l => l.actionType === 'PAYMENT_ENTRY').length;
  const settingsCount = logs.filter(l => l.actionType === 'SETTINGS_UPDATE').length;

  // Clear all logs handler
  const handleClearLogs = async () => {
    try {
      setIsClearing(true);
      const querySnapshot = await getDocs(collection(db, 'activity_logs'));
      const batch = writeBatch(db);
      
      querySnapshot.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      
      await batch.commit();
      setIsClearConfirmOpen(false);
    } catch (err) {
      console.error('Failed to clear activity logs:', err);
      alert('Failed to purge log records. Try again.');
    } finally {
      setIsClearing(false);
    }
  };

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case UserRole.SUPER_ADMIN:
        return 'bg-rose-50 text-rose-700 border-rose-100';
      case UserRole.MANAGER:
        return 'bg-blue-50 text-blue-700 border-blue-100';
      case UserRole.SALES_MANAGER:
        return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      case UserRole.DSR:
        return 'bg-amber-50 text-amber-700 border-amber-100';
      case UserRole.COLLECTION_OFFICER:
        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case UserRole.ACCOUNTANT:
        return 'bg-purple-50 text-purple-700 border-purple-100';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  const getActionTypeIcon = (type: string) => {
    switch (type) {
      case 'INVOICE_CREATE':
        return <FileSpreadsheet className="w-4 h-4 text-blue-500" />;
      case 'PAYMENT_ENTRY':
        return <DollarSign className="w-4 h-4 text-emerald-500" />;
      case 'SETTINGS_UPDATE':
        return <Settings className="w-4 h-4 text-rose-500" />;
      default:
        return <ClipboardList className="w-4 h-4 text-gray-500" />;
    }
  };

  const getActionTypeBadge = (type: string) => {
    switch (type) {
      case 'INVOICE_CREATE':
        return 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'PAYMENT_ENTRY':
        return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
      case 'SETTINGS_UPDATE':
        return 'bg-rose-100 text-rose-800 border border-rose-200';
      default:
        return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6" id="activity-log-view">
      
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">System Activity Audit Trail</h2>
            <div className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 text-[10px] font-black tracking-wider animate-pulse">
              <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block mr-1"></span>
              <span>LIVE FEED</span>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-1">Real-time terminal ledger recording invoicing, customer ledger collections, and backend system settings updates.</p>
        </div>
        
        <button
          onClick={() => setIsClearConfirmOpen(true)}
          id="btn-purge-logs"
          className="flex items-center justify-center space-x-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer hover:shadow-sm"
        >
          <Trash2 className="w-4 h-4" />
          <span>Purge Audit Records</span>
        </button>
      </div>

      {/* KPI Stats Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Total Logged Items</span>
            <p className="text-2xl font-extrabold text-slate-800">{logs.length}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Invoice Operations</span>
            <p className="text-2xl font-extrabold text-slate-800">{invoiceCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Payments Received</span>
            <p className="text-2xl font-extrabold text-slate-800">{paymentCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Staff / System Changes</span>
            <p className="text-2xl font-extrabold text-slate-800">{settingsCount}</p>
          </div>
        </div>

      </div>

      {/* Filters Shelf */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
        
        {/* Search */}
        <div className="relative md:col-span-2">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search logs by action details, description, user name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 pl-10 pr-4 py-2 rounded-xl text-xs focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 font-medium"
          />
        </div>

        {/* Action Type Filter */}
        <div>
          <select
            value={selectedActionType}
            onChange={(e) => setSelectedActionType(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 text-slate-800 py-2 px-3 rounded-xl text-xs focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 font-medium"
          >
            <option value="ALL">All Action Types</option>
            <option value="INVOICE_CREATE">Invoices Created</option>
            <option value="PAYMENT_ENTRY">Payments/Collections</option>
            <option value="SETTINGS_UPDATE">System Controls & Users</option>
          </select>
        </div>

        {/* User Role Filter */}
        <div>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 text-slate-800 py-2 px-3 rounded-xl text-xs focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 font-medium"
          >
            <option value="ALL">All Staff Roles</option>
            <option value="Super Admin">Super Admin Only</option>
            <option value="Manager">Manager Only</option>
            <option value="Sales Manager">Sales Manager Only</option>
            <option value="DSR">DSR Only</option>
            <option value="Collection Officer">Collection Officer Only</option>
            <option value="Accountant">Accountant Only</option>
          </select>
        </div>

      </div>

      {/* Main Logs Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        
        {loading ? (
          <div className="text-center py-20">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-500">Connecting to terminal audit ledger...</p>
            <p className="text-xs text-gray-400 mt-1">Please wait while the security tunnel is established.</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto border">
              <Activity className="w-6 h-6 text-slate-300" />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">No activity records match filters</h4>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">Try clearing your filters or typing a different search query to inspect other staff actions.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-gray-500 font-bold border-b border-gray-100">
                  <th className="px-5 py-4">Timestamp</th>
                  <th className="px-5 py-4">Operator Info</th>
                  <th className="px-5 py-4">Action Type</th>
                  <th className="px-5 py-4">Details Summary</th>
                  <th className="px-5 py-4 text-center">Diagnostics</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/40 transition-colors">
                    
                    {/* Timestamp */}
                    <td className="px-5 py-4 whitespace-nowrap text-gray-500 font-mono text-[11px] leading-tight">
                      <div className="flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span>{formatTimestamp(log.createdAt)}</span>
                      </div>
                    </td>

                    {/* Operator Name & Role */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-7 h-7 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-[10px] border border-blue-200">
                          {log.userName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{log.userName}</p>
                          <span className={`inline-block text-[9px] font-bold px-1.5 py-0.2 rounded border mt-0.5 ${getRoleBadgeColor(log.userRole)}`}>
                            {log.userRole}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Action Type */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-1.5">
                        {getActionTypeIcon(log.actionType)}
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full tracking-wider ${getActionTypeBadge(log.actionType)}`}>
                          {log.actionType}
                        </span>
                      </div>
                    </td>

                    {/* Description text */}
                    <td className="px-5 py-4">
                      <p className="text-gray-800 font-medium line-clamp-2 max-w-xl leading-relaxed text-xs">
                        {log.description}
                      </p>
                    </td>

                    {/* Inspect button */}
                    <td className="px-5 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => {
                          setSelectedLog(log);
                          setIsDetailOpen(true);
                        }}
                        className="inline-flex items-center justify-center p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="View raw telemetry"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Footer info banner */}
        <div className="bg-slate-50 px-5 py-3.5 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500 font-mono">
          <div className="flex items-center space-x-1 text-gray-400">
            <Terminal className="w-3.5 h-3.5 shrink-0" />
            <span>Audit-trail pipeline sync: Secure SSL websocket tunnel</span>
          </div>
          <span>Showing {filteredLogs.length} / {logs.length} logged entries</span>
        </div>

      </div>

      {/* Details View Modal */}
      {isDetailOpen && selectedLog && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 text-slate-100 max-w-2xl w-full rounded-2xl shadow-2xl border border-slate-800 overflow-hidden animate-scale-up">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center space-x-2">
                <Terminal className="w-5 h-5 text-blue-400" />
                <span className="font-extrabold text-sm font-mono tracking-wider">SECURE TELEMETRY INSPECTOR</span>
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto">
              
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <p className="text-[10px] text-slate-400 font-bold uppercase font-mono tracking-wider mb-0.5">Operator ID</p>
                  <p className="font-mono text-slate-200">{selectedLog.userId}</p>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <p className="text-[10px] text-slate-400 font-bold uppercase font-mono tracking-wider mb-0.5">Log Record ID</p>
                  <p className="font-mono text-slate-200">{selectedLog.id}</p>
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <p className="text-[10px] text-slate-400 font-bold uppercase font-mono tracking-wider">Log Text Description</p>
                <p className="text-sm font-semibold text-white leading-relaxed">{selectedLog.description}</p>
              </div>

              {selectedLog.details && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-slate-400 font-bold uppercase font-mono tracking-wider">Structured JSON Payload</p>
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-blue-300 overflow-x-auto">
                    <pre className="whitespace-pre-wrap">{JSON.stringify(selectedLog.details, null, 2)}</pre>
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setIsDetailOpen(false)}
                className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                Close Inspector
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Clear Logs Confirm Modal */}
      {isClearConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-6 border space-y-4">
            
            <div className="flex items-start space-x-3 text-rose-600">
              <AlertCircle className="w-10 h-10 shrink-0" />
              <div>
                <h3 className="font-bold text-gray-900 text-base">Purge Audit Log Trail?</h3>
                <p className="text-xs text-gray-500 mt-1">This operation is irreversible. All security logs and user activity events will be permanently deleted from the database storage.</p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setIsClearConfirmOpen(false)}
                disabled={isClearing}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleClearLogs}
                disabled={isClearing}
                className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 cursor-pointer"
              >
                {isClearing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Purging...</span>
                  </>
                ) : (
                  <span>Confirm Delete</span>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
