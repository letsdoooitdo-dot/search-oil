#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
주유소 좌표 수집 - 카카오 로컬 API (WGS84)
============================================
표준 라이브러리만 씁니다. pip install 필요 없음. Python 3.8+

사용법
------
  1) 이 파일과 stations.csv 를 같은 폴더에 둡니다.
  2) 카카오 REST API 키를 넣고 실행합니다.

     Windows (명령 프롬프트)
         set KAKAO_REST_KEY=여기에키붙여넣기
         python geocode_kakao.py

     Windows (PowerShell)
         $env:KAKAO_REST_KEY="여기에키붙여넣기"
         python geocode_kakao.py

     또는 그냥
         python geocode_kakao.py --key 여기에키붙여넣기

결과
----
  stations_geo.csv   - stations.csv + lat, lng, match(매칭방식), matched_addr
  geocode_fail.csv   - 끝내 못 찾은 주유소 (주소 직접 확인용)

특징
----
  * 이어하기: 중간에 끊겨도 다시 실행하면 이미 찾은 건 건너뜁니다.
  * 3단계 폴백: 도로명주소 → 괄호/상세 제거 주소 → 상호+지역 키워드 검색
  * 카카오 로컬 API 무료 한도는 일 100,000건. 1만 건은 여유롭습니다.
