/**
 * IoT Stack JS SDK — for HTML/JS apps running in the platform.
 *
 * Usage in your app's HTML:
 *   <script src="/sdk.js"></script>
 *   <script>
 *     IoTStack.init().then(sdk => {
 *       // Check permissions
 *       sdk.can('db.create').then(ok => { ... });
 *
 *       // Fetch data
 *       sdk.query('sensor_data', { limit: 10 }).then(data => { ... });
 *
 *       // Notify
 *       sdk.notify('Alert!', { type: 'warning' });
 *     });
 *   </script>
 */
window.IoTStack = {
  _perms: null,
  _user: null,

  async init() {
    // Load user info + permissions
    const res = await fetch('/api/auth/check-permission?all=true');
    if (!res.ok) throw new Error('Not authenticated');
    const data = await res.json();
    this._perms = new Set(data.permissions);
    this._user = data;

    const meRes = await fetch('/api/auth/me');
    if (meRes.ok) {
      const me = await meRes.json();
      this._user = { ...this._user, ...me.user, org: me.org };
    }

    console.log(`IoT Stack SDK initialized (${this._perms.size} permissions)`);
    return this;
  },

  // --- Permissions ---
  async can(permission) {
    if (this._perms) return this._perms.has(permission);
    const res = await fetch(`/api/auth/check-permission?permission=${encodeURIComponent(permission)}`);
    return (await res.json()).allowed;
  },

  async canAll(permissions) {
    const res = await fetch('/api/auth/check-permission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions }),
    });
    return (await res.json()).results;
  },

  // --- Data ---
  async tables() {
    const res = await fetch('/api/tables');
    return (await res.json()).tables || [];
  },

  async query(tableName, opts = {}) {
    const res = await fetch('/api/dashboards/widget-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widget: { type: 'table', config: { table: tableName, max_rows: opts.limit || 100 } }
      }),
    });
    const data = await res.json();
    return data.data?.rows || [];
  },

  // --- Files ---
  async files(view = 'my', parentId = null) {
    const params = new URLSearchParams({ view });
    if (parentId) params.set('parent', parentId);
    const res = await fetch(`/api/files?${params}`);
    return (await res.json()).files || [];
  },

  // --- Notifications ---
  async notify(title, opts = {}) {
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message: opts.message || '', type: opts.type || 'info', source: opts.source || 'app' }),
    });
  },

  // --- User ---
  get user() { return this._user; },
  get permissions() { return this._perms ? [...this._perms] : []; },
};
