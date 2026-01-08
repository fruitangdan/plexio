# Electron Build Setup

This directory contains the Electron configuration for packaging Plexio as a standalone Mac app.

## Prerequisites

1. Node.js (v18 or higher)
2. Python 3.11 or higher
3. npm

## Development

To run the app in development mode:

```bash
# Install dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Run in development mode
npm run electron:dev
```

This will:
- Start the Python backend using uvicorn
- Start the Vite dev server for the frontend
- Launch Electron window

## Building

To build the standalone Mac app:

```bash
npm run build
```

This will:
1. Build the frontend as static files
2. Bundle the Python backend using PyInstaller
3. Package everything into a `.dmg` file using electron-builder

The output will be in the `release/` directory.

## Build Process

1. **Frontend Build**: Compiles React/TypeScript to static files in `frontend/dist/`
2. **Backend Build**: Uses PyInstaller to create a standalone Python executable
3. **Electron Build**: Packages everything into a Mac app bundle

## Notes

- The app uses memory cache instead of Redis (no external dependencies needed)
- Backend runs on `127.0.0.1:8000`
- Frontend is served as static files in production
- The app automatically starts the backend when launched
