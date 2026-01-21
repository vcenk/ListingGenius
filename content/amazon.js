// ListingGenius Amazon Content Script

/**
 * Amazon-specific selectors
 */
const AMAZON_SELECTORS = {
  // Product page
  productTitle: '#productTitle, #title',
  productDescription: '#productDescription, #feature-bullets',
  bulletPoints: '#feature-bullets li, .a-unordered-list.a-vertical li',
  productPrice: '.a-price .a-offscreen, #priceblock_ourprice, #priceblock_dealprice',
  productImages: '#imgTagWrapperId img, #landingImage, .a-dynamic-image',
  sellerName: '#sellerProfileTriggerId, #merchant-info a',
  productASIN: '[data-asin]',
  productCategory: '#wayfinding-breadcrumbs_feature_div li a',

  // Listing creation (Seller Central)
  titleInput: '#item_name, input[name="item_name"], #productTitle input',
  descriptionInput: '#product_description, textarea[name="product_description"]',
  bulletInputs: 'input[name*="bullet_point"], textarea[name*="bullet_point"]',
  priceInput: '#standard_price, input[name="standard_price"]',
  keywordsInput: '#generic_keywords, textarea[name="generic_keywords"]',

  // ASIN detection
  asinPattern: /\/dp\/([A-Z0-9]{10})/
};

/**
 * Capture Amazon product images
 */
ListingGenius.captureAmazonImages = function() {
  const images = [];
  const seenUrls = new Set();

  // Amazon image selectors (prioritized)
  const selectors = [
    // Main product image
    '#landingImage',
    '#imgTagWrapperId img',
    // Thumbnail carousel
    '#altImages img',
    '.imageThumbnail img',
    // Dynamic images
    '.a-dynamic-image',
    // Image block
    '#imageBlock img',
    '.imgTagWrapper img'
  ];

  selectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(img => {
      // Get high-res URL from data attributes
      let src = img.getAttribute('data-old-hires') ||
                img.getAttribute('data-a-hires') ||
                getAmazonHighResFromDynamic(img) ||
                img.src;

      // Clean up Amazon image URLs to get higher resolution
      if (src) {
        // Remove size constraints from URL
        src = src.replace(/\._[A-Z]{2}\d+_\./, '.');
        src = src.replace(/\._S[XY]\d+_\./, '.');
      }

      if (src && !seenUrls.has(src) && isValidAmazonImage(src)) {
        seenUrls.add(src);
        images.push({
          src: src,
          thumbnail: img.src,
          alt: img.alt || '',
          width: img.naturalWidth || 1000,
          height: img.naturalHeight || 1000
        });
      }
    });
  });

  return images.slice(0, 10);
};

/**
 * Get high-res URL from Amazon dynamic image data
 */
function getAmazonHighResFromDynamic(img) {
  const dynamicData = img.getAttribute('data-a-dynamic-image');
  if (!dynamicData) return null;

  try {
    const parsed = JSON.parse(dynamicData);
    const urls = Object.keys(parsed);
    // Get the largest image (last in the object)
    return urls[urls.length - 1] || null;
  } catch {
    return null;
  }
}

/**
 * Check if URL is a valid Amazon product image
 */
function isValidAmazonImage(src) {
  if (!src) return false;

  // Must be from Amazon's image CDN
  const validDomains = [
    'images-na.ssl-images-amazon.com',
    'm.media-amazon.com',
    'images-amazon.com'
  ];

  const isAmazonDomain = validDomains.some(domain => src.includes(domain));

  // Skip sprites and tiny icons
  const skipPatterns = ['sprite', 'icon', 'pixel', 'grey-pixel', 'transparent'];
  const hasSkipPattern = skipPatterns.some(pattern => src.toLowerCase().includes(pattern));

  return isAmazonDomain && !hasSkipPattern;
}

/**
 * Override extractPageData for Amazon
 */
ListingGenius.extractPageData = function() {
  const isProductPage = ListingGenius.isProductPage();
  const isSellerPage = isSellerCentralPage();

  if (isProductPage) {
    return extractProductPageData();
  } else if (isSellerPage) {
    return extractSellerPageData();
  }

  return {
    url: window.location.href,
    title: document.title,
    platform: 'amazon'
  };
};

