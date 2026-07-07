/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum UserRole {
  SUPER_ADMIN = 'Super Admin',
  MANAGER = 'Manager',
  SALES_MANAGER = 'Sales Manager',
  DSR = 'DSR',
  COLLECTION_OFFICER = 'Collection Officer',
  ACCOUNTANT = 'Accountant'
}

export interface UserProfile {
  id: string; // matches auth UID or generated Username ID
  username: string;
  name: string;
  role: UserRole;
  phone: string;
  status: 'ACTIVE' | 'INACTIVE';
  email?: string;
  password?: string;
  subDepotId?: string; // If associated with a sub-depot
  outstandingShortage?: number; // Accumulated shortages/dues for DSR/Manager
  ledgerBalance?: number;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  code: string;
  contactPerson?: string;
  phone?: string;
  address?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address: string;
  companyId: string; // Supplier of which company
  companyName: string;
  outstandingBalance?: number;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  shopName: string;
  phone: string;
  address: string;
  route: string;
  area: string;
  dues: { [companyId: string]: number }; // Company Wise Ledger
  totalDue: number;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  purchasePrice: number;
  retailPrice: number;
  packSize: string; // e.g., "500ml", "1kg"
  cartonSize: number; // units per carton
  cartonPrice: number; // purchasePrice * cartonSize or custom
  stockCount: number; // Primary depot stock
  subDepotStocks: { [subDepotId: string]: number }; // Stocks in sub-depots
  createdAt: string;
  category?: string;
  brand?: string;
  supplierId?: string;
  supplierName?: string;
  barcode?: string;
  sku?: string;
  unit?: string;
  wholesalePrice?: number;
  subDistributorPrice?: number;
  dealerPrice?: number;
  unitMargin?: number;
  cartonMargin?: number;
  openingStock?: number;
  damageStock?: number;
  minimumStock?: number;
  reorderLevel?: number;
  productImage?: string;
  isDeleted?: boolean;
  history?: Array<{
    date: string;
    action: string;
    user: string;
    details: string;
  }>;
}

export interface InvoiceItem {
  productId: string;
  name: string;
  qty: number; // in units
  price: number; // retail price
  total: number;
  cartonQty: number; // calculated: qty / cartonSize
}

export interface SalesInvoice {
  id: string;
  invoiceNo: string;
  date: string;
  customerId: string;
  customerName: string;
  shopName: string;
  companyId: string;
  companyName: string;
  items: InvoiceItem[];
  subTotal: number;
  discount: number;
  grandTotal: number;
  paymentReceived: number;
  paymentMethod: 'CASH' | 'MOBILE_BANKING' | 'CHEQUE' | 'DUE';
  route: string;
  area: string;
  salesManagerId?: string;
  salesManagerName?: string;
  dsrId?: string;
  dsrName?: string;
  subDepotId?: string; // If sold from sub-depot
  status: 'PAID' | 'PARTIAL' | 'DUE';
  createdAt: string;
}

export interface PurchaseItem {
  productId: string;
  name: string;
  qty: number; // in units (or cartons, but stored as units)
  qtyCarton: number;
  price: number; // purchase price per unit
  total: number;
}

export interface Purchase {
  id: string;
  purchaseNo: string;
  date: string;
  supplierId: string;
  supplierName: string;
  companyId: string;
  companyName: string;
  items: PurchaseItem[];
  grandTotal: number;
  paymentPaid: number;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CREDIT';
  status: 'RECEIVED' | 'ORDERED';
  createdAt: string;
  discount?: number;
  transportCost?: number;
  laborCost?: number;
  extraCost?: number;
  others?: number;
  finalPurchaseCost?: number;
  isDeleted?: boolean;
}

export interface Collection {
  id: string;
  collectionNo: string;
  date: string;
  customerId: string;
  customerName: string;
  shopName: string;
  companyId: string;
  companyName: string;
  amount: number;
  paymentMethod: 'CASH' | 'MOBILE_BANKING' | 'CHEQUE';
  referenceNo?: string;
  route: string;
  area: string;
  collectedById: string; // User ID (e.g., Collection Officer or DSR)
  collectedByName: string;
  status: 'PENDING' | 'TRANSFERRED' | 'APPROVED';
  transferredToManager: boolean;
  approvedBy?: string;
  approvedByName?: string;
  createdAt: string;
}

export interface CustomerLedgerEntry {
  id: string;
  customerId: string;
  companyId: string;
  companyName: string;
  type: 'INVOICE' | 'PAYMENT' | 'PAYMENT_OUT' | 'RETURN' | 'TRANSFER' | 'ADJUSTMENT' | 'PURCHASE' | 'PURCHASE_RETURN';
  referenceId: string; // invoiceId or collectionId
  referenceNo: string; // invoiceNo or collectionNo
  date: string;
  amount: number;
  balanceAfter: number;
  remarks?: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  title: string;
  category: 'ROUTE' | 'SALARY' | 'OTHER' | 'DSR' | 'MANAGER' | 'OFFICE' | 'ADMIN';
  amount: number;
  description: string;
  date: string;
  routeId?: string; // applicable if ROUTE expense
  routeName?: string;
  staffId?: string; // applicable if SALARY expense
  staffName?: string;
  createdAt: string;
}

export interface SubDepot {
  id: string; // e.g. 'sub-depot-1', 'sub-depot-2'
  name: string;
  location: string;
  managerId: string;
  managerName: string;
  cartonCommissionRate: number; // Profit earned per carton transferred/sold
  createdAt: string;
}

export interface SubDepotTransactionItem {
  productId: string;
  name: string;
  qtyUnits: number;
  qtyCartons: number;
  purchasePrice: number;
  retailPrice: number;
}

export interface SubDepotTransaction {
  id: string;
  subDepotId: string;
  subDepotName: string;
  date: string;
  items: SubDepotTransactionItem[];
  totalCartons: number;
  commissionEarned: number; // Carton Commission * Commission Rate
  status: 'SENT' | 'APPROVED';
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface AppSettings {
  companyName: string;
  address: string;
  contact: string;
  email: string;
  rolePermissions: { [role: string]: string[] }; // Permissions lists
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  actionType: 'INVOICE_CREATE' | 'PAYMENT_ENTRY' | 'SETTINGS_UPDATE';
  description: string;
  details?: any;
  createdAt: string;
}

export interface StaffLedgerEntry {
  id: string;
  staffId: string;
  staffName: string;
  staffRole: 'DSR' | 'Manager';
  type: 'SHORTAGE' | 'PAYMENT' | 'ADJUSTMENT' | 'SALARY_ADVANCE';
  referenceId: string; // e.g. daily settlement ID, or receipt ID
  referenceNo: string;
  date: string;
  amount: number;
  balanceAfter: number;
  remarks: string;
  createdAt: string;
}

export interface DailySettlement {
  id: string;
  date: string;
  status: 'submitted' | 'approved';
  openingBalance: number;
  todaySalesValue: number;
  todayCollection: number;
  totalCustomerDue: number;
  totalFreeValue: number;
  totalDiscountValue: number;
  totalExpenses: number;
  totalDamageValue: number;
  managerBalance: number;
  adminTransfer: number;
  shortage: number;
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  sheetIds: string[];
  supplierDetails: Array<{
    supplierId: string;
    supplierName: string;
    companyName: string;
    assignedValue: number;
    returnVal: number;
    netSales: number;
    returnPercent: number;
  }>;
}


