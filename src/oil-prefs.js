/* 주유소찾기 - 내 설정 (유종·차종·우리 동네)

   원칙: 아무것도 안 골라도 화면이 돌아간다. 고를수록 정확해진다.
   저장은 브라우저가 한다(로그인·서버 없음). 기록을 지우면 초기화된다.
*/
(function () {
  'use strict';

  var OIL = window.OIL;
  if (!OIL) return;

  var KEY = 'oil.prefs';

  /* 차종별 기본값 - 파이썬 fill_amount.VEHICLE 과 같은 값 */
  var VEHICLE = {
    '경차':   { kmpl: 16, tank: 35, usual: 25, label: '경차' },
    '일반':   { kmpl: 12, tank: 60, usual: 30, label: '일반 승용차' },
    'SUV':    { kmpl: 8,  tank: 80, usual: 60, label: 'SUV' },
    '화물':   { kmpl: 9,  tank: 60, usual: 50, label: '화물차' }
  };
  var VEHICLE_ORDER = ['경차', '일반', 'SUV', '화물'];
  var FUELS = { g: '휘발유', d: '경유' };

  var DEFAULTS = { fuel: 'g', vehicle: '일반', home: '', work: '', last: '', visits: 0 };

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return (o && typeof o === 'object') ? o : null;
    } catch (e) { return null; }   /* 사생활 보호 모드 등 - 기본값으로 간다 */
  }

  function write(o) {
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* 저장 못해도 동작은 한다 */ }
  }

  var saved = read();
  var isFirst = !saved;
  var state = {};
  for (var k in DEFAULTS) state[k] = (saved && saved[k] != null) ? saved[k] : DEFAULTS[k];
  if (!VEHICLE[state.vehicle]) state.vehicle = '일반';
  if (!FUELS[state.fuel]) state.fuel = 'g';

  state.visits = (state.visits || 0) + 1;
  write(state);

  var P = OIL.prefs = {
    VEHICLE: VEHICLE,
    FUELS: FUELS,
    isFirstVisit: isFirst,
    get: function (k) { return k ? state[k] : state; },
    set: function (k, v) { state[k] = v; write(state); },
    car: function () { return VEHICLE[state.vehicle] || VEHICLE['일반']; },
    fuelName: function () { return FUELS[state.fuel]; },
    /* 동네 요약에서 현재 유종의 통계를 꺼낸다 */
    pick: function (region) { return region ? region[state.fuel] : null; }
  };

  /* ── 설정 바 ─────────────────────────────────────────────
     첫 방문이면 펼쳐서 보여주고, 재방문이면 한 줄로 접는다. */
  P.barHtml = function (opts) {
    opts = opts || {};
    var open = opts.open != null ? opts.open : isFirst;
    var regionName = opts.regionName || '';

    var fuelBtns = Object.keys(FUELS).map(function (f) {
      return '<button type="button" class="oil-chip' + (state.fuel === f ? ' active' : '') +
        '" data-pref="fuel" data-val="' + f + '">' + FUELS[f] + '</button>';
    }).join('');

    var carBtns = VEHICLE_ORDER.map(function (v) {
      return '<button type="button" class="oil-chip' + (state.vehicle === v ? ' active' : '') +
        '" data-pref="vehicle" data-val="' + v + '">' + VEHICLE[v].label + '</button>';
    }).join('');

    var summary = FUELS[state.fuel] + ' · ' + P.car().label +
      (regionName ? ' · ' + regionName : '');

    return '<div class="oil-prefs' + (open ? ' is-open' : '') + '" id="oil-prefs">' +
      '<button type="button" class="oil-prefs-sum" id="oil-prefs-toggle">' +
        '<span class="oil-prefs-sum-t">' + OIL.esc(summary) + '</span>' +
        '<span class="oil-prefs-sum-a">변경</span>' +
      '</button>' +
      '<div class="oil-prefs-body">' +
        '<div class="oil-prefs-row"><span class="oil-prefs-k">유종</span>' +
          '<div class="oil-sido-tabs">' + fuelBtns + '</div></div>' +
        '<div class="oil-prefs-row"><span class="oil-prefs-k">차종</span>' +
          '<div class="oil-sido-tabs">' + carBtns + '</div></div>' +
        '<div class="oil-prefs-hint">차종을 고르면 연비 ' + P.car().kmpl +
          'km/L, 1회 주유 ' + P.car().usual + 'L 로 계산합니다</div>' +
      '</div></div>';
  };

  /* 설정 바 동작 연결. onChange 로 다시 그리게 한다. */
  P.wireBar = function (onChange) {
    var box = document.getElementById('oil-prefs');
    if (!box) return;
    var toggle = document.getElementById('oil-prefs-toggle');
    if (toggle) {
      toggle.addEventListener('click', function () { box.classList.toggle('is-open'); });
    }
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pref]');
      if (!b) return;
      var key = b.getAttribute('data-pref');
      P.set(key, b.getAttribute('data-val'));
      if (onChange) onChange(key);
    });
  };

  /* ── 내 위치 ─────────────────────────────────────────────
     휴대폰이 알려준 좌표에서 가장 가까운 동네를 고른다.
     주소는 알 수 없고 알 필요도 없다 - 시군구까지면 충분하다. */
  function distKm(a, b, c, d) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (c - a) * rad, dLng = (d - b) * rad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  P.nearest = function (lat, lng, items) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < items.length; i++) {
      var r = items[i];
      if (r.la == null) continue;
      var d = distKm(lat, lng, r.la, r.ln);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best ? { region: best, km: bestD } : null;
  };

  /* onDone(결과, 오류메시지) */
  P.locate = function (onDone) {
    if (!navigator.geolocation) {
      onDone(null, '이 브라우저는 위치 기능을 지원하지 않습니다.');
      return;
    }
    navigator.geolocation.getCurrentPosition(function (pos) {
      OIL.regions().then(function (reg) {
        var hit = P.nearest(pos.coords.latitude, pos.coords.longitude, reg.items);
        if (!hit) { onDone(null, '가까운 동네를 찾지 못했습니다.'); return; }
        onDone(hit, null);
      }).catch(function () { onDone(null, '데이터를 불러오지 못했습니다.'); });
    }, function (err) {
      var msg = '위치를 가져오지 못했습니다.';
      if (err && err.code === 1) msg = '위치 권한이 거부되었습니다. 아래에서 직접 선택해주세요.';
      else if (err && err.code === 3) msg = '위치 확인이 오래 걸립니다. 아래에서 직접 선택해주세요.';
      onDone(null, msg);
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
  };

  P.locateBtnHtml = function () {
    return '<button type="button" class="oil-locate" id="oil-locate">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle>' +
      '<path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></svg>' +
      '<span>내 위치로 우리 동네 찾기</span></button>' +
      '<div class="oil-locate-msg" id="oil-locate-msg"></div>';
  };

  P.wireLocate = function () {
    var btn = document.getElementById('oil-locate');
    var msg = document.getElementById('oil-locate-msg');
    if (!btn) return;
    btn.addEventListener('click', function () {
      btn.disabled = true;
      msg.textContent = '위치를 확인하는 중...';
      P.locate(function (hit, err) {
        if (err) { btn.disabled = false; msg.textContent = err; return; }
        msg.textContent = hit.region.r + '(으)로 이동합니다';
        P.set('last', hit.region.sl);
        location.href = OIL.areaUrl(hit.region.sl);
      });
    });
  };
})();
