#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
카카오 키 진단 - 딱 한 번 호출해서 무슨 일이 생기는지 전부 보여준다.
표준 라이브러리만 사용.

    python diag_kakao.py --key <REST_API_키>
"""

import sys as _s
try: _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request

TESTS = [
    ("주소 검색", "https://dapi.kakao.com/v2/local/search/address.json",
     {"query": "경기 평택시 포승읍 서동대로 1179"}),
    ("키워드 검색", "https://dapi.kakao.com/v2/local/search/keyword.json",
     {"query": "평택 주유소", "size": 1}),
]

HINTS = {
    401: ("키가 거부됐습니다.",
          ["[앱] > [플랫폼 키] 의 'REST API 키'가 맞는지 확인",
           "JavaScript 키 / 네이티브 앱 키 / 어드민 키가 아닌지 확인",
           "키 앞뒤에 공백이나 따옴표가 섞이지 않았는지 확인"]),
    403: ("권한이 없습니다. 새로 만든 앱은 카카오맵이 꺼져 있습니다.",
          ["developers.kakao.com > 내 애플리케이션 > 해당 앱",
           "좌측 메뉴 [카카오맵] > [사용 설정] 의 상태를 [ON]",
           "이미 다른 앱에서 카카오맵을 켰다면 무료 쿼터가 그 앱에만 붙습니다"]),
    429: ("호출 한도를 넘었습니다.",
          ["잠시 뒤 재시도하거나 --workers 를 줄이세요"]),
}


def run(name, url, params, key):
    full = url + "?" + urllib.parse.urlencode(params)
    print(f"\n[{name}]")
    print(f"  요청: {full}")
    req = urllib.request.Request(
        full, headers={"Authorization": "KakaoAK " + key,
                       "User-Agent": "oil-geocoder-diag/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read().decode("utf-8")
            js = json.loads(body)
            docs = js.get("documents") or []
            print(f"  상태: {r.status} OK")
            print(f"  결과: {len(docs)}건")
            if docs:
                d = docs[0]
                addr = (d.get("road_address_name") or d.get("address_name")
                        or d.get("place_name") or "")
                print(f"  좌표: 위도 {d.get('y')}, 경도 {d.get('x')}   ({addr})")
                return True
            print("  [!] 호출은 됐는데 검색 결과가 0건입니다 - 주소 형식 문제일 수 있습니다.")
            return False
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", "replace")
        except Exception:
            pass
        print(f"  상태: {e.code} {e.reason}")
        print(f"  응답: {body[:400]}")
        title, steps = HINTS.get(e.code, ("알 수 없는 오류입니다.", []))
        print(f"\n  >> {title}")
        for i, st in enumerate(steps, 1):
            print(f"     {i}. {st}")
        return False
    except Exception as e:
        print(f"  [!] 네트워크 오류: {type(e).__name__}: {e}")
        print("     방화벽/프록시/백신이 dapi.kakao.com 을 막고 있을 수 있습니다.")
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default=os.environ.get("KAKAO_REST_KEY", ""))
    a = ap.parse_args()
    key = a.key.strip().strip('"').strip("'")

    if not key:
        raise SystemExit("python diag_kakao.py --key <REST_API_키>")

    print("=" * 66)
    print("  카카오 로컬 API 진단")
    print("=" * 66)
    print(f"  키 길이: {len(key)}자  (REST API 키는 32자)")
    print(f"  키 앞 6자: {key[:6]}...{key[-4:]}")
    if len(key) != 32:
        print("  [!] 길이가 32자가 아닙니다. 다른 종류의 키일 수 있습니다.")

    results = [run(n, u, p, key) for n, u, p in TESTS]

    print("\n" + "=" * 66)
    if all(results):
        print("  전부 통과. 이제 본 수집을 돌리세요:")
        print("     python geocode_kakao.py --key <키>")
    else:
        print("  위에 표시된 해결 단계를 먼저 처리한 뒤 다시 실행하세요:")
        print("     python diag_kakao.py --key <키>")
    print("=" * 66)


if __name__ == "__main__":
    main()
