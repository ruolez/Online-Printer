import { useState, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Printer,
  MapPin,
  Activity,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Power,
  FileText,
  Clock,
  History,
  Loader2,
  WifiOff,
  Wifi,
  Shield,
} from "lucide-react";
import autoPrintManager from "../services/AutoPrintManager";
import authManager from "../services/AuthManager";
import connectionMonitor from "../services/ConnectionMonitor";
import stationStorage from "../services/StationStorage";

const API_URL = "/api";

export function PrinterStation({ token, username }) {
  const [station, setStation] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [registering, setRegistering] = useState(false);
  const [stationName, setStationName] = useState("");
  const [stationLocation, setStationLocation] = useState("");
  const [printJobs, setPrintJobs] = useState([]);
  const [jobsByStatus, setJobsByStatus] = useState({
    pending: [],
    printing: [],
    completed: [],
    failed: [],
  });
  const [printStats, setPrintStats] = useState(null);
  const [activeTab, setActiveTab] = useState("queue");
  const [status, setStatus] = useState("offline");
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState('unknown');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [lastError, setLastError] = useState(null);
  const heartbeatInterval = useRef(null);
  const pollInterval = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 10;

  useEffect(() => {
    // Initialize services
    authManager.init(token);
    connectionMonitor.init(token);

    // Set up connection monitoring
    connectionMonitor.on('backend-connected', handleConnectionRestored);
    connectionMonitor.on('backend-disconnected', handleConnectionLost);
    connectionMonitor.on('online', handleNetworkOnline);
    connectionMonitor.on('offline', handleNetworkOffline);

    // Try to restore session
    const stationData = stationStorage.getStationData();
    if (stationData && stationData.station && stationData.sessionToken) {
      console.log('[PrinterStation] Restoring station session from storage');
      setStation(stationData.station);
      setSessionToken(stationData.sessionToken);

      // Start operations
      startHeartbeat(stationData.station.id, stationData.sessionToken);
      startPolling(stationData.station.id);

      // Initialize AutoPrintManager for this station
      console.log('[PrinterStation] Initializing AutoPrintManager for station:', stationData.station.id);
      autoPrintManager.init(token, stationData.station.id);

      // Check connection status
      setConnectionStatus(connectionMonitor.getStatus());
    }

    return () => {
      stopHeartbeat();
      stopPolling();
      // Cleanup services
      autoPrintManager.destroy();
      connectionMonitor.off('backend-connected', handleConnectionRestored);
      connectionMonitor.off('backend-disconnected', handleConnectionLost);
      connectionMonitor.off('online', handleNetworkOnline);
      connectionMonitor.off('offline', handleNetworkOffline);
    };
  }, [token]);

  // Connection event handlers
  const handleConnectionRestored = async () => {
    console.log('[PrinterStation] Connection restored');
    setConnectionStatus('connected');
    setIsReconnecting(false);
    reconnectAttempts.current = 0;

    // If we have a station, restart operations
    if (station && sessionToken) {
      await reconnectStation();
    }
  };

  const handleConnectionLost = () => {
    console.log('[PrinterStation] Connection lost');
    setConnectionStatus('disconnected');
    setStatus('error');

    // Don't clear station data - we'll reconnect
    if (station) {
      setIsReconnecting(true);
    }
  };

  const handleNetworkOnline = () => {
    console.log('[PrinterStation] Network online');
    setConnectionStatus('checking');
  };

  const handleNetworkOffline = () => {
    console.log('[PrinterStation] Network offline');
    setConnectionStatus('offline');
    setStatus('offline');
  };

  const reconnectStation = async () => {
    if (!station || !sessionToken) return;

    console.log('[PrinterStation] Attempting to reconnect station...');
    setIsReconnecting(true);

    try {
      // Try to reconnect with existing session
      const response = await authManager.makeAuthenticatedRequest(
        `${API_URL}/stations/${station.id}/reconnect`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_token: sessionToken }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('[PrinterStation] Reconnection successful');

        // Update session
        setSessionToken(data.session_token);
        setStation(data.station);

        // Save to storage
        stationStorage.saveStationData(data.station, data.session_token);

        // Restart operations
        startHeartbeat(data.station.id, data.session_token);
        startPolling(data.station.id);

        setStatus('online');
        setIsReconnecting(false);
        setError('');
        reconnectAttempts.current = 0;
      } else {
        throw new Error('Reconnection failed');
      }
    } catch (error) {
      console.error('[PrinterStation] Reconnection error:', error);
      setLastError(error.message);

      // Retry with exponential backoff
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(5000 * Math.pow(2, reconnectAttempts.current), 60000);
        reconnectAttempts.current++;

        console.log(`[PrinterStation] Retrying reconnection in ${delay}ms (attempt ${reconnectAttempts.current})`);
        setTimeout(() => reconnectStation(), delay);
      } else {
        setError('Failed to reconnect after multiple attempts. Please re-register the station.');
        setIsReconnecting(false);
      }
    }
  };

  const startHeartbeat = (stationId, session) => {
    // Clear any existing interval
    stopHeartbeat();

    // Send heartbeat immediately
    sendHeartbeat(stationId, session);

    // Send heartbeat every 30 seconds
    heartbeatInterval.current = setInterval(() => {
      sendHeartbeat(stationId, session);
    }, 30000);
  };

  const stopHeartbeat = () => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = null;
    }
  };

  const sendHeartbeat = async (stationId, session) => {
    // Don't send heartbeat if we're offline
    if (!connectionMonitor.isConnected()) {
      console.log('[PrinterStation] Skipping heartbeat - not connected');
      return;
    }

    try {
      const response = await authManager.makeAuthenticatedRequest(
        `${API_URL}/stations/${stationId}/heartbeat`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_token: session,
            status: "online",
          }),
        }
      );

      if (response.ok) {
        setStatus("online");
        setError("");
        reconnectAttempts.current = 0;
      } else {
        setStatus("error");
        if (response.status === 401) {
          // Session expired, try to reconnect
          console.log('[PrinterStation] Session expired, attempting reconnection...');
          await reconnectStation();
        }
      }
    } catch (e) {
      console.error("[PrinterStation] Heartbeat failed:", e);
      setStatus("error");

      // Queue heartbeat for retry when connection restored
      if (!connectionMonitor.isConnected()) {
        connectionMonitor.queueOperation({
          type: 'heartbeat',
          data: {
            url: `${API_URL}/stations/${stationId}/heartbeat`,
            options: {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                session_token: session,
                status: "online",
              }),
            },
          },
        });
      }
    }
  };

  const startPolling = (stationId) => {
    // Clear any existing interval
    stopPolling();

    // Poll immediately
    pollForJobs(stationId);

    // Poll every 5 seconds for new jobs
    pollInterval.current = setInterval(() => {
      pollForJobs(stationId);
    }, 5000);
  };

  const stopPolling = () => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }
  };

  const pollForJobs = async (stationId) => {
    // Don't poll if we're offline
    if (!connectionMonitor.isConnected()) {
      // Use cached data if available
      const cachedJobs = stationStorage.getCachedPrintJobs();
      if (cachedJobs) {
        setPrintJobs(cachedJobs);
      }
      return;
    }

    try {
      const response = await authManager.makeAuthenticatedRequest(
        `${API_URL}/print-queue/station/${stationId}`,
        { headers: {} }
      );

      if (response.ok) {
        const data = await response.json();
        setPrintJobs(data.print_jobs || []);

        // Cache the jobs for offline access
        stationStorage.cachePrintJobs(data.print_jobs || []);

        // Set jobs by status for tabbed display
        if (data.jobs_by_status) {
          setJobsByStatus(data.jobs_by_status);
        }

        // Check for pending jobs
        const pendingJobs = data.jobs_by_status?.pending || [];
        if (pendingJobs.length > 0) {
          console.log(`[PrinterStation] ${pendingJobs.length} pending print job(s) detected`);
          // AutoPrintManager will handle the actual printing
        }
      }

      // Fetch history stats if on history tab
      if (activeTab === "history") {
        const historyResponse = await fetch(
          `${API_URL}/print-queue/station/${stationId}/history?limit=20`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (historyResponse.ok) {
          const historyData = await historyResponse.json();
          setPrintStats(historyData.stats);
          // Update completed/failed jobs with full history
          setJobsByStatus(prev => ({
            ...prev,
            completed: historyData.history.filter(j => j.status === "completed"),
            failed: historyData.history.filter(j => j.status === "failed"),
          }));
        }
      }
    } catch (e) {
      console.error("Error polling for jobs:", e);
    }
  };

  const handleRegister = async () => {
    if (!stationName.trim()) {
      setError("Station name is required");
      return;
    }

    setRegistering(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/stations/register`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          station_name: stationName,
          station_location: stationLocation,
          capabilities: {
            color: true,
            duplex: true,
            paper_sizes: ["A4", "Letter"],
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setStation(data.station);
        setSessionToken(data.session_token);

        // Save to storage
        stationStorage.saveStationData(data.station, data.session_token);

        // Start heartbeat and polling
        startHeartbeat(data.station.id, data.session_token);
        startPolling(data.station.id);

        // Initialize AutoPrintManager for this station
        console.log('[PrinterStation] Initializing AutoPrintManager for new station:', data.station.id);
        autoPrintManager.init(token, data.station.id);

        setStatus("online");
      } else {
        const error = await response.json();
        setError(error.message || "Failed to register station");
      }
    } catch (e) {
      setError("Network error. Please try again.");
    } finally {
      setRegistering(false);
    }
  };

  const handleUnregister = async () => {
    if (!station) return;

    try {
      await fetch(`${API_URL}/stations/${station.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      console.error("Error unregistering station:", e);
    }

    // Clear everything
    stopHeartbeat();
    stopPolling();
    setStation(null);
    setSessionToken(null);
    setStatus("offline");
    setPrintJobs([]);

    // Clear storage
    stationStorage.clearStationData();
    stationStorage.clearCredentials();

    // Stop AutoPrintManager
    autoPrintManager.destroy();
  };

  const getStatusColor = () => {
    if (isReconnecting) return "text-yellow-500";
    switch (status) {
      case "online":
        return "text-green-500";
      case "offline":
        return "text-gray-500";
      case "error":
        return "text-red-500";
      default:
        return "text-yellow-500";
    }
  };

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Wifi className="h-4 w-4 text-green-500" />;
      case 'disconnected':
        return <WifiOff className="h-4 w-4 text-red-500" />;
      case 'offline':
        return <WifiOff className="h-4 w-4 text-gray-500" />;
      default:
        return <Activity className="h-4 w-4 text-yellow-500 animate-pulse" />;
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "online":
        return <CheckCircle className="h-5 w-5" />;
      case "offline":
        return <XCircle className="h-5 w-5" />;
      case "error":
        return <AlertCircle className="h-5 w-5" />;
      default:
        return <Activity className="h-5 w-5" />;
    }
  };

  if (!station) {
    return (
      <div className="container mx-auto p-4 max-w-2xl">
        <Card className="dark:dark-glass">
          <CardHeader>
            <CardTitle>Register Printer Station</CardTitle>
            <CardDescription>
              Set up this device as a remote printer station
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="station-name">
                <Printer className="h-4 w-4 inline mr-1" />
                Station Name
              </Label>
              <Input
                id="station-name"
                placeholder="e.g., Office Printer, Home Printer"
                value={stationName}
                onChange={(e) => setStationName(e.target.value)}
                disabled={registering}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="station-location">
                <MapPin className="h-4 w-4 inline mr-1" />
                Location (Optional)
              </Label>
              <Input
                id="station-location"
                placeholder="e.g., 2nd Floor, Room 201"
                value={stationLocation}
                onChange={(e) => setStationLocation(e.target.value)}
                disabled={registering}
              />
            </div>

            <Button
              onClick={handleRegister}
              disabled={registering}
              className="w-full"
            >
              {registering ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Registering...
                </>
              ) : (
                <>
                  <Printer className="mr-2 h-4 w-4" />
                  Register as Printer Station
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl space-y-6">
      {/* Station Status Card */}
      <Card className="dark:dark-glass">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                {station.station_name}
              </CardTitle>
              <CardDescription className="mt-1">
                {station.station_location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {station.station_location}
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1 ${getStatusColor()}`}>
                {getStatusIcon()}
                <span className="font-medium capitalize">
                  {isReconnecting ? 'Reconnecting...' : status}
                </span>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-secondary">
                {getConnectionIcon()}
                <span className="text-xs capitalize">{connectionStatus}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnregister}
                disabled={isReconnecting}
              >
                <Power className="h-4 w-4 mr-1" />
                Disconnect
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Station ID</p>
              <p className="font-mono">{station.id}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Registered</p>
              <p>{new Date(station.created_at).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Last Heartbeat</p>
              <p>{station.last_heartbeat ? new Date(station.last_heartbeat).toLocaleTimeString() : "Never"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Active Jobs</p>
              <p className="font-semibold">
                {jobsByStatus.pending.length + jobsByStatus.printing.length}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Completed Today</p>
              <p className="font-semibold">
                {printStats?.last_24h || jobsByStatus.completed.length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Print Queue with Tabs */}
      <Card className="dark:dark-glass">
        <CardHeader>
          <CardTitle>Print Management</CardTitle>
          <CardDescription>
            Active queue and print history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="queue">
                <Printer className="h-4 w-4 mr-2" />
                Active Queue ({jobsByStatus.pending.length + jobsByStatus.printing.length})
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="h-4 w-4 mr-2" />
                Print History ({jobsByStatus.completed.length + jobsByStatus.failed.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="queue" className="mt-4">
              {jobsByStatus.pending.length === 0 && jobsByStatus.printing.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No active print jobs</p>
                  <p className="text-sm mt-1">Jobs will appear here when sent to this station</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Printing Jobs First */}
                  {jobsByStatus.printing.map((job) => (
                    <PrintJobCard key={job.id} job={job} isPrinting />
                  ))}

                  {/* Then Pending Jobs */}
                  {jobsByStatus.pending.map((job) => (
                    <PrintJobCard key={job.id} job={job} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              {jobsByStatus.completed.length === 0 && jobsByStatus.failed.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No print history yet</p>
                  <p className="text-sm mt-1">Completed and failed jobs will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Show stats if available */}
                  {printStats && (
                    <div className="grid grid-cols-3 gap-4 p-4 bg-secondary/50 rounded-lg mb-4">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Total Printed</p>
                        <p className="text-xl font-semibold text-green-600">{printStats.total_printed}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Failed</p>
                        <p className="text-xl font-semibold text-red-600">{printStats.total_failed}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Last 24h</p>
                        <p className="text-xl font-semibold">{printStats.last_24h}</p>
                      </div>
                    </div>
                  )}

                  {/* Completed Jobs */}
                  {jobsByStatus.completed.map((job) => (
                    <PrintJobCard key={job.id} job={job} isHistory />
                  ))}

                  {/* Failed Jobs */}
                  {jobsByStatus.failed.map((job) => (
                    <PrintJobCard key={job.id} job={job} isHistory />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// PrintJobCard component for displaying individual print jobs
function PrintJobCard({ job, isPrinting = false, isHistory = false }) {
  const getStatusIcon = () => {
    switch (job.status) {
      case "pending":
        return <Clock className="h-5 w-5 text-gray-500" />;
      case "printing":
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <FileText className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusLabel = () => {
    switch (job.status) {
      case "pending":
        return "Pending";
      case "printing":
        return "Printing...";
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      default:
        return job.status;
    }
  };

  const getTimeDisplay = () => {
    if (job.printed_at && job.status === "completed") {
      const printedDate = new Date(job.printed_at);
      const createdDate = new Date(job.created_at);
      const duration = Math.round((printedDate - createdDate) / 1000); // seconds

      return (
        <div className="text-sm text-muted-foreground">
          <p className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            Printed: {printedDate.toLocaleString()}
          </p>
          <p className="text-xs">Duration: {duration}s</p>
        </div>
      );
    } else if (job.status === "failed" && job.error) {
      return (
        <div className="text-sm text-muted-foreground">
          <p className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Failed: {new Date(job.created_at).toLocaleString()}
          </p>
          <p className="text-xs text-red-500">{job.error}</p>
        </div>
      );
    } else {
      return (
        <p className="text-sm text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Queued: {new Date(job.created_at).toLocaleString()}
        </p>
      );
    }
  };

  return (
    <div
      className={`flex items-center justify-between p-3 border rounded-lg transition-all ${
        isPrinting ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20 animate-pulse" : ""
      } ${job.status === "failed" ? "border-red-500/50 bg-red-50 dark:bg-red-950/20" : ""}`}
    >
      <div className="flex items-center gap-3">
        {getStatusIcon()}
        <div>
          <p className="font-medium">{job.filename}</p>
          {getTimeDisplay()}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge
          variant={
            job.status === "completed"
              ? "success"
              : job.status === "printing"
              ? "default"
              : job.status === "failed"
              ? "destructive"
              : "secondary"
          }
        >
          {getStatusLabel()}
        </Badge>
      </div>
    </div>
  );
}