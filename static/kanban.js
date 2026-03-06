document.addEventListener('DOMContentLoaded', () => {
    // --- 1. ПЕРЕМЕННЫЕ КАНБАНА ---
    const columns = document.querySelectorAll('.kanban-column');
    const deleteZone = document.getElementById('deleteZone');
    const kanbanBoard = document.querySelector('.kanban-board');
    let draggingCard = null;
    let placeholders = new Map();

    // --- 2. МОДАЛЬНЫЕ ОКНА ---
    const modal = document.getElementById('projectModal');
    const closeBtn = document.querySelector('.close-modal');
    const addProjectButtons = document.querySelectorAll('.open-modal-btn');
    const statusInput = document.getElementById('modalStatus');
    const addProjectForm = document.getElementById('addProjectForm');
    const confirmDeleteModal = document.getElementById('confirmDeleteModal');
    const btnConfirmDelete = document.getElementById('confirmDelete');
    const btnCancelDelete = document.getElementById('cancelDelete');
    let itemToDelete = { id: null, model: null };

    // --- ЗАКРЫТИЕ МОДАЛКИ (КРЕСТИК) ---
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            document.body.style.overflow = ''; // Возвращаем скролл страницы
        });
    }

    // БОНУС: Закрытие при клике на фон (за пределами окна)
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    });

    // --- 3. ЛОГИКА СОЗДАНИЯ (МОДАЛКА) ---
    addProjectButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            if (statusInput) statusInput.value = btn.dataset.status;
            if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
        });
    });

    // --- 3.1. ОБРАБОТКА ОТПРАВКИ ФОРМЫ ---
    addProjectForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(addProjectForm);

        fetch('/add_project/', {
            method: 'POST',
            body: formData,
            headers: { 'X-CSRFToken': getCookie('csrftoken') }
        })
        .then(response => {
            // ДОБАВИТЬ ЭТО:
            return response.text().then(text => {
                console.log("Сырой ответ сервера:", text);
                try {
                    return JSON.parse(text);
                } catch (e) {
                    throw new Error("Сервер вернул не JSON: " + text.substring(0, 50));
                }
            });
        })
        .then(data => {
            if (data.success) {
                // 1. Создаем элемент карточки
                const newCard = document.createElement('div');
                newCard.className = 'project-card';
                newCard.draggable = true;
                newCard.dataset.id = data.id;
                newCard.dataset.model = 'Project';
                newCard.dataset.url = `/projects/${data.id}/`;
                newCard.innerHTML = `
                    <div class="title">${data.title}</div>
                    <div class="deadline">Дедлайн: ${data.deadline || '—'}</div>
                    <div class="client">${data.client || 'Нет клиента'}</div>
                    <div class="cost">${data.cost || '—'}</div>
                    <div class="payment-status not-paid">Не оплачен</div>
                `;
                
                // 2. Инициализируем события для новой карточки (чтобы она двигалась!)
                initCardEvents(newCard);

                // 3. Добавляем в DOM
                const column = document.querySelector(`.kanban-column[data-status="${data.status}"]`);
                if (column) {
                    column.querySelector('.kanban-cards').appendChild(newCard);
                }

                // 4. ЗАКРЫВАЕМ МОДАЛКУ И СБРАСЫВАЕМ ФОРМУ
                modal.style.display = 'none';
                document.body.style.overflow = '';
                addProjectForm.reset();
                
            } else {
                console.error('Ошибка от сервера:', data);
                alert('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
            }
        })
        .catch(err => {
            console.error('Fetch error:', err);
            alert('Ошибка связи с сервером');
        });
    });

    // --- 4. ПЕРЕТАСКИВАНИЕ И СОБЫТИЯ ---
    function initCardEvents(card) {
        card.setAttribute('draggable', 'true');
        card.addEventListener('dragstart', (e) => {
            draggingCard = card;
            const cardHeight = card.offsetHeight;
            placeholders.forEach(p => { p.dataset.targetHeight = cardHeight + 'px'; });
            if (deleteZone) deleteZone.classList.add('active');
            requestAnimationFrame(() => {
                card.classList.add('dragging');
                card.style.setProperty('display', 'none', 'important');
            });
        });

        card.addEventListener('dragend', () => {
            softClearAll();
            if (deleteZone) deleteZone.classList.remove('active', 'drag-over');
            if (draggingCard) {
                draggingCard.classList.remove('dragging');
                draggingCard.style.removeProperty('display');
            }
            if (confirmDeleteModal?.style.display !== 'flex') draggingCard = null;
        });

        card.addEventListener('click', (e) => {
            if (card.classList.contains('dragging')) return;
            // Переход по data-url, если задан
            if (card.dataset.url) window.location.href = card.dataset.url;
        });
    }

    document.querySelectorAll('.project-card').forEach(initCardEvents);

    // --- 5. УДАЛЕНИЕ ---
    if (deleteZone) {
        deleteZone.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!draggingCard) return;
            
            // Сохраняем ссылку на карточку и ID
            itemToDelete = { id: draggingCard.dataset.id, model: draggingCard.dataset.model };
            
            // Открываем подтверждение
            confirmDeleteModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            softClearAll();
        });
        
        deleteZone.addEventListener('dragover', (e) => { e.preventDefault(); deleteZone.classList.add('drag-over'); });
        deleteZone.addEventListener('dragleave', () => deleteZone.classList.remove('drag-over'));
    }

    // Подтверждение удаления
    btnConfirmDelete?.addEventListener('click', () => {
        if (!itemToDelete.id) return;
        
        // URL должен совпадать с тем, что вы прописали в urls.py (например: /delete_project/id/)
        const url = `/delete_${itemToDelete.model.toLowerCase()}/${itemToDelete.id}/`;
        
        fetch(url, { 
            method: 'POST', 
            headers: { 'X-CSRFToken': getCookie('csrftoken') } 
        })
        .then(res => { 
            if (res.ok) { 
                draggingCard.remove(); // Удаляем карточку из DOM
                closeConfirmModal(); 
            } else {
                alert('Ошибка при удалении');
            }
        })
        .catch(err => console.error(err));
    });

    // Кнопка ОТМЕНА (вот чего не хватало)
    btnCancelDelete?.addEventListener('click', () => {
        closeConfirmModal();
    });

    // Единая функция закрытия
    function closeConfirmModal() {
        confirmDeleteModal.style.display = 'none';
        document.body.style.overflow = '';
        draggingCard = null; // Освобождаем "захваченную" карточку
        itemToDelete = { id: null, model: null };
        deleteZone.classList.remove('drag-over');
    }

    // --- 6. КАНБАН ДВИЖОК (PLACEHOLDERS) ---
    columns.forEach(col => {
        const p = document.createElement('div');
        p.classList.add('kanban-placeholder');
        placeholders.set(col, p);
    });

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggingCard) return;
        
        // Логика выбора колонки по площади перекрытия
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
                const after = getDragAfterElement(container, e.clientY);
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
            const p = placeholders.get(activeCol);
            p.parentNode.replaceChild(draggingCard, p);
            draggingCard.style.removeProperty('display');
            
            // ОТПРАВКА ОБНОВЛЕНИЯ
            sendUpdate(
                draggingCard.dataset.id, 
                activeCol.dataset.status, 
                buildOrderList(activeCol.querySelector('.kanban-cards')),
                draggingCard.dataset.model
            );
            softClearAll();
        }
    });

    // --- 7. HELPER FUNCTIONS ---
    function sendUpdate(id, status, orderList, model) {
        fetch(kanbanBoard.dataset.updateUrl || '/update_status/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            body: JSON.stringify({ id, status, order_list: orderList, model })
        }).catch(console.error);
    }

    function buildOrderList(container) {
        return [...container.querySelectorAll('.project-card')]
            .map((c, idx) => ({ id: c.dataset.id, order: idx + 1 }));
    }

    function getDragAfterElement(container, y) {
        const els = [...container.querySelectorAll('.project-card:not(.dragging)')];
        return els.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function getCookie(name) {
        return document.cookie.split(';').find(c => c.trim().startsWith(name + '='))?.split('=')[1];
    }

    function softClearAll() {
        placeholders.forEach(p => { p.classList.remove('visible'); p.style.height = '0px'; });
        columns.forEach(c => c.classList.remove('drop-target-active'));
    }
    
    function closeConfirmModal() {
        confirmDeleteModal.style.display = 'none';
        document.body.style.overflow = '';
        draggingCard = null;
    }

    // --- 5. УДАЛЕНИЕ ---
    if (deleteZone) {
        deleteZone.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!draggingCard) return;
            
            // Сохраняем ссылку на карточку и ID
            itemToDelete = { id: draggingCard.dataset.id, model: draggingCard.dataset.model };
            
            // Открываем подтверждение
            confirmDeleteModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            softClearAll();
        });
        
        deleteZone.addEventListener('dragover', (e) => { e.preventDefault(); deleteZone.classList.add('drag-over'); });
        deleteZone.addEventListener('dragleave', () => deleteZone.classList.remove('drag-over'));
    }

    // Подтверждение удаления
    btnConfirmDelete?.addEventListener('click', () => {
        if (!itemToDelete.id) return;
        
        // URL должен совпадать с тем, что вы прописали в urls.py (например: /delete_project/id/)
        const url = `/delete_${itemToDelete.model.toLowerCase()}/${itemToDelete.id}/`;
        
        fetch(url, { 
            method: 'POST', 
            headers: { 'X-CSRFToken': getCookie('csrftoken') } 
        })
        .then(res => { 
            if (res.ok) { 
                draggingCard.remove(); // Удаляем карточку из DOM
                closeConfirmModal(); 
            } else {
                alert('Ошибка при удалении');
            }
        })
        .catch(err => console.error(err));
    });

    // Кнопка ОТМЕНА (вот чего не хватало)
    btnCancelDelete?.addEventListener('click', () => {
        closeConfirmModal();
    });

    // Единая функция закрытия
    function closeConfirmModal() {
        confirmDeleteModal.style.display = 'none';
        document.body.style.overflow = '';
        draggingCard = null; // Освобождаем "захваченную" карточку
        itemToDelete = { id: null, model: null };
        deleteZone.classList.remove('drag-over');
    }

});