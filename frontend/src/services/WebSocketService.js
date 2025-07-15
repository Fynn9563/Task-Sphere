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

      this.listeners.forEach((callback, event) => {
        this.socket.on(event, callback);
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
    this.listeners.set(event, callback);
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event) {
    this.listeners.delete(event);
    if (this.socket) {
      this.socket.off(event);
    }
  }
}