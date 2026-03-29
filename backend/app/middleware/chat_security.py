"""
Chat security: input sanitization and output filtering.
Prevents SQL injection attempts in user messages and leaks in responses.
"""

import re

# SQL keywords and patterns to strip from user input
SQL_PATTERNS = re.compile(
    r"\b(DROP|DELETE|INSERT|UPDATE|TRUNCATE|ALTER|CREATE|EXEC|EXECUTE|"
    r"UNION|SELECT\s+\*|--|;|/\*|\*/)\b",
    re.IGNORECASE,
)

# Patterns that suggest sensitive data leak in response
LEAK_PATTERNS = [
    re.compile(r"postgres(ql)?(\+asyncpg)?://[^\s]+", re.IGNORECASE),
    re.compile(r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?", re.IGNORECASE),
    re.compile(r"localhost:\d+", re.IGNORECASE),
    re.compile(r"(CREATE|ALTER)\s+TABLE\s+[\w\.]+", re.IGNORECASE),
    re.compile(r"\|[\s\w]+\|[^\n]+\|", re.MULTILINE),  # table dump style
]

SAFE_FALLBACK = (
    "Je ne peux pas traiter cette demande. Réessayez avec une question sur "
    "Estran, Finance ou Achats."
)


def sanitize_chat_input(text: str) -> str:
    """
    Strip SQL keywords and dangerous patterns from user message before processing.
    Returns sanitized string.
    """
    if not text or not isinstance(text, str):
        return ""
    cleaned = SQL_PATTERNS.sub("", text)
    return cleaned.strip()


def filter_chat_output(text: str) -> str:
    """
    If response contains connection string, internal IP, or raw table dump,
    return safe fallback instead.
    """
    if not text or not isinstance(text, str):
        return text
    for pattern in LEAK_PATTERNS:
        if pattern.search(text):
            return SAFE_FALLBACK
    return text
