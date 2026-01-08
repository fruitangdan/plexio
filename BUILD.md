# Building Plexio as a Standalone Mac App

This guide explains how to build Plexio as a standalone Mac application using Electron.

## Prerequisites

1. **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
2. **Python 3.11+** - Should already be installed on Mac
3. **npm** - Comes with Node.js

## Quick Start

### 1. Install Dependencies

```bash
# Install root dependencies (Electron, electron-builder)
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### 2. Development Mode

To run the app in development mode (useful for testing):

```bash
npm run electron:dev
```

This will:
- Start the Python backend using `uvicorn` (development server)
- Start the Vite dev server for the frontend
- Launch an Electron window

**Note:** In development mode, you need to have the frontend dev server running separately. You can start it with:

```bash
cd frontend && npm run dev
```

### 3. Build the App

To create a standalone Mac app:

```bash
npm run build
```

This command will:
1. **Build Frontend**: Compile React/TypeScript to static files in `frontend/dist/`
2. **Build Backend**: Use PyInstaller to create a standalone Python executable
3. **Package App**: Use electron-builder to create a `.dmg` file

The final `.dmg` file will be in the `release/` directory.

## Build Process Details

### Frontend Build
- Compiles TypeScript/React to JavaScript
- Bundles assets and optimizes for production
- Output: `frontend/dist/`

### Backend Build
- Uses PyInstaller to bundle Python and all dependencies
- Creates a standalone executable (no Python installation needed)
- Output: `dist/backend/backend`

### Electron Packaging
- Packages frontend static files
- Includes Python backend executable
- Creates Mac app bundle (`.app`)
- Creates distributable `.dmg` file

## Output

After building, you'll find:
- `release/Plexio-0.1.15.dmg` - Installer disk image
- `release/mac/` - Mac app bundle (for testing)

## Troubleshooting

### PyInstaller Issues

If PyInstaller fails, try:
```bash
python3 -m pip install --upgrade pyinstaller
```

### Missing Dependencies

If the backend executable fails to run, check that all Python dependencies are installed:
```bash
python3 -m pip install -r requirements.txt  # if you have one
# or install from pyproject.toml
python3 -m pip install -e .
```

### Electron Build Issues

If electron-builder fails:
```bash
npm install electron-builder --save-dev
npm run postinstall
```

### Icon Missing

The build expects an icon at `electron/icon.icns`. You can:
1. Create one using an icon generator
2. Remove the icon line from `package.json` (build will use default)

## Architecture

The standalone app:
- **Backend**: Runs as a subprocess on `127.0.0.1:8000`
- **Frontend**: Served as static files by the backend in production
- **Cache**: Uses memory cache (no Redis needed)
- **No Docker**: Everything runs natively

## Distribution

The `.dmg` file can be distributed to users. They can:
1. Double-click to mount
2. Drag Plexio.app to Applications
3. Launch from Applications

**Note:** Users may need to allow the app in System Preferences > Security & Privacy if it's not code-signed.
