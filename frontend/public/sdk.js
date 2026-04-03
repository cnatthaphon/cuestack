/**
 * CueStack JS SDK — for HTML/JS apps running in the platform.
 *
 * Usage in your app's HTML:
 *   <script src="/sdk.js"></script>
 *   <script>
 *     CueStack.init().then(sdk => {
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
window.CueStack = {
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

    console.log(`CueStack SDK initialized (${this._perms.size} permissions)`);
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

  // --- Data Events (ClickHouse) ---
  async queryEvents(options = {}) {
    const params = new URLSearchParams();
    if (options.channel) params.set("channel", options.channel);
    if (options.source) params.set("source", options.source);
    if (options.start) params.set("start", options.start);
    if (options.end) params.set("end", options.end);
    if (options.limit) params.set("limit", options.limit);
    const res = await fetch(`/api/v1/data/events?${params}`);
    return res.json();
  },

  async insertEvent(channel, payload, source = "sdk") {
    const res = await fetch("/api/v1/data/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, source, payload }),
    });
    return res.json();
  },

  async exportSQLite(options = {}) {
    const params = new URLSearchParams();
    if (options.channel) params.set("channel", options.channel);
    if (options.start) params.set("start", options.start);
    if (options.end) params.set("end", options.end);
    const res = await fetch(`/api/v1/data/export?${params}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cuestack_export.db";
    a.click();
    URL.revokeObjectURL(url);
  },

  async queryAudit(options = {}) {
    const params = new URLSearchParams();
    if (options.entity_type) params.set("entity_type", options.entity_type);
    if (options.entity_id) params.set("entity_id", options.entity_id);
    if (options.limit) params.set("limit", options.limit);
    const res = await fetch(`/api/v1/data/audit?${params}`);
    return res.json();
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

  // --- Real-time channels ---
  _ws: null,
  _handlers: {},

  subscribe(channel, callback) {
    if (!this._ws) {
      const loc = window.location.host ? window.location : (window.parent || window).location;
      const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = loc.port === '3000' ? loc.hostname + ':8080' : loc.host;
      this._ws = new WebSocket(`${protocol}//${host}/ws/channels`);
      this._ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.channel && this._handlers[msg.channel]) {
            this._handlers[msg.channel].forEach(cb => cb(msg.data, msg));
          }
        } catch {}
      };
      this._ws.onopen = () => {
        // Re-subscribe all channels
        Object.keys(this._handlers).forEach(ch => {
          this._ws.send(JSON.stringify({ action: 'subscribe', channel: ch }));
        });
      };
    }
    if (!this._handlers[channel]) this._handlers[channel] = [];
    this._handlers[channel].push(callback);
    if (this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ action: 'subscribe', channel }));
    }
    return () => {
      this._handlers[channel] = this._handlers[channel].filter(cb => cb !== callback);
      if (this._handlers[channel].length === 0) {
        delete this._handlers[channel];
        if (this._ws.readyState === WebSocket.OPEN) {
          this._ws.send(JSON.stringify({ action: 'unsubscribe', channel }));
        }
      }
    };
  },

  publish(channel, data) {
    // Why HTTP to backend? The /api/channels/publish route goes directly to
    // FastAPI backend (via nginx), which handles broadcast + ClickHouse storage.
    // Works from iframes (srcdoc) where WebSocket auth is tricky.
    return fetch('/api/channels/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ channel, data }),
    }).then(function(r) { return r.json(); })
      .catch(function() { return { error: 'publish failed' }; });
  },

  // --- User ---
  get user() { return this._user; },
  get permissions() { return this._perms ? [...this._perms] : []; },
};
