export interface EnvProfile {
  name: string;
  variables: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMeta {
  id: string;
  name: string;
  path: string;
}
