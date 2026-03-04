document.addEventListener('DOMContentLoaded', () => {
    const columns = document.querySelectorAll('.kanban-column');
    let draggingCard = null;

    // CSRF helper
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

    // Возвращает массив {id, order} по элементам внутри контейнера
    function buildOrderList(cardsContainer) {
        const list = [];
        const cards = cardsContainer.querySelectorAll('.project-card');
        cards.forEach((c, idx) => {
            list.push({ id: c.dataset.projectId, order: idx + 1 });
        });
        return list;
    }

    // Отправка обновления статуса + порядка
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
        })
        .then(resp => resp.json())
        .then(data => {
            if (!data.success) {
                console.error('update_status failed', data);
                alert('Ошибка при сохранении порядка. Смотри консоль.');
                // В идеале — откатить визуально или перезагрузить
            } else {
                // успешно
                // console.log('Order saved');
            }
        })
        .catch(err => {
            console.error('Error sending update_status', err);
            alert('Ошибка сети при сохранении порядка.');
        });
    }

    // Drag & Drop
    document.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('dragstart', (e) => {
            draggingCard = card;
            card.classList.add('dragging');
            try { e.dataTransfer.setData('text/plain', card.dataset.projectId); } catch (err) {}
        });
        card.addEventListener('dragend', () => {
            if (draggingCard) draggingCard.classList.remove('dragging');
            draggingCard = null;
            // убираем подсветки
            document.querySelectorAll('.kanban-cards').forEach(c => c.classList.remove('drag-over', 'stretch'));
            document.querySelectorAll('.project-card').forEach(c => c.classList.remove('spread-up','spread-down'));
        });
    });

    columns.forEach(column => {
        const cardsContainer = column.querySelector('.kanban-cards');

        column.addEventListener('dragover', (e) => {
            e.preventDefault();
            cardsContainer.classList.add('drag-over');

            const afterElement = getDragAfterElement(cardsContainer, e.clientY);
            const dragging = document.querySelector('.dragging');

            if (!dragging) return;

            if (afterElement == null) {
                cardsContainer.appendChild(dragging);
            } else {
                cardsContainer.insertBefore(dragging, afterElement);
            }
        });

        column.addEventListener('dragleave', (e) => {
            // если уходим в другие элементы, не убирать сразу (в UX можно доработать)
            // но убираем подсветку
            cardsContainer.classList.remove('drag-over', 'stretch');
        });

        column.addEventListener('drop', (e) => {
            e.preventDefault();
            cardsContainer.classList.remove('drag-over', 'stretch');

            const projectId = e.dataTransfer.getData('text/plain') || (draggingCard && draggingCard.dataset.projectId);
            const card = document.querySelector(`.project-card[data-project-id="${projectId}"]`);
            if (!card) return;

            // кого куда поставили — уже сделано DOM-но выше в dragover
            const newStatus = column.dataset.status;

            // Собираем порядок карточек в колонке
            const orderList = buildOrderList(cardsContainer);

            // Отправляем на сервер
            sendUpdate(projectId, newStatus, orderList);
        });
    });

    // Для определения места вставки
    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.project-card:not(.dragging)')];
        let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
        draggableElements.forEach(child => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                closest = { offset: offset, element: child };
            }
        });
        return closest.element;
    }

    // Дополнительно: сохранение порядка при двойном клике/перестановке вручную (если понадобится) можно реализовать аналогично.
});
