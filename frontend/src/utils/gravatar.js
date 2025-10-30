// Gravatar utility functions
// Generates Gravatar URLs from email addresses
import md5 from 'md5';

/**
 * Get Gravatar URL for an email address
 * @param {string} email - User's email address
 * @param {number} size - Avatar size in pixels (default: 200)
 * @param {string} defaultImage - Default image type if no Gravatar exists
 *   Options: '404', 'mp' (mystery person), 'identicon', 'monsterid', 'wavatar', 'retro', 'robohash', 'blank'
 * @returns {string} Gravatar URL
 */
export function getGravatarUrl(email, size = 200, defaultImage = 'identicon') {
  if (!email) {
    return `https://www.gravatar.com/avatar/?s=${size}&d=${defaultImage}`;
  }

  // MD5 hash the lowercased, trimmed email (Gravatar requirement)
  const hash = md5(email.toLowerCase().trim());
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=${defaultImage}`;
}

/**
 * Get avatar URL - either custom URL or Gravatar fallback
 * @param {string} email - User's email address
 * @param {string} customUrl - Custom avatar URL (optional)
 * @param {number} size - Avatar size in pixels
 * @returns {string} Avatar URL
 */
export function getAvatarUrl(email, customUrl = null, size = 200) {
  if (customUrl && customUrl.trim().length > 0) {
    return customUrl;
  }
  return getGravatarUrl(email, size);
}
