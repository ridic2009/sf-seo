import { PanelAdapter } from './index.js';
import { ServerConnectionConfig, executeSSHCommand } from '../services/deployer.js';

export class CpanelAdapter implements PanelAdapter {
  constructor(
    private conn: ServerConnectionConfig,
    private panelUser: string,
    private panelPort: number,
  ) {}

  async createSite(domain: string): Promise<void> {
    // cPanel UAPI via SSH (requires cPanel CLI access)
    await executeSSHCommand(
      this.conn,
      `uapi --user=${this.panelUser} DomainInfo domains_data format=json`,
    );
    // Add addon domain
    await executeSSHCommand(
      this.conn,
      `/usr/local/cpanel/bin/apitool --user=${this.panelUser} --module=AddonDomain --function=addaddondomain --domain=${domain} --dir=/home/${this.panelUser}/public_html/${domain}`,
    );
  }

  async deleteSite(domain: string): Promise<void> {
    await executeSSHCommand(
      this.conn,
      `/usr/local/cpanel/bin/apitool --user=${this.panelUser} --module=AddonDomain --function=deladdondomain --domain=${domain}`,
    );
  }

  async testConnection(): Promise<boolean> {
    try {
      await executeSSHCommand(this.conn, 'echo ok');
      return true;
    } catch {
      return false;
    }
  }
}
