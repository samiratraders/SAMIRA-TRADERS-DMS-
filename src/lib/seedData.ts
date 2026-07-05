/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from './firebase';
import { 
  collection, 
  getDocs, 
  writeBatch, 
  doc, 
  query, 
  limit 
} from 'firebase/firestore';
import { UserRole } from '../types';

export const seedSampleData = async () => {
  try {
    const companiesCol = collection(db, 'companies');
    const snapshot = await getDocs(query(companiesCol, limit(1)));
    if (!snapshot.empty) {
      console.log('Database already has data. Skipping sample seeding.');
      return;
    }

    console.log('Seeding sample datasets to Firestore...');
    const batch = writeBatch(db);

    // 1. Companies
    const companies = [
      { id: 'comp-unilever', name: 'Unilever Bangladesh', code: 'ULB', contactPerson: 'Arif Rahman', phone: '01711122233', address: 'Gulshan, Dhaka', createdAt: new Date().toISOString() },
      { id: 'comp-nestle', name: 'Nestlé Bangladesh', code: 'NST', contactPerson: 'Sajid Hasan', phone: '01722233344', address: 'Tejgaon, Dhaka', createdAt: new Date().toISOString() },
      { id: 'comp-pran', name: 'PRAN Foods Ltd', code: 'PRN', contactPerson: 'Moinul Islam', phone: '01733344455', address: 'Badda, Dhaka', createdAt: new Date().toISOString() }
    ];
    companies.forEach(c => batch.set(doc(db, 'companies', c.id), c));

    // 2. Suppliers
    const suppliers = [
      { id: 'sup-1', name: 'Karim Distributors', phone: '01911223344', address: 'Barishal Sadar', companyId: 'comp-unilever', companyName: 'Unilever Bangladesh', createdAt: new Date().toISOString() },
      { id: 'sup-2', name: 'Sarker Enterprises', phone: '01811223344', address: 'Barguna Bazar', companyId: 'comp-nestle', companyName: 'Nestlé Bangladesh', createdAt: new Date().toISOString() },
      { id: 'sup-3', name: 'Maa Agency', phone: '01511223344', address: 'Amtali Road', companyId: 'comp-pran', companyName: 'PRAN Foods Ltd', createdAt: new Date().toISOString() }
    ];
    suppliers.forEach(s => batch.set(doc(db, 'suppliers', s.id), s));

    // 3. Sub Depots
    const subDepots = [
      { id: 'depot-1', name: 'Amtali Sub Depot', location: 'Amtali, Barguna', managerId: 'mgr-1', managerName: 'Habibur Rahman', cartonCommissionRate: 15, createdAt: new Date().toISOString() },
      { id: 'depot-2', name: 'Patharghata Sub Depot', location: 'Patharghata, Barguna', managerId: 'mgr-2', managerName: 'Rashedul Islam', cartonCommissionRate: 20, createdAt: new Date().toISOString() }
    ];
    subDepots.forEach(d => batch.set(doc(db, 'subDepots', d.id), d));

    // 4. Products
    const products = [
      // Unilever Products
      { id: 'prod-ul-lux', name: 'Lux Soft Touch 100g', companyId: 'comp-unilever', companyName: 'Unilever Bangladesh', purchasePrice: 42, retailPrice: 48, packSize: '100g', cartonSize: 48, cartonPrice: 42 * 48, stockCount: 240, subDepotStocks: { 'depot-1': 48, 'depot-2': 48 }, createdAt: new Date().toISOString() },
      { id: 'prod-ul-wheel', name: 'Wheel Soap 150g', companyId: 'comp-unilever', companyName: 'Unilever Bangladesh', purchasePrice: 18, retailPrice: 22, packSize: '150g', cartonSize: 100, cartonPrice: 18 * 100, stockCount: 500, subDepotStocks: { 'depot-1': 100, 'depot-2': 100 }, createdAt: new Date().toISOString() },
      // Nestle Products
      { id: 'prod-ns-maggi', name: 'Maggi Noodles 4-Pack', companyId: 'comp-nestle', companyName: 'Nestlé Bangladesh', purchasePrice: 62, retailPrice: 70, packSize: '4-Pack', cartonSize: 24, cartonPrice: 62 * 24, stockCount: 120, subDepotStocks: { 'depot-1': 24, 'depot-2': 12 }, createdAt: new Date().toISOString() },
      { id: 'prod-ns-nescafe', name: 'Nescafe Classic 50g', companyId: 'comp-nestle', companyName: 'Nestlé Bangladesh', purchasePrice: 145, retailPrice: 165, packSize: '50g', cartonSize: 12, cartonPrice: 145 * 12, stockCount: 60, subDepotStocks: { 'depot-1': 12, 'depot-2': 6 }, createdAt: new Date().toISOString() },
      // Pran Products
      { id: 'prod-pr-potata', name: 'Pran Potata Biscuit 300g', companyId: 'comp-pran', companyName: 'PRAN Foods Ltd', purchasePrice: 28, retailPrice: 35, packSize: '300g', cartonSize: 36, cartonPrice: 28 * 36, stockCount: 180, subDepotStocks: { 'depot-1': 36, 'depot-2': 36 }, createdAt: new Date().toISOString() },
      { id: 'prod-pr-mango', name: 'Pran Mango Juice 250ml', companyId: 'comp-pran', companyName: 'PRAN Foods Ltd', purchasePrice: 16, retailPrice: 20, packSize: '250ml', cartonSize: 24, cartonPrice: 16 * 24, stockCount: 300, subDepotStocks: { 'depot-1': 48, 'depot-2': 24 }, createdAt: new Date().toISOString() }
    ];
    products.forEach(p => batch.set(doc(db, 'products', p.id), p));

    // 5. Customers
    const customers = [
      {
        id: 'cust-bismillah',
        name: 'Bismillah Store',
        shopName: 'Bismillah Variety Store',
        phone: '01712345671',
        address: 'Barguna Sadar Road',
        route: 'Barguna Sadar Route',
        area: 'Barguna Town',
        dues: {
          'comp-unilever': 500,
          'comp-nestle': 200,
          'comp-pran': 300
        },
        totalDue: 1000,
        createdAt: new Date().toISOString()
      },
      {
        id: 'cust-mayer-doa',
        name: 'Mayer Doa General Store',
        shopName: 'Mayer Doa General Store',
        phone: '01712345672',
        address: 'Amtali Bus Stand',
        route: 'Amtali Route',
        area: 'Amtali Bazar',
        dues: {
          'comp-unilever': 1200,
          'comp-nestle': 800,
          'comp-pran': 0
        },
        totalDue: 2000,
        createdAt: new Date().toISOString()
      },
      {
        id: 'cust-bhai-bhai',
        name: 'Bhai Bhai Grocery',
        shopName: 'Bhai Bhai Traders',
        phone: '01712345673',
        address: 'Town Hall Market',
        route: 'Barguna Sadar Route',
        area: 'Town Hall Area',
        dues: {
          'comp-unilever': 0,
          'comp-nestle': 400,
          'comp-pran': 600
        },
        totalDue: 1000,
        createdAt: new Date().toISOString()
      }
    ];
    customers.forEach(cust => batch.set(doc(db, 'customers', cust.id), cust));

    // 6. Pre-populate some Ledger Entries for the seed customers
    customers.forEach(cust => {
      Object.entries(cust.dues).forEach(([compId, dueAmt]) => {
        if (dueAmt > 0) {
          const compName = companies.find(c => c.id === compId)?.name || 'Unknown Company';
          const ledgerId = `ledger-${cust.id}-${compId}-init`;
          batch.set(doc(db, 'ledgers', ledgerId), {
            id: ledgerId,
            customerId: cust.id,
            companyId: compId,
            companyName: compName,
            type: 'INVOICE',
            referenceId: 'init-due',
            referenceNo: 'INIT-DUE-001',
            date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days ago
            amount: dueAmt,
            balanceAfter: dueAmt,
            createdAt: new Date().toISOString()
          });
        }
      });
    });

    // 7. Some basic Expenses
    const expenses = [
      { id: 'exp-1', title: 'Amtali Route Van Hire', category: 'ROUTE', amount: 800, description: 'Daily van hire for Amtali route delivery', date: new Date().toISOString().split('T')[0], routeName: 'Amtali Route', createdAt: new Date().toISOString() },
      { id: 'exp-2', title: 'Office Assistant Salary', category: 'SALARY', amount: 12000, description: 'Monthly salary for helper Sajib', date: new Date().toISOString().split('T')[0], staffName: 'Sajib (Helper)', createdAt: new Date().toISOString() },
      { id: 'exp-3', title: 'Office Electricity Bill', category: 'OTHER', amount: 2400, description: 'Office electric bill June 2026', date: new Date().toISOString().split('T')[0], createdAt: new Date().toISOString() }
    ];
    expenses.forEach(e => batch.set(doc(db, 'expenses', e.id), e));

    // 8. Default System Settings
    const settings = {
      companyName: 'SAMIRA TRADERS',
      address: 'Barguna Sadar, Barguna, Barishal',
      contact: '01712-345678',
      email: 'samiratraders.barguna@gmail.com',
      rolePermissions: {
        'Super Admin': ['ALL'],
        'Manager': ['DASHBOARD', 'CUSTOMER', 'SUPPLIER', 'COMPANY', 'PRODUCT', 'INVENTORY', 'SALES', 'PURCHASE', 'COLLECTION', 'EXPENSE', 'REPORTS', 'SUBDEPOT'],
        'Sales Manager': ['DASHBOARD', 'CUSTOMER', 'PRODUCT', 'INVENTORY', 'SALES', 'COLLECTION', 'REPORTS'],
        'DSR': ['CUSTOMER', 'SALES', 'COLLECTION'],
        'Collection Officer': ['CUSTOMER', 'COLLECTION'],
        'Accountant': ['DASHBOARD', 'REPORTS', 'EXPENSE', 'COLLECTION']
      }
    };
    batch.set(doc(db, 'settings', 'app_config'), settings);

    await batch.commit();
    console.log('Sample datasets seeded successfully.');
  } catch (error) {
    console.error('Error seeding sample data:', error);
  }
};
