const { getDefaultConfig } = require('expo/metro-config');

// Expo discovers pnpm workspaces and isolated dependencies automatically.
const config = getDefaultConfig(__dirname);
// Keep native exports and local previews within a small shared-machine budget.
config.maxWorkers = 2;
module.exports = config;
