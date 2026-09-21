#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
지원금·제도 (/policy/)
======================
시즌 피크를 담당하는 탭. 유류세 인하 종료(2026-11-30)가 다가오면 검색량이 터진다.

★ 이 탭의 원칙: 제도 수치는 틀리면 신뢰를 잃는다.
  - 우리 DB로 증명되는 것(가격이 실제로 어떻게 움직였나)은 단정해서 쓴다.
  - 제도 날짜·요율은 우리가 검증할 수 없으므로 출처를 밝히고 확인을 권한다.
  - 확신이 없는 수치(화물차 유가보조금 요율 등)는 아예 쓰지 않는다.

★ 수동 작업 0 원칙
  - D-day는 빌드 시점에 굳히지 않고 브라우저에서 계산한다. 페이지를 재생성하지
    않아도 날짜가 틀어지지 않는다.

표준 라이브러리만 사용.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ui import esc, ad_slot, page_shell, url

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "policy")
ACCENT = "#A54A04"
INK = "#13181A"
MUTED = "#6B7679"

# fill_amount.py CALENDAR와 같은 값을 쓴다. 제도가 바뀌면 두 곳을 같이 고쳐야 한다.
TAX_END = "2026-11-30"
TAX_WON_PER_L = 112
REFUND_PER_L = 250
REFUND_CAP = 300_000
REFUND_SUNSET = "2026-12-31"

# 2026-03 급등 실측 (oil.db market_phase)
MAR_FROM, MAR_TO, MAR_DELTA, MAR_DAYS = 1715, 1895, 180, 4


def head(kicker, title, lead):
    return f"""
    <div>
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: {ACCENT};">{esc(kicker)}</div>
      <h1 style="margin: 5px 0 0; font-family: 'Gothic A1', sans-serif; font-size: 23px; font-weight: 900; letter-spacing: -0.025em; color: {INK}; line-height: 1.32;">{title}</h1>
      <p style="margin: 10px 0 0; font-size: 13.5px; line-height: 1.7; color: #4A5558;">{lead}</p>
    </div>"""


def card(title, inner):
    t = (f'<div style="font-family:\'Gothic A1\',sans-serif;font-size:17px;font-weight:900;color:{INK};margin-bottom:10px;">{esc(title)}</div>'
         if title else "")
    return f'<div style="background:#FFFFFF;border:1px solid #DDE3E1;border-radius:16px;padding:16px;">{t}{inner}</div>'


def para(*texts):
    return "".join(f'<p style="margin:0 0 11px;font-size:13.5px;line-height:1.75;color:#4A5558;">{t}</p>'
                   for t in texts)


def rows_table(rows):
    out = ""
    for i, (k, v) in enumerate(rows):
        bg = "background:#F5F7F6;" if i == len(rows) - 1 else ""
        br = "" if i == len(rows) - 1 else "border-bottom:1px solid #E9EEEC;"
        out += (f'<div style="display:flex;justify-content:space-between;gap:10px;padding:10px 12px;'
                f'font-size:12.5px;{br}{bg}"><span style="color:#5B666A;">{esc(k)}</span>'
                f'<span style="font-weight:700;color:{INK};text-align:right;">{v}</span></div>')
    return f'<div style="border:1px solid #E9EEEC;border-radius:11px;overflow:hidden;">{out}</div>'


def punch(text):
    return (f'<div style="background:{INK};border-radius:16px;padding:17px 16px;">'
            f'<p style="margin:0;font-size:14px;line-height:1.7;color:#FFFFFF;font-weight:600;">{text}</p></div>')


def verify_note(text):
    """제도 수치는 우리가 검증할 수 없다. 출처와 확인 경로를 반드시 밝힌다."""
    return (f'<div style="background:#FDF6EE;border:1px solid #F0D9BE;border-radius:12px;padding:12px 14px;">'
            f'<div style="font-size:11px;font-weight:700;letter-spacing:0.06em;color:{ACCENT};margin-bottom:5px;">확인하세요</div>'
            f'<p style="margin:0;font-size:12.5px;line-height:1.65;color:#5A4632;">{text}</p></div>')


