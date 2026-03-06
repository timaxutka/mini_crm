from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.db import transaction
import json
from django.db.models import Sum, Q, Count, Prefetch
from django.utils import timezone
from django.db.models import Sum
from django.views.decorators.http import require_POST

from .models import Project, Client, Task


def projects(request):
    planned = Project.objects.filter(status='planned').order_by('order', 'id')
    inwork  = Project.objects.filter(status='inwork').order_by('order', 'id')
    done    = Project.objects.filter(status='done').order_by('order', 'id')
    overdue = Project.objects.filter(status='overdue').order_by('order', 'id')
    paused  = Project.objects.filter(status='paused').order_by('order', 'id')
    return render(request, 'projects.html', {
        'planned': planned,
        'inwork': inwork,
        'done': done,
        'overdue': overdue,
        'paused': paused,
    })

def client_projects_view(request):
    # Получаем все проекты, подтягивая данные клиентов одним запросом
    # Сортируем сначала по имени клиента, потом по дате проекта
    all_projects = Project.objects.select_related('client').all().order_by('client__name', '-start_date')
    
    return render(request, 'clients.html', {'projects': all_projects})

def tasks(request):
    all_tasks = Task.objects.select_related('project', 'project__client').all()
    
    # Сортируем просто по дате создания
    active_tasks = all_tasks.exclude(status='done').order_by('-created_at')
    # Так как поля due_date нет, мы не можем высчитать просроченные
    overdue_tasks = [] 
    completed_tasks = all_tasks.filter(status='done').order_by('-id')[:10]

    return render(request, 'tasks.html', {
        'active_tasks': active_tasks,
        'overdue_tasks': overdue_tasks,
        'completed_tasks': completed_tasks,
    })

def finance(request):
    # 1. Считаем общую выручку (все оплаченные проекты)
    total_revenue = Project.objects.filter(payment_status='paid').aggregate(Sum('budget'))['budget__sum'] or 0
    
    # 2. Считаем дебиторку (проекты в работе, которые еще не оплачены)
    pending_payments = Project.objects.filter(
        payment_status='pending'
    ).exclude(status='done').aggregate(Sum('budget'))['budget__sum'] or 0

    # 3. Получаем список последних транзакций (оплаченных проектов)
    recent_payments = Project.objects.filter(payment_status='paid').select_related('client').order_by('-id')

    return render(request, 'finance.html', {
        'total_revenue': total_revenue,
        'pending_payments': pending_payments,
        'recent_payments': recent_payments,
    })

def calculator(request):
    return render(request, 'calculator.html')

def settings(request):
    return render(request, 'settings.html')

@csrf_exempt
def update_status(request):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request'})

    data = json.loads(request.body)
    project_id = data.get('project_id')
    new_status = data.get('status')
    order_list = data.get('order_list', [])  # ожидаем список: [{id: "3", order: 1}, ...]

    if not project_id or new_status is None:
        return JsonResponse({'success': False, 'error': 'Missing fields'})

    with transaction.atomic():
        # Обновляем статус перемещённого проекта
        project = get_object_or_404(Project, id=project_id)
        project.status = new_status
        project.save(update_fields=['status'])

        # Обновляем порядок у всех карточек, присланных для колонки
        for item in order_list:
            try:
                pid = int(item.get('id'))
                pos = int(item.get('order'))
            except Exception:
                continue
            try:
                p = Project.objects.get(id=pid)
            except Project.DoesNotExist:
                continue
            p.order = pos
            p.status = new_status  # на всякий случай, чтобы статус совпадал
            p.save(update_fields=['order', 'status'])

    return JsonResponse({'success': True})

def project_detail(request, project_id):
    """Страница конкретного проекта с его задачами"""
    project = get_object_or_404(Project, id=project_id)
    
    # Получаем задачи через related_name='tasks'
    tasks = project.tasks.all()

    return render(request, 'project_detail.html', {
        'project': project,
        'tasks_todo': tasks.filter(status='todo'),
        'tasks_inwork': tasks.filter(status='inwork'),
        'tasks_done': tasks.filter(status='done'),
    })

def add_project_ajax(request):
    if request.method == 'POST':
        title = request.POST.get('title')
        status = request.POST.get('status', 'planned')
        budget = request.POST.get('cost') or 0
        deadline_raw = request.POST.get('deadline') # Получаем строку из формы
        client_name = request.POST.get('client')

        client = None
        if client_name:
            client, _ = Client.objects.get_or_create(name=client_name)

        # Создаем проект
        project = Project.objects.create(
            title=title,
            status=status,
            budget=budget,
            end_date=deadline_raw if deadline_raw else None, # Django сам поймет строку
            client=client
        )

        # БЕЗОПАСНЫЙ ВЫВОД ДАТЫ
        # Если end_date — строка (только что из формы), выводим её. 
        # Если это объект даты (из базы), форматируем.
        if project.end_date:
            if isinstance(project.end_date, str):
                display_date = project.end_date
            else:
                display_date = project.end_date.strftime('%Y-%m-%d')
        else:
            display_date = "—"

        return JsonResponse({
            'id': project.id,
            'title': project.title,
            'status': project.status,
            'budget': project.budget,
            'client': project.client.name if project.client else "Нет клиента",
            'deadline': display_date
        })
    
@require_POST
def delete_project(request, pk):
    # Исправленная строка:
    project = get_object_or_404(Project, pk=pk) 
    project.delete()
    return JsonResponse({'status': 'ok'})

@require_POST
def update_notes(request, project_id):
    import json
    data = json.loads(request.body)
    project = Project.objects.get(id=project_id)
    project.description = data.get('description')
    project.save()
    return JsonResponse({'status': 'ok'})

@require_POST
def add_task(request, project_id):
    import json
    data = json.loads(request.body)
    # Создание задачи, привязанной к проекту
    task = Task.objects.create(
        project_id=project_id,
        title=data.get('title'),
        status=data.get('status')
    )
    return JsonResponse({'id': task.id})

@require_POST
def update_payment(request, project_id):
    try:
        data = json.loads(request.body)
        new_status = data.get('payment_status')
        
        project = Project.objects.get(id=project_id)
        project.payment_status = new_status
        project.save()
        
        return JsonResponse({'status': 'success'})
    except Project.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Project not found'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)
    
@require_POST
def update_project_field(request, project_id):
    try:
        data = json.loads(request.body)
        field = data.get('field')
        value = data.get('value')
        
        project = get_object_or_404(Project, id=project_id)
        
        # Безопасная проверка: разрешаем менять только определенные поля
        allowed_fields = ['title', 'description', 'budget', 'end_date']
        if field in allowed_fields:
            if field == 'budget':
                value = float(value.replace(' ', '')) if value else 0
            
            setattr(project, field, value)
            project.save()
            return JsonResponse({'status': 'success'})
            
        return JsonResponse({'status': 'error', 'message': 'Invalid field'}, status=400)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)