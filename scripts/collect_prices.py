#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오피넷 일일 가격 수집 로봇
==========================
오피넷 다운로드 창구 앞에는 NetFunnel(번호표 대기열)이 있어서, 프로그램이 폼만
POST 하면 /common/nflerror.jsp 로 쫓겨난다. 그래서 진짜 브라우저를 띄워
사람이 하듯 페이지를 열고 [CSV저장]을 누른다 - 사용자가 손으로 하던 경로 그대로다.

  대상: 유가내려받기 > "사업자별 현재 판매가격" > CSV저장  (fn_Download(5))
  결과: current_data/현재판매가격_YYYYMMDD.csv  (CP949)

기존에 쓰던 .xls 대신 CSV를 받는다. LibreOffice 변환 단계가 사라진다.

사용법
  python collect_prices.py           수집 (이미 있으면 건너뜀)
  python collect_prices.py --force   다시 받기
  python collect_prices.py --show    브라우저를 띄워서 눈으로 확인
"""

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass


import argparse
import os
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_DIR = os.path.join(ROOT, "current_data")

URL = "https://www.opinet.co.kr/user/opdown/opDownload.do"
# "사업자별 현재 판매가격" 섹션의 CSV저장. 1/4=사업자 기본정보, 2/5=현재가격, 3/6=과거가격
DOWNLOAD_LINK = 'a[href="javascript:fn_Download(5);"]'
RADIO_GAS_STATION = "#rdo2"     # A=주유소 (B=충전소)

MIN_BYTES = 200_000             # 1만 곳이면 최소 이 정도는 나온다. 더 작으면 실패로 본다


def out_path(day: date) -> str:
    return os.path.join(OUT_DIR, f"현재판매가격_{day:%Y%m%d}.csv")


def collect(day: date, headless: bool = True, timeout_ms: int = 90_000) -> str:
    from playwright.sync_api import sync_playwright

    os.makedirs(OUT_DIR, exist_ok=True)
    target = out_path(day)

    with sync_playwright() as p:
        # 설치된 Chrome 을 그대로 쓴다 (별도 브라우저를 내려받지 않는다)
        browser = p.chromium.launch(channel="chrome", headless=headless)
        ctx = browser.new_context(accept_downloads=True, locale="ko-KR")
        page = ctx.new_page()

        # 버튼을 누르면 "주유소 현재 가격 정보를 다운 받으시겠습니까?" 확인창이 뜬다.
        # 자동화 브라우저는 기본이 '취소'라, 명시적으로 확인을 눌러줘야 진행된다.
        page.on("dialog", lambda d: d.accept())

        try:
            # NetFunnel(번호표) 스크립트가 끝난 뒤에 버튼이 동작하므로 networkidle 까지 기다린다
            page.goto(URL, wait_until="networkidle", timeout=timeout_ms)
            page.wait_for_selector(DOWNLOAD_LINK, timeout=timeout_ms)

            # 주유소 선택 (기본값이지만 명시한다)
            if page.locator(RADIO_GAS_STATION).count():
                page.locator(RADIO_GAS_STATION).check(timeout=10_000)

            with page.expect_download(timeout=timeout_ms) as dl_info:
                page.locator(DOWNLOAD_LINK).click()
            dl = dl_info.value
            dl.save_as(target)
        finally:
            ctx.close()
            browser.close()

    size = os.path.getsize(target)
    if size < MIN_BYTES:
        os.remove(target)
        raise RuntimeError(
            f"받은 파일이 너무 작습니다 ({size:,}바이트). 오피넷 페이지 구조가 바뀌었거나 "
            f"대기열에 막혔을 수 있습니다. --show 로 브라우저를 띄워 확인하세요.")
    return target


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="이미 있어도 다시 받기")
    ap.add_argument("--show", action="store_true", help="브라우저를 띄워서 확인")
    ap.add_argument("--date", help="파일에 붙일 날짜 YYYY-MM-DD (기본: 오늘)")
    args = ap.parse_args()

    day = date.fromisoformat(args.date) if args.date else date.today()
    target = out_path(day)

    if os.path.exists(target) and not args.force:
        print(f"이미 있음: {target} ({os.path.getsize(target):,}바이트)")
        return 0

    print(f"오피넷에서 받는 중... ({day:%Y-%m-%d})")
    try:
        path = collect(day, headless=not args.show)
    except Exception as e:
        print(f"실패: {e}", file=sys.stderr)
        return 1
    print(f"저장됨: {path} ({os.path.getsize(path):,}바이트)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
