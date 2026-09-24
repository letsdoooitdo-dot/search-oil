# -*- coding: utf-8 -*-
"""추석 연휴 100원 인하 대상 - 고속도로(도로공사) 주유소 명단 + 실제 인하 여부.

2026 추석(9/24~27) 한국도로공사가 재정고속도로 주유소 226곳의 기름값을
9월 17일 판매가 대비 리터당 100원 낮춰 판다고 발표했다.

★ 도로공사는 226곳의 **이름 목록을 공개하지 않았다.** 그래서 이 파일은
  '공식 226곳 명단'이 아니다. 오피넷에 **알뜰(ex)** 상표로 등록된
  고속도로 주유소 = 도로공사가 관리하는 곳들을 우리 데이터에서 추린 것이다.
  민자 고속도로 휴게소(정안·이순신 등)는 상표가 SK·S-OIL 등으로 잡히고
  할인 대상도 아니라서 자연히 빠진다.

★ 기준일이 다르다. 공식 기준은 9월 17일인데 우리 가격은 9월 20일부터
  모았다. 그래서 '연휴 직전 평일'인 9월 23일과 비교한다 - 17일과 23일
  사이에도 값이 움직였을 수 있으므로, 인하폭이 100원과 정확히 같지 않다.

만드는 것
  고속도로주유소_추석할인.csv   엑셀로 열어볼 명단
  고속도로주유소_추석할인.md    그대로 읽을 수 있는 명단
"""

import csv
import os
import re
import sqlite3

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DB = os.path.join(HERE, "oil.db")

BEFORE = "2026-09-23"      # 연휴 직전 평일
BRAND = "알뜰(ex)"          # 오피넷에서 고속도로(도로공사) 주유소를 가리키는 상표

# 이름 앞에 붙은 운영사(대보건설·케이알산업 등)는 떼어낸다.
# 운전자가 찾는 건 '어느 휴게소냐'지 누가 운영하느냐가 아니다.
CORP = re.compile(r"^\s*(주식회사|㈜|\(주\))?[^\s]*(㈜|\(주\)|주식회사)[^\s]*\s+")


def clean(name):
    n = CORP.sub("", name).strip()
    return n or name.strip()


def main():
    c = sqlite3.connect(DB)
    today = c.execute("select max(price_date) from prices").fetchone()[0]

    rows = c.execute(
        """
        select s.name, s.sido, s.sigungu, s.addr,
               n.gasoline, n.diesel, b.gasoline
        from stations s
        join prices n on n.station_id = s.station_id and n.price_date = ?
        left join prices b on b.station_id = s.station_id and b.price_date = ?
        where s.brand = ?
        order by s.sido, s.sigungu, s.name
        """,
        (today, BEFORE, BRAND),
    ).fetchall()

    # 가격은 실수로 들어와 있다. 그대로 쓰면 "1,734.0원"으로 찍힌다 -
    # 기름값에 소수점은 없으므로 정수로 바꿔 담는다.
    def won(v):
        return None if v is None else int(round(v))

    out = []
    for name, sido, sigungu, addr, gas, die, was in rows:
        gas, die, was = won(gas), won(die), won(was)
        drop = (was - gas) if (was and gas) else None
        out.append({
            "주유소": clean(name), "시도": sido, "시군구": sigungu,
            "휘발유": gas, "경유": die,
            "연휴전(9/23)": was,
            "내린폭": drop,
        })

    # CSV - 엑셀에서 열리게 BOM 을 붙인다(안 붙이면 한글이 깨진다)
    cpath = os.path.join(ROOT, "고속도로주유소_추석할인.csv")
    with open(cpath, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)

    # 실제로 내렸나 세어본다 - 이게 우리만 할 수 있는 확인이다
    got = [r for r in out if r["내린폭"] is not None]
    down = [r for r in got if r["내린폭"] >= 50]
    big = [r for r in got if r["내린폭"] >= 90]
    same = [r for r in got if -10 < r["내린폭"] < 50]
    up = [r for r in got if r["내린폭"] <= -10]
    avg = sum(r["내린폭"] for r in got) / len(got) if got else 0

    lines = []
    lines.append("# 2026 추석 고속도로 주유소 100원 할인 - 주유소별 명단\n")
    lines.append("한국도로공사가 **재정고속도로 주유소 226곳**의 기름값을 9월 24~27일")
    lines.append("나흘간 9월 17일 판매가 대비 **리터당 100원** 낮춰 팝니다. ")
    lines.append("민자 고속도로 휴게소는 빠집니다.\n")
    lines.append("> **이 명단은 도로공사가 낸 공식 226곳 목록이 아닙니다.** 도로공사는")
    lines.append("> 이름 목록을 공개하지 않았습니다. 오피넷에 고속도로 주유소(알뜰 EX)로")
    lines.append("> 등록된 **%d곳**을 추리고, 거기에 **오늘 실제 판매가**를 붙였습니다.\n"
                 % len(out))
    lines.append("> 내린폭은 공식 기준일(9/17)이 아니라 **연휴 직전 평일 9월 23일**과")
    lines.append("> 비교한 값입니다. 우리 가격 자료가 9월 20일부터라 그렇습니다.\n")
    lines.append("## 실제로 내렸나\n")
    lines.append("| 항목 | 곳수 |")
    lines.append("|---|---|")
    lines.append("| 9/23 대비 90원 이상 내림 | %d곳 |" % len(big))
    lines.append("| 50원 이상 내림 | %d곳 |" % len(down))
    lines.append("| 거의 그대로 | %d곳 |" % len(same))
    lines.append("| 오히려 오름 | %d곳 |" % len(up))
    lines.append("| 평균 인하폭 | %.0f원 |" % avg)
    lines.append("")
    lines.append("기준일: 오늘 %s · 비교 %s · 출처 오피넷\n" % (today, BEFORE))

    cur = None
    for r in out:
        if r["시도"] != cur:
            cur = r["시도"]
            lines.append("\n## %s\n" % cur)
            lines.append("| 주유소 | 시군구 | 휘발유 | 경유 | 9/23 대비 |")
            lines.append("|---|---|---|---|---|")
        d = r["내린폭"]
        dt = "-" if d is None else ("**%d원 내림**" % d if d >= 50
                                    else ("%d원 오름" % -d if d < 0 else "%d원" % -d))
        lines.append("| %s | %s | %s | %s | %s |" % (
            r["주유소"], r["시군구"],
            "%s원" % format(r["휘발유"], ",") if r["휘발유"] else "-",
            "%s원" % format(r["경유"], ",") if r["경유"] else "-",
            dt))

    mpath = os.path.join(ROOT, "고속도로주유소_추석할인.md")
    with open(mpath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print("명단 %d곳" % len(out))
    print("90원 이상 내림 %d / 50원 이상 %d / 그대로 %d / 오름 %d / 평균 %.0f원"
          % (len(big), len(down), len(same), len(up), avg))
    print(cpath)
    print(mpath)


if __name__ == "__main__":
    main()
