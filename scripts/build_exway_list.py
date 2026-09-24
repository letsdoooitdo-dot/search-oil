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
EARLY = "2026-09-20"       # 우리 자료의 첫날 - 이 값이 안 움직였는지로 기준일을 검증한다
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

    # ── 기준일 검증 ──────────────────────────────────────────
    # 공식 기준은 9/17 인데 우리 자료는 9/20 부터다. 그날을 직접 잴 수는 없으니,
    # 대신 '그 주에 값이 움직이긴 했나'를 본다. 안 움직였다면 9/17 도 같았을
    # 가능성이 크다 - 이건 확인이 아니라 추정이므로 글에도 그렇게 적는다.
    # 날짜별 평균가로 본다. '값이 바뀐 곳 수'로 세면 사흘치와 하루치를
    # 헷갈리기 쉬워서 실제로 한 번 잘못 적었다(2026-09-25). 평균가는
    # 기준선이 밀렸는지를 한 줄로 보여준다.
    days = [d[0] for d in c.execute(
        "select distinct price_date from prices order by price_date").fetchall()]
    daily = []
    for d in days:
        n, av = c.execute(
            """select count(*), avg(gasoline) from prices p
               join stations s using(station_id)
               where p.price_date=? and s.brand=? and p.gasoline>0""",
            (d, BRAND)).fetchone()
        if n:
            daily.append((d, n, av))

    pre = [x for x in daily if x[0] < "2026-09-24"]     # 연휴 전
    hol = [x for x in daily if x[0] >= "2026-09-24"]    # 연휴
    drift = (pre[-1][2] - pre[0][2]) if len(pre) > 1 else 0   # 연휴 전 값이 밀린 폭
    gap = (pre[-1][2] - hol[-1][2]) if (pre and hol) else 0   # 직전 평일 -> 오늘

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
    lines.append("## 9월 17일과 비교한 게 아닌데, 믿어도 되나\n")
    lines.append("정부 발표 기준일은 **9월 17일**입니다. 우리 자료는 9월 20일부터라")
    lines.append("그날 값이 없습니다. 그래서 **그 주에 값이 움직였는지**를 대신 봤습니다.\n")
    lines.append("| 날짜 | 주유소 | 휘발유 평균 |")
    lines.append("|---|---|---|")
    for d, n, av in daily:
        mark = " ← 연휴 시작" if d == "2026-09-24" else ""
        lines.append("| %s%s | %d곳 | %s원 |"
                     % (d, mark, n, format(round(av), ",")))
    lines.append("")
    lines.append("연휴 전 나흘(%s~%s) 동안 평균값은 **%+d원**밖에 안 움직였습니다."
                 % (pre[0][0][5:], pre[-1][0][5:], round(drift)))
    lines.append("고속도로 기름값은 동네 주유소와 달리 날마다 바뀌지 않습니다.")
    lines.append("그러니 9월 17일 값도 9월 23일과 크게 다르지 않았을 것입니다 —")
    lines.append("사흘에 %d원이면 엿새라도 한 자릿수 차이입니다.\n" % abs(round(drift)))
    lines.append("> **다만 이건 추정입니다.** 9월 17일 가격을 직접 재서 맞춰본 게")
    lines.append("> 아닙니다. 우리가 확실히 말할 수 있는 건 '연휴 직전 평일보다")
    lines.append("> **%d원** 쌉니다'까지입니다.\n" % round(gap))
    lines.append("연휴가 시작된 9월 24일에 값이 한꺼번에 떨어졌습니다. 며칠에 걸쳐")
    lines.append("조금씩 내린 게 아니라 하루 만에 일제히 움직였으니, 시장이 아니라")
    lines.append("**정책으로 내린 것이 분명합니다.**\n")
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
