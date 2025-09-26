const API_URL = '/api';

class ConnectionMonitor {
  constructor() {
    this.isOnline = navigator.onLine;
    this.isConnectedToBackend = false;
    this.listeners = new Map();
    this.pingInterval = null;
    this.reconnectTimer = null;
    this.pingFrequency = 30000; // 30 seconds
    this.reconnectDelay = 5000; // 5 seconds
    this.maxReconnectDelay = 60000; // 1 minute
    this.reconnectAttempts = 0;
    this.operationQueue = [];
    this.isProcessingQueue = false;
  }

  init(token) {
    this.token = token;
    this.setupEventListeners();
    this.startPinging();

    // Initial connection check
    this.checkBackendConnection();
  }

  setupEventListeners() {
    // Listen for online/offline events
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));

    // Also check on visibility change (when tab becomes active)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        console.log('[ConnectionMonitor] Tab became visible, checking connection...');
        this.checkBackendConnection();
      }
    });

    // Check connection on focus
    window.addEventListener('focus', () => {
      console.log('[ConnectionMonitor] Window focused, checking connection...');
      this.checkBackendConnection();
    });
  }

  handleOnline() {
    console.log('[ConnectionMonitor] Network is online');
    this.isOnline = true;
    this.emit('online');

    // Check backend connection
    this.checkBackendConnection();
  }

  handleOffline() {
    console.log('[ConnectionMonitor] Network is offline');
    this.isOnline = false;
    this.isConnectedToBackend = false;
    this.emit('offline');
    this.emit('backend-disconnected');

    // Stop pinging when offline
    this.stopPinging();

    // Start reconnection attempts
    this.scheduleReconnect();
  }

  startPinging() {
    // Clear any existing interval
    this.stopPinging();

    // Only ping if online
    if (!this.isOnline) return;

    // Start periodic pings
    this.pingInterval = setInterval(() => {
      this.checkBackendConnection();
    }, this.pingFrequency);
  }

  stopPinging() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  async checkBackendConnection() {
    // Don't check if we know we're offline
    if (!this.isOnline) return false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(`${API_URL}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        const wasDisconnected = !this.isConnectedToBackend;
        this.isConnectedToBackend = true;
        this.reconnectAttempts = 0;

        if (wasDisconnected) {
          console.log('[ConnectionMonitor] Backend connection established');
          this.emit('backend-connected');

          // Process any queued operations
          this.processQueue();
        }

        return true;
      } else {
        throw new Error(`Health check failed: ${response.status}`);
      }
    } catch (error) {
      console.error('[ConnectionMonitor] Backend connection check failed:', error);

      const wasConnected = this.isConnectedToBackend;
      this.isConnectedToBackend = false;

      if (wasConnected) {
        console.log('[ConnectionMonitor] Backend connection lost');
        this.emit('backend-disconnected');
      }

      // Schedule reconnection attempt
      this.scheduleReconnect();

      return false;
    }
  }

  scheduleReconnect() {
    // Clear any existing reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    // Don't reconnect if offline
    if (!this.isOnline) return;

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;

    console.log(`[ConnectionMonitor] Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(async () => {
      if (this.isOnline) {
        const connected = await this.checkBackendConnection();

        // If still not connected, schedule another attempt
        if (!connected) {
          this.scheduleReconnect();
        }
      }
    }, delay);
  }

  // Queue operations when offline
  queueOperation(operation) {
    console.log('[ConnectionMonitor] Queuing operation for when connection is restored');
    this.operationQueue.push(operation);

    // Save to localStorage for persistence
    this.saveQueue();
  }

  async processQueue() {
    if (this.isProcessingQueue || this.operationQueue.length === 0) return;

    this.isProcessingQueue = true;
    console.log(`[ConnectionMonitor] Processing ${this.operationQueue.length} queued operations`);

    while (this.operationQueue.length > 0 && this.isConnectedToBackend) {
      const operation = this.operationQueue.shift();

      try {
        await operation();
      } catch (error) {
        console.error('[ConnectionMonitor] Error processing queued operation:', error);

        // Re-queue the operation if it fails
        this.operationQueue.unshift(operation);
        break;
      }
    }

    this.saveQueue();
    this.isProcessingQueue = false;
  }

  saveQueue() {
    try {
      // Convert functions to storable format
      const storableQueue = this.operationQueue.map(op => ({
        type: op.type,
        data: op.data,
      }));

      localStorage.setItem('connectionQueue', JSON.stringify(storableQueue));
    } catch (error) {
      console.error('[ConnectionMonitor] Error saving queue:', error);
    }
  }

  loadQueue() {
    try {
      const stored = localStorage.getItem('connectionQueue');
      if (stored) {
        const storableQueue = JSON.parse(stored);

        // Convert back to executable operations
        // This would need to be implemented based on operation types
        this.operationQueue = storableQueue.map(item => {
          // Reconstruct operation based on type and data
          return () => this.executeQueuedOperation(item.type, item.data);
        });
      }
    } catch (error) {
      console.error('[ConnectionMonitor] Error loading queue:', error);
    }
  }

  async executeQueuedOperation(type, data) {
    // Implement based on operation types
    console.log(`[ConnectionMonitor] Executing queued operation: ${type}`, data);

    // This would be expanded based on actual operation types
    switch (type) {
      case 'heartbeat':
        return fetch(data.url, data.options);
      case 'print':
        return fetch(data.url, data.options);
      default:
        console.warn(`[ConnectionMonitor] Unknown operation type: ${type}`);
    }
  }

  // Event emitter methods
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  // Utility methods
  isConnected() {
    return this.isOnline && this.isConnectedToBackend;
  }

  getStatus() {
    if (!this.isOnline) return 'offline';
    if (!this.isConnectedToBackend) return 'disconnected';
    return 'connected';
  }

  async waitForConnection(timeout = 30000) {
    if (this.isConnected()) return true;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.off('backend-connected', handler);
        resolve(false);
      }, timeout);

      const handler = () => {
        clearTimeout(timer);
        resolve(true);
      };

      this.on('backend-connected', handler);
    });
  }

  destroy() {
    this.stopPinging();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);

    this.listeners.clear();
    this.operationQueue = [];
  }
}

// Create singleton instance
const connectionMonitor = new ConnectionMonitor();

export default connectionMonitor;