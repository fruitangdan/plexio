/**
 * Get the correct API origin for backend requests
 * In Electron, backend runs on 127.0.0.1:8000
 * In Docker/browser, backend is on the same origin (port 80 via nginx)
 */
export function getApiOrigin(): string {
  // Check if we're in Electron by looking at the user agent or window properties
  const isElectron = 
    window.navigator.userAgent.includes('Electron') ||
    (window as any).process?.type === 'renderer' ||
    (window as any).__ELECTRON__ === true;

  if (isElectron) {
    // In Electron, backend runs on port 8000
    return 'http://127.0.0.1:8000';
  }

  // In browser/Docker setup, use the same origin (nginx proxy on port 80)
  // Remove the port number to use the default port (80 for http)
  return window.location.origin.replace(/:\d+$/, '');
}
