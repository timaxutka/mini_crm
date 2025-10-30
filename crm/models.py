from django.db import models

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
    client_name = models.CharField(max_length=200, blank=True, null=True, verbose_name="Клиент")  # 🟢 Новое поле
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='planned', verbose_name="Статус")
    budget = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, verbose_name="Бюджет")
    start_date = models.DateField(null=True, blank=True, verbose_name="Дата начала")
    end_date = models.DateField(null=True, blank=True, verbose_name="Дата завершения")
    payment_status = models.CharField(max_length=20, choices=PAYMENT_CHOICES, default='not-paid', verbose_name="Оплата")  # 🟢 Новое поле

    def __str__(self):
        return self.title

    def get_status_display(self):
        return dict(self.STATUS_CHOICES).get(self.status, '—')

    def get_payment_status_display(self):
        return dict(self.PAYMENT_CHOICES).get(self.payment_status, '—')

    class Meta:
        verbose_name = "Проект"
        verbose_name_plural = "Проекты"
