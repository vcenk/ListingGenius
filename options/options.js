// ListingGenius Options Page Script

// DOM Elements
const elements = {
  // API Keys
  openaiApiKey: document.getElementById('openaiApiKey'),
  keywordsApiKey: document.getElementById('keywordsApiKey'),
  testOpenaiBtn: document.getElementById('testOpenaiBtn'),
  testKeywordsBtn: document.getElementById('testKeywordsBtn'),
  openaiStatus: document.getElementById('openaiStatus'),
  keywordsStatus: document.getElementById('keywordsStatus'),

  // Preferences
  defaultPlatform: document.getElementById('defaultPlatform'),
  defaultTone: document.getElementById('defaultTone'),
  autoAnalyze: document.getElementById('autoAnalyze'),

  // Usage
  creditsUsed: document.getElementById('creditsUsed'),
  creditsLimit: document.getElementById('creditsLimit'),
  resetDays: document.getElementById('resetDays'),
  usageProgress: document.getElementById('usageProgress'),
  resetUsageBtn: document.getElementById('resetUsageBtn'),

  // Data Management
  exportDataBtn: document.getElementById('exportDataBtn'),
  importDataBtn: document.getElementById('importDataBtn'),
  importFileInput: document.getElementById('importFileInput'),
  clearDataBtn: document.getElementById('clearDataBtn'),

  // Save
  saveBtn: document.getElementById('saveBtn'),

  // Alert
  alertContainer: document.getElementById('alertContainer')
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadSettings();
  await loadUsage();
  setupEventListeners();
}

function setupEventListeners() {
  // Test buttons
  elements.testOpenaiBtn.addEventListener('click', testOpenAI);
  elements.testKeywordsBtn.addEventListener('click', testKeywordsEverywhere);

  // Usage
  elements.resetUsageBtn.addEventListener('click', resetUsage);

  // Data management
  elements.exportDataBtn.addEventListener('click', exportData);
  elements.importDataBtn.addEventListener('click', () => elements.importFileInput.click());
  elements.importFileInput.addEventListener('change', importData);
  elements.clearDataBtn.addEventListener('click', clearAllData);

  // Save
  elements.saveBtn.addEventListener('click', saveSettings);

  // Auto-save on input change
  const inputs = [
    elements.openaiApiKey,
    elements.keywordsApiKey,
    elements.defaultPlatform,
    elements.defaultTone,
    elements.autoAnalyze
  ];

  inputs.forEach(input => {
    input.addEventListener('change', () => {
      elements.saveBtn.textContent = 'Save Settings *';
    });
  });
}

async function loadSettings() {
  try {
    const data = await chrome.storage.local.get('settings');
    const settings = data.settings || {};

    elements.openaiApiKey.value = settings.openaiApiKey || '';
    elements.keywordsApiKey.value = settings.keywordsEverywhereApiKey || '';
    elements.defaultPlatform.value = settings.defaultPlatform || 'etsy';
    elements.defaultTone.value = settings.defaultTone || 'professional';
    elements.autoAnalyze.checked = settings.autoAnalyze !== false;

    // Update status badges
    updateApiStatus('openai', !!settings.openaiApiKey);
    updateApiStatus('keywords', !!settings.keywordsEverywhereApiKey);
  } catch (error) {
    showAlert('Failed to load settings', 'error');
  }
}

async function loadUsage() {
  try {
    const data = await chrome.storage.local.get('usage');
    const usage = data.usage || { creditsUsed: 0, creditsLimit: 50 };

    elements.creditsUsed.textContent = usage.creditsUsed;
    elements.creditsLimit.textContent = usage.creditsLimit;

    // Calculate days to reset
    if (usage.resetDate) {
      const resetDate = new Date(usage.resetDate);
      const today = new Date();
      const diffDays = Math.ceil((resetDate - today) / (1000 * 60 * 60 * 24));
      elements.resetDays.textContent = Math.max(0, diffDays);
    }

    // Update progress bar
    const percentage = (usage.creditsUsed / usage.creditsLimit) * 100;
    elements.usageProgress.style.width = `${percentage}%`;

    // Color based on usage
    elements.usageProgress.classList.remove('warning', 'danger');
    if (percentage >= 90) {
      elements.usageProgress.classList.add('danger');
    } else if (percentage >= 70) {
      elements.usageProgress.classList.add('warning');
    }
  } catch (error) {
    console.error('Failed to load usage:', error);
  }
}

async function saveSettings() {
  elements.saveBtn.disabled = true;
  elements.saveBtn.textContent = 'Saving...';

  try {
    const settings = {
      openaiApiKey: elements.openaiApiKey.value.trim(),
      keywordsEverywhereApiKey: elements.keywordsApiKey.value.trim(),
      defaultPlatform: elements.defaultPlatform.value,
      defaultTone: elements.defaultTone.value,
      autoAnalyze: elements.autoAnalyze.checked
    };

    await chrome.storage.local.set({ settings });

    showAlert('Settings saved successfully!', 'success');
    elements.saveBtn.textContent = 'Save Settings';

    // Update status badges
    updateApiStatus('openai', !!settings.openaiApiKey);
    updateApiStatus('keywords', !!settings.keywordsEverywhereApiKey);
  } catch (error) {
    showAlert('Failed to save settings: ' + error.message, 'error');
  } finally {
    elements.saveBtn.disabled = false;
  }
}

