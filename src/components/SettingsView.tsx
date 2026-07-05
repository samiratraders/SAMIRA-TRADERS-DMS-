/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Shield, Plus, Key, Users, RefreshCw, Save, X, Eye, EyeOff, UploadCloud, FileJson, CheckCircle2, AlertCircle, Database, FileText, Download } from 'lucide-react';
import { collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { logActivity } from '../lib/activityLogger';

interface SettingsViewProps {
  currentUser: UserProfile | null;
}

const ROLES = [
  'Super Admin',
  'Manager',
  'Sales Manager',
  'DSR',
  'Collection Officer',
  'Accountant'
];

export default function SettingsView({ currentUser }: SettingsViewProps) {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('DSR');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Bulk Import and Data states
  const [importCollection, setImportCollection] = useState<'customers' | 'products' | 'companies' | 'suppliers'>('customers');
  const [importFileContent, setImportFileContent] = useState<string>('');
  const [importFileName, setImportFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [parsedRecords, setParsedRecords] = useState<any[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    setImportFileName(file.name);
    setValidationError(null);
    setImportSuccessMsg(null);
    setParsedRecords([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setImportFileContent(text);
      validateAndParse(text, file.name.endsWith('.csv') ? 'csv' : 'json');
    };
    reader.readAsText(file);
  };

  const validateAndParse = (text: string, format: 'json' | 'csv') => {
    try {
      let data: any[] = [];
      if (format === 'json') {
        const parsed = JSON.parse(text);
        data = Array.isArray(parsed) ? parsed : [parsed];
      } else {
        // Simple CSV parser
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          setValidationError('CSV must contain a header row and at least one data row.');
          return;
        }
        const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
          const obj: any = {};
          headers.forEach((h, idx) => {
            if (h) obj[h] = values[idx] || '';
          });
          data.push(obj);
        }
      }

      if (data.length === 0) {
        setValidationError('No records found in the file.');
        return;
      }

      const validated = data.map((item, idx) => {
        const errors: string[] = [];
        if (importCollection === 'companies') {
          if (!item.name) errors.push('Missing company "name"');
          if (!item.code) errors.push('Missing company "code"');
        } else if (importCollection === 'suppliers') {
          if (!item.name) errors.push('Missing supplier "name"');
          if (!item.companyId && !item.companyName) errors.push('Missing "companyId" or "companyName"');
        } else if (importCollection === 'customers') {
          if (!item.shopName) errors.push('Missing "shopName"');
          if (!item.name) errors.push('Missing proprietor "name"');
          if (!item.route) errors.push('Missing "route"');
        } else if (importCollection === 'products') {
          if (!item.name) errors.push('Missing product "name"');
          if (!item.companyId && !item.companyName) errors.push('Missing "companyId" or "companyName"');
          if (isNaN(Number(item.purchasePrice))) errors.push('Invalid "purchasePrice"');
          if (isNaN(Number(item.retailPrice))) errors.push('Invalid "retailPrice"');
        }
        return { ...item, _rowNum: idx + 1, _errors: errors };
      });

      setParsedRecords(validated);
      const firstError = validated.find(v => v._errors.length > 0);
      if (firstError) {
        setValidationError(`Validation failed on row ${firstError._rowNum}: ${firstError._errors.join(', ')}`);
      }
    } catch (err: any) {
      setValidationError(`Error parsing file: ${err.message}`);
    }
  };

  const handleConfirmImport = async () => {
    if (parsedRecords.length === 0 || validationError) return;

    try {
      setIsImporting(true);
      let count = 0;

      for (let i = 0; i < parsedRecords.length; i++) {
        const record = { ...parsedRecords[i] };
        // Remove validation properties
        delete record._rowNum;
        delete record._errors;

        let prefix = 'id-';
        if (importCollection === 'companies') prefix = 'comp-';
        else if (importCollection === 'suppliers') prefix = 'sup-';
        else if (importCollection === 'customers') prefix = 'cust-';
        else if (importCollection === 'products') prefix = 'prod-';

        const docId = record.id || `${prefix}${Date.now()}-${i}`;
        
        if (importCollection === 'products') {
          record.purchasePrice = Number(record.purchasePrice) || 0;
          record.retailPrice = Number(record.retailPrice) || 0;
          record.cartonSize = Number(record.cartonSize) || 12;
          record.cartonPrice = record.purchasePrice * record.cartonSize;
          record.stockCount = Number(record.stockCount) || 0;
          record.subDepotStocks = record.subDepotStocks || {};
        } else if (importCollection === 'customers') {
          record.dues = record.dues || {};
          record.totalDue = Object.values(record.dues).reduce((s: number, a: any) => s + (Number(a) || 0), 0);
        }

        record.id = docId;
        record.createdAt = record.createdAt || new Date().toISOString();

        await setDoc(doc(db, importCollection, docId), record);
        count++;
      }

      setImportSuccessMsg(`Successfully imported ${count} records into "${importCollection}" registry!`);
      if (currentUser) {
        await logActivity(
          currentUser.id,
          currentUser.name,
          currentUser.role,
          'SETTINGS_UPDATE',
          `Bulk imported ${count} items into "${importCollection}" collection.`,
          { collection: importCollection, count }
        );
      }
      setParsedRecords([]);
      setImportFileName('');
      setImportFileContent('');
    } catch (err: any) {
      console.error('Error importing records:', err);
      setValidationError(`Import failed: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const loadProfiles = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'users'));
      const list: UserProfile[] = [];
      snap.forEach(d => list.push(d.data() as UserProfile));
      setProfiles(list);
    } catch (err) {
      console.error('Error loading profiles:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const handleRegisterUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !username || !password) {
      alert('Please fill out Name, Username, and Password!');
      return;
    }

    try {
      setLoading(true);
      const normalizedEmail = email || `${username.toLowerCase()}@samira.com`;
      const uid = 'user-' + Date.now();

      // Save user profile to Firestore
      const newProfile: UserProfile = {
        id: uid,
        name,
        email: normalizedEmail,
        username: username.toLowerCase().trim(),
        role: role as any,
        password: password, // For easy offline testing, storing clear is requested for mock/admin setup
        phone: phone || '',
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', uid), newProfile);

      // Record activity log
      if (currentUser) {
        await logActivity(
          currentUser.id,
          currentUser.name,
          currentUser.role,
          'SETTINGS_UPDATE',
          `Registered new distribution team member: ${newProfile.name} as ${newProfile.role} (username: ${newProfile.username})`,
          { targetUserId: uid, targetName: newProfile.name, targetRole: newProfile.role }
        );
      }

      setIsAddModalOpen(false);

      // Reset
      setName('');
      setEmail('');
      setUsername('');
      setPassword('');
      setRole('DSR');
      setPhone('');

      loadProfiles();
    } catch (err) {
      console.error('Error registering user:', err);
      alert('Failed to register user document.');
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = currentUser?.role === 'Super Admin' || currentUser?.role === 'Manager';

  return (
    <div className="space-y-6" id="settings-module">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">System Controls & Users</h2>
          <p className="text-sm text-gray-500">Configure role-based access control permissions and manage distribution team credentials</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            id="btn-register-user"
            className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create New User</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Active Profile Info */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
          <h3 className="font-bold text-gray-900 text-sm tracking-tight flex items-center border-b border-slate-50 pb-3">
            <Shield className="w-4.5 h-4.5 mr-2 text-blue-600" />
            <span>Logged Profile Details</span>
          </h3>

          {currentUser ? (
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[10px] text-gray-400 font-bold uppercase block">Employee Name</span>
                <p className="text-sm font-extrabold text-slate-800">{currentUser.name}</p>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-bold uppercase block">Designated Role</span>
                <p className="text-sm font-extrabold text-blue-700">{currentUser.role}</p>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-bold uppercase block">Secure Username</span>
                <p className="font-mono text-gray-600">@{currentUser.username}</p>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-bold uppercase block">Assigned Email</span>
                <p className="text-gray-600">{currentUser.email}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No active session profile found.</p>
          )}
        </div>

        {/* User Accounts list (Manager Only) */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm lg:col-span-2 space-y-4">
          <h3 className="font-bold text-gray-900 text-sm tracking-tight flex items-center border-b border-slate-50 pb-3">
            <Users className="w-4.5 h-4.5 mr-2 text-blue-600" />
            <span>System Users Directory</span>
          </h3>

          {loading ? (
            <div className="text-center py-6">
              <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
              <p className="text-xs text-gray-400">Syncing active system logins...</p>
            </div>
          ) : profiles.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-6 text-center">No system user profiles found in db.</p>
          ) : (
            <div className="border border-slate-100 rounded-xl overflow-hidden bg-white">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-gray-500 font-bold">
                  <tr>
                    <th className="p-3">Team Member Name</th>
                    <th className="p-3">Username</th>
                    <th className="p-3 text-center">Assigned Role</th>
                    {isAdmin && <th className="p-3 text-right">Plain Password (Admin Audit)</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {profiles.map(profile => (
                    <tr key={profile.id} className="hover:bg-slate-50/50">
                      <td className="p-3">
                        <p className="font-semibold text-gray-950">{profile.name}</p>
                        <p className="text-[10px] text-gray-400">{profile.phone || 'No Phone'}</p>
                      </td>
                      <td className="p-3 font-mono text-gray-600">@{profile.username}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          profile.role === 'Super Admin' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                          profile.role === 'Manager' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                        }`}>
                          {profile.role}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="p-3 text-right font-mono text-gray-500">
                          {profile.password || '••••••••'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Bulk Data Import & Backup Center */}
      {isAdmin && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-8 mt-6" id="bulk-center">
          <div>
            <h3 className="text-lg font-extrabold text-slate-800 flex items-center space-x-2">
              <Database className="w-5 h-5 text-blue-600" />
              <span>Bulk Import & System Backup Center</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">Import spreadsheets, manage registers, export database backups, or clear database records.</p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Import Data Card */}
            <div className="xl:col-span-2 space-y-4 border-r border-slate-100 xl:pr-8">
              <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider">Bulk Import (JSON / CSV Format)</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Target Registry Collection</label>
                  <select
                    value={importCollection}
                    onChange={(e: any) => {
                      setImportCollection(e.target.value);
                      setParsedRecords([]);
                      setValidationError(null);
                      setImportSuccessMsg(null);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="customers">Customers Registry (customers)</option>
                    <option value="products">Products Inventory (products)</option>
                    <option value="companies">Partner Companies (companies)</option>
                    <option value="suppliers">Supplier Reps (suppliers)</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end">
                  <div className="text-[10px] text-slate-400 mb-1 font-bold">Recommended Spreadsheet Headers:</div>
                  <div className="bg-slate-50 border border-slate-100 p-2 rounded-lg text-[10px] font-mono text-slate-600 break-all leading-tight">
                    {importCollection === 'customers' && "shopName,name,phone,address,route,area"}
                    {importCollection === 'products' && "name,companyId,companyName,purchasePrice,retailPrice,packSize,cartonSize,stockCount"}
                    {importCollection === 'companies' && "name,code,contactPerson,phone,address"}
                    {importCollection === 'suppliers' && "name,phone,address,companyId,companyName"}
                  </div>
                </div>
              </div>

              {/* Drag and Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/40'
                    : importFileName
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <input
                  type="file"
                  id="bulk-file-input"
                  accept=".json,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                
                <label htmlFor="bulk-file-input" className="cursor-pointer block space-y-2">
                  <UploadCloud className={`w-10 h-10 mx-auto ${importFileName ? 'text-emerald-500' : 'text-slate-400'}`} />
                  <div>
                    <p className="text-xs font-bold text-slate-700">
                      {importFileName ? `Selected: ${importFileName}` : 'Drag & Drop your JSON/CSV spreadsheet file here'}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">or click to browse your storage files (Supports .json or .csv files)</p>
                  </div>
                </label>
              </div>

              {/* Validation Statuses */}
              {validationError && (
                <div className="bg-rose-50 border border-rose-100 text-rose-700 p-3.5 rounded-xl text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="font-medium leading-tight">{validationError}</p>
                </div>
              )}

              {importSuccessMsg && (
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-3.5 rounded-xl text-xs flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="font-bold leading-tight">{importSuccessMsg}</p>
                </div>
              )}

              {parsedRecords.length > 0 && !validationError && (
                <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 flex items-center space-x-1">
                      <FileText className="w-4 h-4 text-blue-500" />
                      <span>Ready for upload: {parsedRecords.length} records detected</span>
                    </span>
                    <span className="text-emerald-600 font-extrabold flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Validation Passed</span>
                    </span>
                  </div>

                  <div className="flex items-center space-x-3 pt-2">
                    <button
                      onClick={() => {
                        setParsedRecords([]);
                        setImportFileName('');
                        setImportFileContent('');
                      }}
                      className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 cursor-pointer"
                    >
                      Reset Selection
                    </button>
                    <button
                      onClick={handleConfirmImport}
                      disabled={isImporting}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50"
                    >
                      {isImporting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Uploading Registry...</span>
                        </>
                      ) : (
                        <>
                          <Database className="w-3.5 h-3.5" />
                          <span>Confirm Bulk Upload & Save to Database</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Backups and Database Tools */}
            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider mb-3">Backup & Export Records</h4>
                <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl space-y-4">
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Download a secure local copy of all DMS records (Customers, Products, Sales Invoices, Collections, Purchases) as a single JSON file. You can restore this backup at any time.
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        setLoading(true);
                        const collectionsToBackup = ['companies', 'suppliers', 'customers', 'products', 'sales', 'purchases', 'collections', 'expenses', 'subDepots', 'subDepotTransactions'];
                        const backupData: any = {};
                        
                        for (const colName of collectionsToBackup) {
                          const snap = await getDocs(collection(db, colName));
                          const list: any[] = [];
                          snap.forEach(d => list.push(d.data()));
                          backupData[colName] = list;
                        }

                        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `SAMIRA_TRADERS_DMS_BACKUP_${new Date().toISOString().split('T')[0]}.json`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(url);

                        alert('Database backup file generated and downloaded successfully!');
                      } catch (err: any) {
                        console.error('Backup error:', err);
                        alert(`Backup failed: ${err.message}`);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center space-x-2 cursor-pointer shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Complete System Backup</span>
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-black uppercase text-rose-500 tracking-wider mb-3">Irreversible System Purge</h4>
                <div className="bg-rose-50/40 border border-rose-100 p-4 rounded-2xl space-y-4">
                  <p className="text-[11px] text-rose-700/80 leading-relaxed">
                    Clear the current system tables to remove dummy sample records. This operation requires full authentication challenge.
                  </p>
                  <button
                    onClick={async () => {
                      const initialConfirm = window.confirm("WARNING: This will clear temporary entries so you can load real data. Are you absolutely certain you want to purge system tables?");
                      if (!initialConfirm) return;

                      const typedChallenge = window.prompt("To confirm this dangerous operation, type 'PURGE ALL' in the field below:");
                      if (typedChallenge !== 'PURGE ALL') {
                        alert("Passphrase challenge failed. Operation cancelled.");
                        return;
                      }

                      try {
                        setLoading(true);
                        const collectionsToPurge = ['companies', 'suppliers', 'customers', 'products', 'sales', 'purchases', 'collections', 'expenses', 'subDepotTransactions'];
                        let deletedCount = 0;
                        
                        for (const colName of collectionsToPurge) {
                          const snap = await getDocs(collection(db, colName));
                          const batch = writeBatch(db);
                          snap.forEach(docSnap => {
                            batch.delete(docSnap.ref);
                            deletedCount++;
                          });
                          await batch.commit();
                        }

                        alert(`System purged successfully. Deleted ${deletedCount} records across distributions. Ready for fresh imports!`);
                        window.location.reload();
                      } catch (err: any) {
                        console.error('Purge error:', err);
                        alert(`Purge failed: ${err.message}`);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="w-full bg-rose-500 hover:bg-rose-600 text-white py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    <span>Reset System Tables</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Register Distribution Staff</h3>
            <form onSubmit={handleRegisterUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Employee Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rakibul Islam"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Unique Username *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. rakib.dsr"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold lowercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Role Permission *</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Password Credentials *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Set default password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-gray-500"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Contact Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. 01700-000000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Email (Optional)</label>
                  <input
                    type="email"
                    placeholder="Auto-generated if blank"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
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
                  <span>Register Employee</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
