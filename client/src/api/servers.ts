import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './client';
import type { BulkReplaceApplyResponse, BulkReplacePreviewResponse, Server, ServerBackupResult } from '../types';

interface BulkReplaceOptions {
  serverIds: number[];
  query: string;
  replaceWith?: string;
  relativePath?: string;
  ignoreCase?: boolean;
  useRegex?: boolean;
}

export function useServers() {
  return useQuery<Server[]>({
    queryKey: ['servers'],
    queryFn: () => api.get('/servers').then((r) => r.data),
  });
}

export function useCreateServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Server>) =>
      api.post('/servers', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  });
}

export function useUpdateServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Server> }) =>
      api.put(`/servers/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  });
}

export function useTestServer() {
  return useMutation({
    mutationFn: (id: number) =>
      api.post(`/servers/${id}/test`).then((r) => r.data),
  });
}

export function useDeleteServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/servers/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  });
}

export function useCreateServerBackup() {
  const qc = useQueryClient();
  return useMutation<ServerBackupResult, any, number | { id: number; mode: 'managed' | 'all' }>({
    mutationFn: (payload) => {
      const request = typeof payload === 'number'
        ? { id: payload, mode: 'managed' as const }
        : payload;

      return api.post(`/servers/${request.id}/backup`, { mode: request.mode }).then((r) => r.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['server-backups'] }),
  });
}

export function useBulkServerReplacePreview() {
  return useMutation({
    mutationFn: (payload: BulkReplaceOptions) =>
      api.post('/servers/bulk-replace/preview', payload).then((r) => r.data as BulkReplacePreviewResponse),
  });
}

export function useBulkServerReplaceApply() {
  return useMutation({
    mutationFn: (payload: BulkReplaceOptions) =>
      api.post('/servers/bulk-replace/apply', payload).then((r) => r.data as BulkReplaceApplyResponse),
  });
}

export function useServerBackups() {
  return useQuery<ServerBackupResult[]>({
    queryKey: ['server-backups'],
    queryFn: () => api.get('/servers/backups').then((r) => r.data),
  });
}

export function useDeleteServerBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serverId, fileName }: { serverId: number; fileName: string }) =>
      api.delete(`/servers/${serverId}/backups/${encodeURIComponent(fileName)}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['server-backups'] }),
  });
}
