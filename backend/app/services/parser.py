import json
import os
import re
from datetime import datetime, timezone
from typing import List, Dict, Any

import pandas as pd
import pypdf
import docx
from app.security import sanitize_text

CHAT_REGEX = re.compile(
    r"^\[(?P<timestamp>[^\]]+)\]\s+(?P<author>[^:]+):\s+(?P<content>.*)$"
)

def parse_chat_export(text: str) -> List[Dict[str, Any]]:
    snippets = []
    lines = text.strip().split("\n")
    current_snippet = None

    for idx, line in enumerate(lines, start=1):
        line_clean = line.strip()
        if not line_clean:
            continue
        match = CHAT_REGEX.match(line_clean)
        if match:
            if current_snippet:
                snippets.append(current_snippet)
            gd = match.groupdict()
            current_snippet = {
                "content": sanitize_text(gd["content"].strip()),
                "location": f"line {idx}",
                "author": sanitize_text(gd["author"].strip()),
                "timestamp": sanitize_text(gd["timestamp"].strip())
            }
        else:
            if current_snippet:
                current_snippet["content"] += "\n" + sanitize_text(line_clean)
            else:
                current_snippet = {
                    "content": sanitize_text(line_clean),
                    "location": f"line {idx}",
                    "author": "Unknown",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
    if current_snippet:
        snippets.append(current_snippet)
    return snippets

def parse_text_or_markdown(text: str, default_author: str = "Team") -> List[Dict[str, Any]]:
    snippets = []
    paragraphs = re.split(r"\n\s*\n", text.strip())
    line_cursor = 1
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    for p in paragraphs:
        cleaned = sanitize_text(p.strip())
        if not cleaned:
            continue
        line_count = len(p.split("\n"))
        end_cursor = line_cursor + line_count - 1
        loc = f"lines {line_cursor}-{end_cursor}" if line_count > 1 else f"line {line_cursor}"
        snippets.append({
            "content": cleaned,
            "location": loc,
            "author": default_author,
            "timestamp": now_str
        })
        line_cursor += line_count + 1
    return snippets

def parse_pdf(file_path: str, default_author: str = "Author") -> List[Dict[str, Any]]:
    snippets = []
    reader = pypdf.PdfReader(file_path)
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        cleaned = sanitize_text(text.strip())
        if cleaned:
            # Split page into logical sections if long
            sections = re.split(r"\n\s*\n", cleaned)
            for s_idx, sec in enumerate(sections, start=1):
                sec_clean = sec.strip()
                if len(sec_clean) > 20:
                    snippets.append({
                        "content": sec_clean,
                        "location": f"p. {i}, sec. {s_idx}",
                        "author": default_author,
                        "timestamp": now_str
                    })
    return snippets

def parse_docx(file_path: str, default_author: str = "Author") -> List[Dict[str, Any]]:
    snippets = []
    doc = docx.Document(file_path)
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    for idx, p in enumerate(doc.paragraphs, start=1):
        text = p.text.strip()
        cleaned = sanitize_text(text)
        if len(cleaned) > 10:
            snippets.append({
                "content": cleaned,
                "location": f"para {idx}",
                "author": default_author,
                "timestamp": now_str
            })
    return snippets

def parse_csv(file_path: str, default_author: str = "Data Team") -> List[Dict[str, Any]]:
    snippets = []
    df = pd.read_csv(file_path)
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    for idx, row in df.iterrows():
        row_dict = row.dropna().to_dict()
        row_str = ", ".join([f"{k}: {v}" for k, v in row_dict.items()])
        cleaned = sanitize_text(row_str)
        if cleaned:
            snippets.append({
                "content": cleaned,
                "location": f"row {idx + 1}",
                "author": default_author,
                "timestamp": now_str
            })
    return snippets

def parse_json(file_path: str, default_author: str = "System") -> List[Dict[str, Any]]:
    snippets = []
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if isinstance(data, list):
        for idx, item in enumerate(data, start=1):
            cleaned = sanitize_text(json.dumps(item, indent=2))
            snippets.append({
                "content": cleaned,
                "location": f"item {idx}",
                "author": default_author,
                "timestamp": now_str
            })
    elif isinstance(data, dict):
        for k, v in data.items():
            cleaned = sanitize_text(f"{k}: {json.dumps(v, indent=2)}")
            snippets.append({
                "content": cleaned,
                "location": f"key '{k}'",
                "author": default_author,
                "timestamp": now_str
            })
    return snippets

def parse_source_file(file_path: str, file_type: str, author: str = "Author") -> List[Dict[str, Any]]:
    ext = os.path.splitext(file_path)[1].lower()
    
    if ext in (".txt", ".md"):
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        # Detect if it's a chat export
        if any(line.startswith("[") and "]:" in line for line in content.split("\n")[:10]):
            return parse_chat_export(content)
        return parse_text_or_markdown(content, author)
    elif ext == ".pdf":
        return parse_pdf(file_path, author)
    elif ext == ".docx":
        return parse_docx(file_path, author)
    elif ext == ".csv":
        return parse_csv(file_path, author)
    elif ext == ".json":
        return parse_json(file_path, author)
    else:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return parse_text_or_markdown(f.read(), author)