def links():
    return f"""
    <a href="{url('/')}" style="display:flex;justify-content:space-between;align-items:center;background:#13181A;border-radius:14px;padding:14px;">
      <span style="font-size:13px;font-weight:700;color:#FFFFFF;">내 경로에서 진짜 이득인 곳 찾기</span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
    </a>
    <a href="{url('/policy/')}" style="display:flex;justify-content:space-between;align-items:center;background:#FFFFFF;border:1px solid #DDE3E1;border-radius:14px;padding:12px 14px;">
      <span style="font-size:12.5px;color:#4A5558;">다른 제도 보기</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5B666A" stroke-width="2.5" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
    </a>"""


def wrap(inner, script=""):
    s = f"<script>\n{script}\n</script>" if script else ""
    return f"""
  <div style="padding:16px 16px 0;display:flex;flex-direction:column;gap:12px;flex-grow:1;">
{inner}
  </div>
{s}"""


def note(text):
    return f'<div style="padding:12px 16px 18px;"><p style="margin:0;font-size:11px;color:#5B666A;line-height:1.6;">{text}</p></div>'


# ── 유류세 인하 종료 ───────────────────────────────────────────────────────
DDAY_JS = """
(function () {
  var target = new Date('%s' + 'T00:00:00+09:00');
  var now = new Date();
  var days = Math.ceil((target - now) / 86400000);
  var el = document.getElementById('dday');
  var msg = document.getElementById('ddayMsg');
  if (!el) return;
  if (days > 0) {
    el.textContent = 'D-' + days;
    msg.textContent = '%s 종료 예정까지 ' + days + '일 남았습니다.';
  } else if (days === 0) {
    el.textContent = 'D-DAY';
    msg.textContent = '오늘이 그날입니다.';
  } else {
    el.textContent = '종료됨';
    msg.textContent = '%s 이후입니다. 아래 내용은 지난 기록으로 보세요.';
  }
})();
""" % (TAX_END, TAX_END, TAX_END)


def build_tax_end():
    inner = head(
        "지원금·제도",
        "유류세 인하가 끝나면<br>기름값은 얼마나 오를까",
        "정부가 한시적으로 깎아준 유류세가 종료되면 그만큼 가격에 얹힙니다. "
        "지난번에 실제로 어떻게 움직였는지, 우리 가격 데이터로 확인했습니다.")

    inner += card("", f"""
      <div style="display:flex;align-items:baseline;gap:12px;">
        <span id="dday" style="font-family:'Gothic A1',sans-serif;font-size:40px;font-weight:900;letter-spacing:-0.03em;color:{ACCENT};line-height:1;">-</span>
        <span style="font-size:13px;color:#4A5558;">유류세 인하 종료 예정일</span>
      </div>
      <p id="ddayMsg" style="margin:10px 0 0;font-size:13px;line-height:1.7;color:#4A5558;"></p>""")

    inner += card("지난번엔 나흘 만에 180원 올랐습니다", f"""
      {rows_table([("2026년 3월 3일", f"{MAR_FROM:,}원"),
                   ("3월 4일", "+62원"),
                   ("3월 5일", "+52원"),
                   ("3월 6일", "+41원"),
                   ("3월 7일", f"+25원 → {MAR_TO:,}원")])}
      <p style="margin:12px 0 0;font-size:13px;line-height:1.7;color:#4A5558;">
        전국 중앙가 기준입니다. 나흘 만에 <b style="color:{INK};">{MAR_DELTA}원</b>이 올랐습니다.
        50L를 넣는다면 한 번 주유에 <b style="color:{INK};">{MAR_DELTA*50:,}원</b>이 더 나가는 셈입니다.
      </p>""")

    inner += para(
        "이런 움직임은 국제유가로는 설명되지 않습니다. 하루에 62원이 오르는 일은 "
        "유가 변동에서는 거의 없습니다. 1년 내내 지켜본 결과, 하루 변화폭이 20원을 넘긴 날은 "
        "371일 중 손에 꼽았고 그 대부분이 이 나흘에 몰려 있었습니다. "
        "<b>세금이 바뀔 때만 나오는 모양</b>입니다.")

    inner += ad_slot()

    inner += card("그래서 지금 뭘 해야 하나", para(
        f"종료 예정일 전에 <b>탱크를 채워두면</b> 그만큼을 아낍니다. "
        f"리터당 {TAX_WON_PER_L}원이 한 번에 오른다면, 60L 탱크를 절반만 채운 상태에서 "
        f"미리 가득 채울 경우 약 <b>{TAX_WON_PER_L*30:,}원</b>을 아끼는 계산입니다.",
        "다만 며칠 앞당기는 것 이상의 의미는 없습니다. 어차피 그다음 주유부터는 오른 가격으로 넣게 됩니다. "
        "<b>한 번의 주유량만큼만 이득</b>이라고 보시면 정확합니다.") +
        verify_note(
            f"종료 예정일({TAX_END})과 인하폭(리터당 {TAX_WON_PER_L}원)은 정부 발표에 따라 "
            f"연장되거나 조정될 수 있습니다. 기획재정부·국세청 발표를 확인하세요. "
            f"위 가격 기록은 우리가 수집한 실제 판매가이고, 그 원인이 세금 조정이라는 것은 "
            f"가격 움직임의 모양에서 추정한 것입니다."))

    inner += punch(
        "미리 채워서 아낄 수 있는 건 딱 한 탱크분입니다. "
        "대신 그 한 번을 가장 싼 곳에서 넣으면 이득이 겹칩니다.")

    inner += card("", para(
        "이 사이트는 가는 길에서 <b>진짜 이득인 주유소 한 곳</b>을 찍어줍니다. "
        "지금 국면에서 얼마를 넣는 게 좋은지도 같이 알려드립니다."))

    inner += links()
    body = wrap(inner, DDAY_JS) + note(
        "가격 기록 출처: 오피넷 전국 주유소 일별 판매가 (2025년 9월 ~ 2026년 9월, 371일) · "
        "제도 내용은 정부 발표를 확인하세요")
    return page_shell("유류세 인하 종료되면 기름값 얼마나 오를까 - 지난번 나흘 만에 180원",
                      ACCENT, body, active="/policy/",
                      description="유류세 인하 종료 시 기름값 상승폭을 실제 가격 기록으로 확인했습니다. "
                                  "지난번에는 나흘 만에 180원이 올랐습니다.")


