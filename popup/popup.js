// ListingGenius Popup Script

// State management
let state = {
  selectedPlatform: 'etsy',
  currentView: 'input',
  analysisResults: null,
  generatedContent: null
};

// DOM Elements
const elements = {
  // Input Section
  productIdea: document.getElementById('productIdea'),
  platformButtons: document.querySelectorAll('.platform-btn'),
  validateBtn: document.getElementById('validateBtn'),

  // Results Section
  inputSection: document.getElementById('inputSection'),
  resultsSection: document.getElementById('resultsSection'),
  closeResults: document.getElementById('closeResults'),
  analyzedProduct: document.getElementById('analyzedProduct'),
  demandScoreFill: document.getElementById('demandScoreFill'),
  demandScoreValue: document.getElementById('demandScoreValue'),
  aiScoreFill: document.getElementById('aiScoreFill'),
  aiScoreValue: document.getElementById('aiScoreValue'),
  competitionBadge: document.getElementById('competitionBadge'),
  trendDirection: document.getElementById('trendDirection'),
  monthlySearches: document.getElementById('monthlySearches'),
  verdictBox: document.getElementById('verdictBox'),
  verdictIcon: document.getElementById('verdictIcon'),
  verdictText: document.getElementById('verdictText'),
  suggestionsList: document.getElementById('suggestionsList'),
  generateFromResults: document.getElementById('generateFromResults'),
  newSearch: document.getElementById('newSearch'),

  // Quick Actions
  quickActions: document.getElementById('quickActions'),
  getKeywordsBtn: document.getElementById('getKeywordsBtn'),
  generateListingBtn: document.getElementById('generateListingBtn'),
  spyListingBtn: document.getElementById('spyListingBtn'),
  analyzePageBtn: document.getElementById('analyzePageBtn'),
  imageStudioBtn: document.getElementById('imageStudioBtn'),

  // Generation Section
  generationSection: document.getElementById('generationSection'),
  closeGeneration: document.getElementById('closeGeneration'),
  genProductDesc: document.getElementById('genProductDesc'),
  genKeywords: document.getElementById('genKeywords'),
  genTone: document.getElementById('genTone'),
  generateBtn: document.getElementById('generateBtn'),
  generatedContent: document.getElementById('generatedContent'),
  generatedTitle: document.getElementById('generatedTitle'),
  generatedDesc: document.getElementById('generatedDesc'),
  generatedTags: document.getElementById('generatedTags'),
  autoFillBtn: document.getElementById('autoFillBtn'),

  // Loading & Error
  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingText: document.getElementById('loadingText'),
  errorMessage: document.getElementById('errorMessage'),
  errorText: document.getElementById('errorText'),
  closeError: document.getElementById('closeError'),

  // Footer
  creditsUsed: document.getElementById('creditsUsed'),
  creditsLimit: document.getElementById('creditsLimit'),
  settingsBtn: document.getElementById('settingsBtn')
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupEventListeners();
  await loadCredits();
  await checkCurrentPage();
}

function setupEventListeners() {
  // Platform selection
  elements.platformButtons.forEach(btn => {
    btn.addEventListener('click', () => selectPlatform(btn.dataset.platform));
  });

  // Validate demand
  elements.validateBtn.addEventListener('click', validateDemand);
  elements.productIdea.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') validateDemand();
  });

  // Results section
  elements.closeResults.addEventListener('click', hideResults);
  elements.newSearch.addEventListener('click', newSearch);
  elements.generateFromResults.addEventListener('click', () => {
    showGenerationSection();
    if (state.analysisResults) {
      elements.genProductDesc.value = elements.productIdea.value;
    }
  });

  // Quick actions
  elements.getKeywordsBtn.addEventListener('click', openKeywordPanel);
  elements.generateListingBtn.addEventListener('click', showGenerationSection);
  elements.spyListingBtn.addEventListener('click', spyListing);
  elements.analyzePageBtn.addEventListener('click', analyzePage);
  elements.imageStudioBtn.addEventListener('click', openImageStudio);

  // Generation section
  elements.closeGeneration.addEventListener('click', hideGenerationSection);
  elements.generateBtn.addEventListener('click', generateListing);
  elements.autoFillBtn.addEventListener('click', autoFillForm);

  // Copy buttons
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => copyContent(btn));
  });

  // Error close
  elements.closeError.addEventListener('click', hideError);

  // Settings
  elements.settingsBtn.addEventListener('click', openSettings);
}

