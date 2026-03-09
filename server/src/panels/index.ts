import { ServerConnectionConfig, executeSSHCommand } from '../services/deployer.js';
import { HestiaPanel } from './hestia.js';
import { FastPanelAdapter } from './fastpanel.js';
import { IspManagerPanel } from './ispmanager.js';
import { CpanelAdapter } from './cpanel.js';

export interface PanelAdapter {
  createSite(domain: string): Promise<void>;
  deleteSite(domain: string): Promise<void>;
  testConnection(): Promise<boolean>;
}

interface ServerRecord {
  host: string;
  port: number;
  username: string;
  authType: string;
  password: string | null;
  privateKey: string | null;
  panelType: string;
  panelPort: number | null;
  panelUser: string | null;
  panelPassword: string | null;
}

function toConnConfig(server: ServerRecord): ServerConnectionConfig {
  return {
    host: server.host,
    port: server.port,
    username: server.username,
    authType: server.authType as 'password' | 'key',
    password: server.password ?? undefined,
    privateKey: server.privateKey ?? undefined,
  };
}

export function getPanelAdapter(server: ServerRecord): PanelAdapter {
  const conn = toConnConfig(server);
  const panelUser = server.panelUser || server.username;

  switch (server.panelType) {
    case 'hestia':
      return new HestiaPanel(conn, panelUser);
    case 'fastpanel':
      return new FastPanelAdapter(conn, panelUser, server.panelPort ?? 8888, server.host, server.panelPassword ?? '');
    case 'ispmanager':
      return new IspManagerPanel(conn, panelUser, server.panelPort ?? 1500, server.host, server.panelPassword ?? '');
    case 'cpanel':
      return new CpanelAdapter(conn, panelUser, server.panelPort ?? 2083);
    default:
      return new HestiaPanel(conn, panelUser);
  }
}
