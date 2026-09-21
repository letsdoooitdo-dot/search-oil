#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
블로그가 불러갈 데이터 파일 만들기 (api/)
==========================================
정부지원금찾기와 같은 구조다. 파이썬은 데이터만 만들고, 화면은 블로그스팟 테마 안의
JS가 그린다. 이 파일들은 GitHub Pages 로 올라가 데이터 창고 역할만 한다.

  api/meta.json              기준일 + 전국 현황 + 국면
  api/regions.json           시군구 230곳 요약 (선택 화면·검색용)
  api/region/<슬러그>.json    동네별 주유소 목록과 해설 수치

해설 문장은 여기서 만들지 않는다. JS가 같은 규칙으로 만든다 - 문구를 고칠 때
데이터를 다시 만들 필요가 없도록.
"""

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import figures
from ui import display_name

OUT = os.path.join(ROOT, "api")

# 동네 성격을 가르는 경계 (원). build_area_pages 와 같은 값.
SPREAD_BIG = 250
SPREAD_SMALL = 60


def slug(region):
    return region.replace(" ", "-")


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(path)


def main():
    con = figures.connect()
    try:
        s = figures.snapshot(con)
        day = s["date"]

        phase = con.execute(
            "SELECT phase, nat_median, trend FROM market_phase ORDER BY price_date DESC LIMIT 1"
        ).fetchone() or ("횡보", s["gas"]["median"], 0.0)

        # ── 지역별 주유소 ──────────────────────────────────────────────
        rows = con.execute("""
            SELECT s.region, s.station_id, s.name, s.brand, s.is_self, s.addr,
                   p.gasoline, p.diesel, c.character
            FROM stations s
            JOIN prices p ON p.station_id = s.station_id AND p.price_date = ?
            LEFT JOIN station_character c ON c.station_id = s.station_id
            WHERE p.gasoline IS NOT NULL
        """, (day,))

        by_region = {}
        for region, sid, name, brand, is_self, addr, gas, diesel, ch in rows:
            by_region.setdefault(region, []).append({
                "n": display_name(name), "b": brand, "s": 1 if is_self else 0,
                "g": gas, "d": diesel, "c": ch or "", "a": addr or "",
            })

        # 전국 순위 (중앙값 싼 순)
        meds = []
        for region, items in by_region.items():
            g = sorted(x["g"] for x in items)
            m = g[len(g) // 2] if len(g) % 2 else (g[len(g)//2 - 1] + g[len(g)//2]) / 2
            meds.append((region, m))
        meds.sort(key=lambda x: x[1])
        rank_of = {r: i + 1 for i, (r, _) in enumerate(meds)}
        total_regions = len(meds)

        # ── 파일 쓰기 ─────────────────────────────────────────────────
        if os.path.isdir(OUT):
            shutil.rmtree(OUT)

        summaries = []
        bytes_total = 0
        for region, items in sorted(by_region.items()):
            items.sort(key=lambda x: (x["g"], x["c"] != "늘 최저권"))
            g = [x["g"] for x in items]
            lo, hi = min(g), max(g)
            sg = sorted(g)
            med = sg[len(sg) // 2] if len(sg) % 2 else (sg[len(sg)//2 - 1] + sg[len(sg)//2]) / 2
            always_cheap = sum(1 for x in items if x["c"] == "늘 최저권")
            always_pricey = sum(1 for x in items if x["c"] == "늘 최고권")

            summary = {
                "r": region, "sl": slug(region), "n": len(items),
                "lo": lo, "md": med, "hi": hi, "sp": hi - lo,
                "rk": rank_of[region], "sf": sum(x["s"] for x in items),
                "ac": always_cheap, "ap": always_pricey,
                "sd": region.split()[0],
            }
            summaries.append(summary)

            detail = dict(summary)
            detail["stations"] = items[:40]      # 화면에 쓰는 만큼만
            bytes_total += write(os.path.join(OUT, "region", f"{slug(region)}.json"), detail)

        summaries.sort(key=lambda x: x["rk"])
        bytes_total += write(os.path.join(OUT, "regions.json"), {
            "date": day, "total": total_regions, "items": summaries,
        })

        meta = {
            "date": day,
            "phase": phase[0], "natMedian": phase[1], "trend": phase[2],
            "gas": s["gas"], "diesel": s["diesel"],
            "self": s["self_full"]["self"]["median"],
            "full": s["self_full"]["full"]["median"],
            "selfGap": s["self_full"]["gap"],
            "regionCheap": {"r": s["region_cheap"]["region"], "md": s["region_cheap"]["median"]},
            "regionPricey": {"r": s["region_pricey"]["region"], "md": s["region_pricey"]["median"]},
            "topSpread": {"r": s["regions"][0]["region"], "sp": s["regions"][0]["spread"]},
            "spreadMedian": s["region_spread_median"],
            "weekdayGap": s["weekday_gap"],
            "brands": [{"b": b["brand"], "self": b["self_median"], "full": b["full_median"],
                        "gap": b["self_gap"], "nSelf": b["n_self"], "nFull": b["n_full"]}
                       for b in s["brands"]],
            "spreadBig": SPREAD_BIG, "spreadSmall": SPREAD_SMALL,
        }
        bytes_total += write(os.path.join(OUT, "meta.json"), meta)
    finally:
        con.close()

    print(f"데이터 작성: 지역 {len(summaries)}곳 · 총 {bytes_total/1024:,.0f}KB · 기준일 {day}")
    print(f"경로: {OUT}")


if __name__ == "__main__":
    main()
