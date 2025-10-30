from django.shortcuts import render
from .models import Project
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import get_object_or_404
import json

def projects(request):
    projects = Project.objects.all().order_by('-id')
    return render(request, 'projects.html', {'projects': projects})

def clients(request):
    return render(request, 'clients.html')

def tasks(request):
    return render(request, 'tasks.html')

def finance(request):
    return render(request, 'finance.html')

def calculator(request):
    return render(request, 'calculator.html')

def settings(request):
    return render(request, 'settings.html', {})

@csrf_exempt
def update_status(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        project_id = data.get('project_id')
        new_status = data.get('status')
        valid_statuses = [choice[0] for choice in Project.STATUS_CHOICES]
        if new_status not in valid_statuses:
            return JsonResponse({'success': False, 'error': 'Invalid status'})
        project = get_object_or_404(Project, id=project_id)
        project.status = new_status
        project.save()
        return JsonResponse({'success': True})
    return JsonResponse({'success': False, 'error': 'Invalid request'})