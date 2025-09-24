import { useState, useEffect, useRef } from "react";
import { ThemeProvider } from "./components/theme-provider";
import { Button } from "./components/ui/button";
import autoPrintManager from "./services/AutoPrintManager";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Switch } from "./components/ui/switch";
import { useTheme } from "./components/theme-provider";
import { FileList } from "./components/FileList";
import { FileUpload } from "./components/FileUpload";
import { SettingsNew } from "./components/SettingsNew";
import { PrintSettings } from "./components/PrintSettings";
import { PrintQueue } from "./components/PrintQueue";
import { InstallPrompt } from "./components/InstallPrompt";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { AnimatedThemeToggle } from "./components/AnimatedThemeToggle";
import { ModeSelection } from "./components/ModeSelection";
import { PrinterStation } from "./components/PrinterStation";
import {
  Sun,
  Moon,
  User,
  Mail,
  Lock,
  LogOut,
  Loader2,
  Check,
  X,
  Home,
  FileText,
  Settings as SettingsIcon,
  Printer,
  Send,
  Zap,
} from "lucide-react";

const API_URL = "/api";


function AuthPage({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    confirmPassword: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!isLogin && formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const endpoint = isLogin ? "/login" : "/register";
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem("authToken", data.token);
        onLogin(data.token, data.username);
      } else {
        setError(data.message || "Authentication failed");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            {isLogin ? "Welcome back" : "Create an account"}
          </CardTitle>
          <CardDescription className="text-center">
            {isLogin
              ? "Enter your credentials to access your account"
              : "Enter your information to create your account"}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                <X className="h-4 w-4" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">
                <User className="h-4 w-4 inline mr-1" />
                Username
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
                required
                minLength={3}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                <Lock className="h-4 w-4 inline mr-1" />
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                required
                minLength={6}
                disabled={loading}
              />
            </div>

            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">
                  <Lock className="h-4 w-4 inline mr-1" />
                  Confirm Password
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      confirmPassword: e.target.value,
                    })
                  }
                  required
                  minLength={6}
                  disabled={loading}
                />
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col space-y-4 pt-6">
            <Button type="submit" className="w-full dark:bg-sky-600 dark:hover:bg-sky-700" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLogin ? "Sign In" : "Sign Up"}
            </Button>

            <p className="text-sm text-center text-muted-foreground">
              {isLogin
                ? "Don't have an account? "
                : "Already have an account? "}
              <Button
                type="button"
                variant="link"
                className="p-0"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError("");
                  setFormData({
                    username: "",
                    password: "",
                    confirmPassword: "",
                  });
                }}
                disabled={loading}
              >
                {isLogin ? "Sign up" : "Sign in"}
              </Button>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

function Dashboard({ token, username, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // Initialize from localStorage for immediate display
  const [deviceMode, setDeviceMode] = useState(() => {
    return localStorage.getItem('deviceMode') || 'hybrid';
  });
  // Set initial tab based on device mode
  const [activeTab, setActiveTab] = useState(() => {
    const mode = localStorage.getItem('deviceMode') || 'hybrid';
    return mode === 'sender' ? 'files' : 'overview';
  });
  const [showModeSelection, setShowModeSelection] = useState(false);
  const fileListRef = useRef(null);

  useEffect(() => {
    fetchProfile();
    fetchSettings();

    // Listen for localStorage changes (cross-tab sync)
    const handleStorageChange = (e) => {
      if (e.key === 'deviceMode' && e.newValue) {
        setDeviceMode(e.newValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      // Cleanup on unmount if in hybrid/sender mode
      if (deviceMode !== 'printer') {
        autoPrintManager.destroy();
      }
    };
  }, []);

  // Re-read device mode when switching to overview tab
  useEffect(() => {
    if (activeTab === 'overview') {
      const currentMode = localStorage.getItem('deviceMode') || 'hybrid';
      setDeviceMode(currentMode);
    }
  }, [activeTab]);

  const fetchProfile = async () => {
    try {
      const response = await fetch(`${API_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      } else {
        onLogout();
      }
    } catch (err) {
      console.error("Failed to fetch profile:", err);
    }
  };

  const fetchSettings = async () => {
    try {
      // Get device mode from localStorage only (it's device-specific, not user-specific)
      const localMode = localStorage.getItem('deviceMode') || 'hybrid';
      setDeviceMode(localMode);

      // Set default tab for sender mode
      if (localMode === 'sender' && activeTab === 'overview') {
        setActiveTab('files');
      }

      if (localMode !== 'printer') {
        // For hybrid mode, check if we have a registered station
        let stationId = null;
        if (localMode === 'hybrid') {
          const savedStation = localStorage.getItem("printerStation");
          if (savedStation) {
            try {
              const stationData = JSON.parse(savedStation);
              stationId = stationData.id;
              console.log('[App] Hybrid mode with station ID:', stationId);
            } catch (e) {
              console.error('Error parsing saved station:', e);
            }
          }
        }
        autoPrintManager.init(token, stationId);
      }

      const response = await fetch(`${API_URL}/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        // Device mode is now local only, not stored on server

        // Initialize auto-print based on local device mode
        if (localMode !== 'printer') {
          // For hybrid mode, check if we have a registered station
          let stationId = null;
          if (localMode === 'hybrid') {
            const savedStation = localStorage.getItem("printerStation");
            if (savedStation) {
              try {
                const stationData = JSON.parse(savedStation);
                stationId = stationData.id;
                console.log('[App] Hybrid mode with station ID:', stationId);
              } catch (e) {
                console.error('Error parsing saved station:', e);
              }
            }
          }
          autoPrintManager.init(token, stationId);
        }

        if (data.auto_print_enabled && isPWA() && localMode !== 'printer') {
          autoPrintManager.setAutoPrint(true);
        }
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleModeSelected = (mode) => {
    setDeviceMode(mode);
    setShowModeSelection(false);

    // Save to localStorage
    localStorage.setItem('deviceMode', mode);

    // If sender mode, switch to files tab
    if (mode === 'sender') {
      setActiveTab('files');
    }

    // Initialize or destroy auto-print based on mode
    if (mode === 'printer') {
      autoPrintManager.destroy();
    } else {
      // For hybrid mode, check if we have a registered station
      let stationId = null;
      if (mode === 'hybrid') {
        const savedStation = localStorage.getItem("printerStation");
        if (savedStation) {
          try {
            const stationData = JSON.parse(savedStation);
            stationId = stationData.id;
            console.log('[App] Hybrid mode with station ID:', stationId);
          } catch (e) {
            console.error('Error parsing saved station:', e);
          }
        }
      }
      autoPrintManager.init(token, stationId);
    }
  };

  const handleUploadSuccess = (response) => {
    console.log("File uploaded successfully:", response);
    // Trigger an immediate refresh of the file list
    // First refresh immediately to show the file
    if (fileListRef.current) {
      fileListRef.current.refresh();
    }
    // Second refresh after 1 second in case of any delay
    setTimeout(() => {
      if (fileListRef.current) {
        fileListRef.current.refresh();
      }
    }, 1000);
  };

  const handleUploadError = (error) => {
    console.error("Upload failed:", error);
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: Home },
    { id: "files", label: "Files", icon: FileText },
    { id: "print", label: "Print", icon: Printer },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Show mode selection if requested
  if (showModeSelection) {
    return (
      <div className="min-h-screen relative">
        <AnimatedBackground />
        <div className="relative z-10 pt-8">
          <ModeSelection token={token} onModeSelected={handleModeSelected} />
        </div>
      </div>
    );
  }

  // Show printer station interface for printer mode
  if (deviceMode === 'printer') {
    return (
      <div className="min-h-screen relative">
        <AnimatedBackground />
        <div className="relative z-10">
          <div className="container mx-auto p-4 sm:p-6 max-w-6xl">
            <div className="flex justify-between items-center mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold dark:text-gray-100">
                Printer Station Mode
              </h1>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowModeSelection(true)}
                >
                  <SettingsIcon className="mr-2 h-4 w-4" />
                  Change Mode
                </Button>
                <Button
                  variant="outline"
                  className="dark:border-sky-500/50 dark:hover:bg-sky-500/10"
                  onClick={onLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </Button>
              </div>
            </div>
            <PrinterStation token={token} />
          </div>
        </div>
      </div>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="dark:dark-glass dark:card-shadow-hover transition-all duration-300">
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Your account details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 dark:bg-sky-500/20 flex items-center justify-center dark:glow-blue">
                    <User className="h-6 w-6 text-primary dark:text-sky-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Username</p>
                    <p className="text-lg">{profile?.username || username}</p>
                  </div>
                </div>

                {profile?.created_at && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Member since
                    </p>
                    <p className="text-sm">
                      {new Date(profile.created_at).toLocaleDateString(
                        "en-US",
                        {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        },
                      )}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="dark:dark-glass dark:card-shadow-hover transition-all duration-300">
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
                <CardDescription>Your activity overview</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Status</span>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 dark:shadow-[0_0_8px_rgba(34,197,94,0.8)]"></div>
                      <span className="text-sm text-muted-foreground">
                        Active
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Account Type</span>
                    <span className="text-sm text-muted-foreground">
                      Standard
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Last Login</span>
                    <span className="text-sm text-muted-foreground">
                      Just now
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2 dark:dark-glass dark:card-shadow-hover transition-all duration-300">
              <CardHeader>
                <CardTitle>Device Mode</CardTitle>
                <CardDescription>
                  Current operating mode for this device
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 dark:bg-sky-500/20 flex items-center justify-center">
                      {deviceMode === 'sender' ? (
                        <Send className="h-5 w-5 text-primary dark:text-sky-400" />
                      ) : deviceMode === 'printer' ? (
                        <Printer className="h-5 w-5 text-primary dark:text-sky-400" />
                      ) : (
                        <Zap className="h-5 w-5 text-primary dark:text-sky-400" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium capitalize">{deviceMode || 'Hybrid'} Mode</p>
                      <p className="text-sm text-muted-foreground">
                        {deviceMode === 'sender'
                          ? 'Send files to remote printers'
                          : deviceMode === 'printer'
                          ? 'Receive and print files'
                          : 'Send and receive print jobs'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowModeSelection(true)}
                  >
                    Change Mode
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case "files":
        return (
          <div className="space-y-6">
            <FileUpload
              token={token}
              onUploadSuccess={handleUploadSuccess}
              onUploadError={handleUploadError}
            />
            <FileList token={token} ref={fileListRef} />
          </div>
        );

      case "print":
        return (
          <div className="space-y-6">
            <PrintSettings />
            <PrintQueue token={token} />
          </div>
        );

      case "settings":
        return <SettingsNew token={token} onModeChange={(mode) => {
          setDeviceMode(mode);
          // Also save to localStorage
          localStorage.setItem('deviceMode', mode);
          // If sender mode, switch to files tab
          if (mode === 'sender') {
            setActiveTab('files');
          }
        }} />;

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen relative">
      <AnimatedBackground />
      <InstallPrompt />
      <div className="container mx-auto p-4 sm:p-6 max-w-6xl relative z-10">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold dark:text-gray-100">Dashboard</h1>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="dark:border-sky-500/50 dark:hover:bg-sky-500/10"
              onClick={onLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Logout</span>
            </Button>
            <div className="w-12 h-10 sm:w-14 sm:h-12" aria-hidden="true"></div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8">
          <div className="border-b border-border">
            <nav className="-mb-px flex space-x-4 sm:space-x-8 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`group inline-flex items-center px-1 py-4 border-b-2 font-medium text-sm transition-all duration-300 ${
                      activeTab === tab.id
                        ? "border-primary text-primary dark:border-sky-500 dark:text-sky-400"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border dark:hover:text-sky-300 dark:hover:border-sky-500/50"
                    }`}
                  >
                    <Icon className="mr-1 sm:mr-2 h-4 w-4 flex-shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">{renderTabContent()}</div>
      </div>
    </div>
  );
}

function AppContent() {
  const [token, setToken] = useState(localStorage.getItem("authToken"));
  const [username, setUsername] = useState("");

  useEffect(() => {
    if (token) {
      verifyToken();
    }
  }, []);

  const verifyToken = async () => {
    try {
      const response = await fetch(`${API_URL}/verify`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        handleLogout();
      } else {
        const data = await response.json();
        setUsername(data.username);
      }
    } catch {
      handleLogout();
    }
  };

  const handleLogin = (newToken, newUsername) => {
    setToken(newToken);
    setUsername(newUsername);
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    setToken(null);
    setUsername("");
  };

  return (
    <>
      <AnimatedThemeToggle />
      {token ? (
        <Dashboard token={token} username={username} onLogout={handleLogout} />
      ) : (
        <AuthPage onLogin={handleLogin} />
      )}
    </>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="app-ui-theme">
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
