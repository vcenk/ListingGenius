// ListingGenius Image Studio

// State
const state = {
  images: [],
  selectedImages: new Set(),
  capturedImages: [],
  selectedCaptured: new Set(),
  generatedImages: [],
  platform: 'amazon',
  currentTool: null,
  lifestylePreset: null,
  customPrompt: '',
  lifestyleStyle: 'photorealistic'
};

// DOM Elements
const elements = {
  // Platform
  platformBtns: document.querySelectorAll('.platform-btn'),

  // Workspace
  emptyState: document.getElementById('emptyState'),
  imageWorkspace: document.getElementById('imageWorkspace'),
  imageGrid: document.getElementById('imageGrid'),
  selectedCount: document.getElementById('selectedCount'),

  // Capture
  captureFromPageBtn: document.getElementById('captureFromPageBtn'),
  uploadImagesBtn: document.getElementById('uploadImagesBtn'),
  fileInput: document.getElementById('fileInput'),
  captureModal: document.getElementById('captureModal'),
  captureGrid: document.getElementById('captureGrid'),
  captureCount: document.getElementById('captureCount'),
  closeCaptureModal: document.getElementById('closeCaptureModal'),
  cancelCaptureBtn: document.getElementById('cancelCaptureBtn'),
  confirmCaptureBtn: document.getElementById('confirmCaptureBtn'),

  // Toolbar
  addMoreBtn: document.getElementById('addMoreBtn'),
  selectAllBtn: document.getElementById('selectAllBtn'),
  deleteSelectedBtn: document.getElementById('deleteSelectedBtn'),

  // Tools
  whiteBackgroundTool: document.getElementById('whiteBackgroundTool'),
  lifestyleTool: document.getElementById('lifestyleTool'),
  enhanceTool: document.getElementById('enhanceTool'),
  variationsTool: document.getElementById('variationsTool'),
  removeBackgroundTool: document.getElementById('removeBackgroundTool'),

  // Lifestyle options
  lifestyleOptions: document.getElementById('lifestyleOptions'),
  backFromLifestyle: document.getElementById('backFromLifestyle'),
  presetGrid: document.getElementById('presetGrid'),
  customScenePrompt: document.getElementById('customScenePrompt'),
  lifestyleStyle: document.getElementById('lifestyleStyle'),
  generateLifestyleBtn: document.getElementById('generateLifestyleBtn'),

  // Results
  resultsPanel: document.getElementById('resultsPanel'),
  resultsGrid: document.getElementById('resultsGrid'),
  closeResults: document.getElementById('closeResults'),
  downloadAllBtn: document.getElementById('downloadAllBtn'),
  downloadZipBtn: document.getElementById('downloadZipBtn'),
  useInListingBtn: document.getElementById('useInListingBtn'),

  // Processing
  processingOverlay: document.getElementById('processingOverlay'),
  processingTitle: document.getElementById('processingTitle'),
  processingStatus: document.getElementById('processingStatus'),
  processingProgress: document.getElementById('processingProgress'),

  // Credits
  creditsUsed: document.getElementById('creditsUsed'),
  creditsLimit: document.getElementById('creditsLimit'),
  creditsFill: document.getElementById('creditsFill'),

  // Toast
  errorToast: document.getElementById('errorToast'),
  toastMessage: document.getElementById('toastMessage'),
  closeToast: document.getElementById('closeToast'),

  // Close
  closeStudio: document.getElementById('closeStudio')
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupEventListeners();
  await loadCredits();
  checkForInitialImages();
}

