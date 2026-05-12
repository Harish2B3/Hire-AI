from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tasks", "0002_companyanalytics_hiringtrend_jobopening_recruiter"),
    ]

    operations = [
        migrations.CreateModel(
            name="ScrapedJob",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source", models.CharField(max_length=40)),
                ("external_id", models.CharField(max_length=255)),
                ("search_query", models.CharField(db_index=True, max_length=255)),
                ("title", models.CharField(max_length=255)),
                ("company", models.CharField(blank=True, max_length=255)),
                ("location", models.CharField(blank=True, max_length=255)),
                ("salary", models.CharField(blank=True, max_length=255)),
                ("experience", models.CharField(blank=True, max_length=255)),
                ("url", models.URLField(blank=True, max_length=1000)),
                ("description", models.TextField(blank=True)),
                ("skills", models.JSONField(blank=True, default=list)),
                ("raw", models.JSONField(blank=True, default=dict)),
                ("scraped_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["-scraped_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="scrapedjob",
            constraint=models.UniqueConstraint(fields=("source", "external_id"), name="unique_scraped_job_per_source"),
        ),
        migrations.AddIndex(
            model_name="scrapedjob",
            index=models.Index(fields=["search_query", "source"], name="tasks_scrap_search__3102b1_idx"),
        ),
    ]
