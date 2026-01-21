// ListingGenius Side Panel Script

// State
let state = {
  keywords: [],
  selectedKeywords: new Set(),
  currentTab: 'trending',
  sortBy: 'volume',
  searchQuery: ''
};

// DOM Elements
const elements = {
  searchInput: document.getElementById('searchInput'),
  tabs: document.querySelectorAll('.tab'),
  sortSelect: document.getElementById('sortSelect'),
  selectAllBtn: document.getElementById('selectAllBtn'),
  mainContent: document.getElementById('mainContent'),
  loadingState: document.getElementById('loadingState'),
  emptyState: document.getElementById('emptyState'),
  keywordList: document.getElementById('keywordList'),
  selectedCount: document.getElementById('selectedCount'),
  copyBtn: document.getElementById('copyBtn'),
  exportBtn: document.getElementById('exportBtn'),
  applyBtn: document.getElementById('applyBtn')
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupEventListeners();
  await loadInitialData();
}

function setupEventListeners() {
  // Search
  elements.searchInput.addEventListener('input', debounce(handleSearch, 300));
  elements.searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fetchKeywords();
  });

  // Tabs
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Sort
  elements.sortSelect.addEventListener('change', () => {
    state.sortBy = elements.sortSelect.value;
    renderKeywords();
  });

  // Select All
  elements.selectAllBtn.addEventListener('click', toggleSelectAll);

  // Footer actions
  elements.copyBtn.addEventListener('click', copySelectedKeywords);
  elements.exportBtn.addEventListener('click', exportToCSV);
  elements.applyBtn.addEventListener('click', applyToListing);

  // Listen for messages from background
  chrome.runtime.onMessage.addListener(handleMessage);
}

async function loadInitialData() {
  showLoading();

  try {
    // Check for keyword query from popup
    const sessionData = await chrome.storage.session.get(['keywordQuery', 'competitorData']);

    if (sessionData.keywordQuery) {
      elements.searchInput.value = sessionData.keywordQuery;
      await fetchKeywords(sessionData.keywordQuery);
      // Clear the query
      await chrome.storage.session.remove('keywordQuery');
    } else if (sessionData.competitorData) {
      state.currentTab = 'competitor';
      updateTabs();
      displayCompetitorKeywords(sessionData.competitorData);
      await chrome.storage.session.remove('competitorData');
    } else {
      // Load trending/default keywords
      await loadTrendingKeywords();
    }
  } catch (error) {
    console.error('Failed to load initial data:', error);
    showEmpty();
  }
}

function handleMessage(message, sender, sendResponse) {
  const { action, data } = message;

  switch (action) {
    case 'displayKeywords':
      state.keywords = data.keywords || [];
      renderKeywords();
      break;

    case 'displayCompetitorKeywords':
      state.currentTab = 'competitor';
      updateTabs();
      displayCompetitorKeywords(data);
      break;
  }

  sendResponse({ success: true });
  return false;
}

async function fetchKeywords(query = null) {
  const searchQuery = query || elements.searchInput.value.trim();

  if (!searchQuery) {
    showEmpty();
    return;
  }

  showLoading();

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getKeywords',
      data: { query: searchQuery, platform: 'etsy' }
    });

    if (response.error) {
      throw new Error(response.error);
    }

    state.keywords = response.data || [];
    renderKeywords();
  } catch (error) {
    console.error('Failed to fetch keywords:', error);
    showEmpty();
  }
}

async function loadTrendingKeywords() {
  showLoading();

  try {
    // Get current tab URL to detect product context
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';

    if (url.includes('etsy.com') || url.includes('amazon.')) {
      // Try to get product context from page
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'analyzePage' });
      if (response.data?.productTitle) {
        elements.searchInput.value = response.data.productTitle;
        await fetchKeywords(response.data.productTitle);
        return;
      }
    }

    // Show empty state with instructions
    showEmpty();
  } catch (error) {
    showEmpty();
  }
}

