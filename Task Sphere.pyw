import tkinter as tk
from tkinter import messagebox, ttk
import tkinter.font as tkFont
import sqlite3

class TaskDatabase:
    def __init__(self, db_path):
        self.conn = sqlite3.connect(db_path)
        self.cursor = self.conn.cursor()
        self.setup_database()

    def setup_database(self):
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS tasks
                               (id INTEGER PRIMARY KEY AUTOINCREMENT, requester TEXT, task_name TEXT, status BOOLEAN, day_assigned TEXT)''')
        self.conn.commit()

    def get_requesters(self):
        self.cursor.execute("SELECT DISTINCT requester FROM tasks ORDER BY requester")
        return [row[0] for row in self.cursor.fetchall()]

    def get_tasks(self, filter_requester=None):
        query = "SELECT id, requester, task_name, status, day_assigned FROM tasks"
        parameters = ()
        if filter_requester:
            query += " WHERE requester = ?"
            parameters = (filter_requester,)
        query += " ORDER BY requester"
        self.cursor.execute(query, parameters)
        return self.cursor.fetchall()

    def add_task(self, requester, task_name):
        self.cursor.execute("INSERT INTO tasks (requester, task_name, status) VALUES (?, ?, ?)", (requester, task_name, False))
        self.conn.commit()

    def delete_task(self, task_id):
        self.cursor.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        self.conn.commit()

    def update_task_status(self, task_id, status):
        self.cursor.execute("UPDATE tasks SET status = ? WHERE id = ?", (status, task_id,))
        self.conn.commit()

    def assign_day_to_task(self, task_id, day):
        self.cursor.execute("UPDATE tasks SET day_assigned = ? WHERE id = ?", (day, task_id,))
        self.conn.commit()

    def unassign_day_from_task(self, task_id):
        self.cursor.execute("UPDATE tasks SET day_assigned = NULL WHERE id = ?", (task_id,))
        self.conn.commit()

class TaskTracker(tk.Tk):
    def __init__(self, db):
        super().__init__()
        self.db = db
        self.customFont = tkFont.Font(family="Helvetica", size=12)
        self.customHeadingsFont = tkFont.Font(family="Helvetica", size=12, weight="bold")
        
        self.title("Task Sphere")
        self.geometry("800x500")

        self.day_windows = {}  

        self.create_widgets()
        self.load_tasks()
        self.refresh_requester_dropdown()

    def create_widgets(self):
        self.requester_label = tk.Label(self, text="Requester:", font=self.customHeadingsFont)
        self.requester_label.grid(row=0, column=0, sticky='e')

        self.requester_entry = ttk.Combobox(self)
        self.requester_entry.grid(row=0, column=1, sticky='we')
        self.requester_entry.bind('<<ComboboxSelected>>', self.filter_tasks_by_requester)

        self.task_name_label = tk.Label(self, text="Task Name:", font=self.customHeadingsFont)
        self.task_name_label.grid(row=1, column=0, sticky='e')

        self.task_name_entry = tk.Entry(self)
        self.task_name_entry.grid(row=1, column=1, sticky='we')

        self.add_task_button = tk.Button(self, text="Add Task", command=self.add_task, font=self.customHeadingsFont)
        self.add_task_button.grid(row=1, column=2, padx=5)

        self.tasks_listbox = tk.Listbox(self, font=self.customFont)
        self.tasks_listbox.grid(row=2, column=0, columnspan=3, sticky="nsew", pady=5)
        self.tasks_listbox.bind('<<ListboxSelect>>', self.on_listbox_select)

        self.mark_done_button = tk.Button(self, text="Mark as Done", command=lambda: self.mark_task_status(True), font=self.customHeadingsFont)
        self.mark_done_button.grid(row=3, column=0, pady=5)

        self.mark_undone_button = tk.Button(self, text="Mark as Not Done", command=lambda: self.mark_task_status(False), font=self.customHeadingsFont)
        self.mark_undone_button.grid(row=3, column=1, pady=5)

        self.delete_task_button = tk.Button(self, text="Delete Task", command=self.delete_task, font=self.customHeadingsFont)
        self.delete_task_button.grid(row=3, column=2, pady=5)

        self.day_dropdown = ttk.Combobox(self, values=["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"], font=self.customHeadingsFont)
        self.day_dropdown.grid(row=4, column=0, columnspan=2, sticky='we', pady=5)

        self.assign_day_button = tk.Button(self, text="Assign Day", command=self.assign_day_to_task, font=self.customHeadingsFont)
        self.assign_day_button.grid(row=4, column=2, padx=5)
        
        self.unassign_day_button = tk.Button(self, text="Unassign Day", command=self.unassign_day_from_task, font=self.customHeadingsFont)
        self.unassign_day_button.grid(row=5, column=2, padx=5)
        
        self.view_days_button = tk.Button(self, text="View Daily Task Schedule", command=self.view_tasks_by_day, font=self.customHeadingsFont)
        self.view_days_button.grid(row=5, column=0, columnspan=3, pady=5)

        self.grid_columnconfigure(1, weight=1)

    def on_listbox_select(self, event):
        pass  # This method can be implemented if needed

    def update_main_from_schedule(self, event):
        tree = event.widget
        selected_item = tree.selection()
        
        if selected_item:
            task_data = tree.item(selected_item, 'values')
            task_id, requester = task_data[0], task_data[1]

            # Set the requester in the combobox and apply the filter
            self.requester_entry.set(requester)
            self.filter_tasks_by_requester()

            # Find and select the task in the main task list
            self.tasks_listbox.selection_clear(0, tk.END)  # Deselect any currently selected task
            for i, list_item in enumerate(self.tasks_listbox.get(0, tk.END)):
                if list_item.startswith(str(task_id) + ":"):
                    self.tasks_listbox.selection_set(i)
                    self.tasks_listbox.see(i)
                    break
                    
    def add_task(self):
        requester = self.requester_entry.get()
        task_name = self.task_name_entry.get()
        if not requester or not task_name:
            messagebox.showwarning("Warning", "Please enter a requester and task name.")
            return
        self.db.add_task(requester, task_name)
        self.load_tasks()
        self.refresh_requester_dropdown()

    def load_tasks(self):
        self.tasks_listbox.delete(0, tk.END)
        filter_requester = self.requester_entry.get() if self.requester_entry.get() != "" else None
        for task in self.db.get_tasks(filter_requester):
            status = "Done ✔" if task[3] else "Not Done ❌"
            day_assigned = f" - 📅 {task[4]}" if task[4] else ""
            line = f"{task[0]}: {task[1]} - {task[2]} [{status}]{day_assigned}"
            self.tasks_listbox.insert(tk.END, line)

    def refresh_requester_dropdown(self):
        requesters = [""] + self.db.get_requesters()
        self.requester_entry['values'] = requesters

    def filter_tasks_by_requester(self, event=None):
        self.load_tasks()

    def mark_task_status(self, done):
        selected_items = self.tasks_listbox.curselection()
        if not selected_items:
            messagebox.showwarning("Warning", "Please select a task to mark as Done/Not Done.")
            return

        for selected_item in selected_items:
            task_id = self.tasks_listbox.get(selected_item).split(":")[0]
            self.db.update_task_status(task_id, done)

        # If marking as done, also unassign the day
        if done:
            self.db.unassign_day_from_task(task_id)

        self.load_tasks()
        self.refresh_day_windows()

    def delete_task(self):
        selected_items = self.tasks_listbox.curselection()
        if not selected_items:
            messagebox.showwarning("Warning", "Please select a task to delete.")
            return

        for selected_item in selected_items:
            task_id = self.tasks_listbox.get(selected_item).split(":")[0]
            self.db.delete_task(task_id)

        self.load_tasks()
        self.refresh_day_windows()

    def assign_day_to_task(self):
        selected_items = self.tasks_listbox.curselection()
        day = self.day_dropdown.get()

        if not selected_items:
            messagebox.showwarning("Warning", "Please select a task to assign a day.")
            return

        if not day:
            messagebox.showwarning("Warning", "Please select a day to assign.")
            return

        for selected_item in selected_items:
            task_id = self.tasks_listbox.get(selected_item).split(":")[0]
            self.db.assign_day_to_task(task_id, day)

        self.load_tasks()
        self.refresh_day_windows()

    def unassign_day_from_task(self):
        selected_items = self.tasks_listbox.curselection()
        if not selected_items:
            messagebox.showwarning("Warning", "Please select a task to unassign a day.")
            return

        for selected_item in selected_items:
            task_id = self.tasks_listbox.get(selected_item).split(":")[0]
            self.db.unassign_day_from_task(task_id)

        self.load_tasks()
        self.refresh_day_windows()

    def view_tasks_by_day(self):
        window = tk.Toplevel(self)
        window.title("Daily Task Schedule")
        window.geometry("800x500")

        # Set up style for the Treeview
        content_style = ttk.Style(window)
        content_style.configure("Treeview", font=('Helvetica', 12))

        heading_style = ttk.Style(window)
        heading_style.configure("Treeview.Heading", font=('Helvetica', 14, 'bold'))

        columns = ('id', 'requester', 'task_name', 'status', 'day_assigned')
        tree = ttk.Treeview(window, columns=columns, show='headings', style="Treeview")

        tree.heading('id', text='ID')
        tree.heading('requester', text='Requester')
        tree.heading('task_name', text='Task Name')
        tree.heading('status', text='Status')
        tree.heading('day_assigned', text='Day Assigned')

        tree.column('id', width=30, anchor='center')
        tree.column('requester', width=100, anchor='w')
        tree.column('task_name', width=180, anchor='w')
        tree.column('status', width=80, anchor='center')
        tree.column('day_assigned', width=100, anchor='center')
        tree.bind('<<TreeviewSelect>>', self.update_main_from_schedule)

        for task in self.db.get_tasks(filter_requester=None):
            if task[4]:  # Only if day_assigned is not None
                status = "Done ✔" if task[3] else "Not Done ❌"
                tree.insert("", tk.END, values=(task[0], task[1], task[2], status, task[4]))

        vsb = ttk.Scrollbar(window, orient="vertical", command=tree.yview)
        vsb.pack(side='right', fill='y')
        hsb = ttk.Scrollbar(window, orient="horizontal", command=tree.xview)
        hsb.pack(side='bottom', fill='x')

        tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)
        tree.pack(fill=tk.BOTH, expand=True)

        self.day_windows[window] = tree

    def refresh_day_windows(self):
        for window, tree in self.day_windows.items():
            if window.winfo_exists():
                for item in tree.get_children():
                    tree.delete(item)

                for task in self.db.get_tasks(filter_requester=None):
                    if task[4]:  # Only if day_assigned is not None
                        status = "Done ✔" if task[3] else "Not Done ❌"
                        tree.insert('', tk.END, values=(task[0], task[1], task[2], status, task[4]))

if __name__ == "__main__":
    db = TaskDatabase('Tasks.db')
    app = TaskTracker(db)
    app.mainloop()