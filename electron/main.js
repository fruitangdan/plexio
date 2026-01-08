const {
    app,
    shell,
    Menu,
    Tray,
    nativeImage
} = require('electron');
const path = require('path');
const {
    spawn
} = require('child_process');
const fs = require('fs');
// Handle both default and named exports for menubar across bundlers
const menubarModule = require('menubar');
const createMenubar = menubarModule.menubar || menubarModule;

let mb = null;
let backendProcess = null;
let hasShownWindowInitially = false; // Track if we've shown the window on first load
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
        return;
    }

    // In development, backendPath is 'python3' (a command), not a file path
    // Skip file existence check for dev mode
    if (isProduction) {
        // Verify backend executable exists and is executable (production only)
        if (!fs.existsSync(backendPath)) {
            console.error('Backend executable does not exist:', backendPath);
            return;
        }

        try {
            const stat = fs.statSync(backendPath);
            if (!stat.isFile()) {
                console.error('Backend path is not a file:', backendPath);
                return;
            }
            // Check if executable (on Unix systems)
            if (process.platform !== 'win32' && !(stat.mode & parseInt('111', 8))) {
                console.error('Backend executable is not executable:', backendPath);
                return;
            }
        } catch (err) {
            console.error('Error checking backend executable:', err);
            return;
        }
    } else {
        // In dev mode, just verify python3 is available in PATH
        const {
            execSync
        } = require('child_process');
        try {
            execSync('which python3', {
                stdio: 'ignore'
            });
        } catch (err) {
            console.error('python3 not found in PATH. Please install Python 3.');
            return;
        }
    }

    const args = getBackendArgs();
    const backendDir = isProduction ?
        path.dirname(backendPath) :
        path.join(__dirname, '..');

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
                    console.error(`Python module '${moduleName}' not found. Please install dependencies.`);
                    return; // Don't retry if it's a missing dependency
                }

                // Backend crashed, try to restart after a delay
                setTimeout(() => {
                    if (mb && mb.window && !mb.window.isDestroyed() && backendRestartAttempts <= MAX_RESTART_ATTEMPTS) {
                        startBackend();
                    }
                }, 2000);
            } else {
                console.error(`Backend failed to start after ${MAX_RESTART_ATTEMPTS} attempts.`);
            }
        } else {
            // Success - reset restart counter
            backendRestartAttempts = 0;
        }
    });
}

function loadFrontend() {
    console.log('Loading frontend, isProduction:', isProduction);

    if (!mb || !mb.window || mb.window.isDestroyed()) {
        console.error('Window is not available');
        return;
    }

    if (isProduction) {
        // In production, backend serves static files
        console.log('Loading production frontend from backend');
        const backendUrl = `http://127.0.0.1:${BACKEND_PORT}`;

        // Check if backend is ready before loading
        const http = require('http');
        const checkBackendAndLoad = () => {
            const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/api/v1/test-connection?url=http://test&token=test`, (res) => {
                res.on('data', () => {});
                res.on('end', () => {
                    // Backend is ready, load frontend
                    console.log('Backend is ready, loading frontend');

                    // Add error handlers for production
                    mb.window.webContents.once('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
                        console.error('Failed to load frontend from backend:', validatedURL, 'Error:', errorCode, errorDescription);
                    });

                    mb.window.webContents.once('did-finish-load', () => {
                        console.log('Frontend loaded successfully from backend');
                        // Verify the URL is actually the frontend, not about:blank
                        const currentUrl = mb.window.webContents.getURL();
                        if (currentUrl && currentUrl !== 'about:blank' && !currentUrl.includes('about:blank')) {
                            // Show the window after frontend loads (only on first load)
                            if (mb && mb.window && !hasShownWindowInitially) {
                                hasShownWindowInitially = true;
                                // Use window.show() directly to bypass menubar's auto-hide logic
                                mb.window.show();
                                mb.window.focus();
                                if (app.dock) {
                                    app.dock.show();
                                }
                            }
                        }
                    });

                    mb.window.loadURL(backendUrl);
                });
            });

            req.on('error', () => {
                // Backend not ready yet, wait and retry
                console.log('Backend not ready, retrying in 500ms...');
                setTimeout(checkBackendAndLoad, 500);
            });

            req.setTimeout(1000);
            req.on('timeout', () => {
                req.destroy();
                setTimeout(checkBackendAndLoad, 500);
            });
        };

        checkBackendAndLoad();
    } else {
        // In development, load Vite dev server
        const viteUrl = `http://localhost:${FRONTEND_PORT}`;
        console.log('Loading Vite frontend at', viteUrl);

        // Check if Vite server is running before loading
        const http = require('http');
        const checkVite = () => {
            const req = http.get(`http://localhost:${FRONTEND_PORT}`, (res) => {
                // Vite is ready, load the frontend
                mb.window.webContents.once('did-finish-load', () => {
                    console.log('Frontend loaded successfully at', viteUrl);
                    // Verify the URL is actually the frontend, not about:blank
                    const currentUrl = mb.window.webContents.getURL();
                    if (currentUrl && currentUrl !== 'about:blank' && !currentUrl.includes('about:blank')) {
                        // Show the window after frontend loads (only on first load)
                        if (mb && mb.window && !hasShownWindowInitially) {
                            hasShownWindowInitially = true;
                            // Use window.show() directly to bypass menubar's auto-hide logic
                            mb.window.show();
                            mb.window.focus();
                            if (app.dock) {
                                app.dock.show();
                            }
                        }
                    }
                });

                mb.window.webContents.once('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
                    console.error('Failed to load URL:', validatedURL, 'Error:', errorCode, errorDescription);
                });

                mb.window.loadURL(viteUrl);
            });

            req.on('error', () => {
                // Vite not ready yet, wait and retry
                console.log('Waiting for Vite dev server to start...');
                setTimeout(checkVite, 1000);
            });

            req.setTimeout(1000);
            req.on('timeout', () => {
                req.destroy();
                setTimeout(checkVite, 1000);
            });
        };

        checkVite();
    }
}

