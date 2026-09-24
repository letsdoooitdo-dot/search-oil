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

  /* radius - 주변 주유소를 몇 km 안에서 찾을지. 사용자가 직접 고른다. 도로거리 기준.
     10km 까지인 이유: 카카오 다중 목적지 길찾기가 반경 10km 를 넘지 못한다.
     그리고 20km 떨어진 집은 리터당 100원이 싸도 오가는 기름값이 더 커서
     어차피 이득이 날 수가 없다 - 빼도 잃는 게 없다. */
  var RADIUS = [1, 2, 3, 5, 7, 10];

  /* 편도 - 주유하고 가던 길을 계속 간다 (대부분 이쪽)
     왕복 - 주유만 하러 나갔다가 제자리로 돌아온다 */
  var TRIPS = { one: '편도', round: '왕복' };

  /* 목적지 모드에서만 쓴다.
     range  - 지금 기름으로 더 갈 수 있는 거리. 이 구간 안에서만 찾는다.
              긴 여정 전체를 뒤지면 주유소가 수천 곳이라 쓸 수도, 받을 수도 없다.
     detour - 가는 길에서 얼마나 벗어날 용의가 있는지 */
  var RANGE = [10, 20, 30, 50, 100];
  var DETOUR = [1, 2, 3, 5];

  var DEFAULTS = { fuel: 'g', vehicle: '일반', radius: 5, trip: 'one',
                   range: 30, detour: 2,
                   home: '', work: '', last: '', spot: '', visits: 0 };

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
  if (RADIUS.indexOf(state.radius) < 0) state.radius = 5;
  if (!TRIPS[state.trip]) state.trip = 'one';
  if (RANGE.indexOf(state.range) < 0) state.range = 30;
  if (DETOUR.indexOf(state.detour) < 0) state.detour = 2;

  state.visits = (state.visits || 0) + 1;
  write(state);

  var P = OIL.prefs = {
    VEHICLE: VEHICLE,
    FUELS: FUELS,
    RADIUS: RADIUS,
    TRIPS: TRIPS,
    isRound: function () { return state.trip === 'round'; },
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

    /* fixed - 접는 기능 없이 항상 펼쳐둔다.
       계산기 화면에서는 유종·차종을 바꾸는 게 계산의 일부라, 접혀 있으면
       무엇을 고를 수 있는지조차 모르고 지나친다. */
    var fixed = !!opts.fixed;

    /* noCar - 차종 줄을 뺀다. 그 화면의 숫자가 차종과 아무 상관이 없을 때만 쓴다.
       바꿔도 아무것도 안 바뀌는 선택지를 놔두면, 고른 사람은 뭔가 반영됐다고
       믿게 된다. 동네 목록 화면이 그랬다 - 차종을 바꿔도 바뀌는 글자가
       설정 상자 자기 설명 한 줄뿐이었다(2026-09-23 실측). */
    var noCar = !!opts.noCar;

    var summaryText = noCar ? FUELS[state.fuel] + (regionName ? ' · ' + regionName : '')
                            : summary;

    return '<div class="oil-prefs' + (fixed ? ' is-fixed is-open' : (open ? ' is-open' : '')) +
      '" id="oil-prefs">' +
      (fixed ? '' :
        '<button type="button" class="oil-prefs-sum" id="oil-prefs-toggle">' +
          '<span class="oil-prefs-sum-t">' + OIL.esc(summaryText) + '</span>' +
          '<span class="oil-prefs-sum-a">변경</span>' +
        '</button>') +
      '<div class="oil-prefs-body">' +
        '<div class="oil-prefs-row"><span class="oil-prefs-k">유종</span>' +
          '<div class="oil-sido-tabs">' + fuelBtns + '</div></div>' +
        (noCar ? '' :
          '<div class="oil-prefs-row"><span class="oil-prefs-k">차종</span>' +
            '<div class="oil-sido-tabs">' + carBtns + '</div></div>' +
          '<div class="oil-prefs-hint">차종을 고르면 연비 ' + P.car().kmpl +
            'km/L, 1회 주유 ' + P.car().usual + 'L 로 계산합니다</div>') +
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

  /* ── 고르는 줄 (주변반경 · 유종 · 차종) ────────────────────
     주변 주유소 화면 맨 위에 붙는다. 세 가지가 전부 결과를 바꾼다.
       반경 - 몇 km 안에서 찾을지 (사용자가 갈 의향이 있는 거리)
       유종 - 휘발유가 싼 집이 경유도 싸다는 보장이 없다
       차종 - 연비에 따라 손익분기가 2배까지 달라진다
     휴대폰에서는 <select> 가 운영체제 고르개를 띄워줘서 가장 쓰기 편하다. */
  function sel(key, label, opts) {
    return '<label class="oil-pick">' +
      '<span class="oil-pick-k">' + label + '</span>' +
      '<select class="oil-pick-s" data-pref="' + key + '">' +
      opts.map(function (o) {
        return '<option value="' + o[0] + '"' +
          (String(state[key]) === String(o[0]) ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></label>';
  }

  /* 네 개는 한 줄에 안 들어간다. 두 줄로 나누고, 넷을 한 상자에 담는다.
     낱개로 떠 있으면 '고르는 곳'이 네 군데인 것처럼 보인다 - 한 덩어리로
     묶어야 "여기가 조건 고르는 자리"로 한 번에 읽힌다. */
  P.pickerHtml = function () {
    return '<div class="oil-picks-box"><div class="oil-picks">' +
      sel('radius', '주변반경', RADIUS.map(function (k) { return [k, k + 'km']; })) +
      sel('fuel', '유종', Object.keys(FUELS).map(function (f) { return [f, FUELS[f]]; })) +
      '</div><div class="oil-picks">' +
      sel('vehicle', '차종', VEHICLE_ORDER.map(function (v) { return [v, VEHICLE[v].label]; })) +
      sel('trip', '이동', Object.keys(TRIPS).map(function (t) { return [t, TRIPS[t]]; })) +
      '</div></div>';
  };

  /* 목적지 모드용. 반경·편도왕복 대신 주행가능거리·우회허용이 들어간다.
     가는 길이니 편도가 당연하고, 우회는 '벗어났다 돌아오기'라 왕복이 이미 포함돼 있다. */
  P.destPickerHtml = function () {
    return '<div class="oil-picks-box"><div class="oil-picks">' +
      sel('range', '더 갈 수 있는 거리', RANGE.map(function (k) { return [k, k + 'km']; })) +
      sel('detour', '우회 허용', DETOUR.map(function (k) { return [k, k + 'km까지']; })) +
      '</div><div class="oil-picks">' +
      sel('fuel', '유종', Object.keys(FUELS).map(function (f) { return [f, FUELS[f]]; })) +
      sel('vehicle', '차종', VEHICLE_ORDER.map(function (v) { return [v, VEHICLE[v].label]; })) +
      '</div></div>';
  };

  P.wirePicker = function (onChange) {
    var boxes = document.querySelectorAll('.oil-picks');
    for (var i = 0; i < boxes.length; i++) {
      boxes[i].addEventListener('change', function (e) {
        var s = e.target.closest('[data-pref]');
        if (!s) return;
        var key = s.getAttribute('data-pref');
        var num = (key === 'radius' || key === 'range' || key === 'detour');
        P.set(key, num ? parseInt(s.value, 10) : s.value);
        if (onChange) onChange(key);
      });
    }
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

  /* 읍·면·동까지 찾는다. 주유소가 있는 동만 데이터에 있어 근사치이므로
     화면에는 '부근'이라고 밝힌다. */
  function nearestDong(lat, lng) {
    return OIL.load('geo.json').then(function (geo) {
      var best = null, bestD = Infinity;
      for (var i = 0; i < geo.items.length; i++) {
        var g = geo.items[i];
        var d = distKm(lat, lng, g.la, g.ln);
        if (d < bestD) { bestD = d; best = g; }
      }
      /* 너무 멀면(15km 초과) 엉뚱한 동을 말하게 되므로 쓰지 않는다 */
      return (best && bestD <= 15) ? { dong: best, km: bestD } : null;
    }).catch(function () { return null; });
  }

  /* 실패 이유별 한 줄 안내. 자세한 안내 상자는 OIL.env.locateWhy 가 따로 맡는다 -
     여기(동네 목록·계산기)는 화면 한구석의 작은 글씨 자리라 한 줄이면 된다. */
  var LOCMSG = {
    none:    '이 브라우저는 위치 기능을 지원하지 않습니다.',
    deny:    '위치 권한이 거부되었습니다. 아래에서 직접 선택해주세요.',
    appperm: '앱에 위치 권한이 없습니다. 크롬·사파리에서 열거나 아래에서 직접 선택해주세요.',
    autodeny: '이 앱은 위치를 내주지 않습니다. 크롬·사파리에서 열거나 아래에서 직접 선택해주세요.',
    unavail: '위치를 찾지 못했습니다. 아래에서 직접 선택해주세요.',
    slow:    '위치 확인이 오래 걸립니다. 아래에서 직접 선택해주세요.'
  };

  /* onDone(결과, 오류메시지) — 결과에 region 과 spot(읍면동)이 들어온다.
     ★ 위치 받는 일은 OIL.env.locate 에 맡긴다. 여기서 따로 8초 컷을 두고 있었는데,
       권한 창이 떠 있는 동안에도 타이머가 흘러서 사용자가 [허용]을 누르기 전에
       요청이 죽는다(2026-09-24 실측 - 창 읽는 시간까지 6.9초 걸렸다).
       세 화면이 각자 다른 규칙을 갖고 있을 이유도 없다. */
  P.locate = function (onDone) {
    OIL.env.locate(function (pos) {
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      Promise.all([OIL.regions(), nearestDong(lat, lng)]).then(function (a) {
        var reg = a[0], spot = a[1];
        var hit = P.nearest(lat, lng, reg.items);
        if (!hit) { onDone(null, '가까운 동네를 찾지 못했습니다.'); return; }
        /* 동을 찾았고 그 동이 다른 시군구에 속하면, 동 쪽 시군구를 믿는다 */
        if (spot && spot.dong.r !== hit.region.r) {
          for (var i = 0; i < reg.items.length; i++) {
            if (reg.items[i].r === spot.dong.r) { hit.region = reg.items[i]; break; }
          }
        }
        hit.spot = spot;
        hit.accuracy = pos.coords.accuracy;
        onDone(hit, null);
      }).catch(function () { onDone(null, '데이터를 불러오지 못했습니다.'); });
    }, function (kind) {
      onDone(null, LOCMSG[kind] || '위치를 가져오지 못했습니다.');
    });
  };

  P.locateBtnHtml = function () {
    return '<button type="button" class="oil-locate" id="oil-locate">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle>' +
      '<path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></svg>' +
      '<span>내 위치로 우리 동네 찾기</span></button>' +
      '<div class="oil-locate-msg" id="oil-locate-msg"></div>';
  };

  /* 찾은 위치를 사람이 읽을 문장으로. 예: "충남 천안시 신당동 부근" */
  P.spotText = function (hit) {
    if (!hit) return '';
    if (hit.spot) return hit.spot.dong.r + ' ' + hit.spot.dong.d + ' 부근';
    return hit.region.r + ' 부근';
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
        var where = P.spotText(hit);
        msg.textContent = where + ' — ' + hit.region.r + ' 기름값을 봅니다';
        P.set('last', hit.region.sl);
        P.set('spot', where);      /* 동네 화면에서 "현위치"로 보여준다 */
        location.href = OIL.areaUrl(hit.region.sl);
      });
    });
  };
})();