function displayCompetitorKeywords(competitorData) {
  if (!competitorData) {
    showEmpty();
    return;
  }

  // Extract keywords from competitor data
  const keywords = [];

  // From title
  if (competitorData.productTitle) {
    const titleWords = extractWordsFromText(competitorData.productTitle);
    titleWords.forEach(word => {
      keywords.push({
        keyword: word,
        volume: estimateVolume(word),
        trend: 'stable',
        source: 'title'
      });
    });
  }

  // From tags
  if (competitorData.tags) {
    competitorData.tags.forEach(tag => {
      keywords.push({
        keyword: tag,
        volume: estimateVolume(tag),
        trend: 'stable',
        source: 'tags'
      });
    });
  }

  // From keywords array
  if (competitorData.keywords) {
    competitorData.keywords.forEach(kw => {
      if (!keywords.find(k => k.keyword === kw)) {
        keywords.push({
          keyword: kw,
          volume: estimateVolume(kw),
          trend: 'stable',
          source: 'extracted'
        });
      }
    });
  }

  state.keywords = keywords;
  renderKeywords();
}

function extractWordsFromText(text) {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'this', 'that'
  ]);

  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

function estimateVolume(keyword) {
  // Simple estimation based on keyword length and common terms
  const wordCount = keyword.split(' ').length;
  const base = wordCount === 1 ? 50000 : wordCount === 2 ? 20000 : 5000;
  return Math.floor(base * (0.5 + Math.random()));
}

function renderKeywords() {
  if (state.keywords.length === 0) {
    showEmpty();
    return;
  }

  // Sort keywords
  const sorted = sortKeywords([...state.keywords]);

  // Filter by search
  const filtered = state.searchQuery
    ? sorted.filter(k => k.keyword.toLowerCase().includes(state.searchQuery.toLowerCase()))
    : sorted;

  if (filtered.length === 0) {
    showEmpty();
    return;
  }

  // Render list
  elements.keywordList.innerHTML = filtered.map((keyword, index) => `
    <li class="keyword-item ${state.selectedKeywords.has(keyword.keyword) ? 'selected' : ''}"
        data-keyword="${escapeHtml(keyword.keyword)}">
      <input type="checkbox" class="keyword-checkbox"
             ${state.selectedKeywords.has(keyword.keyword) ? 'checked' : ''}>
      <div class="keyword-info">
        <div class="keyword-text">${escapeHtml(keyword.keyword)}</div>
        <div class="keyword-meta">
          <span class="volume-badge ${getVolumeBadgeClass(keyword.volume)}">
            ${formatVolume(keyword.volume)}
          </span>
          <span class="trend-indicator ${keyword.trend}">
            ${getTrendIcon(keyword.trend)} ${keyword.trend}
          </span>
          ${keyword.source ? `<span class="source-tag">${keyword.source}</span>` : ''}
        </div>
      </div>
      <div class="keyword-actions">
        <button class="action-btn-small copy-single" title="Copy">&#128203;</button>
      </div>
    </li>
  `).join('');

  // Add event listeners
  elements.keywordList.querySelectorAll('.keyword-item').forEach(item => {
    const keyword = item.dataset.keyword;
    const checkbox = item.querySelector('.keyword-checkbox');
    const copyBtn = item.querySelector('.copy-single');

    checkbox.addEventListener('change', () => toggleKeyword(keyword));
    item.addEventListener('click', (e) => {
      if (e.target !== checkbox && e.target !== copyBtn) {
        checkbox.checked = !checkbox.checked;
        toggleKeyword(keyword);
      }
    });
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(keyword);
    });
  });

  showKeywordList();
  updateFooter();
}

function sortKeywords(keywords) {
  switch (state.sortBy) {
    case 'volume':
      return keywords.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    case 'trend':
      const trendOrder = { rising: 0, stable: 1, declining: 2 };
      return keywords.sort((a, b) => trendOrder[a.trend] - trendOrder[b.trend]);
    case 'alpha':
      return keywords.sort((a, b) => a.keyword.localeCompare(b.keyword));
    default:
      return keywords;
  }
}

function toggleKeyword(keyword) {
  if (state.selectedKeywords.has(keyword)) {
    state.selectedKeywords.delete(keyword);
  } else {
    state.selectedKeywords.add(keyword);
  }
  updateFooter();
  updateKeywordItemUI(keyword);
}

