#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
수집한 CSV를 oil.db 에 적재한다
================================
collect_prices.py 가 받아온 "사업자별 현재 판매가격" CSV를 읽어
prices / stations / market_phase 를 갱신한다.

CSV 구조 (오피넷, CP949, 헤더 1행)
  고유번호,지역,상호,주소,상표,셀프여부,고급휘발유,휘발유,경유,실내등유

데이터 함정 (인수인계서 2-4장)
  * 0 은 가격이 아니라 '미취급' 표시 -> NULL
  * 지역명은 공백 split 금지. '세종시'(토큰 1개), '전남광주 동구'(시도 통합) 분기
  * 인코딩 CP949

market_phase 규칙 (기존 1년 데이터에서 역산)
  trend = (오늘 전국중앙가 - 7일 전 전국중앙가) / 7      # 하루 평균 변화량
  |trend| <= 2.0 -> 횡보, 그 위는 상승, 아래는 하락

사용법
  python load_prices.py                     오늘 파일 적재
  python load_prices.py --date 2026-09-22   특정 날짜 파일 적재
"""

import argparse
import csv
import io
import os
import sqlite3
import statistics as st
import sys
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DB = os.path.join(HERE, "oil.db")
CSV_DIR = os.path.join(ROOT, "current_data")

FLAT_TREND = 2.0            # 이 이하면 횡보
WEEKDAY_KO = ["월", "화", "수", "목", "금", "토", "일"]

COLS = {"고급휘발유": "premium_gasoline", "휘발유": "gasoline",
        "경유": "diesel", "실내등유": "kerosene"}


def z(v):
    """0은 가격이 아니라 '미취급' 표시 -> NULL"""
    try:
        f = float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return None if f <= 0 else f


def split_region(region: str):
    """'서울 종로구'->('서울','종로구') / '세종시'->('세종시','세종시') / '전남광주 동구'->('전남광주','동구')"""
    parts = (region or "").strip().split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], parts[0]
    return parts[0], " ".join(parts[1:])


def read_csv(path):
    raw = open(path, "rb").read()
    for enc in ("cp949", "utf-8-sig", "utf-8"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise RuntimeError(f"인코딩을 알 수 없습니다: {path}")
    return list(csv.DictReader(io.StringIO(text)))


def load(con, rows, price_date: str):
    stats = {"prices": 0, "new_stations": 0, "updated_stations": 0}

    known = {r[0] for r in con.execute("SELECT station_id FROM stations")}

    for r in rows:
        sid = (r.get("고유번호") or "").strip()
        if not sid:
            continue
        region = (r.get("지역") or "").strip()
        sido, sigungu = split_region(region)
        is_self = 1 if (r.get("셀프여부") or "").strip() == "셀프" else 0

        if sid in known:
            # 상호·상표·셀프여부는 바뀔 수 있다. 좌표는 건드리지 않는다.
            con.execute("""UPDATE stations SET name=?, brand=?, addr=?, is_self=?,
                           region=?, sido=?, sigungu=? WHERE station_id=?""",
                        ((r.get("상호") or "").strip(), (r.get("상표") or "").strip(),
                         (r.get("주소") or "").strip(), is_self, region, sido, sigungu, sid))
            stats["updated_stations"] += 1
        else:
            con.execute("""INSERT INTO stations
                           (station_id,name,brand,addr,tel,is_self,region,sido,sigungu,
                            lat,lng,geocode_src,quality_cert,reports_price)
                           VALUES (?,?,?,?,NULL,?,?,?,?,NULL,NULL,NULL,0,0)""",
                        (sid, (r.get("상호") or "").strip(), (r.get("상표") or "").strip(),
                         (r.get("주소") or "").strip(), is_self, region, sido, sigungu))
            known.add(sid)
            stats["new_stations"] += 1

        con.execute("""INSERT INTO prices
                       (station_id,price_date,premium_gasoline,gasoline,diesel,kerosene)
                       VALUES (?,?,?,?,?,?)
                       ON CONFLICT(station_id,price_date) DO UPDATE SET
                         premium_gasoline=excluded.premium_gasoline,
                         gasoline=excluded.gasoline,
                         diesel=excluded.diesel,
                         kerosene=excluded.kerosene""",
                    (sid, price_date, z(r.get("고급휘발유")), z(r.get("휘발유")),
                     z(r.get("경유")), z(r.get("실내등유"))))
        stats["prices"] += 1

    return stats


def update_phase(con, price_date: str):
    """전국 중앙가와 국면을 갱신한다."""
    vals = [v[0] for v in con.execute(
        "SELECT gasoline FROM prices WHERE price_date=? AND gasoline IS NOT NULL", (price_date,))]
    if not vals:
        return None
    nat_median = float(st.median(vals))

    d = date.fromisoformat(price_date)
    prev = con.execute("SELECT nat_median FROM market_phase WHERE price_date=?",
                       ((d - timedelta(days=7)).isoformat(),)).fetchone()
    if prev:
        trend = round((nat_median - prev[0]) / 7.0, 2)
        phase = "횡보" if abs(trend) <= FLAT_TREND else ("상승" if trend > 0 else "하락")
    else:
        trend, phase = 0.0, "횡보"   # 7일 전 자료가 없으면 판단 보류

    con.execute("""INSERT INTO market_phase (price_date,nat_median,trend,phase,weekday)
                   VALUES (?,?,?,?,?)
                   ON CONFLICT(price_date) DO UPDATE SET
                     nat_median=excluded.nat_median, trend=excluded.trend,
                     phase=excluded.phase, weekday=excluded.weekday""",
                (price_date, nat_median, trend, phase, WEEKDAY_KO[d.weekday()]))
    return nat_median, trend, phase


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="적재할 날짜 YYYY-MM-DD (기본: 오늘)")
    ap.add_argument("--file", help="CSV 경로 직접 지정")
    args = ap.parse_args()

    day = date.fromisoformat(args.date) if args.date else date.today()
    path = args.file or os.path.join(CSV_DIR, f"현재판매가격_{day:%Y%m%d}.csv")
    if not os.path.exists(path):
        print(f"파일이 없습니다: {path}\n먼저 collect_prices.py 를 실행하세요.", file=sys.stderr)
        return 1

    rows = read_csv(path)
    if len(rows) < 5000:
        print(f"행이 너무 적습니다 ({len(rows):,}행). 파일을 확인하세요.", file=sys.stderr)
        return 1

    con = sqlite3.connect(DB)
    try:
        with con:
            s = load(con, rows, day.isoformat())
            ph = update_phase(con, day.isoformat())
    finally:
        con.close()

    print(f"적재 완료 {day:%Y-%m-%d}: 가격 {s['prices']:,}건 "
          f"(기존 주유소 {s['updated_stations']:,} / 신규 {s['new_stations']:,})")
    if ph:
        print(f"전국 중앙가 {ph[0]:,.0f}원 · 추세 {ph[1]:+.2f} · 국면 {ph[2]}")
    if s["new_stations"]:
        print(f"※ 신규 주유소 {s['new_stations']}곳은 좌표가 없습니다. "
              f"geocode_kakao.py 로 좌표를 채워야 경로 판정에 포함됩니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
