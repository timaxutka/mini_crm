document.addEventListener('DOMContentLoaded', () => {
    // --- 1. ПЕРЕМЕННЫЕ ---
    const columns = document.querySelectorAll('.kanban-column');
    const deleteZone = document.getElementById('deleteZone');
    const kanbanBoard = document.querySelector('.kanban-board');
    let draggingCard = null;
    let placeholders = new Map();

    // --- 2. МОДАЛЬНЫЕ ОКНА И КНОПКИ ---
    const modal = document.getElementById('projectModal');
    const closeBtn = document.querySelector('.close-modal');
    const addProjectButtons = document.querySelectorAll('.open-modal-btn');
    const addProjectForm = document.getElementById('addProjectForm');
    const confirmDeleteModal = document.getElementById('confirmDeleteModal');
    const btnConfirmDelete = document.getElementById('confirmDelete');
    const btnCancelDelete = document.getElementById('cancelDelete');
    let itemToDelete = { id: null, model: null };

    // --- УНИВЕРСАЛЬНЫЕ ФУНКЦИИ (БЕЗ ДУБЛЕЙ) ---
    function getCookie(name) {
        return document.cookie.split(';').find(c => c.trim().startsWith(name + '='))?.split('=')[1];
    }

    function softClearAll() {
        placeholders.forEach(p => { p.classList.remove('visible'); p.style.height = '0px'; });
        columns.forEach(c => c.classList.remove('drop-target-active'));
    }

    function closeConfirmModal() {
        if (confirmDeleteModal) {
            confirmDeleteModal.style.display = 'none';
            document.body.style.overflow = '';
        }
        draggingCard = null;
        itemToDelete = { id: null, model: null };
        if (deleteZone) deleteZone.classList.remove('drag-over');
    }

    // --- УНИВЕРСАЛЬНЫЙ СЛУШАТЕЛЬ КРЕСТИКОВ И МОДАЛОК ---
    document.addEventListener('click', (e) => {
        // Если кликнули на крестик
        if (e.target.classList.contains('close-modal')) {
            const modal = e.target.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
                document.body.style.overflow = '';
            }
        }
        // Если кликнули на фон (вне модалки)
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
            document.body.style.overflow = '';
        }
    });

    // --- 3. ЛОГИКА СОЗДАНИЯ ПРОЕКТА (С ЗАЩИТОЙ ОТ NULL) ---
    if (addProjectForm) {
        addProjectButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const statusInput = document.getElementById('modalStatus');
                if (statusInput) statusInput.value = btn.dataset.status;
                if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
            });
        });

        addProjectForm.addEventListener('submit', (e) => {
            e.preventDefault();
            fetch('/add_project/', { method: 'POST', body: new FormData(addProjectForm), headers: { 'X-CSRFToken': getCookie('csrftoken') } })
            .then(res => res.json())
            .then(data => { if (data.success) location.reload(); });
        });
    }

    // --- 4. ПЕРЕТАСКИВАНИЕ И СОБЫТИЯ ---
    function initCardEvents(card) {
        card.setAttribute('draggable', 'true');
        card.addEventListener('dragstart', (e) => {
            draggingCard = card;
            const cardHeight = card.offsetHeight;
            placeholders.forEach(p => { p.dataset.targetHeight = cardHeight + 'px'; });
            if (deleteZone) deleteZone.classList.add('active');
            requestAnimationFrame(() => card.classList.add('dragging'));
        });

        card.addEventListener('dragend', () => {
            softClearAll();
            if (deleteZone) deleteZone.classList.remove('active', 'drag-over');
            if (draggingCard) draggingCard.classList.remove('dragging');
        });

        card.addEventListener('click', (e) => {
            if (card.classList.contains('dragging')) return;
            if (card.dataset.url) window.location.href = card.dataset.url;
        });
    }

    document.querySelectorAll('.project-card').forEach(initCardEvents);

    // --- 5. УДАЛЕНИЕ (УНИВЕРСАЛЬНОЕ) ---
    if (deleteZone) {
        deleteZone.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!draggingCard) return;
            itemToDelete = { id: draggingCard.dataset.id, model: draggingCard.dataset.model };
            if (confirmDeleteModal) confirmDeleteModal.style.display = 'flex';
        });
        deleteZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            clearTimeout(dragLeaveTimer); // Отменяем возврат, если мы все еще тут
            deleteZone.classList.add('drag-over');
        });

        deleteZone.addEventListener('dragleave', (e) => {
            // Задержка перед расширением (300мс)
            dragLeaveTimer = setTimeout(() => {
                deleteZone.classList.remove('drag-over');
            }, 300);
        });
    }

    btnConfirmDelete?.addEventListener('click', () => {
        if (!itemToDelete.id) return;
        const url = `/delete_${itemToDelete.model.toLowerCase()}/${itemToDelete.id}/`;
        fetch(url, { method: 'POST', headers: { 'X-CSRFToken': getCookie('csrftoken') } })
        .then(res => { if (res.ok) { draggingCard.remove(); closeConfirmModal(); } });
    });

    btnCancelDelete?.addEventListener('click', closeConfirmModal);

    // --- 6. КАНБАН ДВИЖОК (PLACEHOLDERS) ---
    columns.forEach(col => {
        const p = document.createElement('div');
        p.classList.add('kanban-placeholder');
        placeholders.set(col, p);
    });

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggingCard) return;
        
        let bestCol = null;
        let maxArea = -1;
        columns.forEach(column => {
            const rect = column.getBoundingClientRect();
            const overlap = Math.max(0, Math.min(e.clientX + 50, rect.right) - Math.max(e.clientX - 50, rect.left));
            if (overlap > maxArea) { maxArea = overlap; bestCol = column; }
        });

        columns.forEach(col => {
            const p = placeholders.get(col);
            if (col === bestCol && !e.target.closest('#deleteZone')) {
                const container = col.querySelector('.kanban-cards');
                const after = [...container.querySelectorAll('.project-card:not(.dragging)')].reduce((closest, child) => {
                    const box = child.getBoundingClientRect();
                    const offset = e.clientY - box.top - box.height / 2;
                    return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
                }, { offset: Number.NEGATIVE_INFINITY }).element;
                
                after == null ? container.appendChild(p) : container.insertBefore(p, after);
                p.style.height = p.dataset.targetHeight;
                p.classList.add('visible');
                col.classList.add('drop-target-active');
            } else {
                p.classList.remove('visible');
                p.style.height = '0px';
                col.classList.remove('drop-target-active');
            }
        });
    });

    document.addEventListener('drop', (e) => {
        if (e.target.closest('#deleteZone')) return;
        e.preventDefault();
        
        const activeCol = document.querySelector('.kanban-column.drop-target-active');
        if (activeCol && draggingCard) {
            // 1. Вставляем карточку на место плейсхолдера
            const p = placeholders.get(activeCol);
            p.parentNode.replaceChild(draggingCard, p);
            
            // 2. СОБИРАЕМ ПОРЯДОК всей колонки
            const cards = Array.from(activeCol.querySelectorAll('.project-card'));
            const orderList = cards.map((card, index) => ({
                id: card.dataset.id,
                order: index + 1 // Новые позиции от 1 до N
            }));

            // 3. Отправляем ОДИН точный запрос
            if (kanbanBoard) {
                fetch(kanbanBoard.dataset.updateUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
                    body: JSON.stringify({ 
                        project_id: draggingCard.dataset.id, 
                        status: activeCol.dataset.status, 
                        order_list: orderList 
                    })
                });
            }
            softClearAll();
        }
    });

    // Делаем инициализатор доступным глобально, чтобы проект мог его дернуть
    window.initAllCards = () => {
        document.querySelectorAll('.project-card').forEach(initCardEvents);
    };
});