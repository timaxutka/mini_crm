from django.contrib import admin
from .models import Project

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('title', 'client_name', 'status', 'payment_status', 'budget', 'end_date')
    list_filter = ('status', 'payment_status')
    search_fields = ('title', 'client_name')
