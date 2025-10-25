// contexts/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ApiService } from '../services/ApiService';
import { isTokenExpired, isTokenExpiringSoon } from '../utils/tokenValidator';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [api, setApi] = useState(null);
  const tokenCheckIntervalRef = useRef(null);
  const refreshTimeoutRef = useRef(null);

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
    // Clear token check intervals
    if (tokenCheckIntervalRef.current) {
      clearInterval(tokenCheckIntervalRef.current);
      tokenCheckIntervalRef.current = null;
    }
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    // User will be logged out, triggering redirect to login
    setUser(null);
  }, []);

  // Validate token and check if it needs refreshing
  const validateAndRefreshToken = useCallback(async (apiService) => {
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');

    if (!token || !refreshToken) {
      console.log('No tokens found, logging out');
      setUser(null);
      return false;
    }

    // Check if access token is expired
    if (isTokenExpired(token)) {
      console.log('Access token expired, attempting refresh...');
      try {
        await apiService.refreshAccessToken();
        console.log('Token refreshed successfully');
        return true;
      } catch (error) {
        console.error('Failed to refresh token:', error);
        handleAuthError('expired');
        return false;
      }
    }

    // Check if token is expiring soon and preemptively refresh
    if (isTokenExpiringSoon(token, 2 * 60 * 1000)) { // 2 minutes before expiration
      console.log('Token expiring soon, preemptively refreshing...');
      try {
        await apiService.refreshAccessToken();
        console.log('Token preemptively refreshed');
        return true;
      } catch (error) {
        console.error('Failed to preemptively refresh token:', error);
        // Don't logout yet, token is still valid
        return true;
      }
    }

    return true;
  }, [handleAuthError]);

  // Start periodic token validation
  const startTokenValidation = useCallback((apiService) => {
    // Clear any existing intervals
    if (tokenCheckIntervalRef.current) {
      clearInterval(tokenCheckIntervalRef.current);
    }
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    // Check token validity every minute
    tokenCheckIntervalRef.current = setInterval(() => {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found during periodic check, logging out');
        handleAuthError('missing');
        return;
      }

      if (isTokenExpired(token)) {
        console.log('Token expired during periodic check, logging out');
        handleAuthError('expired');
      } else if (isTokenExpiringSoon(token, 2 * 60 * 1000)) {
        // Preemptively refresh if expiring within 2 minutes
        console.log('Token expiring soon, refreshing...');
        apiService.refreshAccessToken().catch((error) => {
          console.error('Failed to refresh token during periodic check:', error);
          handleAuthError('expired');
        });
      }
    }, 60 * 1000); // Check every 60 seconds
  }, [handleAuthError]);

  useEffect(() => {
    // Initialize ApiService with auth error callback
    const apiService = new ApiService(handleAuthError);
    setApi(apiService);

    const initializeAuth = async () => {
      const token = localStorage.getItem('token');
      const refreshToken = localStorage.getItem('refreshToken');

      if (token && refreshToken) {
        apiService.setTokens(token, refreshToken);

        // Validate token on mount
        const isValid = await validateAndRefreshToken(apiService);

        if (isValid) {
          setUser({ token: apiService.token }); // Use potentially refreshed token
          // Start periodic token validation
          startTokenValidation(apiService);
        } else {
          // Token validation failed, user will be logged out
          console.log('Token validation failed on mount');
        }
      }
      setLoading(false);
    };

    initializeAuth();

    // Cleanup on unmount
    return () => {
      if (tokenCheckIntervalRef.current) {
        clearInterval(tokenCheckIntervalRef.current);
      }
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [handleAuthError, validateAndRefreshToken, startTokenValidation]);

  const login = async (email, password) => {
    if (!api) throw new Error('API service not initialized');

    const data = await api.login(email, password);
    setUser(data.user);
    // Start periodic token validation after login
    startTokenValidation(api);
    // Clear any previously selected task list when logging in
    localStorage.removeItem('selectedTaskList');
    return data;
  };

  const register = async (email, password, name) => {
    if (!api) throw new Error('API service not initialized');

    const data = await api.register(email, password, name);
    setUser(data.user);
    // Start periodic token validation after registration
    startTokenValidation(api);
    // Clear any previously selected task list when registering
    localStorage.removeItem('selectedTaskList');
    return data;
  };

  const logout = (reason = 'manual') => {
    if (!api) return;

    // Clear token check intervals
    if (tokenCheckIntervalRef.current) {
      clearInterval(tokenCheckIntervalRef.current);
      tokenCheckIntervalRef.current = null;
    }
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }

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

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);