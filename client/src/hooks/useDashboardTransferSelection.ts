import { useMemo, useState } from 'react';
import type { Site } from '../types';

export function useDashboardTransferSelection(filteredSites: Site[], transferableSites: Site[]) {
  const [selectedTransferSiteIds, setSelectedTransferSiteIds] = useState<number[]>([]);
  const [transferServerId, setTransferServerId] = useState(0);

  const eligibleTransferSiteIds = useMemo(
    () => new Set(transferableSites.map((site) => site.id)),
    [transferableSites],
  );

  const visibleTransferCandidateIds = useMemo(
    () => filteredSites
      .filter((site) => eligibleTransferSiteIds.has(site.id))
      .map((site) => site.id),
    [eligibleTransferSiteIds, filteredSites],
  );

  const selectableTransferSiteIds = useMemo(
    () => transferableSites.filter((site) => site.serverId !== transferServerId).map((site) => site.id),
    [transferableSites, transferServerId],
  );

  const allVisibleTransferSelected = visibleTransferCandidateIds.length > 0
    && visibleTransferCandidateIds.every((siteId) => selectedTransferSiteIds.includes(siteId));
  const hasSomeVisibleTransferSelected = visibleTransferCandidateIds.some((siteId) => selectedTransferSiteIds.includes(siteId));

  const toggleTransferSite = (siteId: number) => {
    setSelectedTransferSiteIds((current) => (
      current.includes(siteId)
        ? current.filter((value) => value !== siteId)
        : [...current, siteId]
    ));
  };

  const toggleAllVisibleTransferSites = () => {
    setSelectedTransferSiteIds((current) => {
      if (allVisibleTransferSelected) {
        return current.filter((siteId) => !visibleTransferCandidateIds.includes(siteId));
      }

      const next = new Set(current);
      visibleTransferCandidateIds.forEach((siteId) => next.add(siteId));
      return Array.from(next);
    });
  };

  const handleTransferServerChange = (serverId: number) => {
    setTransferServerId(serverId);
    setSelectedTransferSiteIds((current) => current.filter((siteId) => {
      const site = transferableSites.find((item) => item.id === siteId);
      return site ? site.serverId !== serverId : false;
    }));
  };

  const clearTransferSelection = () => {
    setSelectedTransferSiteIds([]);
  };

  const resetTransferFlow = () => {
    setSelectedTransferSiteIds([]);
    setTransferServerId(0);
  };

  return {
    selectedTransferSiteIds,
    setSelectedTransferSiteIds,
    transferServerId,
    setTransferServerId,
    eligibleTransferSiteIds,
    visibleTransferCandidateIds,
    selectableTransferSiteIds,
    allVisibleTransferSelected,
    hasSomeVisibleTransferSelected,
    toggleTransferSite,
    toggleAllVisibleTransferSites,
    handleTransferServerChange,
    clearTransferSelection,
    resetTransferFlow,
  };
}