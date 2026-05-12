import json
import os
import re
from dataclasses import dataclass
from typing import Any, Dict, List

import requests


DEFAULT_SKILL_VOCAB = [
    "Python",
    "Django",
    "React",
    "AWS",
    "TypeScript",
    "JavaScript",
    "Node.js",
    "PostgreSQL",
    "Docker",
    "Kubernetes",
    "REST",
    "GraphQL",
    "Flask",
    "FastAPI",
]


@dataclass
class ExtractionResult:
    role: str
    skills: List[str]
    experience: str
    provider_used: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "role": self.role,
            "skills": self.skills,
            "experience": self.experience,
            "provider_used": self.provider_used,
        }


def _normalize_model_output(payload: Dict[str, Any], provider: str) -> ExtractionResult:
    role = str(payload.get("role") or "").strip() or "Unknown Role"
    skills = payload.get("skills") or []
    if not isinstance(skills, list):
        skills = []
    skills = [str(item).strip() for item in skills if str(item).strip()]
    experience = str(payload.get("experience") or "").strip() or "Not specified"
    return ExtractionResult(role=role, skills=skills, experience=experience, provider_used=provider)


def _extract_with_openai(description: str) -> ExtractionResult:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is not configured")

    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        timeout=30,
        json={
            "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Extract hiring requirements into strict JSON with keys: "
                        "role (string), skills (string array), experience (string). "
                        "Do not include additional keys."
                    ),
                },
                {"role": "user", "content": description},
            ],
        },
    )
    response.raise_for_status()
    payload = response.json()
    content = payload["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    return _normalize_model_output(parsed, "openai")


def _extract_with_gemini(description: str) -> ExtractionResult:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not configured")

    model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    endpoint = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    prompt = (
        "Extract hiring requirements and return JSON only with keys role, skills, experience.\n\n"
        f"Job description:\n{description}"
    )
    response = requests.post(
        endpoint,
        headers={"Content-Type": "application/json"},
        timeout=30,
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
        },
    )
    response.raise_for_status()
    payload = response.json()
    text = payload["candidates"][0]["content"]["parts"][0]["text"]
    parsed = json.loads(text)
    return _normalize_model_output(parsed, "gemini")


def _heuristic_extract(description: str) -> ExtractionResult:
    text = " ".join(description.split())
    role_match = re.search(
        r"(?:looking for|hiring|seeking)\s+(.+?)(?:\s+with|\s+experience|\.)",
        text,
        flags=re.IGNORECASE,
    )
    role = role_match.group(1).strip() if role_match else "Unknown Role"

    experience_match = re.search(
        r"(\d+\s*[-to]+\s*\d+\s*(?:\+)?\s*(?:years|yrs))|(\d+\+?\s*(?:years|yrs))",
        text,
        flags=re.IGNORECASE,
    )
    experience = experience_match.group(0) if experience_match else "Not specified"
    experience = experience.replace("yrs", "Years").replace("years", "Years")

    found_skills = []
    lowered = text.lower()
    for skill in DEFAULT_SKILL_VOCAB:
        if skill.lower() in lowered:
            found_skills.append(skill)

    if not found_skills:
        with_match = re.search(r"with\s+(.+?)(?:\s+experience|\.)", text, flags=re.IGNORECASE)
        if with_match:
            segments = re.split(r",| and ", with_match.group(1))
            found_skills = [segment.strip().title() for segment in segments if segment.strip()]

    return ExtractionResult(
        role=role.title(),
        skills=found_skills,
        experience=experience,
        provider_used="heuristic",
    )


def extract_requirements(description: str, provider: str = "openai") -> Dict[str, Any]:
    provider = (provider or "openai").lower()
    if provider == "openai":
        try:
            return _extract_with_openai(description).to_dict()
        except Exception:
            return _heuristic_extract(description).to_dict()
    if provider == "gemini":
        try:
            return _extract_with_gemini(description).to_dict()
        except Exception:
            return _heuristic_extract(description).to_dict()
    return _heuristic_extract(description).to_dict()
