// services/ApiService.js
import { API_BASE_URL } from '../utils/constants';
import { validateEmail, sanitizeInput, validateName, validateDescription } from '../utils/validation';

// API Service with refresh token support
export class ApiService {
  constructor() {
    this.baseURL = `${API_BASE_URL}/api`;
    this.token = localStorage.getItem('token');
    this.refreshToken = localStorage.getItem('refreshToken');
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
      this.removeTokens();
      window.location.reload();
      throw error;
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
      },
      ...options,
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      let response = await fetch(url, config);
      
      if (response.status === 403) {
        const data = await response.json();
        if (data.needsRefresh && this.refreshToken) {
          await this.refreshAccessToken();
          config.headers.Authorization = `Bearer ${this.token}`;
          response = await fetch(url, config);
        }
      }

      // Handle error responses
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          // If JSON parsing fails, use status text
          throw new Error(response.statusText || 'Something went wrong');
        }
        throw new Error(errorData.error || 'Something went wrong');
      }

      // Handle successful responses
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
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
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
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