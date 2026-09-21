#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
블로그가 불러갈 데이터 파일 만들기 (api/)
==========================================
정부지원금찾기와 같은 구조다. 파이썬은 데이터만 만들고, 화면은 블로그스팟 테마 안의
JS가 그린다. 이 파일들은 GitHub Pages 로 올라가 데이터 창고 역할만 한다.

  api/meta.json              기준일 + 전국 현황 + 국면
  api/regions.json           시군구 230곳 요약 (선택 화면·위치 찾기용)
  api/region/<슬러그>.json    동네별 주유소 목록

유종별로 따로 담는다. 휘발유가 싼 집이 경유도 싸다는 보장이 없어서,
유종을 바꾸면 순위와 통계가 전부 달라져야 한다.

동네마다 중심 좌표(la/ln)를 넣는다. 휴대폰이 알려준 좌표에서 가장 가까운 동네를
찾는 데 쓴다 - 외부 지도 서비스가 필요 없다.

해설 문장은 여기서 만들지 않는다. JS가 같은 규칙으로 만든다.
"""

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

import json
import os
import re
import shutil
import statistics as st
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import figures
from ui import display_name

OUT = os.path.join(ROOT, "api")

SPREAD_BIG = 250
SPREAD_SMALL = 60
FUELS = (("g", "gasoline"), ("d", "diesel"))


DONG_RE = re.compile(r"\(([^)]*?[동리가])\)")


def dong_of(addr):
    """주소에서 읍·면·동을 뽑는다.
    '서울 종로구 평창문화로 135 (평창동)' -> 평창동
    '경기 평택시 고덕면 서동대로 2796'    -> 고덕면
    못 뽑으면 None. 약 78%에서 나온다."""
    if not addr:
        return None
    m = DONG_RE.search(addr)
    if m:
        return m.group(1).split(",")[0].strip()
    for t in addr.split():
        if t.endswith(("읍", "면")) or (t.endswith("동") and len(t) >= 2 and not t[0].isdigit()):
            return t
    return None


def slug(region):
    return region.replace(" ", "-")


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(path)


def stats(prices):
    if not prices:
        return None
    s = sorted(prices)
    return {"n": len(s), "lo": s[0], "md": float(st.median(s)), "hi": s[-1],
            "sp": s[-1] - s[0]}


def main():
    con = figures.connect()
    try:
        snap = figures.snapshot(con)
        day = snap["date"]

        phase = con.execute(
            "SELECT phase, nat_median, trend FROM market_phase ORDER BY price_date DESC LIMIT 1"
        ).fetchone() or ("횡보", snap["gas"]["median"], 0.0)

        rows = con.execute("""
            SELECT s.region, s.name, s.brand, s.is_self, s.lat, s.lng, s.addr,
                   p.gasoline, p.diesel, c.character
            FROM stations s
            JOIN prices p ON p.station_id = s.station_id AND p.price_date = ?
            LEFT JOIN station_character c ON c.station_id = s.station_id
            WHERE p.gasoline IS NOT NULL OR p.diesel IS NOT NULL
        """, (day,))

        by_region = {}
        dongs = {}
        for region, name, brand, is_self, lat, lng, addr, gas, diesel, ch in rows:
            by_region.setdefault(region, []).append({
                "n": display_name(name), "b": brand, "s": 1 if is_self else 0,
                "g": gas, "d": diesel, "c": ch or "",
                "_lat": lat, "_lng": lng,
            })
            d = dong_of(addr)
            if d and lat and lng:
                dongs.setdefault((region, d), []).append((lat, lng))

        # 유종별 전국 순위 (동네 중앙값 싼 순)
        rank = {}
        for key, _col in FUELS:
            meds = []
            for region, items in by_region.items():
                v = [x[key] for x in items if x[key]]
                if v:
                    meds.append((region, st.median(v)))
            meds.sort(key=lambda x: x[1])
            rank[key] = {r: i + 1 for i, (r, _) in enumerate(meds)}

        if os.path.isdir(OUT):
            shutil.rmtree(OUT)

        summaries, total_bytes = [], 0
        for region, items in sorted(by_region.items()):
            summary = {
                "r": region, "sl": slug(region), "sd": region.split()[0],
                "sf": sum(x["s"] for x in items),
                "ac": sum(1 for x in items if x["c"] == "늘 최저권"),
                "ap": sum(1 for x in items if x["c"] == "늘 최고권"),
            }
            for key, _col in FUELS:
                s = stats([x[key] for x in items if x[key]])
                if s:
                    s["rk"] = rank[key].get(region, 0)
                summary[key] = s

            # 동네 중심 좌표 - 휴대폰 좌표에서 가장 가까운 동네를 찾는 데 쓴다
            pts = [(x["_lat"], x["_lng"]) for x in items if x["_lat"] and x["_lng"]]
            if pts:
                summary["la"] = round(sum(p[0] for p in pts) / len(pts), 4)
                summary["ln"] = round(sum(p[1] for p in pts) / len(pts), 4)

            summaries.append(summary)

            detail = dict(summary)
            detail["stations"] = [
                {k: v for k, v in x.items() if not k.startswith("_")}
                for x in sorted(items, key=lambda x: (x["g"] or 9e9, x["c"] != "늘 최저권"))[:40]
            ]
            total_bytes += write(os.path.join(OUT, "region", f"{slug(region)}.json"), detail)

        summaries.sort(key=lambda x: (x["g"] or {}).get("rk", 9999))
        total_bytes += write(os.path.join(OUT, "regions.json"), {
            "date": day, "total": len(summaries), "items": summaries,
        })

        meta = {
            "date": day,
            "phase": phase[0], "natMedian": phase[1], "trend": phase[2],
            "gas": snap["gas"], "diesel": snap["diesel"],
            "self": snap["self_full"]["self"]["median"],
            "full": snap["self_full"]["full"]["median"],
            "selfGap": snap["self_full"]["gap"],
            "regionCheap": {"r": snap["region_cheap"]["region"], "md": snap["region_cheap"]["median"]},
            "regionPricey": {"r": snap["region_pricey"]["region"], "md": snap["region_pricey"]["median"]},
            "topSpread": {"r": snap["regions"][0]["region"], "sp": snap["regions"][0]["spread"]},
            "spreadMedian": snap["region_spread_median"],
            "weekdayGap": snap["weekday_gap"],
            "brands": [{"b": b["brand"], "self": b["self_median"], "full": b["full_median"],
                        "gap": b["self_gap"], "nSelf": b["n_self"], "nFull": b["n_full"]}
                       for b in snap["brands"]],
            "spreadBig": SPREAD_BIG, "spreadSmall": SPREAD_SMALL,
        }
        total_bytes += write(os.path.join(OUT, "meta.json"), meta)

        # 읍·면·동 중심 좌표 - "천안시 신당동 부근"처럼 현재 위치를 자세히 보여주는 데 쓴다.
        # 주유소가 있는 동만 담기므로 근사치다. 화면에도 '부근'이라고 밝힌다.
        geo = [{"r": region, "d": d,
                "la": round(sum(p[0] for p in pts) / len(pts), 4),
                "ln": round(sum(p[1] for p in pts) / len(pts), 4)}
               for (region, d), pts in sorted(dongs.items())]
        total_bytes += write(os.path.join(OUT, "geo.json"), {"date": day, "items": geo})
    finally:
        con.close()

    withgeo = sum(1 for s in summaries if "la" in s)
    print(f"데이터 작성: 지역 {len(summaries)}곳 (좌표 {withgeo}곳) · "
          f"읍면동 {len(geo):,}곳 · 총 {total_bytes/1024:,.0f}KB · 기준일 {day}")
    print(f"경로: {OUT}")


if __name__ == "__main__":
    main()
