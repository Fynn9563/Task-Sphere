import React, { useState, useEffect } from 'react';
import { Bell, X, CheckCheck, Loader, AlertCircle } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuth } from '../../hooks/useAuth';
import { formatDatetime } from '../../utils/dateUtils';

const NotificationBell = ({ onNavigateToTask }) => {
  const { api } = useAuth();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, clearNotification, clearAllNotifications } = useNotifications();
  const [showDropdown, setShowDropdown] = useState(false);
  const [missedReminders, setMissedReminders] = useState([]);
  const [missedLoading, setMissedLoading] = useState(false);

  useEffect(() => {
    if (showDropdown) {
      loadMissedReminders();
    }
  }, [showDropdown]);

  const loadMissedReminders = async () => {
    try {
      setMissedLoading(true);
      const data = await api.getMissedReminders();
      setMissedReminders(data);
    } catch (err) {
      console.error('Failed to load missed reminders:', err);
    } finally {
      setMissedLoading(false);
    }
  };

  const handleDismissMissedReminder = (reminderId) => {
    setMissedReminders(prev => prev.filter(r => r.id !== reminderId));
  };

  const formatTimeAgo = (dateString) => {
    const now = new Date();
    const date = new Date(dateString);

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
      if (!notification.read) {
        await markAsRead(notification.id);
      }

      setShowDropdown(false);

      if (notification.task_id && notification.task_list_id) {
        if (onNavigateToTask) {
          onNavigateToTask(notification.task_list_id, notification.task_id);
        } else {
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

      {showDropdown && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setShowDropdown(false)}
          />

          <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700 z-20 max-h-96 overflow-hidden">
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

            {/* Missed Reminders Section */}
            {missedReminders.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border-b-2 border-amber-200 dark:border-amber-700">
                <div className="p-3 flex items-center justify-between bg-amber-100 dark:bg-amber-900/30">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                      Missed Reminders ({missedReminders.length})
                    </span>
                  </div>
                  <button
                    onClick={() => setMissedReminders([])}
                    className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
                  >
                    Dismiss all
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {missedReminders.map((reminder) => (
                    <div
                      key={reminder.id}
                      className="p-3 border-b border-amber-200 dark:border-amber-700 last:border-b-0 hover:bg-amber-100/50 dark:hover:bg-amber-900/40 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => {
                            handleDismissMissedReminder(reminder.id);
                            setShowDropdown(false);
                            if (onNavigateToTask && reminder.task_id && reminder.task_list_id) {
                              onNavigateToTask(reminder.task_list_id, reminder.task_id);
                            } else {
                              const event = new CustomEvent('highlightTask', {
                                detail: {
                                  taskId: reminder.task_id,
                                  taskListId: reminder.task_list_id
                                }
                              });
                              window.dispatchEvent(event);

                              setTimeout(() => {
                                const taskElement = document.querySelector(`[data-task-id="${reminder.task_id}"]`);
                                if (taskElement) {
                                  taskElement.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'center'
                                  });
                                  taskElement.classList.add('notification-highlight');
                                  setTimeout(() => {
                                    taskElement.classList.remove('notification-highlight');
                                  }, 3000);
                                }
                              }, 100);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Bell className="w-3 h-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                            <h4 className="font-medium text-sm text-amber-900 dark:text-amber-200 truncate">
                              {reminder.task_name}
                            </h4>
                          </div>
                          <p className="text-xs text-amber-700 dark:text-amber-300 mb-1">
                            Due: {formatDatetime(reminder.due_date)}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-amber-600 dark:text-amber-400">
                              Reminded {formatTimeAgo(reminder.sent_at)}
                            </span>
                            {reminder.task_list_name && (
                              <span className="text-xs bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 px-2 py-0.5 rounded">
                                {reminder.task_list_name}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDismissMissedReminder(reminder.id);
                          }}
                          className="p-1 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
                          title="Dismiss reminder"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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

export default NotificationBell;