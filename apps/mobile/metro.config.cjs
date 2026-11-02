const { getDefaultConfig } = require('expo/metro-config');

// Expo discovers pnpm workspaces and isolated dependencies automatically.
const config = getDefaultConfig(__dirname);
// Keep native exports and local previews within a small shared-machine budget.
config.maxWorkers = 2;
// Local tools/caches and server build output are not mobile source. Crawling
// them makes Windows exports needlessly slow in this large workspace.
config.resolver.blockList = [
  /[\\/]\.tools[\\/]/,
  /[\\/]\.git[\\/]/,
  /[\\/]\.next[\\/]/,
  /[\\/]apps[\\/]api[\\/]src[\\/]generated[\\/]/,
];
module.exports = config;
