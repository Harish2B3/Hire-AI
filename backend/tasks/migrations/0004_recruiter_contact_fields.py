from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tasks", "0003_scrapedjob"),
    ]

    operations = [
        migrations.AddField(
            model_name="recruiter",
            name="company",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="recruiter",
            name="designation",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="recruiter",
            name="email",
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.AddField(
            model_name="recruiter",
            name="linkedin",
            field=models.URLField(blank=True),
        ),
        migrations.AddField(
            model_name="recruiter",
            name="phone",
            field=models.CharField(blank=True, max_length=40),
        ),
    ]