async function testOpenAI() {
  const apiKey = elements.openaiApiKey.value.trim();

  if (!apiKey) {
    showAlert('Please enter an OpenAI API key first', 'error');
    return;
  }

  elements.testOpenaiBtn.disabled = true;
  elements.testOpenaiBtn.textContent = 'Testing...';

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (response.ok) {
      updateApiStatus('openai', true);
      showAlert('OpenAI API key is valid!', 'success');
    } else {
      const error = await response.json();
      updateApiStatus('openai', false);
      showAlert('Invalid API key: ' + (error.error?.message || 'Unknown error'), 'error');
    }
  } catch (error) {
    updateApiStatus('openai', false);
    showAlert('Connection failed: ' + error.message, 'error');
  } finally {
    elements.testOpenaiBtn.disabled = false;
    elements.testOpenaiBtn.textContent = 'Test';
  }
}

async function testKeywordsEverywhere() {
  const apiKey = elements.keywordsApiKey.value.trim();

  if (!apiKey) {
    showAlert('Please enter a Keywords Everywhere API key first', 'error');
    return;
  }

  elements.testKeywordsBtn.disabled = true;
  elements.testKeywordsBtn.textContent = 'Testing...';

  try {
    const response = await fetch('https://api.keywordseverywhere.com/v1/account/credits', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      updateApiStatus('keywords', true);
      showAlert(`Keywords Everywhere connected! Credits: ${data.credits || 'N/A'}`, 'success');
    } else {
      updateApiStatus('keywords', false);
      showAlert('Invalid API key or connection failed', 'error');
    }
  } catch (error) {
    updateApiStatus('keywords', false);
    showAlert('Connection failed: ' + error.message, 'error');
  } finally {
    elements.testKeywordsBtn.disabled = false;
    elements.testKeywordsBtn.textContent = 'Test';
  }
}

function updateApiStatus(api, isConnected) {
  const statusElement = api === 'openai' ? elements.openaiStatus : elements.keywordsStatus;

  if (isConnected) {
    statusElement.textContent = 'Connected';
    statusElement.className = 'status-badge connected';
  } else {
    statusElement.textContent = 'Not configured';
    statusElement.className = 'status-badge disconnected';
  }
}

async function resetUsage() {
  if (!confirm('Are you sure you want to reset your usage? This will set your credits used to 0.')) {
    return;
  }

  try {
    const data = await chrome.storage.local.get('usage');
    const usage = data.usage || {};
    usage.creditsUsed = 0;
    usage.history = [];

    await chrome.storage.local.set({ usage });
    await loadUsage();

    showAlert('Usage reset successfully!', 'success');
  } catch (error) {
    showAlert('Failed to reset usage: ' + error.message, 'error');
  }
}

async function exportData() {
  try {
    const data = await chrome.storage.local.get(null);

    const exportData = {
      settings: data.settings || {},
      templates: data.templates || {},
      usage: data.usage || {},
      exportDate: new Date().toISOString(),
      version: '1.0.0'
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `listinggenius-backup-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showAlert('Data exported successfully!', 'success');
  } catch (error) {
    showAlert('Failed to export data: ' + error.message, 'error');
  }
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.version) {
      throw new Error('Invalid backup file format');
    }

    if (data.settings) {
      await chrome.storage.local.set({ settings: data.settings });
    }

    if (data.templates) {
      await chrome.storage.local.set({ templates: data.templates });
    }

    await loadSettings();
    showAlert('Data imported successfully!', 'success');
  } catch (error) {
    showAlert('Failed to import data: ' + error.message, 'error');
  }

  // Reset file input
  event.target.value = '';
}

async function clearAllData() {
  if (!confirm('Are you sure you want to clear ALL data? This cannot be undone.')) {
    return;
  }

  if (!confirm('This will delete your API keys, templates, and usage history. Continue?')) {
    return;
  }

  try {
    await chrome.storage.local.clear();

    // Reinitialize with defaults
    await chrome.storage.local.set({
      settings: {
        openaiApiKey: '',
        keywordsEverywhereApiKey: '',
        defaultPlatform: 'etsy',
        defaultTone: 'professional',
        autoAnalyze: true
      },
      usage: {
        creditsUsed: 0,
        creditsLimit: 50,
        resetDate: getNextResetDate(),
        history: []
      }
    });

    await loadSettings();
    await loadUsage();

    showAlert('All data cleared successfully!', 'success');
  } catch (error) {
    showAlert('Failed to clear data: ' + error.message, 'error');
  }
}

function getNextResetDate() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString().split('T')[0];
}

function showAlert(message, type) {
  const alert = document.createElement('div');
  alert.className = `alert ${type}`;
  alert.textContent = message;

  elements.alertContainer.innerHTML = '';
  elements.alertContainer.appendChild(alert);

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    alert.style.opacity = '0';
    alert.style.transition = 'opacity 0.3s';
    setTimeout(() => alert.remove(), 300);
  }, 5000);
}
