const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow = null;
let backendProcess = null;
const BACKEND_PORT = 8000;
const FRONTEND_PORT = 5173;

// Determine if we're in development or production
const isDev = !app.isPackaged;
const isProduction = app.isPackaged;

// Get paths based on environment
function getBackendPath() {
  if (isProduction) {
    // In production, backend is in extraResources
    const backendDir = path.join(process.resourcesPath, 'backend');
    const backendPath = path.join(backendDir, 'backend');
    
    // Check if executable exists
    if (fs.existsSync(backendPath)) {
      const stat = fs.statSync(backendPath);
      if (stat.isFile() && (stat.mode & parseInt('111', 8))) {
        return backendPath;
      }
    }
    
    // Try to find backend executable in the directory
    if (fs.existsSync(backendDir)) {
      const files = fs.readdirSync(backendDir);
      const executable = files.find(f => {
        const filePath = path.join(backendDir, f);
        try {
          const stat = fs.statSync(filePath);
          return stat.isFile() && (stat.mode & parseInt('111', 8));
        } catch {
          return false;
        }
      });
      if (executable) {
        return path.join(backendDir, executable);
      }
    }
    
    console.error('Backend executable not found in:', backendDir);
    return null;
  } else {
    // In development, use Python directly
    return 'python3';
  }
}

function getBackendArgs() {
  if (isProduction) {
    // In production, the PyInstaller executable can be run directly
    // It will use environment variables for host/port, or we can pass them
    // The executable runs main.py which has uvicorn.run() in __main__
    return [];
  } else {
    // In development, run with uvicorn
    // Use 0.0.0.0 to listen on all interfaces so other devices can access it
    const backendDir = path.join(__dirname, '..', 'plexio');
    return ['-m', 'uvicorn', 'plexio.main:app', '--host', '0.0.0.0', '--port', BACKEND_PORT.toString()];
  }
}

let backendRestartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 3;

