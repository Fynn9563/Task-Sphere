// services/WebSocketService.js
import { API_BASE_URL } from '../utils/constants';

// WebSocket Service
export class WebSocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect() {
    if (typeof window.io !== 'undefined') {
      this.socket = window.io(API_BASE_URL);

      this.socket.on('connect', () => {
        console.log('Connected to server');
      });

      this.socket.on('disconnect', () => {
        console.log('Disconnected from server');
      });

      this.listeners.forEach((callbacks, event) => {
        callbacks.forEach(callback => {
          this.socket.on(event, callback);
        });
      });
    }
  }

  disconnect() {
    if (this.socket) {
      this.listeners.forEach((_, event) => {
        this.socket.off(event);
      });
      this.socket.disconnect();
      this.socket = null;
    }
  }

  joinUser(userId) {
    if (this.socket) {
      this.socket.emit('joinUser', userId);
    }
  }

  joinTaskList(taskListId) {
    if (this.socket) {
      this.socket.emit('joinTaskList', taskListId);
    }
  }

  leaveTaskList(taskListId) {
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