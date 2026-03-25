/**
 * Универсальный поиск по элементам
 * @param {string} inputId - ID поля ввода
 * @param {string} containerSelector - Селектор контейнера, где лежат элементы (карточки или строки)
 * @param {string} itemSelector - Селектор самого элемента (Card или Row)
 */
function universalSearch(inputId, containerSelector, itemSelector) {
    const input = document.getElementById(inputId);
    const filter = input.value.toLowerCase();
    const items = document.querySelectorAll(`${containerSelector} ${itemSelector}`);

    items.forEach(item => {
        // Берем весь текст внутри элемента (имя, проект, клиент)
        const text = item.textContent.toLowerCase();
        
        // Если текст совпадает, показываем, если нет — скрываем
        if (text.includes(filter)) {
            item.style.display = "";
        } else {
            item.style.display = "none";
        }
    });
}