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
  Database,
  Bell,
  X,
  Check,
  Search,
  FileText,
  Tag,
  QrCode,
  Camera
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
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

  // Theme state persisted in localStorage
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('dms_theme') as 'light' | 'dark' | 'system') || 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    
    const applyTheme = () => {
      let isDark = false;
      if (theme === 'dark') {
        isDark = true;
      } else if (theme === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      
      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme();

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleMediaChange = () => {
        applyTheme();
      };
      mediaQuery.addEventListener('change', handleMediaChange);
      return () => mediaQuery.removeEventListener('change', handleMediaChange);
    }
  }, [theme]);
  
  // Global Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchCache, setSearchCache] = useState<{
    customers: any[];
    products: any[];
    invoices: any[];
  } | null>(null);

  // Keyboard Shortcuts Toast/HUD
  const [shortcutToast, setShortcutToast] = useState<string | null>(null);

  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const showShortcutToast = (message: string) => {
    setShortcutToast(message);
    const id = setTimeout(() => {
      setShortcutToast(null);
    }, 2500);
    return id;
  };

  const fetchSearchCache = async () => {
    if (searchCache) return; // already loaded
    try {
      setIsSearchLoading(true);
      const [custSnap, prodSnap, salesSnap] = await Promise.all([
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'sales'))
      ]);

      const customers: any[] = [];
      custSnap.forEach(d => {
        const data = d.data();
        if (!data.isDeleted) {
          customers.push({
            id: d.id,
            name: data.name || '',
            shopName: data.shopName || '',
            route: data.route || '',
            phone: data.phone || ''
          });
        }
      });

      const products: any[] = [];
      prodSnap.forEach(d => {
        const data = d.data();
        if (!data.isDeleted) {
          products.push({
            id: d.id,
            name: data.name || '',
            brand: data.brand || '',
            banglaName: data.banglaName || ''
          });
        }
      });

      const invoices: any[] = [];
      salesSnap.forEach(d => {
        const data = d.data();
        invoices.push({
          id: d.id,
          invoiceNo: data.invoiceNo || d.id,
          shopName: data.shopName || '',
          route: data.route || '',
          date: data.date || ''
        });
      });

      setSearchCache({ customers, products, invoices });
    } catch (err) {
      console.error('Error loading search cache:', err);
    } finally {
      setIsSearchLoading(false);
    }
  };

  const getSearchResults = () => {
    if (!searchCache || !searchQuery.trim()) return [];
    const queryStr = searchQuery.toLowerCase().trim();
    const results: Array<{
      type: 'Customer' | 'Product' | 'Invoice';
      id: string;
      title: string;
      subtitle: string;
      searchTerm: string;
      tab: string;
    }> = [];

    // Filter customers
    searchCache.customers.forEach(c => {
      if (
        c.name.toLowerCase().includes(queryStr) ||
        c.shopName.toLowerCase().includes(queryStr) ||
        c.route.toLowerCase().includes(queryStr) ||
        c.phone.includes(queryStr)
      ) {
        results.push({
          type: 'Customer',
          id: c.id,
          title: c.shopName,
          subtitle: `${c.name} • ${c.route} ${c.phone ? `• ${c.phone}` : ''}`,
          searchTerm: c.shopName,
          tab: 'customers'
        });
      }
    });

    // Filter products
    searchCache.products.forEach(p => {
      if (
        p.name.toLowerCase().includes(queryStr) ||
        p.brand.toLowerCase().includes(queryStr) ||
        p.banglaName.toLowerCase().includes(queryStr)
      ) {
        results.push({
          type: 'Product',
          id: p.id,
          title: p.name,
          subtitle: `${p.brand || 'General Brand'} ${p.banglaName ? `• ${p.banglaName}` : ''}`,
          searchTerm: p.name,
          tab: 'products'
        });
      }
    });

    // Filter invoices
    searchCache.invoices.forEach(inv => {
      if (
        inv.invoiceNo.toLowerCase().includes(queryStr) ||
        inv.shopName.toLowerCase().includes(queryStr) ||
        inv.route.toLowerCase().includes(queryStr) ||
        inv.date.includes(queryStr)
      ) {
        results.push({
          type: 'Invoice',
          id: inv.id,
          title: `Invoice #${inv.invoiceNo}`,
          subtitle: `${inv.shopName} • ${inv.route} • ${inv.date}`,
          searchTerm: inv.invoiceNo,
          tab: 'sales'
        });
      }
    });

    // Return top 8 results
    return results.slice(0, 8);
  };

  const handleSearchResultClick = (item: { tab: string; searchTerm: string }) => {
    sessionStorage.setItem('dms_global_search_term', item.searchTerm);
    setActiveTab(item.tab);
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  // Click outside search dropdown effect
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchInputRef.current && !searchInputRef.current.contains(e.target as Node)) {
        const dropdown = document.getElementById('global-search-dropdown');
        if (dropdown && dropdown.contains(e.target as Node)) {
          return;
        }
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard Shortcuts Hook
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!currentUser) return;

      const isMeta = e.ctrlKey || e.metaKey;

      // Ctrl+S to save
      if (isMeta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        console.log('Shortcut: Ctrl+S triggered.');

        // Prioritize buttons in an open modal
        const openModal = document.querySelector('.fixed.inset-0, [role="dialog"], .modal');
        const root = openModal || document;

        const selectors = [
          'button[type="submit"]',
          '#save-button',
          '#submit-button',
          'button:not([disabled])'
        ];

        let clicked = false;
        for (const selector of selectors) {
          if (selector === 'button:not([disabled])') {
            const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
            const saveBtn = buttons.find(btn => {
              const text = btn.innerText.toLowerCase();
              return text.includes('save') || 
                     text.includes('submit') || 
                     text.includes('create') || 
                     text.includes('update') || 
                     text.includes('confirm') ||
                     text.includes('জমা দিন') || 
                     text.includes('সম্পন্ন') || 
                     text.includes('সংরক্ষণ') ||
                     text.includes('নিশ্চিত');
            });
            if (saveBtn) {
              saveBtn.click();
              clicked = true;
              showShortcutToast('সংরক্ষণ করা হচ্ছে... (Saving...)');
              break;
            }
          } else {
            const btn = root.querySelector<HTMLButtonElement>(selector);
            if (btn && !btn.disabled) {
              btn.click();
              clicked = true;
              showShortcutToast('সংরক্ষণ করা হচ্ছে... (Saving...)');
              break;
            }
          }
        }

        if (!clicked) {
          const firstForm = document.querySelector<HTMLFormElement>('form');
          if (firstForm) {
            firstForm.requestSubmit();
            clicked = true;
            showShortcutToast('সংরক্ষণ করা হচ্ছে... (Saving...)');
          }
        }
      }

      // Ctrl+P to print
      else if (isMeta && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        console.log('Shortcut: Ctrl+P triggered.');

        const printBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('button:not([disabled])'))
          .find(btn => {
            const text = btn.innerText.toLowerCase();
            return text.includes('print') || text.includes('প্রিন্ট') || text.includes('রশিদ');
          });

        if (printBtn) {
          printBtn.click();
          showShortcutToast('প্রিন্ট করা হচ্ছে... (Printing...)');
        } else {
          window.print();
          showShortcutToast('প্রিন্ট কমান্ড পাঠানো হয়েছে (Print command sent)');
        }
      }

      // '/' or '⌘K' or 'Ctrl+K' to search
      else {
        const activeEl = document.activeElement;
        const isInput = activeEl && (
          activeEl.tagName === 'INPUT' || 
          activeEl.tagName === 'TEXTAREA' || 
          (activeEl as HTMLElement).isContentEditable
        );

        if (!isInput) {
          if ((isMeta && e.key.toLowerCase() === 'k') || e.key === '/') {
            e.preventDefault();
            searchInputRef.current?.focus();
            fetchSearchCache();
            setShowSearchDropdown(true);
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [currentUser, searchCache]);

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [seedingInProgress, setSeedingInProgress] = useState(false);

  // QR Code login state variables
  const [isQrLoginMode, setIsQrLoginMode] = useState(false);
  const [qrScanSuccessMsg, setQrScanSuccessMsg] = useState('');
  const [qrScanErrorMsg, setQrScanErrorMsg] = useState('');
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // Native double beep chime using Web Audio API
  const playVerificationChirp = (success = true) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      if (success) {
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(880, now); // A5
        gain1.gain.setValueAtTime(0.08, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.1);
        
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(1109.73, now + 0.12); // C#6
        gain2.gain.setValueAtTime(0.08, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.22);
      } else {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(150, now); // Low buzz
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {
      console.warn('Sound beep ignored:', e);
    }
  };

  const handleQrCodeScanned = async (decodedText: string) => {
    try {
      let usernameToAuth = '';
      
      try {
        const parsed = JSON.parse(decodedText);
        if (parsed && typeof parsed === 'object') {
          usernameToAuth = parsed.username || '';
        }
      } catch (e) {
        usernameToAuth = decodedText.trim();
      }

      if (!usernameToAuth) {
        playVerificationChirp(false);
        setQrScanErrorMsg("Invalid QR Code payload format. (ভুল কিউআর কোড ফরম্যাট)");
        return;
      }

      const inputUsername = usernameToAuth.toLowerCase().trim();
      setQrScanSuccessMsg(`Scanned: "${inputUsername}". Verifying employee profile...`);
      setQrScanErrorMsg('');

      // 1. Instant local fallback for admin bypass
      if (inputUsername === 'admin') {
        const localAdmin: UserProfile = {
          id: 'admin_local_fallback_uid',
          username: 'admin',
          name: 'Super Admin (Samira Traders)',
          role: UserRole.SUPER_ADMIN,
          phone: '01712345678',
          status: 'ACTIVE',
          createdAt: new Date().toISOString()
        };
        playVerificationChirp(true);
        localStorage.setItem('samira_current_user_name', localAdmin.name);
        setCurrentUser(localAdmin);
        setActiveTab('dashboard');
        setIsQrLoginMode(false);
        return;
      }

      // 2. Query Firestore for other staff
      const usersColRef = collection(db, 'users');
      const q = query(usersColRef, where('username', '==', inputUsername));
      const snap = await getDocs(q);

      if (snap.empty) {
        playVerificationChirp(false);
        setQrScanErrorMsg(`Employee profile "${inputUsername}" not found. (এই কর্মচারী নিবন্ধিত নয়)`);
        setQrScanSuccessMsg('');
        return;
      }

      let matchedUser: UserProfile | null = null;
      snap.forEach(d => {
        const profile = d.data() as UserProfile;
        matchedUser = profile;
      });

      if (matchedUser) {
        playVerificationChirp(true);
        localStorage.setItem('samira_current_user_name', (matchedUser as any).name || (matchedUser as any).username || 'Admin');
        setCurrentUser(matchedUser);
        setActiveTab('dashboard');
        setIsQrLoginMode(false);
      } else {
        playVerificationChirp(false);
        setQrScanErrorMsg('Verification failed. Scanned profile is inactive.');
        setQrScanSuccessMsg('');
      }
    } catch (err) {
      console.error("QR Scan auth error:", err);
      playVerificationChirp(false);
      setQrScanErrorMsg('Verification system failed. Please use manual entry.');
    }
  };

  const html5QrCodeRef = React.useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (!isQrLoginMode) {
      if (html5QrCodeRef.current) {
        const scannerInstance = html5QrCodeRef.current;
        if (scannerInstance.isScanning) {
          scannerInstance.stop()
            .then(() => {
              console.log("Scanner stopped successfully");
              setIsCameraActive(false);
            })
            .catch(err => console.error("Error stopping scanner", err));
        }
        html5QrCodeRef.current = null;
      }
      return;
    }

    setQrScanSuccessMsg('');
    setQrScanErrorMsg('');
    setIsCameraStarting(true);

    const timer = setTimeout(() => {
      try {
        const html5QrCode = new Html5Qrcode("qr-reader");
        html5QrCodeRef.current = html5QrCode;

        html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 220, height: 220 },
          },
          (decodedText) => {
            handleQrCodeScanned(decodedText);
          },
          () => {
            // silent scan tick
          }
        )
        .then(() => {
          setIsCameraStarting(false);
          setIsCameraActive(true);
        })
        .catch(err => {
          console.warn("Failed to start camera feed", err);
          setIsCameraStarting(false);
          setIsCameraActive(false);
          setQrScanErrorMsg("Camera access denied or hardware not found. Please use the simulator buttons below to test! (ক্যামেরা পাওয়া যায়নি)");
        });
      } catch (e) {
        console.error("Scanner setup error", e);
        setIsCameraStarting(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      if (html5QrCodeRef.current) {
        const scannerInstance = html5QrCodeRef.current;
        if (scannerInstance.isScanning) {
          scannerInstance.stop()
            .then(() => console.log("Scanner cleaned up"))
            .catch(err => console.error("Cleanup stop failed", err));
        }
      }
    };
  }, [isQrLoginMode]);

  // Notifications states
  const [lowStockCount, setLowStockCount] = useState<number>(0);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!currentUser) {
      setLowStockProducts([]);
      setLowStockCount(0);
      return;
    }

    const fetchProductsForNotifications = async () => {
      try {
        const snap = await getDocs(collection(db, 'products'));
        const list: any[] = [];
        snap.forEach(d => {
          const item = d.data();
          if (!item.isDeleted) {
            list.push(item);
          }
        });

        const lowStock = list.filter(p => p.stockCount <= (p.reorderLevel !== undefined ? p.reorderLevel : (p.minimumStock !== undefined ? p.minimumStock : 10)));
        setLowStockProducts(lowStock);
        setLowStockCount(lowStock.length);
      } catch (err) {
        console.error("Error fetching products for notification:", err);
      }
    };

    fetchProductsForNotifications();

    // Set up an interval to refresh every 30 seconds
    const interval = setInterval(fetchProductsForNotifications, 30000);
    return () => clearInterval(interval);
  }, [currentUser, activeTab]);

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

          {isQrLoginMode ? (
            <div className="space-y-4 animate-fadeIn">
              <div className="text-center">
                <h3 className="text-xs font-extrabold text-blue-400 flex items-center justify-center space-x-2 uppercase tracking-widest">
                  <Camera className="w-4 h-4 text-blue-400 animate-pulse" />
                  <span>Optical Badge Authenticator</span>
                </h3>
                <p className="text-[10px] text-slate-400 mt-1">Hold your employee QR ID card inside the scanner frame.</p>
              </div>

              {/* QR Reader Camera Canvas Frame */}
              <div className="relative mx-auto w-64 h-64 bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden flex items-center justify-center shadow-2xl">
                {isCameraStarting && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 z-20 space-y-3">
                    <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                    <span className="text-[10px] font-bold text-slate-400 font-mono">Activating camera feed...</span>
                  </div>
                )}

                {/* Real Html5Qrcode DOM target */}
                <div id="qr-reader" className="w-full h-full object-cover"></div>

                {/* Cyberpunk grid / green crosshair overlays */}
                {isCameraActive && (
                  <div className="absolute inset-0 pointer-events-none border-2 border-emerald-500/20 rounded-2xl z-10">
                    <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-emerald-500"></div>
                    <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-emerald-500"></div>
                    <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-emerald-500"></div>
                    <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-emerald-500"></div>
                    {/* Laser line moving using native index.css scan animation */}
                    <div className="w-full h-[2px] bg-emerald-400 shadow-[0_0_12px_#34d399] absolute top-1/2 left-0 pointer-events-none animate-[scan_2s_infinite_ease-in-out]"></div>
                  </div>
                )}
              </div>

              {qrScanSuccessMsg && (
                <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-[11px] rounded-xl text-center font-bold">
                  {qrScanSuccessMsg}
                </div>
              )}

              {qrScanErrorMsg && (
                <div className="p-3 bg-rose-950/40 border border-rose-800/50 text-rose-200 text-[11px] rounded-xl text-center font-medium">
                  {qrScanErrorMsg}
                </div>
              )}

              {/* ID Badge Simulator Box */}
              <div className="bg-slate-950 border border-slate-850 p-4 rounded-2xl space-y-3">
                <div className="text-center">
                  <span className="text-[10px] text-blue-400 font-extrabold uppercase tracking-wider block">ID Card Badge Simulator</span>
                  <p className="text-[9px] text-slate-500 mt-0.5">Click a virtual card below to simulate reading a physical badge.</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleQrCodeScanned('admin')}
                    type="button"
                    className="p-2 bg-slate-900 border border-slate-800 hover:border-blue-500/60 rounded-xl text-center cursor-pointer hover:bg-slate-850 transition-all focus:outline-none group"
                  >
                    <span className="text-[9px] font-extrabold block text-slate-300 group-hover:text-blue-400">ADMIN</span>
                    <span className="text-[8px] font-mono text-slate-500 block">ID: admin</span>
                  </button>

                  <button
                    onClick={() => handleQrCodeScanned('manager')}
                    type="button"
                    className="p-2 bg-slate-900 border border-slate-800 hover:border-emerald-500/60 rounded-xl text-center cursor-pointer hover:bg-slate-850 transition-all focus:outline-none group"
                  >
                    <span className="text-[9px] font-extrabold block text-slate-300 group-hover:text-emerald-400">MANAGER</span>
                    <span className="text-[8px] font-mono text-slate-500 block">ID: manager</span>
                  </button>

                  <button
                    onClick={() => handleQrCodeScanned('dsr1')}
                    type="button"
                    className="p-2 bg-slate-900 border border-slate-800 hover:border-purple-500/60 rounded-xl text-center cursor-pointer hover:bg-slate-850 transition-all focus:outline-none group"
                  >
                    <span className="text-[9px] font-extrabold block text-slate-300 group-hover:text-purple-400">DSR STAFF</span>
                    <span className="text-[8px] font-mono text-slate-500 block">ID: dsr1</span>
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsQrLoginMode(false)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl text-xs transition-colors cursor-pointer border border-slate-700/50"
              >
                Return to Password Login (পাসওয়ার্ড দিয়ে লগইন)
              </button>
            </div>
          ) : (
            <>
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

              {/* Instant QR Login switch button */}
              <button
                type="button"
                onClick={() => setIsQrLoginMode(true)}
                className="w-full bg-gradient-to-r from-blue-950/50 to-indigo-950/50 hover:from-blue-950 hover:to-indigo-950 text-blue-400 font-bold py-3.5 rounded-xl text-xs transition-all flex items-center justify-center space-x-2.5 border border-blue-900/40 cursor-pointer shadow-inner mt-4"
              >
                <QrCode className="w-4 h-4 animate-pulse text-blue-400" />
                <span>Scan Employee ID Card (কিউআর আইডি স্ক্যান করুন)</span>
              </button>

              {/* Test credentials hints */}
              <div className="border-t border-slate-800/60 pt-4 text-center space-y-1.5">
                <span className="text-[10px] text-slate-500 font-bold uppercase block tracking-wider">Default Developer Sandbox Login</span>
                <div className="flex justify-center items-center space-x-3 text-[11px]">
                  <span className="text-slate-400">User: <strong className="font-mono text-blue-400 bg-slate-950 px-1.5 py-0.5 rounded">admin</strong></span>
                  <span className="text-slate-400">Pass: <strong className="font-mono text-blue-400 bg-slate-950 px-1.5 py-0.5 rounded">admin123</strong></span>
                </div>
              </div>
            </>
          )}

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
            <SettingsView 
              currentUser={currentUser} 
              theme={theme}
              setTheme={(newTheme) => {
                setTheme(newTheme);
                localStorage.setItem('dms_theme', newTheme);
              }}
            />
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
      <main className="flex-1 p-4 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-6 relative">
        
        {/* Global DMS Header Bar */}
        <div className="flex justify-between items-center bg-white px-5 py-4 rounded-2xl border border-gray-100 shadow-sm relative">
          <div className="flex items-center space-x-3 shrink-0">
            <span className="hidden md:inline-block font-extrabold text-slate-800 tracking-tight text-base">SAMIRA TRADERS (DMS)</span>
            <span className="md:hidden font-black text-sm text-slate-800">SAMIRA DMS</span>
            <span className="h-4 w-[1px] bg-slate-200 hidden md:inline-block"></span>
            <span className="hidden lg:inline-block text-[11px] font-medium text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
              Logged in: <strong className="text-slate-600 font-bold">{currentUser.name}</strong> ({currentUser.role})
            </span>
          </div>

          {/* Global Quick Search Bar */}
          <div className="relative flex-1 max-w-sm mx-4 hidden md:block" id="global-search-container">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="মেমো, দোকান বা পণ্য খুঁজুন... (Search Customers, Products, Invoices...)"
                value={searchQuery}
                onFocus={() => {
                  fetchSearchCache();
                  setShowSearchDropdown(true);
                }}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 pl-9 pr-12 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500/20 transition-all"
              />
              <span className="absolute right-3 top-2.5 px-1.5 py-0.5 text-[9px] font-bold text-slate-400 bg-slate-200/60 rounded-md border border-slate-200 pointer-events-none font-mono">
                /
              </span>
            </div>

            {/* Dropdown results */}
            {showSearchDropdown && (
              <div 
                id="global-search-dropdown"
                className="absolute left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-96 flex flex-col divide-y divide-slate-100"
              >
                {isSearchLoading ? (
                  <div className="p-4 text-center text-slate-400 text-xs flex items-center justify-center space-x-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
                    <span>Indexing data store...</span>
                  </div>
                ) : getSearchResults().length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-xs">
                    {searchQuery.trim() ? (
                      <span>কোনো ফলাফল পাওয়া যায়নি (No matches found)</span>
                    ) : (
                      <span className="font-medium text-slate-500">টাইপ করে খুঁজুন: কাস্টমার, প্রোডাক্ট, বা মেমো নম্বর</span>
                    )}
                  </div>
                ) : (
                  <div className="overflow-y-auto py-1 flex-1">
                    <div className="px-3.5 py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50">
                      অনুসন্ধান ফলাফল (Search Results)
                    </div>
                    {getSearchResults().map((item) => {
                      const TypeIcon = item.type === 'Customer' ? User : item.type === 'Product' ? Database : FileText;
                      return (
                        <button
                          key={`${item.type}-${item.id}`}
                          onClick={() => handleSearchResultClick(item)}
                          className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors flex items-start space-x-3 cursor-pointer group"
                        >
                          <span className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                            item.type === 'Customer' ? 'bg-indigo-50 text-indigo-600' :
                            item.type === 'Product' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                          }`}>
                            <TypeIcon className="w-3.5 h-3.5" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-bold text-slate-800 truncate group-hover:text-blue-600 transition-colors">{item.title}</h4>
                              <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ml-1.5 ${
                                item.type === 'Customer' ? 'bg-indigo-100 text-indigo-800' :
                                item.type === 'Product' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {item.type}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">{item.subtitle}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            {/* Real-time active status */}
            <span className="hidden sm:inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping mr-1.5"></span>
              Live Synced
            </span>

            {/* Notification Bell (Only for Admins/Managers) */}
            {(currentUser.role === 'Super Admin' || currentUser.role === 'Manager') && (
              <button
                onClick={() => setIsNotificationDrawerOpen(true)}
                id="bell-notification-btn"
                className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-slate-100 group"
                aria-label="View Stock Notifications"
              >
                <Bell className={`w-5.5 h-5.5 ${lowStockCount > 0 ? 'text-amber-500 animate-pulse' : 'text-slate-400'}`} />
                {lowStockCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white ring-2 ring-white">
                    {lowStockCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Dynamic View Panel */}
        <div className="animate-fade-in" id="active-view-viewport">
          {renderViewContent()}
        </div>

      </main>

      {/* Low Stock Notification Drawer / Center Overlay */}
      {isNotificationDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" id="notification-center-drawer">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setIsNotificationDrawerOpen(false)} />
          
          <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
            <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col h-full border-l border-slate-100 animate-slide-in">
              {/* Drawer Header */}
              <div className="px-6 py-5 bg-gradient-to-r from-blue-900 to-blue-950 text-white flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <Bell className="w-5 h-5 text-amber-400" />
                  <div>
                    <h2 className="text-sm font-black tracking-wider uppercase">Notification Center</h2>
                    <p className="text-[10px] text-blue-200">SAMIRA TRADERS System Alerts</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsNotificationDrawerOpen(false)}
                  className="p-1 rounded-lg hover:bg-blue-850 transition-colors text-blue-200 hover:text-white cursor-pointer focus:outline-none"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Inventory Low Stock Alerts</span>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-black rounded-full">
                    {lowStockCount} Alerts
                  </span>
                </div>

                {lowStockProducts.length === 0 ? (
                  <div className="text-center py-12 space-y-3">
                    <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                      <Check className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-700">All Stocks Healthy</p>
                      <p className="text-[10px] text-slate-400">All products are currently above their reorder point thresholds.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {lowStockProducts.map((prod) => {
                      const threshold = prod.reorderLevel !== undefined ? prod.reorderLevel : (prod.minimumStock !== undefined ? prod.minimumStock : 10);
                      const isSevere = prod.stockCount <= threshold * 0.5;
                      return (
                        <div
                          key={prod.id}
                          className={`p-3.5 rounded-xl border transition-all flex flex-col gap-2 ${
                            isSevere
                              ? 'bg-rose-50/40 border-rose-100 hover:bg-rose-50/60'
                              : 'bg-amber-50/30 border-amber-100 hover:bg-amber-50/50'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="text-xs font-extrabold text-slate-800 leading-tight">{prod.name}</h4>
                              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Brand: {prod.brand || 'General Brand'}</p>
                            </div>
                            <span className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-black shrink-0 ${
                              isSevere ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {prod.stockCount} Pcs left
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[10px] border-t border-slate-100/60 pt-2 mt-0.5">
                            <span className="text-slate-500">Reorder point: <strong className="text-slate-700">{threshold} Pcs</strong></span>
                            <span className={`font-bold ${isSevere ? 'text-rose-600' : 'text-amber-600'}`}>
                              {isSevere ? 'CRITICALLY LOW' : 'BELOW REORDER POINT'}
                            </span>
                          </div>

                          <button
                            onClick={() => {
                              setIsNotificationDrawerOpen(false);
                              setActiveTab('purchases');
                            }}
                            className="mt-1 w-full bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold py-1.5 rounded-lg text-center transition-all cursor-pointer shadow-sm"
                          >
                            Generate Reorder Purchase
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Drawer Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100">
                <button
                  onClick={() => {
                    setIsNotificationDrawerOpen(false);
                    setActiveTab('inventory');
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-xl text-center transition-all cursor-pointer shadow-sm"
                >
                  Go to Stock Management
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Keyboard Shortcuts HUD */}
      {shortcutToast && (
        <div className="fixed bottom-6 right-6 z-[9999] bg-slate-900/95 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-800/80 flex items-center space-x-2.5 animate-slide-up backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
          <span className="text-xs font-bold tracking-tight">{shortcutToast}</span>
        </div>
      )}
    </div>
  );
}
