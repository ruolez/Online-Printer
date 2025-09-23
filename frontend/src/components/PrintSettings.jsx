import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Button } from "./ui/button";
import autoPrintManager from "../services/AutoPrintManager";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Input } from "./ui/input";
import { Loader2, Printer, Check, X, AlertCircle } from "lucide-react";
import { PWAIndicator } from "./PWAIndicator";
import { isPWA } from "../utils/pwaDetection";

const API_URL = "/api";

export function PrintSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState({
    auto_print_enabled: false,
    print_orientation: "portrait",
    print_copies: 1,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_URL}/settings`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSettings({
          auto_print_enabled: data.auto_print_enabled || false,
          print_orientation: data.print_orientation || "portrait",
          print_copies: data.print_copies || 1,
        });
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");

    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_URL}/settings`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        setMessage("Print settings saved successfully");
        // Update AutoPrintManager with new settings
        autoPrintManager.updateSettings(settings);
        setTimeout(() => setMessage(""), 3000);
      } else {
        setMessage("Failed to save settings");
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      setMessage("Error saving settings");
    } finally {
      setSaving(false);
    }
  };

  const testPrint = () => {
    // Create a test page
    const testContent = `
      <html>
        <head>
          <title>Print Test</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #3b82f6; }
            .info { margin: 20px 0; }
          </style>
        </head>
        <body>
          <h1>Printer Online - Test Page</h1>
          <div class="info">
            <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Orientation:</strong> ${settings.print_orientation}</p>
            <p><strong>Copies:</strong> ${settings.print_copies}</p>
            <p><strong>Status:</strong> If you can read this, printing is working!</p>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    printWindow.document.write(testContent);
    printWindow.document.close();
    printWindow.print();
    setTimeout(() => printWindow.close(), 1000);
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
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print Settings
          </CardTitle>
          <PWAIndicator />
        </div>
        <CardDescription>
          Configure automatic printing for uploaded PDFs
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isPWA() && (
          <div className="flex items-start gap-2 p-3 bg-warning/10 text-warning rounded-md border border-warning/20">
            <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Auto-print requires PWA mode</p>
              <p className="text-xs text-muted-foreground">
                To enable automatic printing, install this app as a PWA using the install button in the bottom-right corner.
                Auto-print only works in PWA mode to prevent multiple browsers from printing the same files.
              </p>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="auto-print">Automatic Printing</Label>
            <p className="text-sm text-muted-foreground">
              Automatically print new PDFs when uploaded {!isPWA() && "(PWA only)"}
            </p>
          </div>
          <Switch
            id="auto-print"
            checked={settings.auto_print_enabled}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, auto_print_enabled: checked })
            }
            disabled={!isPWA()}
          />
        </div>

        {settings.auto_print_enabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="orientation">Print Orientation</Label>
              <Select
                value={settings.print_orientation}
                onValueChange={(value) =>
                  setSettings({ ...settings, print_orientation: value })
                }
              >
                <SelectTrigger id="orientation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">Portrait</SelectItem>
                  <SelectItem value="landscape">Landscape</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="copies">Number of Copies</Label>
              <Input
                id="copies"
                type="number"
                min="1"
                max="10"
                value={settings.print_copies}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    print_copies: parseInt(e.target.value) || 1,
                  })
                }
              />
            </div>

            <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
              <p className="text-sm">
                <strong>Note:</strong> For silent printing without dialogs, you can:
              </p>
              <ul className="text-sm mt-2 space-y-1 ml-4">
                <li>• Install this app as a PWA (click install button in address bar)</li>
                <li>• For Chrome: Launch with --kiosk-printing flag</li>
                <li>• For Edge: Launch with --kiosk-printing --edge-kiosk-type=fullscreen</li>
              </ul>
            </div>
          </>
        )}

        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={testPrint}>
            <Printer className="h-4 w-4 mr-2" />
            Test Print
          </Button>

          <div className="flex items-center gap-2">
            {message && (
              <div className="flex items-center gap-1 text-sm">
                {message.includes("success") ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <X className="h-4 w-4 text-red-500" />
                )}
                <span>{message}</span>
              </div>
            )}
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Settings
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}