import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from tasks.models import GlassdoorCompany

data = {'company_id': 1138, 'name': 'Apple', 'company_link': 'https://www.glassdoor.com/Overview/Working-at-Apple-EI_IE1138.11,16.htm', 'rating': 4.1, 'review_count': 52398, 'salary_count': 176578, 'job_count': 6851, 'headquarters_location': 'Cupertino, US', 'logo': 'https://media.glassdoor.com/sql/1138/apple-squarelogo-1595530154096.png', 'company_size': '10000+ Employees', 'company_description': 'We’re a diverse collective of thinkers and doers, continually reimagining what’s possible to help us all do what we love in new ways. And the same innovation that goes into our products also applies to our practices — strengthening our commitment to leave the world better than we found it. This is where your work can make a difference in people’s lives. Including your own.  \n\nApple is an equal opportunity employer that is committed to inclusion and diversity. We seek to promote equal opportunity for all applicants without regard to race, color, religion, sex, sexual orientation, gender identity, national origin, disability, Veteran status, or other legally protected characteristics.', 'industry': 'Computer Hardware Development', 'website': 'https://www.apple.com', 'revenue': '$10+ billion (USD)', 'ceo': 'Tim Cook'}

GlassdoorCompany.objects.update_or_create(
    company_id=data["company_id"],
    defaults={
        "name": data["name"],
        "company_link": data["company_link"],
        "rating": data["rating"],
        "review_count": data["review_count"],
        "salary_count": data["salary_count"],
        "job_count": data["job_count"],
        "headquarters_location": data["headquarters_location"],
        "logo": data["logo"],
        "company_size": data["company_size"],
        "company_description": data["company_description"],
        "industry": data["industry"],
        "website": data["website"],
        "revenue": data["revenue"],
        "ceo": data["ceo"],
    }
)
print("Apple Glassdoor data inserted successfully.")
