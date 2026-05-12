import requests
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
sys.path.append(str(BASE_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

url = "https://glassdoor-data-scraper11.p.rapidapi.com/company-overview.php"

querystring = {"company_id":"1138"}

headers = {
	"x-rapidapi-key": "3527d1710dmshcceaf3ac09a88eep10d6b0jsn493861864e34",
	"x-rapidapi-host": "glassdoor-data-scraper11.p.rapidapi.com",
	"Content-Type": "application/json"
}

response = requests.get(url, headers=headers, params=querystring)

data = response.json()
print(data)

if data.get("status") == "OK" and data.get("data"):
	import django
	django.setup()
	from tasks.views import _save_glassdoor_company

	_save_glassdoor_company(data["data"])
	print(f"Saved Glassdoor data for {data['data'].get('name', 'company')}.")
