import React, { useState, useEffect, createContext, useContext, useMemo } from 'react';
import { Plus, Search, Calendar, Users, Share2, Trash2, Edit3, Check, X, LogOut, Loader, Filter, Moon, Sun, User, Clock, AlertCircle, Eye, EyeOff, Bell, CheckCheck } from 'lucide-react';

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Dark Mode Context
const DarkModeContext = createContext();

const DarkModeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  return (
    <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      {children}
    </DarkModeContext.Provider>
  );
};

const useDarkMode = () => useContext(DarkModeContext);

// Dark Mode Toggle Component
const DarkModeToggle = () => {
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  
  return (
    <button
      onClick={toggleDarkMode}
      className="p-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
      title={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
    >
      {isDarkMode ? (
        <Sun className="w-5 h-5 text-yellow-500" />
      ) : (
        <Moon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
      )}
    </button>
  );
};

// Input validation utilities
const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
};

// API Service with refresh token support
class ApiService {
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
    return this.request('/task-lists', {
      method: 'POST',
      body: { name: sanitizeInput(name), description: sanitizeInput(description) },
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
    
    return this.request(`/task-lists/${taskListId}/tasks`, {
      method: 'POST',
      body: sanitizedData,
    });
  }

  async updateTask(taskId, updates) {
    const sanitizedUpdates = { ...updates };
    if (sanitizedUpdates.name) sanitizedUpdates.name = sanitizeInput(sanitizedUpdates.name);
    if (sanitizedUpdates.description) sanitizedUpdates.description = sanitizeInput(sanitizedUpdates.description);
    
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
    return this.request(`/task-lists/${taskListId}/projects`, {
      method: 'POST',
      body: { name: sanitizeInput(name) },
    });
  }

  async getRequesters(taskListId) {
    return this.request(`/task-lists/${taskListId}/requesters`);
  }

  async createRequester(taskListId, name, email) {
    const sanitizedName = sanitizeInput(name);
    const sanitizedEmail = email ? sanitizeInput(email) : null;
    
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
}

// WebSocket Service
class WebSocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect() {
    if (typeof window.io !== 'undefined') {
      this.socket = window.io(API_BASE_URL);
      
      this.socket.on('connect', () => {
        console.log('Connected to server');
      });

      this.socket.on('disconnect', () => {
        console.log('Disconnected from server');
      });

      this.listeners.forEach((callback, event) => {
        this.socket.on(event, callback);
      });
    }
  }

  disconnect() {
    if (this.socket) {
      this.listeners.forEach((_, event) => {
        this.socket.off(event);
      });
      this.socket.disconnect();
      this.socket = null;
    }
  }

  joinUser(userId) {
    if (this.socket) {
      this.socket.emit('joinUser', userId);
    }
  }

  joinTaskList(taskListId) {
    if (this.socket) {
      this.socket.emit('joinTaskList', taskListId);
    }
  }

  leaveTaskList(taskListId) {
    if (this.socket) {
      this.socket.emit('leaveTaskList', taskListId);
    }
  }

  on(event, callback) {
    this.listeners.set(event, callback);
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event) {
    this.listeners.delete(event);
    if (this.socket) {
      this.socket.off(event);
    }
  }
}

// Notification Context
const NotificationContext = createContext();

const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const api = new ApiService();
  const ws = new WebSocketService();

