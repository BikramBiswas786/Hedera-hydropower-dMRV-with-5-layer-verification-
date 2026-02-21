'use strict';

/**
 * Internationalization Middleware
 * ════════════════════════════════════════════════════════════════
 * Supports Hindi, Tamil, Telugu localization
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_LANG = process.env.DEFAULT_LANGUAGE || 'en';
const SUPPORTED_LANGS = ['en', 'hi', 'ta', 'te'];

const translations = {};

// Load all translation files
for (const lang of SUPPORTED_LANGS) {
  if (lang === 'en') continue; // English is default
  try {
    const filePath = path.join(__dirname, '../locales', `${lang}.json`);
    translations[lang] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn(`[i18n] Failed to load ${lang} translations:`, error.message);
  }
}

/**
 * Detect user language from Accept-Language header
 */
function detectLanguage(req) {
  const acceptLang = req.headers['accept-language'];
  
  if (!acceptLang) return DEFAULT_LANG;
  
  // Parse Accept-Language header
  const langs = acceptLang.split(',').map(l => l.split(';')[0].trim().toLowerCase());
  
  for (const lang of langs) {
    const shortLang = lang.split('-')[0];
    if (SUPPORTED_LANGS.includes(shortLang)) {
      return shortLang;
    }
  }
  
  return DEFAULT_LANG;
}

/**
 * i18n middleware
 */
function i18nMiddleware(req, res, next) {
  const lang = req.query.lang || detectLanguage(req);
  
  req.lang = lang;
  req.t = (key) => {
    if (lang === 'en' || !translations[lang]) {
      return key; // Return key if no translation
    }
    
    const keys = key.split('.');
    let value = translations[lang];
    
    for (const k of keys) {
      value = value?.[k];
      if (!value) return key;
    }
    
    return value;
  };
  
  next();
}

module.exports = i18nMiddleware;
