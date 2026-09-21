#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
경로 회랑 실측 분석 - 좌표가 들어온 뒤 처음 돌리는 진짜 분석
================================================================
지금까지 '가정'이었던 두 가지를 실측으로 바꾼다.
  1) 기준가  - 경로에서 그냥 지나치는 주유소들의 최저가
  2) 우회거리 - 실제 좌표로 계산

가상 주행 N건을 만들어 전국 단위로 통계를 낸다.
출발·목적지는 실제 주유소 좌표를 쓴다(주유소가 있는 곳 = 도로·생활권).
"""

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

import math
import os
import random
import sqlite3
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from route_gain import net_gain, km_to_minutes

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "oil.db")
DATE = "2026-09-20"

TRIPS = 3000
TRIP_MIN_KM, TRIP_MAX_KM = 5.0, 25.0   # 한국 통근 거리대
PASS_KM = 0.3        # 이 안쪽이면 '그냥 지나친다' -> 기준가 후보
CORRIDOR_KM = 3.0    # 후보 회랑
TOP_N = 5            # 경로 API를 부를 상위 후보 수
ROAD_F = 1.3         # 직선 -> 실도로 보정
LITERS, KMPL = 30.0, 12.0
MIN_WORTH = 500.0

R = 6371.0088
random.seed(20260921)


def main():
    con = sqlite3.connect(DB)
    rows = con.execute(f"""
        SELECT s.station_id, s.name, s.region, p.gasoline, s.lat, s.lng
        FROM stations s JOIN prices p
          ON p.station_id = s.station_id AND p.price_date = ?
        WHERE s.lat IS NOT NULL AND p.gasoline IS NOT NULL
    """, (DATE,)).fetchall()
    n = len(rows)
    name = [r[1] for r in rows]
    region = [r[2] for r in rows]
    price = np.array([r[3] for r in rows], dtype=float)
    lat = np.array([r[4] for r in rows], dtype=float)
    lng = np.array([r[5] for r in rows], dtype=float)

    lat0 = float(lat.mean())
    k = math.cos(math.radians(lat0))
    X = np.radians(lng) * R * k
    Y = np.radians(lat) * R

    nat_med = con.execute(
        "SELECT nat_median FROM market_phase ORDER BY price_date DESC LIMIT 1").fetchone()[0]

    print("=" * 78)
    print(f"  경로 회랑 실측 분석 - 주유소 {n:,}곳 (좌표+휘발유가 모두 있는 곳)")
    print(f"  주행 {TRIPS:,}건 · 통행거리 {TRIP_MIN_KM:.0f}~{TRIP_MAX_KM:.0f}km "
          f"· 승용차 {LITERS:.0f}L·{KMPL:.0f}km/L")
    print("=" * 78)

    def perp(px, py, ax, ay, bx, by):
        vx, vy = bx - ax, by - ay
        L2 = vx * vx + vy * vy
        if L2 == 0:
            return np.hypot(px - ax, py - ay)
        t = ((px - ax) * vx + (py - ay) * vy) / L2
        t = np.clip(t, 0.0, 1.0)
        return np.hypot(px - (ax + t * vx), py - (ay + t * vy))

    stat = dict(cand=[], pass_n=[], detour=[], gain=[], base=[], best_price=[],
                verdict=Counter(), no_base=0, base_pctile=[], saved_vs_cheapest=[])
    samples = []

    tries = 0
    made = 0
    while made < TRIPS and tries < TRIPS * 20:
        tries += 1
        i = random.randrange(n)
        d = np.hypot(X - X[i], Y - Y[i])
        pool = np.where((d >= TRIP_MIN_KM) & (d <= TRIP_MAX_KM))[0]
        if len(pool) == 0:
            continue
        j = int(random.choice(pool))
        ax, ay, bx, by = X[i], Y[i], X[j], Y[j]
        pd = perp(X, Y, ax, ay, bx, by)

        passing = np.where(pd <= PASS_KM)[0]
        if len(passing) == 0:
            stat["no_base"] += 1
            continue
        base = float(price[passing].min())

        cand = np.where(pd <= CORRIDOR_KM)[0]
        if len(cand) == 0:
            continue
        made += 1
        stat["cand"].append(len(cand))
        stat["pass_n"].append(len(passing))
        stat["base"].append(base)

        # 이 동네 가격 분포에서 기준가가 어디쯤인지
        loc = price[cand]
        stat["base_pctile"].append(float((loc < base).mean() * 100))

        order = cand[np.argsort(price[cand])][:TOP_N]
        best = None
        for c in order:
            via = (math.hypot(X[c] - ax, Y[c] - ay) + math.hypot(bx - X[c], by - Y[c]))
            direct = math.hypot(bx - ax, by - ay)
            det = max(0.0, via - direct) * ROAD_F
            g = net_gain(float(price[c]), base, det, LITERS, KMPL, nat_med)
            if best is None or g > best[1]:
                best = (int(c), g, det)
        c, g, det = best

        if g >= MIN_WORTH:
            stat["verdict"]["detour"] += 1
            stat["detour"].append(det)
            stat["gain"].append(g)
            stat["best_price"].append(float(price[c]))
            cheapest = int(cand[np.argmin(price[cand])])
            if cheapest != c:
                stat["saved_vs_cheapest"].append(1)
            else:
                stat["saved_vs_cheapest"].append(0)
            if len(samples) < 6:
                samples.append((name[c], region[c], float(price[c]), base, det, g,
                                len(cand), len(passing)))
        else:
            stat["verdict"]["stay"] += 1

    import statistics as st
    def p(v, q):
        v = sorted(v); return v[min(len(v)-1, int(len(v)*q))]

    print(f"\n[1] 회랑 안에 후보가 몇 곳이나 있나  (API 비용을 결정한다)")
    c = stat["cand"]
    print(f"    3km 회랑 후보     중앙 {st.median(c):>5.0f}곳  "
          f"(하위25% {p(c,.25):.0f} / 상위25% {p(c,.75):.0f} / 최대 {max(c)})")
    pn = stat["pass_n"]
    print(f"    그냥 지나치는 곳  중앙 {st.median(pn):>5.0f}곳  "
          f"(경로에서 {PASS_KM*1000:.0f}m 이내)")
    print(f"    -> 2단계 선별로 경로 API 호출은 주행 1건당 최대 {TOP_N}회 + 직행 1회")
    print(f"    기준가를 세울 주유소가 아예 없던 경로: {stat['no_base']:,}건 "
          f"({stat['no_base']/tries*100:.1f}%)")

    print(f"\n[2] ★ 실측 기준가 - 그동안 '가정'이었던 값")
    bp = stat["base_pctile"]
    print(f"    경로에서 지나치는 주유소들의 최저가는")
    print(f"    회랑 안 가격 분포의 하위 {st.median(bp):.0f}% 지점이었습니다.")
    print(f"      (하위25% 경로 {p(bp,.25):.0f}% / 상위25% 경로 {p(bp,.75):.0f}%)")
    print(f"    * 9/21 가정치는 '하위 40%'였습니다. 실측값과 비교하세요.")

    print(f"\n[3] ★★ 말리는 비율 - 제품의 성격을 정하는 숫자")
    v = stat["verdict"]; tot = sum(v.values())
    print(f"    '돌아가세요'  {v['detour']:>5,}건 ({v['detour']/tot*100:5.1f}%)")
    print(f"    '그냥 넣으세요' {v['stay']:>5,}건 ({v['stay']/tot*100:5.1f}%)")

    print(f"\n[4] 돌아가라고 할 때, 실제로 얼마나 돌아가고 얼마를 아끼나")
    dt, gn = stat["detour"], stat["gain"]
    print(f"    우회거리  중앙 {st.median(dt):.1f}km ({km_to_minutes(st.median(dt)):.0f}분)  "
          f"· 상위25% {p(dt,.75):.1f}km")
    print(f"    순이득    중앙 {st.median(gn):,.0f}원  "
          f"· 하위25% {p(gn,.25):,.0f}원 · 상위25% {p(gn,.75):,.0f}원")
    sv = stat["saved_vs_cheapest"]
    print(f"\n    ★ 추천한 곳이 '회랑 내 최저가'가 아니었던 비율: "
          f"{sum(sv)/len(sv)*100:.1f}%")
    print(f"      -> 최저가를 그대로 띄웠으면 그만큼 틀린 답을 준 것입니다.")

    print(f"\n[5] 실제 출력 문장 예시")
    for nm, rg, pr, base, det, g, nc, npass in samples:
        print(f"\n    ── {rg}")
        print(f"    {nm} · {pr:,.0f}원")
        print(f"    {km_to_minutes(det):.0f}분 돌아서 {g:,.0f}원 아낍니다")
        print(f"    가는 길에서 {det:.1f}km 벗어남 · {LITERS:.0f}L 기준")
        print(f"      (후보 {nc}곳 중 · 안 돌아갔으면 {base:,.0f}원)")
    con.close()


if __name__ == "__main__":
    main()
