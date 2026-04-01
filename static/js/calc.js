// 1. Глобальные переменные
let currentEditingEstimateId = null;
let currentViewingEstimateId = null;
let currentEstimateTags = ""; // Здесь будем хранить "чистую" строку тегов

// 2. Управление модалками
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('active');
        if (id === 'manualModal' && !currentEditingEstimateId) {
            resetManualForm();
        }
        if (id === 'smartModal') {
            const textarea = modal.querySelector('.smart-textarea');
            if (textarea) setTimeout(() => textarea.focus(), 100);
        }
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('active');
        if (id === 'manualModal') currentEditingEstimateId = null;
    }
}

function resetManualForm() {
    document.getElementById('estimate-title-input').value = '';
    document.getElementById('estimate-tags-input').value = ''; // Чистим теги
    const tbody = document.getElementById('estimateRows');
    tbody.innerHTML = '';
    addNewRow();
    calculateTotal();
}

// 3. Логика таблицы конструктора
function addNewRow(name = '', price = '', qty = 1) {
    const tbody = document.getElementById('estimateRows');
    const tr = document.createElement('tr');
    tr.className = 'estimate-row';
    tr.innerHTML = `
        <td><input type="text" class="table-input" placeholder="Название..." value="${name}" oninput="calculateTotal()"></td>
        <td>
            <select class="table-input-select" onchange="calculateTotal()">
                <option value="fix">Фикса</option>
                <option value="hour">В час</option>
            </select>
        </td>
        <td><input type="number" class="table-input" placeholder="0" value="${price}" oninput="calculateTotal()"></td>
        <td><input type="number" class="table-input" value="${qty}" oninput="calculateTotal()"></td>
        <td><button type="button" onclick="this.closest('tr').remove(); calculateTotal();" style="border:none; background:none; cursor:pointer; font-size:20px; color:#ff4d4d;">&times;</button></td>
    `;
    tbody.appendChild(tr);
    calculateTotal();
}

function calculateTotal() {
    let subtotal = 0;
    const rows = document.querySelectorAll('#estimateRows .estimate-row');
    const receiptList = document.getElementById('receiptServiceList');
    if (receiptList) receiptList.innerHTML = '';

    rows.forEach((row, index) => {
        const inputs = row.querySelectorAll('input');
        const name = inputs[0].value;
        const price = parseFloat(inputs[1].value) || 0;
        const qty = parseFloat(inputs[2].value) || 0;
        
        const itemTotal = price * qty;
        subtotal += itemTotal;

        if (price > 0 || name.trim() !== "") {
            const li = document.createElement('li');
            li.innerHTML = `<span>${name || 'Услуга ' + (index + 1)}</span> <b>${itemTotal.toLocaleString()} ₽</b>`;
            if (receiptList) receiptList.appendChild(li);
        }
    });

    let grandTotal = subtotal;
    if (document.getElementById('tax-toggle')?.checked) grandTotal += subtotal * 0.06;
    if (document.getElementById('buffer-toggle')?.checked) grandTotal += subtotal * 0.15;

    const grandTotalEl = document.getElementById('grandTotal');
    if (grandTotalEl) grandTotalEl.innerText = `${Math.round(grandTotal).toLocaleString()} ₽`;
}

// 4. Сохранение, Просмотр, Редактирование
async function saveManualEstimate() {
    const title = document.getElementById('estimate-title-input').value.trim();
    const tags = document.getElementById('estimate-tags-input').value.trim();
    const rows = document.querySelectorAll('#estimateRows .estimate-row');
    const items = [];

    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const select = row.querySelector('select');
        const name = inputs[0]?.value.trim() || "";
        const price = parseFloat(inputs[1]?.value) || 0;
        const qty = parseFloat(inputs[2]?.value) || 0;
        
        if (name.length > 0 || price > 0) {
            items.push({ name, unit: select.value, price, qty });
        }
    });

    if (items.length === 0) return alert("Добавьте хотя бы одну позицию!");

    const payload = {
        title, tags, items,
        tax: document.getElementById('tax-toggle')?.checked || false,
        buffer: document.getElementById('buffer-toggle')?.checked || false,
        total: parseFloat(document.getElementById('grandTotal').innerText.replace(/[^\d.]/g, ''))
    };

    const url = currentEditingEstimateId ? `/calculator/estimate/${currentEditingEstimateId}/update/` : '/calculator/create/';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            body: JSON.stringify(payload)
        });
        if ((await response.json()).status === 'success') window.location.reload();
    } catch (error) { alert("Ошибка сохранения"); }
}

