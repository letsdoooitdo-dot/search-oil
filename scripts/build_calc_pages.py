#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
계산기 (/calc/)
================
체류시간이 가장 긴 페이지 유형. 입력하고 결과를 보는 동안 광고 노출 시간이 늘고,
재방문도 붙는다.

다른 사이트 계산기와의 차이는 '비교 기준'이다. 우리는 10,298곳 실측이 있어서
"당신은 연 OOO원 씁니다"에서 끝내지 않고 "셀프로 바꾸면 OO원, 싼 동네면 OO원"까지
말할 수 있다.

  fuel-cost.html          연간 주유비
  light-car-refund.html   경차 유류세 환급
  detour-breakeven.html   우회 손익분기 (route_gain 엔진을 그대로 콘텐츠화)

※ 화물차 유가보조금 계산기는 뺐다. 보조금 요율이 유류세 정책에 따라 바뀌는데
  정확한 현행 요율을 확인하지 못했다. 금액을 틀리게 보여주면 신뢰를 잃는다.
  요율 확인 후 추가할 것.

표준 라이브러리만 사용.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import figures
from ui import esc, ad_slot, page_shell, url

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "calc")
ACCENT = "#A54A04"

# 기준값을 박아두지 않는다. 가격이 갱신되면 계산기도 따라 갱신돼야 한다.
_S = figures.snapshot()
PRICE_DATE = _S["date"]
GAS_MEDIAN = round(_S["gas"]["median"])
GAS_LOW = round(_S["gas"]["low"])
DIESEL_MEDIAN = round(_S["diesel"]["median"])
SELF_MEDIAN = round(_S["self_full"]["self"]["median"])
FULL_MEDIAN = round(_S["self_full"]["full"]["median"])
REGION_CHEAP = (round(_S["region_cheap"]["median"]), _S["region_cheap"]["region"])
REGION_PRICEY = (round(_S["region_pricey"]["median"]), _S["region_pricey"]["region"])

# 경차 유류세 환급 (조세특례제한법). 2026-12-31 일몰.
REFUND_PER_L = 250
REFUND_CAP = 300_000


def field(label, fid, value, unit, hint=""):
    hint_html = (f'<div style="font-size: 11px; color: #8A9599; margin-top: 4px;">{esc(hint)}</div>'
                 if hint else "")
    return f"""
        <div style="margin-bottom: 13px;">
          <label for="{fid}" style="display: block; font-size: 12.5px; font-weight: 600; color: #4A5558; margin-bottom: 6px;">{esc(label)}</label>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input id="{fid}" type="number" inputmode="decimal" value="{value}"
              style="flex-grow: 1; min-width: 0; padding: 11px 12px; font-family: inherit; font-size: 15px; font-weight: 600;
                     color: #13181A; background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 11px;">
            <span style="flex-shrink: 0; font-size: 12.5px; color: #5B666A;">{esc(unit)}</span>
          </div>
          {hint_html}
        </div>"""


def result_card(label, rid, sub_id):
    return f"""
    <div style="background: #FFFFFF; border: 1px solid {ACCENT}; box-shadow: 0 0 0 3px #FDF0E4; border-radius: 16px; padding: 18px 16px;">
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: {ACCENT};">{esc(label)}</div>
      <div id="{rid}" style="font-family: 'Gothic A1', sans-serif; font-size: 34px; font-weight: 900; letter-spacing: -0.03em; color: #13181A; line-height: 1.15; margin-top: 6px;">-</div>
      <p id="{sub_id}" style="margin: 9px 0 0; font-size: 12.5px; line-height: 1.6; color: #4A5558;"></p>
    </div>"""


def head_block(kicker, title, lead):
    return f"""
    <div>
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: {ACCENT};">{esc(kicker)}</div>
      <h1 style="margin: 5px 0 0; font-family: 'Gothic A1', sans-serif; font-size: 23px; font-weight: 900; letter-spacing: -0.025em; color: #13181A; line-height: 1.3;">{title}</h1>
      <p style="margin: 9px 0 0; font-size: 13px; line-height: 1.65; color: #4A5558;">{lead}</p>
    </div>"""


def back_links():
    return f"""
    <a href="{url('/')}" style="display: flex; justify-content: space-between; align-items: center; background: #13181A; border-radius: 14px; padding: 14px;">
      <span style="font-size: 13px; font-weight: 700; color: #FFFFFF;">내 경로에서 진짜 이득인 곳 찾기</span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
    </a>
    <a href="{url('/calc/')}" style="display: flex; justify-content: space-between; align-items: center; background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 14px; padding: 12px 14px;">
      <span style="font-size: 12.5px; color: #4A5558;">다른 계산기 보기</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5B666A" stroke-width="2.5" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
    </a>"""


