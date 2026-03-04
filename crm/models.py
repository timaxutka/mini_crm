from django.db import models
from datetime import date

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
        ('not-paid', 'Не оплачен'),
        ('pending', 'Ожидает оплаты'),
    )

    title = models.CharField(max_length=200, verbose_name="Название проекта")
    client_name = models.CharField(max_length=200, blank=True, null=True, verbose_name="Клиент")
    description = models.TextField(blank=True, null=True, verbose_name="Описание проекта")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='planned', verbose_name="Статус")
    budget = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, verbose_name="Бюджет")
    start_date = models.DateField(null=True, blank=True, verbose_name="Дата начала")
    end_date = models.DateField(null=True, blank=True, verbose_name="Дата завершения")
    payment_status = models.CharField(max_length=20, choices=PAYMENT_CHOICES, default='not-paid', verbose_name="Оплата")

    order = models.PositiveIntegerField(default=0, verbose_name="Позиция")

    def save(self, *args, **kwargs):
        if self._state.adding and self.order == 0:
            max_order = Project.objects.filter(status=self.status).aggregate(models.Max('order'))['order__max'] or 0
            self.order = max_order + 1
        super().save(*args, **kwargs)

    @property
    def progress(self):
        """Прогресс между start_date и end_date в процентах"""
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