async function viewEstimate(id) {
    currentViewingEstimateId = id;
    try {
        const response = await fetch(`/calculator/estimate/${id}/`);
        const data = await response.json();

        if (data.status === 'success') {
            // 1. Заполняем заголовок и общую сумму
            document.getElementById('view-estimate-title').innerText = data.title;
            document.getElementById('view-grand-total').innerText = `${data.total.toLocaleString()} ₽`;

            // 2. КРИТИЧЕСКИЙ МОМЕНТ ДЛЯ ТЕГОВ:
            // Сохраняем "чистую" строку тегов в атрибут модалки, чтобы editEstimate забрала её без ошибок
            const modalEl = document.getElementById('viewEstimateModal');
            modalEl.setAttribute('data-current-tags', data.tags || '');

            // 3. СИНХРОНИЗАЦИЯ ЧЕКБОКСОВ (Налог и Риски)
            // Выставляем их СРАЗУ, чтобы calculateTotal() при редактировании подхватила верные данные
            if (document.getElementById('tax-toggle')) {
                document.getElementById('tax-toggle').checked = !!data.tax;
            }
            if (document.getElementById('buffer-toggle')) {
                document.getElementById('buffer-toggle').checked = !!data.buffer;
            }

            // 4. Отрисовка баджей тегов в модалке просмотра
            const tagsContainer = document.querySelector('#viewEstimateModal .estimate-tags');
            if (tagsContainer) {
                if (data.tags && data.tags.trim() !== "") {
                    tagsContainer.innerHTML = data.tags.split(',')
                        .map(t => `<span class="tag-badge">#${t.trim()}</span>`)
                        .join('');
                } else {
                    tagsContainer.innerHTML = ''; // Очищаем, если тегов нет
                }
            }

            // 5. Отрисовка таблицы с работами
            const container = document.getElementById('view-estimate-items');
            if (container) {
                container.innerHTML = data.items.map(item => `
                    <tr>
                        <td>${item.name}</td>
                        <td>${item.unit === 'hour' ? 'В час' : 'Фикса'}</td>
                        <td>${item.price.toLocaleString()} ₽</td>
                        <td>${item.quantity}</td>
                        <td><b>${(item.price * item.quantity).toLocaleString()} ₽</b></td>
                    </tr>
                `).join('');
            }

            // 6. Открываем модалку
            openModal('viewEstimateModal');
        } else {
            console.error("Ошибка сервера:", data.message);
        }
    } catch (error) { 
        console.error("Ошибка при получении данных сметы:", error); 
    }
}

function editEstimate() {
    // 1. Устанавливаем ID редактируемой сметы
    currentEditingEstimateId = currentViewingEstimateId;
    
    // 2. Получаем данные из модалки просмотра
    const viewTitle = document.getElementById('view-estimate-title').innerText;
    
    // ДОСТАЕМ ТЕГИ НАПРЯМУЮ (без парсинга решеток из баджей)
    // Берем строку, которую сохранили в viewEstimate
    const viewTags = document.getElementById('viewEstimateModal').getAttribute('data-current-tags') || '';

    const viewRows = document.querySelectorAll('#view-estimate-items tr');

    // 3. Переключаем модалки
    closeModal('viewEstimateModal');
    openModal('manualModal');

    // 4. Заполняем основные поля инпутов
    document.getElementById('estimate-title-input').value = viewTitle;
    document.getElementById('estimate-tags-input').value = viewTags;

    // 5. Очищаем таблицу в конструкторе и наполняем её данными
    const estimateBody = document.getElementById('estimateRows');
    estimateBody.innerHTML = ''; 

    viewRows.forEach(row => {
        const cols = row.querySelectorAll('td');
        // Проверяем, что в строке есть данные (Минимум: Название, Тип, Ставка, Кол-во)
        if (cols.length >= 4) {
            addNewRow(); 
            const newRow = estimateBody.lastElementChild;
            const inputs = newRow.querySelectorAll('input');
            const select = newRow.querySelector('select');

            // Название услуги
            inputs[0].value = cols[0].innerText.trim();
            
            // Тип (Фикса или В час)
            if (select) {
                const typeText = cols[1].innerText.toLowerCase();
                select.value = typeText.includes('час') ? 'hour' : 'fix';
            }
            
            // Ставка (очищаем от "₽", пробелов и прочего мусора)
            const rawPrice = cols[2].innerText.replace(/[^\d.]/g, '');
            inputs[1].value = parseFloat(rawPrice) || 0;
            
            // Количество
            const rawQty = cols[3].innerText.replace(/[^\d.]/g, '');
            inputs[2].value = parseFloat(rawQty) || 1;
        }
    });

    // 6. КРИТИЧЕСКИЙ МОМЕНТ:
    // После заполнения таблицы вызываем calculateTotal. 
    // Она посмотрит на состояние чекбоксов #tax-toggle и #buffer-toggle, 
    // которые мы синхронизировали в функции viewEstimate, и применит их к расчету.
    calculateTotal();
}

