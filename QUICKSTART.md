# Quick Start Guide

## First Time Setup

Before running the Electron app, you need to install dependencies:

### Option 1: Use the setup script (Recommended)

```bash
./setup.sh
```

### Option 2: Manual setup

```bash
# Install Python dependencies
python3 -m pip install -e .

# Install Node.js dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
```

## Running the App

### Development Mode

**Option 1: Full dev mode (recommended)**
Starts both Vite dev server and Electron automatically:

```bash
npm run electron:dev:full
```

**Option 2: Manual**
Start Vite dev server in one terminal:
```bash
npm run dev:frontend
```

Then in another terminal, start Electron:
```bash
npm run electron:dev
```

**Note:** In development mode, you need:
- Python dependencies installed (via `python3 -m pip install -e .`)
- Frontend dev server running (port 5173) - handled automatically with `electron:dev:full`

### Building the App

```bash
npm run build
```

This creates a `.dmg` file in the `release/` directory.

## Troubleshooting

### "No module named uvicorn" Error

This means Python dependencies aren't installed. Run:

```bash
python3 -m pip install -e .
```

### Blank Window

If you see a blank white window:
1. Check the terminal for error messages
2. Make sure Python dependencies are installed
3. In development mode, you may need to start the frontend dev server separately:
   ```bash
   cd frontend && npm run dev
   ```

### Backend Won't Start

- Check that all Python dependencies are installed
- Verify Python 3.11+ is being used
- Check the terminal output for specific error messages