function startBackend() {
  const backendPath = getBackendPath();
  if (!backendPath) {
    console.error('Could not find backend executable');
    showBackendError('Could not find backend executable. Please check your installation.');
    return;
  }

  // Verify backend executable exists and is executable
  if (!fs.existsSync(backendPath)) {
    console.error('Backend executable does not exist:', backendPath);
    showBackendError(`Backend executable not found at: ${backendPath}`);
    return;
  }

  try {
    const stat = fs.statSync(backendPath);
    if (!stat.isFile()) {
      console.error('Backend path is not a file:', backendPath);
      showBackendError(`Backend path is not a file: ${backendPath}`);
      return;
    }
    // Check if executable (on Unix systems)
    if (process.platform !== 'win32' && !(stat.mode & parseInt('111', 8))) {
      console.error('Backend executable is not executable:', backendPath);
      showBackendError(`Backend executable is not executable: ${backendPath}\n\nTry: chmod +x "${backendPath}"`);
      return;
    }
  } catch (err) {
    console.error('Error checking backend executable:', err);
    showBackendError(`Error checking backend executable: ${err.message}`);
    return;
  }

  const args = getBackendArgs();
  const backendDir = isProduction 
    ? path.dirname(backendPath)
    : path.join(__dirname, '..');

  console.log('Starting backend:', backendPath, args);
  console.log('Backend directory:', backendDir);
  console.log('Resources path:', isProduction ? process.resourcesPath : 'N/A');

  // Get Resources path for backend to find frontend files
  const resourcesPath = isProduction ? process.resourcesPath : path.join(__dirname, '..');
  
  const backendEnv = {
    ...process.env,
    CACHE_TYPE: 'memory', // Use memory cache instead of Redis
    CORS_ORIGIN_REGEX: 'https?://localhost(:\\d+)?|.*plexio.stream|.*strem.io|.*stremio.com',
    SERVE_STATIC: isProduction ? 'true' : 'false', // Enable static file serving in production
    RESOURCES_PATH: resourcesPath, // Pass Resources path to backend
    HOST: '0.0.0.0', // Listen on all interfaces
    PORT: BACKEND_PORT.toString(), // Backend port
  };
  
  console.log('Backend environment variables:', {
    CACHE_TYPE: backendEnv.CACHE_TYPE,
    SERVE_STATIC: backendEnv.SERVE_STATIC,
    RESOURCES_PATH: backendEnv.RESOURCES_PATH,
    HOST: backendEnv.HOST,
    PORT: backendEnv.PORT,
  });
  
  backendProcess = spawn(backendPath, args, {
    cwd: backendDir,
    stdio: ['ignore', 'pipe', 'pipe'], // Capture stdout/stderr instead of inherit
    env: backendEnv,
  });

  let errorOutput = '';
  
  backendProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`Backend stdout: ${output}`);
    // Also log to a file for debugging
    if (isProduction) {
      const fs = require('fs');
      const logPath = path.join(app.getPath('logs'), 'backend.log');
      fs.appendFileSync(logPath, output);
    }
  });

  backendProcess.stderr.on('data', (data) => {
    const error = data.toString();
    errorOutput += error;
    console.error(`Backend stderr: ${error}`);
    // Also log to a file for debugging
    if (isProduction) {
      const fs = require('fs');
      const logPath = path.join(app.getPath('logs'), 'backend.log');
      fs.appendFileSync(logPath, `ERROR: ${error}`);
    }
  });

  backendProcess.on('error', (error) => {
    console.error('Backend process error:', error);
    console.error('Error details:', {
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
      path: error.path,
    });
    showBackendError(
      `Failed to start backend: ${error.message}\n\n` +
      `Code: ${error.code}\n` +
      `Path: ${backendPath}\n` +
      `Args: ${args.join(' ')}\n` +
      `Working Directory: ${backendDir}`
    );
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`Backend process exited with code ${code} and signal ${signal}`);
    console.log('Error output so far:', errorOutput.substring(0, 1000)); // First 1000 chars
    if (code !== 0 && code !== null) {
      backendRestartAttempts++;
      if (backendRestartAttempts <= MAX_RESTART_ATTEMPTS) {
        // Check for common errors
        if (errorOutput.includes('No module named')) {
          const moduleMatch = errorOutput.match(/No module named ['"]([^'"]+)['"]/);
          const moduleName = moduleMatch ? moduleMatch[1] : 'unknown';
          showBackendError(
            `Python module '${moduleName}' not found. Please install dependencies:\n\n` +
            `  python3 -m pip install -e .\n\n` +
            `Or install from pyproject.toml`
          );
          return; // Don't retry if it's a missing dependency
        }
        
        // Backend crashed, try to restart after a delay
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed() && backendRestartAttempts <= MAX_RESTART_ATTEMPTS) {
            startBackend();
          }
        }, 2000);
      } else {
        showBackendError(
          `Backend failed to start after ${MAX_RESTART_ATTEMPTS} attempts.\n\n` +
          `Error: ${errorOutput || 'Unknown error'}`
        );
      }
    } else {
      // Success - reset restart counter
      backendRestartAttempts = 0;
    }
  });
}

