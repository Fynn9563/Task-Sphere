// Decode JWT token payload (client-side only, no verification)
export const decodeToken = (token) => {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded;
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
};

// Check if JWT token is expired
export const isTokenExpired = (token) => {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    return true;
  }

  const expirationTime = decoded.exp * 1000;
  const currentTime = Date.now();

  return currentTime >= expirationTime;
};

// Get milliseconds until token expires
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

// Check if token expires within threshold (default 5 min)
export const isTokenExpiringSoon = (token, thresholdMs = 5 * 60 * 1000) => {
  const timeRemaining = getTokenExpirationTime(token);
  return timeRemaining > 0 && timeRemaining <= thresholdMs;
};

// Validate token structure and expiration
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
