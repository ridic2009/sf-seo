import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './client';
import type { Site, BatchDeployPayload, BatchTransferPayload } from '../types';

interface EditorSearchOptions {
  ignoreCase?: boolean;
  useRegex?: boolean;
}

export function getSitePreviewUrl(id: number, cacheKey?: string | null) {
  return `/api/sites/${id}/preview${cacheKey ? `?v=${encodeURIComponent(cacheKey)}` : ''}`;
}

export function getSiteEditorFiles(id: number) {
  return api.get(`/sites/${id}/editor/files`).then((r) => r.data.files as string[]);
}

export function getSiteEditorFileContent(id: number, filePath: string) {
  return api.get(`/sites/${id}/editor/file`, { params: { path: filePath } }).then((r) => r.data.content as string);
}

export function saveSiteEditorFileContent(id: number, filePath: string, content: string) {
  return api.put(`/sites/${id}/editor/file`, { path: filePath, content }).then((r) => r.data);
}

export function searchSiteEditorFiles(id: number, query: string, options: EditorSearchOptions = {}) {
  return api.post(`/sites/${id}/editor/search`, { query, ...options }).then((r) => r.data as {
    results: Array<{ filePath: string; matchCount: number; matches: Array<{ line: number; column: number; preview: string; matchLength: number }> }>;
    files: number;
    matches: number;
  });
}

export function replaceSiteEditorFiles(id: number, query: string, replaceWith: string, options: EditorSearchOptions = {}) {
  return api.post(`/sites/${id}/editor/replace`, { query, replaceWith, ...options }).then((r) => r.data as {
    updatedFiles: number;
    replacements: number;
  });
}

export function useSites() {
  return useQuery<Site[]>({
    queryKey: ['sites'],
    queryFn: () => api.get('/sites').then((r) => r.data),
  });
}

export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Site>) =>
      api.post('/sites', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}

export function useUpdateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Site> }) =>
      api.put(`/sites/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}

export function useDeploySite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post(`/sites/${id}/deploy`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}

export function useReplaceSiteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ siteId, templateId }: { siteId: number; templateId: number }) =>
      api.post(`/sites/${siteId}/replace-template`, { templateId }).then((r) => r.data as {
        success: boolean;
        domain: string;
        templateId: number;
        templateName: string;
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}

export function useRefreshSitePreview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (siteId: number) =>
      api.get(`/sites/${siteId}/preview`, {
        params: { refresh: '1', t: Date.now() },
        responseType: 'blob',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}

export function useBatchDeploy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BatchDeployPayload) =>
      api.post('/sites/batch-deploy', payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}

export function useBatchTransferSites() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BatchTransferPayload) =>
      api.post('/sites/batch-transfer', payload).then((r) => r.data as {
        targetServerId: number;
        targetServerName: string;
        results: Array<{ siteId: number; domain?: string; status: 'transferred' | 'skipped' | 'error'; error?: string; message?: string }>;
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}

export function useDeleteSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/sites/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}
