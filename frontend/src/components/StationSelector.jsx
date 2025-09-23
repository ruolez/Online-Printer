import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { RefreshCw, Printer, MapPin, WifiOff, Wifi } from "lucide-react";

const API_URL = "/api";

export function StationSelector({ token, value, onChange, className, autoSave = true }) {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [defaultStation, setDefaultStation] = useState(null);

  useEffect(() => {
    // Load from localStorage first
    const savedStation = localStorage.getItem('defaultPrinterStation');
    if (savedStation && savedStation !== 'none') {
      const stationId = parseInt(savedStation);
      if (!value) {
        onChange(stationId);
      }
    } else if (!value) {
      // If no saved station and no value, set to null (which displays as "none")
      onChange(null);
    }

    fetchStations();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${API_URL}/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setDefaultStation(data.default_station_id);
        if (!value && data.default_station_id) {
          onChange(data.default_station_id);
        }
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  const fetchStations = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/stations`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setStations(data.stations || []);
      }
    } catch (error) {
      console.error("Error fetching stations:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStationChange = async (newValue) => {
    // Handle "none" as null
    const stationId = newValue === 'none' ? null : Number(newValue);
    onChange(stationId);

    // Save to localStorage
    if (stationId) {
      localStorage.setItem('defaultPrinterStation', stationId);
    } else {
      localStorage.removeItem('defaultPrinterStation');
    }

    // Auto-save to server if enabled
    if (autoSave) {
      try {
        await fetch(`${API_URL}/settings`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            default_station_id: stationId,
          }),
        });
      } catch (error) {
        console.error('Error saving default station:', error);
      }
    }
  };

  const onlineStations = stations.filter(s => s.status === "online");
  const offlineStations = stations.filter(s => s.status === "offline");

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium flex items-center gap-1">
          <Printer className="h-4 w-4" />
          Target Printer Station
        </label>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchStations}
          disabled={loading}
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Select value={value ? String(value) : "none"} onValueChange={handleStationChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select a printer station (optional)" />
        </SelectTrigger>
        <SelectContent>
          {stations.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No printer stations registered
            </div>
          ) : (
            <>
              <SelectItem value="none">
                <span className="text-muted-foreground">No specific station (local print)</span>
              </SelectItem>

              {onlineStations.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="flex items-center gap-1">
                    <Wifi className="h-3 w-3 text-green-500" />
                    Online Stations
                  </SelectLabel>
                  {onlineStations.map((station) => (
                    <SelectItem key={station.id} value={String(station.id)}>
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <Printer className="h-4 w-4" />
                          <span>{station.station_name}</span>
                          {station.station_location && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {station.station_location}
                            </span>
                          )}
                        </div>
                        {defaultStation === station.id && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}

              {offlineStations.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="flex items-center gap-1">
                    <WifiOff className="h-3 w-3 text-gray-500" />
                    Offline Stations
                  </SelectLabel>
                  {offlineStations.map((station) => (
                    <SelectItem key={station.id} value={String(station.id)} disabled>
                      <div className="flex items-center gap-2 opacity-50">
                        <Printer className="h-4 w-4" />
                        <span>{station.station_name}</span>
                        {station.station_location && (
                          <span className="text-xs text-muted-foreground">
                            ({station.station_location})
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </>
          )}
        </SelectContent>
      </Select>

      {value && (
        <p className="text-xs text-muted-foreground">
          File will be sent to the selected printer station for remote printing
        </p>
      )}
    </div>
  );
}