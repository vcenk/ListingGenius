// ListingGenius Storage Utilities

/**
 * Get user settings from storage
 * @returns {Promise<Object>} - User settings
 */
export async function getSettings() {
  const data = await chrome.storage.local.get('settings');
  return data.settings || {
    openaiApiKey: '',
    keywordsEverywhereApiKey: '',
    falApiKey: '',
    defaultPlatform: 'etsy',
    defaultTone: 'professional',
    autoAnalyze: true,
    imageSettings: {
      defaultUpscaleSize: 3000,
      autoRemoveBackground: true,
      preferredLifestyleStyle: 'photorealistic',
      savedScenePresets: []
    }
  };
}

/**
 * Save user settings to storage
 * @param {Object} settings - Settings to save
 */
export async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

/**
 * Get usage data
 * @returns {Promise<Object>} - Usage data
 */
export async function getUsage() {
  const data = await chrome.storage.local.get('usage');
  return data.usage || {
    creditsUsed: 0,
    creditsLimit: 50,
    resetDate: null,
    history: []
  };
}

/**
 * Update usage data
 * @param {Object} updates - Fields to update
 */
export async function updateUsage(updates) {
  const usage = await getUsage();
  const newUsage = { ...usage, ...updates };
  await chrome.storage.local.set({ usage: newUsage });
  return newUsage;
}

/**
 * Increment credits used
 * @param {string} action - The action performed
 * @param {string} product - Product that was processed
 */
export async function incrementCredits(action, product) {
  const usage = await getUsage();

  // Check if we need to reset
  if (usage.resetDate && new Date() > new Date(usage.resetDate)) {
    usage.creditsUsed = 0;
    usage.resetDate = getNextResetDate();
    usage.history = [];
  }

  usage.creditsUsed = Math.min(usage.creditsUsed + 1, usage.creditsLimit);
  usage.history.push({
    date: new Date().toISOString(),
    action,
    product: product?.substring(0, 50)
  });

  // Keep history to last 100 items
  if (usage.history.length > 100) {
    usage.history = usage.history.slice(-100);
  }

  await chrome.storage.local.set({ usage });
  return usage;
}

/**
 * Check if user has credits remaining
 * @returns {Promise<boolean>}
 */
export async function hasCredits() {
  const usage = await getUsage();
  return usage.creditsUsed < usage.creditsLimit;
}

/**
 * Save data to cache with TTL
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} ttl - Time to live in milliseconds
 */
export async function saveToCache(key, data, ttl = 86400000) {
  const cacheData = await chrome.storage.local.get('cache') || {};
  const cache = cacheData.cache || {};

  cache[key] = {
    data,
    timestamp: Date.now(),
    ttl
  };

  // Clean expired entries
  const now = Date.now();
  for (const k of Object.keys(cache)) {
    if (cache[k].timestamp + cache[k].ttl < now) {
      delete cache[k];
    }
  }

  await chrome.storage.local.set({ cache });
}

/**
 * Get data from cache
 * @param {string} key - Cache key
 * @returns {Promise<any|null>} - Cached data or null if expired/missing
 */
export async function getFromCache(key) {
  const cacheData = await chrome.storage.local.get('cache');
  const cache = cacheData.cache || {};
  const entry = cache[key];

  if (!entry) return null;

  // Check if expired
  if (Date.now() > entry.timestamp + entry.ttl) {
    delete cache[key];
    await chrome.storage.local.set({ cache });
    return null;
  }

  return entry.data;
}

/**
 * Clear all cache
 */
export async function clearCache() {
  await chrome.storage.local.set({ cache: {} });
}

/**
 * Save user template
 * @param {string} name - Template name
 * @param {Object} template - Template data
 */
export async function saveTemplate(name, template) {
  const data = await chrome.storage.local.get('templates');
  const templates = data.templates || {};
  templates[name] = template;
  await chrome.storage.local.set({ templates });
}

/**
 * Get user templates
 * @returns {Promise<Object>} - All templates
 */
export async function getTemplates() {
  const data = await chrome.storage.local.get('templates');
  return data.templates || {};
}

/**
 * Delete a template
 * @param {string} name - Template name
 */
export async function deleteTemplate(name) {
  const data = await chrome.storage.local.get('templates');
  const templates = data.templates || {};
  delete templates[name];
  await chrome.storage.local.set({ templates });
}

/**
 * Get next monthly reset date
 * @returns {string} - ISO date string
 */