function showBackendError(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.executeJavaScript(`
      document.body.innerHTML = \`
        <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a1a; color: #fff;">
          <div style="max-width: 600px; padding: 40px; background: #2a2a2a; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
            <h1 style="color: #ff4444; margin-top: 0;">Backend Error</h1>
            <pre style="background: #1a1a1a; padding: 20px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${message.replace(/`/g, '\\`')}</pre>
            <p style="margin-top: 20px; color: #aaa; font-size: 14px;">
              Check the terminal/console for more details.
            </p>
          </div>
        </div>
      \`;
    `);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, 'icon.png'),
    show: false, // Don't show until ready
  });

  // Show window when ready to prevent flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Wait for backend to be ready, then load frontend
  let backendCheckCount = 0;
  const MAX_BACKEND_CHECKS = 60; // 30 seconds at 500ms intervals
  
  const checkBackend = setInterval(() => {
    backendCheckCount++;
    
    // Use Node's http module instead of fetch (fetch might not be available)
    const http = require('http');
    const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/api/v1/test-connection?url=http://test&token=test`, (res) => {
      // Consume the response data to prevent hanging
      res.on('data', () => {});
      res.on('end', () => {});
      
      if (res.statusCode === 200 || res.statusCode === 400) { // 400 is OK, means backend is responding
        console.log('Backend is ready (status:', res.statusCode, '), loading frontend');
        clearInterval(checkBackend);
        loadFrontend();
      }
    });
    
    req.on('error', () => {
      // Backend not ready yet, keep waiting
      if (backendCheckCount >= MAX_BACKEND_CHECKS) {
        clearInterval(checkBackend);
        // Load frontend anyway - it will show an error if backend isn't ready
        loadFrontend();
      }
    });
    
    req.setTimeout(1000);
    req.on('timeout', () => {
      req.destroy();
    });
  }, 500);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function loadFrontend() {
  console.log('Loading frontend, isProduction:', isProduction);
  
  if (!mainWindow || mainWindow.isDestroyed()) {
    console.error('Window is not available');
    return;
  }
  
  if (isProduction) {
    // In production, backend serves static files
    console.log('Loading production frontend from backend');
    const backendUrl = `http://127.0.0.1:${BACKEND_PORT}`;
    
    // Add error handlers for production
    mainWindow.webContents.once('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error('Failed to load frontend from backend:', validatedURL, 'Error:', errorCode, errorDescription);
      showBackendError(
        `Failed to load frontend from backend.\n\n` +
        `URL: ${validatedURL}\n` +
        `Error: ${errorCode} - ${errorDescription}\n\n` +
        `Please check:\n` +
        `1. Backend is running on port ${BACKEND_PORT}\n` +
        `2. Frontend files are in Resources/frontend/dist\n` +
        `3. Backend logs for errors`
      );
    });
    
    mainWindow.webContents.once('did-finish-load', () => {
      console.log('Frontend loaded successfully from backend');
    });
    
    mainWindow.loadURL(backendUrl);
  } else {
    // In development, load Vite dev server
    // Since we use wait-on in electron:dev:full, Vite should be running
    const viteUrl = `http://localhost:${FRONTEND_PORT}`;
    console.log('Loading Vite frontend at', viteUrl);
    
    // Listen for load events
    mainWindow.webContents.once('did-finish-load', () => {
      console.log('Frontend loaded successfully at', viteUrl);
      // Show window if it was hidden
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
    });
    
    mainWindow.webContents.once('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error('Failed to load URL:', validatedURL, 'Error:', errorCode, errorDescription);
      mainWindow.show(); // Show window even on error
      // Show error in window
      mainWindow.webContents.executeJavaScript(`
        document.body.innerHTML = \`
          <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a1a; color: #fff;">
            <div style="max-width: 600px; padding: 40px; background: #2a2a2a; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); text-align: center;">
              <h1 style="color: #ff4444; margin-top: 0;">Failed to Load Frontend</h1>
              <p style="color: #aaa; font-size: 16px; line-height: 1.6;">
                Could not load the frontend from ${viteUrl}
              </p>
              <p style="color: #ff6666; font-size: 14px; margin: 20px 0;">
                Error ${errorCode}: ${errorDescription}
              </p>
              <p style="color: #666; font-size: 12px; margin-top: 30px;">
                Backend is running on http://127.0.0.1:${BACKEND_PORT}
              </p>
            </div>
          </div>
        \`;
      `);
    });
    
    // Load the URL
    mainWindow.loadURL(viteUrl);
  }
}

app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});

// Handle app termination
app.on('will-quit', (event) => {
  if (backendProcess) {
    event.preventDefault();
    backendProcess.kill();
    setTimeout(() => {
      app.exit(0);
    }, 1000);
  }
});
