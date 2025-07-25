// App.jsx
import React, { useState, useEffect } from 'react';
import { Loader } from 'lucide-react';

// Context Providers
import { DarkModeProvider } from './contexts/DarkModeContext';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';

// Hooks
import { useAuth } from './hooks/useAuth';

// Components
import LoginForm from './components/auth/LoginForm';
import RegisterForm from './components/auth/RegisterForm';
import TaskListSelector from './components/ui/TaskListSelector';
import TaskManager from './components/tasks/TaskManager';

// Main App Component with Dark Mode
const TaskSphere = () => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [selectedTaskList, setSelectedTaskList] = useState(null);
  const [initialTaskId, setInitialTaskId] = useState(null);
  const { user, loading } = useAuth();

  // Reset selected task list when user changes or logs out
  useEffect(() => {
    if (!user) {
      setSelectedTaskList(null);
      setInitialTaskId(null);
      setIsLoginMode(true); // Always go to login mode when logged out
    }
  }, [user]);

  const handleSelectTaskList = (taskList, taskId = null) => {
    setSelectedTaskList(taskList);
    setInitialTaskId(taskId);
  };

  const handleBackToTaskLists = () => {
    setSelectedTaskList(null);
    setInitialTaskId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return isLoginMode ? (
      <LoginForm onToggleMode={() => setIsLoginMode(false)} />
    ) : (
      <RegisterForm onToggleMode={() => setIsLoginMode(true)} />
    );
  }

  if (selectedTaskList) {
    return (
      <TaskManager 
        taskList={selectedTaskList} 
        onBack={handleBackToTaskLists}
        initialTaskId={initialTaskId}
      />
    );
  }

  return (
    <TaskListSelector onSelectTaskList={handleSelectTaskList} />
  );
};

// Root App with Providers
const App = () => {
  return (
    <DarkModeProvider>
      <AuthProvider>
        <NotificationProvider>
          <TaskSphere />
        </NotificationProvider>
      </AuthProvider>
    </DarkModeProvider>
  );
};

export default App;