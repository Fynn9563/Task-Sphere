// utils/validation.js

// Input validation utilities
export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// HTML entity decoder
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

// Clean display text for UI - decode HTML entities for display
export const cleanDisplayText = (text) => {
  if (!text || typeof text !== 'string') return text;
  return decodeHtmlEntities(text);
};

// Enhanced input sanitization - properly escapes HTML to prevent XSS
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;

  // Trim whitespace
  let sanitized = input.trim();

  // Escape HTML special characters to prevent XSS
  const htmlEscapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };

  sanitized = sanitized.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char]);

  // Limit length to prevent extremely long inputs
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 500);
  }

  return sanitized;
};

// Validate project/task names to ensure they don't contain problematic characters
export const validateName = (name) => {
  if (!name || typeof name !== 'string') return false;
  
  const trimmed = name.trim();
  
  // Check minimum length
  if (trimmed.length < 1) return false;
  
  // Check maximum length
  if (trimmed.length > 100) return false;
  
  // Allow letters, numbers, spaces, and common punctuation
  // But prevent HTML/XML-like tags
  const validPattern = /^[a-zA-Z0-9\s\-_.,!?@#$%^&*()+='":;/\\|`~\[\]{}]+$/;
  const noHtmlTags = !/<[^>]*>/g.test(trimmed);
  
  return validPattern.test(trimmed) && noHtmlTags;
};

// Validate descriptions (more lenient than names)
export const validateDescription = (description) => {
  if (!description) return true; // Optional field
  if (typeof description !== 'string') return false;
  
  const trimmed = description.trim();
  
  // Check maximum length
  if (trimmed.length > 1000) return false;
  
  // Prevent HTML/XML-like tags but allow most other characters
  const noHtmlTags = !/<[^>]*>/g.test(trimmed);
  
  return noHtmlTags;
};