/**
 * Check if on Seller Central
 */
function isSellerCentralPage() {
  const url = window.location.href;
  return url.includes('sellercentral') ||
         url.includes('/inventory/') ||
         url.includes('/abis/');
}

/**
 * Extract ASIN from URL or page
 */
function extractASIN() {
  // Try URL first
  const urlMatch = window.location.href.match(AMAZON_SELECTORS.asinPattern);
  if (urlMatch) return urlMatch[1];

  // Try page elements
  const asinElement = document.querySelector(AMAZON_SELECTORS.productASIN);
  if (asinElement) return asinElement.getAttribute('data-asin');

  // Try input field (Seller Central)
  const asinInput = document.querySelector('input[name="asin"]');
  if (asinInput) return asinInput.value;

  return null;
}

/**
 * Extract data from Amazon product page
 */
function extractProductPageData() {
  const title = document.querySelector(AMAZON_SELECTORS.productTitle)?.textContent?.trim() || '';

  // Get description
  const descElement = document.querySelector(AMAZON_SELECTORS.productDescription);
  const description = descElement?.textContent?.trim() || '';

  // Get bullet points
  const bulletElements = document.querySelectorAll(AMAZON_SELECTORS.bulletPoints);
  const bulletPoints = Array.from(bulletElements)
    .map(el => el.textContent?.trim())
    .filter(text => text && text.length > 10)
    .slice(0, 10);

  // Get price
  const priceElement = document.querySelector(AMAZON_SELECTORS.productPrice);
  const price = priceElement?.textContent?.trim() || '';

  // Get images
  const imageElements = document.querySelectorAll(AMAZON_SELECTORS.productImages);
  const images = Array.from(imageElements)
    .map(img => {
      // Get high-res version if available
      return img.getAttribute('data-old-hires') ||
             img.getAttribute('data-a-dynamic-image')?.match(/"([^"]+)"/)?.[1] ||
             img.src;
    })
    .filter(src => src && !src.includes('sprite'))
    .slice(0, 10);

  // Get categories (breadcrumbs)
  const categoryElements = document.querySelectorAll(AMAZON_SELECTORS.productCategory);
  const categories = Array.from(categoryElements)
    .map(el => el.textContent?.trim())
    .filter(t => t);

  // Get ASIN
  const asin = extractASIN();

  // Extract keywords from title and bullets
  const allText = [title, ...bulletPoints].join(' ');
  const keywords = extractKeywordsFromText(allText);

  return {
    url: window.location.href,
    platform: 'amazon',
    productTitle: title,
    description: description,
    bulletPoints: bulletPoints,
    price: price,
    images: images,
    categories: categories,
    asin: asin,
    keywords: keywords,
    isCompetitor: true
  };
}

/**
 * Extract keywords from text (simple extraction)
 */
function extractKeywordsFromText(text) {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'this', 'that', 'these',
    'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'your', 'our'
  ]);

  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Count frequency
  const freq = {};
  words.forEach(word => {
    freq[word] = (freq[word] || 0) + 1;
  });

  // Sort by frequency and return top keywords
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
}

/**
 * Extract data from Seller Central page
 */
function extractSellerPageData() {
  const title = document.querySelector(AMAZON_SELECTORS.titleInput)?.value || '';
  const description = document.querySelector(AMAZON_SELECTORS.descriptionInput)?.value || '';

  // Get bullet points
  const bulletInputs = document.querySelectorAll(AMAZON_SELECTORS.bulletInputs);
  const bulletPoints = Array.from(bulletInputs)
    .map(input => input.value?.trim())
    .filter(t => t);

  // Get keywords
  const keywordsInput = document.querySelector(AMAZON_SELECTORS.keywordsInput);
  const keywords = keywordsInput?.value?.split(/[,\s]+/).filter(k => k) || [];

  const price = document.querySelector(AMAZON_SELECTORS.priceInput)?.value || '';

  return {
    url: window.location.href,
    platform: 'amazon',
    productTitle: title,
    description: description,
    bulletPoints: bulletPoints,
    keywords: keywords,
    price: price,
    isEditMode: true
  };
}

/**
 * Override extractListingData for Amazon
 */
