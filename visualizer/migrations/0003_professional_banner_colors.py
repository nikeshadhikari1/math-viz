from django.db import migrations, models

COLOR_MAP = {
    '#6c63ff': '#1f4e79',
    '#ff6b6b': '#9a3412',
    '#4ecdc4': '#0f766e',
    '#ffd93d': '#8a6414',
    '#ff9f43': '#9a3412',
    '#a29bfe': '#3d5a80',
    '#fd79a8': '#334155',
    '#00b894': '#2f6b3f',
}


def forwards(apps, schema_editor):
    Classroom = apps.get_model('visualizer', 'Classroom')
    for old, new in COLOR_MAP.items():
        Classroom.objects.filter(banner_color__iexact=old).update(banner_color=new)


class Migration(migrations.Migration):

    dependencies = [
        ('visualizer', '0002_classroom_equation_classroom_classmembership'),
    ]

    operations = [
        migrations.AlterField(
            model_name='classroom',
            name='banner_color',
            field=models.CharField(default='#1f4e79', max_length=7),
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
