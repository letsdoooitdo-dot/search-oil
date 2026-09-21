#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
매일 한 번 이것만 돌리면 된다
==============================
수집 → 적재 → 점검 → 246페이지 재생성 까지 한 번에.

  python build_all.py                 전체 (수집 포함)
  python build_all.py --skip-collect  이미 받아둔 파일로 다시 만들기만
  python build_all.py --pages-only    DB 건드리지 않고 페이지만

작업 스케줄러에 걸 때는 이 파일 하나만 등록하면 된다.
"""

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

import argparse
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable

BUILDERS = [
    ("판정 화면", "build_screens.py"),
    ("우리 동네", "build_area_pages.py"),
    ("리포트", "build_report_pages.py"),
    ("계산기", "build_calc_pages.py"),
    ("지원금·제도", "build_policy_pages.py"),
    ("홈·사이트맵", "build_home.py"),
]


def run(script, args=()):
    r = subprocess.run([PY, os.path.join(HERE, script), *args],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()


def step(label, script, args=()):
    t0 = time.time()
    code, out, err = run(script, args)
    dt = time.time() - t0
    mark = "OK  " if code == 0 else "실패"
    print(f"  [{mark}] {label:<12} {dt:5.1f}초")
    for line in (out or "").splitlines():
        print(f"         {line}")
    if code != 0:
        for line in (err or "").splitlines()[-6:]:
            print(f"         ! {line}")
    return code == 0


def check_claims():
    """리포트 본문이 전제하는 주장이 아직 참인지 확인한다.

    숫자만 자동으로 갈아끼우면, 데이터가 크게 변했을 때 글이 거짓말을 하게 된다.
    그래서 여기서 걸러 사람에게 알린다.
    """
    sys.path.insert(0, HERE)
    import figures
    s = figures.snapshot()
    broken = figures.check_claims(s)
    print(f"\n[기준일 {s['date']}] 휘발유 중앙 {s['gas']['median']:,.0f}원 · "
          f"셀프 격차 {s['self_full']['gap']:,.0f}원 · 요일 격차 {s['weekday_gap']:.1f}원")
    if broken:
        print("  [경고] 리포트 본문의 주장이 더 이상 맞지 않습니다. 해당 글을 다시 써야 합니다:")
        for name, detail in broken:
            print(f"     - {name} ({detail})")
    else:
        print("  주장 점검: 전부 유효")
    return not broken


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-collect", action="store_true", help="수집 건너뛰기")
    ap.add_argument("--pages-only", action="store_true", help="DB 손대지 않고 페이지만")
    args = ap.parse_args()

    t0 = time.time()
    ok = True

    if not args.pages_only:
        if not args.skip_collect:
            print("1) 오피넷에서 오늘 가격 받기")
            if not step("수집", "collect_prices.py"):
                print("\n수집 실패. 이후 단계를 중단합니다.", file=sys.stderr)
                return 1
        print("2) DB에 적재")
        if not step("적재", "load_prices.py"):
            print("\n적재 실패. 이후 단계를 중단합니다.", file=sys.stderr)
            return 1

    print("3) 데이터 점검")
    claims_ok = check_claims()

    print("\n4) 페이지 생성")
    for label, script in BUILDERS:
        ok = step(label, script) and ok

    print(f"\n총 {time.time() - t0:.1f}초 · {'정상 완료' if ok else '일부 실패'}"
          f"{'' if claims_ok else ' · 리포트 본문 확인 필요'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
