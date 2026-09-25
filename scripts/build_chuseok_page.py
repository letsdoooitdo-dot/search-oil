#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""추석 연휴 100원 할인 명단 페이지 (임시)
=========================================
블로그 글에서 주유소 이름을 가려두고 "명단은 사이트에" 로 보내는 구조라,
받는 쪽 페이지가 필요하다. 2026 추석 연휴(9/24~27)용 임시 페이지다.

만드는 것
  chuseok/index.html              명단 + 검색 + 내려받기
  chuseok/chuseok-exway-100.csv   엑셀로 열 CSV (파일명은 아스키로 - 한글
                                  파일명은 주소에 들어가면 인코딩이 깨진다)

원본은 build_exway_list.py 가 만든 고속도로주유소_추석할인.csv 다.
그 파일을 먼저 돌려야 한다.

임시 페이지이므로 site_nav 의 탭을 늘리지 않는다. 연휴가 끝나면 지우거나
"지난 행사" 로 남겨두면 된다.
"""

import sys as _s
try:
    _s.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import csv
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ui import page_shell, ad_slot, esc, url, display_name  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "고속도로주유소_추석할인.csv")
OUTDIR = os.path.join(ROOT, "chuseok")
CSV_NAME = "chuseok-exway-100.csv"

ACCENT = "#A54A04"
UNTIL = "9월 27일(일)"
ASOF = "2026년 9월 25일"


def won(v):
    return format(int(v), ",") if v not in ("", None) else "-"


def main():
    rows = list(csv.DictReader(open(SRC, encoding="utf-8-sig")))

    os.makedirs(OUTDIR, exist_ok=True)
    shutil.copyfile(SRC, os.path.join(OUTDIR, CSV_NAME))

    # 숫자는 화면에 적을 것만 다시 센다 - 글과 페이지가 어긋나면 안 된다.
    got = [r for r in rows if r["내린폭"] != ""]
    exact = [r for r in got if int(r["내린폭"]) == 100]
    down = [r for r in got if int(r["내린폭"]) >= 90]

    # 시도별로 묶는다. 검색으로 걸러낼 때 빈 묶음은 JS 가 접는다.
    groups = []
    for r in rows:
        if not groups or groups[-1][0] != r["시도"]:
            groups.append((r["시도"], []))
        groups[-1][1].append(r)

    blocks = []
    for sido, items in groups:
        lines = []
        for r in items:
            d = r["내린폭"]
            if d == "":
                tag = ('<span style="color:#8A9599;">기준일 값 없음</span>')
            elif int(d) == 0:
                tag = ('<span style="color:#B42318;font-weight:700;">아직 안 내림</span>')
            elif int(d) == 100:
                tag = ('<span style="color:#1B7F4B;font-weight:700;">100원 내림</span>')
            else:
                tag = ('<span style="color:#1B7F4B;font-weight:700;">%s원 내림</span>' % d)
            name = display_name(r["주유소"])
            # 검색용 문자열을 data 속성에 담는다. 화면에 안 보이는 원래 상호도
            # 넣어둬서 "대보건설" 처럼 운영사로 찾는 사람도 걸린다.
            key = "%s %s %s %s" % (name, r["주유소"], r["시도"], r["시군구"])
            lines.append(
                f'<div class="st" data-k="{esc(key)}" style="padding:11px 14px;'
                f'border-top:1px solid #E9EEEC;">'
                f'<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;">'
                f'<span style="font-size:13.5px;font-weight:700;color:#13181A;line-height:1.4;">{esc(name)}</span>'
                f'<span style="flex-shrink:0;font-size:15px;font-weight:800;color:{ACCENT};">{won(r["휘발유"])}원</span>'
                f'</div>'
                f'<div style="display:flex;justify-content:space-between;gap:8px;margin-top:3px;font-size:11.5px;color:#5B666A;">'
                f'<span>{esc(r["시군구"])} · 경유 {won(r["경유"])}원</span>{tag}</div>'
                f'</div>'
            )
        blocks.append(
            f'<div class="grp" data-sido="{esc(sido)}" '
            f'style="background:#FFFFFF;border:1px solid #DDE3E1;border-radius:14px;overflow:hidden;">'
            f'<div style="padding:10px 14px;background:#F6F8F7;">'
            f'<span style="font-size:12.5px;font-weight:800;color:#13181A;">{esc(sido)}</span>'
            f'<span class="cnt" style="font-size:11px;color:#6B7679;margin-left:6px;">{len(items)}곳</span>'
            f'</div>{"".join(lines)}</div>'
        )

    body = f"""
  <div style="padding: 16px 16px 0; display: flex; flex-direction: column; gap: 12px; flex-grow: 1;">

    <div>
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: {ACCENT};">추석 연휴 한정 · {UNTIL}까지</div>
      <h1 style="margin: 5px 0 0; font-family: 'Gothic A1', sans-serif; font-size: 23px; font-weight: 900;
                 letter-spacing: -0.025em; color: #13181A; line-height: 1.32;">100원 내린 고속도로<br>주유소 {len(rows)}곳 명단</h1>
      <p style="margin: 10px 0 0; font-size: 13.5px; line-height: 1.7; color: #4A5558;">
        한국도로공사가 9월 17일 판매가 대비 리터당 100원 낮춰 파는 곳입니다.
        발표만 받아 적지 않고, 9월 17일 값과 오늘 값을 한 곳씩 맞춰
        <b>실제로 내렸는지 확인한</b> 명단입니다.</p>
    </div>

    <div style="display:flex;gap:8px;">
      <div style="flex:1;background:#FFFFFF;border:1px solid #DDE3E1;border-radius:14px;padding:12px 10px;text-align:center;">
        <div style="font-family:'Gothic A1',sans-serif;font-size:21px;font-weight:900;color:#1B7F4B;">{len(exact)}곳</div>
        <div style="font-size:11px;color:#5B666A;margin-top:2px;line-height:1.4;">정확히<br>100원 내림</div>
      </div>
      <div style="flex:1;background:#FFFFFF;border:1px solid #DDE3E1;border-radius:14px;padding:12px 10px;text-align:center;">
        <div style="font-family:'Gothic A1',sans-serif;font-size:21px;font-weight:900;color:#13181A;">{len(down)}곳</div>
        <div style="font-size:11px;color:#5B666A;margin-top:2px;line-height:1.4;">90원 이상<br>내림</div>
      </div>
      <div style="flex:1;background:#FFFFFF;border:1px solid #DDE3E1;border-radius:14px;padding:12px 10px;text-align:center;">
        <div style="font-family:'Gothic A1',sans-serif;font-size:21px;font-weight:900;color:#13181A;">112원</div>
        <div style="font-size:11px;color:#5B666A;margin-top:2px;line-height:1.4;">전국 평균보다<br>싼 폭</div>
      </div>
    </div>

    <a href="{CSV_NAME}" download
       style="display:flex;justify-content:space-between;align-items:center;background:{ACCENT};
              border-radius:14px;padding:15px 16px;">
      <span>
        <span style="display:block;font-size:14px;font-weight:800;color:#FFFFFF;">명단 전체 내려받기 (엑셀)</span>
        <span style="display:block;font-size:11.5px;color:#FFE4CC;margin-top:3px;">{len(rows)}곳 · 가격·인하폭 포함 · CSV</span>
      </span>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4"
           stroke-linecap="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"></path></svg>
    </a>

    <div>
      <input id="q" type="search" placeholder="주유소·지역 검색 (예: 추풍령, 남원)"
             autocomplete="off"
             style="width:100%;box-sizing:border-box;padding:12px 14px;font-size:13.5px;
                    font-family:inherit;color:#13181A;background:#FFFFFF;
                    border:1px solid #DDE3E1;border-radius:12px;outline:none;">
      <div id="hit" style="font-size:11.5px;color:#6B7679;margin-top:6px;"></div>
    </div>

