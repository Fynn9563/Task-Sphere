import { forwardRef } from 'react';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const DateTimePicker = forwardRef(({ value, onChange, placeholder, disabled, className }, ref) => {
  const handleChange = (date) => {
    if (onChange) {
      // Convert Date object to ISO string for consistency with the rest of the app
      onChange(date ? date.toISOString() : '');
    }
  };

  // Convert ISO string to Date object for the datepicker
  const dateValue = value ? new Date(value) : null;

  return (
    <ReactDatePicker
      ref={ref}
      selected={dateValue}
      onChange={handleChange}
      showTimeSelect
      timeFormat="h:mm aa"
      timeIntervals={15}
      dateFormat="MMM d, yyyy h:mm aa"
      placeholderText={placeholder || 'Select date and time'}
      disabled={disabled}
      className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed ${className || ''}`}
      calendarClassName="dark:bg-gray-800 dark:border-gray-700"
      wrapperClassName="w-full"
      popperClassName="react-datepicker-popper-dark"
      timeCaption="Time"
    />
  );
});

DateTimePicker.displayName = 'DateTimePicker';

export default DateTimePicker;
