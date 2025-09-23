import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Loader2,
  Printer,
  X,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
} from "lucide-react";
// Removed print-js - now using native browser printing

const API_URL = "/api";

export function PrintQueue({ token }) {
  const [printJobs, setPrintJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    fetchPrintQueue();
    fetchSettings();

    // Disabled auto-print polling here since AutoPrintManager handles it
    // This prevents duplicate print attempts
    /*
    const interval = setInterval(() => {
      if (settings?.auto_print_enabled) {
        checkAndPrint();
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
    */
  }, [settings?.auto_print_enabled]);

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${API_URL}/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  const fetchPrintQueue = async () => {
    try {
      const response = await fetch(`${API_URL}/print-queue`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setPrintJobs(data.print_jobs || []);
      }
    } catch (error) {
      console.error("Error fetching print queue:", error);
    } finally {
      setLoading(false);
    }
  };

  const checkAndPrint = async () => {
    try {
      const response = await fetch(`${API_URL}/print-queue/next`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.print_job && !data.message) {
          await printFile(data.print_job.id, data.print_job.file_id);
        }
      }
    } catch (error) {
      console.error("Error checking for print jobs:", error);
    }
  };

  const printUsingNativeBrowser = async (blobUrl, jobId) => {
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
                setTimeout(async () => {
                  // Clean up
                  document.body.removeChild(iframe);
                  URL.revokeObjectURL(blobUrl);

                  // Update status to completed
                  await updateJobStatus(jobId, "completed");
                  fetchPrintQueue();
                  setPrinting(null);
                  resolve();
                }, 1000);

              } catch (printError) {
                console.error('Print error:', printError);
                document.body.removeChild(iframe);
                URL.revokeObjectURL(blobUrl);
                await updateJobStatus(jobId, "failed", printError.message);
                fetchPrintQueue();
                setPrinting(null);
                reject(printError);
              }
            }, 500);
          } catch (error) {
            console.error('Iframe load error:', error);
            document.body.removeChild(iframe);
            URL.revokeObjectURL(blobUrl);
            await updateJobStatus(jobId, "failed", error.message);
            fetchPrintQueue();
            setPrinting(null);
            reject(error);
          }
        };

        // Handle iframe error
        iframe.onerror = async (error) => {
          console.error('Failed to load PDF in iframe:', error);
          document.body.removeChild(iframe);
          URL.revokeObjectURL(blobUrl);
          await updateJobStatus(jobId, "failed", 'Failed to load PDF');
          fetchPrintQueue();
          setPrinting(null);
          reject(error);
        };

        // Add iframe to document
        document.body.appendChild(iframe);

      } catch (error) {
        console.error('Error setting up print:', error);
        URL.revokeObjectURL(blobUrl);
        updateJobStatus(jobId, "failed", error.message).then(() => {
          fetchPrintQueue();
          setPrinting(null);
          reject(error);
        });
      }
    });
  };

  const printFile = async (jobId, fileId) => {
    setPrinting(jobId);

    try {
      // Update status to printing
      await updateJobStatus(jobId, "printing");

      // First, fetch the PDF file as a blob
      const response = await fetch(`${API_URL}/files/${fileId}/download`, {
        headers: {
          Authorization: `Bearer ${token}`
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
      await printUsingNativeBrowser(blobUrl, jobId);
    } catch (error) {
      console.error("Error printing file:", error);
      await updateJobStatus(jobId, "failed", error?.message || 'Print failed');
      setPrinting(null);
    }
  };

  const updateJobStatus = async (jobId, status, error = null) => {
    try {
      const body = { status };
      if (error) body.error = error;

      await fetch(`${API_URL}/print-queue/${jobId}/status`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error("Error updating job status:", err);
    }
  };

  const addToPrintQueue = async (fileId) => {
    try {
      const response = await fetch(`${API_URL}/print-queue/add/${fileId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        fetchPrintQueue();
      }
    } catch (error) {
      console.error("Error adding to print queue:", error);
    }
  };

  const removeFromQueue = async (jobId) => {
    try {
      const response = await fetch(`${API_URL}/print-queue/${jobId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        fetchPrintQueue();
      }
    } catch (error) {
      console.error("Error removing from queue:", error);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4" />;
      case "printing":
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case "completed":
        return <CheckCircle className="h-4 w-4" />;
      case "failed":
        return <XCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "pending":
        return "default";
      case "printing":
        return "secondary";
      case "completed":
        return "success";
      case "failed":
        return "destructive";
      default:
        return "default";
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Print Queue
            </CardTitle>
            <CardDescription>
              Manage your print jobs
              {settings?.auto_print_enabled && (
                <Badge variant="secondary" className="ml-2">
                  Auto-print enabled
                </Badge>
              )}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPrintQueue}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {printJobs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No print jobs in queue</p>
            <p className="text-sm mt-1">
              Upload files and add them to the print queue to get started
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {printJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(job.status)}
                  <div>
                    <p className="font-medium">{job.filename}</p>
                    <p className="text-sm text-muted-foreground">
                      Added {new Date(job.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={getStatusColor(job.status)}>
                    {job.status}
                  </Badge>

                  {job.status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => printFile(job.id, job.file_id)}
                      disabled={printing === job.id}
                    >
                      {printing === job.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Printer className="h-4 w-4" />
                      )}
                    </Button>
                  )}

                  {job.status === "failed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => printFile(job.id, job.file_id)}
                    >
                      Retry
                    </Button>
                  )}

                  {(job.status === "completed" || job.status === "failed") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeFromQueue(job.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}