export const calculateReminderDatetime = (dueDate, timeValue, timeUnit) => {
  const due = new Date(dueDate);
  const reminder = new Date(due);

  switch (timeUnit) {
    case 'minutes':
      reminder.setMinutes(reminder.getMinutes() - timeValue);
      break;
    case 'hours':
      reminder.setHours(reminder.getHours() - timeValue);
      break;
    case 'days':
      reminder.setDate(reminder.getDate() - timeValue);
      break;
    case 'weeks':
      reminder.setDate(reminder.getDate() - (timeValue * 7));
      break;
    default:
      throw new Error(`Invalid time unit: ${timeUnit}`);
  }

  return reminder;
};

export const formatDatetime = (datetime) => {
  if (!datetime) return '';

  const date = new Date(datetime);

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

export const getTimeUntilDue = (dueDate) => {
  if (!dueDate) return '';

  const now = new Date();
  const due = new Date(dueDate);
  const diffMs = due - now;

  if (diffMs < 0) return 'overdue';

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMinutes < 60) return `in ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
  if (diffHours < 24) return `in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
  if (diffDays < 7) return `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
  return `in ${diffWeeks} week${diffWeeks !== 1 ? 's' : ''}`;
};

export const validateReminderInFuture = (reminderDatetime) => {
  const now = new Date();
  const reminder = new Date(reminderDatetime);
  return reminder > now;
};

export const formatDateForInput = (datetime) => {
  if (!datetime) return '';

  const date = new Date(datetime);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
};