def note(text):
    return f"""
  <div style="padding: 12px 16px 18px;">
    <p style="margin: 0; font-size: 11px; color: #5B666A; line-height: 1.55;">{text}</p>
  </div>"""


def wrap(inner, script):
    return f"""
  <div style="padding: 16px 16px 0; display: flex; flex-direction: column; gap: 11px; flex-grow: 1;">
{inner}
  </div>
<script>
{script}
</script>"""


# ── 1. 연간 주유비 ─────────────────────────────────────────────────────────
FUEL_COST_JS = """
var $ = function (id) { return document.getElementById(id); };
var won = function (n) { return Math.round(n).toLocaleString('ko-KR'); };
var GAS = %d, DIESEL = %d, SELF = %d, FULL = %d, CHEAP = %d, PRICEY = %d;

function calc() {
  var km = parseFloat($('km').value) || 0;
  var kmpl = parseFloat($('kmpl').value) || 0;
  var fuel = $('fuel').value;
  if (kmpl <= 0) { $('out').textContent = '-'; $('sub').textContent = '연비를 입력해주세요.'; return; }

  var base = (fuel === 'diesel') ? DIESEL : GAS;
  var liters = (km * 12) / kmpl;
  var year = liters * base;

  $('out').textContent = won(year) + '원';
  $('sub').innerHTML = '1년에 약 <b>' + won(liters) + 'L</b>를 넣게 됩니다 (월 ' +
    won(km / kmpl) + 'L). 오늘 전국 중앙값 ' + won(base) + '원 기준입니다.';

  if (fuel === 'gasoline') {
    $('selfSave').textContent = won(liters * (FULL - SELF)) + '원';
    $('regionSave').textContent = won(liters * (PRICEY - CHEAP)) + '원';
    $('compare').style.display = '';
  } else {
    $('compare').style.display = 'none';
  }
}
['km', 'kmpl', 'fuel'].forEach(function (id) {
  $(id).addEventListener('input', calc);
  $(id).addEventListener('change', calc);
});
calc();
""" % (GAS_MEDIAN, DIESEL_MEDIAN, SELF_MEDIAN, FULL_MEDIAN, REGION_CHEAP[0], REGION_PRICEY[0])


def build_fuel_cost():
    inner = head_block(
        "계산기",
        "1년에 기름값으로<br>얼마나 쓰고 계신가요",
        "한 달 주행거리와 연비만 넣으면 연간 주유비가 나옵니다. "
        "전국 10,298곳 실제 판매가를 기준으로 계산합니다.")

    inner += f"""
    <div style="background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 16px; padding: 16px;">
      {field("한 달 주행거리", "km", 1200, "km", "출퇴근 왕복 20km × 22일이면 약 440km입니다")}
      {field("연비", "kmpl", 12, "km/L", "모르시면 일반 승용차 12, 경차 16, SUV 8 정도로 넣으세요")}
      <div>
        <label for="fuel" style="display: block; font-size: 12.5px; font-weight: 600; color: #4A5558; margin-bottom: 6px;">유종</label>
        <select id="fuel" style="width: 100%; padding: 11px 12px; font-family: inherit; font-size: 15px; font-weight: 600; color: #13181A; background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 11px;">
          <option value="gasoline">휘발유</option>
          <option value="diesel">경유</option>
        </select>
      </div>
    </div>

    {result_card("연간 주유비", "out", "sub")}

    {ad_slot()}

    <div id="compare" style="background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 16px; padding: 16px;">
      <div style="font-family: 'Gothic A1', sans-serif; font-size: 17px; font-weight: 900; color: #13181A;">어디서 넣느냐로 갈리는 돈</div>
      <p style="margin: 7px 0 12px; font-size: 12.5px; line-height: 1.6; color: #4A5558;">
        같은 거리를 달려도 주유소를 어떻게 고르느냐에 따라 1년 치가 이만큼 달라집니다.
      </p>
      <div style="border: 1px solid #E9EEEC; border-radius: 11px; overflow: hidden;">
        <div style="display: flex; justify-content: space-between; padding: 10px 12px; font-size: 12.5px; border-bottom: 1px solid #E9EEEC;">
          <span style="color: #5B666A;">셀프로만 넣으면 (39원 저렴)</span>
          <span id="selfSave" style="font-weight: 700; color: {ACCENT};">-</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 12px; font-size: 12.5px; background: #F5F7F6;">
          <span style="color: #5B666A;">가장 싼 동네 vs 비싼 동네</span>
          <span id="regionSave" style="font-weight: 700; color: {ACCENT};">-</span>
        </div>
      </div>
      <p style="margin: 11px 0 0; font-size: 12px; line-height: 1.6; color: #6B7679;">
        오늘 시군구 중앙값은 {REGION_CHEAP[1]} {REGION_CHEAP[0]:,}원이 가장 낮고 {REGION_PRICEY[1]} {REGION_PRICEY[0]:,}원이 가장 높습니다.
        사는 동네를 바꿀 수는 없지만, <b style="color: #13181A;">가는 길에 있는 싼 곳</b>은 고를 수 있습니다.
      </p>
    </div>

    {back_links()}"""

    body = wrap(inner, FUEL_COST_JS) + note(
        f"{PRICE_DATE[:4]}년 {int(PRICE_DATE[5:7])}월 {int(PRICE_DATE[8:10])}일 실제 판매가 기준 "
        f"(휘발유 중앙값 {GAS_MEDIAN:,}원, 경유 {DIESEL_MEDIAN:,}원) · 출처 오피넷 · "
        f"실제 주유비는 운전 습관·유가 변동에 따라 달라집니다")
    return page_shell("연간 주유비 계산기 - 주유소찾기", ACCENT, body, active="/calc/",
                      description="한 달 주행거리와 연비로 연간 주유비를 계산합니다. "
                                  "전국 1만 곳 실제 판매가 기준, 셀프·지역별 차이까지 비교합니다.")


