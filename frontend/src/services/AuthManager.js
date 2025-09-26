const API_URL = '/api';

class AuthManager {
  constructor() {
    this.token = null;
    this.refreshTimer = null;
    this.isRefreshing = false;
    this.refreshSubscribers = [];
    this.stationCredentials = null;
    this.retryAttempts = 0;
    this.maxRetries = 5;
    this.baseRetryDelay = 1000; // 1 second
  }

  init(token) {
    this.token = token;
    this.scheduleTokenRefresh();

    // Load station credentials if in printer mode
    const deviceMode = localStorage.getItem('deviceMode');
    if (deviceMode === 'printer') {
      this.loadStationCredentials();
    }
  }

  loadStationCredentials() {
    try {
      const encrypted = localStorage.getItem('stationCredentials');
      if (encrypted) {
        // In production, decrypt these credentials
        // For now, we'll store them as base64
        this.stationCredentials = JSON.parse(atob(encrypted));
      }
    } catch (error) {
      console.error('[AuthManager] Error loading station credentials:', error);
    }
  }

  saveStationCredentials(username, password) {
    try {
      // In production, encrypt these credentials
      // For now, we'll store them as base64
      const credentials = { username, password };
      const encrypted = btoa(JSON.stringify(credentials));
      localStorage.setItem('stationCredentials', encrypted);
      this.stationCredentials = credentials;
    } catch (error) {
      console.error('[AuthManager] Error saving station credentials:', error);
    }
  }

  clearStationCredentials() {
    localStorage.removeItem('stationCredentials');
    this.stationCredentials = null;
  }

  scheduleTokenRefresh() {
    // Clear any existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    // Parse token to get expiration
    try {
      const tokenData = this.parseJWT(this.token);
      if (tokenData && tokenData.exp) {
        const now = Date.now() / 1000;
        const expiresIn = tokenData.exp - now;

        // Refresh token 5 minutes before expiration
        const refreshIn = Math.max(0, (expiresIn - 300) * 1000);

        if (refreshIn > 0) {
          console.log(`[AuthManager] Token refresh scheduled in ${Math.round(refreshIn / 1000)} seconds`);
          this.refreshTimer = setTimeout(() => {
            this.refreshToken();
          }, refreshIn);
        } else {
          // Token is already expired or about to expire
          this.refreshToken();
        }
      }
    } catch (error) {
      console.error('[AuthManager] Error scheduling token refresh:', error);
    }
  }

  parseJWT(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('[AuthManager] Error parsing JWT:', error);
      return null;
    }
  }

  async refreshToken() {
    // Prevent concurrent refresh attempts
    if (this.isRefreshing) {
      return new Promise((resolve) => {
        this.refreshSubscribers.push(resolve);
      });
    }

    this.isRefreshing = true;

    try {
      const response = await fetch(`${API_URL}/refresh-token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        this.token = data.token;
        localStorage.setItem('authToken', data.token);

        // Notify all subscribers
        this.refreshSubscribers.forEach(callback => callback(data.token));
        this.refreshSubscribers = [];

        // Schedule next refresh
        this.scheduleTokenRefresh();

        console.log('[AuthManager] Token refreshed successfully');
        return data.token;
      } else if (response.status === 401) {
        // Token is invalid, try to re-authenticate if we have credentials
        if (this.stationCredentials) {
          return await this.reAuthenticate();
        }
        throw new Error('Token refresh failed');
      }
    } catch (error) {
      console.error('[AuthManager] Error refreshing token:', error);

      // Try to re-authenticate if we have credentials
      if (this.stationCredentials) {
        return await this.reAuthenticate();
      }

      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  async reAuthenticate() {
    if (!this.stationCredentials) {
      throw new Error('No stored credentials for re-authentication');
    }

    console.log('[AuthManager] Attempting re-authentication...');

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.stationCredentials.username,
          password: this.stationCredentials.password,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        this.token = data.token;
        localStorage.setItem('authToken', data.token);

        // Schedule token refresh
        this.scheduleTokenRefresh();

        // Reset retry attempts on successful auth
        this.retryAttempts = 0;

        console.log('[AuthManager] Re-authentication successful');
        return data.token;
      } else {
        throw new Error('Re-authentication failed');
      }
    } catch (error) {
      console.error('[AuthManager] Re-authentication error:', error);

      // Implement exponential backoff retry
      if (this.retryAttempts < this.maxRetries) {
        const delay = this.baseRetryDelay * Math.pow(2, this.retryAttempts);
        this.retryAttempts++;

        console.log(`[AuthManager] Retrying authentication in ${delay}ms (attempt ${this.retryAttempts}/${this.maxRetries})`);

        return new Promise((resolve, reject) => {
          setTimeout(async () => {
            try {
              const token = await this.reAuthenticate();
              resolve(token);
            } catch (err) {
              reject(err);
            }
          }, delay);
        });
      }

      throw error;
    }
  }

  async makeAuthenticatedRequest(url, options = {}) {
    const makeRequest = async (token) => {
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${token}`,
        },
      });
    };

    try {
      let response = await makeRequest(this.token);

      // If we get a 401, try to refresh the token
      if (response.status === 401) {
        console.log('[AuthManager] Got 401, attempting token refresh...');
        const newToken = await this.refreshToken();
        response = await makeRequest(newToken);
      }

      return response;
    } catch (error) {
      console.error('[AuthManager] Request error:', error);
      throw error;
    }
  }

  getToken() {
    return this.token;
  }

  destroy() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.token = null;
    this.refreshSubscribers = [];
    this.isRefreshing = false;
    this.retryAttempts = 0;
  }
}

// Create singleton instance
const authManager = new AuthManager();

export default authManager;