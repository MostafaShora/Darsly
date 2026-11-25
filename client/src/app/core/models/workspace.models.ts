export interface Workspace {
  _id: string;
  id?: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  currency: 'EGP';
  description: string;
}

export interface ApiListResponse<T> {
  message: string;
  data: T;
}
