// contexts/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ApiService } from '../services/ApiService';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [api, setApi] = useState(null);

  // Save current session state before logout
  const saveSessionState = useCallback((taskList, taskId) => {
    if (taskList) {
      sessionStorage.setItem('savedSession', JSON.stringify({
        taskListId: taskList.id,
        taskListName: taskList.name,
        taskId: taskId || null,
        timestamp: Date.now()
      }));
    }
  }, []);

  // Restore session state after login
  const restoreSessionState = useCallback(() => {
    const savedSession = sessionStorage.getItem('savedSession');
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        // Only restore if less than 30 minutes old
        if (Date.now() - session.timestamp < 30 * 60 * 1000) {
          sessionStorage.removeItem('savedSession');
          return session;
        }
      } catch (error) {
        console.error('Error restoring session:', error);
      }
      sessionStorage.removeItem('savedSession');
    }
    return null;
  }, []);

  // Handle auth errors from ApiService
  const handleAuthError = useCallback((reason) => {
    console.log('Auth error detected:', reason);
    // User will be logged out, triggering redirect to login
    setUser(null);
  }, []);

  useEffect(() => {
    // Initialize ApiService with auth error callback
    const apiService = new ApiService(handleAuthError);
    setApi(apiService);

    const token = localStorage.getItem('token');
    if (token) {
      apiService.setTokens(token, localStorage.getItem('refreshToken'));
      setUser({ token });
    }
    setLoading(false);
  }, [handleAuthError]);

  const login = async (email, password) => {
    if (!api) throw new Error('API service not initialized');

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
    if (!api) throw new Error('API service not initialized');

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

  const logout = (reason = 'manual') => {
    if (!api) return;

    api.removeTokens();
    setUser(null);

    // Only clear selected task list on manual logout, not auth errors
    if (reason === 'manual') {
      localStorage.removeItem('selectedTaskList');
      sessionStorage.removeItem('savedSession');
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      register,
      logout,
      loading,
      saveSessionState,
      restoreSessionState,
      api
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);