function setupEventListeners() {
  // Platform toggle
  elements.platformBtns.forEach(btn => {
    btn.addEventListener('click', () => selectPlatform(btn.dataset.platform));
  });

  // Capture/Upload
  elements.captureFromPageBtn.addEventListener('click', captureFromPage);
  elements.uploadImagesBtn.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', handleFileUpload);
  elements.addMoreBtn.addEventListener('click', () => elements.fileInput.click());

  // Capture modal
  elements.closeCaptureModal.addEventListener('click', closeCaptureModal);
  elements.cancelCaptureBtn.addEventListener('click', closeCaptureModal);
  elements.confirmCaptureBtn.addEventListener('click', confirmCapture);

  // Toolbar
  elements.selectAllBtn.addEventListener('click', toggleSelectAll);
  elements.deleteSelectedBtn.addEventListener('click', deleteSelected);

  // Tools
  elements.whiteBackgroundTool.addEventListener('click', () => runTool('white_background'));
  elements.lifestyleTool.addEventListener('click', showLifestyleOptions);
  elements.enhanceTool.addEventListener('click', () => runTool('upscale'));
  elements.variationsTool.addEventListener('click', () => runTool('variations'));
  elements.removeBackgroundTool.addEventListener('click', () => runTool('remove_background'));

  // Lifestyle options
  elements.backFromLifestyle.addEventListener('click', hideLifestyleOptions);
  elements.presetGrid.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => selectPreset(btn.dataset.scene));
  });
  elements.generateLifestyleBtn.addEventListener('click', generateLifestyle);

  // Results
  elements.closeResults.addEventListener('click', closeResults);
  elements.downloadAllBtn.addEventListener('click', downloadAll);
  elements.downloadZipBtn.addEventListener('click', downloadZip);
  elements.useInListingBtn.addEventListener('click', useInListing);

  // Toast
  elements.closeToast.addEventListener('click', hideToast);

  // Close studio
  elements.closeStudio.addEventListener('click', closeStudio);
}

function selectPlatform(platform) {
  state.platform = platform;
  elements.platformBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.platform === platform);
  });
}

// Image Capture from Page
async function captureFromPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'captureProductImages'
    });

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.images || response.images.length === 0) {
      showToast('No product images found on this page', 'error');
      return;
    }

    state.capturedImages = response.images;
    state.selectedCaptured.clear();
    renderCaptureGrid();
    showCaptureModal();
  } catch (error) {
    showToast('Failed to capture images: ' + error.message, 'error');
  }
}

function showCaptureModal() {
  elements.captureModal.classList.remove('hidden');
}

function closeCaptureModal() {
  elements.captureModal.classList.add('hidden');
  state.capturedImages = [];
  state.selectedCaptured.clear();
}

function renderCaptureGrid() {
  elements.captureGrid.innerHTML = state.capturedImages.map((img, index) => `
    <div class="capture-item ${state.selectedCaptured.has(index) ? 'selected' : ''}" data-index="${index}">
      <img src="${img.thumbnail || img.src}" alt="Product image">
      <div class="checkbox">${state.selectedCaptured.has(index) ? '&#10003;' : ''}</div>
    </div>
  `).join('');

  elements.captureGrid.querySelectorAll('.capture-item').forEach(item => {
    item.addEventListener('click', () => toggleCapturedImage(parseInt(item.dataset.index)));
  });

  updateCaptureCount();
}

function toggleCapturedImage(index) {
  if (state.selectedCaptured.has(index)) {
    state.selectedCaptured.delete(index);
  } else {
    state.selectedCaptured.add(index);
  }
  renderCaptureGrid();
}

function updateCaptureCount() {
  elements.captureCount.textContent = `${state.selectedCaptured.size} selected`;
}

function confirmCapture() {
  const selectedImages = Array.from(state.selectedCaptured).map(index => ({
    id: Date.now() + index,
    src: state.capturedImages[index].src,
    thumbnail: state.capturedImages[index].thumbnail || state.capturedImages[index].src
  }));

  state.images.push(...selectedImages);
  closeCaptureModal();
  renderImageGrid();
  showWorkspace();
}

// File Upload
function handleFileUpload(event) {
  const files = Array.from(event.target.files);

  files.forEach(file => {
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      state.images.push({
        id: Date.now() + Math.random(),
        src: e.target.result,
        thumbnail: e.target.result,
        name: file.name
      });
      renderImageGrid();
      showWorkspace();
    };
    reader.readAsDataURL(file);
  });

  event.target.value = '';
}