function updateKeywordItemUI(keyword) {
  const item = elements.keywordList.querySelector(`[data-keyword="${CSS.escape(keyword)}"]`);
  if (item) {
    item.classList.toggle('selected', state.selectedKeywords.has(keyword));
  }
}

function toggleSelectAll() {
  const allSelected = state.selectedKeywords.size === state.keywords.length;

  if (allSelected) {
    state.selectedKeywords.clear();
  } else {
    state.keywords.forEach(k => state.selectedKeywords.add(k.keyword));
  }

  renderKeywords();
}

function switchTab(tabName) {
  state.currentTab = tabName;
  state.selectedKeywords.clear();
  updateTabs();

  switch (tabName) {
    case 'trending':
      loadTrendingKeywords();
      break;
    case 'competitor':
      // Load competitor data if available
      chrome.storage.session.get('competitorData').then(data => {
        if (data.competitorData) {
          displayCompetitorKeywords(data.competitorData);
        } else {
          showEmpty();
        }
      });
      break;
    case 'saved':
      loadSavedKeywords();
      break;
  }
}

function updateTabs() {
  elements.tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === state.currentTab);
  });
}

async function loadSavedKeywords() {
  showLoading();

  try {
    const data = await chrome.storage.local.get('savedKeywords');
    state.keywords = data.savedKeywords || [];
    renderKeywords();
  } catch (error) {
    showEmpty();
  }
}

function handleSearch() {
  state.searchQuery = elements.searchInput.value.trim();
  renderKeywords();
}

// Footer Actions
function updateFooter() {
  const count = state.selectedKeywords.size;
  elements.selectedCount.textContent = `${count} selected`;
  elements.copyBtn.disabled = count === 0;
  elements.exportBtn.disabled = count === 0;
  elements.applyBtn.disabled = count === 0;
}

async function copySelectedKeywords() {
  const keywords = Array.from(state.selectedKeywords);
  await copyToClipboard(keywords.join(', '));
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showNotification('Copied to clipboard!');
  } catch (error) {
    console.error('Failed to copy:', error);
  }
}

function exportToCSV() {
  const selectedData = state.keywords.filter(k => state.selectedKeywords.has(k.keyword));

  const csv = [
    ['Keyword', 'Volume', 'Trend', 'Source'].join(','),
    ...selectedData.map(k => [
      `"${k.keyword}"`,
      k.volume || '',
      k.trend || '',
      k.source || ''
    ].join(','))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `keywords-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showNotification('CSV exported!');
}

async function applyToListing() {
  const keywords = Array.from(state.selectedKeywords);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await chrome.tabs.sendMessage(tab.id, {
      action: 'autoFill',
      data: { tags: keywords }
    });

    showNotification('Keywords applied to listing!');
  } catch (error) {
    showNotification('Failed to apply keywords. Make sure you are on a listing page.');
  }
}

// UI State Helpers
function showLoading() {
  elements.loadingState.classList.remove('hidden');
  elements.emptyState.classList.add('hidden');
  elements.keywordList.classList.add('hidden');
}

function showEmpty() {
  elements.loadingState.classList.add('hidden');
  elements.emptyState.classList.remove('hidden');
  elements.keywordList.classList.add('hidden');
}

function showKeywordList() {
  elements.loadingState.classList.add('hidden');
  elements.emptyState.classList.add('hidden');
  elements.keywordList.classList.remove('hidden');
}

function showNotification(message) {
  // Simple notification - could be enhanced
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    background: #1f2937;
    color: white;
    border-radius: 8px;
    font-size: 13px;
    z-index: 1000;
    animation: fadeIn 0.2s;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.2s';
    setTimeout(() => notification.remove(), 200);
  }, 2000);
}

// Utility Functions
function formatVolume(volume) {
  if (!volume) return '-';
  if (volume >= 1000000) return (volume / 1000000).toFixed(1) + 'M';
  if (volume >= 1000) return (volume / 1000).toFixed(1) + 'K';
  return volume.toString();
}

function getVolumeBadgeClass(volume) {
  if (volume >= 50000) return 'high';
  if (volume >= 10000) return 'medium';
  return '';
}

function getTrendIcon(trend) {
  switch (trend) {
    case 'rising': return '&#8593;';
    case 'declining': return '&#8595;';
    default: return '&#8212;';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}
