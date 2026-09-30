const API = {
  async request(url, options = {}) {
    const token = localStorage.getItem('cia_token');
    const headers = { ...options.headers };

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, { ...options, headers, credentials: 'include' });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401 && !url.includes('/login')) {
        localStorage.removeItem('cia_token');
        localStorage.removeItem('cia_user');
        window.location.href = '/login.html';
      }
      throw new Error(data.error || 'Request failed');
    }

    return data;
  },

  login(username, password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  logout() {
    return this.request('/api/auth/logout', { method: 'POST' });
  },

  me() {
    return this.request('/api/auth/me');
  },

  getStats() {
    return this.request('/api/reports/stats');
  },

  getReports(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/api/reports${qs ? '?' + qs : ''}`);
  },

  getReport(id) {
    return this.request(`/api/reports/${id}`);
  },

  getNextReportNumber() {
    return this.request('/api/reports/next-number');
  },

  createReport(formData) {
    return this.request('/api/reports', { method: 'POST', body: formData });
  },

  updateReport(id, formData) {
    return this.request(`/api/reports/${id}`, { method: 'PUT', body: formData });
  },

  deleteReport(id) {
    return this.request(`/api/reports/${id}`, { method: 'DELETE' });
  },

  getLogs(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/api/logs${qs ? '?' + qs : ''}`);
  }
};

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('cia_user'));
  } catch {
    return null;
  }
}

function isFullAccess() {
  const user = getStoredUser();
  return user?.role === 'admin' || user?.role === 'full' || user?.username === 'full';
}

function isAdmin() {
  return isFullAccess();
}

function isAgent() {
  return getStoredUser()?.role === 'agent';
}

function canWrite() {
  return isFullAccess() || isAgent();
}

function canManageReport(report) {
  const user = getStoredUser();
  if (!user || !report) return false;
  if (isFullAccess()) return true;
  if (user.role === 'agent' && Number(report.createdBy) === Number(user.id)) return true;
  return false;
}

function roleLabel(role) {
  if (role === 'admin' || role === 'full') return 'Full Access';
  if (role === 'agent') return 'Field Agent';
  return 'View Only';
}

function requireAuth() {
  if (!localStorage.getItem('cia_token')) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function classificationClass(level) {
  const map = {
    'UNCLASSIFIED': 'class-unclassified',
    'CONFIDENTIAL': 'class-confidential',
    'SECRET': 'class-secret',
    'TOP SECRET': 'class-top-secret'
  };
  return map[level] || 'class-confidential';
}

function statusClass(status) {
  const map = {
    'OPEN': 'status-open',
    'CLOSED': 'status-closed',
    'PENDING REVIEW': 'status-pending',
    'ARCHIVED': 'status-archived'
  };
  return map[status] || 'status-open';
}

function priorityClass(priority) {
  const map = {
    'ROUTINE': 'priority-routine',
    'HIGH': 'priority-high',
    'CRITICAL': 'priority-critical'
  };
  return map[priority] || 'priority-routine';
}
