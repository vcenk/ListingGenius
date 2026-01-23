// ListingGenius Common Content Script Utilities

/**
 * ListingGenius namespace
 */
window.ListingGenius = window.ListingGenius || {};

/**
 * Validate message sender is from extension
 * @param {Object} sender - Chrome runtime sender
 * @returns {boolean} - Whether sender is trusted
 */
function isValidExtensionSender(sender) {
  // Only accept messages from our extension
  return sender.id === chrome.runtime.id;
}

/**
 * Create element with safe text content (no innerHTML)
 * @param {string} tag - HTML tag name
 * @param {Object} attrs - Attributes to set
 * @param {string} text - Text content
 * @returns {HTMLElement}
 */
function createElement(tag, attrs = {}, text = '') {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') {
      el.className = value;
    } else if (key.startsWith('data-')) {
      el.dataset[key.replace('data-', '')] = value;
    } else {
      el.setAttribute(key, value);
    }
  });
  if (text) {
    el.textContent = text;
  }
  return el;
}

/**
 * Inject floating action button into page
 */
ListingGenius.injectFloatingButton = function() {
  // Check if already injected
  if (document.getElementById('lg-floating-btn')) return;

  const button = createElement('div', { id: 'lg-floating-btn' });

  // Create main button (using safe DOM methods instead of innerHTML)
  const mainBtn = createElement('div', { className: 'lg-fab-main' });
  const mainIcon = createElement('span', { className: 'lg-fab-icon' });
  mainIcon.innerHTML = '&#128640;'; // Rocket emoji - static, safe
  mainBtn.appendChild(mainIcon);

  // Create menu
  const menu = createElement('div', { className: 'lg-fab-menu lg-hidden' });

  const menuItems = [
    { action: 'generate', title: 'Generate Listing', icon: '&#10024;' },
    { action: 'keywords', title: 'Get Keywords', icon: '&#128273;' },
    { action: 'analyze', title: 'Analyze Page', icon: '&#128202;' }
  ];

  menuItems.forEach(item => {
    const btn = createElement('button', {
      className: 'lg-fab-item',
      'data-action': item.action,
      title: item.title
    });
    const span = document.createElement('span');
    span.innerHTML = item.icon; // Static emoji codes, safe
    btn.appendChild(span);
    menu.appendChild(btn);
  });

  button.appendChild(mainBtn);
  button.appendChild(menu);
  document.body.appendChild(button);

  // Toggle menu
  const mainBtn = button.querySelector('.lg-fab-main');
  const menu = button.querySelector('.lg-fab-menu');

  mainBtn.addEventListener('click', () => {
    menu.classList.toggle('lg-hidden');
    mainBtn.classList.toggle('lg-active');
  });

  // Handle menu actions
  button.querySelectorAll('.lg-fab-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.action;
      ListingGenius.handleAction(action);
      menu.classList.add('lg-hidden');
      mainBtn.classList.remove('lg-active');
    });
  });
};

/**
 * Handle floating button actions
 */
ListingGenius.handleAction = function(action) {
  switch (action) {
    case 'generate':
      chrome.runtime.sendMessage({ action: 'openPopupGenerate' });
      break;
    case 'keywords':
      ListingGenius.openKeywordPanel();
      break;
    case 'analyze':
      ListingGenius.analyzePage();
      break;
  }
};

/**
 * Open keyword side panel
 */
ListingGenius.openKeywordPanel = async function() {
  try {
    await chrome.runtime.sendMessage({ action: 'openSidePanel' });
  } catch (error) {
    console.error('Failed to open side panel:', error);
  }
};

/**
 * Analyze current page
 */
ListingGenius.analyzePage = async function() {
  const pageData = ListingGenius.extractPageData();
  await chrome.runtime.sendMessage({
    action: 'pageAnalyzed',
    data: pageData
  });
};

/**
 * Extract page data (to be overridden by platform-specific scripts)
 */
ListingGenius.extractPageData = function() {
  return {
    url: window.location.href,
    title: document.title,
    platform: ListingGenius.detectPlatform()
  };
};

/**
 * Detect current platform
 */
ListingGenius.detectPlatform = function() {
  const hostname = window.location.hostname;
  if (hostname.includes('etsy.com')) return 'etsy';
  if (hostname.includes('amazon.')) return 'amazon';
  return 'unknown';
};

/**
 * Check if on listing creation page
 */
