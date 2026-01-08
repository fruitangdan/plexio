#!/bin/bash

# Plexio Setup Script
# Installs all dependencies needed for development and building

set -e

echo "🚀 Setting up Plexio..."

# Check Python version
echo "📦 Checking Python..."
python3 --version || { echo "❌ Python 3 is required but not found"; exit 1; }

# Install Python dependencies
echo "📦 Installing Python dependencies..."
python3 -m pip install --upgrade pip
python3 -m pip install -e .

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend
npm install
cd ..

echo "✅ Setup complete!"
echo ""
echo "To run in development mode:"
echo "  npm run electron:dev"
echo ""
echo "To build the app:"
echo "  npm run build"
