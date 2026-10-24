const { getDefaultConfig } = require('expo/metro-config');

// Expo discovers pnpm workspaces and isolated dependencies automatically.
module.exports = getDefaultConfig(__dirname);
