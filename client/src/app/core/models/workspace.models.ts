export interface Workspace {
  _id: string;
  id?: string;
  ownerId?: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  suspensionType?: 'owner' | 'admin' | null;
  currency: 'EGP';
  description: string;
}

export interface ApiListResponse<T> {
  message: string;
  data: T;
}
