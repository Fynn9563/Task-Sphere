// components/tasks/TaskManager.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Search, Share2, LogOut, Loader, ListChecks, ListOrdered } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { WebSocketService } from '../../services/WebSocketService';
import DarkModeToggle from '../ui/DarkModeToggle';
import NotificationBell from '../ui/NotificationBell';
import TaskCreationForm from './TaskCreationForm';
import TaskCard from './TaskCard';
import MyQueueView from './MyQueueView';

// Complete Task Manager Component
const TaskManager = ({ taskList, onBack, initialTaskId }) => {
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [requesters, setRequesters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    requester: 'All',
    project: 'All',
    assignedTo: 'All',
    priority: 'All'
  });
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [error, setError] = useState('');
  const [activeView, setActiveView] = useState('tasks'); // 'tasks' or 'queue'

  const { logout, user, api } = useAuth();

  // Create WebSocket instance only once using useMemo
  const ws = useMemo(() => new WebSocketService(), []);

  useEffect(() => {
    loadData();

    // Connect to WebSocket and join task list room
    ws.connect();
    ws.joinTaskList(taskList.id);

    // Set up real-time event listeners
    const handleTaskCreated = (task) => {
      console.log('WebSocket taskCreated event received:', task);
      setTasks(prev => {
        // Prevent duplicates - check if task already exists
        if (prev.some(t => t.id === task.id)) {
          console.log('Task already exists in state, skipping duplicate');
          return prev;
        }
        console.log('Adding new task to state via WebSocket');
        return [task, ...prev];
      });
    };

    const handleTaskUpdated = (updatedTask) => {
      setTasks(prev => prev.map(task =>
        task.id === updatedTask.id ? updatedTask : task
      ));
    };

    const handleTaskDeleted = (deletedTask) => {
      setTasks(prev => prev.filter(task => task.id !== deletedTask.id));
    };

    ws.on('taskCreated', handleTaskCreated);
    ws.on('taskUpdated', handleTaskUpdated);
    ws.on('taskDeleted', handleTaskDeleted);

    return () => {
      ws.off('taskCreated', handleTaskCreated);
      ws.off('taskUpdated', handleTaskUpdated);
      ws.off('taskDeleted', handleTaskDeleted);
      ws.leaveTaskList(taskList.id);
      ws.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskList.id]);

  // Highlight initial task if provided
  useEffect(() => {
    if (initialTaskId && tasks.length > 0) {
      setTimeout(() => {
        const taskElement = document.querySelector(`[data-task-id="${initialTaskId}"]`);
        if (taskElement) {
          taskElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
          
          // Add highlight effect
          taskElement.classList.add('notification-highlight');
          setTimeout(() => {
            taskElement.classList.remove('notification-highlight');
          }, 3000);
        }
      }, 500); // Wait a bit for the UI to render
    }
  }, [initialTaskId, tasks]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tasksData, membersData, projectsData, requestersData] = await Promise.all([
        api.getTasks(taskList.id),
        api.getTaskListMembers(taskList.id),
        api.getProjects(taskList.id),
        api.getRequesters(taskList.id)
      ]);
      
      setTasks(tasksData);
      setMembers(membersData);
      setProjects(projectsData);
      setRequesters(requestersData);
    } catch (err) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      return (
        (filters.search === '' || task.name.toLowerCase().includes(filters.search.toLowerCase())) &&
        (filters.requester === 'All' || task.requester_name === filters.requester) &&
        (filters.project === 'All' || task.project_name === filters.project) &&
        (filters.assignedTo === 'All' || task.assigned_to_name === filters.assignedTo) &&
        (filters.priority === 'All' || task.priority === filters.priority)
      );
    });
  }, [tasks, filters]);

  const toggleTaskStatus = async (taskId) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      const updates = { 
        status: !task.status
      };
      
      console.log('Toggling task status for:', taskId, 'with updates:', updates);
      
      // Get the complete updated task from the server
      const updatedTask = await api.updateTask(taskId, updates);
      
      console.log('Received updated task after status toggle:', updatedTask);
      
      // Update the local state with the complete task data from server
      setTasks(prevTasks => prevTasks.map(task => 
        task.id === taskId ? updatedTask : task
      ));
      
    } catch (err) {
      console.error('Failed to toggle task status:', err);
      setError(err.message || 'Failed to update task');
    }
  };

  const deleteTask = async (taskId) => {
    try {
      await api.deleteTask(taskId);
      setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));
      setSelectedTasks(prevSelected => prevSelected.filter(id => id !== taskId));
    } catch (err) {
      setError(err.message || 'Failed to delete task');
    }
  };

  const updateTask = async (taskId, updates) => {
    try {
      console.log('Updating task:', taskId, 'with:', updates);

      // Get the complete updated task from the server
      const updatedTask = await api.updateTask(taskId, updates);

      console.log('Received updated task from server:', updatedTask);

      // Update the local state with the complete task data from server
      setTasks(prevTasks => prevTasks.map(task =>
        task.id === taskId ? updatedTask : task
      ));

      console.log('Updated local task state');

    } catch (err) {
      console.error('Failed to update task:', err);
      setError(err.message || 'Failed to update task');
    }
  };

  const handleAddToQueue = async (taskId) => {
    try {
      const updatedTask = await api.addToQueue(user.id, taskId);
      // Update only the specific task in local state (no loading screen)
      setTasks(prevTasks => prevTasks.map(task =>
        task.id === taskId ? updatedTask : task
      ));
    } catch (err) {
      console.error('Failed to add to queue:', err);
      setError(err.message || 'Failed to add task to queue');
    }
  };

  const handleRemoveFromQueue = async (taskId) => {
    try {
      console.log('TaskManager handleRemoveFromQueue called for task:', taskId);

      // Remove from queue via API
      await api.removeFromQueue(user.id, taskId);

      // Reload queue to get updated positions for all tasks
      const updatedQueueData = await api.getQueue(user.id, taskList.id);
      console.log('Updated queue data after removal:', updatedQueueData);

      // Update all task positions based on the fresh queue data
      setTasks(prevTasks => prevTasks.map(task => {
        // Clear position for the removed task
        if (task.id === taskId) {
          return { ...task, queue_position: null };
        }

        // Update positions for all remaining queue tasks
        const queueTask = updatedQueueData.find(qt => qt.id === task.id);
        if (queueTask) {
          return { ...task, queue_position: queueTask.queue_position };
        }

        return task;
      }));
    } catch (err) {
      console.error('Failed to remove from queue:', err);
      setError(err.message || 'Failed to remove task from queue');
    }
  };

  // Update queue positions when removed (called by MyQueueView after API call)
  const updateQueuePositionOnRemove = (removedTaskId, updatedQueueData) => {
    console.log('updateQueuePositionOnRemove called:', { removedTaskId, updatedQueueData });

    setTasks(prevTasks => {
      const updatedTasks = prevTasks.map(task => {
        // Clear position for the removed task
        if (task.id === removedTaskId) {
          console.log(`Clearing queue position for task ${task.id}`);
          return { ...task, queue_position: null };
        }

        // Update positions for all remaining queue tasks
        const queueTask = updatedQueueData.find(qt => qt.id === task.id);
        if (queueTask) {
          console.log(`Updating task ${task.id} from position ${task.queue_position} to ${queueTask.queue_position}`);
          return { ...task, queue_position: queueTask.queue_position };
        }

        return task;
      });

      console.log('Updated tasks:', updatedTasks);
      return updatedTasks;
    });
  };

  // Update queue position when added (called by MyQueueView after API call)
  const updateQueuePositionOnAdd = (taskId, position) => {
    setTasks(prevTasks => prevTasks.map(task =>
      task.id === taskId ? { ...task, queue_position: position } : task
    ));
  };

  // Update queue positions after reorder (called by MyQueueView after drag/drop)
  const updateQueuePositionOnReorder = (reorderedQueueData) => {
    console.log('updateQueuePositionOnReorder called:', { reorderedQueueData });

    setTasks(prevTasks => {
      const updatedTasks = prevTasks.map(task => {
        // Update positions for all queue tasks
        const queueTask = reorderedQueueData.find(qt => qt.id === task.id);
        if (queueTask) {
          console.log(`Updating task ${task.id} queue position to ${queueTask.queue_position}`);
          return { ...task, queue_position: queueTask.queue_position };
        }

        return task;
      });

      console.log('Updated tasks after reorder:', updatedTasks);
      return updatedTasks;
    });
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
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                ← Back
              </button>
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">TS</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white">{taskList.name}</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">Collaborative Task Management</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/70 transition-colors"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
              
              <DarkModeToggle />
              <NotificationBell />
              
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

      <div className="max-w-7xl mx-auto p-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Task Creation Form */}
        <TaskCreationForm
          taskList={taskList}
          onTaskCreated={(createdTask) => {
            console.log('TaskCreationForm onTaskCreated callback called with:', createdTask);
            // Immediately add the task to local state for instant UI update
            setTasks(prev => {
              // Prevent duplicates - check if task already exists
              if (prev.some(t => t.id === createdTask.id)) {
                console.log('Task already exists in state, skipping duplicate from form callback');
                return prev;
              }
              console.log('Adding new task to state from form callback');
              return [createdTask, ...prev];
            });
          }}
          members={members}
          projects={projects}
          requesters={requesters}
        />

        {/* View Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-2 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveView('tasks')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeView === 'tasks'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <ListChecks className="w-4 h-4" />
              All Tasks
            </button>
            <button
              onClick={() => setActiveView('queue')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeView === 'queue'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <ListOrdered className="w-4 h-4" />
              My Queue
            </button>
          </div>
        </div>

        {/* Filters (only show on tasks view) */}
        {activeView === 'tasks' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Search</label>
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters({...filters, search: e.target.value})}
                  placeholder="Search tasks..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Assigned To</label>
              <select
                value={filters.assignedTo}
                onChange={(e) => setFilters({...filters, assignedTo: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="All">All Members</option>
                {members.map(member => (
                  <option key={member.id} value={member.name}>{member.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Requester</label>
              <select
                value={filters.requester}
                onChange={(e) => setFilters({...filters, requester: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="All">All Requesters</option>
                {requesters.map(req => (
                  <option key={req.id} value={req.name}>{req.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project</label>
              <select
                value={filters.project}
                onChange={(e) => setFilters({...filters, project: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="All">All Projects</option>
                {projects.map(proj => (
                  <option key={proj.id} value={proj.name}>{proj.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
              <select
                value={filters.priority}
                onChange={(e) => setFilters({...filters, priority: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="All">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            
            <div className="flex items-end">
              <button
                onClick={() => setFilters({
                  search: '', requester: 'All', project: 'All', assignedTo: 'All', priority: 'All'
                })}
                className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>
        )}

        {/* Bulk Actions (only show on tasks view) */}
        {activeView === 'tasks' && selectedTasks.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-blue-800 dark:text-blue-200 font-medium">
                {selectedTasks.length} task{selectedTasks.length > 1 ? 's' : ''} selected
              </span>
              
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  onChange={async (e) => {
                    if (e.target.value !== '') {
                      const assignedTo = e.target.value === 'unassigned' ? null : parseInt(e.target.value);
                      const tasksToUpdate = [...selectedTasks];
                      setSelectedTasks([]);
                      e.target.value = '';
                      await Promise.all(tasksToUpdate.map(taskId => updateTask(taskId, { assigned_to: assignedTo })));
                    }
                  }}
                  defaultValue=""
                  className="px-3 py-1 border border-blue-300 dark:border-blue-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="" disabled>Assign To</option>
                  <option value="unassigned">Unassigned</option>
                  {members.map(member => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>

                <select
                  onChange={async (e) => {
                    if (e.target.value !== '') {
                      const priority = e.target.value;
                      const tasksToUpdate = [...selectedTasks];
                      setSelectedTasks([]);
                      e.target.value = '';
                      await Promise.all(tasksToUpdate.map(taskId => updateTask(taskId, { priority })));
                    }
                  }}
                  defaultValue=""
                  className="px-3 py-1 border border-blue-300 dark:border-blue-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="" disabled>Set Priority</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
                
                <button
                  onClick={async () => {
                    const tasksToToggle = [...selectedTasks];
                    setSelectedTasks([]);
                    await Promise.all(tasksToToggle.map(taskId => toggleTaskStatus(taskId)));
                  }}
                  className="px-3 py-1 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/70 text-sm whitespace-nowrap"
                >
                  Toggle Status
                </button>

                <button
                  onClick={async () => {
                    const tasksToDelete = [...selectedTasks];
                    setSelectedTasks([]);
                    await Promise.all(tasksToDelete.map(taskId => deleteTask(taskId)));
                  }}
                  className="px-3 py-1 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/70 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tasks List (only show on tasks view) */}
        {activeView === 'tasks' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
              Tasks ({filteredTasks.length})
            </h2>
            
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <span>{filteredTasks.filter(t => t.status).length} completed</span>
              <span>•</span>
              <span>{filteredTasks.filter(t => !t.status).length} pending</span>
            </div>
          </div>
          
          <div className="space-y-3">
            {filteredTasks.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                </div>
                <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">No tasks found</h3>
                <p className="text-gray-500 dark:text-gray-500">Try adjusting your filters or add a new task</p>
              </div>
            ) : (
              filteredTasks.map(task => (
                <div key={task.id} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedTasks.includes(task.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTasks([...selectedTasks, task.id]);
                      } else {
                        setSelectedTasks(selectedTasks.filter(id => id !== task.id));
                      }
                    }}
                    className="mt-6 rounded"
                  />
                  <div className="flex-1">
                    <TaskCard
                      key={task.id}
                      task={task}
                      onToggleStatus={toggleTaskStatus}
                      onDelete={deleteTask}
                      onUpdate={updateTask}
                      onAddToQueue={handleAddToQueue}
                      onRemoveFromQueue={handleRemoveFromQueue}
                      members={members}
                      projects={projects}
                      requesters={requesters}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        )}

        {/* My Queue View */}
        {activeView === 'queue' && (
          <MyQueueView
            taskList={taskList}
            tasks={tasks}
            members={members}
            projects={projects}
            requesters={requesters}
            onTaskUpdate={updateTask}
            onTaskDelete={deleteTask}
            onAddToQueue={updateQueuePositionOnAdd}
            onRemoveFromQueue={updateQueuePositionOnRemove}
            onReorderQueue={updateQueuePositionOnReorder}
          />
        )}
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Share Task List</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invite Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={taskList.invite_code || 'ABC123'}
                    readOnly
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(taskList.invite_code || 'ABC123');
                      alert('Invite code copied!');
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Share this code with friends so they can join your task list
                </p>
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <button
                  onClick={() => setShowShareModal(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskManager;