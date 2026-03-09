import { PanelAdapter } from './index.js';
import { ServerConnectionConfig, executeSSHCommand } from '../services/deployer.js';

/**
 * ISPmanager 5/6 adapter.
 *
 * Primary method: `mgrctl` CLI via SSH (works reliably with root access).
 * Fallback: Direct SSH commands for directory setup.
 *
 * mgrctl paths:
 *   ISPmanager 5: /usr/local/mgr5/sbin/mgrctl -m ispmgr
 *   ISPmanager 6: /usr/local/mgr5/sbin/mgrctl -m ispmgr  (same binary, new version)
 *
 * Key commands:
 *   webdomain.edit   — create/update web domain
 *   webdomain.delete — remove web domain
 *   sslcert.letsencrypt.setup — issue Let's Encrypt cert
 */
export class IspManagerPanel implements PanelAdapter {
  private readonly mgrctl = '/usr/local/mgr5/sbin/mgrctl -m ispmgr';

  constructor(
    private conn: ServerConnectionConfig,
    private panelUser: string,
    private panelPort: number,
    private host: string,
    private panelPassword: string,
  ) {}

  // ── Helper: run mgrctl command with error handling ─────────────

  private async mgr(command: string): Promise<string> {
    const fullCmd = `${this.mgrctl} ${command}`;
    return executeSSHCommand(this.conn, fullCmd);
  }

  /**
   * Detect which mgrctl binary is available.
   * ISPmanager can be installed in different paths.
   */
  private async detectMgrctl(): Promise<string> {
    const paths = [
      '/usr/local/mgr5/sbin/mgrctl',
      '/usr/local/ispmgr/sbin/mgrctl',
    ];

    for (const p of paths) {
      try {
        await executeSSHCommand(this.conn, `test -x ${p} && echo exists`);
        return `${p} -m ispmgr`;
      } catch {
        continue;
      }
    }

    // Fallback: try finding via which
    try {
      const result = await executeSSHCommand(this.conn, 'which mgrctl 2>/dev/null');
      if (result.trim()) {
        return `${result.trim()} -m ispmgr`;
      }
    } catch {
      // ignore
    }

    return this.mgrctl; // default
  }

  // ── PanelAdapter interface ─────────────────────────────────────

  async createSite(domain: string): Promise<void> {
    const user = this.panelUser;

    // Step 1: Create web domain with PHP enabled
    try {
      await this.mgr(
        `webdomain.edit name=${domain} owner=${user} docroot=auto php=on php_mode=php-fpm sok=ok`,
      );
    } catch (err: any) {
      const msg = err.message || '';

      // "already exists" is not a fatal error
      if (msg.includes('exists') || msg.includes('Exist') || msg.includes('already')) {
        console.log(`ISP Manager: domain ${domain} already exists, continuing`);
      } else {
        // Try simpler variant (ISPmanager 5 compat)
        try {
          await this.mgr(
            `webdomain.edit name=${domain} owner=${user} sok=ok`,
          );
        } catch (err2: any) {
          const msg2 = err2.message || '';
          if (!msg2.includes('exists') && !msg2.includes('already')) {
            throw new Error(`ISP Manager createSite failed: ${msg2}`);
          }
        }
      }
    }

    // Step 2: Enable PHP-FPM (explicit, in case it wasn't set)
    try {
      await this.mgr(
        `phpfpm.edit elid=${domain} owner=${user} php_mode=php-fpm sok=ok`,
      );
    } catch {
      // PHP might already be configured or command may differ by version
    }

    // Step 3: Add www alias
    try {
      await this.mgr(
        `webdomain.alias.edit plid=${domain} name=www.${domain} sok=ok`,
      );
    } catch {
      // Alias might already exist or not supported
    }

    // Step 4: Attempt Let's Encrypt SSL
    try {
      await this.mgr(
        `sslcert.letsencrypt.setup domain=${domain} sok=ok`,
      );
    } catch {
      // SSL setup is non-critical — can be done manually
      // LE might fail if DNS hasn't propagated yet
    }

    // Step 5: Verify web root exists and set proper ownership
    try {
      const webRoot = await this.getWebRoot(domain, user);
      await executeSSHCommand(this.conn, `mkdir -p ${webRoot}`);
      await executeSSHCommand(this.conn, `chown -R ${user}:${user} ${webRoot}`);
      await executeSSHCommand(this.conn, `chmod 755 ${webRoot}`);
    } catch {
      // Directory setup is non-critical at this stage
    }
  }

