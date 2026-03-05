document.addEventListener('DOMContentLoaded', () => {
    const columns = document.querySelectorAll('.kanban-column');
    let draggingCard = null;
    
    // Создаем плейсхолдер один раз
    const placeholder = document.createElement('div');
    placeholder.classList.add('kanban-placeholder');

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

    function buildOrderList(cardsContainer) {
        return [...cardsContainer.querySelectorAll('.project-card')]
            .map((c, idx) => ({ id: c.dataset.projectId, order: idx + 1 }));
    }

    function sendUpdate(projectId, newStatus, orderList) {
        fetch('/update_status/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({
                project_id: projectId,
                status: newStatus,
                order_list: orderList
            })
        }).catch(err => console.error('Error saving:', err));
    }

    document.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('dragstart', (e) => {
            draggingCard = card;
            e.dataTransfer.effectAllowed = 'move';
            
            // Запоминаем высоту карточки для плейсхолдера
            const cardHeight = card.offsetHeight;
            placeholder.dataset.targetHeight = cardHeight;
            
            requestAnimationFrame(() => {
                card.classList.add('dragging');
            });
        });

        card.addEventListener('dragend', () => {
            if (draggingCard) draggingCard.classList.remove('dragging');
            placeholder.classList.remove('visible');
            placeholder.style.height = '0px';
            if (placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
            
            document.querySelectorAll('.kanban-cards').forEach(c => c.classList.remove('drag-over'));
            draggingCard = null;
        });
    });

    columns.forEach(column => {
        const cardsContainer = column.querySelector('.kanban-cards');

        column.addEventListener('dragover', (e) => {
            e.preventDefault();
            cardsContainer.classList.add('drag-over');

            const afterElement = getDragAfterElement(cardsContainer, e.clientY);
            const targetHeight = placeholder.dataset.targetHeight + 'px';

            // Если плейсхолдера еще нет в этой колонке или он на другом месте
            if (afterElement == null) {
                if (cardsContainer.lastElementChild !== placeholder) {
                    cardsContainer.appendChild(placeholder);
                    // Trigger reflow для запуска анимации
                    void placeholder.offsetWidth; 
                    placeholder.style.height = targetHeight;
                    placeholder.classList.add('visible');
                }
            } else {
                if (afterElement.previousElementSibling !== placeholder && afterElement !== placeholder) {
                    cardsContainer.insertBefore(placeholder, afterElement);
                    void placeholder.offsetWidth;
                    placeholder.style.height = targetHeight;
                    placeholder.classList.add('visible');
                }
            }
        });

        column.addEventListener('dragleave', (e) => {
            if (!cardsContainer.contains(e.relatedTarget)) {
                cardsContainer.classList.remove('drag-over');
                placeholder.classList.remove('visible');
                placeholder.style.height = '0px';
            }
        });

        column.addEventListener('drop', (e) => {
            e.preventDefault();
            cardsContainer.classList.remove('drag-over');

            if (!draggingCard) return;

            // Мгновенно заменяем плейсхолдер карточкой
            placeholder.parentNode.replaceChild(draggingCard, placeholder);
            draggingCard.classList.remove('dragging');

            const orderList = buildOrderList(cardsContainer);
            sendUpdate(draggingCard.dataset.projectId, column.dataset.status, orderList);
        });
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.project-card:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
});