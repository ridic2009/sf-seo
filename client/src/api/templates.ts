import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './client';
import type { Template } from '../types';

interface EditorSearchOptions {
  ignoreCase?: boolean;
  useRegex?: boolean;
}

export function getTemplateExportUrl(id: number) {
  return `/api/templates/${id}/export`;
}

export function getTemplatePreviewUrl(id: number) {
  return `/api/templates/${id}/preview`;
}

export function getTemplateFiles(id: number) {
  return api.get(`/templates/${id}/files`).then((r) => r.data.files as string[]);
}

export function getTemplateFileContent(id: number, filePath: string) {
  return api.get(`/templates/${id}/file`, { params: { path: filePath } }).then((r) => r.data.content as string);
}

export function saveTemplateFileContent(id: number, filePath: string, content: string) {
  return api.put(`/templates/${id}/file`, { path: filePath, content }).then((r) => r.data);
}

export function searchTemplateFiles(id: number, query: string, options: EditorSearchOptions = {}) {
  return api.post(`/templates/${id}/search`, { query, ...options }).then((r) => r.data as {
    results: Array<{ filePath: string; matchCount: number; matches: Array<{ line: number; column: number; preview: string; matchLength: number }> }>;
    files: number;
    matches: number;
  });
}

export function replaceTemplateFiles(id: number, query: string, replaceWith: string, options: EditorSearchOptions = {}) {
  return api.post(`/templates/${id}/replace`, { query, replaceWith, ...options }).then((r) => r.data as {
    updatedFiles: number;
    replacements: number;
  });
}

export function useTemplateSyncStatus() {
  return useQuery<{ enabled: boolean; directory: string | null }>({
    queryKey: ['templates', 'sync-status'],
    queryFn: () => api.get('/templates/sync-status').then((r) => r.data),
  });
}

export function useSyncTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/templates/sync').then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      qc.invalidateQueries({ queryKey: ['templates', 'sync-status'] });
    },
  });
}

export function useTemplates() {
  return useQuery<Template[]>({
    queryKey: ['templates'],
    queryFn: () => api.get('/templates').then((r) => r.data),
  });
}

export function useTemplate(id: number) {
  return useQuery<Template>({
    queryKey: ['templates', id],
    queryFn: () => api.get(`/templates/${id}`).then((r) => r.data),
    enabled: id > 0,
  });
}

export function useUploadTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) =>
      api.post('/templates', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Template> }) =>
      api.put(`/templates/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useReplaceTemplateArchive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, formData }: { id: number; formData: FormData }) =>
      api.post(`/templates/${id}/archive`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/templates/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}