// 5. PDF, Удаление и Cookie
function exportToPDF() {
    const title = document.getElementById('view-estimate-title').innerText;
    document.getElementById('pdf-estimate-title').innerText = title;
    document.getElementById('pdf-date').innerText = `Дата: ${new Date().toLocaleDateString('ru-RU')}`;
    document.getElementById('pdf-grand-total').innerText = document.getElementById('view-grand-total').innerText;

    const pdfBody = document.getElementById('pdf-items-body');
    pdfBody.innerHTML = Array.from(document.querySelectorAll('#view-estimate-items tr')).map(row => {
        const cols = row.querySelectorAll('td');
        return `<tr>
            <td style="border:1px solid #ddd; padding:15px 10px;">${cols[0].innerText}</td>
            <td style="border:1px solid #ddd; padding:15px 10px; text-align:center;">${cols[3].innerText}</td>
            <td style="border:1px solid #ddd; padding:15px 10px; text-align:right;">${cols[2].innerText}</td>
            <td style="border:1px solid #ddd; padding:15px 10px; text-align:right;">${cols[4].innerText}</td>
        </tr>`;
    }).join('');

    const element = document.getElementById('pdf-template');
    element.parentElement.style.display = 'block';
    html2pdf().set({ margin: 15, filename: `Смета_${title}.pdf`, html2canvas: { scale: 3 }, jsPDF: { format: 'a4' } })
              .from(element).save().then(() => element.parentElement.style.display = 'none');
}

function deleteEstimate() {
    if (!currentViewingEstimateId) return;

    // Берем название из заголовка модалки просмотра для текста в подтверждении
    const title = document.getElementById('view-estimate-title').innerText;
    document.getElementById('delete-target-title').innerText = title;

    openModal('deleteConfirmModal');
}

// Вызывается при нажатии "Удалить" уже в самой модалке подтверждения
async function confirmDeleteExecution() {
    try {
        const response = await fetch(`/calculator/estimate/${currentViewingEstimateId}/delete/`, {
            method: 'POST',
            headers: { 
                'X-CSRFToken': getCookie('csrftoken'), 
                'Content-Type': 'application/json' 
            }
        });

        const result = await response.json();
        if (result.status === 'success') {
            closeModal('deleteConfirmModal');
            closeModal('viewEstimateModal');
            window.location.reload(); 
        } else {
            alert("Ошибка при удалении: " + result.message);
        }
    } catch (error) {
        console.error("Ошибка запроса:", error);
        alert("Не удалось связаться с сервером.");
    }
}

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

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('tax-toggle')?.addEventListener('change', calculateTotal);
    document.getElementById('buffer-toggle')?.addEventListener('change', calculateTotal);
});

// Функция парсинга текста в реальном времени
function parseSmartText() {
    const text = document.getElementById('smart-input').value;
    const lines = text.split('\n').filter(line => line.trim() !== '');
    let total = 0;
    let count = 0;

    lines.forEach(line => {
        // Регулярка ищет все числа в строке
        const numbers = line.match(/\d+/g);
        if (numbers && numbers.length >= 1) {
            const price = parseFloat(numbers[numbers.length - 2]) || parseFloat(numbers[0]);
            const qty = numbers.length >= 2 ? parseFloat(numbers[numbers.length - 1]) : 1;
            total += price * qty;
            count++;
        }
    });

    document.getElementById('smartTotal').innerText = `${total.toLocaleString()} ₽`;
    document.getElementById('parsing-hint').innerHTML = `Распознано позиций: <b>${count}</b>`;
}

// Функция "перекидывания" данных в manualModal
function saveSmartEstimate() {
    console.log("!!! SMART ESTIMATE TRIGGERED !!!");

    const textarea = document.getElementById('smart-input');
    const estimateBody = document.getElementById('estimateRows');

    if (!textarea || !estimateBody) return;

    const lines = textarea.value.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return alert("Введите данные");

    // 1. ПОЛНОСТЬЮ ОЧИЩАЕМ ТАБЛИЦУ
    estimateBody.innerHTML = '';
    
    // 2. Сбрасываем заголовки
    currentEditingEstimateId = null;
    document.getElementById('estimate-title-input').value = 'Новая смета (умный ввод)';
    document.getElementById('estimate-tags-input').value = 'быстрый ввод';

    // 3. ПАРСИМ И ДОБАВЛЯЕМ
    lines.forEach(line => {
        const numbers = line.match(/\d+/g);
        if (numbers) {
            const firstDigitIndex = line.search(/\d/);
            const name = firstDigitIndex !== -1 ? line.substring(0, firstDigitIndex).trim() : line.trim();
            const price = numbers.length >= 2 ? parseFloat(numbers[numbers.length - 2]) : parseFloat(numbers[0]);
            const qty = numbers.length >= 2 ? parseFloat(numbers[numbers.length - 1]) : 1;

            // Используем нашу обновленную функцию
            addNewRow(name, price, qty);
        }
    });

    // 4. ПЕРЕКЛЮЧАЕМ МОДАЛКИ
    // Важно: закрываем старую, открываем новую
    closeModal('smartModal');
    openModal('manualModal');

    // Очищаем поле ввода
    textarea.value = '';
    
    // Принудительный расчет
    calculateTotal();
}