{ad_slot()}

    <div id="list" style="display:flex;flex-direction:column;gap:10px;">
{"".join(blocks)}
    </div>

    <div style="background:#FFF7ED;border:1px solid #F0D5B4;border-radius:14px;padding:13px 14px;">
      <div style="font-size:12.5px;font-weight:800;color:#8A3D03;margin-bottom:6px;">넣기 전에 한 번 보세요</div>
      <p style="margin:0;font-size:12px;line-height:1.65;color:#5B4530;">
        <b>100원 내렸어도 비싼 곳이 있습니다.</b> 원래 비쌌던 곳은 내려도 비쌉니다.
        전국 평균이 1,856원이니, 위 명단에서 1,850원이 넘는 곳은 동네 주유소와
        비슷하거나 더 비쌉니다. 휴게소라고 무조건 넣지 마시고 값을 보고 넣으세요.<br><br>
        <b>민자 고속도로 휴게소는 빠집니다.</b> 도로공사가 운영하는 재정고속도로
        주유소만 해당합니다.<br><br>
        <b>{UNTIL}까지입니다.</b> 28일부터는 원래 값으로 돌아갑니다.
      </p>
    </div>

    <a href="{url('/')}" style="display: flex; justify-content: space-between; align-items: center;
       background: #13181A; border-radius: 14px; padding: 14px;">
      <span>
        <span style="display:block;font-size:13px;font-weight:700;color:#FFFFFF;">내 경로에서 진짜 이득인 곳 찾기</span>
        <span style="display:block;font-size:11px;color:#9AA5A8;margin-top:2px;">거기까지 가는 기름값까지 빼고 계산합니다</span>
      </span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5"
           aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
    </a>

    <p style="margin:0 0 16px;font-size:11px;line-height:1.6;color:#8A9599;">
      가격 {ASOF} 기준 · 비교 2026년 9월 17일(정부 발표 기준일) · 출처 오피넷<br>
      도로공사는 226곳이라고만 발표하고 이름 목록은 공개하지 않았습니다. 이 명단은
      오피넷에 고속도로 주유소(알뜰 EX)로 등록된 {len(rows)}곳을 추린 것이라 실제
      대상과 몇 곳 차이가 있을 수 있습니다. 출발 전에 한 번 더 확인하세요.
    </p>
  </div>