// Image Grid
function renderImageGrid() {
  elements.imageGrid.innerHTML = state.images.map(img => `
    <div class="image-card ${state.selectedImages.has(img.id) ? 'selected' : ''}" data-id="${img.id}">
      <img src="${img.thumbnail || img.src}" alt="Product image">
      <div class="checkbox">${state.selectedImages.has(img.id) ? '&#10003;' : ''}</div>
      <button class="delete-btn" data-id="${img.id}">&times;</button>
    </div>
  `).join('');

  elements.imageGrid.querySelectorAll('.image-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.classList.contains('delete-btn')) {
        toggleImageSelection(card.dataset.id);
      }
    });

    const deleteBtn = card.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteImage(card.dataset.id);
    });
  });

  updateSelectedCount();
}

function toggleImageSelection(id) {
  id = String(id);
  const numId = parseFloat(id);

  if (state.selectedImages.has(numId)) {
    state.selectedImages.delete(numId);
  } else {
    state.selectedImages.add(numId);
  }
  renderImageGrid();
}

function toggleSelectAll() {
  if (state.selectedImages.size === state.images.length) {
    state.selectedImages.clear();
  } else {
    state.images.forEach(img => state.selectedImages.add(img.id));
  }
  renderImageGrid();
}

function deleteSelected() {
  state.images = state.images.filter(img => !state.selectedImages.has(img.id));
  state.selectedImages.clear();
  renderImageGrid();

  if (state.images.length === 0) {
    hideWorkspace();
  }
}

function deleteImage(id) {
  const numId = parseFloat(id);
  state.images = state.images.filter(img => img.id !== numId);
  state.selectedImages.delete(numId);
  renderImageGrid();

  if (state.images.length === 0) {
    hideWorkspace();
  }
}

function updateSelectedCount() {
  elements.selectedCount.textContent = `${state.selectedImages.size} selected`;
}

function showWorkspace() {
  elements.emptyState.classList.add('hidden');
  elements.imageWorkspace.classList.remove('hidden');
}

function hideWorkspace() {
  elements.emptyState.classList.remove('hidden');
  elements.imageWorkspace.classList.add('hidden');
}

// Tool Execution
async function runTool(operation) {
  const selectedIds = Array.from(state.selectedImages);

  if (selectedIds.length === 0) {
    showToast('Please select at least one image', 'error');
    return;
  }

  const selectedImages = state.images.filter(img => state.selectedImages.has(img.id));
  const creditCost = getOperationCost(operation) * selectedImages.length;

  const hasCredits = await checkCredits(creditCost);
  if (!hasCredits) {
    showToast('Not enough credits for this operation', 'error');
    return;
  }

  showProcessing(operation);

  try {
    const results = [];

    for (let i = 0; i < selectedImages.length; i++) {
      const img = selectedImages[i];
      updateProcessingStatus(`Processing image ${i + 1} of ${selectedImages.length}...`);
      updateProcessingProgress((i / selectedImages.length) * 100);

      const result = await chrome.runtime.sendMessage({
        action: 'processImage',
        data: {
          imageUrl: img.src,
          operation,
          marketplace: state.platform
        }
      });

      if (result.error) {
        throw new Error(result.error);
      }

      results.push({
        id: Date.now() + i,
        originalId: img.id,
        imageUrl: result.data.imageUrl,
        operation
      });
    }

    state.generatedImages = results;
    await useCredits(creditCost);

    hideProcessing();
    showResults();
  } catch (error) {
    hideProcessing();
    showToast('Processing failed: ' + error.message, 'error');
  }
}

function getOperationCost(operation) {
  const costs = {
    'white_background': 1,
    'remove_background': 1,
    'upscale': 1,
    'lifestyle': 2,
    'variations': 3
  };
  return costs[operation] || 1;
}

