/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Shield, Plus, Key, Users, RefreshCw, Save, X, Eye, EyeOff, UploadCloud, FileJson, CheckCircle2, AlertCircle, Database, FileText, Download, Sun, Moon, Laptop } from 'lucide-react';
import { collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { logActivity } from '../lib/activityLogger';

interface SettingsViewProps {
  currentUser: UserProfile | null;
  theme?: 'light' | 'dark' | 'system';
  setTheme?: (theme: 'light' | 'dark' | 'system') => void;
  syncFrequency?: '30s' | '1m' | '5m';
  setSyncFrequency?: (freq: '30s' | '1m' | '5m') => void;
  brandPalette?: string;
  setBrandPalette?: (palette: string) => void;
}

const ROLES = [
  'Super Admin',
  'Manager',
  'Sales Manager',
  'DSR',
  'Collection Officer',
  'Accountant'
];

const DEFAULT_PERMISSIONS: { [role: string]: { [perm: string]: boolean } } = {
  'Super Admin': {
    sales_create: true, sales_view_all: true, sales_delete: true,
    collection_create: true, collection_approve: true, collection_transfer: true,
    inventory_view: true, inventory_adjust: true, inventory_transfer_sub_depot: true,
    settlement_dsr: true, settlement_manager: true,
    purchases_create: true, purchases_view: true,
    reports_view: true, ledgers_adjust: true,
    settings_manage: true
  },
  'Manager': {
    sales_create: true, sales_view_all: true, sales_delete: true,
    collection_create: true, collection_approve: true, collection_transfer: true,
    inventory_view: true, inventory_adjust: true, inventory_transfer_sub_depot: true,
    settlement_dsr: true, settlement_manager: true,
    purchases_create: true, purchases_view: true,
    reports_view: true, ledgers_adjust: true,
    settings_manage: false
  },
  'Sales Manager': {
    sales_create: true, sales_view_all: true, sales_delete: false,
    collection_create: false, collection_approve: false, collection_transfer: false,
    inventory_view: true, inventory_adjust: false, inventory_transfer_sub_depot: true,
    settlement_dsr: true, settlement_manager: false,
    purchases_create: false, purchases_view: true,
    reports_view: true, ledgers_adjust: false,
    settings_manage: false
  },
  'DSR': {
    sales_create: true, sales_view_all: false, sales_delete: false,
    collection_create: true, collection_approve: false, collection_transfer: true,
    inventory_view: true, inventory_adjust: false, inventory_transfer_sub_depot: false,
    settlement_dsr: false, settlement_manager: false,
    purchases_create: false, purchases_view: false,
    reports_view: false, ledgers_adjust: false,
    settings_manage: false
  },
  'Collection Officer': {
    sales_create: false, sales_view_all: false, sales_delete: false,
    collection_create: true, collection_approve: false, collection_transfer: true,
    inventory_view: false, inventory_adjust: false, inventory_transfer_sub_depot: false,
    settlement_dsr: false, settlement_manager: false,
    purchases_create: false, purchases_view: false,
    reports_view: false, ledgers_adjust: false,
    settings_manage: false
  },
  'Accountant': {
    sales_create: false, sales_view_all: true, sales_delete: false,
    collection_create: false, collection_approve: false, collection_transfer: false,
    inventory_view: true, inventory_adjust: false, inventory_transfer_sub_depot: false,
    settlement_dsr: false, settlement_manager: false,
    purchases_create: true, purchases_view: true,
    reports_view: true, ledgers_adjust: true,
    settings_manage: false
  }
};

export default function SettingsView({ 
  currentUser, 
  theme = 'light', 
  setTheme, 
  syncFrequency = '30s', 
  setSyncFrequency,
  brandPalette = 'samira_blue',
  setBrandPalette
}: SettingsViewProps) {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Navigation state
  const [activeTab, setActiveTab] = useState<'users' | 'permissions' | 'import' | 'appearance'>('users');
  const [rolePermissions, setRolePermissions] = useState<any>(DEFAULT_PERMISSIONS);
  const [selectedRole, setSelectedRole] = useState<string>('Manager');
  const [savingPermissions, setSavingPermissions] = useState(false);

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

  // Restore state
  const [restoreFileContent, setRestoreFileContent] = useState<string>('');
  const [restoreFileName, setRestoreFileName] = useState<string>('');
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);
  const [restoreRecordsSummary, setRestoreRecordsSummary] = useState<{ [col: string]: number } | null>(null);
  const [parsedRestoreData, setParsedRestoreData] = useState<any>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isRestoreDragging, setIsRestoreDragging] = useState(false);

  const handleRestoreDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsRestoreDragging(true);
  };

  const handleRestoreDragLeave = () => {
    setIsRestoreDragging(false);
  };

  const handleRestoreDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsRestoreDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      processRestoreFile(file);
    }
  };

  const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processRestoreFile(file);
    }
  };

  const processRestoreFile = (file: File) => {
    setRestoreFileName(file.name);
    setRestoreError(null);
    setRestoreSuccessMsg(null);
    setRestoreRecordsSummary(null);
    setParsedRestoreData(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setRestoreFileContent(text);
      validateAndParseRestore(text);
    };
    reader.readAsText(file);
  };

  const validateAndParseRestore = (text: string) => {
    try {
      const data = JSON.parse(text);
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        setRestoreError('Invalid backup format: root must be a JSON object containing database collections.');
        return;
      }

      // Check schema validity - must contain at least one of the core collections
      const expectedKeys = ['companies', 'suppliers', 'customers', 'products', 'sales', 'purchases', 'collections', 'expenses', 'subDepots', 'subDepotTransactions'];
      const foundKeys = Object.keys(data).filter(k => expectedKeys.includes(k));

      if (foundKeys.length === 0) {
        setRestoreError('Invalid backup file: Could not find any recognized DMS collections in this file.');
        return;
      }

      // Check item validity and structure
      const summary: { [col: string]: number } = {};
      for (const col of foundKeys) {
        if (!Array.isArray(data[col])) {
          setRestoreError(`Integrity check failed: Collection "${col}" must be an array of documents.`);
          return;
        }
        summary[col] = data[col].length;
      }

      setRestoreRecordsSummary(summary);
      setParsedRestoreData(data);
    } catch (err: any) {
      setRestoreError(`JSON Parser Error: ${err.message}. Please ensure this is a valid SAMIRA backup file.`);
    }
  };

  const handleExecuteRestore = async () => {
    if (!parsedRestoreData) return;

    const initialConfirm = window.confirm(
      "🛑 CRITICAL WARNING: This action will completely OVERWRITE your existing databases with the contents of the backup file. Current records will be lost forever. Are you absolutely certain you want to proceed?"
    );
    if (!initialConfirm) return;

    const challenge = window.prompt("To verify this administrative action, type 'CONFIRM RESTORE' below:");
    if (challenge !== 'CONFIRM RESTORE') {
      alert("Verification failed. Operation cancelled.");
      return;
    }

    try {
      setIsRestoring(true);
      setRestoreSuccessMsg(null);
      setRestoreError(null);

      const collectionsToRestore = Object.keys(parsedRestoreData);
      let purgeCount = 0;
      let insertCount = 0;

      // 1. Purge the collections that we are about to restore
      for (const colName of collectionsToRestore) {
        const snap = await getDocs(collection(db, colName));
        const batch = writeBatch(db);
        snap.forEach(docSnap => {
          batch.delete(docSnap.ref);
          purgeCount++;
        });
        await batch.commit();
      }

      // 2. Insert documents
      for (const colName of collectionsToRestore) {
        const documents = parsedRestoreData[colName];
        // Process in small sub-batches to handle Firestore batch limit of 500
        for (let i = 0; i < documents.length; i += 400) {
          const subBatch = documents.slice(i, i + 400);
          const batch = writeBatch(db);
          for (const docData of subBatch) {
            // Document needs an ID
            const docId = docData.id || `doc-${Date.now()}-${insertCount}`;
            const docRef = doc(db, colName, docId);
            batch.set(docRef, docData);
            insertCount++;
          }
          await batch.commit();
        }
      }

      setRestoreSuccessMsg(`SUCCESS: Database restore completed successfully! Purged ${purgeCount} stale records and restored ${insertCount} healthy documents across ${collectionsToRestore.length} collections.`);
      
      if (currentUser) {
        await logActivity(
          currentUser.id,
          currentUser.name,
          currentUser.role,
          'SETTINGS_UPDATE',
          `Restored Firestore database from backup file containing ${insertCount} documents.`,
          { collectionsRestored: collectionsToRestore, totalDocuments: insertCount }
        );
      }

      // Reset states
      setParsedRestoreData(null);
      setRestoreFileName('');
      setRestoreFileContent('');
      setRestoreRecordsSummary(null);

      alert("DMS Database Restored Successfully! The page will now reload to synchronize states.");
      window.location.reload();

    } catch (err: any) {
      console.error('Error during database restore:', err);
      setRestoreError(`Restore process failed: ${err.message}. Database might be in a partial state.`);
    } finally {
      setIsRestoring(false);
    }
  };

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

      // Fetch Custom Permissions Matrix if any
      const settingsSnap = await getDocs(collection(db, 'settings'));
      let loadedPermissions = { ...DEFAULT_PERMISSIONS };
      settingsSnap.forEach(d => {
        if (d.id === 'role_permissions') {
          loadedPermissions = { ...DEFAULT_PERMISSIONS, ...d.data() };
        }
      });
      setRolePermissions(loadedPermissions);
    } catch (err) {
      console.error('Error loading profiles and permissions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePermissions = async () => {
    try {
      setSavingPermissions(true);
      await setDoc(doc(db, 'settings', 'role_permissions'), rolePermissions);
      alert('Role permissions matrix saved and updated successfully!');
      if (currentUser) {
        await logActivity(
          currentUser.id,
          currentUser.name,
          currentUser.role,
          'SETTINGS_UPDATE',
          `Modified role permissions matrix across system.`,
          { updatedPermissions: rolePermissions }
        );
      }
    } catch (err) {
      console.error('Error saving role permissions:', err);
      alert('Failed to save role permissions matrix.');
    } finally {
      setSavingPermissions(false);
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
        {isAdmin && activeTab === 'users' && (
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

      {/* Settings Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-100 pb-px gap-2 print:hidden">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 border-b-2 font-bold text-xs transition-all cursor-pointer ${
            activeTab === 'users' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Users Registry
        </button>
        <button
          onClick={() => setActiveTab('permissions')}
          className={`px-4 py-2 border-b-2 font-bold text-xs transition-all cursor-pointer ${
            activeTab === 'permissions' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Role Permission Matrix
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('import')}
            className={`px-4 py-2 border-b-2 font-bold text-xs transition-all cursor-pointer ${
              activeTab === 'import' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            Bulk Import & Backup
          </button>
        )}
        <button
          onClick={() => setActiveTab('appearance')}
          className={`px-4 py-2 border-b-2 font-bold text-xs transition-all cursor-pointer ${
            activeTab === 'appearance' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          System Appearance
        </button>
      </div>

      {activeTab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          
          <div className="space-y-6">
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

            {/* Offline Data Security Backup Card */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
              <h3 className="font-bold text-gray-900 text-sm tracking-tight flex items-center border-b border-slate-50 pb-3">
                <Database className="w-4.5 h-4.5 mr-2 text-blue-600" />
                <span>Offline Data Security</span>
              </h3>
              
              <p className="text-xs text-gray-500 leading-relaxed">
                Generate and download a complete secure offline JSON snapshot of the database to keep an extra copy of all logs, transactions, and inventories safe.
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

                    // Add current session details
                    backupData.backupMeta = {
                      downloadedBy: currentUser?.name || 'Unknown User',
                      role: currentUser?.role || 'N/A',
                      timestamp: new Date().toISOString()
                    };

                    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `SAMIRA_TRADERS_SNAPSHOT_${currentUser?.username?.toUpperCase() || 'USER'}_${new Date().toISOString().split('T')[0]}.json`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);

                    alert('Secure JSON database snapshot downloaded successfully!');
                  } catch (err: any) {
                    console.error('Snapshot backup error:', err);
                    alert(`Backup failed: ${err.message}`);
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center space-x-2 cursor-pointer shadow-sm"
              >
                <Download className="w-4 h-4 text-blue-400" />
                <span>Download Backup Snapshot</span>
              </button>
            </div>
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
      )}

      {activeTab === 'permissions' && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6 animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 gap-3">
            <div>
              <h3 className="text-base font-extrabold text-slate-800">Granular Role Permissions Matrix</h3>
              <p className="text-xs text-slate-400 mt-1">Configure exactly what modules and operations each user role has access to within SAMIRA TRADERS (DMS).</p>
            </div>
            
            <div className="flex items-center space-x-3">
              <label className="text-xs font-bold text-gray-500">Selected Role:</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer"
              >
                {ROLES.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Category: Sales & Invoicing */}
            <div className="space-y-3 p-4 bg-slate-50/50 rounded-xl border border-slate-100">
              <h4 className="text-xs font-black uppercase text-blue-700 tracking-wider">Sales & Invoicing</h4>
              <div className="space-y-2.5">
                <label className="flex items-center space-x-2.5 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!rolePermissions[selectedRole]?.sales_create}
                    onChange={(e) => {
                      setRolePermissions({
                        ...rolePermissions,
                        [selectedRole]: {
                          ...rolePermissions[selectedRole],
                          sales_create: e.target.checked
                        }
                      });
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Create Sales Invoices</span>
                </label>
                <label className="flex items-center space-x-2.5 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!rolePermissions[selectedRole]?.sales_view_all}
                    onChange={(e) => {
                      setRolePermissions({
                        ...rolePermissions,
                        [selectedRole]: {
                          ...rolePermissions[selectedRole],
                          sales_view_all: e.target.checked
                        }
                      });
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>View All Sales Invoices</span>
                </label>
                <label className="flex items-center space-x-2.5 text-xs font-semibold text-gray-700 cursor-pointer text-rose-600">
                  <input
                    type="checkbox"
                    checked={!!rolePermissions[selectedRole]?.sales_delete}
                    onChange={(e) => {
                      setRolePermissions({
                        ...rolePermissions,
                        [selectedRole]: {
                          ...rolePermissions[selectedRole],
                          sales_delete: e.target.checked
                        }
                      });
                    }}
                    className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                  />
                  <span>Delete / Void Invoices (Soft Delete)</span>
                </label>
              </div>
            </div>

            {/* Category: Cash Collection */}
            <div className="space-y-3 p-4 bg-slate-50/50 rounded-xl border border-slate-100">
              <h4 className="text-xs font-black uppercase text-blue-700 tracking-wider">Cash Collection</h4>
              <div className="space-y-2.5">
                <label className="flex items-center space-x-2.5 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!rolePermissions[selectedRole]?.collection_create}
                    onChange={(e) => {
                      setRolePermissions({
                        ...rolePermissions,
                        [selectedRole]: {
                          ...rolePermissions[selectedRole],
                          collection_create: e.target.checked
                        }
                      });
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Create Cash Collections</span>
                </label>
                <label className="flex items-center space-x-2.5 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!rolePermissions[selectedRole]?.collection_approve}
                    onChange={(e) => {
                      setRolePermissions({
                        ...rolePermissions,
                        [selectedRole]: {
                          ...rolePermissions[selectedRole],
                          collection_approve: e.target.checked
                        }
                      });
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Approve & Verify Collected Cash</span>
                </label>
                <label className="flex items-center space-x-2.5 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!rolePermissions[selectedRole]?.collection_transfer}
                    onChange={(e) => {
                      setRolePermissions({
                        ...rolePermissions,
                        [selectedRole]: {
                          ...rolePermissions[selectedRole],
                          collection_transfer: e.target.checked
                        }
                      });
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Transfer Collected Cash to Main Depot</span>
                </label>
              </div>
            </div>

            {/* Category: Inventory & Depot */}
            <div className="space-y-3 p-4 bg-slate-50/50 rounded-xl border border-slate-100">
              <h4 className="text-xs font-black uppercase text-blue-700 tracking-wider">Inventory & Depot</h4>
              <div className="space-y-2.5">
                <label className="flex items-center space-x-2.5 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!rolePermissions[selectedRole]?.inventory_view}
                    onChange={(e) => {
                      setRolePermissions({
                        ...rolePermissions,
                        [selectedRole]: {
                          ...rolePermissions[selectedRole],
                          inventory_view: e.target.checked
                        }
                      });
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>View Depot Stock Level</span>
                </label>
                <label className="flex items-center space-x-2.5 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!rolePermissions[selectedRole]?.inventory_adjust}
                    onChange={(e) => {
                      setRolePermissions({
                        ...rolePermissions,
                        [selectedRole]: {
                          ...rolePermissions[selectedRole],
                          inventory_adjust: e.target.checked
                        }
                      });
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Manual Inventory Audit Adjustments</span>
                </label>
                <label className="flex items-center space-x-2.5 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!rolePermissions[selectedRole]?.inventory_transfer_sub_depot}
                    onChange={(e) => {
                      setRolePermissions({
                        ...rolePermissions,
                        [selectedRole]: {
                          ...rolePermissions[selectedRole],
                          inventory_transfer_sub_depot: e.target.checked
                        }
                      });
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Initiate transfers to Sub Depots</span>
                </label>
              </div>
            </div>

            {/* Category: DSR Settlements */}
            <div className="space-y-3 p-4 bg-slate-50/50 rounded-xl border border-slate-100">
              <h4 className="text-xs font-black uppercase text-blue-700 tracking-wider">Settlements & Closing</h4>
              <div className="space-y-2.5">
                <label className="flex items-center space-x-2.5 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!rolePermissions[selectedRole]?.settlement_dsr}
                    onChange={(e) => {
                      setRolePermissions({
                        ...rolePermissions,
                        [selectedRole]: {
                          ...rolePermissions[selectedRole],
                          settlement_dsr: e.target.checked
                        }
                      });
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Initiate daily DSR sheet settlement</span>
                </label>
                <label className="flex items-center space-x-2.5 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!rolePermissions[selectedRole]?.settlement_manager}
                    onChange={(e) => {
                      setRolePermissions({
                        ...rolePermissions,
                        [selectedRole]: {
                          ...rolePermissions[selectedRole],
                          settlement_manager: e.target.checked
                        }
                      });
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Perform final manager verification settlement</span>
                </label>
              </div>
            </div>

            {/* Category: Supplier Purchases */}
            <div className="space-y-3 p-4 bg-slate-50/50 rounded-xl border border-slate-100">
              <h4 className="text-xs font-black uppercase text-blue-700 tracking-wider">Supplier Purchases</h4>
              <div className="space-y-2.5">
                <label className="flex items-center space-x-2.5 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!rolePermissions[selectedRole]?.purchases_create}
                    onChange={(e) => {
                      setRolePermissions({
                        ...rolePermissions,
                        [selectedRole]: {
                          ...rolePermissions[selectedRole],
                          purchases_create: e.target.checked
                        }
                      });
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Record Supplier Purchase Invoices</span>
                </label>
                <label className="flex items-center space-x-2.5 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!rolePermissions[selectedRole]?.purchases_view}
                    onChange={(e) => {
                      setRolePermissions({
                        ...rolePermissions,
                        [selectedRole]: {
                          ...rolePermissions[selectedRole],
                          purchases_view: e.target.checked
                        }
                      });
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>View Supplier Purchase Ledger Statements</span>
                </label>
              </div>
            </div>

            {/* Category: Reports & Ledgers */}
            <div className="space-y-3 p-4 bg-slate-50/50 rounded-xl border border-slate-100">
              <h4 className="text-xs font-black uppercase text-blue-700 tracking-wider">Reports & General Ledgers</h4>
              <div className="space-y-2.5">
                <label className="flex items-center space-x-2.5 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!rolePermissions[selectedRole]?.reports_view}
                    onChange={(e) => {
                      setRolePermissions({
                        ...rolePermissions,
                        [selectedRole]: {
                          ...rolePermissions[selectedRole],
                          reports_view: e.target.checked
                        }
                      });
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>View Financial, Profit & P&L Statements</span>
                </label>
                <label className="flex items-center space-x-2.5 text-xs font-semibold text-gray-700 cursor-pointer text-rose-600">
                  <input
                    type="checkbox"
                    checked={!!rolePermissions[selectedRole]?.ledgers_adjust}
                    onChange={(e) => {
                      setRolePermissions({
                        ...rolePermissions,
                        [selectedRole]: {
                          ...rolePermissions[selectedRole],
                          ledgers_adjust: e.target.checked
                        }
                      });
                    }}
                    className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                  />
                  <span>Manual Customer/Supplier Ledger Balance Adjustments</span>
                </label>
              </div>
            </div>

            {/* Category: System Administration */}
            <div className="space-y-3 p-4 bg-slate-50/50 rounded-xl border border-slate-100 md:col-span-2">
              <h4 className="text-xs font-black uppercase text-rose-600 tracking-wider">System Administration</h4>
              <div className="space-y-2.5">
                <label className="flex items-center space-x-2.5 text-xs font-semibold text-gray-700 cursor-pointer text-rose-700 font-bold">
                  <input
                    type="checkbox"
                    checked={!!rolePermissions[selectedRole]?.settings_manage}
                    onChange={(e) => {
                      setRolePermissions({
                        ...rolePermissions,
                        [selectedRole]: {
                          ...rolePermissions[selectedRole],
                          settings_manage: e.target.checked
                        }
                      });
                    }}
                    className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                  />
                  <span>Bulk Import spreadsheets, System Table Purges & Backup Center</span>
                </label>
              </div>
            </div>

          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              onClick={handleSavePermissions}
              disabled={savingPermissions}
              className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              {savingPermissions ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving Permissions Matrix...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 text-emerald-400" />
                  <span>Save Role Permissions Grid</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'import' && isAdmin && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-8 animate-fadeIn" id="bulk-center">
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
                <h4 className="text-xs font-black uppercase text-amber-600 tracking-wider mb-3">Restore System Backup</h4>
                <div className="bg-white border border-slate-200 p-4 rounded-2xl space-y-4 shadow-sm">
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Upload a previously downloaded SAMIRA TRADERS backup JSON file. This will restore the system records to that point.
                  </p>

                  {/* Drag and Drop Zone for Restore */}
                  <div
                    onDragOver={handleRestoreDragOver}
                    onDragLeave={handleRestoreDragLeave}
                    onDrop={handleRestoreDrop}
                    className={`border-2 border-dashed rounded-xl p-4 text-center transition-all ${
                      isRestoreDragging
                        ? 'border-amber-500 bg-amber-50/40'
                        : restoreFileName
                        ? 'border-emerald-200 bg-emerald-50/10'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50/40'
                    }`}
                  >
                    <input
                      type="file"
                      id="restore-file-input"
                      accept=".json"
                      onChange={handleRestoreFileChange}
                      className="hidden"
                    />
                    
                    <label htmlFor="restore-file-input" className="cursor-pointer block space-y-1">
                      <UploadCloud className={`w-8 h-8 mx-auto ${restoreFileName ? 'text-emerald-500' : 'text-slate-400'}`} />
                      <div>
                        <p className="text-[11px] font-bold text-slate-700">
                          {restoreFileName ? `Selected: ${restoreFileName}` : 'Drop backup file here or click to browse'}
                        </p>
                        <p className="text-[9px] text-slate-400">Supports .json backup files</p>
                      </div>
                    </label>
                  </div>

                  {/* Errors */}
                  {restoreError && (
                    <div className="bg-rose-50 border border-rose-100 text-rose-700 p-3 rounded-xl text-[11px] flex items-start space-x-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <p className="font-semibold leading-tight">{restoreError}</p>
                    </div>
                  )}

                  {/* Success Msg */}
                  {restoreSuccessMsg && (
                    <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-3 rounded-xl text-[11px] flex items-start space-x-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      <p className="font-bold leading-tight">{restoreSuccessMsg}</p>
                    </div>
                  )}

                  {/* Restore Records Summary Checklist */}
                  {restoreRecordsSummary && (
                    <div className="bg-amber-50/50 border border-amber-200/60 p-3 rounded-xl space-y-2">
                      <div className="text-[11px] font-bold text-amber-800 flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Data Integrity Check Passed</span>
                      </div>
                      <p className="text-[10px] text-amber-700/80 leading-tight">The following document counts were verified in the backup payload:</p>
                      
                      <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-amber-900 bg-white/60 p-2 rounded-lg border border-amber-200/40">
                        {Object.entries(restoreRecordsSummary).map(([col, count]) => (
                          <div key={col} className="flex justify-between border-b border-amber-100/30 pb-0.5">
                            <span className="capitalize">{col}:</span>
                            <span className="font-bold">{count} docs</span>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={handleExecuteRestore}
                        disabled={isRestoring}
                        className="w-full mt-2 bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
                      >
                        {isRestoring ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Overwriting & Restoring...</span>
                          </>
                        ) : (
                          <>
                            <Database className="w-3.5 h-3.5" />
                            <span>Confirm & Execute Overwrite Restore</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
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

      {activeTab === 'appearance' && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm space-y-6 animate-fadeIn text-slate-800 dark:text-slate-100">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">System Theme & Appearance</h3>
            <p className="text-xs text-slate-400 dark:text-slate-400 mt-1">
              Select how SAMIRA TRADERS DMS appears on your screen. You can choose a light theme, dark theme, or sync it with your system preferences.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Light Theme Card */}
            <button
              onClick={() => setTheme && setTheme('light')}
              className={`p-5 rounded-2xl border text-left transition-all flex flex-col gap-4 cursor-pointer focus:outline-none ${
                theme === 'light'
                  ? 'border-blue-600 bg-blue-50/20 ring-2 ring-blue-500/10'
                  : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-850/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`p-2.5 rounded-xl ${
                  theme === 'light' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}>
                  <Sun className="w-5 h-5" />
                </span>
                {theme === 'light' && (
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                )}
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 dark:text-white">Light Mode</h4>
                <p className="text-[10.5px] text-slate-400 dark:text-slate-400 mt-1 font-medium">
                  Clean crisp layout with bright whites and light slate backgrounds, ideal for bright workspaces.
                </p>
              </div>
            </button>

            {/* Dark Theme Card */}
            <button
              onClick={() => setTheme && setTheme('dark')}
              className={`p-5 rounded-2xl border text-left transition-all flex flex-col gap-4 cursor-pointer focus:outline-none ${
                theme === 'dark'
                  ? 'border-blue-600 bg-blue-950/20 ring-2 ring-blue-500/10'
                  : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-850/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`p-2.5 rounded-xl ${
                  theme === 'dark' ? 'bg-blue-950/50 text-blue-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}>
                  <Moon className="w-5 h-5" />
                </span>
                {theme === 'dark' && (
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                )}
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 dark:text-white">Dark Mode</h4>
                <p className="text-[10.5px] text-slate-400 dark:text-slate-400 mt-1 font-medium">
                  Cool dark slate theme with cobalt blue accents. Soft on eyes and reduces power consumption.
                </p>
              </div>
            </button>

            {/* System Default Theme Card */}
            <button
              onClick={() => setTheme && setTheme('system')}
              className={`p-5 rounded-2xl border text-left transition-all flex flex-col gap-4 cursor-pointer focus:outline-none ${
                theme === 'system'
                  ? 'border-blue-600 bg-blue-50/20 dark:bg-blue-950/20 ring-2 ring-blue-500/10'
                  : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-850/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`p-2.5 rounded-xl ${
                  theme === 'system' ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}>
                  <Laptop className="w-5 h-5" />
                </span>
                {theme === 'system' && (
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-500"></span>
                )}
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 dark:text-white">System Auto-Detect</h4>
                <p className="text-[10.5px] text-slate-400 dark:text-slate-400 mt-1 font-medium">
                  Automatically syncs application colors with your operating system light or dark preferences.
                </p>
              </div>
            </button>
          </div>
          
          {/* Brand Color Palettes Selection */}
          <div className="space-y-4 border-t border-slate-100 dark:border-slate-800 pt-6">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span className="text-lg">🎨</span>
                <span>Brand Color Palette</span>
              </h3>
              <p className="text-[10.5px] text-slate-400 dark:text-slate-400 mt-1">
                Select from different premium brand palettes to customize the primary application styling, menus, and layout buttons.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Samira Blue */}
              <button
                type="button"
                onClick={() => setBrandPalette && setBrandPalette('samira_blue')}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer focus:outline-none h-32 ${
                  brandPalette === 'samira_blue'
                    ? 'border-blue-600 bg-blue-50/25 dark:bg-blue-950/25 ring-2 ring-blue-500/10'
                    : 'border-slate-150 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-850/20'
                }`}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="text-[10px] font-bold text-slate-400">Samira Blue</span>
                  <span className="w-4 h-4 rounded-full bg-[#2563eb] border border-white"></span>
                </div>
                <div className="flex gap-1 mt-2">
                  <span className="w-4 h-2 rounded bg-[#eff6ff]"></span>
                  <span className="w-4 h-2 rounded bg-[#bfdbfe]"></span>
                  <span className="w-4 h-2 rounded bg-[#3b82f6]"></span>
                  <span className="w-4 h-2 rounded bg-[#1e3a8a]"></span>
                </div>
                <p className="text-[9px] text-slate-400 mt-1 leading-tight">Default terminal cobalt blue.</p>
              </button>

              {/* Emerald Green */}
              <button
                type="button"
                onClick={() => setBrandPalette && setBrandPalette('emerald_green')}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer focus:outline-none h-32 ${
                  brandPalette === 'emerald_green'
                    ? 'border-blue-600 bg-blue-50/25 dark:bg-blue-950/25 ring-2 ring-blue-500/10'
                    : 'border-slate-150 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-850/20'
                }`}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="text-[10px] font-bold text-slate-400">Emerald Green</span>
                  <span className="w-4 h-4 rounded-full bg-[#059669] border border-white"></span>
                </div>
                <div className="flex gap-1 mt-2">
                  <span className="w-4 h-2 rounded bg-[#f0fdf4]"></span>
                  <span className="w-4 h-2 rounded bg-[#bbf7d0]"></span>
                  <span className="w-4 h-2 rounded bg-[#10b981]"></span>
                  <span className="w-4 h-2 rounded bg-[#064e3b]"></span>
                </div>
                <p className="text-[9px] text-slate-400 mt-1 leading-tight">Calming, highly readable green workspace.</p>
              </button>

              {/* Slate Dark */}
              <button
                type="button"
                onClick={() => setBrandPalette && setBrandPalette('slate_dark')}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer focus:outline-none h-32 ${
                  brandPalette === 'slate_dark'
                    ? 'border-blue-600 bg-blue-50/25 dark:bg-blue-950/25 ring-2 ring-blue-500/10'
                    : 'border-slate-150 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-850/20'
                }`}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="text-[10px] font-bold text-slate-400">Slate Dark</span>
                  <span className="w-4 h-4 rounded-full bg-[#475569] border border-white"></span>
                </div>
                <div className="flex gap-1 mt-2">
                  <span className="w-4 h-2 rounded bg-[#f8fafc]"></span>
                  <span className="w-4 h-2 rounded bg-[#e2e8f0]"></span>
                  <span className="w-4 h-2 rounded bg-[#64748b]"></span>
                  <span className="w-4 h-2 rounded bg-[#0f172a]"></span>
                </div>
                <p className="text-[9px] text-slate-400 mt-1 leading-tight">Minimalist, elegant high-contrast slate.</p>
              </button>

              {/* Crimson Red */}
              <button
                type="button"
                onClick={() => setBrandPalette && setBrandPalette('crimson_red')}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer focus:outline-none h-32 ${
                  brandPalette === 'crimson_red'
                    ? 'border-blue-600 bg-blue-50/25 dark:bg-blue-950/25 ring-2 ring-blue-500/10'
                    : 'border-slate-150 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-850/20'
                }`}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="text-[10px] font-bold text-slate-400">Crimson Red</span>
                  <span className="w-4 h-4 rounded-full bg-[#e03131] border border-white"></span>
                </div>
                <div className="flex gap-1 mt-2">
                  <span className="w-4 h-2 rounded bg-[#fff5f5]"></span>
                  <span className="w-4 h-2 rounded bg-[#ffc9c9]"></span>
                  <span className="w-4 h-2 rounded bg-[#fa5252]"></span>
                  <span className="w-4 h-2 rounded bg-[#961212]"></span>
                </div>
                <p className="text-[9px] text-slate-400 mt-1 leading-tight">Energetic crimson branding.</p>
              </button>

              {/* Royal Purple */}
              <button
                type="button"
                onClick={() => setBrandPalette && setBrandPalette('royal_purple')}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer focus:outline-none h-32 ${
                  brandPalette === 'royal_purple'
                    ? 'border-blue-600 bg-blue-50/25 dark:bg-blue-950/25 ring-2 ring-blue-500/10'
                    : 'border-slate-150 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-850/20'
                }`}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="text-[10px] font-bold text-slate-400">Royal Purple</span>
                  <span className="w-4 h-4 rounded-full bg-[#9333ea] border border-white"></span>
                </div>
                <div className="flex gap-1 mt-2">
                  <span className="w-4 h-2 rounded bg-[#faf5ff]"></span>
                  <span className="w-4 h-2 rounded bg-[#e9d5ff]"></span>
                  <span className="w-4 h-2 rounded bg-[#a855f7]"></span>
                  <span className="w-4 h-2 rounded bg-[#581c87]"></span>
                </div>
                <p className="text-[9px] text-slate-400 mt-1 leading-tight">Prestigious purple contrast palette.</p>
              </button>
            </div>
          </div>

          {/* Sync Frequency Settings */}
          <div className="space-y-4 border-t border-slate-100 dark:border-slate-800 pt-6">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Sync Frequency & Auto-Refresh</span>
              </h3>
              <p className="text-[10.5px] text-slate-400 dark:text-slate-400 mt-1">
                Configure the interval frequency for background synchronisation of low-stock alerts, live inventory ledger data, and network connection checks.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 30 seconds */}
              <button
                type="button"
                onClick={() => setSyncFrequency && setSyncFrequency('30s')}
                className={`p-4 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer focus:outline-none ${
                  syncFrequency === '30s'
                    ? 'border-blue-600 bg-blue-50/25 ring-2 ring-blue-500/10'
                    : 'border-slate-150 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-850/20'
                }`}
              >
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-slate-900 dark:text-white">Real-Time (30 Seconds)</h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">High-frequency syncing, recommended for active sales periods.</p>
                </div>
                {syncFrequency === '30s' && (
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0 ml-2"></span>
                )}
              </button>

              {/* 1 minute */}
              <button
                type="button"
                onClick={() => setSyncFrequency && setSyncFrequency('1m')}
                className={`p-4 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer focus:outline-none ${
                  syncFrequency === '1m'
                    ? 'border-blue-600 bg-blue-50/25 ring-2 ring-blue-500/10'
                    : 'border-slate-150 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-850/20'
                }`}
              >
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-slate-900 dark:text-white">Balanced (1 Minute)</h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">Standard background interval, balances device battery and data freshness.</p>
                </div>
                {syncFrequency === '1m' && (
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0 ml-2"></span>
                )}
              </button>

              {/* 5 minutes */}
              <button
                type="button"
                onClick={() => setSyncFrequency && setSyncFrequency('5m')}
                className={`p-4 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer focus:outline-none ${
                  syncFrequency === '5m'
                    ? 'border-blue-600 bg-blue-50/25 ring-2 ring-blue-500/10'
                    : 'border-slate-150 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-850/20'
                }`}
              >
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-slate-900 dark:text-white">Eco Mode (5 Minutes)</h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">Conserves network bandwidth and system resources on slower devices.</p>
                </div>
                {syncFrequency === '5m' && (
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0 ml-2"></span>
                )}
              </button>
            </div>
          </div>

          {/* Interactive Preview Container */}
          <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-2xl border border-slate-100 dark:border-slate-850/80 space-y-4">
            <div>
              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Aesthetic Preview Grid</h4>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Real-time mock elements representing active UI color contrasts</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-150 dark:border-slate-800 shadow-xs flex flex-col justify-between min-h-32">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400">Inventory Status</span>
                  <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-400 text-[9px] font-black rounded">
                    STABLE
                  </span>
                </div>
                <div>
                  <h5 className="text-xs font-extrabold text-slate-900 dark:text-white">Central Warehouse Depot</h5>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Primary distribution hub inventory levels</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-150 dark:border-slate-800 shadow-xs flex flex-col justify-between min-h-32">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400">Total Collections</span>
                  <span className="text-[10px] font-mono font-black text-blue-600 dark:text-blue-400">৳ 2,45,000</span>
                </div>
                <div className="space-y-2">
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full w-2/3 bg-blue-600 dark:bg-blue-500 rounded-full"></div>
                  </div>
                  <div className="flex justify-between text-[9px] font-medium text-slate-400">
                    <span>Target Goal Reached</span>
                    <span>67%</span>
                  </div>
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
