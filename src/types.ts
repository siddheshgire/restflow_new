export interface Outlet {
  id: string;
  ownerId: string;
  name: string;
  location: string;
}

export interface MenuItem {
  id: string;
  outletId: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image?: string;
  available: boolean;
  recommended: boolean;
}

export interface InventoryItem {
  id: string;
  outletId: string;
  item: string;
  quantity: number;
  unit: string;
  threshold: number;
}

export interface Order {
  id: string;
  outletId: string;
  tableId: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
    price: number;
    name: string;
  }>;
  status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'paid';
  paymentMethod?: 'card' | 'cash' | 'upi';
  total: number;
  createdAt: number;
}

export interface AttendanceItem {
  id: string;
  employeeId: string;
  outletId: string;
  name: string;
  role: string;
  clockIn: number;
  clockOut: number | null;
  date: string;
}

export interface Table {
  id: string;
  outletId: string;
  number: string;
  status: 'free' | 'occupied' | 'reserved';
}
