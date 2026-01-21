// ListingGenius Background Service Worker

import { callOpenAI, analyzeImage } from '../utils/api.js';
import { getSettings, saveToCache, getFromCache } from '../utils/storage.js';
import { extractKeywords, getKeywordData } from '../utils/keywords.js';

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(error => sendResponse({ error: error.message }));
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  const { action, data } = message;

  switch (action) {
    case 'validateDemand':
      return await validateDemand(data);

    case 'generateListing':
      return await generateListing(data);

    case 'getKeywords':
      return await fetchKeywords(data);

    case 'setKeywordQuery':
      await chrome.storage.session.set({ keywordQuery: data.query });
      return { success: true };

    case 'displayCompetitorKeywords':
      await chrome.storage.session.set({ competitorData: data });
      return { success: true };

    case 'analyzeProductImage':
      return await analyzeProductImage(data);

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// Demand Validation
async function validateDemand({ productIdea, platform }) {
  const settings = await getSettings();

  if (!settings.openaiApiKey) {
    throw new Error('Please configure your OpenAI API key in settings');
  }

  // Extract main keywords
  const keywords = extractKeywords(productIdea);

  // Get keyword data (search volume, trends)
  let searchData = {};
  try {
    if (settings.keywordsEverywhereApiKey) {
      searchData = await getKeywordData(keywords, settings.keywordsEverywhereApiKey);
    }
  } catch (error) {
    console.warn('Failed to fetch keyword data:', error);
  }

  // Build analysis prompt
  const prompt = buildDemandAnalysisPrompt(productIdea, keywords, searchData, platform);

  // Call OpenAI for analysis
  const analysis = await callOpenAI(prompt, {
    apiKey: settings.openaiApiKey,
    model: 'gpt-4o-mini',
    temperature: 0.7,
    responseFormat: 'json'
  });

  const result = JSON.parse(analysis);

  // Merge with search data
  return {
    data: {
      ...result,
      monthlySearches: searchData.totalVolume || estimateSearchVolume(result.demandScore),
      keywords: keywords
    }
  };
}

function buildDemandAnalysisPrompt(productIdea, keywords, searchData, platform) {
  return `You are an e-commerce product analyst specializing in ${platform} marketplace.
Analyze this product idea for market viability.

Product Idea: ${productIdea}
Related Keywords: ${keywords.join(', ')}
Search Data: ${JSON.stringify(searchData)}
Platform: ${platform}

Consider:
1. Market demand and search interest
2. Competition level on ${platform}
3. Trend direction (is interest growing, stable, or declining?)
4. AI visibility (how likely is this product to be mentioned in AI recommendations)
5. Seasonal factors

Provide your analysis in this exact JSON format:
{
  "demandScore": <number 1-10>,
  "reasoning": "<brief explanation in 1-2 sentences>",
  "trendDirection": "<rising|stable|declining>",
  "aiVisibilityScore": <number 1-10>,
  "competitionLevel": "<low|medium|high>",
  "verdict": "<worth_listing|consider_modifications|low_demand>",
  "suggestions": ["<specific actionable suggestion 1>", "<suggestion 2>", "<suggestion 3>"]
}

Be realistic and base scores on actual market knowledge. A score of 7+ means strong demand.`;
}

function estimateSearchVolume(demandScore) {
  // Rough estimate when no API data available
  const baseVolumes = {
    1: 100, 2: 500, 3: 1000, 4: 3000, 5: 8000,
    6: 15000, 7: 30000, 8: 50000, 9: 80000, 10: 100000
  };
  return baseVolumes[Math.round(demandScore)] || 5000;
}

// Listing Generation
async function generateListing({ productDescription, keywords, tone, platform }) {
  const settings = await getSettings();

  if (!settings.openaiApiKey) {
    throw new Error('Please configure your OpenAI API key in settings');
  }

  // Generate title
  const titlePrompt = buildTitlePrompt(productDescription, keywords, platform);
  const title = await callOpenAI(titlePrompt, {
    apiKey: settings.openaiApiKey,
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 200
  });

  // Generate description
  const descPrompt = buildDescriptionPrompt(productDescription, keywords, tone, platform);
  const description = await callOpenAI(descPrompt, {
    apiKey: settings.openaiApiKey,
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 1500
  });

  // Generate tags/bullets
  let tags = [];
  if (platform === 'etsy') {
    const tagsPrompt = buildTagsPrompt(productDescription, keywords);
    const tagsResponse = await callOpenAI(tagsPrompt, {
      apiKey: settings.openaiApiKey,
      model: 'gpt-4o-mini',
      temperature: 0.7,
      responseFormat: 'json'
    });
    tags = JSON.parse(tagsResponse).tags || [];
  } else if (platform === 'amazon') {
    const bulletsPrompt = buildBulletsPrompt(productDescription, keywords);
    const bulletsResponse = await callOpenAI(bulletsPrompt, {
      apiKey: settings.openaiApiKey,
      model: 'gpt-4o-mini',
      temperature: 0.7,
      responseFormat: 'json'
    });
    tags = JSON.parse(bulletsResponse).bullets || [];
  }

  return {
    data: {
      title: title.trim(),
      description: description.trim(),
      tags,
      platform
    }
  };
}

function buildTitlePrompt(product, keywords, platform) {
  const platformRules = {
    etsy: `- Maximum 140 characters
- Front-load important keywords
- Include style/aesthetic terms
- Personal, handmade feel`,
    amazon: `- Maximum 200 characters
- Format: Brand + Product Type + Key Features
- Include size/quantity if relevant
- Professional tone`
  };

  return `You are an expert e-commerce copywriter specializing in ${platform} listings.

Generate an optimized product title for:
Product: ${product}
Target Keywords: ${keywords.join(', ')}
Platform: ${platform}

Requirements:
${platformRules[platform] || platformRules.etsy}
- Natural reading flow
- Include 2-3 top keywords naturally
- Do not use all caps
- Do not use excessive punctuation

Return ONLY the title, no explanation or quotes.`;
}

function buildDescriptionPrompt(product, keywords, tone, platform) {
  const toneGuides = {
    professional: 'formal, trustworthy, informative',
    casual: 'friendly, conversational, approachable',
    luxury: 'elegant, sophisticated, premium',
    playful: 'fun, energetic, engaging'
  };

  const platformRules = {
    etsy: `- Warm, personal tone connecting with handmade/unique buyers
- Tell the story of the product
- Include care instructions if applicable
- Maximum 10,000 characters
- Use short paragraphs, no HTML
- Connect emotionally with the buyer`,
    amazon: `- Professional, benefit-focused
- Start with key benefits
- Include specifications
- Use line breaks for readability
- Focus on features and value proposition
- Address common customer questions`
  };

  return `You are an expert e-commerce copywriter. Write a compelling product description.

Product: ${product}
Platform: ${platform}
Keywords to include naturally: ${keywords.join(', ')}
Tone: ${tone} (${toneGuides[tone] || toneGuides.professional})

Requirements:
${platformRules[platform] || platformRules.etsy}
- Naturally embed provided keywords (don't keyword stuff)
- Include a subtle call to action
- Make it scannable with short paragraphs

Return ONLY the description, no titles or explanations.`;
}

function buildTagsPrompt(product, keywords) {
  return `Generate exactly 13 Etsy tags for this product.

Product: ${product}
High-volume keywords to consider: ${keywords.join(', ')}

Requirements:
- Exactly 13 tags
- Each tag maximum 20 characters
- Mix of specific and broad terms
- Include style/aesthetic tags
- Include occasion tags if relevant (gift, birthday, etc.)
- No repeated words across tags
- Lowercase only

Return as JSON: { "tags": ["tag1", "tag2", ...] }`;
}

function buildBulletsPrompt(product, keywords) {
  return `Generate 5 Amazon bullet points for this product.

Product: ${product}
Keywords to include: ${keywords.join(', ')}

Requirements:
- Exactly 5 bullet points
- Each bullet starts with a CAPITALIZED benefit keyword
- Focus on benefits, then features
- Include relevant keywords naturally
- Each bullet 150-200 characters
- Address customer pain points

Return as JSON: { "bullets": ["bullet1", "bullet2", ...] }`;
}

// Keyword Fetching
async function fetchKeywords({ query, platform }) {
  const settings = await getSettings();
  const cacheKey = `keywords_${query}_${platform}`;

  // Check cache first
  const cached = await getFromCache(cacheKey);
  if (cached) {
    return { data: cached };
  }

  const keywords = extractKeywords(query);
  let keywordData = [];

  try {
    if (settings.keywordsEverywhereApiKey) {
      const data = await getKeywordData(keywords, settings.keywordsEverywhereApiKey);
      keywordData = data.keywords || [];
    }
  } catch (error) {
    console.warn('Failed to fetch keyword data:', error);
  }

  // If no API data, generate suggestions with AI
  if (keywordData.length === 0 && settings.openaiApiKey) {
    const prompt = `Generate 10 high-potential keywords for this product on ${platform}:
"${query}"

Return as JSON array with this format:
{
  "keywords": [
    {"keyword": "keyword phrase", "volume": <estimated monthly searches>, "trend": "<rising|stable|declining>"},
    ...
  ]
}

Base estimates on real market knowledge for ${platform}.`;

    const response = await callOpenAI(prompt, {
      apiKey: settings.openaiApiKey,
      model: 'gpt-4o-mini',
      temperature: 0.7,
      responseFormat: 'json'
    });

    keywordData = JSON.parse(response).keywords || [];
  }

  // Cache results
  await saveToCache(cacheKey, keywordData, 24 * 60 * 60 * 1000); // 24 hours

  return { data: keywordData };
}

// Product Image Analysis
async function analyzeProductImage({ imageUrl }) {
  const settings = await getSettings();

  if (!settings.openaiApiKey) {
    throw new Error('Please configure your OpenAI API key in settings');
  }

  const prompt = `Analyze this product image and extract:
1. Product type/category
2. Key features visible
3. Materials (if identifiable)
4. Colors
5. Style/aesthetic

Return as JSON:
{
  "productType": "...",
  "features": ["..."],
  "materials": ["..."],
  "colors": ["..."],
  "style": "...",
  "suggestedKeywords": ["..."]
}`;

  const analysis = await analyzeImage(imageUrl, prompt, settings.openaiApiKey);
  return { data: JSON.parse(analysis) };
}

// Side Panel Management
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

// Extension Install Handler
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Initialize default settings
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

    // Open options page for setup
    chrome.runtime.openOptionsPage();
  }
});

function getNextResetDate() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString().split('T')[0];
}
