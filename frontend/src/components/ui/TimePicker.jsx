import { forwardRef } from 'react';

// Generate duration options
const generateDurationOptions = () => {
  const options = [];

  // 15 min, 30 min, 45 min
  options.push({ value: 0.25, label: '15 min' });
  options.push({ value: 0.5, label: '30 min' });
  options.push({ value: 0.75, label: '45 min' });

  // 1 hour to 8 hours (every hour)
  for (let i = 1; i <= 8; i++) {
    options.push({ value: i, label: `${i} hr` });
  }

  // 1.5 to 7.5 hours (every 30 min)
  for (let i = 1.5; i <= 7.5; i += 1) {
    options.push({ value: i, label: `${Math.floor(i)} hr 30 min` });
  }

  // 10, 12, 16, 20, 24, 32, 40 hours
  [10, 12, 16, 20, 24, 32, 40].forEach(h => {
    options.push({ value: h, label: `${h} hr` });
  });

  // Sort by value
  options.sort((a, b) => a.value - b.value);

  return options;
};

const TimePicker = forwardRef(({ value, onChange, placeholder, disabled, className }, ref) => {
  const options = generateDurationOptions();

  const handleChange = (e) => {
    const selectedValue = e.target.value === '' ? null : parseFloat(e.target.value);
    if (onChange) {
      onChange(selectedValue);
    }
  };

  return (
    <select
      ref={ref}
      value={value || ''}
      onChange={handleChange}
      disabled={disabled}
      className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed ${className || ''}`}
    >
      <option value="">{placeholder || 'Select duration'}</option>
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
});

TimePicker.displayName = 'TimePicker';

export default TimePicker;
