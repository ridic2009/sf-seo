import { PanelAdapter } from './index.js';
import { ServerConnectionConfig, executeSSHCommand } from '../services/deployer.js';
import https from 'https';

/**
 * FastPanel v2 adapter.
 *
 * Uses the FastPanel REST API (HTTPS on panelPort, default 8888).
 * API docs: FastPanel admin panel → /api/ endpoints.
 *
 * Auth flow:
 *   POST /api/auth → { token }
 *   All subsequent requests: Authorization: Bearer <token>
 *
 * Fallback: If API is unreachable, falls back to SSH directory creation.
 */
export class FastPanelAdapter implements PanelAdapter {
  constructor(
    private conn: ServerConnectionConfig,
    private panelUser: string,
    private panelPort: number,
    private host: string,
    private panelPassword: string,
  ) {}

  // ── HTTP helper for FastPanel API ──────────────────────────────

  private apiRequest<T = any>(
    method: string,
    path: string,
    token?: string,
    body?: Record<string, any>,
  ): Promise<{ status: number; data: T }> {
    return new Promise((resolve, reject) => {
      const postData = body ? JSON.stringify(body) : undefined;

      const options: https.RequestOptions = {
        hostname: this.host,
        port: this.panelPort,
        path,
        method,
        rejectUnauthorized: false, // self-signed certs
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
        },
        timeout: 15000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve({ status: res.statusCode ?? 0, data: parsed });
          } catch {
            resolve({ status: res.statusCode ?? 0, data: data as any });
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('FastPanel API request timeout'));
      });

      if (postData) req.write(postData);
      req.end();
    });
  }

  private async authenticate(): Promise<string> {
    const { status, data } = await this.apiRequest('POST', '/api/auth', undefined, {
      login: this.panelUser,
      password: this.panelPassword,
    });

    if (status === 200 && data?.token) {
      return data.token;
    }

    // FastPanel 2.x alternate endpoint
    const alt = await this.apiRequest('POST', '/api/login', undefined, {
      username: this.panelUser,
      password: this.panelPassword,
    });

    if (alt.status === 200 && alt.data?.token) {
      return alt.data.token;
    }

    throw new Error(
      `FastPanel auth failed (status ${status}). Check panelUser and panelPassword.`,
    );
  }

  // ── PanelAdapter interface ─────────────────────────────────────

  async createSite(domain: string): Promise<void> {
    let created = false;

    // -- Try API approach first --
    try {
      const token = await this.authenticate();

      // Create site via API
      const { status, data } = await this.apiRequest('POST', '/api/sites', token, {
        domain,
        user: this.panelUser,
        aliases: [`www.${domain}`],
        php: true,
      });

      if (status >= 200 && status < 300) {
        created = true;
      } else if (status === 409 || data?.error?.includes?.('exist')) {
        // Site already exists — not an error
        created = true;
      } else {
        throw new Error(`FastPanel API create failed: ${JSON.stringify(data)}`);
      }

      // Attempt SSL setup
      try {
        await this.apiRequest('POST', `/api/sites/ssl/letsencrypt`, token, {
          domain,
        });
      } catch {
        // SSL can be configured manually
      }
    } catch (apiError: any) {
      // -- Fallback to SSH direct directory creation --
      console.warn(`FastPanel API unavailable, falling back to SSH: ${apiError.message}`);

      const user = this.panelUser;

      // Create web root directory
      await executeSSHCommand(
        this.conn,
        `mkdir -p /var/www/${user}/data/www/${domain}`,
      );

      // Set ownership
      await executeSSHCommand(
        this.conn,
        `chown -R ${user}:${user} /var/www/${user}/data/www/${domain}`,
      );

      // Create nginx config for the domain
      const nginxConf = this.generateNginxConfig(domain, user);
      await executeSSHCommand(
        this.conn,
        `cat > /etc/nginx/sites-available/${domain}.conf << 'NGINX_EOF'\n${nginxConf}\nNGINX_EOF`,
      );

      // Enable site
      await executeSSHCommand(
        this.conn,
        `ln -sf /etc/nginx/sites-available/${domain}.conf /etc/nginx/sites-enabled/${domain}.conf`,
      );

      // Test and reload nginx
      await executeSSHCommand(this.conn, 'nginx -t && systemctl reload nginx');

      created = true;
    }

    if (!created) {
      throw new Error(`Failed to create site ${domain} on FastPanel`);
    }
  }

  async deleteSite(domain: string): Promise<void> {
    // Try API first
    try {
      const token = await this.authenticate();

      // Find site ID by domain
      const { data: sites } = await this.apiRequest('GET', '/api/sites', token);
      const siteList = Array.isArray(sites) ? sites : sites?.data ?? [];
      const site = siteList.find(
        (s: any) => s.domain === domain || s.name === domain,
      );

      if (site?.id) {
        await this.apiRequest('DELETE', `/api/sites/${site.id}`, token);
        return;
      }
    } catch {
      // Fallback to SSH
    }

    // SSH fallback: remove nginx config and directory
    const user = this.panelUser;
    try {
      await executeSSHCommand(
        this.conn,
        `rm -f /etc/nginx/sites-enabled/${domain}.conf /etc/nginx/sites-available/${domain}.conf`,
      );
      await executeSSHCommand(this.conn, 'nginx -t && systemctl reload nginx');
    } catch {
      // Non-critical
    }
    await executeSSHCommand(
      this.conn,
      `rm -rf /var/www/${user}/data/www/${domain}`,
    );
  }

  async testConnection(): Promise<boolean> {
    // Test 1: Try API auth
    try {
      const token = await this.authenticate();
      if (token) return true;
    } catch {
      // API might be unavailable
    }

    // Test 2: Verify SSH and FastPanel is installed
    try {
      const output = await executeSSHCommand(
        this.conn,
        'test -f /etc/nginx/nginx.conf && echo "nginx_ok" && (test -d /var/www || echo "no_www")',
      );
      return output.includes('nginx_ok');
    } catch {
      // Test 3: Basic SSH
      try {
        await executeSSHCommand(this.conn, 'echo ok');
        return true;
      } catch {
        return false;
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────

  private generateNginxConfig(domain: string, user: string): string {
    return `server {
    listen 80;
    server_name ${domain} www.${domain};

    root /var/www/${user}/data/www/${domain};
    index index.html index.htm index.php;

    access_log /var/log/nginx/${domain}.access.log;
    error_log /var/log/nginx/${domain}.error.log;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \\.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}`;
  }
}
