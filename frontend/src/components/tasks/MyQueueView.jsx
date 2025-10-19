// components/tasks/MyQueueView.jsx
import React, { useState, useEffect } from 'react';
import { ListOrdered, Plus, Loader } from 'lucide-react';
import { ApiService } from '../../services/ApiService';
import { useAuth } from '../../hooks/useAuth';
import TaskCard from './TaskCard';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable Task Item Component
const SortableTaskItem = ({ task, index, onRemove, onUpdate, members, projects, requesters }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id.toString() });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center">
        <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
          {index + 1}
        </div>
      </div>

      <div className="ml-14 relative">
        <div
          {...attributes}
          {...listeners}
          className="absolute left-0 top-0 bottom-0 w-8 cursor-grab active:cursor-grabbing flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <div className="flex flex-col gap-1">
            <div className="w-1 h-1 bg-current rounded-full"></div>
            <div className="w-1 h-1 bg-current rounded-full"></div>
            <div className="w-1 h-1 bg-current rounded-full"></div>
            <div className="w-1 h-1 bg-current rounded-full"></div>
            <div className="w-1 h-1 bg-current rounded-full"></div>
            <div className="w-1 h-1 bg-current rounded-full"></div>
          </div>
        </div>

        <div className="pl-10">
          <TaskCard
            task={task}
            onToggleStatus={(taskId) => {
              // Reload queue after status change
              onUpdate(taskId, { status: !task.status });
            }}
            onDelete={(taskId) => {
              // Remove from queue when deleted
              onRemove(taskId);
            }}
            onUpdate={onUpdate}
            onRemoveFromQueue={onRemove}
            members={members}
            projects={projects}
            requesters={requesters}
          />
        </div>
      </div>
    </div>
  );
};

// Main Queue View Component
const MyQueueView = ({ taskList, tasks, members, projects, requesters, onTaskUpdate }) => {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const { user } = useAuth();
  const api = new ApiService();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadQueue();
  }, []);

  // Refresh queue when tasks are updated or deleted (via props)
  useEffect(() => {
    // Reload queue whenever the parent tasks array changes
    // This ensures queue stays in sync with task updates/deletions
    if (queue.length > 0 && tasks.length > 0) {
      const queueNeedsUpdate = queue.some(qTask => {
        const updatedTask = tasks.find(t => t.id === qTask.id);
        return !updatedTask; // Task was deleted
      });

      if (queueNeedsUpdate) {
        loadQueue();
      }
    }
  }, [tasks.length]); // Only trigger on task count changes to avoid infinite loops

  const loadQueue = async () => {
    try {
      setLoading(true);
      const queueData = await api.getQueue(user.id);
      setQueue(queueData);
    } catch (err) {
      console.error('Failed to load queue:', err);
      setError('Failed to load queue');
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = queue.findIndex((task) => task.id.toString() === active.id);
      const newIndex = queue.findIndex((task) => task.id.toString() === over.id);

      const newQueue = arrayMove(queue, oldIndex, newIndex);
      setQueue(newQueue);

      try {
        // Update positions on the server
        const taskOrders = newQueue.map((task, index) => ({
          taskId: task.id,
          position: index + 1,
        }));

        await api.reorderQueue(user.id, taskOrders);
      } catch (err) {
        console.error('Failed to reorder queue:', err);
        setError('Failed to save new order');
        // Revert on error
        loadQueue();
      }
    }
  };

  const handleAddToQueue = async (taskId) => {
    try {
      await api.addToQueue(user.id, taskId);
      await loadQueue();
      setShowAddModal(false);
    } catch (err) {
      console.error('Failed to add to queue:', err);
      setError('Failed to add task to queue');
    }
  };

  const handleRemoveFromQueue = async (taskId) => {
    try {
      await api.removeFromQueue(user.id, taskId);
      await loadQueue();
    } catch (err) {
      console.error('Failed to remove from queue:', err);
      setError('Failed to remove task from queue');
    }
  };

  // Filter out tasks that are already in the queue
  const availableTasks = tasks.filter(
    task => !queue.some(queueTask => queueTask.id === task.id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
            My Work Queue ({queue.length})
          </h3>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Task
        </button>
      </div>

      {queue.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <ListOrdered className="w-8 h-8 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
            Your queue is empty
          </h3>
          <p className="text-gray-500 dark:text-gray-500 mb-4">
            Add tasks to organize what you'll work on next
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add Your First Task
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={queue.map(task => task.id.toString())}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {queue.map((task, index) => (
                  <SortableTaskItem
                    key={task.id}
                    task={task}
                    index={index}
                    onRemove={handleRemoveFromQueue}
                    onUpdate={onTaskUpdate}
                    members={members}
                    projects={projects}
                    requesters={requesters}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                Add Task to Queue
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {availableTasks.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 dark:text-gray-400">
                  All tasks are already in your queue
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {availableTasks.map(task => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 dark:text-white">
                        {task.name}
                      </h4>
                      {task.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {task.priority && (
                          <span className={`px-2 py-0.5 rounded ${
                            task.priority === 'urgent' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' :
                            task.priority === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300' :
                            task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300' :
                            'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                          }`}>
                            {task.priority}
                          </span>
                        )}
                        {task.project_name && (
                          <span className="text-gray-600 dark:text-gray-400">
                            {task.project_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddToQueue(task.id)}
                      className="ml-4 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MyQueueView;
