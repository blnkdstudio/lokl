// Shared types between web and api

export type UserRole = 'SHOPPER' | 'BRAND_OWNER' | 'ADMIN';

export type BrandStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';

export type ProductStatus = 'DRAFT' | 'PUBLISHED';

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'TO_SHIP'
  | 'SHIPPED'
  | 'TO_RECEIVE'
  | 'COMPLETED'
  | 'CANCELLED';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  description: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  location: string | null;
  status: BrandStatus;
  socialLinks: SocialLinks;
  ownerId: string;
  createdAt: string;
}

export interface SocialLinks {
  instagram?: string;
  tiktok?: string;
  facebook?: string;
  website?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  status: ProductStatus;
  images: string[];
  category: string;
  brandId: string;
  brand?: Pick<Brand, 'id' | 'name' | 'slug' | 'logoUrl'>;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: number;
  shippingAddress: ShippingAddress;
  trackingNumber: string | null;
  shippingCourier: string | null;
  shippingFee: number;
  items: OrderItem[];
  shopperId: string;
  brandId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  quantity: number;
  unitPrice: number;
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  isRead: boolean;
  orderId?: string;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
