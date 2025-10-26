// Basic email format validation
export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// Decode HTML entities to readable text
export const decodeHtmlEntities = (text) => {
  if (typeof text !== 'string') return text;
  
  const entityMap = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#x27;': "'",
    '&#39;': "'",
    '&#x2F;': '/',
    '&#x60;': '`',
    '&#x3D;': '=',
    '&nbsp;': ' ',
    '&#x2C;': ',',
    '&#x3A;': ':',
    '&#x21;': '!',
    '&#x3F;': '?',
    '&#x40;': '@',
    '&#x23;': '#',
    '&#x24;': ',',
    '&#x25;': '%',
    '&#x5E;': '^',
    '&#x26;': '&',
    '&#x2A;': '*',
    '&#x28;': '(',
    '&#x29;': ')',
    '&#x2B;': '+',
    '&#x5B;': '[',
    '&#x5D;': ']',
    '&#x7B;': '{',
    '&#x7D;': '}',
    '&#x7C;': '|',
    '&#x5C;': '\\',
    '&#x3B;': ';'
  };
  
  return text.replace(/&[#A-Za-z0-9]+;/g, (entity) => {
    return entityMap[entity] || entity;
  });
};

// Clean text for safe display
export const cleanDisplayText = (text) => {
  if (!text || typeof text !== 'string') return text;
  return decodeHtmlEntities(text);
};

// Escape HTML and limit length for safe storage
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;

  let sanitized = input.trim();

  const htmlEscapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };

  sanitized = sanitized.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char]);

  // Max 500 chars for input fields
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 500);
  }

  return sanitized;
};

// Validate names (max 100 chars, no HTML tags)
export const validateName = (name) => {
  if (!name || typeof name !== 'string') return false;

  const trimmed = name.trim();

  if (trimmed.length < 1) return false;
  if (trimmed.length > 100) return false;

  const validPattern = /^[a-zA-Z0-9\s\-_.,!?@#$%^&*()+='":;/\\|`~[\]{}]+$/;
  const noHtmlTags = !/<[^>]*>/g.test(trimmed);

  return validPattern.test(trimmed) && noHtmlTags;
};

// Validate descriptions (max 1000 chars, no HTML tags)
export const validateDescription = (description) => {
  if (!description) return true;
  if (typeof description !== 'string') return false;

  const trimmed = description.trim();

  if (trimmed.length > 1000) return false;

  const noHtmlTags = !/<[^>]*>/g.test(trimmed);

  return noHtmlTags;
};

// Validate HH:MM time format
export const validateTimeFormat = (timeString) => {
  if (!timeString || timeString === '') return true;
  if (typeof timeString !== 'string') return false;

  const timeRegex = /^\d{1,3}:\d{2}$/;
  if (!timeRegex.test(timeString)) return false;

  const parts = timeString.split(':');
  const hours = parseInt(parts[0]);
  const minutes = parseInt(parts[1]);

  return hours >= 0 && hours <= 999 && minutes >= 0 && minutes < 60;
};