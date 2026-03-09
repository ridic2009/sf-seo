import { useMemo, useState } from 'react';
import type { Server, Site } from '../types';

export function useDashboardFilters(sites: Site[], servers: Server[]) {
  const [globalFilter, setGlobalFilter] = useState('');
  const [templateFilter, setTemplateFilter] = useState('all');
  const [serverFilter, setServerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | Site['status']>('all');

  const templateOptions = useMemo(
    () => Array.from(
      new Map(
        sites
          .filter((site) => site.templateId && site.templateName)
          .map((site) => [String(site.templateId), { value: String(site.templateId), label: site.templateName || 'Без шаблона' }]),
      ).values(),
    ).sort((left, right) => left.label.localeCompare(right.label, 'ru')),
    [sites],
  );

  const serverOptions = useMemo(
    () => Array.from(
      new Map(
        servers
          .map((server) => [String(server.id), { value: String(server.id), label: server.name }]),
      ).values(),
    ).sort((left, right) => left.label.localeCompare(right.label, 'ru')),
    [servers],
  );

  const filteredSites = useMemo(
    () => sites.filter((site) => {
      if (templateFilter !== 'all' && String(site.templateId || '') !== templateFilter) {
        return false;
      }

      if (serverFilter !== 'all' && String(site.serverId || '') !== serverFilter) {
        return false;
      }

      if (statusFilter !== 'all' && site.status !== statusFilter) {
        return false;
      }

      return true;
    }),
    [serverFilter, sites, statusFilter, templateFilter],
  );

  const hasActiveFilters = templateFilter !== 'all' || serverFilter !== 'all' || statusFilter !== 'all';

  const stats = useMemo(() => {
    const deployed = sites.filter((site) => site.status === 'deployed').length;
    const pending = sites.filter((site) => site.status === 'pending').length;
    const errors = sites.filter((site) => site.status === 'error').length;
    return { total: sites.length, deployed, pending, errors };
  }, [sites]);

  const resetFilters = () => {
    setTemplateFilter('all');
    setServerFilter('all');
    setStatusFilter('all');
  };

  return {
    globalFilter,
    setGlobalFilter,
    templateFilter,
    setTemplateFilter,
    serverFilter,
    setServerFilter,
    statusFilter,
    setStatusFilter,
    templateOptions,
    serverOptions,
    filteredSites,
    hasActiveFilters,
    stats,
    resetFilters,
  };
}