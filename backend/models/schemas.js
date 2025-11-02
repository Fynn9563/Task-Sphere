const Joi = require('joi');

/**
 * Validation schemas for request bodies
 */
const schemas = {
  task: Joi.object({
    name: Joi.string().min(1).max(500).optional().messages({
      'string.empty': 'Task name is required',
      'string.max': 'Task name must be less than 500 characters',
      'any.required': 'Task name is required'
    }),
    description: Joi.string().max(2000).allow(null, '').messages({
      'string.max': 'Description must be less than 2000 characters'
    }),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').messages({
      'any.only': 'Priority must be one of: low, medium, high, urgent'
    }),
    projectId: Joi.number().integer().allow(null),
    requesterId: Joi.number().integer().allow(null),
    assignedTo: Joi.alternatives().try(Joi.number().integer(), Joi.string()).allow(null),
    dueDate: Joi.string().isoDate().allow(null).messages({
      'date.format': 'Please enter a valid date and time'
    }),
    estimatedHours: Joi.number().min(0).max(999.99).allow(null).messages({
      'number.min': 'Estimated hours cannot be negative',
      'number.max': 'Estimated hours cannot exceed 999.99'
    }),
    estimated_hours: Joi.number().min(0).max(999.99).allow(null).messages({
      'number.min': 'Estimated hours cannot be negative',
      'number.max': 'Estimated hours cannot exceed 999.99'
    }),
    dayAssigned: Joi.string().allow(null),
    status: Joi.boolean()
  }),

  taskList: Joi.object({
    name: Joi.string().min(1).max(200).required().messages({
      'string.empty': 'Task list name is required',
      'string.max': 'Task list name must be less than 200 characters',
      'any.required': 'Task list name is required'
    }),
    description: Joi.string().max(1000).allow(null, '').messages({
      'string.max': 'Description must be less than 1000 characters'
    })
  }),

  reminder: Joi.object({
    reminderType: Joi.string().valid('predefined', 'custom').required().messages({
      'any.only': 'Reminder type must be either predefined or custom',
      'any.required': 'Reminder type is required'
    }),
    timeValue: Joi.number().integer().min(1).required().messages({
      'number.base': 'Time value must be a number',
      'number.min': 'Time value must be at least 1',
      'any.required': 'Time value is required'
    }),
    timeUnit: Joi.string().valid('minutes', 'hours', 'days', 'weeks').required().messages({
      'any.only': 'Time unit must be one of: minutes, hours, days, weeks',
      'any.required': 'Time unit is required'
    })
  })
};

module.exports = {
  schemas
};
