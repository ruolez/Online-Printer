import { isPWA, storePWAStatus } from '../utils/pwaDetection';

const API_URL = '/api';

class AutoPrintManager {
  constructor() {
    this.token = null;
    this.settings = null;
    this.isRunning = false;
    this.checkInterval = null;
    // Load previously checked files from localStorage to prevent re-processing
    this.lastCheckedFiles = this.loadCheckedFiles();
    // Flag to prevent concurrent print attempts
    this.isPrinting = false;
    // Track jobs that have been scheduled for printing
    this.scheduledJobs = new Set();
  }

  loadCheckedFiles() {
    try {
      const stored = localStorage.getItem('autoPrintCheckedFiles');
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (error) {
      console.error('[AutoPrintManager] Error loading checked files:', error);
    }
    return new Set();
  }

  saveCheckedFiles() {
    try {
      const fileIds = Array.from(this.lastCheckedFiles);
      // Keep only the last 100 file IDs
      const recentIds = fileIds.slice(-100);
      localStorage.setItem('autoPrintCheckedFiles', JSON.stringify(recentIds));
    } catch (error) {
      console.error('[AutoPrintManager] Error saving checked files:', error);
    }
  }

  async init(token, stationId = null) {
    this.token = token;
    this.stationId = stationId;

    // Store PWA status on init
    const isPWAMode = storePWAStatus();

    // Only initialize auto-print if we're in PWA mode
    if (!isPWAMode) {
      console.log('[AutoPrintManager] Not running in PWA mode - auto-print disabled');
      return;
    }

    console.log(`[AutoPrintManager] Running in PWA mode - auto-print enabled for ${stationId ? `station ${stationId}` : 'user'}`);
    await this.fetchSettings();

    // For printer stations, always enable auto-print
    // For regular users, check the auto_print_enabled setting
    if (this.stationId || this.settings?.auto_print_enabled) {
      this.start();
    }
  }

  async fetchSettings() {
    try {
      const response = await fetch(`${API_URL}/settings`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });

      if (response.ok) {
        this.settings = await response.json();
      }
    } catch (error) {
      console.error('[AutoPrintManager] Error fetching settings:', error);
    }
  }

  start() {
    if (this.isRunning) return;

    // Double-check we're in PWA mode before starting
    if (!isPWA()) {
      console.log('[AutoPrintManager] Cannot start - not in PWA mode');
      return;
    }

    console.log('[AutoPrintManager] Starting auto-print monitoring...');
    this.isRunning = true;

    // Check for new files every 10 seconds (reduced from 3 to avoid overwhelming the API)
    this.checkInterval = setInterval(() => {
      this.checkForNewFiles();
    }, 10000);

    // Initial check
    this.checkForNewFiles();
  }