"""

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass


import argparse
import csv
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
IN_CSV = os.path.join(HERE, "stations.csv")
OUT_CSV = os.path.join(HERE, "stations_geo.csv")
FAIL_CSV = os.path.join(HERE, "geocode_fail.csv")

ADDR_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"

WORKERS = 6          # 동시 요청 수. 429가 뜨면 줄이세요.
TIMEOUT = 10
MAX_RETRY = 3

OUT_FIELDS = None    # 입력 헤더 + 아래 4개
EXTRA_FIELDS = ["lat", "lng", "match", "matched_addr"]

_lock = threading.Lock()
_done = 0
_total = 0
_errlog = []     # 실패 원인 수집 - 조용히 실패하지 않도록


# --------------------------------------------------------------------------
# 주소 정리
# --------------------------------------------------------------------------
# 오피넷 주소 예: "경기 광명시 오리로 608 (소하동)"  /  "서울 종로구 자하문로 303"
_PAREN = re.compile(r"\s*\([^)]*\)\s*")
_TRAIL_DETAIL = re.compile(r"\s+(\d+동|\d+층|[A-Za-z0-9-]+호)$")


def addr_variants(addr: str):
    """넓은 것부터 좁은 것 순으로 시도할 주소 후보들."""
    a = (addr or "").strip()
    if not a:
        return []
    out = [a]
    b = _PAREN.sub(" ", a).strip()
    b = re.sub(r"\s+", " ", b)
    if b and b not in out:
        out.append(b)
    c = _TRAIL_DETAIL.sub("", b).strip()
    if c and c not in out:
        out.append(c)
    # 건물번호에 붙은 부번(608-1) 제거한 형태도 하나 더
    d = re.sub(r"(\s\d+)-\d+$", r"\1", c).strip()
    if d and d not in out:
        out.append(d)
    return out


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------
def _get(url: str, params: dict, key: str):
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url + "?" + q,
        headers={"Authorization": "KakaoAK " + key,
                 "User-Agent": "oil-geocoder/1.0"},
    )
    last = None
    for attempt in range(MAX_RETRY):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode("utf-8", "replace")[:200]
            except Exception:
                pass
            if e.code == 401:
                raise SystemExit(
                    "\n[중단] 카카오가 키를 거부했습니다 (401).\n"
                    "  developers.kakao.com > 내 애플리케이션 > [앱] > [플랫폼 키] 에서\n"
                    "  'REST API 키'가 맞는지 확인해 주세요. (JavaScript 키 아님)\n"
                    f"  응답: {body}\n")
            if e.code == 403:
                raise SystemExit(
                    "\n[중단] 카카오가 권한을 거부했습니다 (403).\n"
                    "  새로 만든 앱은 카카오맵이 꺼져 있어 로컬 API가 막힙니다.\n\n"
                    "  해결: developers.kakao.com > 내 애플리케이션 > 해당 앱\n"
                    "        > 좌측 [카카오맵] > [사용 설정] 상태를 [ON]\n\n"
                    "  켠 뒤 이 명령을 다시 실행하세요.\n"
                    f"  응답: {body}\n")
            if e.code == 429:            # 쿼터/속도 초과 -> 물러섰다 재시도
                time.sleep(2 * (attempt + 1))
                last = e
                continue
            last = e
            time.sleep(0.5 * (attempt + 1))
        except Exception as e:           # 네트워크 일시 오류
            last = e
            time.sleep(0.5 * (attempt + 1))
    raise last


def _pick(doc):
    """카카오 응답 1건에서 (lat, lng, 표시주소) 추출."""
    lng = doc.get("x")
    lat = doc.get("y")
    if not lat or not lng:
        return None
    name = (doc.get("road_address_name") or doc.get("address_name")
            or doc.get("place_name") or "")
    return float(lat), float(lng), name


# --------------------------------------------------------------------------
# 한 건 처리
# --------------------------------------------------------------------------
def geocode_one(row: dict, key: str, errs: list):
    # 1단계 - 주소 검색 (정확도 최고)
    for i, a in enumerate(addr_variants(row.get("addr", ""))):
        try:
            js = _get(ADDR_URL, {"query": a, "size": 1}, key)
        except SystemExit:
            raise
        except Exception as e:
            errs.append(f"addr:{type(e).__name__}:{e}")
            continue
        docs = js.get("documents") or []
        if docs:
            got = _pick(docs[0])
            if got:
                return got[0], got[1], ("addr" if i == 0 else f"addr{i+1}"), got[2]

    # 2단계 - 상호 + 시군구 키워드 검색
    name = (row.get("name") or "").strip()
    sigungu = (row.get("sigungu") or "").strip()
    sido = (row.get("sido") or "").strip()
    for q in [f"{sido} {sigungu} {name}".strip(), f"{sigungu} {name}".strip(), name]:
        if not q:
            continue
        try:
            js = _get(KEYWORD_URL, {"query": q, "size": 5,
                                    "category_group_code": "OIL"}, key)
        except SystemExit:
            raise
        except Exception as e:
            errs.append(f"kw:{type(e).__name__}:{e}")
            continue
        for d in (js.get("documents") or []):
            # 엉뚱한 동네가 잡히는 걸 막는다
            disp = (d.get("road_address_name") or d.get("address_name") or "")
            if sigungu and sigungu not in disp:
                continue
            got = _pick(d)
            if got:
                return got[0], got[1], "keyword", got[2]

    return None, None, "fail", ""


def worker(args):
    row, key = args
    global _done
    errs = []
    try:
        lat, lng, how, disp = geocode_one(row, key, errs)
    except SystemExit:
        raise
    except Exception as e:
        lat, lng, how, disp = None, None, "error", ""
        errs.append(f"{type(e).__name__}:{e}")
    row["lat"], row["lng"], row["match"], row["matched_addr"] = lat, lng, how, disp
    if not lat and errs:
        with _lock:
            _errlog.append((row.get("station_id"), errs[0]))
    with _lock:
        _done += 1
        if _done % 100 == 0 or _done == _total:
            pct = _done / _total * 100
            sys.stdout.write(f"\r  진행 {_done:,}/{_total:,}  ({pct:5.1f}%)")
            sys.stdout.flush()
    return row


# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default=os.environ.get("KAKAO_REST_KEY", ""))
    ap.add_argument("--workers", type=int, default=WORKERS)
    ap.add_argument("--limit", type=int, default=0, help="앞에서 N건만 (시험용)")
    a = ap.parse_args()

    key = a.key.strip()
    if not key:
        raise SystemExit(
            "카카오 REST API 키가 없습니다.\n"
            "  python geocode_kakao.py --key <REST_API_키>\n"
            "  또는  set KAKAO_REST_KEY=<REST_API_키>  후 실행")

    if not os.path.exists(IN_CSV):
        raise SystemExit(f"stations.csv 를 찾을 수 없습니다: {IN_CSV}")

    with open(IN_CSV, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    in_fields = list(rows[0].keys())

    # --- 이어하기 ---
    done_map = {}
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV, encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                if r.get("lat"):                      # 좌표 있는 것만 확정으로 본다
                    done_map[r["station_id"]] = r
        print(f"  이어하기: 이미 좌표 있는 {len(done_map):,}건은 건너뜁니다.")

    todo = [r for r in rows if r["station_id"] not in done_map]
    if a.limit:
        todo = todo[:a.limit]

    global _total
    _total = len(todo)
    print(f"  대상 {_total:,}건 · 동시요청 {a.workers}")
    if _total == 0:
        print("  새로 찾을 게 없습니다.")
        return

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        results = list(ex.map(worker, [(r, key) for r in todo]))
    print()

    merged = dict(done_map)
    for r in results:
        merged[r["station_id"]] = r

    out_fields = in_fields + EXTRA_FIELDS
    with open(OUT_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=out_fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            m = merged.get(r["station_id"])
            if m:
                w.writerow(m)
            else:
                r2 = dict(r); r2.update(lat="", lng="", match="", matched_addr="")
                w.writerow(r2)

    fails = [r for r in merged.values() if not r.get("lat")]
    if fails:
        with open(FAIL_CSV, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=out_fields, extrasaction="ignore")
            w.writeheader()
            w.writerows(fails)

    if _errlog:
        from collections import Counter
        kinds = Counter(e.split(":")[0] + ":" + e.split(":")[1] for _, e in _errlog)
        print("\n  [!] 실패 원인 (상위 5)")
        for k, c in kinds.most_common(5):
            print(f"      {k:<32} {c:,}건")
        print(f"      예시: {_errlog[0][1][:160]}")

    ok = sum(1 for r in merged.values() if r.get("lat"))
    by = {}
    for r in merged.values():
        by[r.get("match") or "?"] = by.get(r.get("match") or "?", 0) + 1

    print(f"\n  완료 - {time.time()-t0:,.0f}초")
    print(f"  좌표 확보 {ok:,} / {len(rows):,}  ({ok/len(rows)*100:.1f}%)")
    print("  매칭 방식:", ", ".join(f"{k}={v:,}" for k, v in sorted(by.items())))
    print(f"  저장: {OUT_CSV}")
    if fails:
        print(f"  실패 {len(fails):,}건 → {FAIL_CSV}  (이 파일을 채팅에 올려주시면 처리하겠습니다)")

    # --- 간단 검증: 좌표가 한반도 범위 안인지 ---
    bad = [r for r in merged.values() if r.get("lat")
           and not (33.0 <= float(r["lat"]) <= 38.7 and 124.5 <= float(r["lng"]) <= 132.0)]
    if bad:
        print(f"  [!] 한반도 범위를 벗어난 좌표 {len(bad)}건 - 확인 필요")
        for r in bad[:5]:
            print(f"     {r['station_id']} {r['name']} ({r['lat']}, {r['lng']})")
    else:
        print("  좌표 범위 검사 통과 (위도 33~38.7, 경도 124.5~132)")


if __name__ == "__main__":
    main()
