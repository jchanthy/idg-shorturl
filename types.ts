export interface ClickData {
  date: string;
  count: number;
}

export interface ShortLink {
  id: string;
  originalUrl: string;
  alias: string;
  createdAt: number;
  totalClicks: number;
  clickHistory: ClickData[];
  tags?: string[];
  expiresAt?: number;
  domain?: string;
}

export type ViewMode = 'dashboard' | 'links' | 'create';

export interface DashboardStats {
  totalLinks: number;
  totalClicks: number;
  topPerformer: ShortLink | null;
}

export interface UserProfile {
  uid: string;
  fullName: string;
  email?: string;
  avatarUrl?: string;
  customDomains: string[];
  planType?: 'free' | 'premium' | 'enterprise';
  linkLimit?: number;
  clickLimit?: number;
  role?: 'admin' | 'user';
}