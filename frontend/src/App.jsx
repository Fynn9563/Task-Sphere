import React, { useState, useEffect } from 'react';
import { Loader } from 'lucide-react';
import { DarkModeProvider } from './contexts/DarkModeContext';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { useAuth } from './hooks/useAuth';
import LoginForm from './components/auth/LoginForm';
import RegisterForm from './components/auth/RegisterForm';
import TaskListSelector from './components/ui/TaskListSelector';
import TaskManager from './components/tasks/TaskManager';
import Profile from './pages/Profile';

const TaskSphere = () => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [selectedTaskList, setSelectedTaskList] = useState(null);
  const [initialTaskId, setInitialTaskId] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const { user, loading, saveSessionState, restoreSessionState } = useAuth();

  // Save current state before logout
  useEffect(() => {
    if (!user && selectedTaskList) {
      saveSessionState(selectedTaskList, initialTaskId);
    }
  }, [user, selectedTaskList, initialTaskId, saveSessionState]);

  // Reset state when logged out
  useEffect(() => {
    if (!user) {
      setSelectedTaskList(null);
      setInitialTaskId(null);
      setShowProfile(false);
      setIsLoginMode(true);
    }
  }, [user]);

  // Restore session after login
  useEffect(() => {
    if (user && !selectedTaskList) {
      const savedSession = restoreSessionState();
      if (savedSession) {
        console.log('Restoring session:', savedSession);
        setInitialTaskId(savedSession.taskId);
        sessionStorage.setItem('autoSelectTaskListId', savedSession.taskListId);
      }
    }
  }, [user, selectedTaskList, restoreSessionState]);

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

  if (showProfile) {
    return <Profile onBack={() => setShowProfile(false)} />;
  }

  if (selectedTaskList) {
    return (
      <TaskManager
        taskList={selectedTaskList}
        onBack={handleBackToTaskLists}
        initialTaskId={initialTaskId}
        onOpenProfile={() => setShowProfile(true)}
      />
    );
  }

  return (
    <TaskListSelector
      onSelectTaskList={handleSelectTaskList}
      onOpenProfile={() => setShowProfile(true)}
    />
  );
};

// Wrapper to pass auth context to DarkModeProvider
const DarkModeWrapper = ({ children }) => {
  const { api, isAuthenticated } = useAuth();
  return (
    <DarkModeProvider api={api} isAuthenticated={isAuthenticated}>
      {children}
    </DarkModeProvider>
  );
};

// Root App with Providers
const App = () => {
  return (
    <AuthProvider>
      <DarkModeWrapper>
        <NotificationProvider>
          <TaskSphere />
        </NotificationProvider>
      </DarkModeWrapper>
    </AuthProvider>
  );
};

export default App;