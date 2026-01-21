// ListingGenius Etsy Content Script

/**
 * Etsy-specific selectors
 */
const ETSY_SELECTORS = {
  // Listing creation form
  listingForm: '[data-listing-form]',
  titleInput: 'input[name="title"], #listing-edit-title input, [data-field="title"] input',
  descriptionInput: 'textarea[name="description"], #description-text-area-input, [data-field="description"] textarea',
  tagsContainer: '[data-tags-input], .wt-tag-group, #taxonomy-tags-input',
  tagInput: '[data-tags-input] input, .wt-tag-group input, input[name="tags"]',
  priceInput: 'input[name="price"], [data-field="price"] input',
  categorySelect: '[data-field="taxonomy_id"], #taxonomy_id',

  // Product page
  productTitle: 'h1[data-buy-box-listing-title], .wt-text-body-01',
  productDescription: '[data-product-details-description-text-content], .wt-content-toggle__body',
  productTags: '.wt-action-group__item-container a[href*="/search?q="]',
  productPrice: '[data-buy-box-listing-price], .wt-text-title-03',
  productImages: '[data-carousel-paging-controls] img, .wt-max-width-full img[src*="etsystatic"]',
  shopName: '[data-shop-name], .wt-text-link-no-underline',

  // Listing manager
  listingManagerUrl: '/your/shops/',
  editListingUrl: '/listing/'
};

/**
 * Override extractPageData for Etsy
 */
ListingGenius.extractPageData = function() {
  const isProductPage = ListingGenius.isProductPage();
  const isEditPage = ListingGenius.isListingCreationPage();

  if (isProductPage) {
    return extractProductPageData();
  } else if (isEditPage) {
    return extractEditPageData();
  }

  return {
    url: window.location.href,
    title: document.title,
    platform: 'etsy'
  };
};

/**
 * Extract data from Etsy product page
 */
function extractProductPageData() {
  const title = document.querySelector(ETSY_SELECTORS.productTitle)?.textContent?.trim() || '';
  const description = document.querySelector(ETSY_SELECTORS.productDescription)?.textContent?.trim() || '';

  // Extract tags from links
  const tagElements = document.querySelectorAll(ETSY_SELECTORS.productTags);
  const tags = Array.from(tagElements).map(el => {
    const href = el.href;
    const match = href.match(/q=([^&]+)/);
    return match ? decodeURIComponent(match[1]).replace(/\+/g, ' ') : '';
  }).filter(t => t);

  // Extract price
  const priceElement = document.querySelector(ETSY_SELECTORS.productPrice);
  const price = priceElement?.textContent?.trim() || '';

  // Extract images
  const imageElements = document.querySelectorAll(ETSY_SELECTORS.productImages);
  const images = Array.from(imageElements)
    .map(img => img.src)
    .filter(src => src && src.includes('etsystatic'));

  // Extract shop name
  const shopName = document.querySelector(ETSY_SELECTORS.shopName)?.textContent?.trim() || '';

  return {
    url: window.location.href,
    platform: 'etsy',
    productTitle: title,
    description: description,
    tags: [...new Set(tags)], // Remove duplicates
    price: price,
    images: images.slice(0, 10), // Limit to 10 images
    shopName: shopName,
    isCompetitor: true
  };
}

/**
 * Extract data from Etsy listing edit page
 */
function extractEditPageData() {
  const title = document.querySelector(ETSY_SELECTORS.titleInput)?.value || '';
  const description = document.querySelector(ETSY_SELECTORS.descriptionInput)?.value || '';

  // Get existing tags
  const tagElements = document.querySelectorAll('.wt-tag__remove')?.parentElement || [];
  const tags = Array.from(document.querySelectorAll('[data-tag]'))
    .map(el => el.getAttribute('data-tag') || el.textContent?.trim())
    .filter(t => t);

  const price = document.querySelector(ETSY_SELECTORS.priceInput)?.value || '';

  return {
    url: window.location.href,
    platform: 'etsy',
    productTitle: title,
    description: description,
    tags: tags,
    price: price,
    isEditMode: true
  };
}

/**
 * Override extractListingData for Etsy
 */
ListingGenius.extractListingData = function() {
  if (ListingGenius.isProductPage()) {
    return extractProductPageData();
  }
  return extractEditPageData();
};

/**
 * Override autoFillForm for Etsy
 */
ListingGenius.autoFillForm = async function(data) {
  if (!ListingGenius.isListingCreationPage()) {
    throw new Error('Not on an Etsy listing creation page');
  }

  const { title, description, tags } = data;

  // Fill title
  if (title) {
    await fillTitleField(title);
  }

  // Fill description
  if (description) {
    await fillDescriptionField(description);
  }

  // Fill tags
  if (tags && tags.length > 0) {
    await fillTags(tags);
  }

  ListingGenius.showToast('Listing auto-filled successfully!', 'success');
};

