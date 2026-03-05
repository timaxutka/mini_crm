document.addEventListener('DOMContentLoaded', () => {
    const columns = document.querySelectorAll('.kanban-column');
    let draggingCard = null;
    let placeholders = new Map();

    columns.forEach(col => {
        const p = document.createElement('div');
        p.classList.add('kanban-placeholder');
        placeholders.set(col, p);
    });

    // ... (getCookie, sendUpdate, buildOrderList остаются без изменений) ...

    document.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('dragstart', (e) => {
            draggingCard = card;
            const cardHeight = card.offsetHeight;
            placeholders.forEach(p => {
                p.dataset.targetHeight = cardHeight + 'px';
                p.style.height = '0px'; // Сбрасываем перед началом
            });
            requestAnimationFrame(() => card.classList.add('dragging'));
        });

        card.addEventListener('dragend', () => {
            placeholders.forEach(p => {
                p.style.height = '0px';
                p.classList.remove('visible');
                setTimeout(() => { if (p.parentNode) p.parentNode.removeChild(p); }, 300);
            });
            columns.forEach(c => c.classList.remove('drop-target-active'));
            if (draggingCard) draggingCard.classList.remove('dragging');
            draggingCard = null;
        });
    });

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggingCard) return;

        const mouseX = e.clientX;
        const mouseY = e.clientY;
        const cardWidth = draggingCard.offsetWidth;
        const cardLeft = mouseX - cardWidth / 2;
        const cardRight = mouseX + cardWidth / 2;

        let closestCol = null;
        let minDistance = Infinity;

        columns.forEach(column => {
            const rect = column.getBoundingClientRect();
            const cardsContainer = column.querySelector('.kanban-cards');
            const placeholder = placeholders.get(column);
            const isTouching = (cardLeft < rect.right + 30 && cardRight > rect.left - 30);

            if (isTouching) {
                const afterElement = getDragAfterElement(cardsContainer, mouseY);
                const targetH = placeholder.dataset.targetHeight;

                // Если плейсхолдера нет в DOM или он должен сменить позицию
                if (placeholder.nextElementSibling !== afterElement || !placeholder.parentNode) {
                    
                    // Если его вообще нет в этой колонке, вставляем с 0
                    if (!placeholder.parentNode) {
                        placeholder.style.height = '0px';
                        if (afterElement == null) cardsContainer.appendChild(placeholder);
                        else cardsContainer.insertBefore(placeholder, afterElement);
                    } else {
                        // Если он просто переезжает внутри колонки, переставляем
                        if (afterElement == null) cardsContainer.appendChild(placeholder);
                        else cardsContainer.insertBefore(placeholder, afterElement);
                    }

                    // Магия плавного раскрытия: ждем отрисовки вставки
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            placeholder.style.height = targetH;
                            placeholder.classList.add('visible');
                        });
                    });
                }

                const colCenter = rect.left + rect.width / 2;
                const dist = Math.abs(mouseX - colCenter);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestCol = column;
                }
            } else {
                // Плавное схлопывание
                if (placeholder.classList.contains('visible')) {
                    placeholder.style.height = '0px';
                    placeholder.classList.remove('visible');
                }
            }
        });

        columns.forEach(c => c === closestCol ? c.classList.add('drop-target-active') : c.classList.remove('drop-target-active'));
    });

    columns.forEach(column => {
        column.addEventListener('drop', (e) => {
            e.preventDefault();
            const placeholder = placeholders.get(column);
            if (column.classList.contains('drop-target-active') && draggingCard && placeholder.parentNode) {
                placeholder.parentNode.replaceChild(draggingCard, placeholder);
                draggingCard.classList.remove('dragging');
                sendUpdate(draggingCard.dataset.projectId, column.dataset.status, buildOrderList(column.querySelector('.kanban-cards')));
            }
        });
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.project-card:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
            return closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function buildOrderList(container) {
        return [...container.querySelectorAll('.project-card')].map((c, idx) => ({ id: c.dataset.projectId, order: idx + 1 }));
    }

    function sendUpdate(projectId, newStatus, orderList) {
        fetch('/update_status/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            body: JSON.stringify({ project_id: projectId, status: newStatus, order_list: orderList })
        }).catch(err => console.error(err));
    }
});