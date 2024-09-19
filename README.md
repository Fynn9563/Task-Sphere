# Task Sphere

Task Sphere is a simple yet powerful application that helps you keep track of tasks and their completion status. Built with Python's Tkinter library and SQLite, it offers a user-friendly GUI to add, delete, and mark tasks as done ✅ or not done ❌. Moreover, Task Sphere allows assigning tasks to specific days and provides a comprehensive view of your weekly schedule.

## Features

- **Task Management:** Add, delete, and update the status of your tasks with ease.
- **Filtering Options:** View tasks by requester using a drop-down menu to filter the list.
- **Daily Assignment:** Assign tasks to specific days to organize your week.
- **Day Views:** Open separate windows to view tasks scheduled for each day.
- **Persistent Storage:** Uses SQLite database to store tasks persistently.
  
Here's a detailed guide for someone who may not be familiar with using the Command Prompt or Terminal:

## Installation

Setting up Task Sphere requires a few simple steps. Even if you're new to using the Command Prompt (Windows) or Terminal (macOS/Linux), these instructions will guide you through the process.

### Prerequisites
Before you begin, ensure that:
- You have Python installed on your computer. You can check this by opening the Command Prompt or Terminal and typing `python --version`. If it shows a version number, Python is installed.
- Git is also necessary to obtain the application files. If you haven't installed Git, download it from [git-scm.com](https://git-scm.com/downloads) and follow the instructions on the site to install it.

### Step 1: Download the Application Source Code
1. **Open Command Prompt or Terminal:**
   - Press `Win + R`, type `cmd`, and press `Enter`.
   
2. **Navigate to Your Preferred Directory:**
   - Use the `cd` (change directory) command to move to the folder where you want to download Task Sphere.
   - Example: If you want to download it to a folder named `MyApplications` on your Desktop, type `cd Desktop/MyApplications` and press `Enter`.

3. **Clone the Repository:**
   - Once in your chosen directory, type the following command and press `Enter`:
     ```
     git clone https://github.com/Fynn9563/Task-Sphere.git
     ```
   - This command will create a copy of Task Sphere in a new folder named `Task-Sphere` inside your current directory.

### Step 2: Install the Application Dependencies
1. **Open the Cloned Folder:**
   - After the cloning process is complete, you need to access the `Task-Sphere` folder. If you're not familiar with using commands to navigate folders, you can do this step using your file explorer.
   - Locate the `Task-Sphere` folder where you performed the clone and open it.

2. **Run the Install Script:**
   - Inside the `Task-Sphere` folder, find a file called `Install.bat`.
   - Double-click `Install.bat`. This will initiate the installation of any Python packages needed and create a shortcut on your desktop.

### Step 3: Launch Task Sphere
1. **Find the Shortcut:**
   - After running the install script, go to your desktop and look for a new icon labeled 'Task Sphere'.
   
2. **Start the Application:**
   - Double-click the 'Task Sphere.lnk' shortcut to launch the application.
   - Task Sphere will open, and you can begin organizing your tasks.

### Troubleshooting
- If Python or Git commands don't work, they may not be installed correctly, or their system path may not be set up. Revisit the installation instructions for those programs.
- Make sure you're typing commands exactly as shown, with no extra spaces or characters.
- If the application doesn't start after double-clicking the shortcut, try running the `Install.bat` file again, or manually navigate to the `Task-Sphere` folder and double-click the Python script to start the program.
      
## Usage

After launching the application, you will be greeted with a straightforward interface.

1. **Adding a Task:**
   - Enter the requester's name and task description.
   - Click the "Add Task" button.

2. **Marking a Task as Done/Undone:**
   - Select a task from the list.
   - Click "Mark as Done" or "Mark as Not Done" as appropriate.

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