// Lifestyle Generation
function showLifestyleOptions() {
  document.querySelector('.tools-section').classList.add('hidden');
  elements.lifestyleOptions.classList.remove('hidden');
}

function hideLifestyleOptions() {
  elements.lifestyleOptions.classList.add('hidden');
  document.querySelector('.tools-section').classList.remove('hidden');
}

function selectPreset(scene) {
  state.lifestylePreset = scene;
  elements.presetGrid.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.scene === scene);
  });

  // Clear custom prompt when preset selected
  elements.customScenePrompt.value = '';
}

async function generateLifestyle() {
  const selectedIds = Array.from(state.selectedImages);

  if (selectedIds.length === 0) {
    showToast('Please select at least one image', 'error');
    return;
  }

  const customPrompt = elements.customScenePrompt.value.trim();
  const scenePrompt = customPrompt || getPresetPrompt(state.lifestylePreset);

  if (!scenePrompt) {
    showToast('Please select a scene preset or enter a custom description', 'error');
    return;
  }

  state.lifestyleStyle = elements.lifestyleStyle.value;

  const selectedImages = state.images.filter(img => state.selectedImages.has(img.id));
  const creditCost = 2 * selectedImages.length;

  const hasCredits = await checkCredits(creditCost);
  if (!hasCredits) {
    showToast('Not enough credits for this operation', 'error');
    return;
  }

  showProcessing('lifestyle');

  try {
    const results = [];

    for (let i = 0; i < selectedImages.length; i++) {
      const img = selectedImages[i];
      updateProcessingStatus(`Generating lifestyle image ${i + 1} of ${selectedImages.length}...`);
      updateProcessingProgress((i / selectedImages.length) * 100);

      const result = await chrome.runtime.sendMessage({
        action: 'processImage',
        data: {
          imageUrl: img.src,
          operation: 'lifestyle',
          scenePrompt,
          style: state.lifestyleStyle,
          marketplace: state.platform
        }
      });

      if (result.error) {
        throw new Error(result.error);
      }

      results.push({
        id: Date.now() + i,
        originalId: img.id,
        imageUrl: result.data.imageUrl,
        operation: 'lifestyle',
        prompt: scenePrompt
      });
    }

    state.generatedImages = results;
    await useCredits(creditCost);

    hideProcessing();
    hideLifestyleOptions();
    showResults();
  } catch (error) {
    hideProcessing();
    showToast('Generation failed: ' + error.message, 'error');
  }
}

function getPresetPrompt(preset) {
  const presets = {
    kitchen: 'Modern kitchen countertop with marble surface, natural morning light, clean and bright atmosphere',
    living_room: 'Cozy living room setting with neutral decor, soft natural lighting, comfortable home environment',
    bedroom: 'Serene bedroom setting with soft linens, warm ambient lighting, peaceful atmosphere',
    office: 'Modern home office desk, clean minimalist setup, professional environment with natural light',
    outdoor: 'Beautiful outdoor garden setting, natural greenery, soft daylight, fresh atmosphere',
    studio: 'Professional photography studio, clean white backdrop, perfect lighting setup'
  };
  return presets[preset] || '';
}

// Results
function showResults() {
  elements.resultsGrid.innerHTML = state.generatedImages.map(img => `
    <div class="result-card" data-id="${img.id}">
      <img src="${img.imageUrl}" alt="Generated image">
      <div class="result-card-actions">
        <button class="download-btn" data-url="${img.imageUrl}">Download</button>
        <button class="copy-btn" data-url="${img.imageUrl}">Copy</button>
      </div>
    </div>
  `).join('');

  elements.resultsGrid.querySelectorAll('.download-btn').forEach(btn => {
    btn.addEventListener('click', () => downloadImage(btn.dataset.url));
  });

  elements.resultsGrid.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => copyImageToClipboard(btn.dataset.url));
  });

  elements.resultsPanel.classList.remove('hidden');
}

