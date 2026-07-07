/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  Truck, 
  Package, 
  Warehouse, 
  FileSpreadsheet, 
  ShoppingBag, 
  DollarSign, 
  FileText, 
  Settings as SettingsIcon, 
  LogOut, 
  Menu, 
  X,
  Map,
  BadgeCent,
  TrendingUp,
  Receipt,
  ClipboardList,
  Shield,
  Gift,
  Coins
} from 'lucide-react';
import { UserRole, UserProfile } from '../types';

interface SidebarProps {
  user: UserProfile;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
}

export default function Sidebar({ user, activeTab, setActiveTab, onLogout }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const getNavItems = () => {
    const items = [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ALL'] },
      { id: 'inventory', label: 'Inventory', icon: Warehouse, roles: ['Super Admin', 'Manager', 'Sales Manager'] },
      { id: 'sales', label: 'Sales', icon: FileSpreadsheet, roles: ['Super Admin', 'Manager', 'Sales Manager', 'DSR'] },
      { id: 'purchases', label: 'Purchases', icon: ShoppingBag, roles: ['Super Admin', 'Manager'] },
      { id: 'collections', label: 'Collections', icon: DollarSign, roles: ['Super Admin', 'Manager', 'Sales Manager', 'DSR', 'Collection Officer', 'Accountant'] },
      { id: 'dsr', label: 'DSR Panel', icon: ClipboardList, roles: ['Super Admin', 'Manager', 'Sales Manager', 'DSR'] },
      { id: 'ledgers', label: 'Party Ledgers', icon: Receipt, roles: ['Super Admin', 'Manager', 'Sales Manager', 'DSR', 'Collection Officer', 'Accountant'] },
      { id: 'claims', label: 'Supplier Claims', icon: Gift, roles: ['Super Admin', 'Manager'] },
      { id: 'reports', label: 'Reports', icon: TrendingUp, roles: ['Super Admin', 'Manager', 'Sales Manager', 'Accountant'] },
      { id: 'settings', label: 'Settings', icon: SettingsIcon, roles: ['Super Admin', 'Manager'] },
    ];

    if (user.role === UserRole.SUPER_ADMIN) {
      return items;
    }

    return items.filter(item => item.roles.includes('ALL') || item.roles.includes(user.role));
  };

  const navItems = getNavItems();

  const handleNavClick = (id: string) => {
    setActiveTab(id);
    setIsOpen(false);
  };

  return (
    <>
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between bg-blue-900 text-white px-4 py-3 sticky top-0 z-30 shadow-md">
        <div className="flex items-center space-x-2">
          <Warehouse className="w-6 h-6 text-blue-300" />
          <span className="font-bold tracking-wider text-base">SAMIRA DMS</span>
        </div>
        <button 
          onClick={() => setIsOpen(!isOpen)} 
          className="p-1 hover:bg-blue-800 rounded focus:outline-none"
          aria-label="Toggle menu"
          id="sidebar-toggle-btn"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Backdrop for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-20 md:hidden" 
          onClick={() => setIsOpen(false)}
          id="sidebar-backdrop"
        />
      )}

      {/* Sidebar navigation container */}
      <aside 
        id="app-sidebar"
        className={`fixed md:sticky top-[52px] md:top-0 left-0 h-[calc(100vh-52px)] md:h-screen w-64 bg-blue-950 text-slate-100 flex flex-col z-20 transition-transform duration-300 md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } border-r border-blue-900`}
      >
        {/* Brand Head - Desktop Only */}
        <div className="hidden md:flex items-center space-x-3 px-6 py-5 border-b border-blue-900">
          <Warehouse className="w-7 h-7 text-blue-400" />
          <div>
            <h1 className="font-extrabold text-lg tracking-wide leading-none text-white">SAMIRA TRADERS</h1>
            <span className="text-[10px] text-blue-300 font-mono tracking-widest">MANAGEMENT SYSTEM</span>
          </div>
        </div>

        {/* User profile banner */}
        <div className="px-6 py-4 bg-blue-900/40 border-b border-blue-900/80">
          <p className="text-xs text-blue-300 font-medium">Signed in as</p>
          <p className="font-bold text-white text-sm truncate mt-0.5">{user.name}</p>
          <span className="inline-block px-2 py-0.5 mt-1.5 text-[10px] font-semibold tracking-wider text-blue-100 bg-blue-600 rounded">
            {user.role}
          </span>
          <div className="flex items-center space-x-1 mt-2 text-[10px] text-blue-300 font-medium">
            <Shield className="w-3 h-3 text-emerald-400 shrink-0" />
            <span>Secure session (30m idle limit)</span>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scrollbar-thin scrollbar-thumb-blue-900 scrollbar-track-transparent">
          {navItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`sidebar-tab-${item.id}`}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  isActive 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-slate-300 hover:bg-blue-900/60 hover:text-white'
                }`}
              >
                <IconComponent className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer logout */}
        <div className="p-4 border-t border-blue-900 bg-blue-950">
          <button
            onClick={() => {
              onLogout();
              setIsOpen(false);
            }}
            id="sidebar-logout-btn"
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium text-rose-300 hover:bg-rose-950/40 hover:text-rose-200 transition-colors cursor-pointer"
          >
            <LogOut className="w-5 h-5 shrink-0 text-rose-400" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
