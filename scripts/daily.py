#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
매일 한 번 이것만 돌면 된다 (수집 → 적재 → 데이터 → 배포)
============================================================
작업 스케줄러에 이 파일 하나만 걸어두면 손댈 일이 없다.

  python daily.py                 전체
  python daily.py --skip-collect  이미 받아둔 CSV로 다시 만들기
  python daily.py --no-push       깃허브에 올리지 않고 만들기만
  python daily.py --install       윈도우 작업 스케줄러에 등록 (매일 오전 7시)

하는 일
  1. 수집   오피넷에서 오늘 판매가 CSV 받기 (진짜 브라우저로 - NetFunnel 때문)
  2. 적재   CSV -> oil.db
  3. 좌표   새로 생긴 주유소의 좌표를 카카오로 채우기
  4. 데이터  oil.db -> api/*.json
  5. 점검   글에 써둔 주장이 아직 사실인지 확인
  6. 배포   api/ 를 깃허브에 올리기 (GitHub Pages 가 받아간다)

테마(blogger/theme-oil.xml)는 여기서 만들지 않는다. 코드를 고쳤을 때만
build_theme.py 를 돌려 블로그에 사람이 붙여넣는 것이라, 매일 할 일이 아니다.

기록은 logs/daily-YYYYMMDD.log 에 남는다. 실패하면 그 파일을 보면 된다.
"""

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

import argparse
import datetime as dt
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PY = sys.executable
LOG_DIR = os.path.join(ROOT, "logs")

_log = None


def say(msg=""):
    print(msg)
    if _log:
        _log.write(msg + "\n")
        _log.flush()


def run(title, script, args=(), timeout=1800):
    """한 단계 실행. 성공하면 True."""
    say(f"\n── {title} " + "─" * max(0, 42 - len(title)))
    t0 = dt.datetime.now()
    r = subprocess.run([PY, os.path.join(HERE, script), *args],
                       capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=timeout)
    for line in (r.stdout or "").strip().splitlines():
        say("  " + line)
    if r.returncode != 0:
        for line in (r.stderr or "").strip().splitlines()[-12:]:
            say("  ! " + line)
        say(f"  실패 (코드 {r.returncode})")
        return False
    say(f"  걸린 시간 {(dt.datetime.now() - t0).seconds}초")
    return True


def git(*args, timeout=600):
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True,
                       text=True, encoding="utf-8", errors="replace", timeout=timeout)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def deploy():
    """데이터만 올린다. 소스는 사람이 따로 올린다."""
    say("\n── 배포 ───────────────────────────────────")
    code, out = git("status", "--porcelain", "api")
    if code != 0:
        say("  ! git status 실패: " + out.strip()[:200])
        return False
    if not out.strip():
        say("  바뀐 데이터가 없습니다 (오피넷이 아직 갱신 안 했을 수 있음)")
        return True

    n = len(out.strip().splitlines())
    today = dt.date.today().isoformat()
    for cmd in (("add", "api"),
                ("commit", "-m", f"데이터 갱신 {today}")):
        code, out = git(*cmd)
        if code != 0:
            say(f"  ! git {cmd[0]} 실패: " + out.strip()[:200])
            return False

    code, out = git("push", "origin", "main")
    if code != 0:
        say("  ! git push 실패: " + out.strip()[:300])
        return False
    say(f"  파일 {n}개 올림 · GitHub Pages 가 1~2분 뒤 반영합니다")
    return True


def install_task(hour=7):
    """윈도우 작업 스케줄러에 등록한다."""
    name = "주유소찾기 일일갱신"
    cmd = f'"{PY}" "{os.path.join(HERE, "daily.py")}"'
    r = subprocess.run(["schtasks", "/Create", "/TN", name, "/TR", cmd,
                        "/SC", "DAILY", "/ST", f"{hour:02d}:00", "/F"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    print((r.stdout or r.stderr).strip())
    if r.returncode == 0:
        print(f"\n등록했습니다. 매일 {hour}시에 자동으로 돌아갑니다.")
        print("  확인:  schtasks /Query /TN \"주유소찾기 일일갱신\"")
        print("  해제:  schtasks /Delete /TN \"주유소찾기 일일갱신\" /F")
        print("\n※ 컴퓨터가 꺼져 있으면 건너뜁니다. 켜져 있을 시간으로 잡으세요.")
    return r.returncode


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-collect", action="store_true", help="이미 받아둔 CSV 사용")
    ap.add_argument("--no-push", action="store_true", help="깃허브에 올리지 않음")
    ap.add_argument("--install", action="store_true", help="작업 스케줄러에 등록")
    ap.add_argument("--hour", type=int, default=7, help="자동 실행 시각 (기본 7시)")
    a = ap.parse_args()

    if a.install:
        return install_task(a.hour)

    global _log
    os.makedirs(LOG_DIR, exist_ok=True)
    path = os.path.join(LOG_DIR, f"daily-{dt.date.today():%Y%m%d}.log")
    _log = open(path, "a", encoding="utf-8")

    start = dt.datetime.now()
    say("=" * 46)
    say(f"주유소찾기 일일 갱신  {start:%Y-%m-%d %H:%M}")
    say("=" * 46)

    steps = []
    if not a.skip_collect:
        steps.append(("수집 (오피넷)", "collect_prices.py", (), 900))
    steps += [
        ("적재 (CSV → DB)", "load_prices.py", (), 600),
        # 새로 문을 연 주유소는 좌표가 없어 거리 계산에서 통째로 빠진다.
        # 매일 채워주지 않으면 조용히 누락이 쌓인다.
        ("좌표 채우기", "fill_coords.py", (), 900),
        ("데이터 (DB → api)", "build_data.py", (), 600),
    ]

    for title, script, args, timeout in steps:
        try:
            if not run(title, script, args, timeout):
                say(f"\n중단합니다. {title} 단계에서 실패했습니다.")
                say(f"기록: {path}")
                return 1
        except subprocess.TimeoutExpired:
            say(f"\n중단합니다. {title} 단계가 너무 오래 걸립니다.")
            return 1

    # 점검 - 글에 써둔 주장이 아직 사실인지
    try:
        sys.path.insert(0, HERE)
        import figures
        con = figures.connect()
        try:
            warn = figures.check_claims(figures.snapshot(con))
        finally:
            con.close()
        if warn:
            say("\n── 점검 ───────────────────────────────────")
            for w in warn:
                say("  ! " + str(w))
            say("  (글 내용을 손봐야 할 수 있습니다. 데이터 배포는 계속합니다)")
    except Exception as e:
        say(f"\n  점검을 건너뜁니다: {e}")

    ok = True
    if not a.no_push:
        ok = deploy()

    mins = (dt.datetime.now() - start).seconds // 60
    say("\n" + "=" * 46)
    say(("끝났습니다" if ok else "배포에서 실패했습니다") + f"  ({mins}분)")
    say(f"기록: {path}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
