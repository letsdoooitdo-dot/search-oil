#!/usr/bin/env python3
"""
주유소 찾기 - 기초 DB 구축
입력: 사업자 기본정보 CSV, 현재 판매가격 CSV, 분석 산출물 3종
출력: oil.db (SQLite)
"""

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

import sqlite3, sys, os, re
import pandas as pd

SCRATCH = "/tmp/claude-0/-home-claude/505ad926-1c8d-5c9a-bc62-8f5f6ef2763e/scratchpad"
UP = "/root/.claude/uploads/505ad926-1c8d-5c9a-bc62-8f5f6ef2763e"
DB = os.path.join(SCRATCH, "oil.db")

FUELS = ["premium_gasoline", "gasoline", "diesel", "kerosene"]


def z(v):
    """0은 가격이 아니라 '미취급' 표시 → NULL"""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f <= 0 else f


def split_region(region: str):
    """
    '서울 종로구' -> ('서울','종로구')
    '세종시'      -> ('세종시', '세종시')   # 시군구 없음
    '전남광주 동구' -> ('전남광주','동구')  # 시도 통합 표기
    공백 split을 쓰되, 토큰이 1개인 경우(세종시)를 반드시 분기.
    """
    r = (region or "").strip()
    parts = r.split()
    if len(parts) == 1:
        return parts[0], parts[0]
    return parts[0], " ".join(parts[1:])


def main():
    base = pd.read_csv(os.path.join(SCRATCH, "base.csv"), header=3, dtype=str)
    cur = pd.read_csv(os.path.join(SCRATCH, "cur.csv"), header=3, dtype=str)
    char = pd.read_csv(os.path.join(UP, "23ccc9b6-_____1______.csv"), dtype=str)
    phase = pd.read_csv(os.path.join(UP, "10937e33-___________.csv"), dtype=str)

    price_date = "2026-09-20"

    con = sqlite3.connect(DB)
    con.executescript("""
    DROP TABLE IF EXISTS stations;
    DROP TABLE IF EXISTS prices;
    DROP TABLE IF EXISTS station_character;
    DROP TABLE IF EXISTS market_phase;

    CREATE TABLE stations (
      station_id    TEXT PRIMARY KEY,
      name          TEXT,
      brand         TEXT,
      addr          TEXT,
      tel           TEXT,
      is_self       INTEGER,
      region        TEXT,
      sido          TEXT,
      sigungu       TEXT,
      lat           REAL,
      lng           REAL,
      geocode_src   TEXT,
      quality_cert  INTEGER,
      reports_price INTEGER
    );
    CREATE INDEX ix_st_region ON stations(region);

    CREATE TABLE prices (
      station_id       TEXT,
      price_date       TEXT,
      premium_gasoline REAL,
      gasoline         REAL,
      diesel           REAL,
      kerosene         REAL,
      PRIMARY KEY (station_id, price_date)
    );

    CREATE TABLE station_character (
      station_id   TEXT PRIMARY KEY,
      obs_days     INTEGER,
      year_median  REAL,
      year_min     REAL,
      year_max     REAL,
      avg_rank     REAL,   -- 1년 평균 동네순위 (0=동네최저, 1=동네최고)
      rank_sd      REAL,
      character    TEXT
    );

    CREATE TABLE market_phase (
      price_date TEXT PRIMARY KEY,
      nat_median REAL,
      trend      REAL,
      phase      TEXT,
      weekday    TEXT
    );
    """)

    # ---- stations ----
    rows = []
    for _, r in base.iterrows():
        sido, sigungu = split_region(r["지역"])
        rows.append((
            r["고유번호"], r["상호"], r["상표"], r["주소"], r.get("전화번호"),
            1 if r["셀프구분"] == "셀프" else 0,
            r["지역"], sido, sigungu, None, None, None,
            1 if r["품질관리협약주유소"] == "Y" else 0,
            1 if r["전산보고주유소"] == "Y" else 0,
        ))
    con.executemany("INSERT INTO stations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)

    # ---- prices (today) ----
    prow = []
    for _, r in cur.iterrows():
        prow.append((
            r["고유번호"], price_date,
            z(r["고급휘발유"]), z(r["휘발유"]), z(r["경유"]), z(r["실내등유"]),
        ))
    con.executemany("INSERT OR REPLACE INTO prices VALUES (?,?,?,?,?,?)", prow)

    # 기본정보에 없는 주유소가 가격표에 있으면 최소 정보로 보강
    con.execute("""
      INSERT INTO stations (station_id, region, sido, sigungu)
      SELECT p.station_id, '', '', '' FROM prices p
      LEFT JOIN stations s ON s.station_id = p.station_id
      WHERE s.station_id IS NULL
    """)

    # ---- 1년 성격 ----
    crow = []
    for _, r in char.iterrows():
        crow.append((
            r["고유번호"], int(float(r["관측일수"])), float(r["연중중앙가"]),
            float(r["연중최저"]), float(r["연중최고"]),
            float(r["평균동네순위"]), float(r["순위변동성"]), r["성격"],
        ))
    con.executemany("INSERT OR REPLACE INTO station_character VALUES (?,?,?,?,?,?,?,?)", crow)

    # ---- 국면 ----
    frow = []
    for _, r in phase.iterrows():
        t = r["주간추세"]
        frow.append((r["날짜"], float(r["전국중앙가"]),
                     float(t) if isinstance(t, str) and t.strip() else None,
                     r["국면"], r["요일"]))
    con.executemany("INSERT OR REPLACE INTO market_phase VALUES (?,?,?,?,?)", frow)

    con.commit()

    # ---- 검증 ----
    q = lambda s: con.execute(s).fetchone()[0]
    print("stations          :", q("SELECT COUNT(*) FROM stations"))
    print("prices (today)    :", q("SELECT COUNT(*) FROM prices"))
    print("  휘발유 유효      :", q("SELECT COUNT(gasoline) FROM prices"))
    print("  고급휘발유 유효  :", q("SELECT COUNT(premium_gasoline) FROM prices"))
    print("  실내등유 유효    :", q("SELECT COUNT(kerosene) FROM prices"))
    print("station_character :", q("SELECT COUNT(*) FROM station_character"))
    print("market_phase      :", q("SELECT COUNT(*) FROM market_phase"))
    print("시군구 수          :", q("SELECT COUNT(DISTINCT region) FROM stations WHERE region<>''"))
    print()
    print("지역 파싱 예외 확인:")
    for r in con.execute("""SELECT region, sido, sigungu, COUNT(*) FROM stations
                            WHERE sido IN ('세종시','전남광주') OR region LIKE '%세종%'
                            GROUP BY region ORDER BY region LIMIT 8"""):
        print("   ", r)
    print()
    print("좌표 미확보:", q("SELECT COUNT(*) FROM stations WHERE lat IS NULL"))
    con.close()


if __name__ == "__main__":
    main()
