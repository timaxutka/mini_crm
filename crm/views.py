from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.db import transaction
import json
from django.db.models import Sum, Q, Count, Prefetch
from django.utils import timezone

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
    return render(request, 'finance.html')

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

