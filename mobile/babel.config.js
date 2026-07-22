// Minimal Babel config used only by Jest (`npm test`) to transform the ES
// module `export`/`import` syntax in src/lib/*.js pure-logic files into
// CommonJS so plain jest@29 (testEnvironment: node) can require() them
// directly, without pulling in the full jest-expo/react-native preset.
// The Expo dev/build toolchain (Metro) transforms JSX/RN files separately
// and does not use this file for anything beyond what's needed by tests.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};
