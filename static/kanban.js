document.addEventListener('DOMContentLoaded', () => {
    // --- 1. ПЕРЕМЕННЫЕ КАНБАНА ---
    const columns = document.querySelectorAll('.kanban-column');
    const deleteZone = document.getElementById('deleteZone');
    let draggingCard = null;
    let placeholders = new Map();
    let dragOffset = { x: 0, y: 0 };

    // --- 2. ПЕРЕМЕННЫЕ МОДАЛЬНОГО ОКНА (СОЗДАНИЕ) ---
    const modal = document.getElementById('projectModal');
    const closeBtn = document.querySelector('.close-modal');
    const addProjectButtons = document.querySelectorAll('.open-modal-btn');
    const statusInput = document.getElementById('modalStatus');
    const addProjectForm = document.getElementById('addProjectForm');

    // --- 2.1 ПЕРЕМЕННЫЕ МОДАЛЬНОГО ОКНА (УДАЛЕНИЕ) ---
    const confirmDeleteModal = document.getElementById('confirmDeleteModal');
    const btnConfirmDelete = document.getElementById('confirmDelete');
    const btnCancelDelete = document.getElementById('cancelDelete');
    let projectToDeleteId = null; // Храним ID здесь, пока юзер думает

    const toggleBtns = document.querySelectorAll('.toggle-btn');
    const manualBlock = document.getElementById('manualCostBlock');
    const calcBlock = document.getElementById('calcCostBlock');

    // --- 3. ЛОГИКА МОДАЛЬНОГО ОКНА СОЗДАНИЯ ---

    addProjectButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const status = btn.dataset.status; 
            statusInput.value = status; 
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden'; 
        });
    });

    function closeModal() {
        modal.style.display = 'none';
        document.body.style.overflow = ''; 
        addProjectForm.reset();
        if(estimateRows) estimateRows.innerHTML = ''; 
        if(totalDisplay) totalDisplay.textContent = '0';
        switchCostMode('manual');
    }

    closeBtn.addEventListener('click', closeModal);
    
    // Закрытие модалок по клику на фон
    window.addEventListener('click', (e) => { 
        if (e.target === modal) closeModal(); 
        if (e.target === confirmDeleteModal) closeConfirmModal();
    });

    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            switchCostMode(btn.dataset.mode);
        });
    });

    function switchCostMode(mode) {
        toggleBtns.forEach(b => b.classList.remove('active'));
        const targetBtn = document.querySelector(`[data-mode="${mode}"]`);
        if (targetBtn) targetBtn.classList.add('active');

        if (mode === 'manual') {
            manualBlock.style.display = 'block';
            calcBlock.style.display = 'none';
        } else {
            manualBlock.style.display = 'none';
            calcBlock.style.display = 'block';
        }
    }

    // --- 4. ОТПРАВКА ФОРМЫ (СОЗДАНИЕ ПРОЕКТА) ---

    addProjectForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(addProjectForm);

        fetch('/add_project/', { 
            method: 'POST',
            body: formData,
            headers: { 'X-CSRFToken': getCookie('csrftoken') }
        })
        .then(response => response.json())
        .then(data => {
            const container = document.querySelector(`.kanban-column[data-status="${data.status}"] .kanban-cards`);
            const newCard = document.createElement('div');
            newCard.classList.add('project-card');
            newCard.setAttribute('draggable', 'true');
            newCard.setAttribute('data-project-id', data.id);
            
            newCard.innerHTML = `
                <div class="title">${data.title}</div>
                <div class="deadline">Дедлайн: ${data.deadline}</div>
                <div class="client">${data.client}</div>
                <div class="cost">${data.budget} ₽</div>
                <div class="payment-status not-paid">Не оплачен</div>
            `;

            container.prepend(newCard);
            initCardEvents(newCard); 
            closeModal();
        })
        .catch(err => console.error('Ошибка сохранения:', err));
    });

    // --- 5. ЛОГИКА ПЕРЕТАСКИВАНИЯ ---

    function initCardEvents(card) {
        card.addEventListener('dragstart', (e) => {
            draggingCard = card;
            const rect = card.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
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
            // НЕ обнуляем draggingCard здесь, если открыта модалка удаления
            if (confirmDeleteModal.style.display !== 'flex') {
                draggingCard = null;
            }
        });

        card.addEventListener('click', (e) => {
            if (card.classList.contains('dragging')) return;
            const id = card.dataset.projectId;
            if (id) window.location.href = `/projects/${id}/`; 
        });
    }

    document.querySelectorAll('.project-card').forEach(initCardEvents);

    // --- 6. ЛОГИКА УДАЛЕНИЯ (МОДАЛКА) ---

    function closeConfirmModal() {
        confirmDeleteModal.style.display = 'none';
        document.body.style.overflow = '';
        projectToDeleteId = null;
        if (draggingCard) {
            draggingCard.style.removeProperty('display');
            draggingCard = null;
        }
    }

    if (deleteZone) {
        deleteZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            deleteZone.classList.add('drag-over');
        });

        deleteZone.addEventListener('dragleave', () => {
            deleteZone.classList.remove('drag-over');
        });

        deleteZone.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!draggingCard) return;

            projectToDeleteId = draggingCard.dataset.projectId;
            
            // Показываем стильную модалку вместо confirm
            confirmDeleteModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            
            softClearAll();
        });
    }

    btnCancelDelete.addEventListener('click', closeConfirmModal);

    btnConfirmDelete.addEventListener('click', () => {
        if (!projectToDeleteId || !draggingCard) return;

        fetch(`/delete_project/${projectToDeleteId}/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': getCookie('csrftoken') }
        })
        .then(response => {
            if (response.ok) {
                // Анимация исчезновения
                draggingCard.style.transition = 'all 0.3s ease';
                draggingCard.style.transform = 'scale(0)';
                draggingCard.style.opacity = '0';
                
                setTimeout(() => {
                    draggingCard.remove();
                    closeConfirmModal();
                }, 300);
            }
        })
        .catch(err => console.error('Ошибка при удалении:', err));
    });

    // --- 7. КАНБАН ДВИЖОК (PLACEHOLDERS & DRAGOVER) ---

    columns.forEach(col => {
        const p = document.createElement('div');
        p.classList.add('kanban-placeholder');
        placeholders.set(col, p);
    });

    document.addEventListener('dragover', (e) => {
        e.preventDefault(); 
        if (!draggingCard) return;

        const isOverDelete = e.target.closest('#deleteZone');
        const mouseY = e.clientY;
        const targetHStr = placeholders.values().next().value.dataset.targetHeight;
        
        let bestCol = null;
        let maxArea = -1;

        columns.forEach(column => {
            const colRect = column.getBoundingClientRect();
            const overlapX = Math.max(0, Math.min(e.clientX + 150, colRect.right) - Math.max(e.clientX - 150, colRect.left));
            if (overlapX > maxArea) { maxArea = overlapX; bestCol = column; }
        });

        columns.forEach(column => {
            const placeholder = placeholders.get(column);
            const cardsContainer = column.querySelector('.kanban-cards');
            
            if (column === bestCol && !isOverDelete) {
                const afterElement = getDragAfterElement(cardsContainer, mouseY);
                if (afterElement == null) cardsContainer.appendChild(placeholder);
                else cardsContainer.insertBefore(placeholder, afterElement);
                
                placeholder.style.height = targetHStr;
                placeholder.classList.add('visible');
                column.classList.add('drop-target-active');
            } else {
                placeholder.classList.remove('visible');
                placeholder.style.height = '0px';
                column.classList.remove('drop-target-active');
            }
        });
    });

    document.addEventListener('drop', (e) => {
        if (e.target.closest('#deleteZone')) return;

        e.preventDefault();
        if (!draggingCard) return;
        const activeCol = document.querySelector('.kanban-column.drop-target-active');
        if (!activeCol) { softClearAll(); return; }
        
        const placeholder = placeholders.get(activeCol);
        if (placeholder && placeholder.parentNode) {
            draggingCard.style.removeProperty('display');
            placeholder.parentNode.replaceChild(draggingCard, placeholder);
            sendUpdate(draggingCard.dataset.projectId, activeCol.dataset.status, buildOrderList(activeCol.querySelector('.kanban-cards')));
            softClearAll();
        }
    });

    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    function buildOrderList(container) {
        return [...container.querySelectorAll('.project-card')]
            .map((c, idx) => ({ id: c.dataset.projectId, order: idx + 1 }));
    }

    function softClearAll() {
        placeholders.forEach(p => {
            p.classList.remove('visible');
            p.style.height = '0px';
        });
        columns.forEach(c => c.classList.remove('drop-target-active'));
    }

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.project-card:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
            return closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function sendUpdate(projectId, newStatus, orderList) {
        fetch('/update_status/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            body: JSON.stringify({ project_id: projectId, status: newStatus, order_list: orderList })
        }).catch(err => console.error('Ошибка:', err));
    }

    // --- 8. ЛОГИКА КАЛЬКУЛЯТОРА ---
    const estimateRows = document.getElementById('estimateRows');
    const addServiceRowBtn = document.getElementById('addServiceRow');
    const totalDisplay = document.getElementById('totalDisplay');
    const manualPriceInput = document.getElementById('manualPrice');

    if (addServiceRowBtn) {
        addServiceRowBtn.addEventListener('click', () => {
            const row = document.createElement('div');
            row.classList.add('estimate-row');
            row.innerHTML = `
                <input type="text" placeholder="Услуга" class="service-name">
                <input type="number" placeholder="Цена" class="service-price">
                <button type="button" class="remove-row">&times;</button>
            `;
            estimateRows.appendChild(row);
            row.querySelector('.remove-row').addEventListener('click', () => { row.remove(); calculateTotal(); });
            row.querySelector('.service-price').addEventListener('input', calculateTotal);
        });
    }

    function calculateTotal() {
        let total = 0;
        document.querySelectorAll('.service-price').forEach(input => {
            total += parseFloat(input.value) || 0;
        });
        if(totalDisplay) totalDisplay.textContent = total.toLocaleString('ru-RU');
        if(manualPriceInput) manualPriceInput.value = total;
    }
});

const projectId = "{{ project.id }}";

// --- РЕДАКТИРОВАНИЕ ЗАМЕТОК ---
function editNotes() {
    const display = document.getElementById('notesDisplay');
    const editor = document.getElementById('notesEditor');
    editor.value = display.innerText === "Нажмите, чтобы добавить заметки..." ? "" : display.innerText;
    display.style.display = 'none';
    editor.style.display = 'block';
    editor.focus();
}

function saveNotes() {
    const display = document.getElementById('notesDisplay');
    const editor = document.getElementById('notesEditor');
    const newText = editor.value;

    fetch(`/projects/${projectId}/update_notes/`, {
        method: 'POST',
        headers: { 'X-CSRFToken': '{{ csrf_token }}', 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: newText })
    }).then(() => {
        display.innerText = newText || "Нажмите, чтобы добавить заметки...";
        editor.style.display = 'none';
        display.style.display = 'block';
    });
}

// --- БЫСТРОЕ ДОБАВЛЕНИЕ ЗАДАЧИ ---
function addTask(status) {
    const container = document.querySelector(`.kanban-column[data-status="${status}"] .kanban-cards`);
    const inputDiv = document.createElement('div');
    inputDiv.className = 'inline-task-input';
    inputDiv.innerHTML = `<input type="text" placeholder="Название задачи..." onblur="submitTask(this, '${status}')" onkeyup="if(event.key==='Enter') this.blur()">`;
    
    container.prepend(inputDiv);
    inputDiv.querySelector('input').focus();
}

function submitTask(input, status) {
    const title = input.value;
    if (!title) { input.parentElement.remove(); return; }

    fetch(`/projects/${projectId}/add_task/`, {
        method: 'POST',
        headers: { 'X-CSRFToken': '{{ csrf_token }}', 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title, status: status })
    }).then(res => res.json()).then(data => {
        location.reload(); // Для простоты пока обновим, чтобы применились стили Django
    });
}

function updatePaymentStatus(newStatus) {
    const select = document.getElementById('paymentStatusSelect');
    const projectId = "{{ project.id }}";

    fetch(`/projects/${projectId}/update_payment/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': '{{ csrf_token }}'
        },
        body: JSON.stringify({ 'payment_status': newStatus })
    })
    .then(response => {
        if (response.ok) {
            // Только если сервер ответил 200 OK, меняем цвет
            select.classList.remove('paid', 'pending', 'not_paid');
            select.classList.add(newStatus);
        } else {
            alert('Ошибка при сохранении на сервере');
        }
    })
    .catch(error => alert('Ошибка сети'));
}