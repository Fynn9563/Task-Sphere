// components/tasks/TaskCreationForm.jsx
import React, { useState } from 'react';
import { Plus, Loader, AlertCircle, Trash2, X } from 'lucide-react';
import { validateName, validateDescription, cleanDisplayText } from '../../utils/validation';
import { ApiService } from '../../services/ApiService';

// Convert HH:MM format to decimal hours
const timeStringToHours = (timeString) => {
  if (!timeString || timeString === '') return null;

  const parts = timeString.split(':');
  if (parts.length !== 2) return null;

  const hours = parseInt(parts[0]) || 0;
  const minutes = parseInt(parts[1]) || 0;

  if (hours < 0 || minutes < 0 || minutes >= 60) return null;

  return hours + (minutes / 60);
};

// Enhanced Task Creation Component
const TaskCreationForm = ({ taskList, onTaskCreated, members, projects, requesters }) => {
  const [newTask, setNewTask] = useState({
    name: '',
    description: '',
    project_id: '',
    requester_id: '',
    assigned_to: '',
    priority: 'medium',
    due_date: '',
    estimated_hours: ''
  });
  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState({ projects: {}, requesters: {} });
  const [error, setError] = useState('');
  const [newRequester, setNewRequester] = useState('');
  const [newProject, setNewProject] = useState('');
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [showRequesterManager, setShowRequesterManager] = useState(false);
  const api = new ApiService();

  const resetForm = () => {
    setNewTask({
      name: '',
      description: '',
      project_id: '',
      requester_id: '',
      assigned_to: '',
      priority: 'medium',
      due_date: '',
      estimated_hours: ''
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate task name
    if (!newTask.name.trim()) {
      setError('Task name is required');
      return;
    }
    
    if (!validateName(newTask.name)) {
      setError('Task name contains invalid characters or is too long (max 100 characters)');
      return;
    }
    
    // Validate description if provided
    if (newTask.description && !validateDescription(newTask.description)) {
      setError('Task description contains invalid characters or is too long (max 1000 characters)');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const taskData = {
        name: newTask.name.trim(),
        description: newTask.description.trim() || null,
        projectId: newTask.project_id || null,
        requesterId: newTask.requester_id || null,
        assignedTo: newTask.assigned_to === "" ? null : parseInt(newTask.assigned_to) || null,
        priority: newTask.priority,
        dueDate: newTask.due_date || null,
        estimatedHours: timeStringToHours(newTask.estimated_hours),
      };

      console.log('Creating task with data:', taskData);

      const createdTask = await api.createTask(taskList.id, taskData);
      onTaskCreated(createdTask);
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addRequester = async () => {
    if (!newRequester.trim()) return;
    
    if (!validateName(newRequester)) {
      setError('Requester name contains invalid characters or is too long');
      return;
    }
    
    try {
      const requester = await api.createRequester(taskList.id, newRequester.trim());
      requesters.push(requester);
      setNewRequester('');
      setError(''); // Clear any previous errors
    } catch (err) {
      setError(err.message);
    }
  };

  const addProject = async () => {
    if (!newProject.trim()) return;
    
    if (!validateName(newProject)) {
      setError('Project name contains invalid characters or is too long');
      return;
    }
    
    try {
      const project = await api.createProject(taskList.id, newProject.trim());
      projects.push(project);
      setNewProject('');
      setError(''); // Clear any previous errors
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteProject = async (projectId) => {
    try {
      setDeleteLoading(prev => ({ 
        ...prev, 
        projects: { ...prev.projects, [projectId]: true } 
      }));
      
      await api.deleteProject(projectId);
      
      // Remove from local state
      const projectIndex = projects.findIndex(p => p.id === projectId);
      if (projectIndex > -1) {
        projects.splice(projectIndex, 1);
      }
      
      // If this project was selected in the form, clear it
      if (newTask.project_id === projectId.toString()) {
        setNewTask(prev => ({ ...prev, project_id: '' }));
      }
      
    } catch (err) {
      setError(err.message || 'Failed to delete project');
    } finally {
      setDeleteLoading(prev => ({ 
        ...prev, 
        projects: { ...prev.projects, [projectId]: false } 
      }));
    }
  };

  const deleteRequester = async (requesterId) => {
    try {
      setDeleteLoading(prev => ({ 
        ...prev, 
        requesters: { ...prev.requesters, [requesterId]: true } 
      }));
      
      await api.deleteRequester(requesterId);
      
      // Remove from local state
      const requesterIndex = requesters.findIndex(r => r.id === requesterId);
      if (requesterIndex > -1) {
        requesters.splice(requesterIndex, 1);
      }
      
      // If this requester was selected in the form, clear it
      if (newTask.requester_id === requesterId.toString()) {
        setNewTask(prev => ({ ...prev, requester_id: '' }));
      }
      
    } catch (err) {
      setError(err.message || 'Failed to delete requester');
    } finally {
      setDeleteLoading(prev => ({ 
        ...prev, 
        requesters: { ...prev.requesters, [requesterId]: false } 
      }));
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Create New Task</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* First Row - Task Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Task Name *
            </label>
            <input
              type="text"
              value={newTask.name}
              onChange={(e) => {
                setNewTask({...newTask, name: e.target.value});
                // Clear error when user starts typing
                if (error && error.includes('Task name')) {
                  setError('');
                }
              }}
              placeholder="Enter task name..."
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                newTask.name && !validateName(newTask.name) 
                  ? 'border-red-300 dark:border-red-600' 
                  : 'border-gray-300 dark:border-gray-600'
              }`}
              required
            />
            {newTask.name && !validateName(newTask.name) && (
              <p className="text-red-600 dark:text-red-400 text-xs mt-1">
                Name contains invalid characters or is too long (max 100 characters)
              </p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Priority
            </label>
            <select
              value={newTask.priority}
              onChange={(e) => setNewTask({...newTask, priority: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        {/* Second Row - Assignment & Project */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Assign To
            </label>
            <select
              value={newTask.assigned_to}
              onChange={(e) => setNewTask({...newTask, assigned_to: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Unassigned</option>
              {members.map(member => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Project
              </label>
              <button
                type="button"
                onClick={() => setShowProjectManager(!showProjectManager)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                {showProjectManager ? 'Hide' : 'Manage'} Projects
              </button>
            </div>
            <select
              value={newTask.project_id}
              onChange={(e) => setNewTask({...newTask, project_id: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">No Project</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>{cleanDisplayText(project.name)}</option>
              ))}
            </select>
            
            {/* Project Management Section */}
            {showProjectManager && (
              <div className="mt-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700">
                <div className="space-y-2">
                  {/* Add New Project */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newProject}
                      onChange={(e) => setNewProject(e.target.value)}
                      placeholder="New project name"
                      className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-600 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addProject())}
                    />
                    <button
                      type="button"
                      onClick={addProject}
                      disabled={!newProject.trim()}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  </div>
                  
                  {/* Existing Projects */}
                  {projects.length > 0 && (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      <p className="text-xs text-gray-600 dark:text-gray-400">Existing Projects:</p>
                      {projects.map(project => (
                        <div key={project.id} className="flex items-center justify-between bg-white dark:bg-gray-600 px-2 py-1 rounded text-sm">
                          <span className="text-gray-800 dark:text-white truncate flex-1 mr-2">{cleanDisplayText(project.name)}</span>
                          <button
                            type="button"
                            onClick={() => deleteProject(project.id)}
                            disabled={deleteLoading.projects[project.id]}
                            className="p-1 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                            title="Delete project"
                          >
                            {deleteLoading.projects[project.id] ? (
                              <Loader className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Requester
              </label>
              <button
                type="button"
                onClick={() => setShowRequesterManager(!showRequesterManager)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                {showRequesterManager ? 'Hide' : 'Manage'} Requesters
              </button>
            </div>
            <select
              value={newTask.requester_id}
              onChange={(e) => setNewTask({...newTask, requester_id: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">No Requester</option>
              {requesters.map(requester => (
                <option key={requester.id} value={requester.id}>{cleanDisplayText(requester.name)}</option>
              ))}
            </select>
            
            {/* Requester Management Section */}
            {showRequesterManager && (
              <div className="mt-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700">
                <div className="space-y-2">
                  {/* Add New Requester */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newRequester}
                      onChange={(e) => setNewRequester(e.target.value)}
                      placeholder="New requester name"
                      className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-600 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addRequester())}
                    />
                    <button
                      type="button"
                      onClick={addRequester}
                      disabled={!newRequester.trim()}
                      className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  </div>
                  
                  {/* Existing Requesters */}
                  {requesters.length > 0 && (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      <p className="text-xs text-gray-600 dark:text-gray-400">Existing Requesters:</p>
                      {requesters.map(requester => (
                        <div key={requester.id} className="flex items-center justify-between bg-white dark:bg-gray-600 px-2 py-1 rounded text-sm">
                          <span className="text-gray-800 dark:text-white truncate flex-1 mr-2">{cleanDisplayText(requester.name)}</span>
                          <button
                            type="button"
                            onClick={() => deleteRequester(requester.id)}
                            disabled={deleteLoading.requesters[requester.id]}
                            className="p-1 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                            title="Delete requester"
                          >
                            {deleteLoading.requesters[requester.id] ? (
                              <Loader className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Third Row - Dates & Time */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={newTask.due_date}
              onChange={(e) => setNewTask({...newTask, due_date: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Estimated Time
            </label>
            <input
              type="text"
              value={newTask.estimated_hours}
              onChange={(e) => setNewTask({...newTask, estimated_hours: e.target.value})}
              placeholder="e.g., 1:30 or 0:45"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <textarea
            value={newTask.description}
            onChange={(e) => {
              setNewTask({...newTask, description: e.target.value});
              // Clear error when user starts typing
              if (error && error.includes('description')) {
                setError('');
              }
            }}
            placeholder="Task description (optional)..."
            rows={3}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              newTask.description && !validateDescription(newTask.description) 
                ? 'border-red-300 dark:border-red-600' 
                : 'border-gray-300 dark:border-gray-600'
            }`}
          />
          {newTask.description && !validateDescription(newTask.description) && (
            <p className="text-red-600 dark:text-red-400 text-xs mt-1">
              Description contains invalid characters or is too long (max 1000 characters)
            </p>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={resetForm}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={loading || !newTask.name.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Task
          </button>
        </div>
      </form>
    </div>
  );
};

export default TaskCreationForm;