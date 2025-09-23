// Utility to detect if the app is running as a PWA (installed app)
export function isPWA() {
  // Check multiple conditions to determine if running as PWA

  // 1. Check if running in standalone mode (most reliable)
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }

  // 2. Check if running in fullscreen or minimal-ui mode
  if (window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches) {
    return true;
  }

  // 3. Check iOS specific standalone mode
  if (window.navigator.standalone === true) {
    return true;
  }

  // 4. Check if launched from home screen (for some browsers)
  if (document.referrer.includes('android-app://')) {
    return true;
  }

  // 5. Check URL parameters (some PWAs add a parameter)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'pwa' || urlParams.get('source') === 'pwa') {
    return true;
  }

  return false;
}

// Get display mode for debugging
export function getDisplayMode() {
  if (isPWA()) {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return 'standalone';
    }
    if (window.matchMedia('(display-mode: fullscreen)').matches) {
      return 'fullscreen';
    }
    if (window.matchMedia('(display-mode: minimal-ui)').matches) {
      return 'minimal-ui';
    }
    if (window.navigator.standalone === true) {
      return 'ios-standalone';
    }
    return 'pwa';
  }
  return 'browser';
}

// Store PWA status in localStorage for persistence
export function storePWAStatus() {
  const isPWAMode = isPWA();
  localStorage.setItem('isPWA', isPWAMode ? 'true' : 'false');
  localStorage.setItem('displayMode', getDisplayMode());
  return isPWAMode;
}

// Get stored PWA status
export function getStoredPWAStatus() {
  return localStorage.getItem('isPWA') === 'true';
}