import tkinter as tk
from tkinter import messagebox, ttk
import tkinter.font as tkFont
import sqlite3

class TaskDatabase:
    """
    Handles all database operations related to tasks.
    """
    def __init__(self, db_path):
        self.db_path = db_path
        self.setup_database()

    def setup_database(self):
        """
        Creates the tasks table if it doesn't exist.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    requester TEXT NOT NULL,
                    task_name TEXT NOT NULL,
                    status BOOLEAN NOT NULL DEFAULT 0,
                    day_assigned TEXT
                )
            ''')
            conn.commit()

    def get_requesters(self):
        """
        Retrieves a list of distinct requesters.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT requester FROM tasks ORDER BY requester")
            return [row[0] for row in cursor.fetchall()]

    def get_tasks(self, filter_requester=None, search_keyword=None, filter_status=None, only_assigned=False):
        """
        Retrieves tasks, optionally filtered by requester, search keyword, status, and assignment.
        """
        query = "SELECT id, requester, task_name, status, day_assigned FROM tasks"
        conditions = []
        parameters = []

        if filter_requester and filter_requester != "All":
            conditions.append("requester = ?")
            parameters.append(filter_requester)
        
        if search_keyword:
            conditions.append("(requester LIKE ? OR task_name LIKE ?)")
            parameters.extend([f"%{search_keyword}%", f"%{search_keyword}%"])

        if filter_status is not None:
            conditions.append("status = ?")
            parameters.append(filter_status)
        
        if only_assigned:
            conditions.append("day_assigned IS NOT NULL")

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY requester"

        print(f"Executing Query: {query} with parameters {parameters}")

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(query, tuple(parameters))
            results = cursor.fetchall()
            print(f"Retrieved {len(results)} tasks from the database.")
            return results

    def add_task(self, requester, task_name):
        """
        Adds a new task to the database.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO tasks (requester, task_name, status) VALUES (?, ?, ?)",
                (requester, task_name, False)
            )
            conn.commit()

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
            cursor.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
            return cursor.fetchone()

    def update_task(self, task_id, new_requester, new_task_name):
        """
        Updates the requester and task name of a task.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE tasks SET requester = ?, task_name = ? WHERE id = ?",
                (new_requester, new_task_name, task_id)
            )
            conn.commit()

    def get_all_requesters(self):
        """
        Retrieves all distinct requesters.
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT requester FROM tasks")
            return [row[0] for row in cursor.fetchall()]

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
        self.geometry("1100x600")
        self.resizable(True, True)
        self.style = ttk.Style(self)
        self.style.theme_use('clam')  # You can choose other themes like 'default', 'vista', 'xpnative'

        self.day_windows = {}  # Keeps track of day schedule windows

        self.create_widgets()
        self.load_tasks()
        self.refresh_requester_dropdown()

        # Bind the window close event to ensure the database connection is closed
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
        self.requester_entry.grid(row=0, column=1, sticky='w', padx=(0,15))
        self.requester_entry.bind('<<ComboboxSelected>>', self.filter_tasks)

        # Task Name Label and Entry
        task_name_label = ttk.Label(top_frame, text="Task Name:", font=self.customHeadingsFont)
        task_name_label.grid(row=0, column=2, sticky='w', padx=(0,5))

        self.task_name_entry = ttk.Entry(top_frame, width=30)
        self.task_name_entry.grid(row=0, column=3, sticky='w', padx=(0,15))

        # Add Task Button
        add_task_button = ttk.Button(top_frame, text="Add Task", command=self.add_task)
        add_task_button.grid(row=0, column=4, sticky='w')

        # Search Label and Entry
        search_label = ttk.Label(top_frame, text="Search:", font=self.customHeadingsFont)
        search_label.grid(row=1, column=0, sticky='w', padx=(0,5), pady=(10,0))

        self.search_entry = ttk.Entry(top_frame, width=30)
        self.search_entry.grid(row=1, column=1, sticky='w', padx=(0,15), pady=(10,0))
        self.search_entry.bind('<KeyRelease>', self.filter_tasks)

        # Status Filter
        status_label = ttk.Label(top_frame, text="Status:", font=self.customHeadingsFont)
        status_label.grid(row=1, column=2, sticky='w', padx=(0,5), pady=(10,0))

        self.status_filter = ttk.Combobox(top_frame, state="readonly", values=["All", "Done", "Not Done"])
        self.status_filter.current(0)
        self.status_filter.grid(row=1, column=3, sticky='w', padx=(0,15), pady=(10,0))
        self.status_filter.bind('<<ComboboxSelected>>', self.filter_tasks)

        # Reset Filters Button
        reset_filters_button = ttk.Button(top_frame, text="Reset Filters", command=self.reset_filters)
        reset_filters_button.grid(row=1, column=4, sticky='w', padx=(0,5), pady=(10,0))

        # New Filter: Only Show Assigned Tasks
        self.only_assigned_var = tk.BooleanVar()
        only_assigned_check = ttk.Checkbutton(
            top_frame, 
            text="Only Show Assigned Tasks",
            variable=self.only_assigned_var,
            command=self.filter_tasks,
            style='TCheckbutton'
        )
        only_assigned_check.grid(row=2, column=0, columnspan=2, sticky='w', padx=(0,5), pady=(10,0))

        # Middle Frame for Actions
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

        # Day Assignment Label and Combobox
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
        view_days_button = ttk.Button(action_frame, text="View Daily Task Schedule", command=self.view_tasks_by_day)
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
            columns=("ID", "Requester", "Task Name", "Status", "Day Assigned"),
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
        self.tree.heading("Task Name", text="Task Name", command=lambda: self.sort_tree("Task Name", False))
        self.tree.heading("Status", text="Status", command=lambda: self.sort_tree("Status", False))
        self.tree.heading("Day Assigned", text="Day Assigned", command=lambda: self.sort_tree("Day Assigned", False))

        # Define column widths
        self.tree.column("ID", width=50, anchor='center')
        self.tree.column("Requester", width=150, anchor='w')
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

    def add_task(self):
        """
        Adds a new task to the database and updates the UI.
        """
        requester = self.requester_entry.get().strip()
        task_name = self.task_name_entry.get().strip()
        if not requester or not task_name:
            messagebox.showwarning("Input Error", "Please enter both requester and task name.")
            return
        self.db.add_task(requester, task_name)
        self.load_tasks()
        self.refresh_requester_dropdown()
        self.task_name_entry.delete(0, tk.END)
        messagebox.showinfo("Success", "Task added successfully.")

    def load_tasks(self):
        """
        Loads tasks from the database into the Treeview.
        """
        for item in self.tree.get_children():
            self.tree.delete(item)

        filter_requester = self.requester_entry.get() if self.requester_entry.get() else "All"
        search_keyword = self.search_entry.get().strip()
        filter_status = None
        if self.status_filter.get() == "Done":
            filter_status = True
        elif self.status_filter.get() == "Not Done":
            filter_status = False

        only_assigned = self.only_assigned_var.get()

        tasks = self.db.get_tasks(filter_requester, search_keyword, filter_status, only_assigned)
        
        # Debugging Statements
        print(f"\nLoading {len(tasks)} tasks with requester='{filter_requester}', search='{search_keyword}', status='{filter_status}', only_assigned='{only_assigned}'")
        for task in tasks:
            status = "Done ✔" if task[3] else "Not Done ❌"
            day_assigned = task[4] if task[4] else ""
            print(f"Task ID: {task[0]}, Requester: {task[1]}, Task Name: {task[2]}, Status: {status}, Day Assigned: {day_assigned}")
            self.tree.insert("", tk.END, values=(task[0], task[1], task[2], status, day_assigned),
                             tags=('done' if task[3] else 'not_done',))
        
        # Apply tag styling
        self.tree.tag_configure('done', foreground='dark green')
        self.tree.tag_configure('not_done', foreground='red')

    def refresh_requester_dropdown(self):
        """
        Refreshes the requester dropdown with current requesters.
        """
        requesters = ["All"] + self.db.get_requesters()
        self.requester_entry['values'] = requesters
        self.requester_entry.set("All")

    def filter_tasks(self, event=None):
        """
        Filters tasks based on requester, search keyword, status, and assignment.
        """
        self.load_tasks()

    def reset_filters(self):
        """
        Resets all filters to their default states.
        """
        self.requester_entry.set("All")
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
        edit_window.geometry("450x300")
        edit_window.resizable(False, False)
        edit_window.grab_set()  # Make the edit window modal

        # Apply the same style as the main UI
        style = ttk.Style(edit_window)
        style.theme_use('clam')  # Ensure consistency with the main window

        # Main Frame
        main_frame = ttk.Frame(edit_window, padding="20 20 20 20")
        main_frame.pack(fill='both', expand=True)

        # Configure grid
        main_frame.columnconfigure(1, weight=1)

        # Requester Label and Combobox
        requester_label = ttk.Label(main_frame, text="Requester:", font=self.customHeadingsFont)
        requester_label.grid(row=0, column=0, sticky='e', padx=(0,10), pady=(0,10))

        requester_combobox = ttk.Combobox(main_frame, state="readonly")
        requesters = self.db.get_all_requesters()
        requester_combobox['values'] = requesters
        requester_combobox.set(task[1])  # Set current requester
        requester_combobox.grid(row=0, column=1, sticky='we', pady=(0,10))

        # Task Name Label and Entry
        task_name_label = ttk.Label(main_frame, text="Task Name:", font=self.customHeadingsFont)
        task_name_label.grid(row=1, column=0, sticky='e', padx=(0,10), pady=(0,10))

        task_name_entry = ttk.Entry(main_frame, font=self.customFont)
        task_name_entry.insert(0, task[2])
        task_name_entry.grid(row=1, column=1, sticky='we', pady=(0,10))

        # Save Button
        save_button = ttk.Button(
            main_frame, text="Save Changes",
            command=lambda: self.save_task_changes(
                task_id=task[0],
                new_requester=requester_combobox.get().strip(),
                new_task_name=task_name_entry.get().strip(),
                window=edit_window
            )
        )
        save_button.grid(row=2, column=0, columnspan=2, pady=20)

        # Styling for Save Button
        save_button_style = ttk.Style()
        save_button_style.configure("TButton", font=('Helvetica', 12, 'bold'))

    def save_task_changes(self, task_id, new_requester, new_task_name, window):
        """
        Saves the changes made to a task.
        """
        if not new_requester or not new_task_name:
            messagebox.showwarning("Input Error", "Requester and Task Name cannot be empty.")
            return

        self.db.update_task(task_id, new_requester, new_task_name)
        self.load_tasks()
        self.refresh_requester_dropdown()
        self.refresh_day_windows()
        messagebox.showinfo("Success", "Task has been updated.")
        window.destroy()

    def assign_day_to_task(self):
        """
        Assigns a selected day to selected tasks.
        """
        selected_items = self.tree.selection()
        day = self.day_dropdown.get()

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
        window.grab_set()  # Make the window modal

        # Configure grid layout
        window.columnconfigure(0, weight=1)
        window.rowconfigure(0, weight=1)

        # Notebook for days
        notebook = ttk.Notebook(window)
        notebook.grid(row=0, column=0, sticky='nsew')

        # Updated days list to include all weekdays and weekends
        days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

        for day in days:
            print(f"Creating tab for {day}")  # Debugging Statement
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
                columns=("ID", "Requester", "Task Name", "Status"),
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
            tree.heading("Task Name", text="Task Name")
            tree.heading("Status", text="Status")

            # Define column widths
            tree.column("ID", width=50, anchor='center')
            tree.column("Requester", width=150, anchor='w')
            tree.column("Task Name", width=400, anchor='w')
            tree.column("Status", width=100, anchor='center')

            # Insert tasks for the specific day
            tasks = self.db.get_tasks(
                filter_requester=None, 
                search_keyword=None, 
                filter_status=None, 
                only_assigned=True
            )
            for task in tasks:
                task_day = task[4].strip().lower() if task[4] else ""
                current_day = day.lower()
                print(f"Checking Task ID {task[0]} assigned to {task[4]} against {day}")  # Debugging Statement
                if task_day == current_day:
                    status = "Done ✔" if task[3] else "Not Done ❌"
                    print(f"Inserting Task ID {task[0]} into {day}")  # Debugging Statement
                    tree.insert(
                        "", 
                        tk.END, 
                        values=(task[0], task[1], task[2], status),
                        tags=('done' if task[3] else 'not_done',)
                    )
            
            # Apply tag styling
            tree.tag_configure('done', foreground='dark green')
            tree.tag_configure('not_done', foreground='red')

            # Handle case when no tasks are assigned to the day
            if not tree.get_children():
                tree.insert("", tk.END, values=("", "No Tasks Assigned", "", ""),
                            tags=('no_tasks',))
                tree.tag_configure('no_tasks', foreground='gray')

        self.day_windows[window] = notebook

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

    def refresh_day_windows(self):
        """
        Refreshes all open day schedule windows.
        """
        for window, notebook in self.day_windows.items():
            if window.winfo_exists():
                for tab in notebook.tabs():
                    tree = notebook.nametowidget(tab).winfo_children()[0]
                    for item in tree.get_children():
                        tree.delete(item)

                    # Fetch only assigned tasks for the specific day
                    tasks = self.db.get_tasks(
                        filter_requester=None, 
                        search_keyword=None, 
                        filter_status=None, 
                        only_assigned=True
                    )
                    for task in tasks:
                        task_day = task[4].strip().lower() if task[4] else ""
                        current_day = notebook.tab(tab, "text").lower()
                        if task_day == current_day:
                            status = "Done ✔" if task[3] else "Not Done ❌"
                            tree.insert(
                                '', 
                                tk.END, 
                                values=(task[0], task[1], task[2], status),
                                tags=('done' if task[3] else 'not_done',)
                            )
                    
                    # Reapply tag styling
                    tree.tag_configure('done', foreground='dark green')
                    tree.tag_configure('not_done', foreground='red')

                # Handle empty tabs
                for tab in notebook.tabs():
                    tree = notebook.nametowidget(tab).winfo_children()[0]
                    if not tree.get_children():
                        tree.insert("", tk.END, values=("", "No Tasks Assigned", "", ""),
                                    tags=('no_tasks',))
                        tree.tag_configure('no_tasks', foreground='gray')

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