  async deleteSite(domain: string): Promise<void> {
    const user = this.panelUser;

    try {
      // Remove web domain (also removes nginx/apache config)
      await this.mgr(
        `webdomain.delete elid=${domain} sok=ok`,
      );
    } catch (err: any) {
      const msg = err.message || '';
      if (!msg.includes('not found') && !msg.includes('Not found')) {
        throw new Error(`ISP Manager deleteSite failed: ${msg}`);
      }
    }

    // Cleanup web root directory
    try {
      const webRoot = `/var/www/${user}/data/www/${domain}`;
      await executeSSHCommand(this.conn, `rm -rf ${webRoot}`);
    } catch {
      // Non-critical
    }
  }

  async testConnection(): Promise<boolean> {
    // Test 1: Check mgrctl is available and ISP Manager is running
    try {
      const mgrctlPath = await this.detectMgrctl();
      const output = await executeSSHCommand(
        this.conn,
        `${mgrctlPath} licctl info`,
      );
      if (output.length > 0) return true;
    } catch {
      // Try simpler command
    }

    // Test 2: Try listing domains (validates panel is running)
    try {
      await this.mgr('webdomain');
      return true; // If command succeeds, panel is working
    } catch {
      // mgrctl might not be in default path
    }

    // Test 3: Check ISP Manager service is running
    try {
      const output = await executeSSHCommand(
        this.conn,
        'systemctl is-active ihttpd 2>/dev/null || systemctl is-active ispmgr 2>/dev/null',
      );
      if (output.trim() === 'active') return true;
    } catch {
      // ignore
    }

    // Test 4: Basic SSH connectivity
    try {
      await executeSSHCommand(this.conn, 'echo ok');
      return true;
    } catch {
      return false;
    }
  }

  // ── Extended methods ───────────────────────────────────────────

  /**
   * List all web domains for the panel user.
   */
  async listSites(): Promise<string[]> {
    try {
      const output = await this.mgr(`webdomain owner=${this.panelUser}`);
      // mgrctl output is line-based, each line has key=value pairs
      const domains: string[] = [];
      for (const line of output.split('\n')) {
        const match = line.match(/name=(\S+)/);
        if (match) domains.push(match[1]);
      }
      return domains;
    } catch {
      return [];
    }
  }

  /**
   * Get the web root path for a domain.
   */
  private async getWebRoot(domain: string, user: string): Promise<string> {
    // ISP Manager default web root pattern
    // Try to get from panel first
    try {
      const output = await this.mgr(
        `webdomain.edit elid=${domain}`,
      );
      const match = output.match(/docroot=(\S+)/);
      if (match) return match[1];
    } catch {
      // ignore
    }

    // Default ISP Manager web root patterns
    return `/var/www/${user}/data/www/${domain}`;
  }

  /**
   * Enable redirect HTTP → HTTPS for a domain.
   */
  async enableHttpsRedirect(domain: string): Promise<void> {
    try {
      await this.mgr(
        `webdomain.edit elid=${domain} ssl_redirect=on sok=ok`,
      );
    } catch {
      // May not be supported in all versions
    }
  }

  /**
   * Set custom PHP version for a domain.
   */
  async setPhpVersion(domain: string, version: string): Promise<void> {
    try {
      await this.mgr(
        `webdomain.edit elid=${domain} php_version=${version} sok=ok`,
      );
    } catch (err: any) {
      throw new Error(`Failed to set PHP version: ${err.message}`);
    }
  }
}
