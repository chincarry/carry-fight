#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""肉鸽排行榜后端 —— Python 3 标准库实现，无第三方依赖。

启动：
    python3 server/leaderboard_server.py
    python3 server/leaderboard_server.py --port 8787 --host 0.0.0.0

功能：
    GET  /api/health                    健康检查
    GET  /api/leaderboard?mode=normal&limit=20
                                        通关时间排行榜（按用时升序，同玩家取最好成绩）
    POST /api/leaderboard               提交一次通关成绩
         body: {name, mode, time, char?, kills?, dmg?}

同时把游戏本体托管在同一端口：
    /          → dist/index.html（单文件构建版，推荐）
    /dev       → index.html（分模块开发版）
    /js /css /assets /preview /dist ...  静态资源

数据保存在 server/leaderboard.db（SQLite），首次启动自动建表。
"""

import argparse
import json
import mimetypes
import os
import re
import sqlite3
import sys
import threading
import time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(ROOT, 'server', 'leaderboard.db')

MODES = ('normal', 'gauntlet')
MODE_LABEL = {'normal': '普通爬塔', 'gauntlet': 'BOSS 连战'}
NAME_MAX = 16
TIME_MIN = {'normal': 10.0, 'gauntlet': 40.0}
TIME_MAX = 6 * 3600
MAX_BODY = 64 * 1024
STATIC_PREFIXES = ('/js/', '/css/', '/assets/', '/preview/', '/dist/', '/docs/')

DB_LOCK = threading.Lock()
RATE_LOCK = threading.Lock()
RATE = {}


def db_connect(path):
    conn = sqlite3.connect(path, timeout=8)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with db_connect(path) as conn:
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('''CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            mode TEXT NOT NULL,
            time REAL NOT NULL,
            char TEXT NOT NULL DEFAULT '',
            kills INTEGER NOT NULL DEFAULT 0,
            dmg REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            ip TEXT NOT NULL DEFAULT ''
        )''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_scores_mode_time ON scores(mode, time)')
        conn.commit()


def clean_name(raw):
    s = str(raw or '')
    s = re.sub(r'[\x00-\x1f\x7f]', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s[:NAME_MAX]


def list_scores(path, mode, limit):
    with DB_LOCK, db_connect(path) as conn:
        # 每名玩家取最好成绩（MIN(time)），再按用时升序
        rows = conn.execute('''
            SELECT s.name, s.time, s.char, s.kills, s.dmg, s.created_at
            FROM scores s
            JOIN (
                SELECT name, MIN(time) AS best
                FROM scores WHERE mode = ?
                GROUP BY name
            ) b ON s.name = b.name AND s.time = b.best AND s.mode = ?
            GROUP BY s.name
            ORDER BY s.time ASC, s.created_at ASC
            LIMIT ?
        ''', (mode, mode, limit)).fetchall()
        total = conn.execute(
            'SELECT COUNT(DISTINCT name) FROM scores WHERE mode = ?', (mode,)
        ).fetchone()[0]
    entries = []
    for i, r in enumerate(rows):
        entries.append({
            'rank': i + 1,
            'name': r['name'],
            'time': round(float(r['time']), 2),
            'char': r['char'] or '',
            'kills': int(r['kills'] or 0),
            'dmg': round(float(r['dmg'] or 0), 0),
            'created_at': r['created_at'],
        })
    return {'mode': mode, 'modeLabel': MODE_LABEL.get(mode, mode), 'total': total, 'entries': entries}


def insert_score(path, payload, ip):
    mode = payload.get('mode')
    name = clean_name(payload.get('name'))
    try:
        score_time = float(payload.get('time'))
    except (TypeError, ValueError):
        return None, 'time 必须是数字'
    if mode not in MODES:
        return None, 'mode 必须是 normal 或 gauntlet'
    if not name:
        return None, '用户名不能为空'
    if score_time < TIME_MIN[mode] or score_time > TIME_MAX:
        return None, '通关时间不在合理范围'
    char = str(payload.get('char') or '')[:12]
    try:
        kills = max(0, min(999999, int(payload.get('kills') or 0)))
        dmg = max(0, min(1e12, float(payload.get('dmg') or 0)))
    except (TypeError, ValueError):
        kills, dmg = 0, 0
    now = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())

    with DB_LOCK, db_connect(path) as conn:
        conn.execute('''INSERT INTO scores (name, mode, time, char, kills, dmg, created_at, ip)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                     (name, mode, round(score_time, 2), char, kills, dmg, now, ip))
        conn.commit()
        best = conn.execute(
            'SELECT MIN(time) FROM scores WHERE mode = ? AND name = ?', (mode, name)
        ).fetchone()[0]
        ahead = conn.execute('''
            SELECT COUNT(*) FROM (
                SELECT name, MIN(time) AS mt FROM scores WHERE mode = ? GROUP BY name
            ) WHERE mt < ?
        ''', (mode, best)).fetchone()[0]
        total = conn.execute(
            'SELECT COUNT(DISTINCT name) FROM scores WHERE mode = ?', (mode,)
        ).fetchone()[0]
    return {
        'rank': ahead + 1,
        'best': round(float(best), 2),
        'total': total,
        'name': name,
        'mode': mode,
    }, None


class Handler(BaseHTTPRequestHandler):
    server_version = 'BVN-Leaderboard/1.0'
    db_path = DEFAULT_DB

    def log_message(self, fmt, *args):
        sys.stderr.write('[%s] %s\n' % (time.strftime('%H:%M:%S'), fmt % args))

    # ---------------- 基础响应 ----------------
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _ip(self):
        fwd = self.headers.get('X-Forwarded-For')
        if fwd:
            return fwd.split(',')[0].strip()
        return self.client_address[0]

    def _rate_ok(self):
        ip = self._ip()
        now = time.time()
        with RATE_LOCK:
            q = RATE.setdefault(ip, deque(maxlen=12))
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= 10:
                return False
            q.append(now)
        return True

    # ---------------- 路由 ----------------
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == '/api/health':
            return self._json(200, {'ok': True, 'time': int(time.time())})
        if path == '/api/leaderboard':
            qs = parse_qs(parsed.query)
            mode = (qs.get('mode') or ['normal'])[0]
            if mode not in MODES:
                return self._json(400, {'ok': False, 'error': 'mode 必须是 normal 或 gauntlet'})
            try:
                limit = int((qs.get('limit') or ['20'])[0])
            except ValueError:
                limit = 20
            limit = max(1, min(50, limit))
            return self._json(200, list_scores(self.db_path, mode, limit))
        return self._static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != '/api/leaderboard':
            return self._json(404, {'ok': False, 'error': 'Not Found'})
        if not self._rate_ok():
            return self._json(429, {'ok': False, 'error': '提交太频繁，请稍后再试'})
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            return self._json(400, {'ok': False, 'error': '请求体为空或过大'})
        try:
            payload = json.loads(self.rfile.read(length).decode('utf-8'))
        except Exception:
            return self._json(400, {'ok': False, 'error': 'JSON 解析失败'})
        if not isinstance(payload, dict):
            return self._json(400, {'ok': False, 'error': '请求体必须是 JSON 对象'})
        result, err = insert_score(self.db_path, payload, self._ip())
        if err:
            return self._json(400, {'ok': False, 'error': err})
        return self._json(200, {'ok': True, 'result': result})

    # ---------------- 静态资源 ----------------
    def _static(self, path):
        if path == '/favicon.ico':
            self.send_response(204)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if path in ('/', '/index.html', '/game'):
            rel = 'dist/index.html'
            if not os.path.isfile(os.path.join(ROOT, rel)):
                rel = 'index.html'
        elif path == '/dev':
            rel = 'index.html'
        elif any(path.startswith(p) for p in STATIC_PREFIXES):
            rel = path.lstrip('/')
        else:
            return self._json(404, {'ok': False, 'error': 'Not Found'})

        full = os.path.normpath(os.path.join(ROOT, rel))
        if os.path.commonpath([full, ROOT]) != ROOT or not os.path.isfile(full):
            return self._json(404, {'ok': False, 'error': 'Not Found'})
        ctype = mimetypes.guess_type(full)[0] or 'application/octet-stream'
        if ctype.startswith('text/') or ctype in ('application/javascript', 'application/json'):
            ctype += '; charset=utf-8'
        try:
            with open(full, 'rb') as f:
                data = f.read()
        except OSError:
            return self._json(500, {'ok': False, 'error': '读取文件失败'})
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-cache')
        self._cors()
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(data)

    def do_HEAD(self):
        self.do_GET()


def main():
    ap = argparse.ArgumentParser(description='肉鸽排行榜后端')
    ap.add_argument('--host', default='0.0.0.0', help='监听地址（默认 0.0.0.0，局域网可访问）')
    ap.add_argument('--port', type=int, default=8787, help='监听端口（默认 8787）')
    ap.add_argument('--db', default=DEFAULT_DB, help='SQLite 数据库路径')
    args = ap.parse_args()

    init_db(args.db)
    Handler.db_path = args.db
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print('肉鸽排行榜后端已启动')
    print('  游戏入口   http://127.0.0.1:%d/' % args.port)
    print('  开发入口   http://127.0.0.1:%d/dev' % args.port)
    print('  排行榜 API http://127.0.0.1:%d/api/leaderboard?mode=normal' % args.port)
    print('  数据库     %s' % args.db)
    print('  按 Ctrl+C 停止')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止')
        httpd.server_close()


if __name__ == '__main__':
    main()
