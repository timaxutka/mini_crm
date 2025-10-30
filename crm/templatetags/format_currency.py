from django import template

register = template.Library()

@register.filter
def format_currency(value):
    """
    Форматирует число в строку с пробелами и символом рубля, например, 40000 -> 40 000₽
    """
    try:
        value = int(float(value))
        formatted = f"{value:,}".replace(",", " ") + "₽"
        return formatted
    except (ValueError, TypeError):
        return "—"