// components/tasks/TaskCard.jsx
import React, { useState, useEffect } from 'react';
import { Check, X, Edit3, Trash2, User, Calendar, Clock, Loader, Save, ListPlus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { validateName, validateDescription, cleanDisplayText } from '../../utils/validation';

// Helper function to format estimated hours for display
const formatEstimatedHours = (hours) => {
  if (!hours || hours === 0) return null;

  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  if (h === 0) {
    return `${m}min`;
  } else if (m === 0) {
    return `${h}h`;
  } else {
    return `${h}h ${m}min`;
  }
};

// Convert decimal hours to HH:MM format for input
const hoursToTimeString = (hours) => {
  if (!hours) return '';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
};

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

// Enhanced Task Card Component with comprehensive editing
const TaskCard = ({ task, onToggleStatus, onDelete, onUpdate, members, projects, requesters, onAddToQueue, onRemoveFromQueue }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [editData, setEditData] = useState({
    name: task.name || '',
    description: task.description || '',
    assigned_to: task.assigned_to || '',
    priority: task.priority || 'medium',
    project_id: task.project_id || '',
    requester_id: task.requester_id || '',
    due_date: task.due_date || '',
    estimated_hours: hoursToTimeString(task.estimated_hours)
  });
  const [editErrors, setEditErrors] = useState({});

  // Update editData when task changes (for real-time updates)
  useEffect(() => {
    setEditData({
      name: cleanDisplayText(task.name) || '',
      description: cleanDisplayText(task.description) || '',
      assigned_to: task.assigned_to || '',
      priority: task.priority || 'medium',
      project_id: task.project_id || '',
      requester_id: task.requester_id || '',
      due_date: task.due_date || '',
      estimated_hours: hoursToTimeString(task.estimated_hours)
    });
    setEditErrors({}); // Clear errors when task changes
  }, [task]);

  // Validation function for edit form
  const validateEditForm = () => {
    const errors = {};
    
    if (!editData.name.trim()) {
      errors.name = 'Task name is required';
    } else if (!validateName(editData.name)) {
      errors.name = 'Name contains invalid characters or is too long';
    }
    
    if (editData.description && !validateDescription(editData.description)) {
      errors.description = 'Description contains invalid characters or is too long';
    }
    
    if (editData.estimated_hours) {
      const hours = timeStringToHours(editData.estimated_hours);
      if (hours === null) {
        errors.estimated_hours = 'Invalid time format. Use H:MM (e.g., 1:30 for 1 hour 30 minutes)';
      } else if (hours > 999.99) {
        errors.estimated_hours = 'Estimated hours cannot exceed 999 hours';
      }
    }
    
    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Listen for highlight events from notifications
  useEffect(() => {
    const handleHighlight = (event) => {
      if (event.detail.taskId === task.id) {
        // Add highlight class temporarily
        const element = document.querySelector(`[data-task-id="${task.id}"]`);
        if (element) {
          element.classList.add('notification-highlight');
          setTimeout(() => {
            element.classList.remove('notification-highlight');
          }, 3000);
        }
      }
    };

    window.addEventListener('highlightTask', handleHighlight);
    return () => window.removeEventListener('highlightTask', handleHighlight);
  }, [task.id]);

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'border-red-500 bg-red-50 dark:bg-red-900/20';
      case 'high': return 'border-orange-500 bg-orange-50 dark:bg-orange-900/20';
      case 'medium': return 'border-blue-500 bg-blue-50 dark:bg-blue-900/20';
      case 'low': return 'border-green-500 bg-green-50 dark:bg-green-900/20';
      default: return 'border-gray-500 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  const handleQuickUpdate = async () => {
    if (!validateEditForm()) {
      return; // Don't submit if validation fails
    }
    
    try {
      setUpdateLoading(true);
      console.log('Starting comprehensive update for task:', task.id, 'with data:', editData);
      
      // Prepare update data
      const updatesData = {
        name: editData.name.trim(),
        description: editData.description.trim() || null,
        assigned_to: editData.assigned_to === "" ? null : parseInt(editData.assigned_to) || null,
        priority: editData.priority,
        project_id: editData.project_id === "" ? null : parseInt(editData.project_id) || null,
        requester_id: editData.requester_id === "" ? null : parseInt(editData.requester_id) || null,
        due_date: editData.due_date || null,
        estimated_hours: timeStringToHours(editData.estimated_hours)
      };
      
      console.log('Processed update data:', updatesData);
      
      await onUpdate(task.id, updatesData);
      
      console.log('Comprehensive update completed successfully');
      setIsEditing(false);
      setEditErrors({});
    } catch (error) {
      console.error('Update failed:', error);
      // Don't close editing panel if update failed, show error in editErrors
      setEditErrors({ general: error.message || 'Failed to update task' });
    } finally {
      setUpdateLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div 
      data-task-id={task.id}
      className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border-l-4 p-4 mb-3 transition-all hover:shadow-md relative ${
        task.status 
          ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
          : getPriorityColor(task.priority)
      }`}
    >
      
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className={`font-medium text-lg ${
              task.status 
                ? 'line-through text-gray-500 dark:text-gray-400' 
                : 'text-gray-800 dark:text-white'
            }`}>
              {cleanDisplayText(task.name)}
            </h3>
            
            {task.priority && (
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                task.priority === 'urgent' ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200' :
                task.priority === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200' :
                task.priority === 'medium' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200' :
                'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'
              }`}>
                {task.priority}
              </span>
            )}
          </div>
          
          {task.description && (
            <p className="text-gray-600 dark:text-gray-300 text-sm mb-3">{cleanDisplayText(task.description)}</p>
          )}
          
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {task.assigned_to_name && (
              <span className="bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 px-2 py-1 rounded-full flex items-center gap-1">
                <User className="w-3 h-3" />
                {cleanDisplayText(task.assigned_to_name)}
              </span>
            )}
            
            {task.project_name && (
              <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 px-2 py-1 rounded-full">
                {cleanDisplayText(task.project_name)}
              </span>
            )}
            
            {task.requester_name && (
              <span className="bg-cyan-100 dark:bg-cyan-900/50 text-cyan-800 dark:text-cyan-200 px-2 py-1 rounded-full">
                {cleanDisplayText(task.requester_name)}
              </span>
            )}
            
            {task.due_date && (
              <span className="bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded-full flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(task.due_date)}
              </span>
            )}
            
            {formatEstimatedHours(task.estimated_hours) && (
              <span className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 rounded-full flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatEstimatedHours(task.estimated_hours)}
              </span>
            )}

            {task.queue_position && (
              <span className="bg-blue-600 text-white px-2 py-1 rounded-full flex items-center gap-1 font-bold">
                #{task.queue_position} in queue
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="p-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title="Quick edit"
          >
            <Edit3 className="w-4 h-4" />
          </button>

          {/* Add to Queue / Remove from Queue button */}
          {task.queue_position ? (
            onRemoveFromQueue && (
              <button
                onClick={() => {
                  console.log('Remove from queue button clicked for task:', task.id);
                  console.log('onRemoveFromQueue function:', onRemoveFromQueue);
                  onRemoveFromQueue(task.id);
                }}
                className="p-2 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/70 transition-colors"
                title="Remove from queue"
              >
                <X className="w-4 h-4" />
              </button>
            )
          ) : (
            onAddToQueue && (
              <button
                onClick={() => onAddToQueue(task.id)}
                className="p-2 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/70 transition-colors"
                title="Add to my queue"
              >
                <ListPlus className="w-4 h-4" />
              </button>
            )
          )}

          <button
            onClick={() => onToggleStatus(task.id)}
            className={`p-2 rounded-lg transition-colors ${
              task.status 
                ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/70' 
                : 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/70'
            }`}
            title={task.status ? 'Mark as not done' : 'Mark as done'}
          >
            {task.status ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          </button>
          
          <button
            onClick={() => onDelete(task.id)}
            className="p-2 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/70 transition-colors"
            title="Delete task"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Comprehensive Edit Panel */}
      {isEditing && (
        <div className="border-t dark:border-gray-600 pt-4 mt-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Edit Task</h4>
          
          {editErrors.general && (
            <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded text-sm">
              <p className="text-red-700 dark:text-red-300">{editErrors.general}</p>
            </div>
          )}
          
          {/* Task Name */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Task Name *
            </label>
            <input
              type="text"
              value={editData.name}
              onChange={(e) => {
                setEditData({...editData, name: e.target.value});
                if (editErrors.name) setEditErrors({...editErrors, name: ''});
              }}
              className={`w-full px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed ${
                editErrors.name ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
              }`}
              disabled={updateLoading}
            />
            {editErrors.name && (
              <p className="text-red-600 dark:text-red-400 text-xs mt-1">{editErrors.name}</p>
            )}
          </div>
          
          {/* Description */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={editData.description}
              onChange={(e) => {
                setEditData({...editData, description: e.target.value});
                if (editErrors.description) setEditErrors({...editErrors, description: ''});
              }}
              rows={2}
              className={`w-full px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed ${
                editErrors.description ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
              }`}
              disabled={updateLoading}
              placeholder="Task description (optional)"
            />
            {editErrors.description && (
              <p className="text-red-600 dark:text-red-400 text-xs mt-1">{editErrors.description}</p>
            )}
          </div>
          
          {/* Row 1: Assignment and Priority */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Assign To
              </label>
              <select
                value={editData.assigned_to}
                onChange={(e) => setEditData({...editData, assigned_to: e.target.value})}
                disabled={updateLoading}
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
              >
                <option value="">Unassigned</option>
                {members.map(member => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Priority
              </label>
              <select
                value={editData.priority}
                onChange={(e) => setEditData({...editData, priority: e.target.value})}
                disabled={updateLoading}
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          
          {/* Row 2: Project and Requester */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Project
              </label>
              <select
                value={editData.project_id}
                onChange={(e) => setEditData({...editData, project_id: e.target.value})}
                disabled={updateLoading}
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
              >
                <option value="">No Project</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>{cleanDisplayText(project.name)}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Requester
              </label>
              <select
                value={editData.requester_id}
                onChange={(e) => setEditData({...editData, requester_id: e.target.value})}
                disabled={updateLoading}
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
              >
                <option value="">No Requester</option>
                {requesters.map(requester => (
                  <option key={requester.id} value={requester.id}>{cleanDisplayText(requester.name)}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Row 3: Due Date and Estimated Hours */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={editData.due_date}
                onChange={(e) => setEditData({...editData, due_date: e.target.value})}
                disabled={updateLoading}
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Estimated Time
              </label>
              <input
                type="text"
                value={editData.estimated_hours}
                onChange={(e) => {
                  setEditData({...editData, estimated_hours: e.target.value});
                  if (editErrors.estimated_hours) setEditErrors({...editErrors, estimated_hours: ''});
                }}
                disabled={updateLoading}
                placeholder="e.g., 1:30 or 0:45"
                className={`w-full px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed ${
                  editErrors.estimated_hours ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                }`}
              />
              {editErrors.estimated_hours && (
                <p className="text-red-600 dark:text-red-400 text-xs mt-1">{editErrors.estimated_hours}</p>
              )}
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setIsEditing(false);
                setEditErrors({});
                // Reset editData to original task values
                setEditData({
                  name: task.name || '',
                  description: task.description || '',
                  assigned_to: task.assigned_to || '',
                  priority: task.priority || 'medium',
                  project_id: task.project_id || '',
                  requester_id: task.requester_id || '',
                  due_date: task.due_date || '',
                  estimated_hours: hoursToTimeString(task.estimated_hours)
                });
              }}
              className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              disabled={updateLoading}
            >
              Cancel
            </button>
            <button
              onClick={handleQuickUpdate}
              disabled={updateLoading}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            >
              {updateLoading ? (
                <>
                  <Loader className="w-3 h-3 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-3 h-3" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskCard;