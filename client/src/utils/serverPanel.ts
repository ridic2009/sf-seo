import type { Server } from '../types';

interface ServerPanelLike {
  host?: string | null;
  panelPort?: number | null;
}

export function getServerPanelUrl(server: ServerPanelLike): string | null {
  if (!server.host) {
    return null;
  }

  const port = server.panelPort ?? 8083;
  return `http://${server.host}:${port}`;
}