# Task Sphere

Task Sphere is a simple yet powerful application that helps you keep track of tasks and their completion status. Built with Python's Tkinter library and SQLite, it offers a user-friendly GUI to add, delete, and mark tasks as done or undone. Moreover, Task Sphere allows assigning tasks to specific days and provides a comprehensive view of your weekly schedule.

## Features

- **Task Management:** Add, delete, and update the status of your tasks with ease.
- **Filtering Options:** View tasks by requester using a drop-down menu to filter the list.
- **Daily Assignment:** Assign tasks to specific days to organize your week.
- **Day Views:** Open separate windows to view tasks scheduled for each day.
- **Persistent Storage:** Uses SQLite database to store tasks persistently.
  
## Installation

To get started with Task Sphere, follow these simple steps:

1. Ensure you have Python installed on your machine.
2. Clone the repository to your local machine:
   ```bash
   git clone https://github.com/Fynn9563/Task-Sphere.git
   ```
3. Before running the application, you need to install the dependencies listed in `requirements.txt`. This can be done easily using `pip`:
   ```bash
   pip install -r requirements.txt
   ```
4. Navigate to the cloned directory and run the main script:
   ```bash
   Task Sphere.pyw
   ```
      
## Usage

After launching the application, you will be greeted with a straightforward interface.

1. **Adding a Task:**
   - Enter the requester's name and task description.
   - Click the "Add Task" button.

2. **Marking a Task as Done/Undone:**
   - Select a task from the list.
   - Click "Mark as Done" or "Mark as Undone" as appropriate.

3. **Deleting a Task:**
   - Select the task you wish to remove.
   - Click the "Delete Task" button.

4. **Assigning a Day to a Task:**
   - Select a task.
   - Choose a day from the drop-down menu.
   - Click the "Assign Day" button.

5. **Viewing Daily Task Schedule:**
   - Click the "View Daily Task Schedule" to open a new window with tasks organized by their assigned days.

## Contributing

Contributions to improve Task Tracker are welcome. Feel free to fork the repository and submit pull requests.

## License

Task Tracker is released under the MIT License. See the [LICENSE](https://github.com/Fynn9563/Task-Sphere/blob/master/LICENSE) file for more details.
