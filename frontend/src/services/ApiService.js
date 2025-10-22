// services/ApiService.js
import { API_BASE_URL } from '../utils/constants';
import { validateEmail, sanitizeInput, validateName, validateDescription } from '../utils/validation';

// API Service with refresh token support
export class ApiService {
  constructor(onAuthError = null) {
    this.baseURL = `${API_BASE_URL}/api`;
    this.token = localStorage.getItem('token');
    this.refreshToken = localStorage.getItem('refreshToken');
    this.onAuthError = onAuthError; // Callback for auth errors
    this.abortController = null; // For cancelling pending requests
  }

  setTokens(token, refreshToken) {
    this.token = token;
    this.refreshToken = refreshToken;
    localStorage.setItem('token', token);
    localStorage.setItem('refreshToken', refreshToken);
  }

  removeTokens() {
    this.token = null;
    this.refreshToken = null;
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
  }

  async refreshAccessToken() {
    try {
      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        this.setTokens(data.token, data.refreshToken);
        return data.token;
      }

      throw new Error('Refresh failed');
    } catch (error) {
      // Call auth error callback to trigger logout
      this.handleAuthError('expired');
      throw error;
    }
  }

  handleAuthError(reason = 'invalid') {
    // Cancel any pending requests
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Clear tokens
    this.removeTokens();

    // Trigger logout callback if provided
    if (this.onAuthError) {
      this.onAuthError(reason);
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;

    // Create new AbortController for this request
    this.abortController = new AbortController();

    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
      },
      signal: this.abortController.signal,
      ...options,
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      let response = await fetch(url, config);

      // Handle 401 - No token or invalid auth
      if (response.status === 401) {
        this.handleAuthError('unauthorized');
        throw new Error('Authentication required');
      }

      // Handle 403 - Token expired or invalid
      if (response.status === 403) {
        const data = await response.json();

        // Try to refresh if token expired
        if (data.needsRefresh && this.refreshToken) {
          await this.refreshAccessToken();
          config.headers.Authorization = `Bearer ${this.token}`;
          // Retry the original request with new token
          response = await fetch(url, config);
        } else {
          // Invalid token, not just expired
          this.handleAuthError('forbidden');
          throw new Error(data.error || 'Access forbidden');
        }
      }

      // Handle other error responses
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          // If JSON parsing fails, use status text
          throw new Error(response.statusText || 'Something went wrong');
        }
        throw new Error(errorData.error || 'Something went wrong');
      }

      // Handle successful responses
      const data = await response.json();
      return data;
    } catch (error) {
      // Don't log aborted requests
      if (error.name !== 'AbortError') {
        console.error('API Error:', error);
      }
      throw error;
    } finally {
      // Clear abort controller after request completes
      this.abortController = null;
    }
  }

  // Auth methods
  async login(email, password) {
    const sanitizedEmail = sanitizeInput(email);
    if (!validateEmail(sanitizedEmail)) {
      throw new Error('Invalid email format');
    }
    
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: { email: sanitizedEmail, password },
    });
    this.setTokens(data.token, data.refreshToken);
    return data;
  }

  async register(email, password, name) {
    const sanitizedEmail = sanitizeInput(email);
    const sanitizedName = sanitizeInput(name);
    
    if (!validateEmail(sanitizedEmail)) {
      throw new Error('Invalid email format');
    }

    // Password complexity validation
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
      throw new Error('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      throw new Error('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      throw new Error('Password must contain at least one number');
    }
    
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: { email: sanitizedEmail, password, name: sanitizedName },
    });
    this.setTokens(data.token, data.refreshToken);
    return data;
  }

  // Task List methods
  async getTaskLists() {
    return this.request('/task-lists');
  }

  async createTaskList(name, description) {
    const sanitizedName = sanitizeInput(name);
    const sanitizedDescription = description ? sanitizeInput(description) : '';
    
    // Validate the inputs
    if (!validateName(sanitizedName)) {
      throw new Error('Task list name contains invalid characters or is too long');
    }
    
    if (description && !validateDescription(sanitizedDescription)) {
      throw new Error('Description contains invalid characters or is too long');
    }
    
    return this.request('/task-lists', {
      method: 'POST',
      body: { name: sanitizedName, description: sanitizedDescription },
    });
  }

  async joinTaskList(inviteCode) {
    return this.request('/task-lists/join', {
      method: 'POST',
      body: { inviteCode: sanitizeInput(inviteCode) },
    });
  }

  async getTaskListMembers(taskListId) {
    return this.request(`/task-lists/${taskListId}/members`);
  }

  // Task methods
  async getTasks(taskListId) {
    return this.request(`/task-lists/${taskListId}/tasks`);
  }

  async createTask(taskListId, taskData) {
    const sanitizedData = {
      ...taskData,
      name: sanitizeInput(taskData.name),
      description: taskData.description ? sanitizeInput(taskData.description) : null,
    };
    
    // Validate the inputs
    if (!validateName(sanitizedData.name)) {
      throw new Error('Task name contains invalid characters or is too long');
    }
    
    if (sanitizedData.description && !validateDescription(sanitizedData.description)) {
      throw new Error('Task description contains invalid characters or is too long');
    }
    
    return this.request(`/task-lists/${taskListId}/tasks`, {
      method: 'POST',
      body: sanitizedData,
    });
  }

  async updateTask(taskId, updates) {
    const sanitizedUpdates = { ...updates };
    if (sanitizedUpdates.name) {
      sanitizedUpdates.name = sanitizeInput(sanitizedUpdates.name);
      if (!validateName(sanitizedUpdates.name)) {
        throw new Error('Task name contains invalid characters or is too long');
      }
    }
    if (sanitizedUpdates.description) {
      sanitizedUpdates.description = sanitizeInput(sanitizedUpdates.description);
      if (!validateDescription(sanitizedUpdates.description)) {
        throw new Error('Task description contains invalid characters or is too long');
      }
    }
    
    return this.request(`/tasks/${taskId}`, {
      method: 'PUT',
      body: sanitizedUpdates,
    });
  }

  async deleteTask(taskId) {
    return this.request(`/tasks/${taskId}`, {
      method: 'DELETE',
    });
  }

  // Projects and Requesters
  async getProjects(taskListId) {
    return this.request(`/task-lists/${taskListId}/projects`);
  }

  async createProject(taskListId, name) {
    const sanitizedName = sanitizeInput(name);
    
    if (!validateName(sanitizedName)) {
      throw new Error('Project name contains invalid characters or is too long');
    }
    
    return this.request(`/task-lists/${taskListId}/projects`, {
      method: 'POST',
      body: { name: sanitizedName },
    });
  }

  async getRequesters(taskListId) {
    return this.request(`/task-lists/${taskListId}/requesters`);
  }

  async createRequester(taskListId, name, email) {
    const sanitizedName = sanitizeInput(name);
    const sanitizedEmail = email ? sanitizeInput(email) : null;
    
    if (!validateName(sanitizedName)) {
      throw new Error('Requester name contains invalid characters or is too long');
    }
    
    if (sanitizedEmail && !validateEmail(sanitizedEmail)) {
      throw new Error('Invalid email format');
    }
    
    return this.request(`/task-lists/${taskListId}/requesters`, {
      method: 'POST',
      body: { name: sanitizedName, email: sanitizedEmail },
    });
  }

  async deleteTaskList(taskListId) {
    return this.request(`/task-lists/${taskListId}`, {
      method: 'DELETE',
    });
  }

  // Project delete method
  async deleteProject(projectId) {
    return this.request(`/projects/${projectId}`, {
      method: 'DELETE',
    });
  }

  // Requester delete method  
  async deleteRequester(requesterId) {
    return this.request(`/requesters/${requesterId}`, {
      method: 'DELETE',
    });
  }

  // Notification methods
  async getNotifications() {
    return this.request('/notifications');
  }

  async getUnreadCount() {
    return this.request('/notifications/unread-count');
  }

  async markNotificationRead(notificationId) {
    return this.request(`/notifications/${notificationId}/read`, {
      method: 'PUT',
    });
  }

  async markAllNotificationsRead() {
    return this.request('/notifications/mark-all-read', {
      method: 'PUT',
    });
  }

  async clearNotification(notificationId) {
    return this.request(`/notifications/${notificationId}`, {
      method: 'DELETE',
    });
  }

  async clearAllNotifications() {
    return this.request('/notifications/clear-all', {
      method: 'DELETE',
    });
  }

  // Queue methods
  async getQueue(userId, taskListId = null) {
    const url = taskListId
      ? `/users/${userId}/queue?taskListId=${taskListId}`
      : `/users/${userId}/queue`;
    return this.request(url);
  }

  async addToQueue(userId, taskId) {
    return this.request(`/users/${userId}/queue`, {
      method: 'POST',
      body: { taskId },
    });
  }

  async reorderQueue(userId, taskOrders) {
    return this.request(`/users/${userId}/queue/reorder`, {
      method: 'PUT',
      body: { taskOrders },
    });
  }

  async removeFromQueue(userId, taskId) {
    return this.request(`/users/${userId}/queue/${taskId}`, {
      method: 'DELETE',
    });
  }
}