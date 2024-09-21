import tkinter as tk
from tkinter import messagebox, ttk, simpledialog
import tkinter.font as tkFont
import sqlite3

class TaskDatabase:
    """
    Handles all database operations related to tasks, projects, and requesters.
    """
    def __init__(self, db_path):
        self.db_path = db_path
        self.setup_database()

    def setup_database(self):
        """
        Sets up the database schema and performs data migration.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()

            # Enable foreign key constraints
            cursor.execute("PRAGMA foreign_keys = ON;")

            # Create requesters table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS requesters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE
                )
            ''')

            # Ensure default requester exists
            default_requester_name = 'Default Requester'
            cursor.execute("INSERT OR IGNORE INTO requesters (name) VALUES (?)", (default_requester_name,))
            cursor.execute("SELECT id FROM requesters WHERE name = ?", (default_requester_name,))
            default_requester_id = cursor.fetchone()[0]

            # Create projects table without requester_id
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_name TEXT NOT NULL UNIQUE
                )
            ''')

            # Ensure default project exists
            default_project_name = 'Default Project'
            cursor.execute("INSERT OR IGNORE INTO projects (project_name) VALUES (?)",
                           (default_project_name,))
            cursor.execute("SELECT id FROM projects WHERE project_name = ?",
                           (default_project_name,))
            default_project_id = cursor.fetchone()[0]

            # Create tasks table with requester_id and project_id
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_name TEXT NOT NULL,
                    status BOOLEAN NOT NULL DEFAULT 0,
                    day_assigned TEXT,
                    project_id INTEGER,
                    requester_id INTEGER,
                    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL,
                    FOREIGN KEY(requester_id) REFERENCES requesters(id) ON DELETE SET NULL
                )
            ''')

            # Check if 'requester_id' column exists in 'tasks' table
            cursor.execute("PRAGMA table_info(tasks)")
            columns = [info[1] for info in cursor.fetchall()]

            if 'requester_id' not in columns:
                cursor.execute("ALTER TABLE tasks ADD COLUMN requester_id INTEGER")
                # Assign default requester to existing tasks where requester_id is NULL
                cursor.execute("UPDATE tasks SET requester_id = ? WHERE requester_id IS NULL", (default_requester_id,))

            conn.commit()

    def add_requester(self, requester_name):
        requester_name = requester_name.strip()
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO requesters (name) VALUES (?)",
                (requester_name,)
            )
            conn.commit()

    def get_all_requesters(self):
        """
        Retrieves all requesters.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name FROM requesters ORDER BY name")
            return cursor.fetchall()

    def add_project(self, project_name):
        """
        Adds a new project.
        """
        project_name = project_name.strip()  # Strip whitespace
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO projects (project_name) VALUES (?)",
                (project_name,)
            )
            conn.commit()

    def get_all_projects(self):
        """
        Retrieves all projects.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, project_name FROM projects ORDER BY project_name")
            return cursor.fetchall()

    def add_task(self, task_name, requester_id=None, project_id=None):
        """
        Adds a new task to the database.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO tasks (task_name, status, requester_id, project_id) VALUES (?, ?, ?, ?)",
                (task_name, False, requester_id, project_id)
            )
            conn.commit()

    def get_tasks(self, requester_id=None, project_id=None, search_keyword=None, filter_status=None, only_assigned=False):
        """
        Retrieves tasks, optionally filtered by requester, project, search keyword, status, and assignment.
        """
        query = '''
            SELECT tasks.id, 
                   requesters.name as requester_name,
                   projects.project_name, 
                   tasks.task_name, 
                   tasks.status, 
                   tasks.day_assigned
            FROM tasks
            LEFT JOIN projects ON tasks.project_id = projects.id
            LEFT JOIN requesters ON tasks.requester_id = requesters.id
        '''
        conditions = []
        parameters = []

        if requester_id and requester_id != "All":
            conditions.append("requesters.id = ?")
            parameters.append(requester_id)

        if project_id and project_id != "All":
            conditions.append("projects.id = ?")
            parameters.append(project_id)

        if search_keyword:
            conditions.append("(tasks.task_name LIKE ?)")
            parameters.append(f"%{search_keyword}%")

        if filter_status is not None:
            conditions.append("tasks.status = ?")
            parameters.append(filter_status)

        if only_assigned:
            conditions.append("tasks.day_assigned IS NOT NULL")

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY requesters.name, projects.project_name, tasks.task_name"

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(query, tuple(parameters))
            results = cursor.fetchall()
            return results

    def delete_task(self, task_id):
        """
        Deletes a task by its ID.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            conn.commit()

    def update_task_status(self, task_id, status):
        """
        Updates the status of a task.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE tasks SET status = ? WHERE id = ?", (status, task_id))
            conn.commit()

    def assign_day_to_task(self, task_id, day):
        """
        Assigns a day to a task.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE tasks SET day_assigned = ? WHERE id = ?", (day, task_id))
            conn.commit()

    def unassign_day_from_task(self, task_id):
        """
        Removes the day assignment from a task.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE tasks SET day_assigned = NULL WHERE id = ?", (task_id,))
            conn.commit()

    def get_task_by_id(self, task_id):
        """
        Retrieves a task by its ID.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT tasks.id, 
                       requesters.name as requester_name,
                       projects.project_name, 
                       tasks.task_name, 
                       tasks.status, 
                       tasks.day_assigned
                FROM tasks
                LEFT JOIN projects ON tasks.project_id = projects.id
                LEFT JOIN requesters ON tasks.requester_id = requesters.id
                WHERE tasks.id = ?
            ''', (task_id,))
            return cursor.fetchone()

    def update_task(self, task_id, new_task_name, requester_id, project_id):
        """
        Updates the task name, requester, and project of a task.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE tasks SET task_name = ?, requester_id = ?, project_id = ? WHERE id = ?",
                (new_task_name, requester_id, project_id, task_id)
            )
            conn.commit()

    def has_tasks(self, project_id):
        """
        Checks if a project has any associated tasks.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM tasks WHERE project_id = ?", (project_id,))
            count = cursor.fetchone()[0]
            return count > 0

    def delete_project(self, project_id):
        """
        Deletes a project by its ID.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            conn.commit()

    def delete_tasks_by_project(self, project_id):
        """
        Deletes all tasks associated with a project.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM tasks WHERE project_id = ?", (project_id,))
            conn.commit()

    def has_projects(self):
        """
        Checks if there are any projects.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM projects")
            count = cursor.fetchone()[0]
            return count > 0

    def has_requesters(self):
        """
        Checks if there are any requesters.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM requesters")
            count = cursor.fetchone()[0]
            return count > 0

    def delete_requester(self, requester_id):
        """
        Deletes a requester by its ID.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM requesters WHERE id = ?", (requester_id,))
            conn.commit()

