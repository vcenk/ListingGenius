// ListingGenius Keyword Utilities

import { callKeywordsEverywhereAPI } from './api.js';

// Common stop words to filter out
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
  'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when',
  'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there',
  'then', 'once', 'if', 'else', 'unless', 'until', 'while', 'because',
  'although', 'though', 'after', 'before', 'since', 'during', 'above',
  'below', 'between', 'under', 'over', 'out', 'up', 'down', 'off', 'about'
]);

/**
 * Extract meaningful keywords from text
 * @param {string} text - Text to extract keywords from
 * @returns {string[]} - Array of keywords
 */
export function extractKeywords(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // Normalize text
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')  // Remove special chars except hyphens
    .replace(/\s+/g, ' ')        // Normalize whitespace
    .trim();

  // Extract individual words
  const words = normalized.split(' ')
    .filter(word => word.length > 2)
    .filter(word => !STOP_WORDS.has(word))
    .filter(word => !/^\d+$/.test(word));  // Remove pure numbers

  // Get unique words
  const uniqueWords = [...new Set(words)];

  // Also extract 2-word and 3-word phrases
  const phrases = [];
  const wordArray = normalized.split(' ');

  for (let i = 0; i < wordArray.length - 1; i++) {
    // 2-word phrases
    const twoWord = `${wordArray[i]} ${wordArray[i + 1]}`;
    if (isValidPhrase(twoWord)) {
      phrases.push(twoWord);
    }

    // 3-word phrases
    if (i < wordArray.length - 2) {
      const threeWord = `${wordArray[i]} ${wordArray[i + 1]} ${wordArray[i + 2]}`;
      if (isValidPhrase(threeWord)) {
        phrases.push(threeWord);
      }
    }
  }

  // Combine and dedupe
  const allKeywords = [...uniqueWords, ...phrases];

  // Sort by length (longer phrases might be more specific/valuable)
  return allKeywords.slice(0, 20);  // Limit to top 20
}

/**
 * Check if a phrase is valid (not just stop words)
 * @param {string} phrase - Phrase to check
 * @returns {boolean}
 */
function isValidPhrase(phrase) {
  const words = phrase.split(' ');
  const meaningfulWords = words.filter(w => !STOP_WORDS.has(w) && w.length > 2);
  return meaningfulWords.length >= Math.ceil(words.length / 2);
}

/**
 * Get keyword data from Keywords Everywhere API
 * @param {string[]} keywords - Keywords to look up
 * @param {string} apiKey - API key
 * @returns {Promise<Object>} - Keyword data
 */
export async function getKeywordData(keywords, apiKey) {
  try {
    const response = await callKeywordsEverywhereAPI(keywords, apiKey);

    if (!response.data) {
      return { keywords: [], totalVolume: 0 };
    }

    const keywordData = response.data.map(item => ({
      keyword: item.keyword,
      volume: item.vol || 0,
      cpc: item.cpc || 0,
      competition: item.competition || 0,
      trend: calculateTrend(item.trend || [])
    }));

    // Sort by volume
    keywordData.sort((a, b) => b.volume - a.volume);

    const totalVolume = keywordData.reduce((sum, k) => sum + k.volume, 0);

    return {
      keywords: keywordData,
      totalVolume
    };
  } catch (error) {
    console.error('Failed to get keyword data:', error);
    return { keywords: [], totalVolume: 0 };
  }
}

/**
 * Calculate trend direction from historical data
 * @param {number[]} trendData - Monthly trend data
 * @returns {string} - 'rising', 'stable', or 'declining'
 */
function calculateTrend(trendData) {
  if (!trendData || trendData.length < 3) {
    return 'stable';
  }

  const recentMonths = trendData.slice(-3);
  const olderMonths = trendData.slice(-6, -3);

  const recentAvg = recentMonths.reduce((a, b) => a + b, 0) / recentMonths.length;
  const olderAvg = olderMonths.length > 0
    ? olderMonths.reduce((a, b) => a + b, 0) / olderMonths.length
    : recentAvg;

  const change = ((recentAvg - olderAvg) / olderAvg) * 100;

  if (change > 10) return 'rising';
  if (change < -10) return 'declining';
  return 'stable';
}

/**
 * Extract keywords from an Etsy listing
 * @param {Object} listing - Listing data
 * @returns {string[]} - Extracted keywords
 */
export function extractEtsyKeywords(listing) {
  const allText = [
    listing.title || '',
    listing.description || '',
    ...(listing.tags || [])
  ].join(' ');

  return extractKeywords(allText);
}

/**
 * Extract keywords from an Amazon listing
 * @param {Object} listing - Listing data
 * @returns {string[]} - Extracted keywords
 */
export function extractAmazonKeywords(listing) {
  const allText = [
    listing.title || '',
    listing.description || '',
    ...(listing.bulletPoints || []),
    ...(listing.backendKeywords || [])
  ].join(' ');

  return extractKeywords(allText);
}

/**
 * Score keyword relevance for a product
 * @param {string} keyword - Keyword to score
 * @param {Object} data - Keyword data (volume, competition, etc.)
 * @returns {number} - Relevance score 0-100
 */
export function scoreKeyword(keyword, data) {
  let score = 50; // Base score

  // Volume factor (0-30 points)
  if (data.volume > 100000) score += 30;
  else if (data.volume > 50000) score += 25;
  else if (data.volume > 10000) score += 20;
  else if (data.volume > 5000) score += 15;
  else if (data.volume > 1000) score += 10;
  else if (data.volume > 100) score += 5;

  // Competition factor (-20 to +10 points)
  if (data.competition < 0.3) score += 10;
  else if (data.competition < 0.5) score += 5;
  else if (data.competition > 0.7) score -= 10;
  else if (data.competition > 0.8) score -= 20;

  // Trend factor (-10 to +10 points)
  if (data.trend === 'rising') score += 10;
  else if (data.trend === 'declining') score -= 10;

  // Length factor (longer keywords often have less competition)
  const wordCount = keyword.split(' ').length;
  if (wordCount >= 3) score += 5;
  if (wordCount >= 4) score += 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * Generate keyword suggestions based on seed keyword
 * @param {string} seedKeyword - Base keyword
 * @returns {string[]} - Suggested keyword variations
 */
export function generateKeywordSuggestions(seedKeyword) {
  const suggestions = [];
  const words = seedKeyword.toLowerCase().split(' ');

  // Add modifiers
  const prefixes = ['best', 'custom', 'handmade', 'vintage', 'unique', 'personalized'];
  const suffixes = ['gift', 'for women', 'for men', 'for kids', 'set', 'bundle'];

  prefixes.forEach(prefix => {
    suggestions.push(`${prefix} ${seedKeyword}`);
  });

  suffixes.forEach(suffix => {
    suggestions.push(`${seedKeyword} ${suffix}`);
  });

  // Add color variations
  const colors = ['black', 'white', 'blue', 'red', 'green', 'pink', 'gold', 'silver'];
  colors.forEach(color => {
    suggestions.push(`${color} ${seedKeyword}`);
  });

  return suggestions.slice(0, 15);
}

/**
 * Filter keywords by platform requirements
 * @param {string[]} keywords - Keywords to filter
 * @param {string} platform - 'etsy' or 'amazon'
 * @returns {string[]} - Filtered keywords
 */
export function filterByPlatform(keywords, platform) {
  if (platform === 'etsy') {
    // Etsy tags: max 20 characters each
    return keywords.filter(k => k.length <= 20);
  } else if (platform === 'amazon') {
    // Amazon backend keywords: total 250 bytes
    return keywords.filter(k => k.length <= 50);
  }
  return keywords;
}
