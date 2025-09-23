import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Button } from "./ui/button";
import {
  Settings as SettingsIcon,
  Save,
  Loader2,
  Check,
  X,
  AlertTriangle,
  HardDrive,
  Zap,
} from "lucide-react";

const API_URL = "/api";

export function Settings({ token }) {
  const [settings, setSettings] = useState({
    maxFileSize: 10, // Default 10 MB
    autoProcessFiles: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API_URL}/settings`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSettings({
          maxFileSize: data.maxFileSize || 10,
          autoProcessFiles: data.autoProcessFiles !== false, // Default to true if undefined
        });
      } else if (response.status === 404) {
        // Settings endpoint doesn't exist yet, use defaults
        console.log("Settings endpoint not found, using defaults");
      } else {
        const errorData = await response.json();
        setError(errorData.message || "Failed to fetch settings");
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveSettings = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccessMessage("");

      // Validate max file size
      if (settings.maxFileSize < 1 || settings.maxFileSize > 100) {
        setError("File size must be between 1 and 100 MB");
        setSaving(false);
        return;
      }

      const response = await fetch(`${API_URL}/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          maxFileSize: parseInt(settings.maxFileSize),
          autoProcessFiles: settings.autoProcessFiles,
        }),
      });

      if (response.ok) {
        setSuccessMessage("Settings saved successfully!");
        // Clear success message after 3 seconds
        setTimeout(() => setSuccessMessage(""), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.message || "Failed to save settings");
      }
    } catch (err) {
      console.error("Error saving settings:", err);
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleMaxFileSizeChange = (e) => {
    const value = e.target.value;
    // Allow empty string for better UX while typing
    if (value === "" || (!isNaN(value) && parseInt(value) >= 0)) {
      setSettings({ ...settings, maxFileSize: value });
    }
  };

  const handleAutoProcessToggle = (checked) => {
    setSettings({ ...settings, autoProcessFiles: checked });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Settings
          </CardTitle>
          <CardDescription>
            Configure your application preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SettingsIcon className="h-5 w-5" />
          Settings
        </CardTitle>
        <CardDescription>
          Configure your application preferences
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
            <X className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div className="flex items-center gap-2 p-3 text-sm text-green-600 bg-green-100 dark:bg-green-900/20 dark:text-green-400 rounded-md">
            <Check className="h-4 w-4" />
            {successMessage}
          </div>
        )}

        {/* Max File Size Setting */}
        <div className="space-y-3">
          <Label htmlFor="maxFileSize" className="text-base font-medium">
            <HardDrive className="h-4 w-4" />
            Maximum File Size Limit
          </Label>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                id="maxFileSize"
                type="number"
                min="1"
                max="100"
                value={settings.maxFileSize}
                onChange={handleMaxFileSizeChange}
                className="w-24"
                disabled={saving}
              />
              <span className="text-sm text-muted-foreground">MB</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Set the maximum size for uploaded files (1-100 MB)
            </p>
            {settings.maxFileSize &&
              (settings.maxFileSize < 1 || settings.maxFileSize > 100) && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  File size must be between 1 and 100 MB
                </div>
              )}
          </div>
        </div>

        {/* Auto-processing Setting */}
        <div className="space-y-3">
          <Label htmlFor="autoProcess" className="text-base font-medium">
            <Zap className="h-4 w-4" />
            Auto-process Files
          </Label>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Switch
                id="autoProcess"
                checked={settings.autoProcessFiles}
                onCheckedChange={handleAutoProcessToggle}
                disabled={saving}
              />
              <span className="text-sm">
                {settings.autoProcessFiles ? "Enabled" : "Disabled"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Automatically process uploaded files without manual confirmation
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-4 border-t">
          <Button
            onClick={saveSettings}
            disabled={
              saving ||
              (settings.maxFileSize &&
                (settings.maxFileSize < 1 || settings.maxFileSize > 100))
            }
            className="w-full sm:w-auto"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>

        {/* Settings Preview */}
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-2">Current Configuration</h4>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Max file size:</span>
              <span>{settings.maxFileSize} MB</span>
            </div>
            <div className="flex justify-between">
              <span>Auto-processing:</span>
              <span>{settings.autoProcessFiles ? "On" : "Off"}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