  stop() {
    if (!this.isRunning) return;

    console.log('[AutoPrintManager] Stopping auto-print monitoring...');
    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async checkPendingJobs() {
    try {
      // If we have a station ID, check station-specific jobs
      let url = `${API_URL}/print-queue`;
      if (this.stationId) {
        url = `${API_URL}/print-queue/station/${this.stationId}`;
      }

      const queueResponse = await fetch(url, {
        headers: { Authorization: `Bearer ${this.token}` },
      });

      if (queueResponse.ok) {
        const queueData = await queueResponse.json();
        const pendingJobs = queueData.print_jobs?.filter(job => job.status === 'pending') || [];

        if (pendingJobs.length > 0) {
          console.log(`[AutoPrintManager] Found ${pendingJobs.length} pending print job(s) for ${this.stationId ? `station ${this.stationId}` : 'user'}`);

          // Only schedule if not already printing and job not already scheduled
          const firstPendingJob = pendingJobs[0];
          if (!this.isPrinting && !this.scheduledJobs.has(firstPendingJob.id)) {
            console.log(`[AutoPrintManager] Scheduling print for job ${firstPendingJob.id}`);
            this.scheduledJobs.add(firstPendingJob.id);
            setTimeout(() => this.autoPrintNext(), 1000);
          }
        }
      }
    } catch (error) {
      console.error('[AutoPrintManager] Error checking pending jobs:', error);
    }
  }

  async checkForNewFiles() {
    // For printer stations, always check for jobs
    // For regular users, check the auto_print_enabled setting
    if (!this.stationId && !this.settings?.auto_print_enabled) {
      this.stop();
      return;
    }

    try {
      // First, check for any pending jobs in the print queue
      await this.checkPendingJobs();

      // For printer stations, we don't need to check for new files
      // as they only receive jobs sent to them
      if (this.stationId) {
        return;
      }

      // Then, fetch recent files to see if there are new ones (only for non-station mode)
      const response = await fetch(`${API_URL}/files?limit=10`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });

      if (response.ok) {
        const data = await response.json();
        const files = data.files || [];

        // Check for new files that haven't been processed yet
        for (const file of files) {
          if (!this.lastCheckedFiles.has(file.id) && file.status === 'completed') {
            console.log('[AutoPrintManager] New file detected:', file.filename);

            // Add to checked files and save to localStorage
            this.lastCheckedFiles.add(file.id);
            this.saveCheckedFiles();

            // Check if file is already in print queue (including completed jobs)
            const queueResponse = await fetch(`${API_URL}/print-queue`, {
              headers: { Authorization: `Bearer ${this.token}` },
            });

            if (queueResponse.ok) {
              const queueData = await queueResponse.json();
              // Check for ANY existing job for this file (not just pending/printing)
              const existingJob = queueData.print_jobs?.find(
                job => job.file_id === file.id
              );

              if (!existingJob) {
                // Only add to print queue if auto-print is enabled
                if (this.settings.auto_print_enabled) {
                  // Add to print queue
                  await this.addToPrintQueue(file.id);
                  // Trigger automatic printing
                  setTimeout(() => this.autoPrintNext(), 1000);
                }
              } else {
                console.log('[AutoPrintManager] File already in print queue:', file.filename, 'Status:', existingJob.status);
                // If the job exists and is pending, try to print it
                if (existingJob.status === 'pending' && this.settings.auto_print_enabled) {
                  // Only schedule if not already scheduled by checkPendingJobs
                  if (!this.isPrinting && !this.scheduledJobs.has(existingJob.id)) {
                    console.log('[AutoPrintManager] Scheduling print for existing job:', existingJob.id);
                    this.scheduledJobs.add(existingJob.id);
                    setTimeout(() => this.autoPrintNext(), 1000);
                  }
                }
              }
            }
          }
        }

        // Keep only recent file IDs in memory (max 100)
        if (this.lastCheckedFiles.size > 100) {
          const idsArray = Array.from(this.lastCheckedFiles);
          this.lastCheckedFiles = new Set(idsArray.slice(-50));
        }
      }
    } catch (error) {
      console.error('[AutoPrintManager] Error checking for new files:', error);
    }
  }

  async addToPrintQueue(fileId) {
    try {
      const response = await fetch(`${API_URL}/print-queue/add/${fileId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
      });

      if (response.ok) {
        console.log('[AutoPrintManager] File added to print queue:', fileId);

        // Show notification if available
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('File added to print queue', {
            body: 'A new file has been queued for printing.',
            icon: '/pwa-192x192.png',
          });
        }
      }
    } catch (error) {
      console.error('[AutoPrintManager] Error adding to print queue:', error);
    }
  }

  async autoPrintNext() {
    // Prevent concurrent print attempts
    if (this.isPrinting) {
      console.log('[AutoPrintManager] Already printing, skipping...');
      return;
    }

    try {
      this.isPrinting = true;

      // Build URL with optional station_id
      let url = `${API_URL}/print-queue/next`;
      if (this.stationId) {
        url += `?station_id=${this.stationId}`;
      }

      // Get next print job
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.token}` },
      });

