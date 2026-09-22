#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
좌표 없는 주유소에 좌표를 채운다
==================================
새로 문을 연 주유소는 오피넷 CSV에 주소만 있고 좌표가 없다. 좌표가 없으면
거리를 잴 수 없어 목록에서 통째로 빠진다 - 매일 조용히 누락되는 셈이다.

  python fill_coords.py            좌표 없는 곳을 카카오로 찾아 DB에 채운다
  python fill_coords.py --dry      찾아만 보고 저장은 하지 않는다
  python fill_coords.py --limit 50 한 번에 이만큼만

키는 scripts/local_keys.py 의 NAVI_KEY(카카오 REST 키)를 쓴다. 내 컴퓨터에서만
도는 작업이라 중계 서버가 필요 없다.

못 찾는 곳도 있다. 주소가 '00리 123-4' 처럼 옛 지번뿐이거나 폐업 직전이면
카카오에도 없다. 그런 곳은 다음 날 다시 시도한다 - 며칠 뒤 등록되기도 한다.
"""

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

import argparse
import json
import os
import re
import sqlite3
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "oil.db")
ADDR_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
PAUSE = 0.12          # 카카오에 너무 몰아치지 않는다

# 괄호 안 상세주소는 검색을 방해한다. '경기 평택시 경기대로 1078 (장당동)' -> 앞부분만
PAREN = re.compile(r"\s*\([^)]*\)\s*$")


def key():
    try:
        sys.path.insert(0, HERE)
        from local_keys import NAVI_KEY
        return NAVI_KEY
    except ImportError:
        return os.environ.get("KAKAO_REST_KEY", "")


def ask(url, params, k):
    q = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(q, headers={"Authorization": "KakaoAK " + k})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:
        return None


def first(doc):
    """카카오 응답에서 좌표를 꺼낸다. x=경도, y=위도 순서에 주의."""
    if not doc:
        return None
    docs = doc.get("documents") or []
    if not docs:
        return None
    d = docs[0]
    try:
        return float(d["y"]), float(d["x"])
    except (KeyError, TypeError, ValueError):
        return None


def find(name, addr, region, k):
    """3단계로 찾는다. 앞 단계가 더 정확하다."""
    if addr:
        hit = first(ask(ADDR_URL, {"query": addr, "size": 1}, k))
        if hit:
            return hit, "주소"
        short = PAREN.sub("", addr).strip()
        if short and short != addr:
            hit = first(ask(ADDR_URL, {"query": short, "size": 1}, k))
            if hit:
                return hit, "주소(괄호제거)"
    # 마지막 수단: 상호 + 지역으로 장소 검색
    q = (region or "") + " " + (name or "")
    hit = first(ask(KEYWORD_URL, {"query": q.strip(), "size": 1}, k))
    if hit:
        return hit, "상호검색"
    return None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="저장하지 않고 결과만 본다")
    ap.add_argument("--limit", type=int, default=200)
    a = ap.parse_args()

    k = key()
    if not k:
        print("카카오 REST 키가 없습니다 (scripts/local_keys.py 의 NAVI_KEY)")
        return 1

    con = sqlite3.connect(DB)
    rows = con.execute(
        "SELECT station_id, name, addr, region FROM stations "
        "WHERE lat IS NULL OR lng IS NULL LIMIT ?", (a.limit,)).fetchall()

    if not rows:
        print("좌표 없는 주유소가 없습니다")
        con.close()
        return 0

    print(f"좌표 없는 주유소 {len(rows)}곳을 찾습니다")
    got = fail = 0
    for sid, name, addr, region in rows:
        hit, how = find(name, addr, region, k)
        time.sleep(PAUSE)
        if not hit:
            fail += 1
            print(f"  못 찾음: {name} / {addr}")
            continue
        lat, lng = hit
        if not a.dry:
            con.execute("UPDATE stations SET lat=?, lng=? WHERE station_id=?",
                        (lat, lng, sid))
        got += 1
        print(f"  {name[:22]:<24} {lat:.5f}, {lng:.5f}  ({how})")

    if not a.dry:
        con.commit()
    con.close()

    print(f"\n채움 {got}곳 · 못 찾음 {fail}곳" + ("  (저장 안 함 - dry)" if a.dry else ""))
    if fail:
        print("  못 찾은 곳은 내일 다시 시도합니다. 며칠 뒤 카카오에 등록되기도 합니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