<script>
// 검색 - 줄은 이미 다 그려져 있고 보이기만 끈다.
// 자바스크립트가 막혀도 명단은 그대로 보인다.
(function () {{
  var q = document.getElementById('q');
  var hit = document.getElementById('hit');
  var grps = [].slice.call(document.querySelectorAll('.grp'));
  var total = document.querySelectorAll('.st').length;
  function run() {{
    var v = q.value.trim().toLowerCase();
    var n = 0;
    grps.forEach(function (g) {{
      var on = 0;
      [].slice.call(g.querySelectorAll('.st')).forEach(function (s) {{
        var m = !v || s.getAttribute('data-k').toLowerCase().indexOf(v) >= 0;
        s.style.display = m ? '' : 'none';
        if (m) {{ on++; n++; }}
      }});
      g.style.display = on ? '' : 'none';
      var c = g.querySelector('.cnt');
      if (c) c.textContent = on + '곳';
    }});
    hit.textContent = v ? (n ? n + '곳 찾았습니다' : '찾는 주유소가 없습니다') : '';
  }}
  q.addEventListener('input', run);
}})();
</script>"""

    html = page_shell(
        title="추석 100원 할인 고속도로 주유소 %d곳 명단 | 다따져 주유소찾기" % len(rows),
        accent=ACCENT,
        body_inner=body,
        active="/",
        description=("추석 연휴 고속도로 주유소 100원 할인 대상 %d곳 명단. "
                     "9월 17일 값과 하나씩 맞춰 실제로 내렸는지 확인했습니다. "
                     "%s 기준, 엑셀 내려받기." % (len(rows), ASOF)),
    )
    p = os.path.join(OUTDIR, "index.html")
    with open(p, "w", encoding="utf-8") as f:
        f.write(html)

    print("명단 %d곳 (정확히 100원 %d / 90원 이상 %d)"
          % (len(rows), len(exact), len(down)))
    print(p)
    print(os.path.join(OUTDIR, CSV_NAME))


if __name__ == "__main__":
    main()