      if (response.ok) {
        const data = await response.json();

        if (data.print_job && !data.message) {
          // Clear this job from scheduled list
          this.scheduledJobs.delete(data.print_job.id);

          // Only print if status is actually pending (double-check)
          if (data.print_job.status === 'pending') {
            await this.printFile(data.print_job);
          } else {
            console.log(`[AutoPrintManager] Job ${data.print_job.id} is not pending (status: ${data.print_job.status}), skipping...`);
          }
        } else {
          // No pending jobs, clear the scheduled set
          this.scheduledJobs.clear();
        }
      }
    } catch (error) {
      console.error('[AutoPrintManager] Error auto-printing:', error);
    } finally {
      this.isPrinting = false;
    }
  }

  async printFile(printJob) {
    try {
      // Update status to printing
      await this.updateJobStatus(printJob.id, 'printing');

      // First, fetch the PDF file as a blob
      const response = await fetch(`${API_URL}/files/${printJob.file_id}/download`, {
        headers: {
          Authorization: `Bearer ${this.token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }

      // Convert response to blob
      const blob = await response.blob();

      // Create a blob URL that the browser can access directly
      const blobUrl = URL.createObjectURL(blob);

      // Use native browser printing with iframe
      await this.printUsingNativeBrowser(blobUrl, printJob.id);

    } catch (error) {
      console.error('[AutoPrintManager] Error printing file:', error);
      await this.updateJobStatus(printJob.id, 'failed', error?.message || 'Print failed');
    }
  }

  async printUsingNativeBrowser(blobUrl, jobId) {
    return new Promise((resolve, reject) => {
      try {
        // Create a hidden iframe
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.top = '-9999px';
        iframe.style.left = '-9999px';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        iframe.src = blobUrl;

        // Handle iframe load
        iframe.onload = async () => {
          try {
            // Small delay to ensure PDF is fully loaded
            setTimeout(async () => {
              try {
                // Focus the iframe and print
                iframe.contentWindow.focus();
                iframe.contentWindow.print();

                // Mark as completed after a delay (print dialog is async)
                // We can't detect when print dialog closes with native print
                setTimeout(async () => {
                  // Clean up
                  document.body.removeChild(iframe);
                  URL.revokeObjectURL(blobUrl);

                  // Update status to completed
                  await this.updateJobStatus(jobId, 'completed');
                  console.log('[AutoPrintManager] Print job completed:', jobId);
                  resolve();
                }, 1000);

              } catch (printError) {
                console.error('[AutoPrintManager] Print error:', printError);
                document.body.removeChild(iframe);
                URL.revokeObjectURL(blobUrl);
                await this.updateJobStatus(jobId, 'failed', printError.message);
                reject(printError);
              }
            }, 500);
          } catch (error) {
            console.error('[AutoPrintManager] Iframe load error:', error);
            document.body.removeChild(iframe);
            URL.revokeObjectURL(blobUrl);
            await this.updateJobStatus(jobId, 'failed', error.message);
            reject(error);
          }
        };

        // Handle iframe error
        iframe.onerror = async (error) => {
          console.error('[AutoPrintManager] Failed to load PDF in iframe:', error);
          document.body.removeChild(iframe);
          URL.revokeObjectURL(blobUrl);
          await this.updateJobStatus(jobId, 'failed', 'Failed to load PDF');
          reject(error);
        };

        // Add iframe to document
        document.body.appendChild(iframe);

      } catch (error) {
        console.error('[AutoPrintManager] Error setting up print:', error);
        URL.revokeObjectURL(blobUrl);
        this.updateJobStatus(jobId, 'failed', error.message).then(() => {
          reject(error);
        });
      }
    });
  }

  async updateJobStatus(jobId, status, error = null) {
    try {
      const body = { status };
      if (error) body.error = error;

      await fetch(`${API_URL}/print-queue/${jobId}/status`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error('[AutoPrintManager] Error updating job status:', err);
    }
  }

  async updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };

    if (this.settings.auto_print_enabled && !this.isRunning) {
      this.start();
    } else if (!this.settings.auto_print_enabled && this.isRunning) {
      this.stop();
    }
  }

  destroy() {
    this.stop();
    this.token = null;
    this.settings = null;
    this.lastCheckedFiles.clear();
    this.scheduledJobs.clear();
    this.isPrinting = false;
  }
}

// Create singleton instance
const autoPrintManager = new AutoPrintManager();

export default autoPrintManager;