import { PanelAdapter } from './index.js';
import { ServerConnectionConfig, executeSSHCommand } from '../services/deployer.js';
import { probeHestiaDomain, waitForHestiaDomain } from '../services/hestia.js';

export class HestiaPanel implements PanelAdapter {
  constructor(
    private conn: ServerConnectionConfig,
    private panelUser: string,
  ) {}

  private async runHestiaCommand(command: string, args: string[] = []): Promise<string> {
    const raw = [command, ...args].join(' ');

    try {
      return this.validateHestiaOutput(await executeSSHCommand(this.conn, raw));
    } catch (error: any) {
      const message = error?.message || '';
      if (!message.includes('command not found')) {
        throw error;
      }
    }

    const fallback = [`/usr/local/hestia/bin/${command}`, ...args].join(' ');
    return this.validateHestiaOutput(await executeSSHCommand(this.conn, fallback));
  }

  private validateHestiaOutput(output: string): string {
    const normalized = output.trim();
    if (normalized.startsWith('Error:')) {
      throw new Error(normalized);
    }

    return output;
  }

  private async domainExists(domain: string): Promise<boolean> {
    try {
      const result = await probeHestiaDomain(this.conn, this.panelUser, domain);
      return result.exists;
    } catch {
      return false;
    }
  }

  private async removeOrphanDomainDirectory(domain: string): Promise<void> {
    const user = this.panelUser;
    const domainDir = `/home/${user}/web/${domain}`;
    await executeSSHCommand(this.conn, `if [ -d ${domainDir} ]; then rm -rf ${domainDir}; fi`);
  }

  private async triggerLetsEncryptInBackground(domain: string): Promise<void> {
    const user = this.panelUser;
    await executeSSHCommand(
      this.conn,
      `nohup /usr/local/hestia/bin/v-add-letsencrypt-domain ${user} ${domain} >/dev/null 2>&1 </dev/null &`,
    );
  }

  async createSite(domain: string): Promise<void> {
    const user = this.panelUser;

    if (await this.domainExists(domain)) {
      return;
    }

    try {
      await this.runHestiaCommand('v-add-web-domain', [user, domain]);
    } catch (error: any) {
      const message = error?.message || '';
      const orphanFolderError = message.includes('Web domain folder') && message.includes('should not exist');

      if (!orphanFolderError || await this.domainExists(domain)) {
        throw error;
      }

      await this.removeOrphanDomainDirectory(domain);
      await this.runHestiaCommand('v-add-web-domain', [user, domain]);
    }

    const registration = await waitForHestiaDomain(this.conn, user, domain);
    if (!registration.exists) {
      const details = registration.diagnostics.join(' | ') || 'no diagnostic output';
      throw new Error(`Hestia did not register domain ${domain} after create command: ${details}`);
    }

    // Don't block deploy on Let's Encrypt issuance. DNS may still propagate.
    try {
      await this.triggerLetsEncryptInBackground(domain);
    } catch {
      // SSL can be configured manually later
    }
  }

  async deleteSite(domain: string): Promise<void> {
    const user = this.panelUser;
    await this.runHestiaCommand('v-delete-web-domain', [user, domain]);
  }

  async testConnection(): Promise<boolean> {
    try {
      const output = await this.runHestiaCommand('v-list-sys-info');
      return output.length > 0;
    } catch (error: any) {
      throw new Error(`Hestia test failed: ${error?.message || 'unknown error'}`);
    }
  }
}
