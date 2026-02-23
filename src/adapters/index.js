// src/adapters/index.js
const hydropower = require('./hydropower');
const solar = require('./solar');
const wind = require('./wind');
const biomass = require('./biomass');
const SUPPORTED_ADAPTERS = { hydropower, solar, wind, biomass };
function getAdapter(type) {
  const adapter = SUPPORTED_ADAPTERS[type];
  if (!adapter) throw new Error('Unsupported energy type: ' + type + '. Supported: ' + Object.keys(SUPPORTED_ADAPTERS).join(', '));
  return adapter;
}
function getSupportedTypes() { return Object.keys(SUPPORTED_ADAPTERS); }
module.exports = { getAdapter, getSupportedTypes, SUPPORTED_ADAPTERS };
