import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { WebSocketService } from '../services/WebSocketService';

const NotificationContext = createContext();

// Create notification sound using Web Audio API
let audioContext = null;

const initAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume audio context if suspended (browser autoplay policy)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
};

const playNotificationSound = () => {
  try {
    const ctx = initAudioContext();

    // First tone
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.15);

    // Second tone
    setTimeout(() => {
      const oscillator2 = ctx.createOscillator();
      const gainNode2 = ctx.createGain();

      oscillator2.connect(gainNode2);
      gainNode2.connect(ctx.destination);

      oscillator2.frequency.value = 1000;
      oscillator2.type = 'sine';
      gainNode2.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

      oscillator2.start(ctx.currentTime);
      oscillator2.stop(ctx.currentTime + 0.15);
    }, 80);
  } catch (error) {
    console.error('Failed to play notification sound:', error);
  }
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const { user, api } = useAuth();
  const ws = new WebSocketService();

  useEffect(() => {
    if (user && user.id) {
      loadNotifications();
      loadUnreadCount();

      ws.connect();
      ws.joinUser(user.id);

      ws.on('newNotification', (notification) => {
        console.log('Received new notification:', notification);
        setNotifications(prev => [notification, ...prev]);
        setUnreadCount(prev => prev + 1);

        // Play notification sound
        playNotificationSound();

        // Show browser notification if permission granted and (window not focused OR it's a reminder)
        const shouldShowBrowserNotif = Notification.permission === 'granted' &&
          (!document.hasFocus() || notification.type === 'task_reminder');

        if (shouldShowBrowserNotif) {
          const browserNotif = new Notification(notification.title, {
            body: notification.message,
            icon: '/favicon.ico',
            tag: `notification-${notification.id}`,
            requireInteraction: notification.type === 'task_reminder'
          });

          browserNotif.onclick = () => {
            window.focus();
            browserNotif.close();

            if (notification.task_id && notification.task_list_id) {
              const event = new CustomEvent('highlightTask', {
                detail: {
                  taskId: notification.task_id,
                  taskListId: notification.task_list_id
                }
              });
              window.dispatchEvent(event);

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
          };
        }
      });
      
      return () => {
        ws.disconnect();
      };
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

export const useNotifications = () => useContext(NotificationContext);