function selectPlatform(platform) {
  state.selectedPlatform = platform;
  elements.platformButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.platform === platform);
  });
}

async function validateDemand() {
  const productIdea = elements.productIdea.value.trim();

  if (!productIdea) {
    showError('Please enter a product idea');
    return;
  }

  showLoading('Analyzing demand...');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'validateDemand',
      data: {
        productIdea,
        platform: state.selectedPlatform
      }
    });

    if (response.error) {
      throw new Error(response.error);
    }

    state.analysisResults = response.data;
    displayResults(response.data);
    await incrementCredits();
  } catch (error) {
    showError(error.message || 'Failed to analyze demand');
  } finally {
    hideLoading();
  }
}

function displayResults(data) {
  elements.analyzedProduct.textContent = `"${elements.productIdea.value}"`;

  // Demand Score
  const demandPercent = (data.demandScore / 10) * 100;
  elements.demandScoreFill.style.width = `${demandPercent}%`;
  elements.demandScoreFill.className = 'score-fill ' + getScoreClass(data.demandScore);
  elements.demandScoreValue.textContent = `${data.demandScore}/10`;

  // AI Visibility Score
  const aiPercent = (data.aiVisibilityScore / 10) * 100;
  elements.aiScoreFill.style.width = `${aiPercent}%`;
  elements.aiScoreFill.className = 'score-fill ' + getScoreClass(data.aiVisibilityScore);
  elements.aiScoreValue.textContent = `${data.aiVisibilityScore}/10`;

  // Competition
  elements.competitionBadge.textContent = data.competitionLevel;
  elements.competitionBadge.className = 'competition-badge ' + data.competitionLevel.toLowerCase();

  // Trend
  elements.trendDirection.textContent = formatTrend(data.trendDirection);
  elements.trendDirection.className = data.trendDirection === 'rising' ? 'rising' :
                                       data.trendDirection === 'declining' ? 'declining' : '';

  // Monthly searches
  elements.monthlySearches.textContent = formatNumber(data.monthlySearches || 0);

  // Verdict
  const verdictConfig = getVerdictConfig(data.verdict);
  elements.verdictBox.className = 'verdict-box ' + verdictConfig.class;
  elements.verdictIcon.textContent = verdictConfig.icon;
  elements.verdictText.textContent = verdictConfig.text;

  // Suggestions
  elements.suggestionsList.innerHTML = '';
  (data.suggestions || []).forEach(suggestion => {
    const li = document.createElement('li');
    li.textContent = suggestion;
    elements.suggestionsList.appendChild(li);
  });

  showResults();
}

function getScoreClass(score) {
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

function formatTrend(trend) {
  const trendMap = {
    'rising': 'Rising',
    'stable': 'Stable',
    'declining': 'Declining'
  };
  return trendMap[trend] || trend;
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function getVerdictConfig(verdict) {
  const configs = {
    'worth_listing': {
      class: 'positive',
      icon: '\u2705',
      text: 'VERDICT: Worth Listing'
    },
    'consider_modifications': {
      class: 'caution',
      icon: '\u26A0\uFE0F',
      text: 'VERDICT: Consider Modifications'
    },
    'low_demand': {
      class: 'negative',
      icon: '\u274C',
      text: 'VERDICT: Low Demand'
    }
  };
  return configs[verdict] || configs['consider_modifications'];
}

function showResults() {
  elements.resultsSection.classList.remove('hidden');
}

function hideResults() {
  elements.resultsSection.classList.add('hidden');
}

function newSearch() {
  hideResults();
  elements.productIdea.value = '';
  elements.productIdea.focus();
  state.analysisResults = null;
}

function showGenerationSection() {
  elements.generationSection.classList.remove('hidden');
  elements.generatedContent.classList.add('hidden');
}

function hideGenerationSection() {
  elements.generationSection.classList.add('hidden');
}

async function generateListing() {
  const productDesc = elements.genProductDesc.value.trim();
  const keywords = elements.genKeywords.value.trim();
  const tone = elements.genTone.value;

  if (!productDesc) {
    showError('Please enter a product description');
    return;
  }

  showLoading('Generating optimized listing...');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'generateListing',
      data: {
        productDescription: productDesc,
        keywords: keywords.split(',').map(k => k.trim()).filter(k => k),
        tone,
        platform: state.selectedPlatform
      }
    });

    if (response.error) {
      throw new Error(response.error);
    }

    state.generatedContent = response.data;
    displayGeneratedContent(response.data);
    await incrementCredits();
  } catch (error) {
    showError(error.message || 'Failed to generate listing');
  } finally {
    hideLoading();
  }
}

