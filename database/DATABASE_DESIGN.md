# Database Design

## Users

Django `auth_user`

- id
- username
- email
- password hash
- first_name
- last_name
- is_staff
- is_superuser

## UserProfile

- id
- user_id
- role: admin, recruiter, analyst

## JobOpening

- id
- title
- department
- status
- location
- applicants
- skills
- created_at
- updated_at

## ScrapedJob

- id
- source
- external_id
- search_query
- title
- company
- location
- salary
- experience
- url
- description
- skills
- raw
- scraped_at
- created_at

Unique key: `(source, external_id)`.

## Recruiter

- id
- company
- name
- designation
- email
- linkedin
- phone
- roles
- performance
- hires
- avatar
- updated_at

## CompanyAnalytics

- id
- company
- applicants
- hired
- updated_at

## HiringTrend

- id
- month
- hired
- applied
- recorded_on
- created_at

