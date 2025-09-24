import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { StationSelector } from './StationSelector';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Alert, AlertDescription } from './ui/alert';
import {
  Settings as SettingsIcon,
  Save,
  Loader2,
  Check,
  Printer,
  Send,
  Zap,
  Monitor,
  Info,
} from 'lucide-react';

const API_URL = '/api';

export function SettingsNew({ token, onModeChange }) {
  const [deviceMode, setDeviceMode] = useState(() => {
    return localStorage.getItem('deviceMode') || 'hybrid';
  });
  const [settings, setSettings] = useState({
    default_station_id: null,
    auto_print_enabled: false,
    print_orientation: 'portrait',
    print_copies: 1,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      // Load device mode from localStorage (it's device-specific)
      const localMode = localStorage.getItem('deviceMode') || 'hybrid';
      setDeviceMode(localMode);

      const localStation = localStorage.getItem('defaultPrinterStation');
      if (localStation) {
        setSettings(prev => ({ ...prev, default_station_id: parseInt(localStation) }));
      }

      // Fetch user settings from server (without device_mode)
      const response = await fetch(`${API_URL}/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setSettings({
          default_station_id: data.default_station_id,
          auto_print_enabled: data.auto_print_enabled || false,
          print_orientation: data.print_orientation || 'portrait',
          print_copies: data.print_copies || 1,
        });

        if (data.default_station_id) {
          localStorage.setItem('defaultPrinterStation', data.default_station_id);
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setSuccess(false);

    try {
      // Save device mode to localStorage only (device-specific)
      localStorage.setItem('deviceMode', deviceMode);
      if (settings.default_station_id) {
        localStorage.setItem('defaultPrinterStation', settings.default_station_id);
      } else {
        localStorage.removeItem('defaultPrinterStation');
      }

      // Save user settings to server (without device_mode)
      const response = await fetch(`${API_URL}/settings`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        // Notify parent component if mode changed
        if (onModeChange) {
          onModeChange(deviceMode);
        }
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleModeChange = (mode) => {
    setDeviceMode(mode);
    localStorage.setItem('deviceMode', mode);
    // Notify parent component if callback provided
    if (onModeChange) {
      onModeChange(mode);
    }
  };

  const handleStationChange = (stationId) => {
    setSettings(prev => ({ ...prev, default_station_id: stationId }));
    if (stationId) {
      localStorage.setItem('defaultPrinterStation', stationId);
    } else {
      localStorage.removeItem('defaultPrinterStation');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Device Mode Settings */}
      <Card className="dark:dark-glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Device Mode
          </CardTitle>
          <CardDescription>
            Configure how this device interacts with the print network
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={deviceMode} onValueChange={handleModeChange}>
            <div className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent/50">
              <RadioGroupItem value="sender" id="mode-sender" />
              <Label htmlFor="mode-sender" className="cursor-pointer flex-1">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  <span className="font-medium">Send Files</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload and send files to remote printer stations
                </p>
              </Label>
            </div>

            <div className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent/50">
              <RadioGroupItem value="printer" id="mode-printer" />
              <Label htmlFor="mode-printer" className="cursor-pointer flex-1">
                <div className="flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  <span className="font-medium">Printer Station</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Act as a remote printer to receive and print files
                </p>
              </Label>
            </div>

            <div className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent/50">
              <RadioGroupItem value="hybrid" id="mode-hybrid" />
              <Label htmlFor="mode-hybrid" className="cursor-pointer flex-1">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  <span className="font-medium">Hybrid Mode</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Both send files and receive print jobs
                </p>
              </Label>
            </div>
          </RadioGroup>

          {deviceMode === 'printer' && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                In Printer Station mode, the file upload interface will be hidden.
                Switch to Sender or Hybrid mode to upload files.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Printer Settings */}
      <Card className="dark:dark-glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Printer Settings
          </CardTitle>
          <CardDescription>
            Configure default printer and printing preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Default Printer Station */}
          <div className="space-y-2">
            <Label>Default Printer Station</Label>
            <StationSelector
              token={token}
              value={settings.default_station_id}
              onChange={handleStationChange}
              autoSave={false}
            />
            <p className="text-xs text-muted-foreground">
              Files will be sent to this station by default when uploading
            </p>
          </div>

          {/* Auto-print Settings */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="auto-print">Auto-print Files</Label>
              <p className="text-sm text-muted-foreground">
                Automatically print files when they arrive
              </p>
            </div>
            <Switch
              id="auto-print"
              checked={settings.auto_print_enabled}
              onCheckedChange={(checked) =>
                setSettings(prev => ({ ...prev, auto_print_enabled: checked }))
              }
            />
          </div>

          {/* Print Orientation */}
          <div className="space-y-2">
            <Label>Print Orientation</Label>
            <RadioGroup
              value={settings.print_orientation}
              onValueChange={(value) =>
                setSettings(prev => ({ ...prev, print_orientation: value }))
              }
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="portrait" id="portrait" />
                <Label htmlFor="portrait">Portrait</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="landscape" id="landscape" />
                <Label htmlFor="landscape">Landscape</Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={saveSettings}
          disabled={saving}
          className="min-w-[120px]"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : success ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Saved
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}