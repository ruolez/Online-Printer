import axios from 'axios';

// Use relative URL for production, or environment variable for development
const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? '/admin/api'  // In production, use the nginx proxy path
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');  // In dev, use env var or default to exposed port

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - redirect to login
      localStorage.removeItem('adminToken');
      window.location.href = '/admin/login';
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export const auth = {
  login: (username, password) =>
    api.post('/auth/login', { username, password }),

  logout: () =>
    api.post('/auth/logout'),

  verify: () =>
    api.get('/auth/verify'),
};

// Dashboard endpoints
export const dashboard = {
  getStats: () =>
    api.get('/dashboard/stats'),

  getActivity: (limit = 20) =>
    api.get(`/dashboard/activity?limit=${limit}`),

  getCharts: (days = 7) =>
    api.get(`/dashboard/charts/usage?days=${days}`),

  getHealth: () =>
    api.get('/dashboard/health'),
};

// User management endpoints
export const users = {
  getUsers: (params = {}) =>
    api.get('/users', { params }),

  getUser: (userId) =>
    api.get(`/users/${userId}`),

  updateUser: (userId, data) =>
    api.put(`/users/${userId}`, data),

  deleteUser: (userId) =>
    api.delete(`/users/${userId}`),

  resetPassword: (userId, newPassword) =>
    api.post(`/users/${userId}/reset-password`, { new_password: newPassword }),

  suspendUser: (userId) =>
    api.post(`/users/${userId}/suspend`),

  activateUser: (userId) =>
    api.post(`/users/${userId}/activate`),

  bulkOperation: (userIds, operation) =>
    api.post('/users/bulk', { user_ids: userIds, operation }),
};

// Database management endpoints
export const database = {
  getTables: () =>
    api.get('/database/tables'),

  getTableData: (tableName, params = {}) =>
    api.get(`/database/tables/${tableName}`, { params }),

  executeQuery: (query, limit = 100) =>
    api.post('/database/query', { query, limit }),

  getMetrics: () =>
    api.get('/database/metrics'),

  createBackup: (includeData = true) =>
    api.post('/database/backup', { include_data: includeData }),
};

// File management endpoints
export const files = {
  getFiles: (params = {}) =>
    api.get('/files', { params }),

  getFile: (fileId) =>
    api.get(`/files/${fileId}`),

  deleteFile: (fileId) =>
    api.delete(`/files/${fileId}`),

  downloadFile: (fileId) =>
    window.open(`${API_BASE_URL}/files/${fileId}/download`, '_blank'),

  getStats: () =>
    api.get('/files/stats'),

  cleanup: (daysOld = 30, statusFilter = null) =>
    api.post('/files/cleanup', { days_old: daysOld, status_filter: statusFilter }),
};

// Print queue endpoints
export const printQueue = {
  getJobs: (params = {}) =>
    api.get('/print-queue', { params }),

  getStations: () =>
    api.get('/print-queue/stations'),

  updateStation: (stationId, data) =>
    api.put(`/print-queue/stations/${stationId}`, data),

  updateJob: (jobId, data) =>
    api.put(`/print-queue/${jobId}`, data),

  deleteJob: (jobId) =>
    api.delete(`/print-queue/${jobId}`),

  bulkOperation: (jobIds, operation) =>
    api.post('/print-queue/bulk', { job_ids: jobIds, operation }),
};

// Settings endpoints
export const settings = {
  getSettings: () =>
    api.get('/settings'),

  updateSettings: (settings) =>
    api.put('/settings', { settings }),

  getFeatures: () =>
    api.get('/settings/features'),

  updateFeatures: (features) =>
    api.put('/settings/features', features),
};

// Analytics endpoints
export const analytics = {
  getUserAnalytics: (days = 30) =>
    api.get(`/analytics/users?days=${days}`),

  getSystemAnalytics: (days = 30) =>
    api.get(`/analytics/system?days=${days}`),

  exportData: (reportType, format = 'csv', days = 30) =>
    api.post(`/analytics/export?report_type=${reportType}&format=${format}&days=${days}`),
};

// Audit endpoints
export const audit = {
  getLogs: (params = {}) =>
    api.get('/audit/logs', { params }),

  getActivity: (userId = null, days = 7) =>
    api.get('/audit/activity', { params: { user_id: userId, days } }),

  getSecurity: (days = 7) =>
    api.get(`/audit/security?days=${days}`),

  searchLogs: (searchTerm, days = 30) =>
    api.post('/audit/search', { search_term: searchTerm, days }),
};

// WebSocket connection for real-time updates
export const connectWebSocket = (onMessage) => {
  // Use the same pattern as API_BASE_URL but for WebSocket
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = process.env.NODE_ENV === 'production'
    ? `${wsProtocol}//${window.location.host}/admin/api/ws`
    : `${wsProtocol}//${window.location.hostname}:8000/ws`;  // Dev uses port 8000 directly

  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connected');
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onMessage(data);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    // Attempt to reconnect after 5 seconds
    setTimeout(() => connectWebSocket(onMessage), 5000);
  };

  return ws;
};

export default api;