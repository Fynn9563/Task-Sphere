// contexts/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { ApiService } from '../services/ApiService';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
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

export const useAuth = () => useContext(AuthContext);