# ── 2. 경차 유류세 환급 ────────────────────────────────────────────────────
REFUND_JS = """
var $ = function (id) { return document.getElementById(id); };
var won = function (n) { return Math.round(n).toLocaleString('ko-KR'); };
var RATE = %d, CAP = %d, CAP_L = %d;

function calc() {
  var monthly = parseFloat($('monthly').value) || 0;
  var yearL = monthly * 12;
  var refund = Math.min(yearL * RATE, CAP);

  $('out').textContent = won(refund) + '원';

  if (yearL <= 0) {
    $('sub').textContent = '월 주유량을 입력해주세요.';
  } else if (yearL * RATE >= CAP) {
    var months = CAP_L / monthly;
    $('sub').innerHTML = '연 한도 <b>30만원</b>을 채웁니다. 약 <b>' + months.toFixed(1) +
      '개월</b>이면 한도에 도달하고, 그 뒤 주유분은 환급되지 않습니다.';
  } else {
    var left = CAP - yearL * RATE;
    $('sub').innerHTML = '1년에 <b>' + won(yearL) + 'L</b>를 넣으시는 기준입니다. ' +
      '한도까지 <b>' + won(left) + '원</b>이 남아, 더 넣으셔도 전액 환급 대상입니다.';
  }
  $('capL').textContent = won(CAP_L) + 'L';
}
$('monthly').addEventListener('input', calc);
calc();
""" % (REFUND_PER_L, REFUND_CAP, REFUND_CAP // REFUND_PER_L)


def build_refund():
    cap_l = REFUND_CAP // REFUND_PER_L
    inner = head_block(
        "계산기",
        "경차 유류세<br>얼마나 돌려받나요",
        "배기량 1,000cc 미만 경차는 유류세 일부를 환급받습니다. "
        "월 주유량만 넣으면 1년에 얼마를 돌려받는지 바로 나옵니다.")

    inner += f"""
    <div style="background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 16px; padding: 16px;">
      {field("한 달 주유량", "monthly", 40, "L", "월 주유비를 오늘 중앙값으로 나누면 대략 나옵니다")}
    </div>

    {result_card("연간 환급액", "out", "sub")}

    {ad_slot()}

    <div style="background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 16px; padding: 16px;">
      <div style="font-family: 'Gothic A1', sans-serif; font-size: 17px; font-weight: 900; color: #13181A;">알아두실 것</div>
      <div style="margin-top: 11px; border: 1px solid #E9EEEC; border-radius: 11px; overflow: hidden;">
        <div style="display: flex; justify-content: space-between; padding: 10px 12px; font-size: 12.5px; border-bottom: 1px solid #E9EEEC;">
          <span style="color: #5B666A;">환급 단가</span><span style="font-weight: 600; color: #13181A;">리터당 {REFUND_PER_L}원</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 12px; font-size: 12.5px; border-bottom: 1px solid #E9EEEC;">
          <span style="color: #5B666A;">연 한도</span><span style="font-weight: 600; color: #13181A;">{REFUND_CAP:,}원</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 12px; font-size: 12.5px; background: #F5F7F6;">
          <span style="color: #5B666A;">한도까지 주유량</span><span id="capL" style="font-weight: 700; color: {ACCENT};">{cap_l:,}L</span>
        </div>
      </div>
      <p style="margin: 12px 0 0; font-size: 12.5px; line-height: 1.65; color: #4A5558;">
        한도를 다 쓰면 그해 남은 기간은 일반 가격으로 넣게 됩니다. 한도가 얼마 안 남았다면
        <b style="color: #13181A;">남은 한도만큼만 넣고</b> 나머지는 다음 해로 넘기는 편이 유리합니다.
        한도는 매년 1월에 초기화됩니다.
      </p>
      <p style="margin: 10px 0 0; font-size: 12.5px; line-height: 1.65; color: #4A5558;">
        환급은 전용 유류구매카드로 결제해야 자동 적용됩니다. 일반 카드로 결제하면 소급이 안 됩니다.
      </p>
    </div>

    {back_links()}"""

    body = wrap(inner, REFUND_JS) + note(
        "조세특례제한법상 경차 유류세 환급 기준 (휘발유·경유 리터당 250원, 연 30만원 한도). "
        "현재 2026년 12월 31일 일몰 예정이며 연장 여부는 정부 발표를 확인하세요. "
        "실제 환급액은 카드사·국세청 처리 기준에 따라 달라질 수 있습니다.")
    return page_shell("경차 유류세 환급 계산기 - 주유소찾기", ACCENT, body, active="/calc/",
                      description="경차 유류세 환급액을 월 주유량으로 계산합니다. "
                                  "리터당 250원, 연 30만원 한도 기준.")


# ── 3. 우회 손익분기 ───────────────────────────────────────────────────────
BREAKEVEN_JS = """
var $ = function (id) { return document.getElementById(id); };
var won = function (n) { return Math.round(n).toLocaleString('ko-KR'); };

function calc() {
  var gap = parseFloat($('gap').value) || 0;
  var liters = parseFloat($('liters').value) || 0;
  var kmpl = parseFloat($('kmpl').value) || 0;
  var price = parseFloat($('price').value) || 0;

  if (gap <= 0 || kmpl <= 0 || price <= 0) {
    $('out').textContent = '-';
    $('sub').textContent = '값을 모두 입력해주세요.';
    return;
  }
  var perKm = price / kmpl;
  var km = (gap * liters) / perKm;

  $('out').textContent = km.toFixed(1) + 'km';
  $('sub').innerHTML = '리터당 <b>' + won(gap) + '원</b> 싼 곳에 <b>' + won(liters) +
    'L</b>를 넣는다면, <b>' + km.toFixed(1) + 'km</b>까지 돌아가도 본전입니다. ' +
    '이보다 멀면 아낀 돈보다 쓴 기름값이 큽니다.';

  $('save').textContent = won(gap * liters) + '원';
  $('cost').textContent = won(perKm) + '원';
}
['gap', 'liters', 'kmpl', 'price'].forEach(function (id) {
  $(id).addEventListener('input', calc);
});
calc();
"""


def build_breakeven():
    inner = head_block(
        "계산기",
        "저기가 더 싼데,<br>돌아갈 가치가 있을까요",
        "싼 주유소를 찾아 돌아가면 그만큼 기름을 더 씁니다. "
        "몇 km까지 돌아가야 본전인지 계산합니다. 이 서비스가 쓰는 것과 같은 공식입니다.")

    inner += f"""
    <div style="background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 16px; padding: 16px;">
      {field("리터당 가격 차이", "gap", 50, "원", "거기가 여기보다 얼마나 싼가요")}
      {field("넣을 양", "liters", 30, "L", "")}
      {field("연비", "kmpl", 12, "km/L", "")}
      {field("기름값", "price", GAS_MEDIAN, "원/L", "오늘 전국 중앙값을 넣어뒀습니다")}
    </div>

    {result_card("여기까지는 돌아가도 본전", "out", "sub")}

    {ad_slot()}

    <div style="background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 16px; padding: 16px;">
      <div style="font-family: 'Gothic A1', sans-serif; font-size: 17px; font-weight: 900; color: #13181A;">계산 근거</div>
      <div style="margin-top: 11px; border: 1px solid #E9EEEC; border-radius: 11px; overflow: hidden;">
        <div style="display: flex; justify-content: space-between; padding: 10px 12px; font-size: 12.5px; border-bottom: 1px solid #E9EEEC;">
          <span style="color: #5B666A;">싸게 넣어서 아끼는 돈</span><span id="save" style="font-weight: 600; color: #13181A;">-</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 12px; font-size: 12.5px; background: #F5F7F6;">
          <span style="color: #5B666A;">1km 더 달리는 비용</span><span id="cost" style="font-weight: 700; color: {ACCENT};">-</span>
        </div>
      </div>
      <p style="margin: 12px 0 0; font-size: 12.5px; line-height: 1.65; color: #4A5558;">
        여기서 말하는 거리는 <b style="color: #13181A;">왕복이 아니라 우회분</b>입니다.
        가던 길에서 벗어났다가 다시 돌아오는 데 추가로 드는 거리만 셉니다.
      </p>
      <p style="margin: 10px 0 0; font-size: 12.5px; line-height: 1.65; color: #4A5558;">
        실제로는 계산상 본전이어도 시간과 수고가 듭니다. 그래서 이 서비스는
        <b style="color: #13181A;">500원 이상 남을 때만</b> 돌아가라고 말합니다.
      </p>
    </div>

    {back_links()}"""

    body = wrap(inner, BREAKEVEN_JS) + note(
        "우회 1km 비용 = 기름값 ÷ 연비. 실제 도로는 직선보다 길어 약 1.3배로 봅니다. "
        "신호·정체에 따른 시간 비용은 계산에 넣지 않았습니다.")
    return page_shell("주유소 우회 손익분기 계산기 - 주유소찾기", ACCENT, body, active="/calc/",
                      description="싼 주유소까지 몇 km 돌아가면 본전인지 계산합니다. "
                                  "가격차·주유량·연비로 손익분기 거리를 구합니다.")


# ── 목차 ──────────────────────────────────────────────────────────────────
CALCS = [
    ("연간 주유비", "fuel-cost.html", "한 달 주행거리와 연비로 1년 기름값을 계산합니다"),
    ("경차 유류세 환급", "light-car-refund.html", "리터당 250원, 연 30만원 한도로 얼마를 돌려받는지"),
    ("우회 손익분기", "detour-breakeven.html", "싼 주유소까지 몇 km 돌아가면 본전인지"),
]


def build_index():
    items = "".join(f"""
      <a href="{url(f"/calc/{href}")}" style="display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 14px 16px; {'border-top: 1px solid #E9EEEC;' if i else ''}">
        <span style="min-width: 0;">
          <span style="display: block; font-size: 14px; font-weight: 700; color: #13181A;">{esc(name)}</span>
          <span style="display: block; font-size: 12px; color: #5B666A; margin-top: 3px; line-height: 1.5;">{esc(desc)}</span>
        </span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5B666A" stroke-width="2.5" style="flex-shrink: 0;" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
      </a>""" for i, (name, href, desc) in enumerate(CALCS))

    inner = head_block(
        "계산기",
        "기름값 계산기",
        "전국 10,298곳 실제 판매가를 기준으로 계산합니다. "
        "일반적인 평균치가 아니라 오늘 실제로 팔리는 가격입니다.")
    inner += f"""
    <div style="background: #FFFFFF; border: 1px solid #DDE3E1; border-radius: 16px; overflow: hidden;">
      {items}
    </div>

    {ad_slot()}

    {back_links()}"""

    body = wrap(inner, "") + note(
        f"{PRICE_DATE[:4]}년 {int(PRICE_DATE[5:7])}월 {int(PRICE_DATE[8:10])}일 실제 판매가 기준 · 출처 오피넷")
    return page_shell("기름값 계산기 - 주유소찾기", ACCENT, body, active="/calc/",
                      description="연간 주유비, 경차 유류세 환급, 우회 손익분기를 "
                                  "전국 1만 곳 실제 판매가로 계산합니다.")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    pages = {
        "index.html": build_index(),
        "fuel-cost.html": build_fuel_cost(),
        "light-car-refund.html": build_refund(),
        "detour-breakeven.html": build_breakeven(),
    }
    for name, html in pages.items():
        with open(os.path.join(OUT_DIR, name), "w", encoding="utf-8") as f:
            f.write(html)
    print(f"{len(pages)}개 페이지 작성")
    print(f"경로: {OUT_DIR}")


if __name__ == "__main__":
    main()
