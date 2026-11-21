import re


_EMPTY_COST = re.compile(r"[ \t]*\([ \t]*\)[ \t]*")


def clean_description(text, header_actions):
    """Normalize catalog text and omit a confirmed leading empty-cost header."""
    text = re.sub(r"<[^>]+>", "\n", text or "").replace("‹cost›", "").split("‹")[0]
    text = re.sub(r"\n+", "\n", text).strip()
    lines = text.split("\n", 3)
    if len(lines) == 4:
        action, name, cost, body = lines
        if action.rstrip(" \t") in header_actions and name.strip() and _EMPTY_COST.fullmatch(cost) and body.strip():
            return body
    return text
