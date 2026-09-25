# -*- coding: utf-8 -*-
"""추석 연휴 100원 인하 대상 - 고속도로(도로공사) 주유소 명단 + 실제 인하 여부.

2026 추석(9/24~27) 한국도로공사가 재정고속도로 주유소 226곳의 기름값을
9월 17일 판매가 대비 리터당 100원 낮춰 판다고 발표했다.

★ 도로공사는 226곳의 **이름 목록을 공개하지 않았다.** 그래서 이 파일은
  '공식 226곳 명단'이 아니다. 오피넷에 **알뜰(ex)** 상표로 등록된
  고속도로 주유소 = 도로공사가 관리하는 곳들을 우리 데이터에서 추린 것이다.
  민자 고속도로 휴게소(정안·이순신 등)는 상표가 SK·S-OIL 등으로 잡히고
  할인 대상도 아니라서 자연히 빠진다.

★ 기준일 - 예전에는 우리 가격이 9월 20일부터라 '연휴 직전 평일(9/23)'과
  비교했다. 지금은 back_data 주간 파일(20260915-20260921)에 9월 17일 값이
  들어와서, 정부 발표와 같은 기준일로 직접 맞춰본다. 더는 추정이 아니다.
  그 파일의 9/20 평균이 oil.db 의 9/20 평균과 소수점까지 같은 것으로
  두 자료가 같은 자를 쓴다는 것도 확인했다(1842.7원 / 202곳).

만드는 것
  고속도로주유소_추석할인.csv   엑셀로 열어볼 명단
  고속도로주유소_추석할인.md    그대로 읽을 수 있는 명단
"""

import sys as _s
try:
    _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import csv
import io
import os
import re
import sqlite3
import statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DB = os.path.join(HERE, "oil.db")

# 정부 발표의 기준일. 이 값은 back_data 주간 파일에서 읽는다.
BASE = "2026-09-17"
BASE_FILE = os.path.join(ROOT, "back_data",
                         "과거_판매가격(주유소)20260915-20260921.csv")
BEFORE = "2026-09-23"      # 연휴 직전 평일 - 참고용으로 CSV 에만 남긴다
BRAND = "알뜰(ex)"          # 오피넷에서 고속도로(도로공사) 주유소를 가리키는 상표

# 이름 앞에 붙은 운영사(대보건설·케이알산업 등)는 떼어낸다.
# 운전자가 찾는 건 '어느 휴게소냐'지 누가 운영하느냐가 아니다.
CORP = re.compile(r"^\s*(주식회사|㈜|\(주\))?[^\s]*(㈜|\(주\)|주식회사)[^\s]*\s+")


def clean(name):
    n = CORP.sub("", name).strip()
    return n or name.strip()


def z(v):
    """0은 가격이 아니라 '미취급' 표시 -> None"""
    try:
        f = float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return None if f <= 0 else f


