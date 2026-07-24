// Jest (`npm test`, NODE_ENV=test) uses a minimal preset to transform the ES
// module `export`/`import` syntax in src/lib/*.js pure-logic files into
// CommonJS, so plain jest@29 (testEnvironment: node) can require() them
// directly without pulling in the full jest-expo/react-native preset.
//
// Metro (expo start / EAS build) needs the real babel-preset-expo to
// transform JSX and other RN/Expo syntax — Metro reads this same root
// babel.config.js by default, it does NOT skip it, so both cases must be
// handled here via api.env() rather than assuming Metro ignores this file.
module.exports = function (api) {
  const isTest = api.env('test');
  api.cache(true);
  if (isTest) {
    return {
      presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
    };
  }
  return {
    presets: ['babel-preset-expo'],
  };
};
