"""
ECLADO Cowork — 백엔드 API 서버
tables/* REST API (JSON 파일 기반 영속성)
"""
import json, os, uuid
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# CORS 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 데이터 저장 디렉토리
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

TABLES = [
    "projects", "tasks", "members", "comments",
    "departments", "chat_rooms", "messages", "emails",
    "calendar_events", "cloud_files", "leave_records",
    "leave_usages", "personal_projects", "project_files",
    "project_history", "project_notes", "task_attachments",
    "app_settings",
]

def db_path(table: str) -> Path:
    return DATA_DIR / f"{table}.json"

def load_table(table: str) -> list:
    p = db_path(table)
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return []

def save_table(table: str, data: list):
    db_path(table).write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

# ── GET /tables/{table}?limit=N ──
@app.get("/tables/{table}")
async def get_all(table: str, limit: int = 300):
    rows = load_table(table)
    return {"data": rows[:limit], "total": len(rows)}

# ── GET /tables/{table}/{id} ──
@app.get("/tables/{table}/{item_id}")
async def get_one(table: str, item_id: str):
    rows = load_table(table)
    row = next((r for r in rows if str(r.get("id")) == item_id), None)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    return row

# ── POST /tables/{table} ──
@app.post("/tables/{table}")
async def create(table: str, request: Request):
    body = await request.json()
    if "id" not in body or not body["id"]:
        body["id"] = "id_" + uuid.uuid4().hex[:12]
    rows = load_table(table)
    rows.append(body)
    save_table(table, rows)
    return body

# ── PUT /tables/{table}/{id} ──
@app.put("/tables/{table}/{item_id}")
async def update(table: str, item_id: str, request: Request):
    body = await request.json()
    rows = load_table(table)
    idx = next((i for i, r in enumerate(rows) if str(r.get("id")) == item_id), None)
    if idx is None:
        # 없으면 새로 생성
        body["id"] = item_id
        rows.append(body)
    else:
        rows[idx] = {**rows[idx], **body, "id": item_id}
    save_table(table, rows)
    return rows[idx] if idx is not None else body

# ── PATCH /tables/{table}/{id} ──
@app.patch("/tables/{table}/{item_id}")
async def patch(table: str, item_id: str, request: Request):
    body = await request.json()
    rows = load_table(table)
    idx = next((i for i, r in enumerate(rows) if str(r.get("id")) == item_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Not found")
    rows[idx] = {**rows[idx], **body, "id": item_id}
    save_table(table, rows)
    return rows[idx]

# ── DELETE /tables/{table}/{id} ──
@app.delete("/tables/{table}/{item_id}")
async def delete(table: str, item_id: str):
    rows = load_table(table)
    new_rows = [r for r in rows if str(r.get("id")) != item_id]
    save_table(table, new_rows)
    return {"ok": True}

# ── 정적 파일 서빙 (프론트엔드) ──
app.mount("/", StaticFiles(directory=str(Path(__file__).parent), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
