from django.urls import path
from . import views

urlpatterns = [
    path('', views.projects, name='projects'),
    path('projects/', views.projects, name='projects'),
    path('clients/', views.clients, name='clients'),
    path('tasks/', views.tasks, name='tasks'),
    path('finance/', views.finance, name='finance'),
    path('calculator/', views.calculator, name='calculator'),
    path('settings/', views.settings, name='settings'),
    path('update_status/', views.update_status, name='update_status'),
    path('projects/<int:project_id>/', views.project_detail, name='project_detail'),
]