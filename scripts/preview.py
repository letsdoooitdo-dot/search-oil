#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
내 컴퓨터에서 화면 확인하기
============================
실행:  python preview.py
멈춤:  Ctrl + C

  http://localhost:8080/            홈 (장소 검색 / 내 주변 찾기)
  http://localhost:8080/area.html   동네 상세
  http://localhost:8080/calc.html   계산기
  http://localhost:8080/post.html   블로그 글

왜 파일을 더블클릭하지 않고 서버를 띄우나
  1) 브라우저는 file:// 에서 위치(GPS)를 알려주지 않는다. localhost 는 허용한다.
  2) 카카오맵 장소검색은 '등록된 주소'에서만 동작한다. 그래서 포트를 8080 으로 고정하고
     카카오 개발자 사이트 플랫폼 > Web 에 http://localhost:8080 을 등록해 둔다.
     포트를 바꾸면 카카오가 막으니 8080 을 그대로 쓴다.
"""

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

import http.server
import os
import socketserver
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(os.path.dirname(HERE), ".theme-preview")
PORT = 8080


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *a):
        pass    # 조용히

    def guess_type(self, path):
        # charset 을 안 주면 브라우저가 한글을 깨뜨린다.
        # end_headers 에서 덧붙이면 Content-Type 이 두 번 나가므로 여기서 바꾼다.
        t = super().guess_type(path)
        if t.startswith("text/html"):
            return "text/html; charset=utf-8"
        return t


def main():
    if not os.path.isdir(ROOT):
        raise SystemExit("먼저 python build_theme.py 를 실행하세요 (.theme-preview 가 없습니다)")

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as srv:
        url = f"http://localhost:{PORT}/"
        print(f"미리보기 서버 시작 - {url}")
        print("  홈        " + url)
        print("  동네 상세 " + url + "area.html")
        print("  계산기    " + url + "calc.html")
        print("  블로그 글 " + url + "post.html")
        print("\n멈추려면 Ctrl + C")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print("\n서버를 멈췄습니다")


if __name__ == "__main__":
    main()