  // Load notifications when user changes
  useEffect(() => {
    if (user && user.id) {
      loadNotifications();
      loadUnreadCount();
      
      // Connect to WebSocket and join user room
      ws.connect();
      ws.joinUser(user.id);
      
      // Listen for new notifications
      ws.on('newNotification', (notification) => {
        console.log('Received new notification:', notification);
        setNotifications(prev => [notification, ...prev]);
        setUnreadCount(prev => prev + 1);
        
        // Show browser notification if supported
        if (Notification.permission === 'granted') {
          new Notification(notification.title, {
            body: notification.message,
            icon: '/favicon.ico'
          });
        }
      });
      
      return () => {
        ws.disconnect();
      };
    } else {
      // Clear notifications when user logs out
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [user]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const data = await api.getNotifications();
      setNotifications(data);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUnreadCount = async () => {
    try {
      const data = await api.getUnreadCount();
      setUnreadCount(data.count);
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      await api.markNotificationRead(notificationId);
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId ? { ...notif, read: true } : notif
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => 
        prev.map(notif => ({ ...notif, read: true }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  const clearNotification = async (notificationId) => {
    try {
      await api.clearNotification(notificationId);
      setNotifications(prev => prev.filter(notif => notif.id !== notificationId));
      // Decrease unread count if the notification was unread
      setUnreadCount(prev => {
        const notification = notifications.find(n => n.id === notificationId);
        return notification && !notification.read ? Math.max(0, prev - 1) : prev;
      });
    } catch (error) {
      console.error('Failed to clear notification:', error);
    }
  };

  const clearAllNotifications = async () => {
    try {
      await api.clearAllNotifications();
      setNotifications([]);
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to clear all notifications:', error);
    }
  };

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      loading,
      loadNotifications,
      markAsRead,
      markAllAsRead,
      clearNotification,
      clearAllNotifications
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

const useNotifications = () => useContext(NotificationContext);

// Enhanced Notification Bell Component with Navigation and Clear functionality
const NotificationBell = ({ onNavigateToTask }) => {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, clearNotification, clearAllNotifications } = useNotifications();
  const [showDropdown, setShowDropdown] = useState(false);

  const formatTimeAgo = (dateString) => {
    const now = new Date();
    const date = new Date(dateString);
    
    // Add more detailed logging for debugging
    console.log('Formatting time - Now:', now.toISOString(), 'Date:', date.toISOString());
    
    const diffInSeconds = Math.floor((now - date) / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);
    
    console.log('Time difference - Seconds:', diffInSeconds, 'Minutes:', diffInMinutes, 'Hours:', diffInHours);
    
    if (diffInSeconds < 30) return 'Just now';
    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return `${diffInDays}d ago`;
  };

  const handleNotificationClick = async (notification) => {
    try {
      // Mark as read if not already read
      if (!notification.read) {
        await markAsRead(notification.id);
      }
      
      // Close dropdown
      setShowDropdown(false);
      
      // Navigate to the task if it's a task-related notification
      if (notification.task_id && notification.task_list_id) {
        // If we have a navigation callback (from home page), use it
        if (onNavigateToTask) {
          onNavigateToTask(notification.task_list_id, notification.task_id);
        } else {
          // We're already in a task list, just highlight the task
          const event = new CustomEvent('highlightTask', { 
            detail: { 
              taskId: notification.task_id,
              taskListId: notification.task_list_id 
            } 
          });
          window.dispatchEvent(event);
          
          // Scroll to the task element if it exists
          setTimeout(() => {
            const taskElement = document.querySelector(`[data-task-id="${notification.task_id}"]`);
            if (taskElement) {
              taskElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
              });
              
              // Add highlight effect
              taskElement.classList.add('notification-highlight');
              setTimeout(() => {
                taskElement.classList.remove('notification-highlight');
              }, 3000);
            }
          }, 100);
        }
      }
    } catch (error) {
      console.error('Error handling notification click:', error);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {showDropdown && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setShowDropdown(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700 z-20 max-h-96 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 dark:text-white">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
                  >
                    <CheckCheck className="w-3 h-3" />
                    Mark all read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAllNotifications}
                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center">
                  <Loader className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No notifications yet</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      !notification.read ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div 
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <h4 className="font-medium text-sm text-gray-800 dark:text-white truncate">
                          {notification.title}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatTimeAgo(notification.created_at)}
                          </span>
                          {notification.task_list_name && (
                            <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded">
                              {notification.task_list_name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!notification.read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            clearNotification(notification.id);
                          }}
                          className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          title="Clear notification"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Context for Authentication
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const api = new ApiService();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.setTokens(token, localStorage.getItem('refreshToken'));
      setUser({ token });
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      const data = await api.login(email, password);
      setUser(data.user);
      // Clear any previously selected task list when logging in
      localStorage.removeItem('selectedTaskList');
      return data;
    } catch (error) {
      throw error;
    }
  };

  const register = async (email, password, name) => {
    try {
      const data = await api.register(email, password, name);
      setUser(data.user);
      // Clear any previously selected task list when registering
      localStorage.removeItem('selectedTaskList');
      return data;
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    api.removeTokens();
    setUser(null);
    // Clear any selected task list and force to login mode
    localStorage.removeItem('selectedTaskList');
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => useContext(AuthContext);

// Enhanced Login Form with Dark Mode
const LoginForm = ({ onToggleMode }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 w-full max-w-md">
        <div className="flex justify-between items-center mb-8">
          <div className="text-center flex-1">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-2xl">TS</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Welcome Back</h1>
            <p className="text-gray-600 dark:text-gray-400">Sign in to your Task Sphere account</p>
          </div>
          <DarkModeToggle />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your email"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600 dark:text-gray-400">
            Don't have an account?{' '}
            <button
              onClick={onToggleMode}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
            >
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

// Enhanced Register Form with Dark Mode and Validation
const RegisterForm = ({ onToggleMode }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState({
    password: false,
    confirmPassword: false
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setLoading(true);
    setErrors({});

    try {
      await register(formData.email, formData.password, formData.name);
    } catch (err) {
      setErrors({ general: err.message });
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 w-full max-w-md">
        <div className="flex justify-between items-center mb-8">
          <div className="text-center flex-1">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-2xl">TS</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Create Account</h1>
            <p className="text-gray-600 dark:text-gray-400">Join Task Sphere and start collaborating</p>
          </div>
          <DarkModeToggle />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.name ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
              }`}
              placeholder="Enter your full name"
              required
            />
            {errors.name && (
              <p className="text-red-600 dark:text-red-400 text-xs mt-1">{errors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.email ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
              }`}
              placeholder="Enter your email"
              required
            />
            {errors.email && (
              <p className="text-red-600 dark:text-red-400 text-xs mt-1">{errors.email}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPasswords.password ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => updateField('password', e.target.value)}
                className={`w-full px-3 py-2 pr-10 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.password ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPasswords(prev => ({ ...prev, password: !prev.password }))}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPasswords.password ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-red-600 dark:text-red-400 text-xs mt-1">{errors.password}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Confirm Password
            </label>
            <div className="relative">
              <input
                type={showPasswords.confirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => updateField('confirmPassword', e.target.value)}
                className={`w-full px-3 py-2 pr-10 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.confirmPassword ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="Confirm your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPasswords(prev => ({ ...prev, confirmPassword: !prev.confirmPassword }))}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPasswords.confirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-red-600 dark:text-red-400 text-xs mt-1">{errors.confirmPassword}</p>
            )}
          </div>

          {errors.general && (
            <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                <p className="text-red-700 dark:text-red-300 text-sm">{errors.general}</p>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600 dark:text-gray-400">
            Already have an account?{' '}
            <button
              onClick={onToggleMode}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

// Task List Selection Component
const TaskListSelector = ({ onSelectTaskList }) => {
  const [taskLists, setTaskLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const { logout, user } = useAuth();
  const api = new ApiService();

  const handleNavigateToTask = (taskListId, taskId) => {
    // Find the task list and select it, then pass the task ID for highlighting
    const taskList = taskLists.find(list => list.id === taskListId);
    if (taskList) {
      onSelectTaskList(taskList, taskId);
    }
  };

  useEffect(() => {
    loadTaskLists();
    console.log('Current user in TaskListSelector:', user);
  }, []);

  const loadTaskLists = async () => {
    try {
      setLoading(true);
      setError(''); // Clear any previous errors
      const lists = await api.getTaskLists();
      console.log('Loaded task lists:', lists); // Debug log
      console.log('Current user for ownership check:', user); // Debug log
      setTaskLists(lists);
    } catch (err) {
      console.error('Error loading task lists:', err); // Debug log
      setError('Failed to load task lists');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    
    try {
      setCreateLoading(true);
      setError(''); // Clear any previous errors
      
      const newList = await api.createTaskList(newListName, newListDescription);
      
      // Add the new list to the beginning of the array
      setTaskLists(prevLists => [newList, ...prevLists]);
      
      // Reset form and close modal
      setShowCreateForm(false);
      setNewListName('');
      setNewListDescription('');
      
      console.log('New task list created:', newList); // Debug log
    } catch (err) {
      console.error('Error creating task list:', err); // Debug log
      setError(err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoinList = async () => {
    if (!inviteCode.trim()) return;
    
    try {
      setJoinLoading(true);
      setError(''); // Clear any previous errors
      
      await api.joinTaskList(inviteCode);
      
      // Reload the entire list to get the joined list with proper data
      await loadTaskLists();
      
      setShowJoinForm(false);
      setInviteCode('');
    } catch (err) {
      console.error('Error joining task list:', err); // Debug log
      setError(err.message);
    } finally {
      setJoinLoading(false);
    }
  };

  const handleDeleteList = async (taskListId) => {
    try {
      setDeleteLoading(prev => ({ ...prev, [taskListId]: true }));
      setError('');
      
      console.log('Attempting to delete task list:', taskListId);
      
      await api.deleteTaskList(taskListId);
      
      console.log('Task list deleted successfully');
      
      // Remove the deleted list from the UI
      setTaskLists(prevLists => prevLists.filter(list => list.id !== taskListId));
      
      setShowDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting task list:', err);
      setError(err.message || 'Failed to delete task list');
    } finally {
      setDeleteLoading(prev => ({ ...prev, [taskListId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">TS</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Task Sphere</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Select a task list to get started</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <DarkModeToggle />
            <NotificationBell onNavigateToTask={handleNavigateToTask} />
            <button
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Create New List Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border-2 border-dashed border-gray-300 dark:border-gray-600 p-6 text-center hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-pointer"
               onClick={() => {
                 setShowCreateForm(true);
                 setError(''); // Clear errors when opening
               }}>
            <Plus className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-800 dark:text-white mb-2">Create New List</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Start a new task list for your team</p>
          </div>

          {/* Join List Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border-2 border-dashed border-gray-300 dark:border-gray-600 p-6 text-center hover:border-green-400 dark:hover:border-green-500 transition-colors cursor-pointer"
               onClick={() => {
                 setShowJoinForm(true);
                 setError(''); // Clear errors when opening
               }}>
            <Users className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-800 dark:text-white mb-2">Join a List</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Use an invite code to join an existing list</p>
          </div>
        </div>

        {/* Existing Task Lists */}
        {taskLists.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Your Task Lists</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {taskLists.map((list) => {
                const isOwner = user && list.owner_id === user.id;
                
                return (
                  <div
                    key={list.id}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 hover:shadow-md transition-shadow"
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-2">
                        <h3 
                          className="text-lg font-medium text-gray-800 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex-1 mr-2"
                          onClick={() => onSelectTaskList(list)}
                        >
                          {list.name}
                        </h3>
                        
                        {/* Only show delete button for owners */}
                        {isOwner && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDeleteConfirm(list);
                            }}
                            className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                            title="Delete task list (Owner only)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      
                      {/* Owner indicator */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          isOwner 
                            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                        }`}>
                          {isOwner ? 'Owner' : 'Member'}
                        </span>
                        {list.owner_name && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            by {list.owner_name}
                          </span>
                        )}
                      </div>
                      
                      {list.description && (
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">{list.description}</p>
                      )}
                      
                      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                        <span>{list.task_count || 0} tasks</span>
                        <span>{list.member_count || 0} members</span>
                      </div>
                      
                      <button
                        onClick={() => onSelectTaskList(list)}
                        className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Open List
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Create List Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Create New Task List</h3>
              
              {error && (
                <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-3 mb-4">
                  <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">List Name *</label>
                  <input
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter list name"
                    disabled={createLoading}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (Optional)</label>
                  <textarea
                    value={newListDescription}
                    onChange={(e) => setNewListDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Describe your task list"
                    rows={3}
                    disabled={createLoading}
                  />
                </div>
                
                <div className="flex justify-end gap-2 pt-4">
                  <button
                    onClick={() => {
                      setShowCreateForm(false);
                      setError(''); // Clear errors when closing
                      setNewListName('');
                      setNewListDescription('');
                    }}
                    className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    disabled={createLoading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateList}
                    disabled={createLoading || !newListName.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {createLoading ? <Loader className="w-4 h-4 animate-spin" /> : 'Create List'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Join List Modal */}
        {showJoinForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Join Task List</h3>
              
              {error && (
                <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-3 mb-4">
                  <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invite Code *</label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter invite code"
                    disabled={joinLoading}
                  />
                </div>
                
                <div className="flex justify-end gap-2 pt-4">
                  <button
                    onClick={() => {
                      setShowJoinForm(false);
                      setError(''); // Clear errors when closing
                      setInviteCode('');
                    }}
                    className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    disabled={joinLoading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleJoinList}
                    disabled={joinLoading || !inviteCode.trim()}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {joinLoading ? <Loader className="w-4 h-4 animate-spin" /> : 'Join List'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Delete Task List</h3>
              
              {error && (
                <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
                  </div>
                </div>
              )}
              
              <div className="space-y-4">
                <div className="bg-yellow-50 dark:bg-yellow-900/50 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    <div>
                      <p className="text-yellow-800 dark:text-yellow-200 font-medium">Warning: This action cannot be undone!</p>
                      <p className="text-yellow-700 dark:text-yellow-300 text-sm mt-1">
                        This will permanently delete "<strong>{showDeleteConfirm.name}</strong>" and all its tasks, projects, and data.
                      </p>
                    </div>
                  </div>
                </div>
                
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Are you sure you want to delete this task list? Only the owner can delete a task list.
                </p>
                
                <div className="flex justify-end gap-2 pt-4">
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(null);
                      setError(''); // Clear errors when closing
                    }}
                    className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    disabled={deleteLoading[showDeleteConfirm.id]}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDeleteList(showDeleteConfirm.id)}
                    disabled={deleteLoading[showDeleteConfirm.id]}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {deleteLoading[showDeleteConfirm.id] ? <Loader className="w-4 h-4 animate-spin" /> : 'Delete Task List'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Enhanced Task Creation Component
const TaskCreationForm = ({ taskList, onTaskCreated, members, projects, requesters }) => {
  const [newTask, setNewTask] = useState({
    name: '',
    description: '',
    project_id: '',
    requester_id: '',
    assigned_to: '',
    priority: 'medium',
    due_date: '',
    estimated_hours: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newRequester, setNewRequester] = useState('');
  const [newProject, setNewProject] = useState('');
  const api = new ApiService();

  const resetForm = () => {
    setNewTask({
      name: '',
      description: '',
      project_id: '',
      requester_id: '',
      assigned_to: '',
      priority: 'medium',
      due_date: '',
      estimated_hours: ''
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newTask.name.trim()) {
      setError('Task name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const taskData = {
        name: newTask.name.trim(),
        description: newTask.description.trim() || null,
        projectId: newTask.project_id || null,
        requesterId: newTask.requester_id || null,
        assignedTo: newTask.assigned_to === "" ? null : parseInt(newTask.assigned_to) || null,
        priority: newTask.priority,
        dueDate: newTask.due_date || null,
        estimatedHours: newTask.estimated_hours ? parseFloat(newTask.estimated_hours) : null,
      };

      console.log('Creating task with data:', taskData);

      const createdTask = await api.createTask(taskList.id, taskData);
      onTaskCreated(createdTask);
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addRequester = async () => {
    if (!newRequester.trim()) return;
    
    try {
      const requester = await api.createRequester(taskList.id, newRequester.trim());
      requesters.push(requester);
      setNewRequester('');
    } catch (err) {
      setError('Failed to add requester');
    }
  };

  const addProject = async () => {
    if (!newProject.trim()) return;
    
    try {
      const project = await api.createProject(taskList.id, newProject.trim());
      projects.push(project);
      setNewProject('');
    } catch (err) {
      setError('Failed to add project');
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Create New Task</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* First Row - Task Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Task Name *
            </label>
            <input
              type="text"
              value={newTask.name}
              onChange={(e) => setNewTask({...newTask, name: e.target.value})}
              placeholder="Enter task name..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Priority
            </label>
            <select
              value={newTask.priority}
              onChange={(e) => setNewTask({...newTask, priority: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        {/* Second Row - Assignment & Project */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Assign To
            </label>
            <select
              value={newTask.assigned_to}
              onChange={(e) => setNewTask({...newTask, assigned_to: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Unassigned</option>
              {members.map(member => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project
            </label>
            <div className="flex gap-2">
              <select
                value={newTask.project_id}
                onChange={(e) => setNewTask({...newTask, project_id: e.target.value})}
                className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">No Project</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newProject}
                  onChange={(e) => setNewProject(e.target.value)}
                  placeholder="New project"
                  className="w-24 px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addProject())}
                />
                <button
                  type="button"
                  onClick={addProject}
                  disabled={!newProject.trim()}
                  className="px-2 py-2 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/70 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:text-gray-400 transition-colors flex items-center justify-center"
                  title="Add new project"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Requester
            </label>
            <div className="flex gap-2">
              <select
                value={newTask.requester_id}
                onChange={(e) => setNewTask({...newTask, requester_id: e.target.value})}
                className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">No Requester</option>
                {requesters.map(requester => (
                  <option key={requester.id} value={requester.id}>{requester.name}</option>
                ))}
              </select>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newRequester}
                  onChange={(e) => setNewRequester(e.target.value)}
                  placeholder="New requester"
                  className="w-24 px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addRequester())}
                />
                <button
                  type="button"
                  onClick={addRequester}
                  disabled={!newRequester.trim()}
                  className="px-2 py-2 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/70 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:text-gray-400 transition-colors flex items-center justify-center"
                  title="Add new requester"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Third Row - Dates & Time */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={newTask.due_date}
              onChange={(e) => setNewTask({...newTask, due_date: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Estimated Hours
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={newTask.estimated_hours}
              onChange={(e) => setNewTask({...newTask, estimated_hours: e.target.value})}
              placeholder="e.g., 2.5"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <textarea
            value={newTask.description}
            onChange={(e) => setNewTask({...newTask, description: e.target.value})}
            placeholder="Task description (optional)..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Submit Button */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={resetForm}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={loading || !newTask.name.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Task
          </button>
        </div>
      </form>
    </div>
  );
};

// Enhanced Task Card Component with notification highlighting
const TaskCard = ({ task, onToggleStatus, onDelete, onUpdate, members }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [editData, setEditData] = useState({
    assigned_to: task.assigned_to || '',
    priority: task.priority || 'medium'
  });
  const { user } = useAuth();

  // Update editData when task changes (for real-time updates)
  useEffect(() => {
    setEditData({
      assigned_to: task.assigned_to || '',
      priority: task.priority || 'medium'
    });
  }, [task.assigned_to, task.priority]);

  // Listen for highlight events from notifications
  useEffect(() => {
    const handleHighlight = (event) => {
      if (event.detail.taskId === task.id) {
        // Add highlight class temporarily
        const element = document.querySelector(`[data-task-id="${task.id}"]`);
        if (element) {
          element.classList.add('notification-highlight');
          setTimeout(() => {
            element.classList.remove('notification-highlight');
          }, 3000);
        }
      }
    };

    window.addEventListener('highlightTask', handleHighlight);
    return () => window.removeEventListener('highlightTask', handleHighlight);
  }, [task.id]);

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'border-red-500 bg-red-50 dark:bg-red-900/20';
      case 'high': return 'border-orange-500 bg-orange-50 dark:bg-orange-900/20';
      case 'medium': return 'border-blue-500 bg-blue-50 dark:bg-blue-900/20';
      case 'low': return 'border-green-500 bg-green-50 dark:bg-green-900/20';
      default: return 'border-gray-500 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  const handleQuickUpdate = async () => {
    try {
      setUpdateLoading(true);
      console.log('Starting quick update for task:', task.id, 'with data:', editData);
      
      // Convert empty string to null for assigned_to (unassigned case)
      const updatesData = {
        ...editData,
        assigned_to: editData.assigned_to === "" ? null : parseInt(editData.assigned_to) || null
      };
      
      console.log('Processed update data:', updatesData);
      
      await onUpdate(task.id, updatesData);
      
      console.log('Quick update completed successfully');
      setIsEditing(false);
    } catch (error) {
      console.error('Update failed:', error);
      // Don't close editing panel if update failed
    } finally {
      setUpdateLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div 
      data-task-id={task.id}
      className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border-l-4 p-4 mb-3 transition-all hover:shadow-md relative ${
        task.status 
          ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
          : getPriorityColor(task.priority)
      }`}
    >
      
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className={`font-medium text-lg ${
              task.status 
                ? 'line-through text-gray-500 dark:text-gray-400' 
                : 'text-gray-800 dark:text-white'
            }`}>
              {task.name}
            </h3>
            
            {task.priority && (
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                task.priority === 'urgent' ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200' :
                task.priority === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200' :
                task.priority === 'medium' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200' :
                'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'
              }`}>
                {task.priority}
              </span>
            )}
          </div>
          
          {task.description && (
            <p className="text-gray-600 dark:text-gray-300 text-sm mb-3">{task.description}</p>
          )}
          
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {task.assigned_to_name && (
              <span className="bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 px-2 py-1 rounded-full flex items-center gap-1">
                <User className="w-3 h-3" />
                {task.assigned_to_name}
              </span>
            )}
            
            {task.project_name && (
              <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 px-2 py-1 rounded-full">
                {task.project_name}
              </span>
            )}
            
            {task.requester_name && (
              <span className="bg-cyan-100 dark:bg-cyan-900/50 text-cyan-800 dark:text-cyan-200 px-2 py-1 rounded-full">
                {task.requester_name}
              </span>
            )}
            
            {task.due_date && (
              <span className="bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded-full flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(task.due_date)}
              </span>
            )}
            
            {task.estimated_hours && (
              <span className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 rounded-full flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {task.estimated_hours}h
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="p-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title="Quick edit"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => onToggleStatus(task.id)}
            className={`p-2 rounded-lg transition-colors ${
              task.status 
                ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/70' 
                : 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/70'
            }`}
            title={task.status ? 'Mark as not done' : 'Mark as done'}
          >
            {task.status ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          </button>
          
          <button
            onClick={() => onDelete(task.id)}
            className="p-2 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/70 transition-colors"
            title="Delete task"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Quick Edit Panel */}
      {isEditing && (
        <div className="border-t dark:border-gray-600 pt-3 mt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Assign To
              </label>
              <select
                value={editData.assigned_to}
                onChange={(e) => setEditData({...editData, assigned_to: e.target.value})}
                disabled={updateLoading}
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
              >
                <option value="">Unassigned</option>
                {members.map(member => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Priority
              </label>
              <select
                value={editData.priority}
                onChange={(e) => setEditData({...editData, priority: e.target.value})}
                disabled={updateLoading}
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              disabled={updateLoading}
            >
              Cancel
            </button>
            <button
              onClick={handleQuickUpdate}
              disabled={updateLoading}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            >
              {updateLoading ? (
                <>
                  <Loader className="w-3 h-3 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Complete Task Manager Component
const TaskManager = ({ taskList, onBack, initialTaskId }) => {
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [requesters, setRequesters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    requester: 'All',
    project: 'All',
    assignedTo: 'All',
    priority: 'All'
  });
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [error, setError] = useState('');
  
  const { logout } = useAuth();
  const api = new ApiService();
  const ws = new WebSocketService();

  useEffect(() => {
    loadData();
    
    // Connect to WebSocket and join task list room
    ws.connect();
    ws.joinTaskList(taskList.id);
    
    // Set up real-time event listeners
    ws.on('taskCreated', (task) => {
      setTasks(prev => [task, ...prev]);
    });
    
    ws.on('taskUpdated', (updatedTask) => {
      setTasks(prev => prev.map(task => 
        task.id === updatedTask.id ? updatedTask : task
      ));
    });
    
    ws.on('taskDeleted', (deletedTask) => {
      setTasks(prev => prev.filter(task => task.id !== deletedTask.id));
    });

    return () => {
      ws.leaveTaskList(taskList.id);
      ws.disconnect();
    };
  }, [taskList.id]);

  // Highlight initial task if provided
  useEffect(() => {
    if (initialTaskId && tasks.length > 0) {
      setTimeout(() => {
        const taskElement = document.querySelector(`[data-task-id="${initialTaskId}"]`);
        if (taskElement) {
          taskElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
          
          // Add highlight effect
          taskElement.classList.add('notification-highlight');
          setTimeout(() => {
            taskElement.classList.remove('notification-highlight');
          }, 3000);
        }
      }, 500); // Wait a bit for the UI to render
    }
  }, [initialTaskId, tasks]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tasksData, membersData, projectsData, requestersData] = await Promise.all([
        api.getTasks(taskList.id),
        api.getTaskListMembers(taskList.id),
        api.getProjects(taskList.id),
        api.getRequesters(taskList.id)
      ]);
      
      setTasks(tasksData);
      setMembers(membersData);
      setProjects(projectsData);
      setRequesters(requestersData);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      return (
        (filters.search === '' || task.name.toLowerCase().includes(filters.search.toLowerCase())) &&
        (filters.requester === 'All' || task.requester_name === filters.requester) &&
        (filters.project === 'All' || task.project_name === filters.project) &&
        (filters.assignedTo === 'All' || task.assigned_to_name === filters.assignedTo) &&
        (filters.priority === 'All' || task.priority === filters.priority)
      );
    });
  }, [tasks, filters]);

  const toggleTaskStatus = async (taskId) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      const updates = { 
        status: !task.status
      };
      
      console.log('Toggling task status for:', taskId, 'with updates:', updates);
      
      // Get the complete updated task from the server
      const updatedTask = await api.updateTask(taskId, updates);
      
      console.log('Received updated task after status toggle:', updatedTask);
      
      // Update the local state with the complete task data from server
      setTasks(prevTasks => prevTasks.map(task => 
        task.id === taskId ? updatedTask : task
      ));
      
    } catch (err) {
      console.error('Failed to toggle task status:', err);
      setError('Failed to update task');
    }
  };

  const deleteTask = async (taskId) => {
    try {
      await api.deleteTask(taskId);
      setTasks(tasks.filter(task => task.id !== taskId));
      setSelectedTasks(selectedTasks.filter(id => id !== taskId));
    } catch (err) {
      setError('Failed to delete task');
    }
  };

  const updateTask = async (taskId, updates) => {
    try {
      console.log('Updating task:', taskId, 'with:', updates);
      
      // Get the complete updated task from the server
      const updatedTask = await api.updateTask(taskId, updates);
      
      console.log('Received updated task from server:', updatedTask);
      
      // Update the local state with the complete task data from server
      setTasks(prevTasks => prevTasks.map(task => 
        task.id === taskId ? updatedTask : task
      ));
      
      console.log('Updated local task state');
      
    } catch (err) {
      console.error('Failed to update task:', err);
      setError('Failed to update task');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                ← Back
              </button>
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">TS</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white">{taskList.name}</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">Collaborative Task Management</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/70 transition-colors"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
              
              <DarkModeToggle />
              <NotificationBell />
              
              <button
                onClick={logout}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Task Creation Form */}
        <TaskCreationForm 
          taskList={taskList}
          onTaskCreated={(task) => setTasks([task, ...tasks])}
          members={members}
          projects={projects}
          requesters={requesters}
        />

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Search</label>
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters({...filters, search: e.target.value})}
                  placeholder="Search tasks..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Assigned To</label>
              <select
                value={filters.assignedTo}
                onChange={(e) => setFilters({...filters, assignedTo: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="All">All Members</option>
                {members.map(member => (
                  <option key={member.id} value={member.name}>{member.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Requester</label>
              <select
                value={filters.requester}
                onChange={(e) => setFilters({...filters, requester: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="All">All Requesters</option>
                {requesters.map(req => (
                  <option key={req.id} value={req.name}>{req.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project</label>
              <select
                value={filters.project}
                onChange={(e) => setFilters({...filters, project: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="All">All Projects</option>
                {projects.map(proj => (
                  <option key={proj.id} value={proj.name}>{proj.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
              <select
                value={filters.priority}
                onChange={(e) => setFilters({...filters, priority: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="All">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            
            <div className="flex items-end">
              <button
                onClick={() => setFilters({
                  search: '', requester: 'All', project: 'All', assignedTo: 'All', priority: 'All'
                })}
                className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedTasks.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-blue-800 dark:text-blue-200 font-medium">
                {selectedTasks.length} task{selectedTasks.length > 1 ? 's' : ''} selected
              </span>
              
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  onChange={(e) => {
                    if (e.target.value !== '') {
                      const assignedTo = e.target.value === 'unassigned' ? null : parseInt(e.target.value);
                      selectedTasks.forEach(taskId => updateTask(taskId, { assigned_to: assignedTo }));
                      setSelectedTasks([]);
                      e.target.value = '';
                    }
                  }}
                  defaultValue=""
                  className="px-3 py-1 border border-blue-300 dark:border-blue-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="" disabled>Assign To</option>
                  <option value="unassigned">Unassigned</option>
                  {members.map(member => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>

                <select
                  onChange={(e) => {
                    if (e.target.value !== '') {
                      selectedTasks.forEach(taskId => updateTask(taskId, { priority: e.target.value }));
                      setSelectedTasks([]);
                      e.target.value = '';
                    }
                  }}
                  defaultValue=""
                  className="px-3 py-1 border border-blue-300 dark:border-blue-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="" disabled>Set Priority</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
                
                <button
                  onClick={() => {
                    selectedTasks.forEach(taskId => toggleTaskStatus(taskId));
                    setSelectedTasks([]);
                  }}
                  className="px-3 py-1 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/70 text-sm whitespace-nowrap"
                >
                  Toggle Status
                </button>
                
                <button
                  onClick={() => {
                    selectedTasks.forEach(taskId => deleteTask(taskId));
                    setSelectedTasks([]);
                  }}
                  className="px-3 py-1 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/70 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tasks List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
              Tasks ({filteredTasks.length})
            </h2>
            
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <span>{filteredTasks.filter(t => t.status).length} completed</span>
              <span>•</span>
              <span>{filteredTasks.filter(t => !t.status).length} pending</span>
            </div>
          </div>
          
          <div className="space-y-3">
            {filteredTasks.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                </div>
                <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">No tasks found</h3>
                <p className="text-gray-500 dark:text-gray-500">Try adjusting your filters or add a new task</p>
              </div>
            ) : (
              filteredTasks.map(task => (
                <div key={task.id} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedTasks.includes(task.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTasks([...selectedTasks, task.id]);
                      } else {
                        setSelectedTasks(selectedTasks.filter(id => id !== task.id));
                      }
                    }}
                    className="mt-6 rounded"
                  />
                  <div className="flex-1">
                    <TaskCard 
                      key={task.id} 
                      task={task} 
                      onToggleStatus={toggleTaskStatus}
                      onDelete={deleteTask}
                      onUpdate={updateTask}
                      members={members}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Share Task List</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invite Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={taskList.invite_code || 'ABC123'}
                    readOnly
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(taskList.invite_code || 'ABC123');
                      alert('Invite code copied!');
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Share this code with friends so they can join your task list
                </p>
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <button
                  onClick={() => setShowShareModal(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Main App Component with Dark Mode
const TaskSphere = () => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [selectedTaskList, setSelectedTaskList] = useState(null);
  const [initialTaskId, setInitialTaskId] = useState(null);
  const { user, loading } = useAuth();

  // Reset selected task list when user changes or logs out
  useEffect(() => {
    if (!user) {
      setSelectedTaskList(null);
      setInitialTaskId(null);
      setIsLoginMode(true); // Always go to login mode when logged out
    }
  }, [user]);

  const handleSelectTaskList = (taskList, taskId = null) => {
    setSelectedTaskList(taskList);
    setInitialTaskId(taskId);
  };

  const handleBackToTaskLists = () => {
    setSelectedTaskList(null);
    setInitialTaskId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return isLoginMode ? (
      <LoginForm onToggleMode={() => setIsLoginMode(false)} />
    ) : (
      <RegisterForm onToggleMode={() => setIsLoginMode(true)} />
    );
  }

  if (selectedTaskList) {
    return (
      <TaskManager 
        taskList={selectedTaskList} 
        onBack={handleBackToTaskLists}
        initialTaskId={initialTaskId}
      />
    );
  }

  return (
    <TaskListSelector onSelectTaskList={handleSelectTaskList} />
  );
};

// Root App with Providers
const App = () => {
  return (
    <DarkModeProvider>
      <AuthProvider>
        <NotificationProvider>
          <TaskSphere />
        </NotificationProvider>
      </AuthProvider>
    </DarkModeProvider>
  );
};

export default App;