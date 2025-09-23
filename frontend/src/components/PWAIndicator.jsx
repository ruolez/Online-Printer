import { useEffect, useState } from 'react';
import { Badge } from './ui/badge';
import { Monitor, Smartphone } from 'lucide-react';
import { isPWA, getDisplayMode } from '../utils/pwaDetection';

export function PWAIndicator() {
  const [isPWAMode, setIsPWAMode] = useState(false);
  const [displayMode, setDisplayMode] = useState('browser');

  useEffect(() => {
    // Check PWA status
    const checkPWAStatus = () => {
      const pwaStatus = isPWA();
      const mode = getDisplayMode();
      setIsPWAMode(pwaStatus);
      setDisplayMode(mode);
    };

    // Initial check
    checkPWAStatus();

    // Re-check when window gains focus (in case user switches between PWA and browser)
    window.addEventListener('focus', checkPWAStatus);

    // Check on display mode change
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', checkPWAStatus);
    }

    return () => {
      window.removeEventListener('focus', checkPWAStatus);
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', checkPWAStatus);
      }
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
      {isPWAMode ? (
        <Badge variant="default" className="flex items-center gap-1">
          <Smartphone className="h-3 w-3" />
          PWA Mode
        </Badge>
      ) : (
        <Badge variant="secondary" className="flex items-center gap-1">
          <Monitor className="h-3 w-3" />
          Browser
        </Badge>
      )}
      {isPWAMode && (
        <span className="text-xs text-muted-foreground">
          Auto-print enabled
        </span>
      )}
    </div>
  );
}