# ── 경차 유류세 환급 ───────────────────────────────────────────────────────
def build_light_car():
    cap_l = REFUND_CAP // REFUND_PER_L
    inner = head(
        "지원금·제도",
        "경차 유류세 환급<br>연 30만원 챙기기",
        "배기량 1,000cc 미만 경차는 주유할 때 낸 유류세 일부를 돌려받습니다. "
        "신청해두면 자동으로 쌓이는 돈인데, 모르고 지나치는 분이 많습니다.")

    inner += card("한눈에 보기", rows_table([
        ("대상", "배기량 1,000cc 미만 경차"),
        ("환급 단가", f"리터당 {REFUND_PER_L}원 (휘발유·경유)"),
        ("연 한도", f"{REFUND_CAP:,}원"),
        ("한도까지 주유량", f"약 {cap_l:,}L"),
        ("일몰 예정", REFUND_SUNSET),
    ]))

    inner += para(
        f"연 {REFUND_CAP:,}원은 리터로 환산하면 <b>{cap_l:,}L</b>입니다. "
        f"한 달에 100L씩 넣는 분이라면 1년에 1,200L라 한도를 정확히 채웁니다. "
        f"그보다 적게 타시면 한도가 남고, 많이 타시면 초과분은 일반 가격으로 넣게 됩니다.")

    inner += card("놓치기 쉬운 것 세 가지", para(
        "<b>1. 전용 카드로 결제해야 합니다.</b> 유류구매 전용카드로 결제할 때만 자동 적용됩니다. "
        "일반 신용카드로 넣은 건 나중에 소급되지 않습니다.",
        "<b>2. 한도를 다 쓰면 그해는 끝입니다.</b> 매년 1월에 초기화됩니다. "
        "연말에 한도가 얼마 남았는지 확인해서, 남았다면 그 안에 채워 넣는 편이 유리합니다.",
        f"<b>3. 일몰 예정일이 있습니다.</b> 현재 {REFUND_SUNSET} 종료 예정으로, "
        "연장 여부는 그때 발표를 봐야 합니다."))

    inner += ad_slot()

    inner += f"""
    <a href="{url('/calc/light-car-refund.html')}" style="display:flex;justify-content:space-between;align-items:center;background:#FFFFFF;border:1px solid {ACCENT};box-shadow:0 0 0 3px #FDF0E4;border-radius:14px;padding:14px;">
      <span style="min-width:0;">
        <span style="display:block;font-size:13.5px;font-weight:700;color:{INK};">내 환급액 계산해보기</span>
        <span style="display:block;font-size:12px;color:#5B666A;margin-top:3px;">월 주유량만 넣으면 1년 환급액이 바로 나옵니다</span>
      </span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="{ACCENT}" stroke-width="2.5" style="flex-shrink:0;" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
    </a>"""

    inner += verify_note(
        "환급 단가와 한도는 조세특례제한법에 따른 것으로, 법 개정에 따라 바뀔 수 있습니다. "
        "신청 방법과 현재 적용 기준은 국세청 또는 카드사에 확인하세요.")

    inner += punch(
        f"연 {REFUND_CAP:,}원은 경차 운전자에게 한 달 치 기름값에 가깝습니다. "
        "신청 한 번으로 매년 자동으로 쌓입니다.")

    inner += links()
    body = wrap(inner) + note("제도 내용은 조세특례제한법 기준 · 최신 적용 여부는 국세청 확인 권장")
    return page_shell("경차 유류세 환급 - 연 30만원, 리터당 250원",
                      ACCENT, body, active="/policy/",
                      description="경차 유류세 환급 제도 정리. 리터당 250원, 연 30만원 한도, "
                                  "전용카드 결제 등 놓치기 쉬운 조건까지.")


