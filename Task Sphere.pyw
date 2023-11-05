import tkinter as tk
from tkinter import messagebox, ttk
import tkinter.font as tkFont
import sqlite3

# Database setup
conn = sqlite3.connect('Tasks.db')
c = conn.cursor()

# Create table
c.execute('''CREATE TABLE IF NOT EXISTS tasks
             (id INTEGER PRIMARY KEY AUTOINCREMENT, requester TEXT, task_name TEXT, status BOOLEAN, day_assigned TEXT)''')


class TaskTracker(tk.Tk):
    def __init__(self):
        super().__init__()
        # Define a custom font to be used
        self.customFont = tkFont.Font(family="Helvetica", size=12)
        
        # Define a bold font for headings
        self.customHeadingsFont = tkFont.Font(family="Helvetica", size=12, weight="bold")
                
        self.title("Task Sphere")
        self.geometry("800x500")

        self.day_windows = {}  # Stores references to open day windows
        self.create_widgets()
        self.load_tasks()

    def create_widgets(self):
        self.requester_label = tk.Label(self, text="Requester:", font=self.customHeadingsFont)
        self.requester_label.grid(row=0, column=0, sticky='e')

        self.requester_entry = ttk.Combobox(self)
        self.requester_entry.grid(row=0, column=1, sticky='we')

        self.task_name_label = tk.Label(self, text="Task Name:", font=self.customHeadingsFont)
        self.task_name_label.grid(row=1, column=0, sticky='e')
        
        # Fetch distinct requesters from the database and sort them
        c.execute("SELECT DISTINCT requester FROM tasks ORDER BY requester")
        requesters = sorted([row[0] for row in c.fetchall()])

        # Prepend an empty string or "All" to the list of requesters
        requesters.insert(0, "")

        self.requester_label.grid(row=0, column=0, sticky='e')

        self.requester_entry = ttk.Combobox(self, values=requesters)
        self.requester_entry.grid(row=0, column=1, sticky='we')

        # Set the combobox to show the blank/all option by default
        self.requester_entry.set(requesters[0])
        
        # Bind the event after the combobox has been created
        self.requester_entry.bind('<<ComboboxSelected>>', self.filter_tasks_by_requester)


        self.task_name_entry = tk.Entry(self)
        self.task_name_entry.grid(row=1, column=1, sticky='we')

        self.add_task_button = tk.Button(self, text="Add Task", command=self.add_task, font=self.customHeadingsFont)
        self.add_task_button.grid(row=1, column=2, padx=5)

        self.tasks_listbox = tk.Listbox(self, font=self.customFont)
        self.tasks_listbox.grid(row=2, column=0, columnspan=3, sticky="nsew", pady=5)

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
        self.tasks_listbox.bind('<<ListboxSelect>>', self.on_listbox_select)
        
        self.refresh_requester_dropdown()  # Populate the requester dropdown on startup
        
    def on_listbox_select(self, event):
        pass  # This method can be implemented if needed

    def add_task(self):
        requester = self.requester_entry.get()
        task_name = self.task_name_entry.get()

        if not requester or not task_name:
            messagebox.showwarning("Warning", "Please enter a requester and task name.")
            return

        c.execute("INSERT INTO tasks (requester, task_name, status) VALUES (?, ?, ?)", (requester, task_name, False))
        conn.commit()

        self.load_tasks()
        self.refresh_requester_dropdown() 
        
    def refresh_requester_dropdown(self):
        c.execute("SELECT DISTINCT requester FROM tasks ORDER BY requester")
        requesters = [""]
        requesters.extend(sorted([row[0] for row in c.fetchall()]))
        self.requester_entry['values'] = requesters
        self.requester_entry.set(requesters[0])  # Set the combobox to show the blank option by default
 
    def filter_tasks_by_requester(self, event=None):
        selected_requester = self.requester_entry.get()

        # Clear the listbox before inserting filtered tasks
        self.tasks_listbox.delete(0, tk.END)

        # If the blank option is selected, reset the filter to show all tasks
        if selected_requester == "":
            self.load_tasks()
        else:
            # Query for tasks with the selected requester
            c.execute("SELECT id, requester, task_name, status FROM tasks WHERE requester = ? ORDER BY requester", (selected_requester,))
            for row in c.fetchall():
                status = "Done ✅" if row[3] else "Not Done ❌"
                line = f"{row[0]}: {row[1]} - {row[2]} [{status}]"
                self.tasks_listbox.insert(tk.END, line)
 
    def mark_task_status(self, done):
        selected_items = self.tasks_listbox.curselection()
        if not selected_items:
            messagebox.showwarning("Warning", "Please select a task to mark as Done/Not Done.")
            return

        for selected_item in selected_items:
            task_id = self.tasks_listbox.get(selected_item).split(":")[0]
            c.execute("UPDATE tasks SET status = ? WHERE id = ?", (done, task_id,))
        conn.commit()

        self.load_tasks()
        self.refresh_day_windows()

    def delete_task(self):
        selected_items = self.tasks_listbox.curselection()
        if not selected_items:
            messagebox.showwarning("Warning", "Please select a task to delete.")
            return

        for selected_item in selected_items:
            task_id = self.tasks_listbox.get(selected_item).split(":")[0]
            c.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.commit()

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
            c.execute("UPDATE tasks SET day_assigned = ? WHERE id = ?", (day, task_id,))
        conn.commit()

        self.load_tasks()
        self.refresh_day_windows()

    def unassign_day_from_task(self):
        selected_items = self.tasks_listbox.curselection()
        if not selected_items:
            messagebox.showwarning("Warning", "Please select a task to unassign a day.")
            return

        for selected_item in selected_items:
            task_id = self.tasks_listbox.get(selected_item).split(":")[0]
            c.execute("UPDATE tasks SET day_assigned = NULL WHERE id = ?", (task_id,))
        conn.commit()

        self.load_tasks()
        self.refresh_day_windows()
        
    def load_tasks(self, filter_requester=None):
        self.tasks_listbox.delete(0, tk.END)
        query = "SELECT id, requester, task_name, status FROM tasks"
        parameters = ()
        if filter_requester and filter_requester != "":
            query += " WHERE requester = ?"
            parameters = (filter_requester,)
        query += " ORDER BY requester"
        c.execute(query, parameters)
        
        for row in c.fetchall():
            status = "Done ✅" if row[3] else "Not Done ❌"
            line = f"{row[0]}: {row[1]} - {row[2]} [{status}]"
            self.tasks_listbox.insert(tk.END, line)

        # Reset the filter if no specific requester is provided
        if not filter_requester:
            self.requester_entry.set('')

    def view_tasks_by_day(self):
        window = tk.Toplevel(self)
        window.title("Daily Task Schedule")
        window.geometry("800x500")
        
        # Set up a style for the Treeview content
        content_style = ttk.Style(window)
        content_style.configure("Treeview", font=('Helvetica', 12))  # Customize the font for the content

        # Set up a style for the Treeview Heading
        heading_style = ttk.Style(window)
        heading_style.configure("Treeview.Heading", font=('Helvetica', 14, 'bold'))  # Customize the font for the headings

        # Define columns
        columns = ('id', 'requester', 'task_name', 'status', 'day_assigned')
        tree = ttk.Treeview(window, columns=columns, show='headings', style="Treeview")

        # Define headings
        tree.heading('id', text='ID')
        tree.heading('requester', text='Requester')
        tree.heading('task_name', text='Task Name')
        tree.heading('status', text='Status')
        tree.heading('day_assigned', text='Day Assigned')

        # Define column width and alignment
        tree.column('id', width=30, anchor='center')
        tree.column('requester', width=100, anchor='w')
        tree.column('task_name', width=180, anchor='w')
        tree.column('status', width=80, anchor='center')
        tree.column('day_assigned', width=100, anchor='center')

        # Add data to the treeview
        for row in c.execute("SELECT id, requester, task_name, status, day_assigned FROM tasks WHERE day_assigned != '' ORDER BY day_assigned"):
            status = "Done ✅" if row[3] else "Not Done ❌"
            tree.insert("", tk.END, values=(row[0], row[1], row[2], status, row[4]))

        # Scrollbars for the Treeview
        vsb = ttk.Scrollbar(window, orient="vertical", command=tree.yview)
        vsb.pack(side='right', fill='y')
        hsb = ttk.Scrollbar(window, orient="horizontal", command=tree.xview)
        hsb.pack(side='bottom', fill='x')

        tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)
        tree.pack(fill=tk.BOTH, expand=True)

        self.day_windows[window] = tree  # Store reference to the window and its tree


    def refresh_day_windows(self):
        for window, tree in self.day_windows.items():
            if window.winfo_exists():  # Check if the window is open
                for item in tree.get_children():  # Get all items in the treeview
                    tree.delete(item)  # Delete the item

                # Re-populate the treeview with updated tasks
                # Only selecting tasks where day_assigned is NOT NULL or an empty string
                query = "SELECT id, requester, task_name, status, day_assigned FROM tasks WHERE day_assigned != '' ORDER BY day_assigned"
                for row in c.execute(query):
                    status = "Done ✅" if row[3] else "Not Done ❌"
                    # Insert the item into the treeview with a new row
                    tree.insert('', tk.END, values=(row[0], row[1], row[2], status, row[4]))

if __name__ == "__main__":
    app = TaskTracker()
    app.mainloop()
