from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.db import transaction
import json

from .models import Project


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

def clients(request):
    return render(request, 'clients.html')

def tasks(request):
    return render(request, 'tasks.html')

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
    """Страница конкретного проекта"""
    project = get_object_or_404(Project, id=project_id)

    # Если у тебя пока нет модели Task — просто рендерим без задач
    return render(request, 'project_detail.html', {
        'project': project,
        'tasks_todo': [],
        'tasks_inwork': [],
        'tasks_done': [],
    })