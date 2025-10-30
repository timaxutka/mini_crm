document.addEventListener('DOMContentLoaded', () => {
    const cards = document.querySelectorAll('.project-card');
    const columns = document.querySelectorAll('.kanban-column');

    cards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            e.dataTransfer.setData('text/plain', card.dataset.projectId);
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            document.querySelectorAll('.kanban-cards').forEach(container => {
                container.classList.remove('stretch', 'drag-over');
                container.querySelectorAll('.project-card').forEach(card => {
                    card.classList.remove('spread-up', 'spread-down');
                });
            });
        });
    });

    columns.forEach(column => {
        const cardsContainer = column.querySelector('.kanban-cards');

        column.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!cardsContainer.querySelector('.project-card')) {
                cardsContainer.classList.add('stretch', 'drag-over');
                return; // Если контейнер пуст, не применяем раздвигание
            } else {
                cardsContainer.classList.add('drag-over');
            }

            // Удаляем классы spread с предыдущих карточек
            cardsContainer.querySelectorAll('.project-card').forEach(card => {
                card.classList.remove('spread-up', 'spread-down');
            });

            // Определяем позицию для вставки карточки
            const draggable = document.querySelector('.dragging');
            const afterElement = getDragAfterElement(cardsContainer, e.clientY);

            // Добавляем классы spread для соседних карточек
            if (afterElement) {
                const beforeElement = afterElement.previousElementSibling;
                if (beforeElement && !beforeElement.classList.contains('dragging')) {
                    beforeElement.classList.add('spread-up');
                }
                afterElement.classList.add('spread-down');
            } else if (cardsContainer.querySelectorAll('.project-card:not(.dragging)').length > 0) {
                // Если вставка в конец, раздвигаем последнюю карточку вверх
                const lastCard = cardsContainer.querySelector('.project-card:not(.dragging):last-child');
                if (lastCard) {
                    lastCard.classList.add('spread-up');
                }
            }

            // Временное перемещение карточки для визуальной обратной связи
            if (afterElement == null) {
                cardsContainer.appendChild(draggable);
            } else {
                cardsContainer.insertBefore(draggable, afterElement);
            }

            // Отладочный лог
            console.log('Dragover: before=', beforeElement?.dataset.projectId || 'none', 'after=', afterElement?.dataset.projectId || 'none');
        });

        column.addEventListener('dragleave', () => {
            cardsContainer.classList.remove('drag-over', 'stretch');
            cardsContainer.querySelectorAll('.project-card').forEach(card => {
                card.classList.remove('spread-up', 'spread-down');
            });
        });

        column.addEventListener('drop', (e) => {
            e.preventDefault();
            cardsContainer.classList.remove('drag-over', 'stretch');
            cardsContainer.querySelectorAll('.project-card').forEach(card => {
                card.classList.remove('spread-up', 'spread-down');
            });

            const projectId = e.dataTransfer.getData('text/plain');
            const card = document.querySelector(`.project-card[data-project-id="${projectId}"]`);
            const newStatus = column.dataset.status;

            // Подтверждаем позицию карточки
            const afterElement = getDragAfterElement(cardsContainer, e.clientY);
            if (afterElement == null) {
                cardsContainer.appendChild(card);
            } else {
                cardsContainer.insertBefore(card, afterElement);
            }

            // Отправляем AJAX-запрос для обновления статуса
            fetch('/update_status/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify({
                    project_id: projectId,
                    status: newStatus
                })
            })
            .then(response => response.json())
            .then(data => {
                if (!data.success) {
                    alert('Ошибка при обновлении статуса');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Ошибка при обновлении статуса');
            });
        });
    });

    // Функция для определения позиции вставки карточки
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

    // Функция для получения CSRF-токена
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
});