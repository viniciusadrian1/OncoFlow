"""OncoFlow Casa: local, synthetic-data proof of concept. Python standard library only."""
import argparse
import json
import sqlite3
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
VALUES = {"bem", "desconforto", "contato"}
SOURCES = {"simulador", "esp32"}


def now():
    return datetime.now(timezone.utc).isoformat()


def connect():
    db = sqlite3.connect(DB_PATH, timeout=5)
    db.row_factory = sqlite3.Row
    return db


def initialize():
    with connect() as db:
        db.execute("""CREATE TABLE IF NOT EXISTS events (
            event_id TEXT PRIMARY KEY, device_id TEXT NOT NULL,
            value TEXT NOT NULL, source TEXT NOT NULL,
            received_at TEXT NOT NULL, reviewed_at TEXT
        )""")


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/events":
            with connect() as db:
                events = [dict(row) for row in db.execute(
                    "SELECT * FROM events ORDER BY received_at DESC, event_id DESC LIMIT 200")]
            self.send_json(200, {"events": events, "demo": True})
            return
        files = {"/": "index.html", "/index.html": "index.html",
                 "/app.js": "app.js", "/style.css": "style.css"}
        mime = {".html": "text/html", ".js": "text/javascript", ".css": "text/css"}
        if path not in files:
            self.send_json(404, {"error": "Caminho não encontrado."})
            return
        file = ROOT / "web" / files[path]
        body = file.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime[file.suffix] + "; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        # Same-origin browser use; no CORS. ESP32 requests have no Origin header.
        origin = self.headers.get("Origin")
        if origin and origin != "http://" + self.headers.get("Host", ""):
            self.send_json(403, {"error": "Origem não permitida."})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size <= 0 or size > 2048:
                raise ValueError()
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValueError()
        except (ValueError, UnicodeDecodeError):
            self.send_json(400, {"error": "Envie um objeto JSON de até 2 KB."})
            return
        path = urlsplit(self.path).path
        if path == "/api/events":
            event_id, device_id = data.get("event_id"), data.get("device_id")
            value, source = data.get("value"), data.get("source")
            if (not isinstance(event_id, str) or not 1 <= len(event_id) <= 96
                    or not isinstance(device_id, str) or not 1 <= len(device_id) <= 64
                    or not isinstance(value, str) or value not in VALUES
                    or not isinstance(source, str) or source not in SOURCES):
                self.send_json(400, {"error": "Identificador, resposta ou origem inválidos."})
                return
            with connect() as db:
                old = db.execute("SELECT * FROM events WHERE event_id = ?", (event_id,)).fetchone()
                if old:
                    if any(old[key] != data.get(key) for key in ("device_id", "value", "source")):
                        self.send_json(409, {"error": "Identificador já usado por outro registro."})
                        return
                    self.send_json(200, {"event": dict(old), "duplicate": True})
                    return
                db.execute("INSERT INTO events VALUES (?, ?, ?, ?, ?, NULL)",
                           (event_id, device_id, value, source, now()))
                row = db.execute("SELECT * FROM events WHERE event_id = ?", (event_id,)).fetchone()
            self.send_json(201, {"event": dict(row), "duplicate": False})
        elif path == "/api/review":
            event_id = data.get("event_id")
            if not isinstance(event_id, str):
                self.send_json(400, {"error": "Registro inválido."})
                return
            with connect() as db:
                db.execute("UPDATE events SET reviewed_at = COALESCE(reviewed_at, ?) WHERE event_id = ?",
                           (now(), event_id))
                row = db.execute("SELECT * FROM events WHERE event_id = ?", (event_id,)).fetchone()
            self.send_json(200 if row else 404, {"event": dict(row)} if row else {"error": "Registro não encontrado."})
        else:
            self.send_json(404, {"error": "Caminho não encontrado."})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lan", action="store_true", help="Permitir o ESP32 na rede local de demonstração")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--open", action="store_true", help="Abrir o painel no navegador")
    parser.add_argument("--db", type=Path, default=ROOT / "demo.sqlite3")
    args = parser.parse_args()
    DB_PATH = args.db
    initialize()
    host = "0.0.0.0" if args.lan else "127.0.0.1"
    server = ThreadingHTTPServer((host, args.port), Handler)
    print(f"OncoFlow Casa: http://localhost:{args.port} | Dados ficticios", flush=True)
    if args.lan:
        print("Modo LAN: somente rede privada de demonstracao; sem autenticacao ou TLS.", flush=True)
    if args.open:
        webbrowser.open(f"http://localhost:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