# ── 목차 ──────────────────────────────────────────────────────────────────
ITEMS = [
    ("fuel-tax-end.html", "유류세 인하가 끝나면 얼마나 오를까",
     "지난번엔 나흘 만에 180원이 올랐습니다. 실제 가격 기록으로 확인"),
    ("light-car-refund.html", "경차 유류세 환급 연 30만원",
     "리터당 250원, 전용카드 결제 조건까지"),
]


def build_index():
    items = "".join(f"""
      <a href="{url(f"/policy/{href}")}" style="display:block;padding:15px 16px;{'border-top:1px solid #E9EEEC;' if i else ''}">
        <span style="display:block;font-size:14.5px;font-weight:700;color:{INK};line-height:1.45;">{esc(t)}</span>
        <span style="display:block;font-size:12px;color:#5B666A;margin-top:5px;line-height:1.55;">{esc(d)}</span>
      </a>""" for i, (href, t, d) in enumerate(ITEMS))

    inner = head("지원금·제도", "기름값과<br>관련된 제도들",
                 "유류세, 경차 환급처럼 주유비에 직접 영향을 주는 제도를 정리했습니다. "
                 "제도 내용은 정부 발표 기준이고, 가격이 실제로 어떻게 움직였는지는 우리 데이터로 확인합니다.")
    inner += f'<div style="background:#FFFFFF;border:1px solid #DDE3E1;border-radius:16px;overflow:hidden;">{items}</div>'
    inner += ad_slot()
    inner += verify_note(
        "화물차 유가보조금은 요율이 유류세 정책에 따라 자주 바뀌어, 정확한 현행 기준을 확인한 뒤 추가할 예정입니다. "
        "확실하지 않은 금액을 안내하지 않기 위해서입니다.")
    inner += links()
    body = wrap(inner) + note("제도 내용은 정부 발표를 확인하세요 · 가격 기록 출처 오피넷")
    return page_shell("기름값 지원금·제도 - 주유소찾기", ACCENT, body, active="/policy/",
                      description="유류세 인하 종료, 경차 유류세 환급 등 주유비에 영향을 주는 제도 정리.")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    pages = {
        "index.html": build_index(),
        "fuel-tax-end.html": build_tax_end(),
        "light-car-refund.html": build_light_car(),
    }
    for name, html in pages.items():
        with open(os.path.join(OUT_DIR, name), "w", encoding="utf-8") as f:
            f.write(html)
    print(f"{len(pages)} pages written to {OUT_DIR}")


if __name__ == "__main__":
    main()
