import { forwardRef } from 'react';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// Convert decimal hours to Date object (for today's date with the specified time)
const hoursToDate = (hours) => {
  if (!hours) return null;

  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date;
};

// Convert Date object to decimal hours
const dateToHours = (date) => {
  if (!date) return null;

  const hours = date.getHours();
  const minutes = date.getMinutes();

  return hours + (minutes / 60);
};

const TimePicker = forwardRef(({ value, onChange, placeholder, disabled, className }, ref) => {
  const handleChange = (date) => {
    if (onChange) {
      // Convert Date object to decimal hours
      onChange(dateToHours(date));
    }
  };

  // Convert decimal hours to Date object for the picker
  const dateValue = hoursToDate(value);

  return (
    <ReactDatePicker
      ref={ref}
      selected={dateValue}
      onChange={handleChange}
      showTimeSelect
      showTimeSelectOnly
      timeFormat="HH:mm"
      timeIntervals={15}
      dateFormat="HH:mm"
      placeholderText={placeholder || 'Select duration'}
      disabled={disabled}
      className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed ${className || ''}`}
      calendarClassName="dark:bg-gray-800 dark:border-gray-700"
      wrapperClassName="w-full"
      popperClassName="react-datepicker-popper-dark"
      timeCaption="Duration"
    />
  );
});

TimePicker.displayName = 'TimePicker';

export default TimePicker;