class TaskTracker(tk.Tk):
    """
    The main application window for the Task Tracker.
    """
    def __init__(self, db):
        super().__init__()
        self.db = db
        self.customFont = tkFont.Font(family="Helvetica", size=12)
        self.customHeadingsFont = tkFont.Font(family="Helvetica", size=12, weight="bold")
        
        self.title("Task Sphere")
        self.geometry("1400x700")
        self.resizable(True, True)
        self.style = ttk.Style(self)
        self.style.theme_use('clam')

        self.day_windows = {}  # Mapping from window to day_trees

        self.create_widgets()
        self.refresh_requester_dropdown()
        self.refresh_project_dropdown()
        self.refresh_project_filter()
        self.refresh_requester_filter()
        self.load_tasks()

        # Bind the window close event
        self.protocol("WM_DELETE_WINDOW", self.on_closing)

    def create_widgets(self):
        """
        Creates and places all widgets in the main window.
        """
        # Top Frame for Input and Search
        top_frame = ttk.Frame(self)
        top_frame.pack(side='top', fill='x', padx=10, pady=10)

        # Requester Label and Combobox
        requester_label = ttk.Label(top_frame, text="Requester:", font=self.customHeadingsFont)
        requester_label.grid(row=0, column=0, sticky='w', padx=(0,5))

        self.requester_entry = ttk.Combobox(top_frame, state="readonly")
        self.requester_entry.grid(row=0, column=1, sticky='w', padx=(0,5))
        self.requester_entry.bind('<<ComboboxSelected>>', self.filter_tasks)

        # Add Requester Button
        add_requester_button = ttk.Button(top_frame, text="Add Requester", command=self.add_requester)
        add_requester_button.grid(row=0, column=2, sticky='w', padx=(0,10))

        # Delete Requester Button
        delete_requester_button = ttk.Button(top_frame, text="Delete Requester", command=self.delete_requester)
        delete_requester_button.grid(row=0, column=3, sticky='w', padx=(0,10))

        # Project Label and Combobox
        project_label = ttk.Label(top_frame, text="Project:", font=self.customHeadingsFont)
        project_label.grid(row=0, column=4, sticky='w', padx=(10,5))

        self.project_entry = ttk.Combobox(top_frame, state="readonly")
        self.project_entry.grid(row=0, column=5, sticky='w', padx=(0,5))

        # Add Project Button
        add_project_button = ttk.Button(top_frame, text="Add Project", command=self.add_project)
        add_project_button.grid(row=0, column=6, sticky='w', padx=(0,10))

        # Delete Project Button
        delete_project_button = ttk.Button(top_frame, text="Delete Project", command=self.delete_project)
        delete_project_button.grid(row=0, column=7, sticky='w', padx=(0,10))

        # Task Name Label and Entry
        task_name_label = ttk.Label(top_frame, text="Task Name:", font=self.customHeadingsFont)
        task_name_label.grid(row=0, column=8, sticky='w', padx=(10,5))

        self.task_name_entry = ttk.Entry(top_frame, width=30)
        self.task_name_entry.grid(row=0, column=9, sticky='w', padx=(0,5))

        # Add Task Button
        add_task_button = ttk.Button(top_frame, text="Add Task", command=self.add_task)
        add_task_button.grid(row=0, column=10, sticky='w')

        # Search and Filters Frame
        search_frame = ttk.Frame(self)
        search_frame.pack(side='top', fill='x', padx=10, pady=5)

        # Search Label and Entry
        search_label = ttk.Label(search_frame, text="Search:", font=self.customHeadingsFont)
        search_label.grid(row=0, column=0, sticky='w', padx=(0,5))

        self.search_entry = ttk.Entry(search_frame)
        self.search_entry.grid(row=0, column=1, sticky='w', padx=(0,15))
        self.search_entry.bind('<KeyRelease>', self.filter_tasks)

        # Requester Filter Label and Combobox
        requester_filter_label = ttk.Label(search_frame, text="Requester:", font=self.customHeadingsFont)
        requester_filter_label.grid(row=0, column=2, sticky='w', padx=(0,5))

        self.requester_filter = ttk.Combobox(search_frame, state="readonly")
        self.requester_filter.grid(row=0, column=3, sticky='w', padx=(0,15))
        self.requester_filter.bind('<<ComboboxSelected>>', self.filter_tasks)

        # Project Filter Label and Combobox
        project_filter_label = ttk.Label(search_frame, text="Project:", font=self.customHeadingsFont)
        project_filter_label.grid(row=0, column=4, sticky='w', padx=(0,5))

        self.project_filter = ttk.Combobox(search_frame, state="readonly")
        self.project_filter.grid(row=0, column=5, sticky='w', padx=(0,15))
        self.project_filter.bind('<<ComboboxSelected>>', self.filter_tasks)

        # Status Filter Label and Combobox
        status_filter_label = ttk.Label(search_frame, text="Status:", font=self.customHeadingsFont)
        status_filter_label.grid(row=0, column=6, sticky='w', padx=(0,5))

        self.status_filter = ttk.Combobox(search_frame, state="readonly", values=["All", "Done", "Not Done"])
        self.status_filter.set("All")
        self.status_filter.grid(row=0, column=7, sticky='w', padx=(0,15))
        self.status_filter.bind('<<ComboboxSelected>>', self.filter_tasks)

        # Only Assigned Checkbox
        self.only_assigned_var = tk.BooleanVar()
        only_assigned_checkbox = ttk.Checkbutton(search_frame, text="Only Assigned", variable=self.only_assigned_var, command=self.filter_tasks)
        only_assigned_checkbox.grid(row=0, column=8, sticky='w', padx=(0,15))

        # Reset Filters Button
        reset_filters_button = ttk.Button(search_frame, text="Reset Filters", command=self.reset_filters)
        reset_filters_button.grid(row=0, column=9, sticky='w')

        # Action Buttons Frame
        action_frame = ttk.Frame(self)
        action_frame.pack(side='top', fill='x', padx=10, pady=5)

        # Mark as Done Button
        self.mark_done_button = ttk.Button(action_frame, text="Mark as Done", command=lambda: self.mark_task_status(True))
        self.mark_done_button.grid(row=0, column=0, padx=5)
        self.mark_done_button.state(['disabled'])

        # Mark as Not Done Button
        self.mark_undone_button = ttk.Button(action_frame, text="Mark as Not Done", command=lambda: self.mark_task_status(False))
        self.mark_undone_button.grid(row=0, column=1, padx=5)
        self.mark_undone_button.state(['disabled'])

        # Delete Task Button
        self.delete_task_button = ttk.Button(action_frame, text="Delete Task", command=self.delete_task)
        self.delete_task_button.grid(row=0, column=2, padx=5)
        self.delete_task_button.state(['disabled'])

        # Edit Task Button
        self.edit_task_button = ttk.Button(action_frame, text="Edit Task", command=self.edit_task)
        self.edit_task_button.grid(row=0, column=3, padx=5)
        self.edit_task_button.state(['disabled'])

        # Assign Day Dropdown and Label
        day_label = ttk.Label(action_frame, text="Assign Day:", font=self.customHeadingsFont)
        day_label.grid(row=0, column=4, padx=(20,5))

        self.day_dropdown = ttk.Combobox(
            action_frame, 
            values=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], 
            state="readonly"
        )
        self.day_dropdown.grid(row=0, column=5, padx=(0,15))

        # Assign Day Button
        assign_day_button = ttk.Button(action_frame, text="Assign Day", command=self.assign_day_to_task)
        assign_day_button.grid(row=0, column=6, padx=5)

        # Unassign Day Button
        unassign_day_button = ttk.Button(action_frame, text="Unassign Day", command=self.unassign_day_from_task)
        unassign_day_button.grid(row=0, column=7, padx=5)

        # View Daily Task Schedule Button
        view_days_button = ttk.Button(action_frame, text="View Daily Task Schedule",
                                      command=self.view_tasks_by_day)
        view_days_button.grid(row=0, column=8, padx=(20,5))

        # Main Frame for Treeview
        main_frame = ttk.Frame(self)
        main_frame.pack(fill='both', expand=True, padx=10, pady=10)

        # Scrollbars for Treeview
        self.tree_scroll_y = ttk.Scrollbar(main_frame, orient="vertical")
        self.tree_scroll_y.pack(side='right', fill='y')

        self.tree_scroll_x = ttk.Scrollbar(main_frame, orient="horizontal")
        self.tree_scroll_x.pack(side='bottom', fill='x')

        # Treeview for displaying tasks
        self.tree = ttk.Treeview(
            main_frame, 
            columns=("ID", "Requester", "Project", "Task Name", "Status", "Day Assigned"),
            show='headings', 
            yscrollcommand=self.tree_scroll_y.set,
            xscrollcommand=self.tree_scroll_x.set
        )
        self.tree.pack(fill='both', expand=True)

        self.tree_scroll_y.config(command=self.tree.yview)
        self.tree_scroll_x.config(command=self.tree.xview)

        # Define columns
        self.tree.heading("ID", text="ID", command=lambda: self.sort_tree("ID", False))
        self.tree.heading("Requester", text="Requester", command=lambda: self.sort_tree("Requester", False))
        self.tree.heading("Project", text="Project", command=lambda: self.sort_tree("Project", False))
        self.tree.heading("Task Name", text="Task Name", command=lambda: self.sort_tree("Task Name", False))
        self.tree.heading("Status", text="Status", command=lambda: self.sort_tree("Status", False))
        self.tree.heading("Day Assigned", text="Day Assigned", command=lambda: self.sort_tree("Day Assigned", False))

        # Define column widths
        self.tree.column("ID", width=50, anchor='center')
        self.tree.column("Requester", width=150, anchor='w')
        self.tree.column("Project", width=150, anchor='w')
        self.tree.column("Task Name", width=300, anchor='w')
        self.tree.column("Status", width=100, anchor='center')
        self.tree.column("Day Assigned", width=100, anchor='center')

        # Bind selection event
        self.tree.bind('<<TreeviewSelect>>', self.on_tree_select)

        # Style for Treeview
        self.style.configure("Treeview.Heading", font=('Helvetica', 12, 'bold'))
        self.style.configure("Treeview", font=('Helvetica', 12))

    def on_tree_select(self, event):
        """
        Handles actions when a task is selected in the Treeview.
        """
        selected_items = self.tree.selection()
        if selected_items:
            # Enable buttons that require a selection
            self.mark_done_button.state(['!disabled'])
            self.mark_undone_button.state(['!disabled'])
            self.delete_task_button.state(['!disabled'])
            self.edit_task_button.state(['!disabled'])
        else:
            # Disable buttons when no selection
            self.mark_done_button.state(['disabled'])
            self.mark_undone_button.state(['disabled'])
            self.delete_task_button.state(['disabled'])
            self.edit_task_button.state(['disabled'])

    def refresh_requester_dropdown(self):
        """
        Refreshes the requester dropdown with current requesters.
        """
        requesters = self.db.get_all_requesters()
        self.requester_entry['values'] = [name for (id, name) in requesters]
        if requesters:
            self.requester_entry.set(requesters[0][1])
        else:
            self.requester_entry.set("")

    def refresh_project_dropdown(self):
        """
        Refreshes the project dropdown with all projects.
        """
        projects = self.db.get_all_projects()
        self.project_entry['values'] = [name for (id, name) in projects]
        if projects:
            self.project_entry.set(projects[0][1])
        else:
            self.project_entry.set("")

    def refresh_project_filter(self, event=None):
        """
        Refreshes the project filter dropdown to display all projects.
        """
        projects = self.db.get_all_projects()
        project_names = [project[1].strip() for project in projects]  # Strip project names
        self.project_filter['values'] = ["All"] + project_names
        self.project_filter.set("All")
        self.filter_tasks()

    def refresh_requester_filter(self):
        """
        Refreshes the requester filter dropdown with current requesters.
        """
        requesters = [("All", "All")] + self.db.get_all_requesters()
        self.requester_filter['values'] = [name for (id, name) in requesters]
        self.requester_filter.set("All")

    def add_project(self):
        """
        Opens a dialog to add a new project.
        """
        project_name = simpledialog.askstring("Add Project", "Enter new project name:")
        if project_name:
            existing_projects = self.db.get_all_projects()
            project_names = [name for (id, name) in existing_projects]
            if project_name.strip() in project_names:
                messagebox.showwarning("Duplicate Project", "This project already exists.")
                return
            self.db.add_project(project_name.strip())
            self.refresh_project_dropdown()
            self.refresh_project_filter()
            self.load_tasks()
            messagebox.showinfo("Success", "Project added successfully.")

    def delete_project(self):
        """
        Deletes the selected project after confirmation.
        """
        project_name = self.project_entry.get().strip()

        if not project_name:
            messagebox.showwarning("Selection Error", "Please select a project to delete.")
            return

        # Get project_id
        projects = self.db.get_all_projects()
        project_dict = {name.strip(): id for (id, name) in projects}
        project_id = project_dict.get(project_name)

        if not project_id:
            messagebox.showerror("Error", "Project not found.")
            return

        # Check if the project has associated tasks
        if self.db.has_tasks(project_id):
            messagebox.showwarning(
                "Cannot Delete",
                "This project has associated tasks. Please delete or reassign them before deleting the project."
            )
            return

        # Confirm deletion
        confirm = messagebox.askyesno("Confirm Deletion", f"Are you sure you want to delete the project '{project_name}'?")
        if not confirm:
            return

        # Delete the project
        self.db.delete_project(project_id)

        # Refresh the UI
        self.refresh_project_dropdown()
        self.refresh_project_filter()
        self.load_tasks()
        messagebox.showinfo("Success", f"Project '{project_name}' has been deleted.")

    def delete_requester(self):
        """
        Deletes the selected requester after confirmation.
        """
        requester_name = self.requester_entry.get().strip()

        if not requester_name:
            messagebox.showwarning("Selection Error", "Please select a requester to delete.")
            return

        # Get requester_id
        requesters = self.db.get_all_requesters()
        requester_dict = {name.strip(): id for (id, name) in requesters}
        requester_id = requester_dict.get(requester_name)

        if not requester_id:
            messagebox.showerror("Error", "Requester not found.")
            return

        # Check if the requester has associated tasks
        with sqlite3.connect(self.db.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM tasks WHERE requester_id = ?", (requester_id,))
            count = cursor.fetchone()[0]
            if count > 0:
                messagebox.showwarning(
                    "Cannot Delete",
                    "This requester has associated tasks. Please delete or reassign them before deleting the requester."
                )
                return

        # Confirm deletion
        confirm = messagebox.askyesno("Confirm Deletion", f"Are you sure you want to delete the requester '{requester_name}'?")
        if not confirm:
            return

        # Delete the requester
        self.db.delete_requester(requester_id)

        # Refresh the UI
        self.refresh_requester_dropdown()
        self.refresh_requester_filter()
        self.load_tasks()
        messagebox.showinfo("Success", f"Requester '{requester_name}' has been deleted.")

    def add_requester(self):
        """
        Opens a dialog to add a new requester.
        """
        requester_name = simpledialog.askstring("Add Requester", "Enter new requester name:")
        if requester_name:
            existing_requesters = self.db.get_all_requesters()
            requester_names = [name for (id, name) in existing_requesters]
            if requester_name.strip() in requester_names:
                messagebox.showwarning("Duplicate Requester", "This requester already exists.")
                return
            self.db.add_requester(requester_name.strip())
            self.refresh_requester_dropdown()
            self.refresh_requester_filter()
            self.load_tasks()
            messagebox.showinfo("Success", "Requester added successfully.")

    def add_task(self):
        """
        Adds a new task to the database and updates the UI.
        """
        task_name = self.task_name_entry.get().strip()  # Strip whitespace
        requester_name = self.requester_entry.get().strip()  # Strip whitespace
        project_name = self.project_entry.get().strip()  # Strip whitespace

        if not task_name:
            messagebox.showwarning("Input Error", "Please enter a task name.")
            return

        # Get requester_id
        requester_id = None
        if requester_name and requester_name != "All":
            requesters = self.db.get_all_requesters()
            requester_dict = {name.strip(): id for (id, name) in requesters}
            requester_id = requester_dict.get(requester_name)

        # Get project_id if project is selected
        project_id = None
        if project_name and project_name != "All":
            projects = self.db.get_all_projects()
            project_dict = {name.strip(): id for (id, name) in projects}
            project_id = project_dict.get(project_name)

        # Add task with requester_id and project_id
        self.db.add_task(task_name, requester_id, project_id)
        self.load_tasks()
        self.task_name_entry.delete(0, tk.END)
        messagebox.showinfo("Success", "Task added successfully.")

    def load_tasks(self):
        """
        Loads tasks from the database into the Treeview.
        """
        for item in self.tree.get_children():
            self.tree.delete(item)

        requester_name = self.requester_filter.get() if self.requester_filter.get() else "All"
        project_name = self.project_filter.get() if self.project_filter.get() else "All"
        search_keyword = self.search_entry.get().strip()
        filter_status = None
        if self.status_filter.get() == "Done":
            filter_status = True
        elif self.status_filter.get() == "Not Done":
            filter_status = False

        only_assigned = self.only_assigned_var.get()

        # Get requester_id
        requester_id = None
        if requester_name != "All":
            requesters = self.db.get_all_requesters()
            requester_dict = {name.strip(): id for (id, name) in requesters}
            requester_id = requester_dict.get(requester_name.strip())

        # Get project_id
        project_id = None
        if project_name != "All":
            projects = self.db.get_all_projects()
            project_dict = {name.strip(): id for (id, name) in projects}
            project_id = project_dict.get(project_name.strip())

        tasks = self.db.get_tasks(requester_id, project_id, search_keyword, filter_status, only_assigned)

        for task in tasks:
            status = "Done ✔" if task[4] else "Not Done ❌"
            day_assigned = task[5] if task[5] else ""
            requester_display = task[1] if task[1] else "No Requester"
            project_display = task[2] if task[2] else "No Project"
            self.tree.insert("", tk.END, values=(task[0], requester_display, project_display, task[3], status, day_assigned),
                             tags=('done' if task[4] else 'not_done',))

        # Apply tag styling
        self.tree.tag_configure('done', foreground='dark green')
        self.tree.tag_configure('not_done', foreground='red')

    def filter_tasks(self, event=None):
        """
        Filters tasks based on various criteria.
        """
        self.load_tasks()

    def reset_filters(self):
        """
        Resets all filters to their default states.
        """
        self.requester_filter.set("All")
        self.project_filter.set("All")
        self.search_entry.delete(0, tk.END)
        self.status_filter.set("All")
        self.only_assigned_var.set(False)
        self.load_tasks()

    def mark_task_status(self, done):
        """
        Marks selected tasks as done or not done.
        """
        selected_items = self.tree.selection()
        if not selected_items:
            messagebox.showwarning("Selection Error", "Please select at least one task.")
            return

        for selected_item in selected_items:
            task_id = self.tree.item(selected_item)['values'][0]
            self.db.update_task_status(task_id, done)
            if done:
                self.db.unassign_day_from_task(task_id)

        self.load_tasks()
        self.refresh_day_windows()
        status_text = "completed" if done else "marked as not done"
        messagebox.showinfo("Success", f"Selected tasks have been {status_text}.")

    def delete_task(self):
        """
        Deletes selected tasks from the database.
        """
        selected_items = self.tree.selection()
        if not selected_items:
            messagebox.showwarning("Selection Error", "Please select at least one task to delete.")
            return

        confirm = messagebox.askyesno("Confirm Deletion", "Are you sure you want to delete the selected task(s)?")
        if not confirm:
            return

        for selected_item in selected_items:
            task_id = self.tree.item(selected_item)['values'][0]
            self.db.delete_task(task_id)

        self.load_tasks()
        self.refresh_day_windows()
        messagebox.showinfo("Success", "Selected task(s) have been deleted.")

    def edit_task(self):
        """
        Opens a dialog to edit the selected task.
        """
        selected_items = self.tree.selection()
        if not selected_items:
            messagebox.showwarning("Selection Error", "Please select a task to edit.")
            return
        elif len(selected_items) > 1:
            messagebox.showwarning("Selection Error", "Please select only one task to edit.")
            return

        task_id = self.tree.item(selected_items[0])['values'][0]
        task = self.db.get_task_by_id(task_id)
        if task:
            self.open_edit_task_dialog(task)
        else:
            messagebox.showerror("Error", "Selected task does not exist.")

    def open_edit_task_dialog(self, task):
        """
        Opens a new window to edit the selected task.
        """
        edit_window = tk.Toplevel(self)
        edit_window.title("Edit Task")
        edit_window.geometry("500x400")
        edit_window.resizable(False, False)
        edit_window.grab_set()

        # Apply the same style as the main UI
        style = ttk.Style(edit_window)
        style.theme_use('clam')

        # Main Frame
        main_frame = ttk.Frame(edit_window, padding="20 20 20 20")
        main_frame.pack(fill='both', expand=True)

        # Configure grid
        main_frame.columnconfigure(1, weight=1)

        # Task Name Label and Entry
        task_name_label = ttk.Label(main_frame, text="Task Name:", font=self.customHeadingsFont)
        task_name_label.grid(row=0, column=0, sticky='e', padx=(0,10), pady=(0,10))

        task_name_entry = ttk.Entry(main_frame, font=self.customFont)
        task_name_entry.insert(0, task[3])
        task_name_entry.grid(row=0, column=1, sticky='we', pady=(0,10))

        # Requester Label and Combobox
        requester_label = ttk.Label(main_frame, text="Requester:", font=self.customHeadingsFont)
        requester_label.grid(row=1, column=0, sticky='e', padx=(0,10), pady=(0,10))

        requester_combobox = ttk.Combobox(main_frame, state="readonly")
        requesters = self.db.get_all_requesters()
        requester_combobox['values'] = [name.strip() for (id, name) in requesters]
        if task[1]:
            requester_combobox.set(task[1].strip())  # Set current requester
        else:
            requester_combobox.set('')  # No requester
        requester_combobox.grid(row=1, column=1, sticky='we', pady=(0,10))
        requester_combobox.bind('<<ComboboxSelected>>', lambda event: self.update_projects_in_edit_dialog(project_combobox, requester_combobox))

        # Project Label and Combobox
        project_label = ttk.Label(main_frame, text="Project:", font=self.customHeadingsFont)
        project_label.grid(row=2, column=0, sticky='e', padx=(0,10), pady=(0,10))

        project_combobox = ttk.Combobox(main_frame, state="readonly")
        project_combobox.grid(row=2, column=1, sticky='we', pady=(0,10))

        # Initialize project_combobox with all projects
        self.update_projects_in_edit_dialog(project_combobox, requester_combobox, current_project_name=task[2])

        # Save Button
        save_button = ttk.Button(
            main_frame, text="Save Changes",
            command=lambda: self.save_task_changes(
                task_id=task[0],
                new_task_name=task_name_entry.get().strip(),
                new_requester_name=requester_combobox.get().strip(),
                new_project_name=project_combobox.get().strip(),
                window=edit_window
            )
        )
        save_button.grid(row=3, column=0, columnspan=2, pady=20)

    def update_projects_in_edit_dialog(self, project_combobox, requester_combobox, current_project_name=None):
        """
        Updates the project combobox in the edit dialog based on the selected requester.
        """
        # Since projects are independent of requesters, list all projects
        projects = self.db.get_all_projects()
        project_names = [name.strip() for (id, name) in projects]
        project_combobox['values'] = project_names
        if current_project_name and current_project_name.strip() in project_names:
            project_combobox.set(current_project_name.strip())
        else:
            project_combobox.set('')

    def save_task_changes(self, task_id, new_task_name, new_requester_name, new_project_name, window):
        """
        Saves the changes made to a task.
        """
        new_task_name = new_task_name.strip()
        new_requester_name = new_requester_name.strip()
        new_project_name = new_project_name.strip()

        if not new_task_name:
            messagebox.showwarning("Input Error", "Task Name cannot be empty.")
            return

        # Get requester_id
        requester_id = None
        if new_requester_name:
            requesters = self.db.get_all_requesters()
            requester_dict = {name.strip(): id for (id, name) in requesters}
            requester_id = requester_dict.get(new_requester_name)
            if not requester_id:
                messagebox.showerror("Error", "Selected requester does not exist.")
                return

        # Get project_id
        project_id = None
        if new_project_name:
            projects = self.db.get_all_projects()
            project_dict = {name.strip(): id for (id, name) in projects}
            project_id = project_dict.get(new_project_name)
            if not project_id:
                messagebox.showerror("Error", "Selected project does not exist.")
                return

        # Update the task in the database
        self.db.update_task(task_id, new_task_name, requester_id, project_id)

        self.load_tasks()
        self.refresh_day_windows()
        messagebox.showinfo("Success", "Task has been updated.")
        window.destroy()

    def assign_day_to_task(self):
        """
        Assigns a selected day to selected tasks.
        """
        selected_items = self.tree.selection()
        day = self.day_dropdown.get().strip().capitalize()

        if not selected_items:
            messagebox.showwarning("Selection Error", "Please select at least one task to assign a day.")
            return

        if not day:
            messagebox.showwarning("Input Error", "Please select a day to assign.")
            return

        valid_days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        if day not in valid_days:
            messagebox.showerror("Invalid Day", "Please select a valid day of the week.")
            return

        for selected_item in selected_items:
            task_id = self.tree.item(selected_item)['values'][0]
            self.db.assign_day_to_task(task_id, day)

        self.load_tasks()
        self.refresh_day_windows()
        messagebox.showinfo("Success", f"Selected tasks have been assigned to {day}.")

    def unassign_day_from_task(self):
        """
        Unassigns the day from selected tasks.
        """
        selected_items = self.tree.selection()
        if not selected_items:
            messagebox.showwarning("Selection Error", "Please select at least one task to unassign the day.")
            return

        for selected_item in selected_items:
            task_id = self.tree.item(selected_item)['values'][0]
            self.db.unassign_day_from_task(task_id)

        self.load_tasks()
        self.refresh_day_windows()
        messagebox.showinfo("Success", "Selected tasks have been unassigned from their day.")

    def view_tasks_by_day(self):
        """
        Opens a new window displaying tasks grouped by their assigned day.
        """
        window = tk.Toplevel(self)
        window.title("Daily Task Schedule")
        window.geometry("900x600")
        window.resizable(True, True)
        window.grab_set()

        # Store the mapping from days to tree widgets for this window
        day_trees = {}
        self.day_windows[window] = day_trees

        # Configure grid layout
        window.columnconfigure(0, weight=1)
        window.rowconfigure(0, weight=1)

        # Notebook for days
        notebook = ttk.Notebook(window)
        notebook.grid(row=0, column=0, sticky='nsew')

        # Days of the week
        days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

        for day in days:
            frame = ttk.Frame(notebook)
            frame.pack(fill='both', expand=True)
            notebook.add(frame, text=day)

            # Scrollbars for Treeview
            tree_scroll_y = ttk.Scrollbar(frame, orient="vertical")
            tree_scroll_y.pack(side='right', fill='y')

            tree_scroll_x = ttk.Scrollbar(frame, orient="horizontal")
            tree_scroll_x.pack(side='bottom', fill='x')

            # Treeview for displaying tasks
            tree = ttk.Treeview(
                frame, 
                columns=("ID", "Requester", "Project", "Task Name", "Status"),
                show='headings', 
                yscrollcommand=tree_scroll_y.set,
                xscrollcommand=tree_scroll_x.set
            )
            tree.pack(fill='both', expand=True)

            tree_scroll_y.config(command=tree.yview)
            tree_scroll_x.config(command=tree.xview)

            # Define columns
            tree.heading("ID", text="ID")
            tree.heading("Requester", text="Requester")
            tree.heading("Project", text="Project")
            tree.heading("Task Name", text="Task Name")
            tree.heading("Status", text="Status")

            # Define column widths
            tree.column("ID", width=50, anchor='center')
            tree.column("Requester", width=150, anchor='w')
            tree.column("Project", width=150, anchor='w')
            tree.column("Task Name", width=400, anchor='w')
            tree.column("Status", width=100, anchor='center')

            # Insert tasks for the specific day
            tasks = self.db.get_tasks(only_assigned=True)
            for task in tasks:
                task_day = task[5].strip().lower() if task[5] else ""
                current_day = day.lower()
                if task_day == current_day:
                    status = "Done ✔" if task[4] else "Not Done ❌"
                    requester_display = task[1] if task[1] else "No Requester"
                    project_display = task[2] if task[2] else "No Project"
                    tree.insert(
                        "", 
                        tk.END, 
                        values=(task[0], requester_display, project_display, task[3], status),
                        tags=('done' if task[4] else 'not_done',)
                    )
            
            # Apply tag styling
            tree.tag_configure('done', foreground='dark green')
            tree.tag_configure('not_done', foreground='red')

            # Handle case when no tasks are assigned to the day
            if not tree.get_children():
                tree.insert("", tk.END, values=("", "No Tasks Assigned", "", "", ""),
                            tags=('no_tasks',))
                tree.tag_configure('no_tasks', foreground='gray')

            # Store the tree widget in day_trees
            day_trees[day] = tree

    def refresh_day_windows(self):
        """
        Refreshes all open day schedule windows.
        """
        for window, day_trees in self.day_windows.items():
            if window.winfo_exists():
                for day, tree in day_trees.items():
                    # Clear the tree
                    for item in tree.get_children():
                        tree.delete(item)

                    # Fetch tasks assigned to the current day
                    tasks = self.db.get_tasks(only_assigned=True)
                    for task in tasks:
                        task_day = task[5].strip().lower() if task[5] else ""
                        current_day = day.lower()
                        if task_day == current_day:
                            status = "Done ✔" if task[4] else "Not Done ❌"
                            requester_display = task[1] if task[1] else "No Requester"
                            project_display = task[2] if task[2] else "No Project"
                            tree.insert(
                                '', 
                                tk.END, 
                                values=(task[0], requester_display, project_display, task[3], status),
                                tags=('done' if task[4] else 'not_done',)
                            )
                    
                    # Apply tag styling
                    tree.tag_configure('done', foreground='dark green')
                    tree.tag_configure('not_done', foreground='red')

                    # Handle empty tabs
                    if not tree.get_children():
                        tree.insert("", tk.END, values=("", "No Tasks Assigned", "", "", ""),
                                    tags=('no_tasks',))
                        tree.tag_configure('no_tasks', foreground='gray')

    def sort_tree(self, col, reverse):
        """
        Sorts the Treeview based on a given column.
        """
        data = [(self.tree.set(child, col), child) for child in self.tree.get_children('')]
        try:
            # Attempt to sort as integers for the "ID" column
            data.sort(reverse=reverse, key=lambda x: int(x[0]) if col == "ID" else x[0].lower())
        except ValueError:
            # Fallback to string sorting
            data.sort(reverse=reverse, key=lambda x: x[0].lower())

        for index, (val, child) in enumerate(data):
            self.tree.move(child, '', index)

        # Reverse sort next time
        self.tree.heading(col, command=lambda: self.sort_tree(col, not reverse))

    def on_closing(self):
        """
        Handles the application closing event.
        """
        if messagebox.askokcancel("Quit", "Do you want to quit the application?"):
            self.destroy()

if __name__ == "__main__":
    db = TaskDatabase('Tasks.db')
    app = TaskTracker(db)
    app.mainloop()