/**
 * Fill Etsy title field
 */
async function fillTitleField(title) {
  const input = await findTitleInput();
  if (!input) {
    console.warn('Title input not found');
    return;
  }

  // Clear existing value
  input.value = '';

  // Set new value
  input.value = title.substring(0, 140); // Etsy max is 140 chars

  // Trigger input events for React/Vue
  triggerInputEvents(input);

  ListingGenius.highlightField(input);
}

/**
 * Find title input with multiple selector strategies
 */
async function findTitleInput() {
  const selectors = ETSY_SELECTORS.titleInput.split(', ');

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }

  // Try waiting for element
  try {
    return await ListingGenius.waitForElement(selectors[0], 3000);
  } catch {
    return null;
  }
}

/**
 * Fill Etsy description field
 */
async function fillDescriptionField(description) {
  const textarea = document.querySelector(ETSY_SELECTORS.descriptionInput) ||
                   document.querySelector('textarea[name="description"]') ||
                   document.querySelector('#description-text-area-input');

  if (!textarea) {
    console.warn('Description textarea not found');
    return;
  }

  // Clear and set new value
  textarea.value = '';
  textarea.value = description.substring(0, 10000); // Etsy max is 10000 chars

  // Trigger events
  triggerInputEvents(textarea);

  ListingGenius.highlightField(textarea);
}

/**
 * Fill Etsy tags
 */
async function fillTags(tags) {
  const tagInput = document.querySelector(ETSY_SELECTORS.tagInput) ||
                   document.querySelector('input[placeholder*="tag"]');

  if (!tagInput) {
    console.warn('Tag input not found');
    return;
  }

  // Etsy allows max 13 tags, each max 20 chars
  const validTags = tags
    .slice(0, 13)
    .map(tag => tag.substring(0, 20));

  for (const tag of validTags) {
    // Type the tag
    tagInput.value = tag;
    triggerInputEvents(tagInput);

    // Press Enter to add tag
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true
    });
    tagInput.dispatchEvent(enterEvent);

    // Wait a bit between tags
    await sleep(200);
  }

  ListingGenius.highlightField(tagInput.parentElement);
}

/**
 * Trigger input events for framework compatibility
 */
function triggerInputEvents(element) {
  // Input event
  const inputEvent = new Event('input', { bubbles: true, cancelable: true });
  element.dispatchEvent(inputEvent);

  // Change event
  const changeEvent = new Event('change', { bubbles: true, cancelable: true });
  element.dispatchEvent(changeEvent);

  // Blur event (some forms validate on blur)
  const blurEvent = new FocusEvent('blur', { bubbles: true, cancelable: true });
  element.dispatchEvent(blurEvent);

  // For React synthetic events
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set || Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  if (nativeInputValueSetter) {
    const reactEvent = new Event('input', { bubbles: true });
    element.dispatchEvent(reactEvent);
  }
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Inject Etsy-specific UI enhancements
 */
function injectEtsyEnhancements() {
  // Add "Optimize with AI" button near title field
  const titleSection = document.querySelector('[data-field="title"]') ||
                       document.querySelector(ETSY_SELECTORS.titleInput)?.parentElement;

  if (titleSection && !document.getElementById('lg-optimize-title-btn')) {
    const button = document.createElement('button');
    button.id = 'lg-optimize-title-btn';
    button.className = 'lg-inline-btn';
    button.innerHTML = '&#10024; Optimize';
    button.title = 'Optimize with ListingGenius AI';

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      const titleInput = document.querySelector(ETSY_SELECTORS.titleInput);
      if (titleInput?.value) {
        await chrome.runtime.sendMessage({
          action: 'optimizeTitle',
          data: { title: titleInput.value, platform: 'etsy' }
        });
      } else {
        ListingGenius.showToast('Please enter a title first', 'warning');
      }
    });

    titleSection.appendChild(button);
  }
}

/**
 * Check for Etsy listing page and enhance
 */
function initEtsy() {
  if (ListingGenius.isListingCreationPage()) {
    // Wait for page to fully load
    setTimeout(injectEtsyEnhancements, 1500);
  }
}

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEtsy);
} else {
  initEtsy();
}

// Also run on URL changes (for SPA navigation)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    setTimeout(initEtsy, 1000);
  }
}).observe(document, { subtree: true, childList: true });

console.log('ListingGenius: Etsy script loaded');
