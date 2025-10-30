import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Bell, X, Plus, Trash2, Loader } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { PREDEFINED_REMINDERS, TIME_UNITS } from '../../constants/reminders';
import { calculateReminderDatetime, formatDatetime, validateReminderInFuture } from '../../utils/dateUtils';

const ReminderManager = ({ taskId, dueDate, onClose }) => {
  const { api } = useAuth();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('predefined');
  const [selectedPredefined, setSelectedPredefined] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [customUnit, setCustomUnit] = useState('days');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (!dueDate) {
      setLoading(false);
      return;
    }
    loadReminders();
  }, [taskId]);

  const loadReminders = async () => {
    try {
      setLoading(true);
      const data = await api.getTaskReminders(taskId);
      setReminders(data);
    } catch (err) {
      setError(err.message || 'Failed to load reminders');
    } finally {
      setLoading(false);
    }
  };

  const handleAddReminder = async () => {
    try {
      setError('');
      setSuccessMessage('');

      let reminderData;

      if (mode === 'predefined') {
        if (!selectedPredefined) {
          setError('Please select a reminder time');
          return;
        }

        const selected = PREDEFINED_REMINDERS.find(r => r.label === selectedPredefined);
        reminderData = {
          reminderType: 'predefined',
          timeValue: selected.value,
          timeUnit: selected.unit
        };
      } else {
        const value = parseInt(customValue);

        if (!customValue || isNaN(value) || value < 1) {
          setError('Please enter a valid time value (minimum 1)');
          return;
        }

        reminderData = {
          reminderType: 'custom',
          timeValue: value,
          timeUnit: customUnit
        };
      }

      const reminderDatetime = calculateReminderDatetime(dueDate, reminderData.timeValue, reminderData.timeUnit);

      if (!validateReminderInFuture(reminderDatetime)) {
        setError('Reminder time cannot be in the past');
        return;
      }

      await api.createTaskReminders(taskId, [reminderData]);

      setSuccessMessage('Reminder added successfully');
      setSelectedPredefined('');
      setCustomValue('');

      await loadReminders();

      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to add reminder');
    }
  };

  const handleDeleteReminder = async (reminderId) => {
    try {
      setError('');
      await api.deleteTaskReminder(taskId, reminderId);
      await loadReminders();
      setSuccessMessage('Reminder deleted');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to delete reminder');
    }
  };

  if (!dueDate) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Manage Reminders
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
            <p className="text-yellow-800 dark:text-yellow-300 text-sm">
              Set a start date to enable reminders
            </p>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Manage Reminders
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 mb-4">
            <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-3 mb-4">
            <p className="text-green-700 dark:text-green-300 text-sm">{successMessage}</p>
          </div>
        )}

        <div className="mb-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Due: <span className="font-medium text-gray-800 dark:text-white">{formatDatetime(dueDate)}</span>
          </p>
        </div>

        <div className="mb-6">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMode('predefined')}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                mode === 'predefined'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Pre-defined
            </button>
            <button
              onClick={() => setMode('custom')}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                mode === 'custom'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Custom
            </button>
          </div>

          {mode === 'predefined' ? (
            <div className="flex gap-2">
              <select
                value={selectedPredefined}
                onChange={(e) => setSelectedPredefined(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select reminder time...</option>
                {PREDEFINED_REMINDERS.map(reminder => (
                  <option key={reminder.label} value={reminder.label}>
                    {reminder.label}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddReminder}
                disabled={!selectedPredefined}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder="Value"
                className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <select
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {TIME_UNITS.map(unit => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddReminder}
                disabled={!customValue}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          )}

          {mode === 'custom' && customValue && customUnit && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Reminder will fire at: {formatDatetime(calculateReminderDatetime(dueDate, parseInt(customValue), customUnit))}
            </p>
          )}
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Active Reminders ({reminders.length})
          </h4>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : reminders.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <Bell className="w-12 h-12 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">No reminders set</p>
            </div>
          ) : (
            <div className="space-y-2">
              {reminders.map(reminder => (
                <div
                  key={reminder.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-white">
                      {reminder.time_value} {reminder.time_unit} before
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDatetime(reminder.reminder_datetime)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteReminder(reminder.id)}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Delete reminder"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

ReminderManager.propTypes = {
  taskId: PropTypes.number.isRequired,
  dueDate: PropTypes.string,
  onClose: PropTypes.func.isRequired
};

export default ReminderManager;
