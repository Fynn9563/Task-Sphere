// utils/tokenValidator.js
// Utility for validating JWT tokens on the client side

/**
 * Decode a JWT token to extract payload without verification
 * @param {string} token - JWT token to decode
 * @returns {object|null} - Decoded payload or null if invalid
 */
export const decodeToken = (token) => {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Decode the payload (second part)
    const payload = parts[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded;
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
};

/**
 * Check if a JWT token is expired
 * @param {string} token - JWT token to check
 * @returns {boolean} - True if expired, false otherwise
 */
export const isTokenExpired = (token) => {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    return true;
  }

  // JWT exp is in seconds, Date.now() is in milliseconds
  const expirationTime = decoded.exp * 1000;
  const currentTime = Date.now();

  return currentTime >= expirationTime;
};

/**
 * Get the time remaining until token expiration in milliseconds
 * @param {string} token - JWT token to check
 * @returns {number} - Milliseconds until expiration, or 0 if expired/invalid
 */
export const getTokenExpirationTime = (token) => {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    return 0;
  }

  const expirationTime = decoded.exp * 1000;
  const currentTime = Date.now();
  const timeRemaining = expirationTime - currentTime;

  return timeRemaining > 0 ? timeRemaining : 0;
};

/**
 * Check if token will expire soon (within the specified threshold)
 * @param {string} token - JWT token to check
 * @param {number} thresholdMs - Time threshold in milliseconds (default: 5 minutes)
 * @returns {boolean} - True if token will expire soon
 */
export const isTokenExpiringSoon = (token, thresholdMs = 5 * 60 * 1000) => {
  const timeRemaining = getTokenExpirationTime(token);
  return timeRemaining > 0 && timeRemaining <= thresholdMs;
};

/**
 * Validate token structure and expiration
 * @param {string} token - JWT token to validate
 * @returns {object} - Validation result with isValid and reason
 */
export const validateToken = (token) => {
  if (!token || typeof token !== 'string') {
    return { isValid: false, reason: 'missing' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { isValid: false, reason: 'malformed' };
  }

  const decoded = decodeToken(token);
  if (!decoded) {
    return { isValid: false, reason: 'invalid' };
  }

  if (isTokenExpired(token)) {
    return { isValid: false, reason: 'expired' };
  }

  return { isValid: true, payload: decoded };
};
