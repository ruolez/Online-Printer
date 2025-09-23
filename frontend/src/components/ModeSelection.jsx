import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Label } from "./ui/label";
import { Alert, AlertDescription } from "./ui/alert";
import {
  Send,
  Printer,
  Zap,
  CheckCircle2,
  Info,
  Settings2,
} from "lucide-react";

const API_URL = "/api";

export function ModeSelection({ token, onModeSelected }) {
  const [selectedMode, setSelectedMode] = useState("");
  const [currentMode, setCurrentMode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    // Check localStorage first
    const localMode = localStorage.getItem('deviceMode');
    if (localMode) {
      setCurrentMode(localMode);
      setSelectedMode(localMode);
    }
    fetchCurrentMode();
  }, []);

  const fetchCurrentMode = async () => {
    try {
      const response = await fetch(`${API_URL}/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentMode(data.device_mode || "hybrid");
        setSelectedMode(data.device_mode || "hybrid");
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = async () => {
    setUpdating(true);
    try {
      // Save to localStorage immediately
      localStorage.setItem('deviceMode', selectedMode);

      const response = await fetch(`${API_URL}/settings`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          device_mode: selectedMode,
        }),
      });

      if (response.ok) {
        onModeSelected(selectedMode);
      } else {
        const error = await response.json();
        console.error("Error updating mode:", error);
        // Revert localStorage on failure
        localStorage.setItem('deviceMode', currentMode);
      }
    } catch (error) {
      console.error("Error updating mode:", error);
      // Revert localStorage on failure
      localStorage.setItem('deviceMode', currentMode);
    } finally {
      setUpdating(false);
    }
  };

  const modes = [
    {
      id: "sender",
      icon: Send,
      title: "Send Files",
      description: "Upload files to be printed on remote stations",
      features: ["Upload PDF files", "Select target printer", "Track print status"],
    },
    {
      id: "printer",
      icon: Printer,
      title: "Printer Station",
      description: "Turn this device into a remote printer station",
      features: ["Receive print jobs", "Auto-print capability", "Status monitoring"],
    },
    {
      id: "hybrid",
      icon: Zap,
      title: "Hybrid Mode",
      description: "Both send files and act as a printer station",
      features: ["Full functionality", "Send and receive", "Maximum flexibility"],
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <Card className="dark:dark-glass">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Select Device Mode</CardTitle>
          <CardDescription>
            Choose how this device will interact with the print network
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {currentMode && currentMode !== selectedMode && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Current mode: <strong>{currentMode}</strong>. Select a new mode below and click
                "Apply Changes" to update.
              </AlertDescription>
            </Alert>
          )}

          <RadioGroup
            value={selectedMode}
            onValueChange={setSelectedMode}
            className="grid gap-4 md:grid-cols-3"
          >
            {modes.map((mode) => {
              const Icon = mode.icon;
              const isSelected = selectedMode === mode.id;
              return (
                <label
                  key={mode.id}
                  htmlFor={mode.id}
                  className="cursor-pointer"
                >
                  <div
                    className={`relative rounded-lg border-2 p-4 transition-all hover:shadow-lg ${
                      isSelected
                        ? "border-primary bg-primary/5 dark:bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <RadioGroupItem
                      value={mode.id}
                      id={mode.id}
                      className="sr-only"
                    />

                    {isSelected && (
                      <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-primary" />
                    )}

                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <div
                          className={`p-2 rounded-full ${
                            isSelected
                              ? "bg-primary/20 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Icon className="h-6 w-6" />
                        </div>
                        <h3 className="font-semibold">{mode.title}</h3>
                      </div>

                      <p className="text-sm text-muted-foreground">
                        {mode.description}
                      </p>

                      <ul className="space-y-1">
                        {mode.features.map((feature, index) => (
                          <li
                            key={index}
                            className="text-xs text-muted-foreground flex items-center"
                          >
                            <span className="mr-2">•</span>
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </label>
              );
            })}
          </RadioGroup>

          <div className="pt-4 border-t">
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                <Settings2 className="inline h-4 w-4 mr-1" />
                <strong>Note:</strong> You can change this mode at any time from settings.
              </p>
              {selectedMode === "printer" && (
                <p className="text-amber-600 dark:text-amber-400">
                  In Printer Station mode, the upload functionality will be hidden to simplify the interface.
                </p>
              )}
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex justify-between">
          {currentMode && (
            <Button
              variant="outline"
              onClick={() => onModeSelected(currentMode)}
              disabled={updating}
            >
              Keep Current Mode
            </Button>
          )}
          <Button
            onClick={handleModeChange}
            disabled={!selectedMode || updating || selectedMode === currentMode}
            className="ml-auto"
          >
            {updating ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                Applying...
              </>
            ) : (
              <>Apply Changes</>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}