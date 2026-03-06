document.addEventListener('DOMContentLoaded', () => {
    // Получаем ID проекта, если он есть в DOM
    const projectElement = document.querySelector('[data-project-id]');
    const projectId = projectElement ? projectElement.dataset.projectId : null;

    // --- 1. КАНБАН ДВИЖОК (ДЕЛЕГИРОВАНИЕ) ---
    const board = document.querySelector('.kanban-board');
    if (!board) return;

    let draggingCard = null;
    let placeholders = new Map();

    // Инициализация плейсхолдеров
    document.querySelectorAll('.kanban-column').forEach(col => {
        const p = document.createElement('div');
        p.classList.add('kanban-placeholder');
        placeholders.set(col, p);
        col.querySelector('.kanban-cards').appendChild(p);
    });

    // Делегируем события на всю доску
    board.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.project-card');
        if (!card) return;
        
        draggingCard = card;
        card.classList.add('dragging');
        
        // Устанавливаем высоту плейсхолдера
        const cardHeight = card.offsetHeight;
        placeholders.forEach(p => p.dataset.targetHeight = cardHeight + 'px');
    });

    board.addEventListener('dragend', (e) => {
        const card = e.target.closest('.project-card');
        if (card) card.classList.remove('dragging');
        softClearAll();
        draggingCard = null;
    });

    board.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggingCard) return;
        
        const column = e.target.closest('.kanban-column');
        if (!column) return;

        const container = column.querySelector('.kanban-cards');
        const placeholder = placeholders.get(column);
        
        const after = getDragAfterElement(container, e.clientY);
        after == null ? container.appendChild(placeholder) : container.insertBefore(placeholder, after);
        placeholder.classList.add('visible');
    });

    board.addEventListener('drop', (e) => {
        e.preventDefault();
        const column = e.target.closest('.kanban-column');
        const placeholder = column?.querySelector('.kanban-placeholder.visible');
        
        if (placeholder && draggingCard) {
            placeholder.parentNode.replaceChild(draggingCard, placeholder);
            sendUpdate(draggingCard, column.dataset.status);
            softClearAll();
        }
    });

    // --- 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
    function softClearAll() {
        document.querySelectorAll('.kanban-placeholder').forEach(p => p.classList.remove('visible'));
    }

    function getDragAfterElement(container, y) {
        const els = [...container.querySelectorAll('.project-card:not(.dragging)')];
        return els.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function sendUpdate(element, newStatus) {
        const isTask = element.hasAttribute('data-task-id');
        const url = isTask ? '/update_task_status/' : '/update_status/';
        const body = isTask 
            ? { task_id: element.dataset.taskId, status: newStatus } 
            : { project_id: element.dataset.projectId, status: newStatus };

        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            body: JSON.stringify(body)
        }).catch(err => console.error('Ошибка:', err));
    }

    // --- 3. ФУНКЦИИ УПРАВЛЕНИЯ (БЕЗ КАНБАНА) ---
    window.openTaskModal = (status) => {
        document.getElementById('taskStatus').value = status;
        document.getElementById('taskModal').style.display = 'flex';
    };

    window.closeTaskModal = () => document.getElementById('taskModal').style.display = 'none';

    document.getElementById('addTaskForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const pId = document.getElementById('project_id_hidden')?.value || projectId;
        const taskData = {
            title: this.querySelector('input[name="title"]').value,
            description: this.querySelector('textarea[name="description"]').value,
            status: document.getElementById('taskStatus').value
        };

        fetch(`/projects/${pId}/add_task/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            body: JSON.stringify(taskData)
        })
        .then(res => res.json())
        .then(data => {
            const container = document.querySelector(`.kanban-column[data-status="${data.status}"] .kanban-cards`);
            if (container) {
                const newCard = document.createElement('div');
                newCard.className = 'project-card';
                newCard.dataset.taskId = data.id;
                newCard.setAttribute('draggable', 'true');
                newCard.innerHTML = `<p class="title" style="font-size: 14px; margin-bottom: 5px;">${data.title}</p>`;
                container.appendChild(newCard);
            }
            window.closeTaskModal();
            this.reset();
        });
    });

    function getCookie(name) {
        return document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))?.[2];
    }
});