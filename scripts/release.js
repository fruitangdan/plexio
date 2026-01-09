#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Read version from package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const version = packageJson.version;

console.log(`Building release for version ${version}...`);

// Build frontend and backend first
console.log('Building frontend...');
execSync('npm run build:frontend', { stdio: 'inherit', cwd: path.join(__dirname, '..') });

console.log('Building backend...');
execSync('npm run build:backend', { stdio: 'inherit', cwd: path.join(__dirname, '..') });

// Build DMGs for both architectures
console.log('Building DMGs for x64 and arm64...');
const outputDir = `releases/${version}`;
execSync(
  `electron-builder --mac --x64 --arm64 --publish=never --config.directories.output=${outputDir} --config.mac.target=dmg`,
  { stdio: 'inherit', cwd: path.join(__dirname, '..') }
);

console.log(`\nRelease build complete! DMGs are in ${outputDir}/`);