// Create menubar app
// Use the menubar demo PNG template icon (same filename as in menubar assets)
const iconPath = path.join(__dirname, 'IconTemplate@2x.png');

mb = createMenubar({
    index: 'about:blank', // Start with blank page, we'll load after backend is ready
    icon: iconPath, // Use PNG template icon from menubar assets
    browserWindow: {
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        frame: true, // Show window frame with chrome (close, minimize, maximize buttons)
        titleBarStyle: 'default', // Use default title bar style
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        show: false, // Don't show until ready - CRITICAL: must be false
        skipTaskbar: false, // Show in task switcher
    },
    showOnAllWorkspaces: false,
    preloadWindow: true, // Preload window so it exists when we need it
    tooltip: 'Plexio',
    showDockIcon: false, // Don't show dock icon initially
    hideOnBlur: false, // Don't auto-hide when window loses focus
    windowPosition: 'center', // Center the window instead of under the icon
});

mb.on('ready', () => {
    console.log('Menubar app is ready');

    // Start backend
    startBackend();

    // Wait for window to be created first
    mb.on('after-create-window', () => {
        console.log('Window created, waiting for backend...');

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
    });

    // Create menu
    const template = [{
            label: 'Show Config Page',
            click: () => {
                if (mb && mb.window) {
                    const currentUrl = mb.window.webContents.getURL();
                    // Make sure window is loaded before showing
                    if (!currentUrl || currentUrl === 'about:blank' || currentUrl.includes('about:blank')) {
                        // Window hasn't loaded frontend yet, load it now
                        loadFrontend();
                        // Wait for frontend to load before showing
                        mb.window.webContents.once('did-finish-load', () => {
                            if (mb && mb.window) {
                                // Verify URL is actually loaded (not still about:blank)
                                const loadedUrl = mb.window.webContents.getURL();
                                console.log('Frontend loaded, URL:', loadedUrl);
                                if (loadedUrl && loadedUrl !== 'about:blank' && !loadedUrl.includes('about:blank')) {
                                    // Use window.show() directly to bypass menubar's auto-hide logic
                                    mb.window.show();
                                    mb.window.focus();
                                    if (app.dock) {
                                        app.dock.show();
                                    }
                                } else {
                                    console.error('Frontend URL is still about:blank after load');
                                }
                            }
                        });
                        // Also handle load failures
                        mb.window.webContents.once('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
                            console.error('Failed to load frontend:', validatedURL, 'Error:', errorCode, errorDescription);
                        });
                    } else {
                        // Frontend is already loaded, just show the window (don't hide if already visible)
                        if (!mb.window.isVisible()) {
                            // Use window.show() directly to bypass menubar's auto-hide logic
                            mb.window.show();
                        }
                        // Also bring to front
                        mb.window.focus();
                        if (app.dock) {
                            app.dock.show();
                        }
                    }
                }
            },
        },
        {
            type: 'separator',
        },
        {
            label: 'Quit',
            click: () => {
                // Kill backend process first
                if (backendProcess) {
                    backendProcess.kill();
                    backendProcess = null;
                }
                // Then quit the app
                app.quit();
            },
        },
    ];

    const menu = Menu.buildFromTemplate(template);
    mb.tray.setContextMenu(menu);

    // Disable default click behavior - only show via "Show Config Page" menu item
    // Override menubar's default click handler
    mb.tray.removeAllListeners('click');
    mb.tray.on('click', (event) => {
        // Prevent default behavior (which might show/hide window)
        // Just show the context menu on click
        mb.tray.popUpContextMenu();
    });

    // Wait for window to be created before setting up event handlers
    mb.on('after-create-window', () => {
        if (!mb.window) return;

        // Set window title
        mb.window.setTitle('Plexio - Configuration');

        // Handle window closing - allow normal close behavior
        mb.window.on('close', (event) => {
            // Allow normal close - window will be hidden, not destroyed
            // Hide dock icon when window is closed
            if (app.dock) {
                app.dock.hide();
            }
        });

        // Show window when ready
        mb.window.once('ready-to-show', () => {
            // Don't auto-show - user will click tray icon or menu item
            // Show dock when window becomes visible
            if (app.dock) {
                app.dock.show();
            }
        });

        // Open external links in default browser
        mb.window.webContents.setWindowOpenHandler(({
            url
        }) => {
            shell.openExternal(url);
            return {
                action: 'deny'
            };
        });

        // Show dock when window is shown
        mb.window.on('show', () => {
            if (app.dock) {
                app.dock.show();
            }
        });

        // Hide dock when window is hidden
        mb.window.on('hide', () => {
            if (app.dock) {
                app.dock.hide();
            }
        });
    });
});

// Handle app termination
app.on('before-quit', (event) => {
    // Kill backend process before quitting
    if (backendProcess) {
        event.preventDefault();
        backendProcess.kill('SIGTERM');
        // Give it a moment to clean up, then force kill if needed
        setTimeout(() => {
            if (backendProcess) {
                backendProcess.kill('SIGKILL');
            }
            backendProcess = null;
            app.exit(0);
        }, 500);
    }
});

// Prevent app from quitting when all windows are closed (on macOS)
app.on('window-all-closed', () => {
    // Don't quit on macOS - keep running in menubar
    if (process.platform !== 'darwin') {
        app.quit();
    }
});