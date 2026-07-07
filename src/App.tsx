/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Warehouse, 
  RefreshCw, 
  ShieldAlert, 
  LogIn, 
  Eye, 
  EyeOff,
  User,
  Lock,
  Database
} from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, seedInitialAdmin } from './lib/firebase';
import { seedSampleData } from './lib/seedData';
import { UserProfile, UserRole } from './types';

// UI components
import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import CustomerView from './components/CustomerView';
import SupplierView from './components/SupplierView';
import CompanyView from './components/CompanyView';
import ProductView from './components/ProductView';
import InventoryView from './components/InventoryView';
import SalesInvoiceView from './components/SalesInvoiceView';
import PurchaseView from './components/PurchaseView';
import CollectionView from './components/CollectionView';
import PartyLedgerView from './components/PartyLedgerView';
import ExpenseView from './components/ExpenseView';
import SubDepotView from './components/SubDepotView';
import ReportsView from './components/ReportsView';
import SettingsView from './components/SettingsView';
import ActivityLogView from './components/ActivityLogView';
import DSRView from './components/DSRView';
import SupplierClaimsView from './components/SupplierClaimsView';
import ManagerSettlementView from './components/ManagerSettlementView';

class ViewErrorBoundary extends React.Component<
  { children: React.ReactNode; viewName: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ViewErrorBoundary] Crash detected in "${this.props.viewName}":`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 my-4 space-y-4" id={`error-boundary-${this.props.viewName}`}>
          <div className="flex items-start space-x-3 text-red-700">
            <span className="p-2 bg-red-100 rounded-xl text-lg leading-none shrink-0">⚠️</span>
            <div>
              <h3 className="font-black text-sm">Failed to Load Module: {this.props.viewName}</h3>
              <p className="text-xs text-red-500 mt-1">A critical mounting or runtime exception occurred inside this component view.</p>
            </div>
          </div>
          <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-60 leading-relaxed border border-slate-800">
            <p className="font-bold text-rose-400 mb-1">{this.state.error?.name || 'Error'}: {this.state.error?.message || 'Unknown Error'}</p>
            <pre className="text-[10px] text-slate-400 mt-2">{this.state.error?.stack || 'No stack trace available'}</pre>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer"
            >
              Reload Browser
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer border"
            >
              Dismiss & Retry
            </button>
          </div>
        </div>
      );
    }

    return (
      <React.Suspense fallback={
        <div className="bg-white border border-gray-100 rounded-2xl p-10 flex flex-col items-center justify-center text-center space-y-3 shadow-sm">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          <h4 className="font-bold text-gray-800 text-sm">Loading {this.props.viewName}...</h4>
          <p className="text-xs text-gray-400 max-w-xs">Assembling component widgets and synchronizing client state.</p>
        </div>
      }>
        {this.props.children}
      </React.Suspense>
    );
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  
  // Login Form States
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [seedingInProgress, setSeedingInProgress] = useState(false);

  // Run on mount: Trigger database seed checks
  useEffect(() => {
    const initializeApp = async () => {
      try {
        setSeedingInProgress(true);
        console.log('Initializing SAMIRA TRADERS DMS database schema...');
        
        // Timeout promise of 3 seconds
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database initialization timeout')), 3000)
        );

        // Run the seeding logic with a timeout fallback
        await Promise.race([
          (async () => {
            // 1. Seed admin credentials
            await seedInitialAdmin();
            // 2. Seed business sample databases (companies, products, routes, etc.)
            await seedSampleData();
          })(),
          timeoutPromise
        ]);

        console.log('Database schemas verified successfully.');
      } catch (err) {
        console.warn('Initialization note during startup (using local fallback if Firestore connection is slow):', err);
      } finally {
        setSeedingInProgress(false);
        setLoading(false);
      }
    };

    initializeApp();
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!loginUsername || !loginPassword) {
      setLoginError('Please enter both username and password.');
      return;
    }

    const inputUsername = loginUsername.trim().toLowerCase();

    // 1. Instant local fallback for default administrator to bypass potential database hangs/offline states
    if (inputUsername === 'admin' && loginPassword === 'admin123') {
      const localAdmin: UserProfile = {
        id: 'admin_local_fallback_uid',
        username: 'admin',
        name: 'Super Admin (Samira Traders)',
        role: UserRole.SUPER_ADMIN,
        phone: '01712345678',
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      };
      localStorage.setItem('samira_current_user_name', localAdmin.name);
      setCurrentUser(localAdmin);
      setActiveTab('dashboard');
      return;
    }

    try {
      setLoading(true);
      
      // Query with a 4-second timeout to avoid indefinite button spins
      const queryPromise = (async () => {
        const usersColRef = collection(db, 'users');
        const q = query(usersColRef, where('username', '==', inputUsername));
        return await getDocs(q);
      })();

      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Database login request timed out')), 4000)
      );

      const snap = await Promise.race([queryPromise, timeoutPromise]);

      if (snap.empty) {
        setLoginError('Invalid username credentials. Please try again.');
        setLoading(false);
        return;
      }

      let matchedUser: UserProfile | null = null;
      snap.forEach(d => {
        const profile = d.data() as UserProfile;
        // Check password - in robust local preview mode, admins set standard passwords
        // Fallback for default admin: username "admin", password "admin123"
        const storedPassword = (profile as any).password || 'admin123';
        if (loginPassword === storedPassword || (inputUsername === 'admin' && loginPassword === 'admin123')) {
          matchedUser = profile;
        }
      });

      if (matchedUser) {
        localStorage.setItem('samira_current_user_name', (matchedUser as any).name || (matchedUser as any).username || 'Admin');
        setCurrentUser(matchedUser);
        setActiveTab('dashboard');
      } else {
        setLoginError('Incorrect password entered. Please try again.');
      }
    } catch (err: any) {
      console.error('Authentication error:', err);
      setLoginError('Database authentication failed or timed out. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('samira_current_user_name');
    setCurrentUser(null);
    setLoginUsername('');
    setLoginPassword('');
    setLoginError('');
  };

  // Session Timeout Check: 30 minutes of inactivity (30 * 60 * 1000 ms)
  const TIMEOUT_DURATION = 30 * 60 * 1000;

  useEffect(() => {
    if (!currentUser) return;

    let timeoutId: any;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogoutDueToInactivity();
      }, TIMEOUT_DURATION);
    };

    const handleLogoutDueToInactivity = () => {
      handleLogout();
      setLoginError('Your session has expired due to 30 minutes of inactivity to protect sensitive distribution data. (নিরাপত্তার স্বার্থে ৩০ মিনিট নিষ্ক্রিয়তার কারণে আপনার সেশনটি বন্ধ করা হয়েছে।)');
    };

    // User activity events to monitor interaction
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click'
    ];

    // Initialize timer
    resetTimer();

    // Bind event listeners with passive: true for performance
    activityEvents.forEach(event => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    // Cleanup
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [currentUser]);

  if (loading || seedingInProgress) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <Warehouse className="w-16 h-16 text-blue-500 animate-pulse mb-4" />
        <h2 className="text-xl font-black tracking-wider text-white">SAMIRA TRADERS DMS</h2>
        <p className="text-xs text-slate-400 mt-2 font-mono flex items-center justify-center space-x-1">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
          <span>Synchronizing Firestore clusters & collections...</span>
        </p>
      </div>
    );
  }

  // Render Login view if user is not authenticated
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden" id="login-screen">
        
        {/* Subtle background glow */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10 space-y-6">
          
          <div className="text-center space-y-2">
            <div className="p-4 bg-blue-600/10 text-blue-500 rounded-2xl inline-block border border-blue-500/20">
              <Warehouse className="w-10 h-10" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">SAMIRA TRADERS</h1>
            <p className="text-xs text-slate-400 font-mono tracking-widest">DISTRIBUTION MANAGEMENT SYSTEM</p>
          </div>

          {loginError && (
            <div className="p-3.5 bg-rose-950/40 border border-rose-800/50 text-rose-200 text-xs rounded-xl flex items-center space-x-2 animate-shake" id="login-error-alert">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1.5 tracking-wider">Username</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                <input
                  type="text"
                  placeholder="Enter administrator or staff username"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  id="login-username-input"
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-600 pl-10 pr-4 py-3 rounded-xl text-xs focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1.5 tracking-wider">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  id="login-password-input"
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-600 pl-10 pr-10 py-3 rounded-xl text-xs focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              id="login-submit-btn"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl text-xs transition-all flex items-center justify-center space-x-2 shadow-lg shadow-blue-900/20 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Enter DMS Terminal</span>
            </button>
          </form>

          {/* Test credentials hints */}
          <div className="border-t border-slate-800/60 pt-4 text-center space-y-1.5">
            <span className="text-[10px] text-slate-500 font-bold uppercase block tracking-wider">Default Developer Sandbox Login</span>
            <div className="flex justify-center items-center space-x-3 text-[11px]">
              <span className="text-slate-400">User: <strong className="font-mono text-blue-400 bg-slate-950 px-1.5 py-0.5 rounded">admin</strong></span>
              <span className="text-slate-400">Pass: <strong className="font-mono text-blue-400 bg-slate-950 px-1.5 py-0.5 rounded">admin123</strong></span>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // Active Authenticated Navigation Routing Canvas wrapped in ViewErrorBoundary for mounting resilience
  const renderViewContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <ViewErrorBoundary viewName="DashboardView">
            <DashboardView onQuickAction={(tab) => setActiveTab(tab)} userRole={currentUser.role} />
          </ViewErrorBoundary>
        );
      case 'customers':
        return (
          <ViewErrorBoundary viewName="CustomerView">
            <CustomerView />
          </ViewErrorBoundary>
        );
      case 'suppliers':
        return (
          <ViewErrorBoundary viewName="SupplierView">
            <SupplierView />
          </ViewErrorBoundary>
        );
      case 'companies':
        return (
          <ViewErrorBoundary viewName="CompanyView">
            <CompanyView />
          </ViewErrorBoundary>
        );
      case 'products':
        return (
          <ViewErrorBoundary viewName="ProductView">
            <ProductView />
          </ViewErrorBoundary>
        );
      case 'inventory':
        return (
          <ViewErrorBoundary viewName="InventoryView">
            <InventoryView />
          </ViewErrorBoundary>
        );
      case 'sales':
        return (
          <ViewErrorBoundary viewName="SalesInvoiceView">
            <SalesInvoiceView 
              userRole={currentUser.role}
              userId={currentUser.id}
              userName={currentUser.name}
            />
          </ViewErrorBoundary>
        );
      case 'dsr':
        return (
          <ViewErrorBoundary viewName="DSRView">
            <DSRView />
          </ViewErrorBoundary>
        );
      case 'purchases':
        return (
          <ViewErrorBoundary viewName="PurchaseView">
            <PurchaseView />
          </ViewErrorBoundary>
        );
      case 'collections':
        return (
          <ViewErrorBoundary viewName="CollectionView">
            <CollectionView 
              userRole={currentUser.role}
              userId={currentUser.id}
              userName={currentUser.name}
            />
          </ViewErrorBoundary>
        );
      case 'ledgers':
        return (
          <ViewErrorBoundary viewName="PartyLedgerView">
            <PartyLedgerView />
          </ViewErrorBoundary>
        );
      case 'expenses':
        return (
          <ViewErrorBoundary viewName="ExpenseView">
            <ExpenseView />
          </ViewErrorBoundary>
        );
      case 'claims':
        return (
          <ViewErrorBoundary viewName="SupplierClaimsView">
            <SupplierClaimsView />
          </ViewErrorBoundary>
        );
      case 'settlements':
        return (
          <ViewErrorBoundary viewName="ManagerSettlementView">
            <ManagerSettlementView />
          </ViewErrorBoundary>
        );
      case 'subdepots':
        return (
          <ViewErrorBoundary viewName="SubDepotView">
            <SubDepotView />
          </ViewErrorBoundary>
        );
      case 'reports':
        return (
          <ViewErrorBoundary viewName="ReportsView">
            <ReportsView />
          </ViewErrorBoundary>
        );
      case 'settings':
        return (
          <ViewErrorBoundary viewName="SettingsView">
            <SettingsView currentUser={currentUser} />
          </ViewErrorBoundary>
        );
      case 'logs':
        return (
          <ViewErrorBoundary viewName="ActivityLogView">
            {currentUser.role === UserRole.SUPER_ADMIN ? (
              <ActivityLogView />
            ) : (
              <DashboardView onQuickAction={(tab) => setActiveTab(tab)} userRole={currentUser.role} />
            )}
          </ViewErrorBoundary>
        );
      default:
        return (
          <ViewErrorBoundary viewName="DashboardView">
            <DashboardView onQuickAction={(tab) => setActiveTab(tab)} userRole={currentUser.role} />
          </ViewErrorBoundary>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row" id="authenticated-screen">
      
      {/* Sidebar Navigation */}
      <Sidebar 
        user={currentUser} 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onLogout={handleLogout} 
      />

      {/* Main Content Pane */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-6">
        
        {/* Top bar with quick user info */}
        <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-100 shadow-sm md:hidden">
          <span className="font-black text-sm text-slate-800">SAMIRA TRADERS DMS</span>
          <span className="inline-block px-2.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-lg border">
            {currentUser.role}
          </span>
        </div>

        {/* Dynamic View Panel */}
        <div className="animate-fade-in" id="active-view-viewport">
          {renderViewContent()}
        </div>

      </main>
    </div>
  );
}
