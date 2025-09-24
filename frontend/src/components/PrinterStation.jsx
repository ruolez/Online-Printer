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
} from "lucide-react";
import autoPrintManager from "../services/AutoPrintManager";

const API_URL = "/api";

export function PrinterStation({ token }) {
  const [station, setStation] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [registering, setRegistering] = useState(false);
  const [stationName, setStationName] = useState("");
  const [stationLocation, setStationLocation] = useState("");
  const [printJobs, setPrintJobs] = useState([]);
  const [status, setStatus] = useState("offline");
  const [error, setError] = useState("");
  const heartbeatInterval = useRef(null);
  const pollInterval = useRef(null);

  useEffect(() => {
    // Try to restore session from localStorage
    const savedStation = localStorage.getItem("printerStation");
    const savedSession = localStorage.getItem("stationSessionToken");

    if (savedStation && savedSession) {
      try {
        const stationData = JSON.parse(savedStation);
        setStation(stationData);
        setSessionToken(savedSession);
        startHeartbeat(stationData.id, savedSession);
        startPolling(stationData.id);

        // Initialize AutoPrintManager for this station
        console.log('[PrinterStation] Initializing AutoPrintManager for station:', stationData.id);
        autoPrintManager.init(token, stationData.id);
      } catch (e) {
        console.error("Error restoring station session:", e);
      }
    }

    return () => {
      stopHeartbeat();
      stopPolling();
      // Cleanup AutoPrintManager
      autoPrintManager.destroy();
    };
  }, [token]);

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
    try {
      const response = await fetch(`${API_URL}/stations/${stationId}/heartbeat`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_token: session,
          status: "online",
        }),
      });

      if (response.ok) {
        setStatus("online");
        setError("");
      } else {
        setStatus("error");
        if (response.status === 401) {
          // Session expired, need to re-register
          handleUnregister();
        }
      }
    } catch (e) {
      console.error("Heartbeat failed:", e);
      setStatus("error");
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
    try {
      const response = await fetch(`${API_URL}/print-queue/station/${stationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setPrintJobs(data.print_jobs || []);

        // Check for pending jobs
        const pendingJobs = data.print_jobs?.filter(job => job.status === "pending") || [];
        if (pendingJobs.length > 0) {
          console.log(`[PrinterStation] ${pendingJobs.length} pending print job(s) detected`);
          // AutoPrintManager will handle the actual printing
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

        // Save to localStorage
        localStorage.setItem("printerStation", JSON.stringify(data.station));
        localStorage.setItem("stationSessionToken", data.session_token);

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
    localStorage.removeItem("printerStation");
    localStorage.removeItem("stationSessionToken");

    // Stop AutoPrintManager
    autoPrintManager.destroy();
  };

  const getStatusColor = () => {
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
                <span className="font-medium capitalize">{status}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnregister}
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
              <p className="text-muted-foreground">Pending Jobs</p>
              <p className="font-semibold">
                {printJobs.filter(j => j.status === "pending").length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Print Queue */}
      <Card className="dark:dark-glass">
        <CardHeader>
          <CardTitle>Print Queue</CardTitle>
          <CardDescription>
            Jobs assigned to this station
          </CardDescription>
        </CardHeader>
        <CardContent>
          {printJobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No print jobs in queue</p>
              <p className="text-sm mt-1">Jobs will appear here when sent to this station</p>
            </div>
          ) : (
            <div className="space-y-3">
              {printJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{job.filename}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(job.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
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
                    {job.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}