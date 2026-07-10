document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const taskInput = document.getElementById('taskInput');
    const categorySelect = document.getElementById('category');
    const prioritySelect = document.getElementById('priority');
    const dueDateInput = document.getElementById('dueDate');
    const addBtn = document.getElementById('addBtn');
    const taskList = document.getElementById('taskList');
    const totalTasksEl = document.getElementById('totalTasks');
    const completedTasksEl = document.getElementById('completedTasks');
    const remainingTasksEl = document.getElementById('remainingTasks');
    const progressBar = document.getElementById('progressBar');
    const searchInput = document.getElementById('searchInput');
    const themeBtn = document.getElementById('themeBtn');
    const toast = document.getElementById('toast');

    // --- State ---
    let tasks = JSON.parse(localStorage.getItem('tasks')) || [];

    // --- Core Initialization ---
    const init = () => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') document.body.classList.add('dark');
        renderTasks();
    };

    // --- Utility: Date Formatting ---
    const formatDate = (dateStr) => {
        if (!dateStr) return 'No Due Date';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    // --- Toast Notification ---
    const showToast = (message) => {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    };

    // --- Save & Update ---
    const saveAndRefresh = () => {
        localStorage.setItem('tasks', JSON.stringify(tasks));
        renderTasks();
    };

    // --- Statistics & Progress ---
    const updateStats = () => {
        const total = tasks.length;
        const completed = tasks.filter(t => t.completed).length;
        
        totalTasksEl.textContent = total;
        completedTasksEl.textContent = completed;
        remainingTasksEl.textContent = total - completed;

        const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
        progressBar.style.width = `${percent}%`;
        progressBar.textContent = `${percent}%`;
    };

    // --- Rendering ---
    const renderTasks = (filter = '') => {
        taskList.innerHTML = '';
        const filtered = tasks.filter(t => t.text.toLowerCase().includes(filter.toLowerCase()));

        if (filtered.length === 0) {
            taskList.innerHTML = `<li class="empty-state">📋<br>No Tasks Found<br>Add your first task.</li>`;
        } else {
            filtered.forEach(task => {
                const li = document.createElement('li');
                li.className = `task ${task.completed ? 'completed' : ''}`;
                li.innerHTML = `
                    <div class="task-left">
                        <span class="task-title">${task.text}</span>
                        <span class="category">${task.category}</span>
                        <span class="date">${formatDate(task.dueDate)}</span>
                        <span class="priority ${task.priority.toLowerCase()}">${task.priority}</span>
                    </div>
                    <div class="task-right">
                        <button class="icon-btn complete-btn" onclick="toggleComplete(${task.id})">✓</button>
                        <button class="icon-btn edit-btn" onclick="editTask(${task.id})">✎</button>
                        <button class="icon-btn delete-btn" onclick="deleteTask(${task.id})">✕</button>
                    </div>
                `;
                taskList.appendChild(li);
            });
        }
        updateStats();
    };

    // --- CRUD Functions ---
    window.toggleComplete = (id) => {
        tasks = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
        showToast('Task status updated');
        saveAndRefresh();
    };

    window.deleteTask = (id) => {
        tasks = tasks.filter(t => t.id !== id);
        showToast('Task deleted');
        saveAndRefresh();
    };

    window.editTask = (id) => {
        const task = tasks.find(t => t.id === id);
        const newText = prompt('Edit task:', task.text);
        if (newText !== null && newText.trim() !== '') {
            tasks = tasks.map(t => t.id === id ? { ...t, text: newText.trim() } : t);
            showToast('Task updated');
            saveAndRefresh();
        }
    };

    const addTask = () => {
        const text = taskInput.value.trim();
        if (!text) return;

        const newTask = {
            id: Date.now(),
            text,
            category: categorySelect.value,
            priority: prioritySelect.value,
            dueDate: dueDateInput.value,
            completed: false
        };

        tasks.push(newTask);
        taskInput.value = '';
        taskInput.focus();
        showToast('Task added');
        saveAndRefresh();
    };

    // --- Event Listeners ---
    addBtn.addEventListener('click', addTask);
    
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });

    searchInput.addEventListener('keyup', (e) => renderTasks(e.target.value));

    themeBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark');
        const isDark = document.body.classList.contains('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        themeBtn.textContent = isDark ? '☀️' : '🌙';
    });

    // --- Init ---
    init();
});