function closeResults() {
  elements.resultsPanel.classList.add('hidden');
}

async function downloadImage(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `listinggenius-${Date.now()}.png`;
    a.click();

    URL.revokeObjectURL(objectUrl);
    showToast('Image downloaded!', 'success');
  } catch (error) {
    showToast('Download failed: ' + error.message, 'error');
  }
}

async function copyImageToClipboard(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type]: blob })
    ]);
    showToast('Image copied to clipboard!', 'success');
  } catch (error) {
    showToast('Copy failed: ' + error.message, 'error');
  }
}

async function downloadAll() {
  for (const img of state.generatedImages) {
    await downloadImage(img.imageUrl);
    await sleep(500); // Small delay between downloads
  }
}

async function downloadZip() {
  showToast('ZIP download requires a ZIP library - downloading individually', 'info');
  await downloadAll();
}

async function useInListing() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send images to the content script to use in the listing
    await chrome.tabs.sendMessage(tab.id, {
      action: 'useGeneratedImages',
      data: { images: state.generatedImages.map(img => img.imageUrl) }
    });

    showToast('Images added to listing!', 'success');
    closeResults();
  } catch (error) {
    showToast('Failed to add images to listing', 'error');
  }
}

// Processing UI
function showProcessing(operation) {
  const titles = {
    'white_background': 'Creating White Background',
    'remove_background': 'Removing Background',
    'upscale': 'Enhancing Image',
    'variations': 'Generating Variations',
    'lifestyle': 'Creating Lifestyle Image'
  };

  elements.processingTitle.textContent = titles[operation] || 'Processing...';
  elements.processingStatus.textContent = 'Starting...';
  elements.processingProgress.style.width = '0%';
  elements.processingOverlay.classList.remove('hidden');
}

function updateProcessingStatus(status) {
  elements.processingStatus.textContent = status;
}

function updateProcessingProgress(percent) {
  elements.processingProgress.style.width = `${percent}%`;
}

function hideProcessing() {
  elements.processingOverlay.classList.add('hidden');
}

// Credits
async function loadCredits() {
  try {
    const data = await chrome.storage.local.get('imageCredits');
    const credits = data.imageCredits || { used: 0, limit: 20 };

    elements.creditsUsed.textContent = credits.used;
    elements.creditsLimit.textContent = credits.limit;

    const percentage = (credits.used / credits.limit) * 100;
    elements.creditsFill.style.width = `${percentage}%`;

    elements.creditsFill.classList.remove('warning', 'danger');
    if (percentage >= 90) {
      elements.creditsFill.classList.add('danger');
    } else if (percentage >= 70) {
      elements.creditsFill.classList.add('warning');
    }
  } catch (error) {
    console.error('Failed to load credits:', error);
  }
}

async function checkCredits(required) {
  const data = await chrome.storage.local.get('imageCredits');
  const credits = data.imageCredits || { used: 0, limit: 20 };
  return credits.used + required <= credits.limit;
}

async function useCredits(amount) {
  const data = await chrome.storage.local.get('imageCredits');
  const credits = data.imageCredits || { used: 0, limit: 20 };
  credits.used += amount;
  await chrome.storage.local.set({ imageCredits: credits });
  await loadCredits();
}

// Toast
function showToast(message, type = 'info') {
  elements.toastMessage.textContent = message;
  elements.errorToast.className = `toast ${type}`;
  elements.errorToast.classList.remove('hidden');

  setTimeout(hideToast, 5000);
}

function hideToast() {
  elements.errorToast.classList.add('hidden');
}

// Utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function closeStudio() {
  window.close();
}

async function checkForInitialImages() {
  // Check if images were passed from the popup
  const data = await chrome.storage.session.get('studioImages');
  if (data.studioImages && data.studioImages.length > 0) {
    state.images = data.studioImages;
    renderImageGrid();
    showWorkspace();
    await chrome.storage.session.remove('studioImages');
  }
}