function displayGeneratedContent(data) {
  elements.generatedTitle.textContent = data.title || '';
  elements.generatedDesc.textContent = data.description || '';

  // Display tags
  elements.generatedTags.innerHTML = '';
  (data.tags || []).forEach(tag => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = tag;
    elements.generatedTags.appendChild(span);
  });

  elements.generatedContent.classList.remove('hidden');
}

async function copyContent(btn) {
  const targetId = btn.dataset.target;
  let text = '';

  if (targetId === 'generatedTags') {
    const tags = state.generatedContent?.tags || [];
    text = tags.join(', ');
  } else {
    const element = document.getElementById(targetId);
    text = element.textContent;
  }

  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Copied!';
    btn.classList.add('copied');

    setTimeout(() => {
      btn.textContent = targetId === 'generatedTags' ? 'Copy All' : 'Copy';
      btn.classList.remove('copied');
    }, 2000);
  } catch (error) {
    showError('Failed to copy to clipboard');
  }
}

async function autoFillForm() {
  if (!state.generatedContent) {
    showError('No content to auto-fill');
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await chrome.tabs.sendMessage(tab.id, {
      action: 'autoFill',
      data: state.generatedContent
    });

    window.close();
  } catch (error) {
    showError('Unable to auto-fill. Make sure you are on an Etsy or Amazon listing page.');
  }
}

async function openKeywordPanel() {
  try {
    await chrome.sidePanel.open({ windowId: (await chrome.windows.getCurrent()).id });

    const productIdea = elements.productIdea.value.trim();
    if (productIdea) {
      await chrome.runtime.sendMessage({
        action: 'setKeywordQuery',
        data: { query: productIdea }
      });
    }
  } catch (error) {
    showError('Failed to open keyword panel');
  }
}

async function spyListing() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractListingData'
    });

    if (response.error) {
      throw new Error(response.error);
    }

    await chrome.sidePanel.open({ windowId: (await chrome.windows.getCurrent()).id });

    await chrome.runtime.sendMessage({
      action: 'displayCompetitorKeywords',
      data: response.data
    });
  } catch (error) {
    showError('Unable to spy listing. Make sure you are on an Etsy or Amazon product page.');
  }
}

async function analyzePage() {
  showLoading('Analyzing page...');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'analyzePage'
    });

    if (response.error) {
      throw new Error(response.error);
    }

    // Display page analysis results
    if (response.data.productTitle) {
      elements.productIdea.value = response.data.productTitle;
    }

    showError('Page analyzed! Product data extracted.');
  } catch (error) {
    showError('Unable to analyze page. Make sure you are on an Etsy or Amazon page.');
  } finally {
    hideLoading();
  }
}

async function checkCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab.url || '';

    if (url.includes('etsy.com')) {
      selectPlatform('etsy');
    } else if (url.includes('amazon.')) {
      selectPlatform('amazon');
    }
  } catch (error) {
    // Ignore - not on a supported page
  }
}

// Loading & Error handling
function showLoading(text = 'Loading...') {
  elements.loadingText.textContent = text;
  elements.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  elements.loadingOverlay.classList.add('hidden');
}

function showError(message) {
  elements.errorText.textContent = message;
  elements.errorMessage.classList.remove('hidden');

  setTimeout(() => {
    hideError();
  }, 5000);
}

function hideError() {
  elements.errorMessage.classList.add('hidden');
}

// Credits management
async function loadCredits() {
  try {
    const data = await chrome.storage.local.get('usage');
    const usage = data.usage || { creditsUsed: 0, creditsLimit: 50 };

    elements.creditsUsed.textContent = usage.creditsUsed;
    elements.creditsLimit.textContent = usage.creditsLimit;
  } catch (error) {
    console.error('Failed to load credits:', error);
  }
}

async function incrementCredits() {
  try {
    const data = await chrome.storage.local.get('usage');
    const usage = data.usage || { creditsUsed: 0, creditsLimit: 50 };

    usage.creditsUsed = Math.min(usage.creditsUsed + 1, usage.creditsLimit);

    await chrome.storage.local.set({ usage });

    elements.creditsUsed.textContent = usage.creditsUsed;
  } catch (error) {
    console.error('Failed to increment credits:', error);
  }
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}

async function openImageStudio() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await chrome.runtime.sendMessage({
      action: 'openImageStudio',
      data: { tabId: tab?.id }
    });

    window.close();
  } catch (error) {
    showError('Failed to open Image Studio');
  }
}