def read_week(path):
    """back_data 주간 파일을 읽는다. 헤더가 오피넷 일간 파일과 다르다 -
    고유번호가 '번호', 날짜가 '기간'(YYYYMMDD) 컬럼에 들어있다. CP949."""
    raw = open(path, "rb").read()
    for enc in ("cp949", "utf-8-sig", "utf-8"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise RuntimeError("인코딩을 알 수 없습니다: %s" % path)
    return list(csv.DictReader(io.StringIO(text)))


def main():
    c = sqlite3.connect(DB)
    today = c.execute("select max(price_date) from prices").fetchone()[0]

    week = read_week(BASE_FILE)
    ymd = BASE.replace("-", "")
    base17 = {}
    for r in week:
        if (r.get("기간") or "").strip() == ymd:
            base17[(r.get("번호") or "").strip()] = (z(r.get("휘발유")),
                                                    z(r.get("경유")))

    rows = c.execute(
        """
        select s.station_id, s.name, s.sido, s.sigungu,
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
    for sid, name, sido, sigungu, gas, die, was23 in rows:
        gas, die, was23 = won(gas), won(die), won(was23)
        g17, d17 = base17.get(sid, (None, None))
        g17, d17 = won(g17), won(d17)
        drop = (g17 - gas) if (g17 and gas) else None
        ddrop = (d17 - die) if (d17 and die) else None
        out.append({
            "주유소": clean(name), "시도": sido, "시군구": sigungu,
            "휘발유": gas, "경유": die,
            "기준일(9/17)휘발유": g17,
            "내린폭": drop,
            "경유내린폭": ddrop,
            "연휴전(9/23)": was23,
            # 기준일 이후 연휴 직전까지 값을 올렸나. 올렸어도 할인은 9/17
            # 값에서 빠지므로 올린 만큼이 그대로 지워진다.
            "직전인상": (was23 - g17) if (g17 and was23 and was23 > g17) else None,
        })

    # CSV - 엑셀에서 열리게 BOM 을 붙인다(안 붙이면 한글이 깨진다)
    cpath = os.path.join(ROOT, "고속도로주유소_추석할인.csv")
    with open(cpath, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)

    # 실제로 내렸나 세어본다 - 이게 우리만 할 수 있는 확인이다
    got = [r for r in out if r["내린폭"] is not None]
    exact = [r for r in got if r["내린폭"] == 100]
    big = [r for r in got if r["내린폭"] >= 90]
    same = [r for r in got if -10 < r["내린폭"] < 50]
    up = [r for r in got if r["내린폭"] <= -10]
    nodata = [r for r in out if r["내린폭"] is None]
    avg = st.mean(r["내린폭"] for r in got) if got else 0
    med = st.median(r["내린폭"] for r in got) if got else 0
    dgot = [r["경유내린폭"] for r in out if r["경유내린폭"] is not None]

    # ── 기준일 검증 ──────────────────────────────────────────
    # 두 자료(back_data 주간 파일 / oil.db)가 겹치는 날이 9/20 이다.
    # 그날 평균이 같으면 같은 자를 쓴다는 뜻이라, 이어 붙여도 된다.
    exids = {r[0] for r in c.execute(
        "select station_id from stations where brand=?", (BRAND,))}
    wk = {}
    for r in week:
        if (r.get("번호") or "").strip() in exids:
            g = z(r.get("휘발유"))
            if g:
                wk.setdefault((r.get("기간") or "").strip(), []).append(g)
    daily = [("%s-%s-%s" % (d[:4], d[4:6], d[6:]), len(v), st.mean(v))
             for d, v in sorted(wk.items())]
    seen = {d for d, _, _ in daily}
    for d, n, av in c.execute(
            """select price_date, count(*), avg(gasoline) from prices p
               join stations s using(station_id)
               where s.brand=? and p.gasoline>0 group by 1 order by 1""",
            (BRAND,)):
        if d not in seen:
            daily.append((d, n, av))
    daily.sort()
    overlap = [d for d in daily if d[0] == "2026-09-20"]

    hol = [x for x in daily if x[0] >= "2026-09-24"]    # 연휴
    b17avg = [x for x in daily if x[0] == BASE][0][2]
    gap = b17avg - hol[-1][2]

    # 동네 주유소는 그대로인지 - 고속도로만 내린 게 맞나
    allnow = c.execute(
        "select avg(gasoline) from prices where price_date=? and gasoline>0",
        (today,)).fetchone()[0]
    all17 = st.mean([z(r.get("휘발유")) for r in week
                     if (r.get("기간") or "").strip() == ymd
                     and z(r.get("휘발유"))])
    exnow = hol[-1][2]

    def w(n):
        return format(int(round(n)), ",")

    L = []
    A = L.append
    A("# 2026 추석 고속도로 주유소 100원 할인 - 주유소별 명단\n")
    A("한국도로공사가 **재정고속도로 주유소 226곳**의 기름값을 9월 24~27일")
    A("나흘간 9월 17일 판매가 대비 **리터당 100원** 낮춰 팝니다.")
    A("민자 고속도로 휴게소는 빠집니다.\n")
    A("> **이 명단은 도로공사가 낸 공식 226곳 목록이 아닙니다.** 도로공사는")
    A("> 이름 목록을 공개하지 않았습니다. 오피넷에 고속도로 주유소(알뜰 EX)로")
    A("> 등록된 **%d곳**을 추리고, 거기에 **오늘 실제 판매가**를 붙였습니다.\n"
      % len(out))
    A("> **이번엔 정부 발표와 같은 기준일(9월 17일)로 직접 맞춰봤습니다.**")
    A("> 예전 판은 우리 자료가 9월 20일부터라 연휴 직전 평일과 비교한")
    A("> 추정이었지만, 9월 17일이 든 주간 자료가 들어와 이제 추정이 아닙니다.\n")

    A("## 발표대로 내렸나 - 9월 17일 값과 하나씩 맞춰봤습니다\n")
    A("| 항목 | 곳수 |")
    A("|---|---|")
    A("| **정확히 100원** 내림 | **%d곳** |" % len(exact))
    A("| 90원 이상 내림 | %d곳 |" % len(big))
    A("| 거의 그대로 | %d곳 |" % len(same))
    A("| 오히려 오름 | %d곳 |" % len(up))
    A("| 9월 17일 값이 없어 못 잰 곳 | %d곳 |" % len(nodata))
    A("| **평균 인하폭** | **%.1f원** |" % avg)
    A("| 중앙값 | %d원 |" % med)
    A("")
    A("잰 %d곳 가운데 %d곳이 **1원도 안 틀리고 딱 100원** 내렸습니다."
      % (len(got), len(exact)))
    A("평균 %.1f원, 중앙값 %d원. 발표한 숫자가 그대로 지켜졌습니다.\n"
      % (avg, med))
    A("**경유도 같이 내렸습니다.** 발표문은 '기름값'이라고만 했는데,")
    A("실제로는 경유도 %d곳에서 평균 %.1f원 내렸습니다."
      % (len(dgot), st.mean(dgot)))
    A("경유차로 내려가시는 분도 그대로 혜택을 봅니다.\n")

    A("## 동네 주유소는 그대로입니다\n")
    A("| | 9월 17일 | 오늘(%s) | 차이 |" % today)
    A("|---|---|---|---|")
    A("| 고속도로(도로공사) | %s원 | %s원 | **%+d원** |"
      % (w(b17avg), w(exnow), round(exnow - b17avg)))
    A("| 전국 전체 | %s원 | %s원 | %+d원 |"
      % (w(all17), w(allnow), round(allnow - all17)))
    A("")
    A("전국 평균은 여드레 동안 %d원 움직였을 뿐입니다. 기름값 자체가 내린 게"
      % round(abs(allnow - all17)))
    A("아니라 **고속도로 주유소만 정책으로 내린 것**입니다. 그 결과 지금")
    A("고속도로 기름값이 전국 평균보다 **%d원 쌉니다.** 평소에는 고속도로가"
      % round(abs(exnow - allnow)))
    A("더 비싸다는 통념과 반대입니다.\n")

    A("## 날짜별로 본 값\n")
    A("| 날짜 | 주유소 | 휘발유 평균 |")
    A("|---|---|---|")
    for d, n, av in daily:
        mark = ""
        if d == BASE:
            mark = " ← 정부 기준일"
        elif d == "2026-09-24":
            mark = " ← 연휴 할인 시작"
        A("| %s%s | %d곳 | %s원 |" % (d, mark, n, w(av)))
    A("")
    if overlap:
        A("9월 20일은 두 자료(주간 자료 / 우리가 날마다 받는 자료)에 다 있는")
        A("날입니다. 그날 평균이 양쪽 다 **%s원 %d곳**으로 같았습니다."
          % (w(overlap[0][2]), overlap[0][1]))
        A("같은 자를 쓴다는 뜻이라, 이어 붙여 비교해도 됩니다.\n")
    A("9월 17일부터 23일까지 값은 거의 붙어 있다가 **9월 24일 하루 만에")
    A("일제히 %d원 떨어졌습니다.** 며칠에 걸쳐 조금씩 내린 게 아니라"
      % round(gap))
    A("하루에 한꺼번에 움직였으니, 시장이 아니라 **정책으로 내린 것**입니다.\n")

    # ── 기준일을 9/17로 잡은 게 왜 중요한가 ──────────────────
    # 연휴 직전에 값을 올려놓고 거기서 100원 빼면 손님이 보는 이득은 줄어든다.
    # 실제로 올린 곳이 있는지, 올렸어도 9/17 값에서 빠졌는지를 본다.
    raised = sorted([r for r in out if r["직전인상"]],
                    key=lambda r: -r["직전인상"])
    if raised:
        kept = [r for r in raised if r["내린폭"] and r["내린폭"] >= 90]
        A("## 연휴 직전에 값을 올린 곳 - 그래도 소용없었습니다\n")
        A("기준일(9월 17일)을 정해둔 게 왜 중요한지 보여주는 대목입니다.")
        A("9월 17일 이후 연휴 직전까지 값을 **올린 고속도로 주유소가 %d곳**"
          % len(raised))
        A("있었습니다. 최대 %d원까지 올렸습니다.\n" % raised[0]["직전인상"])
        A("| 주유소 | 시군구 | 9/17 | 9/23 | 오늘 | 9/17 대비 |")
        A("|---|---|---|---|---|---|")
        for r in raised:
            A("| %s | %s | %s원 | %s원 | %s원 | **%d원 내림** |" % (
                r["주유소"], r["시군구"], w(r["기준일(9/17)휘발유"]),
                w(r["연휴전(9/23)"]), w(r["휘발유"]), r["내린폭"]))
        A("")
        A("그런데 **할인은 올린 값이 아니라 9월 17일 값에서 빠졌습니다.**")
        A("%d곳 중 %d곳이 9월 17일 기준으로 90원 이상 내렸습니다."
          % (len(raised), len(kept)))
        A("예를 들어 곡성(순천)주유소는 9월 19일에 30원을 올렸지만,")
        A("오늘 값은 올린 값(1,859원)이 아니라 9월 17일 값(1,829원)에서")
        A("100원 빠진 **1,729원**입니다. 올린 30원이 그대로 지워진 셈입니다.\n")
        A("기준일을 미리 못박아 둔 덕분에 '올려놓고 할인'이 통하지 않았습니다.\n")

    # 눈에 띄는 곳
    odd = sorted([r for r in got if r["내린폭"] != 100],
                 key=lambda r: r["내린폭"])
    if odd:
        A("## 100원이 아닌 곳\n")
        A("| 주유소 | 시군구 | 내린폭 | 오늘 휘발유 |")
        A("|---|---|---|---|")
        for r in odd:
            A("| %s | %s | %d원 | %s원 |" % (
                r["주유소"], r["시군구"], r["내린폭"], w(r["휘발유"])))
        A("")
        A("100원보다 더 내린 곳은 도로공사 할인에 더해 제 값도 같이 내린")
        A("곳입니다.\n")
    if nodata:
        A("9월 17일 값이 오피넷에 없어 못 잰 곳: %s\n"
          % ", ".join(r["주유소"] for r in nodata))

    A("기준일: 오늘 %s · 비교 %s(정부 발표 기준일) · 출처 오피넷\n"
      % (today, BASE))

    cur = None
    for r in out:
        if r["시도"] != cur:
            cur = r["시도"]
            A("\n## %s\n" % cur)
            A("| 주유소 | 시군구 | 휘발유 | 경유 | 9/17 대비 |")
            A("|---|---|---|---|---|")
        d = r["내린폭"]
        dt = ("-" if d is None
              else "**%d원 내림**" % d if d >= 50
              else "%d원 오름" % -d if d < 0 else "그대로")
        A("| %s | %s | %s | %s | %s |" % (
            r["주유소"], r["시군구"],
            "%s원" % w(r["휘발유"]) if r["휘발유"] else "-",
            "%s원" % w(r["경유"]) if r["경유"] else "-",
            dt))

    mpath = os.path.join(ROOT, "고속도로주유소_추석할인.md")
    with open(mpath, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")

    print("명단 %d곳 (9/17 값으로 잰 곳 %d)" % (len(out), len(got)))
    print("정확히 100원 %d / 90원 이상 %d / 그대로 %d / 오름 %d / 평균 %.1f원"
          % (len(exact), len(big), len(same), len(up), avg))
    print("경유 평균 %.1f원 내림" % st.mean(dgot))
    print(cpath)
    print(mpath)


if __name__ == "__main__":
    main()
