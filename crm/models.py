from django.db import models
from datetime import date

class Client(models.Model):
    name = models.CharField(max_length=200, verbose_name="Имя/Компания")
    contact_person = models.CharField(max_length=200, blank=True, null=True, verbose_name="Контактное лицо")
    email = models.EmailField(blank=True, null=True, verbose_name="Email")
    phone = models.CharField(max_length=20, blank=True, null=True, verbose_name="Телефон")
    telegram = models.CharField(max_length=100, blank=True, null=True, verbose_name="Telegram")
    is_vip = models.BooleanField(default=False, verbose_name="VIP статус")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата добавления")

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Клиент"
        verbose_name_plural = "Клиенты"
        ordering = ['name']


class Project(models.Model):
    STATUS_CHOICES = (
        ('planned', 'К выполнению'),
        ('inwork', 'В работе'),
        ('done', 'Завершён'),
        ('overdue', 'Просрочен'),
        ('paused', 'Приостановлен'),
    )

    PAYMENT_CHOICES = (
        ('paid', 'Оплачен'),
        ('not_paid', 'Не оплачен'),
        ('pending', 'Ожидает оплаты'),
    )

    title = models.CharField(max_length=200, verbose_name="Название проекта")
    
    # ИЗМЕНЕНИЕ: Заменяем client_name на связь с моделью Client
    client = models.ForeignKey(
        Client, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='projects', 
        verbose_name="Клиент"
    )
    
    description = models.TextField(blank=True, null=True, verbose_name="Описание проекта")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='planned', verbose_name="Статус")
    budget = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, verbose_name="Бюджет")
    start_date = models.DateField(null=True, blank=True, verbose_name="Дата начала")
    end_date = models.DateField(null=True, blank=True, verbose_name="Дата завершения")
    payment_status = models.CharField(max_length=20, choices=PAYMENT_CHOICES, default='not-paid', verbose_name="Оплата")
    payment_date = models.DateField(null=True, blank=True, verbose_name="Дата оплаты")

    order = models.PositiveIntegerField(default=0, verbose_name="Позиция")

    def save(self, *args, **kwargs):
        if self._state.adding and self.order == 0:
            max_order = Project.objects.filter(status=self.status).aggregate(models.Max('order'))['order__max'] or 0
            self.order = max_order + 1
        super().save(*args, **kwargs)

    @property
    def progress(self):
        if not self.start_date or not self.end_date:
            return 0
        total = (self.end_date - self.start_date).days
        if total <= 0:
            return 100
        passed = (date.today() - self.start_date).days
        progress = (passed / total) * 100
        return max(0, min(100, round(progress)))

    def __str__(self):
        return self.title

    def get_status_display(self):
        return dict(self.STATUS_CHOICES).get(self.status, '—') 

    def get_payment_status_display(self):
        return dict(self.PAYMENT_CHOICES).get(self.payment_status, '—')

    class Meta:
        ordering = ['status', 'order', 'id']


class Task(models.Model):
    TASK_STATUS_CHOICES = (
        ('todo', 'К выполнению'),
        ('inwork', 'В работе'),
        ('done', 'Выполнено'),
    )

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='tasks', verbose_name="Проект")
    title = models.CharField(max_length=255, verbose_name="Заголовок задачи")
    status = models.CharField(max_length=20, choices=TASK_STATUS_CHOICES, default='todo', verbose_name="Статус задачи")
    due_date = models.DateField(null=True, blank=True, verbose_name="Срок исполнения")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    order = models.PositiveIntegerField(default=0, verbose_name="Позиция")

    def __str__(self):
        return f"{self.title} — {self.project.title}"

    class Meta:
        verbose_name = "Задача"
        verbose_name_plural = "Задачи"
        ordering = ['order', 'id'] 