function getNextResetDate() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString().split('T')[0];
}

/**
 * Export all user data (for backup)
 * @returns {Promise<Object>} - All user data
 */
export async function exportUserData() {
  const data = await chrome.storage.local.get(null);
  return {
    settings: data.settings || {},
    templates: data.templates || {},
    usage: data.usage || {},
    exportDate: new Date().toISOString()
  };
}

/**
 * Import user data (from backup)
 * @param {Object} data - Data to import
 */
export async function importUserData(data) {
  if (data.settings) {
    await chrome.storage.local.set({ settings: data.settings });
  }
  if (data.templates) {
    await chrome.storage.local.set({ templates: data.templates });
  }
}

// ==========================================
// Image Studio Storage Functions
// ==========================================

/**
 * Get image generation history
 * @returns {Promise<Object>} - Image history
 */
export async function getImageHistory() {
  const data = await chrome.storage.local.get('imageHistory');
  return data.imageHistory || {
    generated: [],
    favorites: [],
    presets: []
  };
}

/**
 * Add generated image to history
 * @param {Object} imageData - Image data to save
 */
export async function addToImageHistory(imageData) {
  const history = await getImageHistory();

  history.generated.unshift({
    id: Date.now().toString(),
    ...imageData,
    createdAt: new Date().toISOString()
  });

  // Keep last 50 generated images
  if (history.generated.length > 50) {
    history.generated = history.generated.slice(0, 50);
  }

  await chrome.storage.local.set({ imageHistory: history });
  return history;
}

/**
 * Add image to favorites
 * @param {Object} imageData - Image to favorite
 */
export async function addToFavorites(imageData) {
  const history = await getImageHistory();

  const exists = history.favorites.find(f => f.imageUrl === imageData.imageUrl);
  if (!exists) {
    history.favorites.unshift({
      id: Date.now().toString(),
      ...imageData,
      favoritedAt: new Date().toISOString()
    });
  }

  await chrome.storage.local.set({ imageHistory: history });
  return history;
}

/**
 * Remove image from favorites
 * @param {string} imageId - Image ID to remove
 */
export async function removeFromFavorites(imageId) {
  const history = await getImageHistory();
  history.favorites = history.favorites.filter(f => f.id !== imageId);
  await chrome.storage.local.set({ imageHistory: history });
  return history;
}

/**
 * Save custom scene preset
 * @param {Object} preset - Preset data
 */
export async function saveScenePreset(preset) {
  const history = await getImageHistory();

  history.presets.push({
    id: Date.now().toString(),
    ...preset,
    createdAt: new Date().toISOString()
  });

  await chrome.storage.local.set({ imageHistory: history });
  return history;
}

/**
 * Delete custom scene preset
 * @param {string} presetId - Preset ID to delete
 */
export async function deleteScenePreset(presetId) {
  const history = await getImageHistory();
  history.presets = history.presets.filter(p => p.id !== presetId);
  await chrome.storage.local.set({ imageHistory: history });
  return history;
}

/**
 * Get image credits usage
 * @returns {Promise<Object>} - Image credits data
 */
export async function getImageCredits() {
  const data = await chrome.storage.local.get('imageCredits');
  return data.imageCredits || {
    used: 0,
    limit: 20,
    resetDate: getNextResetDate(),
    history: []
  };
}

/**
 * Use image credit
 * @param {string} operation - Operation type
 * @param {number} cost - Credit cost
 */
export async function useImageCredit(operation, cost = 1) {
  const credits = await getImageCredits();

  // Check if we need to reset
  if (credits.resetDate && new Date() > new Date(credits.resetDate)) {
    credits.used = 0;
    credits.resetDate = getNextResetDate();
    credits.history = [];
  }

  credits.used += cost;
  credits.history.push({
    operation,
    cost,
    date: new Date().toISOString()
  });

  // Keep history to last 100 items
  if (credits.history.length > 100) {
    credits.history = credits.history.slice(-100);
  }

  await chrome.storage.local.set({ imageCredits: credits });
  return credits;
}

/**
 * Check if user has image credits remaining
 * @param {number} required - Credits required
 * @returns {Promise<boolean>}
 */
export async function hasImageCredits(required = 1) {
  const credits = await getImageCredits();
  return credits.used + required <= credits.limit;
}

/**
 * Clear image history
 */
export async function clearImageHistory() {
  await chrome.storage.local.set({
    imageHistory: {
      generated: [],
      favorites: [],
      presets: []
    }
  });
}
