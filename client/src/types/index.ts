export interface Template {
  id: number;
  name: string;
  description: string | null;
  languages: string; // JSON array string
  originalBusinessName: string;
  originalDomain: string;
  dirPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface Server {
  id: number;
  name: string;
  host: string;
  port: number;
  panelType: string;
  panelPort: number | null;
  username: string;
  authType: string;
  password: string | null;
  privateKey: string | null;
  webRootPattern: string;
  panelUser: string | null;
  panelPassword: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Site {
  id: number;
  domain: string;
  businessName: string;
  templateId: number | null;
  serverId: number | null;
  language: string;
  status: 'pending' | 'deploying' | 'deployed' | 'error';
  deployStep?: string | null;
  deployLog?: string | null;
  errorMessage: string | null;
  previewStatus?: number | null;
  previewUpdatedAt?: string | null;
  previewError?: string | null;
  deployedAt: string | null;
  notes: string | null;
  createdAt: string;
  // Joined fields
  templateName?: string | null;
  serverName?: string | null;
  serverHost?: string | null;
}

export interface BatchDeployPayload {
  templateId: number;
  serverId: number;
  language?: string;
  autoDeploy?: boolean;
  sites: Array<{ domain: string; businessName: string; notes?: string }>;
}

export interface BatchTransferPayload {
  targetServerId: number;
  siteIds: number[];
  concurrency?: number;
}

export interface ServerBackupResult {
  success: boolean;
  fileName: string;
  filePath: string;
  downloadPath: string;
  siteCount: number;
  sizeBytes: number;
  createdAt: string;
  mode: 'managed' | 'all';
  serverId: number;
  serverName: string;
  sites: string[];
  status: 'running' | 'completed' | 'error';
  stage: string;
  errorMessage?: string | null;
}

export interface BulkReplaceMatchPreview {
  line: number;
  column: number;
  preview: string;
  matchLength: number;
}

export interface BulkReplacePreviewFileResult {
  filePath: string;
  matchCount: number;
  firstMatch: BulkReplaceMatchPreview | null;
}

export interface BulkReplacePreviewSiteResult {
  domain: string;
  remoteRoot: string;
  matchedFiles: number;
  matches: number;
  files: BulkReplacePreviewFileResult[];
}

export interface BulkReplacePreviewServerResult {
  serverId: number;
  serverName: string;
  scannedSites: number;
  matchedSites: number;
  matchedFiles: number;
  matches: number;
  sites: BulkReplacePreviewSiteResult[];
  error?: string;
}

export interface BulkReplaceApplySiteResult {
  domain: string;
  remoteRoot: string;
  updatedFiles: number;
  replacements: number;
}

export interface BulkReplaceApplyServerResult {
  serverId: number;
  serverName: string;
  scannedSites: number;
  updatedSites: number;
  updatedFiles: number;
  replacements: number;
  sites: BulkReplaceApplySiteResult[];
  error?: string;
}

export interface BulkReplacePreviewResponse {
  relativePath: string | null;
  query: string;
  servers: BulkReplacePreviewServerResult[];
  totals: {
    scannedServers: number;
    scannedSites: number;
    matchedServers: number;
    matchedSites: number;
    matchedFiles: number;
    matches: number;
    errors: number;
  };
}

export interface BulkReplaceApplyResponse {
  relativePath: string | null;
  query: string;
  replaceWith: string;
  servers: BulkReplaceApplyServerResult[];
  totals: {
    scannedServers: number;
    scannedSites: number;
    updatedServers: number;
    updatedSites: number;
    updatedFiles: number;
    replacements: number;
    errors: number;
  };
}
