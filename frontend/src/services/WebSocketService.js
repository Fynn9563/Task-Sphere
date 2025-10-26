import { API_BASE_URL } from '../utils/constants';

export class WebSocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.reconnectTimer = null;
    this.userRooms = new Set();
    this.taskListRooms = new Set();
    this.manualDisconnect = false;
  }

  connect() {
    if (typeof window.io !== 'undefined') {
      this.manualDisconnect = false;
      this.socket = window.io(API_BASE_URL, {
        reconnection: false,
        transports: ['websocket', 'polling']
      });

      this.socket.on('connect', () => {
        console.log('Connected to WebSocket server');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;

        this.userRooms.forEach(userId => {
          this.socket.emit('joinUser', userId);
        });
        this.taskListRooms.forEach(taskListId => {
          this.socket.emit('joinTaskList', taskListId);
        });

        this.emitToListeners('reconnected');
      });

      this.socket.on('disconnect', (reason) => {
        console.log('Disconnected from WebSocket server:', reason);

        if (!this.manualDisconnect && reason !== 'io client disconnect') {
          this.attemptReconnect();
        }
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        this.attemptReconnect();
      });

      this.listeners.forEach((callbacks, event) => {
        callbacks.forEach(callback => {
          this.socket.on(event, callback);
        });
      });
    }
  }

  attemptReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emitToListeners('reconnect_failed');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectDelay}ms`);

    this.emitToListeners('reconnecting', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delay: this.reconnectDelay
    });

    this.reconnectTimer = setTimeout(() => {
      if (this.socket) {
        this.socket.close();
      }
      this.connect();
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 16000);
    }, this.reconnectDelay);
  }

  emitToListeners(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  disconnect() {
    this.manualDisconnect = true; // Mark as intentional disconnect

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.listeners.forEach((_, event) => {
        this.socket.off(event);
      });
      this.socket.disconnect();
      this.socket = null;
    }

    // Clear room tracking
    this.userRooms.clear();
    this.taskListRooms.clear();
    this.reconnectAttempts = 0;
  }

  joinUser(userId) {
    this.userRooms.add(userId); // Track room
    if (this.socket) {
      this.socket.emit('joinUser', userId);
    }
  }

  joinTaskList(taskListId) {
    this.taskListRooms.add(taskListId); // Track room
    if (this.socket) {
      this.socket.emit('joinTaskList', taskListId);
    }
  }

  leaveTaskList(taskListId) {
    this.taskListRooms.delete(taskListId); // Stop tracking room
    if (this.socket) {
      this.socket.emit('leaveTaskList', taskListId);
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
      if (callbacks.length === 0) {
        this.listeners.delete(event);
      }
    }
    if (this.socket && callback) {
      this.socket.off(event, callback);
    } else if (this.socket) {
      this.socket.off(event);
    }
  }
}