ListingGenius.extractListingData = function() {
  if (ListingGenius.isProductPage()) {
    return extractProductPageData();
  }
  return extractSellerPageData();
};

/**
 * Override autoFillForm for Amazon
 */
ListingGenius.autoFillForm = async function(data) {
  if (!isSellerCentralPage()) {
    throw new Error('Not on an Amazon Seller Central page');
  }

  const { title, description, tags } = data;

  // Fill title
  if (title) {
    await fillAmazonField(AMAZON_SELECTORS.titleInput, title, 200);
  }

  // Fill description
  if (description) {
    await fillAmazonField(AMAZON_SELECTORS.descriptionInput, description, 2000);
  }

  // Fill bullet points (if tags are provided, use as bullets)
  if (tags && tags.length > 0) {
    await fillBulletPoints(tags.slice(0, 5));
  }

  // Fill backend keywords
  if (tags && tags.length > 5) {
    const keywords = tags.slice(5).join(', ');
    await fillAmazonField(AMAZON_SELECTORS.keywordsInput, keywords, 250);
  }

  ListingGenius.showToast('Listing auto-filled successfully!', 'success');
};

/**
 * Fill an Amazon form field
 */
async function fillAmazonField(selector, value, maxLength) {
  const selectors = selector.split(', ');
  let input = null;

  for (const sel of selectors) {
    input = document.querySelector(sel);
    if (input) break;
  }

  if (!input) {
    console.warn(`Field not found: ${selector}`);
    return;
  }

  // Clear and set value
  input.value = '';
  input.value = value.substring(0, maxLength);

  // Trigger events
  triggerInputEvents(input);

  ListingGenius.highlightField(input);
}

/**
 * Fill Amazon bullet points
 */
async function fillBulletPoints(bullets) {
  const bulletInputs = document.querySelectorAll(AMAZON_SELECTORS.bulletInputs);

  if (bulletInputs.length === 0) {
    console.warn('Bullet point inputs not found');
    return;
  }

  for (let i = 0; i < Math.min(bullets.length, bulletInputs.length); i++) {
    const input = bulletInputs[i];
    const bullet = bullets[i];

    input.value = '';
    input.value = bullet.substring(0, 500); // Amazon bullet limit

    triggerInputEvents(input);

    await sleep(100);
  }

  ListingGenius.highlightField(bulletInputs[0]?.parentElement);
}

/**
 * Trigger input events for framework compatibility
 */
function triggerInputEvents(element) {
  const inputEvent = new Event('input', { bubbles: true, cancelable: true });
  element.dispatchEvent(inputEvent);

  const changeEvent = new Event('change', { bubbles: true, cancelable: true });
  element.dispatchEvent(changeEvent);

  const blurEvent = new FocusEvent('blur', { bubbles: true, cancelable: true });
  element.dispatchEvent(blurEvent);
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Inject Amazon-specific UI enhancements
 */
function injectAmazonEnhancements() {
  // Add competitor analysis button on product pages
  if (ListingGenius.isProductPage()) {
    const titleElement = document.querySelector(AMAZON_SELECTORS.productTitle);

    if (titleElement && !document.getElementById('lg-analyze-competitor')) {
      const button = document.createElement('button');
      button.id = 'lg-analyze-competitor';
      button.className = 'lg-amazon-btn';
      button.innerHTML = '&#128373; Analyze Competitor';
      button.title = 'Analyze this listing with ListingGenius';

      button.addEventListener('click', async (e) => {
        e.preventDefault();
        const data = extractProductPageData();
        await chrome.runtime.sendMessage({
          action: 'displayCompetitorKeywords',
          data: data
        });
        ListingGenius.showToast('Opening competitor analysis...', 'info');
      });

      titleElement.parentElement?.insertBefore(button, titleElement.nextSibling);
    }
  }
}

/**
 * Initialize Amazon script
 */
function initAmazon() {
  setTimeout(injectAmazonEnhancements, 1500);
}

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAmazon);
} else {
  initAmazon();
}

// URL change detection for SPA
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    setTimeout(initAmazon, 1000);
  }
}).observe(document, { subtree: true, childList: true });

console.log('ListingGenius: Amazon script loaded');
