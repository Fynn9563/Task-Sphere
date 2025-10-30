import React, { createContext, useContext, useState, useEffect } from 'react';

const DarkModeContext = createContext();

export const DarkModeProvider = ({ children, api, isAuthenticated }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Default to dark mode (true)
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : true;
  });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user's dark mode preference from backend when authenticated
  useEffect(() => {
    const fetchDarkModePreference = async () => {
      if (isAuthenticated && api) {
        try {
          const profile = await api.getUserProfile();
          if (profile && typeof profile.dark_mode_preference === 'boolean') {
            setIsDarkMode(profile.dark_mode_preference);
            localStorage.setItem('darkMode', JSON.stringify(profile.dark_mode_preference));
          }
        } catch (error) {
          console.error('Failed to fetch dark mode preference:', error);
        }
      }
      setIsLoading(false);
    };

    fetchDarkModePreference();
  }, [isAuthenticated, api]);

  // Apply dark mode class to document
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [isDarkMode, isLoading]);

  const toggleDarkMode = async () => {
    const newValue = !isDarkMode;
    setIsDarkMode(newValue);

    // Sync to backend if authenticated
    if (isAuthenticated && api) {
      try {
        await api.updateUserProfile({ darkModePreference: newValue });
      } catch (error) {
        console.error('Failed to sync dark mode preference to backend:', error);
      }
    }
  };

  return (
    <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode, isLoading }}>
      {children}
    </DarkModeContext.Provider>
  );
};

export const useDarkMode = () => useContext(DarkModeContext);