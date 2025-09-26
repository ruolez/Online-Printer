class StationStorage {
  constructor() {
    this.storageKey = 'printerStationData';
    this.queueKey = 'printerStationQueue';
    this.credentialsKey = 'stationCredentials';
    this.maxQueueSize = 100;
  }

  // Station data management
  saveStationData(station, sessionToken) {
    try {
      const data = {
        station,
        sessionToken,
        lastUpdated: new Date().toISOString(),
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
      localStorage.setItem('printerStation', JSON.stringify(station));
      localStorage.setItem('stationSessionToken', sessionToken);
      return true;
    } catch (error) {
      console.error('[StationStorage] Error saving station data:', error);
      return false;
    }
  }

  getStationData() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        return JSON.parse(stored);
      }

      // Fallback to legacy storage
      const legacyStation = localStorage.getItem('printerStation');
      const legacySession = localStorage.getItem('stationSessionToken');

      if (legacyStation && legacySession) {
        return {
          station: JSON.parse(legacyStation),
          sessionToken: legacySession,
          lastUpdated: null,
        };
      }

      return null;
    } catch (error) {
      console.error('[StationStorage] Error getting station data:', error);
      return null;
    }
  }

  clearStationData() {
    try {
      localStorage.removeItem(this.storageKey);
      localStorage.removeItem('printerStation');
      localStorage.removeItem('stationSessionToken');
      return true;
    } catch (error) {
      console.error('[StationStorage] Error clearing station data:', error);
      return false;
    }
  }

  // Credentials management (for auto-reconnection)
  saveCredentials(username, password) {
    try {
      // In production, use proper encryption
      const encrypted = btoa(JSON.stringify({ username, password }));
      localStorage.setItem(this.credentialsKey, encrypted);
      return true;
    } catch (error) {
      console.error('[StationStorage] Error saving credentials:', error);
      return false;
    }
  }

  getCredentials() {
    try {
      const encrypted = localStorage.getItem(this.credentialsKey);
      if (encrypted) {
        // In production, use proper decryption
        return JSON.parse(atob(encrypted));
      }
      return null;
    } catch (error) {
      console.error('[StationStorage] Error getting credentials:', error);
      return null;
    }
  }

  clearCredentials() {
    try {
      localStorage.removeItem(this.credentialsKey);
      return true;
    } catch (error) {
      console.error('[StationStorage] Error clearing credentials:', error);
      return false;
    }
  }

  // Operation queue management
  addToQueue(operation) {
    try {
      const queue = this.getQueue();

      // Limit queue size
      if (queue.length >= this.maxQueueSize) {
        queue.shift(); // Remove oldest operation
      }

      queue.push({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        ...operation,
      });

      localStorage.setItem(this.queueKey, JSON.stringify(queue));
      return true;
    } catch (error) {
      console.error('[StationStorage] Error adding to queue:', error);
      return false;
    }
  }

  getQueue() {
    try {
      const stored = localStorage.getItem(this.queueKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('[StationStorage] Error getting queue:', error);
      return [];
    }
  }

  removeFromQueue(operationId) {
    try {
      const queue = this.getQueue();
      const filtered = queue.filter(op => op.id !== operationId);
      localStorage.setItem(this.queueKey, JSON.stringify(filtered));
      return true;
    } catch (error) {
      console.error('[StationStorage] Error removing from queue:', error);
      return false;
    }
  }

  clearQueue() {
    try {
      localStorage.setItem(this.queueKey, JSON.stringify([]));
      return true;
    } catch (error) {
      console.error('[StationStorage] Error clearing queue:', error);
      return false;
    }
  }

  // Failed job tracking
  saveFailedJob(jobId, error, retryCount = 0) {
    try {
      const failed = this.getFailedJobs();
      failed.push({
        jobId,
        error,
        retryCount,
        timestamp: new Date().toISOString(),
      });

      // Keep only last 50 failed jobs
      const recent = failed.slice(-50);
      localStorage.setItem('failedJobs', JSON.stringify(recent));
      return true;
    } catch (error) {
      console.error('[StationStorage] Error saving failed job:', error);
      return false;
    }
  }

  getFailedJobs() {
    try {
      const stored = localStorage.getItem('failedJobs');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('[StationStorage] Error getting failed jobs:', error);
      return [];
    }
  }

  // Connection state persistence
  saveConnectionState(state) {
    try {
      localStorage.setItem('connectionState', JSON.stringify({
        ...state,
        timestamp: new Date().toISOString(),
      }));
      return true;
    } catch (error) {
      console.error('[StationStorage] Error saving connection state:', error);
      return false;
    }
  }

  getConnectionState() {
    try {
      const stored = localStorage.getItem('connectionState');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('[StationStorage] Error getting connection state:', error);
      return null;
    }
  }

  // Print job cache
  cachePrintJobs(jobs) {
    try {
      localStorage.setItem('cachedPrintJobs', JSON.stringify({
        jobs,
        timestamp: new Date().toISOString(),
      }));
      return true;
    } catch (error) {
      console.error('[StationStorage] Error caching print jobs:', error);
      return false;
    }
  }

  getCachedPrintJobs() {
    try {
      const stored = localStorage.getItem('cachedPrintJobs');
      if (stored) {
        const data = JSON.parse(stored);

        // Check if cache is still valid (5 minutes)
        const cacheAge = Date.now() - new Date(data.timestamp).getTime();
        if (cacheAge < 5 * 60 * 1000) {
          return data.jobs;
        }
      }
      return null;
    } catch (error) {
      console.error('[StationStorage] Error getting cached print jobs:', error);
      return null;
    }
  }

  // Recovery data
  saveRecoveryData(data) {
    try {
      localStorage.setItem('recoveryData', JSON.stringify({
        ...data,
        timestamp: new Date().toISOString(),
      }));
      return true;
    } catch (error) {
      console.error('[StationStorage] Error saving recovery data:', error);
      return false;
    }
  }

  getRecoveryData() {
    try {
      const stored = localStorage.getItem('recoveryData');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('[StationStorage] Error getting recovery data:', error);
      return null;
    }
  }

  clearRecoveryData() {
    try {
      localStorage.removeItem('recoveryData');
      return true;
    } catch (error) {
      console.error('[StationStorage] Error clearing recovery data:', error);
      return false;
    }
  }

  // Clear all station-related storage
  clearAll() {
    try {
      this.clearStationData();
      this.clearCredentials();
      this.clearQueue();
      this.clearRecoveryData();
      localStorage.removeItem('failedJobs');
      localStorage.removeItem('connectionState');
      localStorage.removeItem('cachedPrintJobs');
      return true;
    } catch (error) {
      console.error('[StationStorage] Error clearing all data:', error);
      return false;
    }
  }
}

// Create singleton instance
const stationStorage = new StationStorage();

export default stationStorage;