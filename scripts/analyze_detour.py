#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
1순위 기능이 실제로 의미가 있는가 - 실데이터 검증
좌표 없이, 오늘 가격 분포만으로 "얼마나 돌아갈 가치가 있는지"를 전수 계산한다.
"""

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

import sqlite3, sys, statistics as st
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from route_gain import breakeven_detour_km, km_to_minutes, net_gain

DB = __import__("os").path.join(__import__("os").path.dirname(__import__("os").path.abspath(__file__)), "oil.db")
DATE = "2026-09-20"
con = sqlite3.connect(DB)

NAT_MEDIAN = con.execute(
    "SELECT nat_median FROM market_phase ORDER BY price_date DESC LIMIT 1").fetchone()[0]

# 시군구별 휘발유 가격 벡터
regions = {}
for region, in con.execute("SELECT DISTINCT region FROM stations WHERE region<>''"):
    vals = [r[0] for r in con.execute("""
        SELECT p.gasoline FROM stations s JOIN prices p
          ON p.station_id=s.station_id AND p.price_date=?
        WHERE s.region=? AND p.gasoline IS NOT NULL ORDER BY p.gasoline""",
        (DATE, region))]
    if len(vals) >= 10:
        regions[region] = vals

def med(v):
    m = len(v)
    return v[m//2] if m % 2 else (v[m//2-1]+v[m//2])/2

print("=" * 78)
print(f"  1순위 기능 검증 - 전국 {len(regions)}개 시군구 (주유소 10곳 이상), 휘발유")
print(f"  기준: 주유량 30L · 연비 12km/L · 기름값 {NAT_MEDIAN:,.0f}원")
print("=" * 78)

# ── 1. 동네별 손익분기 우회거리 ────────────────────────────────────────────
rows = []
for region, v in regions.items():
    m = med(v)
    gap_best = m - v[0]                     # 중앙값 → 최저가
    gap_p10 = m - v[max(0, int(len(v)*0.10))]   # 중앙값 → 하위 10% 지점
    rows.append((region, len(v), m, v[0], gap_best, gap_p10,
                 breakeven_detour_km(gap_best, 30, 12, NAT_MEDIAN),
                 breakeven_detour_km(gap_p10, 30, 12, NAT_MEDIAN)))

be = sorted(r[6] for r in rows)
print("\n[1] 동네 최저가까지 '몇 km 우회해도 본전인가' - 전국 분포")
for q, lab in [(0.10,"하위10%"),(0.25,"하위25%"),(0.50,"중앙값"),(0.75,"상위25%"),(0.90,"상위10%")]:
    print(f"    {lab:>8} {be[int(len(be)*q)]:6.1f} km   "
          f"({km_to_minutes(be[int(len(be)*q)]):4.0f}분)")
print(f"    {'최대':>8} {be[-1]:6.1f} km")

buckets = [(0,1,"1km 미만 - 사실상 무의미"), (1,3,"1~3km - 바로 옆이면"),
           (3,6,"3~6km - 충분히 이득"), (6,99,"6km 이상 - 확실히 이득")]
print("\n    구간별 동네 수")
for lo, hi, lab in buckets:
    n = sum(1 for x in be if lo <= x < hi)
    print(f"      {lab:<26} {n:>4}곳  ({n/len(be)*100:5.1f}%)")

# ── 2. 주유량 민감도 ───────────────────────────────────────────────────────
print("\n[2] 주유량이 손익분기를 얼마나 바꾸나 (전국 중앙 동네 기준, 가격차 %d원)"
      % round(med(sorted(r[4] for r in rows))))
gap_typ = med(sorted(r[4] for r in rows))
print(f"    {'주유량':>10} {'손익분기':>10} {'체감':>10}   비고")
for L, note in [(20,"소형차 반탱크"),(30,"승용차 1회"),(50,"SUV 가득"),
                (100,"승합/소형화물"),(200,"중형화물"),(400,"대형화물")]:
    k = breakeven_detour_km(gap_typ, L, 12, NAT_MEDIAN)
    print(f"    {L:>7}L   {k:>7.1f} km  {km_to_minutes(k):>7.0f}분   {note}")

# ── 3. 연비 민감도 ─────────────────────────────────────────────────────────
print(f"\n[3] 연비가 손익분기를 얼마나 바꾸나 (30L, 가격차 {gap_typ:.0f}원)")
print(f"    {'연비':>10} {'손익분기':>10}   비고")
for e, note in [(6,"대형화물/노후"),(8,"대형 SUV"),(12,"일반 승용차"),
                (16,"소형/디젤"),(20,"하이브리드"),(0,"")]:
    if not e: continue
    k = breakeven_detour_km(gap_typ, 30, e, NAT_MEDIAN)
    print(f"    {e:>6} km/L  {k:>7.1f} km   {note}")

# ── 4. 우회 vs 왕복 ────────────────────────────────────────────────────────
print(f"\n[4] 우회 모델 vs 왕복 모델 (30L, 가격차 {gap_typ:.0f}원)")
k_det = breakeven_detour_km(gap_typ, 30, 12, NAT_MEDIAN)
print(f"    왕복으로 계산하면  {k_det/2:5.1f} km 까지만 이득")
print(f"    우회로 계산하면    {k_det:5.1f} km 까지 이득   → {2.0:.0f}배")
print(f"    경로 위에 있으면   우회 0km → 가격차 전부가 이득 "
      f"({gap_typ*30:,.0f}원)")

# ── 5. 가격 순위별 곡선 (평택시) ───────────────────────────────────────────
demo = "경기 평택시"
v = regions[demo]; m = med(v)
print(f"\n[5] {demo} - 싼 순으로 몇 등까지 갈 가치가 있나 (30L)")
print(f"    동네 중앙값 {m:,.0f}원 · {len(v)}곳")
print(f"    {'순위':>4} {'가격':>8} {'중앙대비':>8} {'손익분기':>9}")
for i in [0,1,2,4,9,19,int(len(v)*0.25)]:
    if i >= len(v): continue
    gap = m - v[i]
    print(f"    {i+1:>3}위 {v[i]:>8,.0f} {gap:>7.0f}원 "
          f"{breakeven_detour_km(gap,30,12,NAT_MEDIAN):>7.1f} km")

# ── 6. '말려야 하는' 비율 ──────────────────────────────────────────────────
print("\n[6] 실제 상황 시뮬레이션 - 최저가가 Xkm 떨어져 있다면?")
print("    (동네 중앙 수준 가격차, 30L 기준. 남는 돈이 500원 미만이면 말린다)")
print(f"    {'우회거리':>8} {'순이득':>10}   판단")
for d in [0,0.5,1,2,3,5,7,10]:
    g = net_gain(m - gap_typ, m, d, 30, 12, NAT_MEDIAN)
    verdict = "돌아갈 가치 있음" if g >= 500 else ("본전" if g > 0 else "손해")
    print(f"    {d:>6.1f}km {g:>9,.0f}원   {verdict}")

# ── 7. 전국에서 이 기능이 의미 있는 비율 ───────────────────────────────────
print("\n[7] 결론 - 전국 주유소 기준")
tot_st = con.execute("SELECT COUNT(*) FROM stations WHERE region<>''").fetchone()[0]
worth3 = sum(r[1] for r in rows if r[6] >= 3)
worth1 = sum(r[1] for r in rows if r[6] < 1)
print(f"    3km 이상 우회할 가치가 있는 동네의 주유소 : {worth3:>6,}곳")
print(f"    1km도 갈 가치가 없는 동네의 주유소        : {worth1:>6,}곳")
print(f"    판정 제외(10곳 미만 동네 등)              : "
      f"{tot_st - worth3 - worth1 - sum(r[1] for r in rows if 1 <= r[6] < 3):>6,}곳")

print("\n[8] 갈 가치가 가장 큰 동네 / 가장 없는 동네")
rows.sort(key=lambda r: -r[6])
print("    ── 멀리 가도 이득 ──")
for r in rows[:6]:
    print(f"      {r[0]:<14} {r[1]:>4}곳  중앙 {r[2]:>6,.0f} 최저 {r[3]:>6,.0f} "
          f"차 {r[4]:>4.0f}원 → {r[6]:>5.1f}km")
print("    ── 움직일 필요 없음 ──")
for r in rows[-6:]:
    print(f"      {r[0]:<14} {r[1]:>4}곳  중앙 {r[2]:>6,.0f} 최저 {r[3]:>6,.0f} "
          f"차 {r[4]:>4.0f}원 → {r[6]:>5.1f}km")
con.close()
