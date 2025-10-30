import React from 'react';
import { LogOut, UserCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import DarkModeToggle from '../ui/DarkModeToggle';
import NotificationBell from '../ui/NotificationBell';

const Header = ({ title, subtitle, onBack, showNotifications = true, onOpenProfile, children }) => {
  const { logout } = useAuth();

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                ← Back
              </button>
            )}
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">TS</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800 dark:text-white">{title}</h1>
              {subtitle && (
                <p className="text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {children}

            <DarkModeToggle />

            {showNotifications && <NotificationBell />}

            {onOpenProfile && (
              <button
                onClick={onOpenProfile}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Profile Settings"
              >
                <UserCircle className="w-4 h-4" />
                Profile
              </button>
            )}

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
  );
};

export default Header;