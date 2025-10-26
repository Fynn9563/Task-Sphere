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

  const restoreSessionState = useCallback(() => {
    const savedSession = sessionStorage.getItem('savedSession');
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
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

  const handleAuthError = useCallback((reason) => {
    console.log('Auth error detected:', reason);
    if (tokenCheckIntervalRef.current) {
      clearInterval(tokenCheckIntervalRef.current);
      tokenCheckIntervalRef.current = null;
    }
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    setUser(null);
  }, []);

  const validateAndRefreshToken = useCallback(async (apiService) => {
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');

    if (!token || !refreshToken) {
      console.log('No tokens found, logging out');
      setUser(null);
      return false;
    }

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

    if (isTokenExpiringSoon(token, 2 * 60 * 1000)) {
      console.log('Token expiring soon, preemptively refreshing...');
      try {
        await apiService.refreshAccessToken();
        console.log('Token preemptively refreshed');
        return true;
      } catch (error) {
        console.error('Failed to preemptively refresh token:', error);
        return true;
      }
    }

    return true;
  }, [handleAuthError]);

  const startTokenValidation = useCallback((apiService) => {
    if (tokenCheckIntervalRef.current) {
      clearInterval(tokenCheckIntervalRef.current);
    }
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

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
        console.log('Token expiring soon, refreshing...');
        apiService.refreshAccessToken().catch((error) => {
          console.error('Failed to refresh token during periodic check:', error);
          handleAuthError('expired');
        });
      }
    }, 60 * 1000);
  }, [handleAuthError]);

  useEffect(() => {
    const apiService = new ApiService(handleAuthError);
    setApi(apiService);

    const initializeAuth = async () => {
      const token = localStorage.getItem('token');
      const refreshToken = localStorage.getItem('refreshToken');

      if (token && refreshToken) {
        apiService.setTokens(token, refreshToken);

        const isValid = await validateAndRefreshToken(apiService);

        if (isValid) {
          setUser({ token: apiService.token });
          startTokenValidation(apiService);
        } else {
          console.log('Token validation failed on mount');
        }
      }
      setLoading(false);
    };

    initializeAuth();

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
    startTokenValidation(api);
    localStorage.removeItem('selectedTaskList');
    return data;
  };

  const register = async (email, password, name) => {
    if (!api) throw new Error('API service not initialized');

    const data = await api.register(email, password, name);
    setUser(data.user);
    startTokenValidation(api);
    localStorage.removeItem('selectedTaskList');
    return data;
  };

  const logout = (reason = 'manual') => {
    if (!api) return;

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