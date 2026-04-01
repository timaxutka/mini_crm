from django.contrib import admin
from .models import Project, Client, Task, Estimate, EstimateItem

# Позволяет редактировать задачи прямо внутри страницы проекта
class TaskInline(admin.TabularInline):
    model = Task
    extra = 1

@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ('name', 'contact_person', 'email', 'phone', 'is_vip')
    search_fields = ('name', 'contact_person')
    list_filter = ('is_vip',)

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    # ЗАМЕНЕНО: client_name -> client
    list_display = ('title', 'client', 'status', 'payment_status', 'budget', 'end_date', 'order')
    list_filter = ('status', 'payment_status', 'client')
    search_fields = ('title', 'client__name') # Поиск по имени связанного клиента
    inlines = [TaskInline] # Добавляем список задач внутрь проекта

@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'project', 'status', 'created_at')
    list_filter = ('status', 'project')

class EstimateItemInline(admin.TabularInline):
    model = EstimateItem
    extra = 0

@admin.register(Estimate)
class EstimateAdmin(admin.ModelAdmin):
    list_display = ('title', 'total_amount', 'created_at')
    inlines = [EstimateItemInline]