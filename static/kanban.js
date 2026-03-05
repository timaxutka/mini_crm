document.addEventListener('DOMContentLoaded', () => {
    const columns = document.querySelectorAll('.kanban-column');
    let draggingCard = null;
    let placeholders = new Map();
    let dragOffset = { x: 0, y: 0 };

    columns.forEach(col => {
        const p = document.createElement('div');
        p.classList.add('kanban-placeholder');
        placeholders.set(col, p);
        
        p.addEventListener('transitionend', (e) => {
            if (e.propertyName === 'height' && p.style.height === '0px' && !p.classList.contains('visible')) {
                if (p.parentNode) p.parentNode.removeChild(p);
            }
        });
    });

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
            .filter(c => c.style.display !== 'none')
            .map((c, idx) => ({ 
                id: c.dataset.projectId, 
                order: idx + 1 
            }));
    }

    function softClearAll() {
        placeholders.forEach(p => {
            p.classList.remove('visible');
            p.style.height = '0px';
            p.style.marginBottom = '-16px'; // Схлопываем отступ
        });
        columns.forEach(c => c.classList.remove('drop-target-active'));
    }

    document.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('dragstart', (e) => {
            draggingCard = card;
            const rect = card.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;

            const cardHeight = card.offsetHeight;
            placeholders.forEach(p => {
                p.dataset.targetHeight = cardHeight + 'px';
            });

            requestAnimationFrame(() => {
                card.classList.add('dragging');
                card.style.setProperty('display', 'none', 'important'); 
            });
        });

        card.addEventListener('dragend', () => {
            softClearAll();
            if (draggingCard) {
                draggingCard.classList.remove('dragging');
                draggingCard.style.removeProperty('display');
            }
            draggingCard = null;
        });
    });

    document.addEventListener('dragover', (e) => {
        e.preventDefault(); 
        if (!draggingCard) return;

        const mouseX = e.clientX;
        const mouseY = e.clientY;
        
        const targetHStr = placeholders.values().next().value.dataset.targetHeight;
        const targetH = parseInt(targetHStr);
        const cardWidth = 300; 
        
        const vCard = {
            left: mouseX - dragOffset.x,
            right: mouseX - dragOffset.x + cardWidth,
            top: mouseY - dragOffset.y,
            bottom: mouseY - dragOffset.y + targetH
        };

        let bestCol = null;
        let maxArea = -1;

        columns.forEach(column => {
            const colRect = column.getBoundingClientRect();
            const xOverlap = Math.max(0, Math.min(vCard.right, colRect.right) - Math.max(vCard.left, colRect.left));
            const yOverlap = Math.max(0, Math.min(vCard.bottom, colRect.bottom) - Math.max(vCard.top, colRect.top));
            const area = xOverlap * yOverlap;

            if (area > maxArea) {
                maxArea = area;
                bestCol = column;
            }
        });

        columns.forEach(column => {
            const placeholder = placeholders.get(column);
            const cardsContainer = column.querySelector('.kanban-cards');
            const colRect = column.getBoundingClientRect();
            const hasXOverlap = vCard.left < colRect.right && vCard.right > colRect.left;

            if (hasXOverlap) {
                const afterElement = getDragAfterElement(cardsContainer, mouseY);

                if (placeholder.nextElementSibling !== afterElement || !placeholder.parentNode) {
                    if (afterElement == null) cardsContainer.appendChild(placeholder);
                    else cardsContainer.insertBefore(placeholder, afterElement);

                    requestAnimationFrame(() => {
                        placeholder.style.height = targetHStr;
                        placeholder.style.marginBottom = '0px'; // Показываем отступ
                        placeholder.classList.add('visible');
                    });
                }
            } else {
                if (placeholder.classList.contains('visible')) {
                    placeholder.classList.remove('visible');
                    placeholder.style.height = '0px';
                    placeholder.style.marginBottom = '-16px'; // Схлопываем обратно
                }
            }

            if (column === bestCol && maxArea > 0) {
                column.classList.add('drop-target-active');
            } else {
                column.classList.remove('drop-target-active');
            }
        });
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!draggingCard) return;

        const activeCol = document.querySelector('.kanban-column.drop-target-active');
        if (!activeCol) {
            softClearAll();
            return;
        }

        const placeholder = placeholders.get(activeCol);
        if (placeholder && placeholder.parentNode) {
            const container = activeCol.querySelector('.kanban-cards');
            
            draggingCard.style.removeProperty('display');
            draggingCard.style.transition = 'none';
            
            placeholder.parentNode.replaceChild(draggingCard, placeholder);
            
            const projectId = draggingCard.dataset.projectId;
            const status = activeCol.dataset.status;
            
            requestAnimationFrame(() => {
                draggingCard.style.transition = '';
                draggingCard.classList.remove('dragging');
            });

            const orderList = buildOrderList(container);
            softClearAll();
            sendUpdate(projectId, status, orderList);
        }
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

    function sendUpdate(projectId, newStatus, orderList) {
        fetch('/update_status/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            body: JSON.stringify({ project_id: projectId, status: newStatus, order_list: orderList })
        }).catch(err => console.error(err));
    }
});