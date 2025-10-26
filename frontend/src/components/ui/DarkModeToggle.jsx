import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useDarkMode } from '../../hooks/useDarkMode';

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

export default DarkModeToggle;