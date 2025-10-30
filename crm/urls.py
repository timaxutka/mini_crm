from django.urls import path
from . import views

urlpatterns = [
    path('', views.projects, name='projects'),        # главная = список проектов
    path('projects/', views.projects, name='projects'), # дублируем, чтобы работало по /projects
    path('clients/', views.clients, name='clients'),
    path('tasks/', views.tasks, name='tasks'),
    path('finance/', views.finance, name='finance'),
    path('calculator/', views.calculator, name='calculator'),
    path('settings/', views.settings, name='settings'),
    path('update_status/', views.update_status, name='update_status'),
]