ListingGenius.isListingCreationPage = function() {
  const url = window.location.href;
  const platform = ListingGenius.detectPlatform();

  if (platform === 'etsy') {
    return url.includes('/your/shops/') && url.includes('/listing');
  } else if (platform === 'amazon') {
    return url.includes('/inventory/ref=') || url.includes('/abis/');
  }
  return false;
};

/**
 * Check if on product view page
 */
ListingGenius.isProductPage = function() {
  const url = window.location.href;
  const platform = ListingGenius.detectPlatform();

  if (platform === 'etsy') {
    return url.includes('/listing/');
  } else if (platform === 'amazon') {
    return url.includes('/dp/') || url.includes('/gp/product/');
  }
  return false;
};

/**
 * Show toast notification
 */
ListingGenius.showToast = function(message, type = 'info') {
  // Remove existing toast
  const existing = document.getElementById('lg-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'lg-toast';
  toast.className = `lg-toast lg-toast-${type}`;
  toast.textContent = message;

  document.body.appendChild(toast);

  // Animate in
  setTimeout(() => toast.classList.add('lg-show'), 10);

  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove('lg-show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

/**
 * Create highlight overlay for form fields
 */
ListingGenius.highlightField = function(element) {
  if (!element) return;

  element.classList.add('lg-highlight');
  setTimeout(() => {
    element.classList.remove('lg-highlight');
  }, 2000);
};

/**
 * Wait for element to appear
 */
ListingGenius.waitForElement = function(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const el = document.querySelector(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found`));
    }, timeout);
  });
};

/**
 * Capture product images from page
 */
ListingGenius.captureProductImages = function() {
  const platform = ListingGenius.detectPlatform();
  let images = [];

  // Generic image selectors for product images
  const genericSelectors = [
    'img[src*="product"]',
    'img[src*="listing"]',
    'img[data-src]',
    '[class*="product"] img',
    '[class*="gallery"] img',
    '[class*="image"] img'
  ];

  // Platform-specific selectors will be added by etsy.js and amazon.js
  if (platform === 'etsy') {
    images = ListingGenius.captureEtsyImages ? ListingGenius.captureEtsyImages() : [];
  } else if (platform === 'amazon') {
    images = ListingGenius.captureAmazonImages ? ListingGenius.captureAmazonImages() : [];
  }

  // If platform-specific capture didn't work, try generic
  if (images.length === 0) {
    images = captureGenericImages(genericSelectors);
  }

  return images;
};

/**
 * Capture images using generic selectors
 */
function captureGenericImages(selectors) {
  const images = [];
  const seenUrls = new Set();

  selectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(img => {
      const src = getHighResImageUrl(img);
      if (src && !seenUrls.has(src) && isValidProductImage(img)) {
        seenUrls.add(src);
        images.push({
          src: src,
          thumbnail: img.src,
          alt: img.alt || '',
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height
        });
      }
    });
  });

  return images.slice(0, 20); // Limit to 20 images
}

/**
 * Get high resolution image URL
 */
function getHighResImageUrl(img) {
  // Try various data attributes for high-res versions
  const highResAttrs = [
    'data-src',
    'data-original',
    'data-large-src',
    'data-high-res-src',
    'data-zoom-src',
    'data-full-src'
  ];

  for (const attr of highResAttrs) {
    const value = img.getAttribute(attr);
    if (value && value.startsWith('http')) {
      return value;
    }
  }

  // Try srcset for high-res
  if (img.srcset) {
    const srcset = img.srcset.split(',');
    const lastSrc = srcset[srcset.length - 1].trim().split(' ')[0];
    if (lastSrc) return lastSrc;
  }

  return img.src;
}

/**
 * Check if image is a valid product image
 */
function isValidProductImage(img) {
  // Skip tiny images (icons, etc.)
  const minSize = 100;
  if (img.naturalWidth < minSize || img.naturalHeight < minSize) {
    return false;
  }

  // Skip common non-product image patterns
  const src = img.src.toLowerCase();
  const skipPatterns = [
    'logo', 'icon', 'avatar', 'sprite', 'banner',
    'badge', 'button', 'nav', 'footer', 'header',
    'pixel', 'tracking', 'analytics', 'ad'
  ];

  return !skipPatterns.some(pattern => src.includes(pattern));
}

/**
 * Message listener for content script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Security: Only accept messages from our extension
  if (!isValidExtensionSender(sender)) {
    sendResponse({ error: 'Unauthorized sender' });
    return false;
  }

  const { action, data } = message;

  switch (action) {
    case 'autoFill':
      // Show confirmation before auto-filling
      ListingGenius.confirmAutoFill(data)
        .then(confirmed => {
          if (confirmed) {
            return ListingGenius.autoFillForm(data);
          }
          throw new Error('Auto-fill cancelled by user');
        })
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
      return true;

    case 'extractListingData':
      const listingData = ListingGenius.extractListingData();
      sendResponse({ data: listingData });
      break;

    case 'analyzePage':
      const pageData = ListingGenius.extractPageData();
      sendResponse({ data: pageData });
      break;

    case 'captureProductImages':
      const images = ListingGenius.captureProductImages();
      sendResponse({ images: images });
      break;

    case 'useGeneratedImages':
      ListingGenius.useGeneratedImages(data.images)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
      return true;

    case 'ping':
      sendResponse({ status: 'ok', platform: ListingGenius.detectPlatform() });
      break;

    default:
      sendResponse({ error: `Unknown action: ${action}` });
  }

  return false;
});

/**
 * Use generated images in listing (to be implemented by platform-specific scripts)
 */
ListingGenius.useGeneratedImages = async function(images) {
  ListingGenius.showToast('Images ready! You can download and upload them manually.', 'info');
};

/**
 * Show confirmation dialog before auto-fill
 * @param {Object} data - Data to be filled
 * @returns {Promise<boolean>} - User confirmation
 */
ListingGenius.confirmAutoFill = async function(data) {
  return new Promise((resolve) => {
    // Create confirmation overlay
    const overlay = createElement('div', { id: 'lg-confirm-overlay', className: 'lg-confirm-overlay' });

    const dialog = createElement('div', { className: 'lg-confirm-dialog' });

    const title = createElement('h3', {}, 'Confirm Auto-Fill');
    const message = createElement('p', {}, 'ListingGenius will fill in the following fields:');

    const preview = createElement('ul', { className: 'lg-confirm-preview' });
    if (data.title) {
      const li = createElement('li');
      li.appendChild(createElement('strong', {}, 'Title: '));
      li.appendChild(document.createTextNode(data.title.substring(0, 50) + (data.title.length > 50 ? '...' : '')));
      preview.appendChild(li);
    }
    if (data.description) {
      const li = createElement('li');
      li.appendChild(createElement('strong', {}, 'Description: '));
      li.appendChild(document.createTextNode(data.description.substring(0, 50) + '...'));
      preview.appendChild(li);
    }
    if (data.tags?.length) {
      const li = createElement('li');
      li.appendChild(createElement('strong', {}, 'Tags: '));
      li.appendChild(document.createTextNode(data.tags.slice(0, 3).join(', ') + (data.tags.length > 3 ? '...' : '')));
      preview.appendChild(li);
    }

    const buttonContainer = createElement('div', { className: 'lg-confirm-buttons' });

    const cancelBtn = createElement('button', { className: 'lg-confirm-cancel' }, 'Cancel');
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });

    const confirmBtn = createElement('button', { className: 'lg-confirm-ok' }, 'Fill Fields');
    confirmBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(confirmBtn);

    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(preview);
    dialog.appendChild(buttonContainer);
    overlay.appendChild(dialog);

    document.body.appendChild(overlay);

    // Auto-dismiss after 30 seconds
    setTimeout(() => {
      if (document.getElementById('lg-confirm-overlay')) {
        overlay.remove();
        resolve(false);
      }
    }, 30000);
  });
};

/**
 * Auto-fill form (to be implemented by platform-specific scripts)
 */
ListingGenius.autoFillForm = async function(data) {
  throw new Error('autoFillForm not implemented for this platform');
};

/**
 * Extract listing data (to be implemented by platform-specific scripts)
 */
ListingGenius.extractListingData = function() {
  return {
    platform: ListingGenius.detectPlatform(),
    title: '',
    description: '',
    tags: [],
    price: '',
    images: []
  };
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  // Inject floating button on relevant pages
  if (ListingGenius.isListingCreationPage() || ListingGenius.isProductPage()) {
    ListingGenius.injectFloatingButton();
  }
});

// Also check after a delay (for SPAs)
setTimeout(() => {
  if (ListingGenius.isListingCreationPage() || ListingGenius.isProductPage()) {
    ListingGenius.injectFloatingButton();
  }
}, 2000);

console.log('ListingGenius: Common script loaded');
