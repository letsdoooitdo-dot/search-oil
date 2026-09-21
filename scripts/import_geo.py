#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
좌표 적재 + 품질 검증
=====================
geocode_kakao.py 가 만든 stations_geo.csv 를 oil.db 에 넣고,
잘못 매칭된 좌표를 걸러냅니다. 표준 라이브러리만 사용.

사용법
    python import_geo.py

검증 3단계
    1) 한반도 범위 밖 좌표 → 거부
    2) 같은 시군구 주유소들의 좌표 중앙점에서 지나치게 먼 것 → 의심 표시
       (키워드 검색으로 엉뚱한 동네가 잡힌 경우를 잡아냅니다)
    3) 완전 중복 좌표 → 표시 (같은 건물 여러 업체일 수도, 오매칭일 수도)

결과
    oil.db 의 stations.lat/lng/geocode_src 갱신
    geo_suspect.csv - 사람이 눈으로 확인할 의심 건
"""

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass


import csv
import math
import os
import sqlite3
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "oil.db")
GEO = os.path.join(HERE, "stations_geo.csv")
SUSPECT = os.path.join(HERE, "geo_suspect.csv")

# 한반도 대략 범위 (제주·울릉 포함)
LAT_MIN, LAT_MAX = 33.0, 38.7
LNG_MIN, LNG_MAX = 124.5, 132.0

# 시군구 중앙점에서 이 이상 떨어지면 의심. 넓은 군 단위를 고려해 넉넉히 잡는다.
FAR_KM = 40.0

_R = 6371.0088


def haversine_km(a, b):
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * _R * math.asin(math.sqrt(h))


def median(v):
    v = sorted(v)
    m = len(v)
    return v[m // 2] if m % 2 else (v[m // 2 - 1] + v[m // 2]) / 2


def main():
    if not os.path.exists(GEO):
        raise SystemExit(
            f"{GEO} 가 없습니다.\n"
            "  먼저 실행하세요:  python geocode_kakao.py --key <REST_API_키>")

    with open(GEO, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    ok, out_of_range, missing = [], [], 0
    for r in rows:
        if not r.get("lat") or not r.get("lng"):
            missing += 1
            continue
        try:
            la, ln = float(r["lat"]), float(r["lng"])
        except ValueError:
            missing += 1
            continue
        if not (LAT_MIN <= la <= LAT_MAX and LNG_MIN <= ln <= LNG_MAX):
            out_of_range.append((r, la, ln))
            continue
        ok.append((r, la, ln))

    print(f"  입력 {len(rows):,}행")
    print(f"  좌표 있음 {len(ok) + len(out_of_range):,} / 없음 {missing:,}")
    if out_of_range:
        print(f"  [!] 한반도 범위 밖 {len(out_of_range)}건 → 적재 제외")

    # ── 시군구 중앙점 대비 이상치 ─────────────────────────────────────────
    by_region = defaultdict(list)
    for r, la, ln in ok:
        by_region[r.get("region", "")].append((la, ln))

    centers = {}
    for reg, pts in by_region.items():
        if len(pts) >= 3:      # 표본이 너무 적으면 중앙점을 못 믿는다
            centers[reg] = (median([p[0] for p in pts]), median([p[1] for p in pts]))

    suspects = []
    for r, la, ln in ok:
        c = centers.get(r.get("region", ""))
        if not c:
            continue
        d = haversine_km((la, ln), c)
        if d > FAR_KM:
            suspects.append((r, la, ln, d))

    # 완전 중복 좌표
    seen = defaultdict(list)
    for r, la, ln in ok:
        seen[(round(la, 6), round(ln, 6))].append(r["station_id"])
    dups = {k: v for k, v in seen.items() if len(v) > 1}

    # ── 적재 ──────────────────────────────────────────────────────────────
    con = sqlite3.connect(DB)
    con.executemany(
        "UPDATE stations SET lat=?, lng=?, geocode_src=? WHERE station_id=?",
        [(la, ln, "kakao_" + (r.get("match") or "?"), r["station_id"]) for r, la, ln in ok])
    con.commit()

    n_geo = con.execute("SELECT COUNT(*) FROM stations WHERE lat IS NOT NULL").fetchone()[0]
    n_all = con.execute("SELECT COUNT(*) FROM stations WHERE region<>''").fetchone()[0]

    print(f"\n  적재 완료 - {n_geo:,} / {n_all:,}곳에 좌표가 들어갔습니다 "
          f"({n_geo / n_all * 100:.1f}%)")

    by_match = defaultdict(int)
    for r, _, _ in ok:
        by_match[r.get("match") or "?"] += 1
    print("  매칭 방식:", ", ".join(f"{k}={v:,}" for k, v in sorted(by_match.items())))

    print(f"\n  품질 검사")
    print(f"    시군구 중앙점에서 {FAR_KM:.0f}km 초과 : {len(suspects):,}건")
    print(f"    좌표 완전 중복                : {len(dups):,}쌍")

    if suspects or out_of_range:
        with open(SUSPECT, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f)
            w.writerow(["사유", "station_id", "name", "region", "addr",
                        "lat", "lng", "match", "matched_addr", "중앙점거리km"])
            for r, la, ln in out_of_range:
                w.writerow(["범위밖", r["station_id"], r["name"], r.get("region"),
                            r.get("addr"), la, ln, r.get("match"),
                            r.get("matched_addr"), ""])
            for r, la, ln, d in sorted(suspects, key=lambda x: -x[3]):
                w.writerow(["동네이탈", r["station_id"], r["name"], r.get("region"),
                            r.get("addr"), la, ln, r.get("match"),
                            r.get("matched_addr"), f"{d:.1f}"])
        print(f"    → {SUSPECT} 에 저장했습니다. 이 파일을 채팅에 올려주세요.")

    # ── 시군구별 커버리지 ────────────────────────────────────────────────
    holes = con.execute("""
        SELECT region, COUNT(*) AS n, SUM(lat IS NULL) AS miss
        FROM stations WHERE region<>'' GROUP BY region
        HAVING miss > 0 ORDER BY miss DESC LIMIT 10""").fetchall()
    if holes:
        print("\n  좌표 빠진 동네 (상위 10)")
        for reg, n, miss in holes:
            print(f"    {reg:<16} {miss:>4} / {n:>4}곳")
    else:
        print("\n  모든 시군구에 빠짐없이 좌표가 들어갔습니다.")

    print("\n  다음: oil.db 를 채팅에 올려주시면 경로 회랑 분석을 다시 돌리겠습니다.")
    con.close()


if __name__ == "__main__":
    main()
