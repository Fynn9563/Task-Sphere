// components/ui/TaskListSelector.jsx
import React, { useState, useEffect } from 'react';
import { Plus, Users, Trash2, LogOut, Loader, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { cleanDisplayText } from '../../utils/validation';
import DarkModeToggle from './DarkModeToggle';
import NotificationBell from './NotificationBell';

// Task List Selection Component
const TaskListSelector = ({ onSelectTaskList }) => {
  const [taskLists, setTaskLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const { logout, user, api } = useAuth();

  const handleNavigateToTask = (taskListId, taskId) => {
    // Find the task list and select it, then pass the task ID for highlighting
    const taskList = taskLists.find(list => list.id === taskListId);
    if (taskList) {
      onSelectTaskList(taskList, taskId);
    }
  };

  useEffect(() => {
    loadTaskLists();
    console.log('Current user in TaskListSelector:', user);
  }, []);

  // Auto-select task list if session was restored
  useEffect(() => {
    const autoSelectId = sessionStorage.getItem('autoSelectTaskListId');
    if (autoSelectId && taskLists.length > 0) {
      const taskList = taskLists.find(list => list.id === parseInt(autoSelectId));
      if (taskList) {
        console.log('Auto-selecting restored task list:', taskList);
        sessionStorage.removeItem('autoSelectTaskListId');
        // Small delay to ensure proper initialization
        setTimeout(() => {
          onSelectTaskList(taskList);
        }, 100);
      }
    }
  }, [taskLists, onSelectTaskList]);

  const loadTaskLists = async () => {
    if (!api) return;

    try {
      setLoading(true);
      setError(''); // Clear any previous errors
      const lists = await api.getTaskLists();
      console.log('Loaded task lists:', lists); // Debug log
      console.log('Current user for ownership check:', user); // Debug log
      setTaskLists(lists);
    } catch (err) {
      console.error('Error loading task lists:', err); // Debug log
      setError(err.message || 'Failed to load task lists');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    
    try {
      setCreateLoading(true);
      setError(''); // Clear any previous errors
      
      const newList = await api.createTaskList(newListName, newListDescription);
      
      // Add the new list to the beginning of the array
      setTaskLists(prevLists => [newList, ...prevLists]);
      
      // Reset form and close modal
      setShowCreateForm(false);
      setNewListName('');
      setNewListDescription('');
      
      console.log('New task list created:', newList); // Debug log
    } catch (err) {
      console.error('Error creating task list:', err); // Debug log
      setError(err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoinList = async () => {
    if (!inviteCode.trim()) return;
    
    try {
      setJoinLoading(true);
      setError(''); // Clear any previous errors
      
      await api.joinTaskList(inviteCode);
      
      // Reload the entire list to get the joined list with proper data
      await loadTaskLists();
      
      setShowJoinForm(false);
      setInviteCode('');
    } catch (err) {
      console.error('Error joining task list:', err); // Debug log
      setError(err.message);
    } finally {
      setJoinLoading(false);
    }
  };

  const handleDeleteList = async (taskListId) => {
    try {
      setDeleteLoading(prev => ({ ...prev, [taskListId]: true }));
      setError('');
      
      console.log('Attempting to delete task list:', taskListId);
      
      await api.deleteTaskList(taskListId);
      
      console.log('Task list deleted successfully');
      
      // Remove the deleted list from the UI
      setTaskLists(prevLists => prevLists.filter(list => list.id !== taskListId));
      
      setShowDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting task list:', err);
      setError(err.message || 'Failed to delete task list');
    } finally {
      setDeleteLoading(prev => ({ ...prev, [taskListId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">TS</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Task Sphere</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Select a task list to get started</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <DarkModeToggle />
            <NotificationBell onNavigateToTask={handleNavigateToTask} />
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

      <div className="max-w-4xl mx-auto p-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Create New List Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border-2 border-dashed border-gray-300 dark:border-gray-600 p-6 text-center hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-pointer"
               onClick={() => {
                 setShowCreateForm(true);
                 setError(''); // Clear errors when opening
               }}>
            <Plus className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-800 dark:text-white mb-2">Create New List</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Start a new task list for your team</p>
          </div>

          {/* Join List Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border-2 border-dashed border-gray-300 dark:border-gray-600 p-6 text-center hover:border-green-400 dark:hover:border-green-500 transition-colors cursor-pointer"
               onClick={() => {
                 setShowJoinForm(true);
                 setError(''); // Clear errors when opening
               }}>
            <Users className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-800 dark:text-white mb-2">Join a List</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Use an invite code to join an existing list</p>
          </div>
        </div>

        {/* Existing Task Lists */}
        {taskLists.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Your Task Lists</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {taskLists.map((list) => {
                const isOwner = user && list.owner_id === user.id;
                
                return (
                  <div
                    key={list.id}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 hover:shadow-md transition-shadow"
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-2">
                        <h3 
                          className="text-lg font-medium text-gray-800 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex-1 mr-2"
                          onClick={() => onSelectTaskList(list)}
                        >
                          {cleanDisplayText(list.name)}
                        </h3>
                        
                        {/* Only show delete button for owners */}
                        {isOwner && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDeleteConfirm(list);
                            }}
                            className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                            title="Delete task list (Owner only)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      
                      {/* Owner indicator */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          isOwner 
                            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                        }`}>
                          {isOwner ? 'Owner' : 'Member'}
                        </span>
                        {list.owner_name && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            by {list.owner_name}
                          </span>
                        )}
                      </div>
                      
                      {list.description && (
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">{cleanDisplayText(list.description)}</p>
                      )}
                      
                      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                        <span>{list.task_count || 0} tasks</span>
                        <span>{list.member_count || 0} members</span>
                      </div>
                      
                      <button
                        onClick={() => onSelectTaskList(list)}
                        className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Open List
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Create List Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Create New Task List</h3>
              
              {error && (
                <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-3 mb-4">
                  <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">List Name *</label>
                  <input
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter list name"
                    disabled={createLoading}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (Optional)</label>
                  <textarea
                    value={newListDescription}
                    onChange={(e) => setNewListDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Describe your task list"
                    rows={3}
                    disabled={createLoading}
                  />
                </div>
                
                <div className="flex justify-end gap-2 pt-4">
                  <button
                    onClick={() => {
                      setShowCreateForm(false);
                      setError(''); // Clear errors when closing
                      setNewListName('');
                      setNewListDescription('');
                    }}
                    className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    disabled={createLoading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateList}
                    disabled={createLoading || !newListName.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {createLoading ? <Loader className="w-4 h-4 animate-spin" /> : 'Create List'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Join List Modal */}
        {showJoinForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Join Task List</h3>
              
              {error && (
                <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-3 mb-4">
                  <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invite Code *</label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter invite code"
                    disabled={joinLoading}
                  />
                </div>
                
                <div className="flex justify-end gap-2 pt-4">
                  <button
                    onClick={() => {
                      setShowJoinForm(false);
                      setError(''); // Clear errors when closing
                      setInviteCode('');
                    }}
                    className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    disabled={joinLoading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleJoinList}
                    disabled={joinLoading || !inviteCode.trim()}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {joinLoading ? <Loader className="w-4 h-4 animate-spin" /> : 'Join List'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Delete Task List</h3>
              
              {error && (
                <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
                  </div>
                </div>
              )}
              
              <div className="space-y-4">
                <div className="bg-yellow-50 dark:bg-yellow-900/50 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    <div>
                      <p className="text-yellow-800 dark:text-yellow-200 font-medium">Warning: This action cannot be undone!</p>
                      <p className="text-yellow-700 dark:text-yellow-300 text-sm mt-1">
                        This will permanently delete "<strong>{cleanDisplayText(showDeleteConfirm.name)}</strong>" and all its tasks, projects, and data.
                      </p>
                    </div>
                  </div>
                </div>
                
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Are you sure you want to delete this task list? Only the owner can delete a task list.
                </p>
                
                <div className="flex justify-end gap-2 pt-4">
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(null);
                      setError(''); // Clear errors when closing
                    }}
                    className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    disabled={deleteLoading[showDeleteConfirm.id]}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDeleteList(showDeleteConfirm.id)}
                    disabled={deleteLoading[showDeleteConfirm.id]}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {deleteLoading[showDeleteConfirm.id] ? <Loader className="w-4 h-4 animate-spin" /> : 'Delete Task List'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskListSelector;