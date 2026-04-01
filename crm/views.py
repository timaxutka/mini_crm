import json
import calendar
from datetime import timedelta, date
from decimal import Decimal, InvalidOperation

from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.db import transaction
from django.db.models import Sum, Q, Count, Prefetch
from django.utils import timezone
from django.views.decorators.http import require_POST
from django.db.models.functions import TruncDay, TruncMonth

from .models import Project, Client, Task, Estimate, EstimateItem

from django.contrib.auth.views import LoginView

# --- СТРАНИЦЫ ---

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
    all_projects = Project.objects.select_related('client').all().order_by('-start_date')
    return render(request, 'clients.html', {'projects': all_projects})

def tasks(request):
    today = date.today()
    base_tasks = Task.objects.select_related('project', 'project__client').exclude(status='done')
    
    overdue = base_tasks.filter(due_date__lt=today).order_by('due_date')
    active = base_tasks.filter(due_date__gte=today).order_by('due_date')
    no_date = base_tasks.filter(due_date__isnull=True).order_by('-created_at')
    
    active_tasks = list(overdue) + list(active) + list(no_date)
    
    limit = timezone.now() - timedelta(hours=24)
    completed_tasks = Task.objects.filter(status='done', updated_at__gte=limit).order_by('-updated_at')

    return render(request, 'tasks.html', {
        'active_tasks': active_tasks,
        'completed_tasks': completed_tasks,
        'today': today,
    })

def finance(request):
    view_mode = request.GET.get('mode', 'daily')
    month_val = request.GET.get('month', date.today().strftime('%Y-%m'))
    try:
        year, month = map(int, month_val.split('-'))
    except ValueError:
        today = date.today()
        year, month = today.year, today.month
    
    total_revenue = Project.objects.filter(payment_status='paid').aggregate(Sum('budget'))['budget__sum'] or 0
    pending_payments = Project.objects.filter(payment_status='pending').aggregate(Sum('budget'))['budget__sum'] or 0
    not_paid_payments = Project.objects.filter(payment_status='not_paid').aggregate(Sum('budget'))['budget__sum'] or 0
    
    projects_by_status = {
        'paid': list(Project.objects.filter(payment_status='paid').values_list('title', flat=True)),
        'pending': list(Project.objects.filter(payment_status='pending').values_list('title', flat=True)),
        'not_paid': list(Project.objects.filter(payment_status='not_paid').values_list('title', flat=True)),
    }
    
    if view_mode == 'monthly':
        labels = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
        revenue_data = [float(Project.objects.filter(payment_date__year=year, payment_date__month=m, payment_status='paid').aggregate(Sum('budget'))['budget__sum'] or 0) for m in range(1, 13)]
        forecast_data = [float(Project.objects.filter(payment_date__year=year, payment_date__month=m, payment_status='pending').aggregate(Sum('budget'))['budget__sum'] or 0) for m in range(1, 13)]
    else:
        last_day = calendar.monthrange(year, month)[1]
        labels = [str(d) for d in range(1, last_day + 1)]
        qs_month = Project.objects.filter(payment_date__month=month, payment_date__year=year)
        revenue_data = [float(qs_month.filter(payment_date__day=d, payment_status='paid').aggregate(Sum('budget'))['budget__sum'] or 0) for d in range(1, last_day + 1)]
        forecast_data = [float(qs_month.filter(payment_date__day=d, payment_status='pending').aggregate(Sum('budget'))['budget__sum'] or 0) for d in range(1, last_day + 1)]

    projects_list = Project.objects.select_related('client').all().order_by('payment_status', '-budget')
    top_clients = Client.objects.annotate(total_spent=Sum('projects__budget', filter=Q(projects__payment_status='paid'))).order_by('-total_spent')[:5]

    return render(request, 'finance.html', {
        'view_mode': view_mode,
        'total_revenue': total_revenue,
        'pending_payments': pending_payments,
        'not_paid_payments': not_paid_payments,
        'projects_list': projects_list,
        'top_clients': top_clients,
        'paid_count': len(projects_by_status['paid']),
        'pending_count': len(projects_by_status['pending']),
        'not_paid_count': len(projects_by_status['not_paid']),
        'projects_by_status': json.dumps(projects_by_status),
        'dates': json.dumps(labels),
        'revenue': json.dumps(revenue_data),
        'forecast': json.dumps(forecast_data),
    })

# --- AJAX ОПЕРАЦИИ (ПРОЕКТЫ) ---

def add_project_ajax(request):
    if request.method == 'POST':
        title = request.POST.get('title')
        status = request.POST.get('status', 'planned')
        
        # Решаем проблему ценника: пробуем взять 'budget', если пусто — 'cost'
        budget_raw = request.POST.get('budget') or request.POST.get('cost') or '0'
        
        # Очищаем строку от мусора, если он есть (пробелы, запятые)
        try:
            if isinstance(budget_raw, str):
                budget_raw = budget_raw.replace(',', '.').replace(' ', '')
            budget = float(budget_raw) if budget_raw else 0
        except (ValueError, TypeError):
            budget = 0
            
        deadline_raw = request.POST.get('deadline')
        client_name = request.POST.get('client')

        client = None
        if client_name:
            client, _ = Client.objects.get_or_create(name=client_name)

        # Создаем проект
        project = Project.objects.create(
            title=title,
            status=status,
            budget=budget,
            end_date=deadline_raw if deadline_raw else None,
            client=client
        )

        # Возвращаем JSON строго в старом формате
        return JsonResponse({
            'success': True,
            'id': project.id,
            'title': project.title,
            'status': project.status,
            'cost': project.budget, # Возвращаем напрямую из модели
            'client': project.client.name if project.client else "Нет клиента",
            'deadline': str(project.end_date) if project.end_date else "—" # Строгий старый формат
        })
    
    return JsonResponse({'success': False, 'error': 'Method not allowed'})

def project_detail(request, project_id):
    project = get_object_or_404(Project, id=project_id)
    tasks = project.tasks.all().order_by('order')
    return render(request, 'project_detail.html', {
        'project': project,
        'today': date.today(),
        'tasks_planned': tasks.filter(status='planned'),
        'tasks_inwork': tasks.filter(status='inwork'),
        'tasks_done': tasks.filter(status='done'),
    })

@csrf_exempt
def update_status(request):
    if request.method != 'POST': return JsonResponse({'success': False})
    data = json.loads(request.body)
    with transaction.atomic():
        project = get_object_or_404(Project, id=data.get('project_id'))
        project.status = data.get('status')
        project.save(update_fields=['status'])
        for item in data.get('order_list', []):
            Project.objects.filter(id=item.get('id')).update(order=item.get('order'), status=data.get('status'))
    return JsonResponse({'success': True})

@require_POST
def delete_project(request, pk):
    get_object_or_404(Project, pk=pk).delete()
    return JsonResponse({'status': 'ok'})

@require_POST
def update_project_field(request, project_id):
    data = json.loads(request.body)
    field = data.get('field')
    value = data.get('value')
    project = get_object_or_404(Project, id=project_id)
    if field in ['title', 'description', 'budget', 'end_date']:
        if field == 'budget':
            value = float(value.replace(' ', '')) if value else 0
        setattr(project, field, value)
        project.save()
        return JsonResponse({'status': 'success'})
    return JsonResponse({'status': 'error'}, status=400)

@require_POST
def update_payment(request, project_id):
    data = json.loads(request.body)
    status = data.get('payment_status')
    project = Project.objects.get(id=project_id)
    project.payment_status = status
    project.payment_date = date.today() if status == 'paid' else None
    project.save()
    return JsonResponse({'status': 'success'})

# --- ЗАДАЧИ И КЛИЕНТЫ ---

@csrf_exempt
@require_POST
def add_task(request, project_id):
    data = json.loads(request.body)
    project = get_object_or_404(Project, id=project_id)
    task = Task.objects.create(
        project=project,
        title=data.get('title'),
        status=data.get('status', 'planned'),
        due_date=data.get('due_date') if data.get('due_date') else None
    )
    return JsonResponse({'id': task.id, 'status': task.status})

@csrf_exempt
@require_POST
def update_task_status(request):
    data = json.loads(request.body)
    task_id = data.get('project_id') or data.get('id')
    with transaction.atomic():
        Task.objects.filter(id=task_id).update(status=data.get('status'))
        for item in data.get('order_list', []):
            Task.objects.filter(id=item.get('id')).update(order=item.get('order'), status=data.get('status'))
    return JsonResponse({'success': True})

@require_POST
def edit_task(request, task_id):
    data = json.loads(request.body)
    task = get_object_or_404(Task, id=task_id)
    task.title = data.get('title')
    task.due_date = data.get('due_date') if data.get('due_date') else None
    task.save()
    return JsonResponse({'success': True})

def delete_task(request, pk):
    Task.objects.filter(pk=pk).delete()
    return JsonResponse({'success': True})

@require_POST
def update_client_field(request, client_id):
    data = json.loads(request.body)
    client = get_object_or_404(Client, id=client_id)
    if data.get('field') in ['contact_person', 'phone', 'email', 'telegram']:
        setattr(client, data.get('field'), data.get('value'))
        client.save()
        return JsonResponse({'success': True})
    return JsonResponse({'success': False}, status=400)

@require_POST
def toggle_client_vip(request, client_id):
    client = get_object_or_404(Client, id=client_id)
    client.is_vip = not client.is_vip
    client.save()
    return JsonResponse({'success': True, 'is_vip': client.is_vip})

# Найти и заменить:
def calculator(request):
    # Достаем все сметы, свежие — сверху
    estimates = Estimate.objects.all().order_by('-created_at')
    return render(request, 'calculator.html', {'estimates': estimates})

def settings(request): return render(request, 'settings.html')

class MyLoginView(LoginView):
    template_name = 'registration/login.html'
    # После успешного входа редиректим на главную (канбан)
    next_page = 'dashboard'

def kanban_view(request):
    # Тут будет логика получения данных из БД
    # Пока просто отдаем твой HTML-шаблон
    return render(request, 'projects.html')

def create_estimate(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            now = timezone.now()
            
            # 1. ЗАБИРАЕМ ДАННЫЕ ИЗ ЗАПРОСА
            user_title = data.get('title', '').strip()
            user_tags = data.get('tags', '').strip()

            # 2. ОПРЕДЕЛЯЕМ НАЗВАНИЕ (если ввели — берем его, если нет — ставим дату)
            final_title = user_title if user_title else f"Смета от {now.strftime('%d.%m.%Y %H:%M')}"

            # 3. СОХРАНЯЕМ В БАЗУ
            estimate = Estimate.objects.create(
                title=final_title,
                tags=user_tags,  # Теперь теги будут сохраняться!
                subtotal=Decimal(str(data.get('subtotal', 0))),
                tax_included=data.get('tax', False),
                buffer_included=data.get('buffer', False),
                total_amount=Decimal(str(data.get('total', 0)))
            )

            for item in data.get('items', []):
                EstimateItem.objects.create(
                    estimate=estimate,
                    name=item['name'],
                    unit=item['unit'],
                    price=Decimal(str(item['price'])),
                    quantity=item['qty']
                )

            return JsonResponse({
                'status': 'success', 
                'id': estimate.id,
                'title': estimate.title,
                'tags': estimate.tags,
                'total': float(estimate.total_amount),
                'date': estimate.created_at.strftime('%d %b %Y')
            })
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)
        
def get_estimate_details(request, estimate_id):
    estimate = get_object_or_404(Estimate, id=estimate_id)
    items = estimate.items.all()
    
    items_data = []
    for item in items:
        items_data.append({
            'name': item.name,
            'unit': item.unit,
            'price': float(item.price),
            'quantity': item.quantity,
        })
        
    return JsonResponse({
        'status': 'success',
        'title': estimate.title,
        'tags': estimate.tags,             # ДОБАВИЛИ ТЕГИ
        'tax': estimate.tax_included,      # ДОБАВИЛИ НАЛОГ
        'buffer': estimate.buffer_included, # ДОБАВИЛИ РИСКИ
        'total': float(estimate.total_amount),
        'items': items_data
    })

@require_POST
def update_estimate(request, estimate_id):
    try:
        estimate = get_object_or_404(Estimate, id=estimate_id)
        data = json.loads(request.body)
        
        # Обновляем основные поля
        estimate.title = data.get('title', estimate.title)
        estimate.tags = data.get('tags', estimate.tags)
        estimate.subtotal = Decimal(str(data.get('subtotal', 0)))
        estimate.tax_included = data.get('tax', False)
        estimate.buffer_included = data.get('buffer', False)
        estimate.total_amount = Decimal(str(data.get('total', 0)))
        estimate.save()

        # Удаляем старые айтемы и создаем новые (проще, чем сверять изменения)
        estimate.items.all().delete()
        for item in data.get('items', []):
            EstimateItem.objects.create(
                estimate=estimate,
                name=item['name'],
                unit=item['unit'],
                price=Decimal(str(item['price'])),
                quantity=item['qty']
            )

        return JsonResponse({'status': 'success'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)
    
@require_POST
def delete_estimate(request, estimate_id):
    # Находим смету, проверяя, что она принадлежит текущему пользователю (если есть авторизация)
    estimate = get_object_or_404(Estimate, id=estimate_id)
    
    try:
        estimate.delete()
        return JsonResponse({'status': 'success'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)