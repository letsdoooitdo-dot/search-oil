/* 주유소찾기 - 공통 (데이터 불러오기·숫자 포맷·광고·해설 문장) */
(function () {
  'use strict';

  var CFG = window.OIL_CONFIG || {};
  var OIL = window.OIL = window.OIL || {};

  OIL.cfg = CFG;

  /* ── 숫자·문자 ───────────────────────────────────────────── */
  OIL.won = function (n) { return Math.round(n).toLocaleString('ko-KR'); };
  OIL.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  OIL.dateKo = function (iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[0] + '년 ' + Number(p[1]) + '월 ' + Number(p[2]) + '일';
  };
  /* 받침 유무로 은/는 같은 조사를 고른다 */
  OIL.josa = function (word, pair) {
    pair = pair || '은는';
    if (!word) return pair[1];
    var ch = word.charCodeAt(word.length - 1);
    if (ch < 0xac00 || ch > 0xd7a3) return pair[1];
    return (ch - 0xac00) % 28 ? pair[0] : pair[1];
  };

  /* ── 데이터 ──────────────────────────────────────────────── */
  var cache = {};
  OIL.load = function (path) {
    if (cache[path]) return cache[path];
    var base = (CFG.dataBaseUrl || '').replace(/\/+$/, '');
    cache[path] = fetch(base + '/' + path, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error(path + ' ' + r.status);
        return r.json();
      })
      .catch(function (e) { delete cache[path]; throw e; });
    return cache[path];
  };
  OIL.meta = function () { return OIL.load('meta.json'); };
  OIL.regions = function () { return OIL.load('regions.json'); };
  OIL.region = function (slug) { return OIL.load('region/' + encodeURIComponent(slug) + '.json'); };

  /* ── 화면 ────────────────────────────────────────────────── */
  OIL.root = function () { return document.getElementById('oil-root'); };
  OIL.loading = function (msg) {
    var r = OIL.root();
    if (r) r.innerHTML = '<div class="oil-loading">' + OIL.esc(msg || '불러오는 중...') + '</div>';
  };
  OIL.fail = function (e) {
    var r = OIL.root();
    if (r) {
      r.innerHTML = '<div class="oil-error">데이터를 불러오지 못했습니다.<br>' +
        '잠시 후 다시 시도해주세요.</div>';
    }
    if (window.console) console.error(e);
  };
  OIL.areaUrl = function (slug) {
    return (CFG.areaPageUrl || '/p/area.html') + '?r=' + encodeURIComponent(slug);
  };
  OIL.param = function (k) {
    return new URLSearchParams(location.search).get(k) || '';
  };

  /* ── 거리와 손익분기 ─────────────────────────────────────────
     우리 서비스의 핵심이다. "싼 집이 항상 이득은 아니다" 를 숫자로 보여준다.
     거리는 전부 카카오 길찾기의 실제 도로거리다(oil-road.js). 직선거리는
     후보를 고를 때만 쓴다. */

  OIL.distKm = function (lat1, lng1, lat2, lng2) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  };

  /* price  이 주유소 가격
     base   기준 주유소 가격 (여기서 가장 가까운 집 - 아무것도 안 따지면 갔을 곳)
     km     출발지 → 이 주유소 실제 도로거리
     baseKm 출발지 → 기준 주유소 실제 도로거리
     round  왕복이면 true (주유만 하러 갔다 돌아옴)

     기준 주유소도 어차피 가야 하므로, 무는 것은 '더 가는 거리'뿐이다.
     출발지에서의 전체 거리를 물리면 가까운 집이 공짜가 되어 늘 이긴다. */
  OIL.calcTrip = function (price, base, km, baseKm, round) {
    var car = (OIL.prefs && OIL.prefs.car()) || { kmpl: 12, usual: 30, label: '일반 승용차' };
    var L = car.usual, kmpl = car.kmpl;
    var mult = round ? 2 : 1;
    var extra = Math.max(0, km - (baseKm || 0));   /* 기준보다 더 가는 도로거리 */
    var drive = extra * mult;                      /* 왕복이면 두 배 */
    var cost = drive / kmpl * price;               /* 더 가느라 쓰는 기름값 */
    var gain = (base - price) * L;                 /* 싸게 넣어 아끼는 돈 */
    /* 손익분기: 기준보다 몇 km 더 가는 데까지 본전인가 */
    var beKm = price > 0 ? gain * kmpl / (price * mult) : 0;
    return { km: km, extra: extra, drive: drive, round: !!round,
             cost: cost, gain: gain, net: gain - cost, beKm: beKm,
             L: L, kmpl: kmpl, car: car };
  };

  /* 카드에 넣을 판정 문구.
     결론을 먼저 굵게 한 줄, 근거는 그 아래 작은 글씨로 붙인다.
     "빼도 이득" 처럼 계산 과정을 말하면 한 번 더 생각해야 읽힌다 -
     "얼마를 더 아낀다"로 먼저 말하고, 왜 그런지는 아래 줄에 둔다.
     kind='detour' 면 목적지 모드라 '더 간다'가 아니라 '돌아간다'로 말한다. */
  OIL.tripLine = function (t, isBase, kind) {
    var off = (kind === 'detour');
    var go = off ? '돌아가도' : '더 가도';
    function sub(s) { return '<span class="oil-st-sub">' + s + '</span>'; }

    if (isBase) {
      return { cls: 'is-base',
               text: (off ? '가는 길에서 <b>제일 안 돌아가는 곳</b>'
                          : '여기서 <b>제일 가까운 주유소</b>') +
                     sub('이 집을 기준으로 나머지를 비교합니다') };
    }
    if (t.gain <= 0) {
      return { cls: 'is-bad',
               text: (t.gain === 0 ? '<b>가격이 같은데</b> ' : '<b>여기보다 비싼데</b> ') +
                     (off ? '돌아가야 합니다' : '더 멀기까지 합니다') };
    }
    if (t.net > 0) {
      /* 기준과 거의 같은 거리면 "0.0km 더 가도"라고 쓰게 되어 어색하다 */
      if (t.drive < 0.15) {
        return { cls: 'is-good',
                 text: '<b>' + OIL.won(t.net) + '원 더 아낍니다</b>' +
                       sub('거의 같은 거리인데 기름값이 쌉니다') };
      }
      return { cls: 'is-good',
               text: '<b>' + OIL.won(t.net) + '원 더 아낍니다</b>' +
                     sub(t.drive.toFixed(1) + 'km ' + go + ', 더 드는 기름값 ' +
                         OIL.won(t.cost) + '원을 뺀 금액입니다') };
    }
    /* 싸긴 한데 오가는 기름값이 더 큰 경우 - 이게 우리가 잡아주는 함정이다 */
    return { cls: 'is-bad',
             text: '<b>' + OIL.won(-t.net) + '원 손해입니다</b>' +
                   sub('싸게 넣어 ' + OIL.won(t.gain) + '원 아끼지만, ' +
                       t.drive.toFixed(1) + 'km ' + (off ? '돌아가는' : '더 가는') +
                       ' 기름값이 ' + OIL.won(t.cost) + '원입니다') };
  };

  /* ── 주유소 상표 ──────────────────────────────────────────
     로고 그림은 상표권이 있어 쓸 수 없다. 대신 상표를 알아볼 수 있게
     그 회사 간판 색으로 약칭 배지를 만든다. 색만 봐도 구분이 된다. */
  var BRANDS = {
    'SK에너지':      { s: 'SK',   bg: '#E8112D', fg: '#fff' },
    'GS칼텍스':      { s: 'GS',   bg: '#00A94F', fg: '#fff' },
    'HD현대오일뱅크': { s: '현대', bg: '#0F4C91', fg: '#fff' },
    'S-OIL':        { s: 'S',    bg: '#FFD400', fg: '#1A1A1A' },
    'NH-OIL':       { s: 'NH',   bg: '#0068B7', fg: '#fff' },
    '알뜰주유소':     { s: '알뜰', bg: '#F47920', fg: '#fff' },
    '알뜰(ex)':      { s: '알뜰', bg: '#00843D', fg: '#fff' },
    '자가상표':       { s: '자가', bg: '#8494AD', fg: '#fff' }
  };
  var NO_BRAND = { s: '주유', bg: '#B6C2D6', fg: '#fff' };

  OIL.brand = function (b) { return BRANDS[b] || NO_BRAND; };
  OIL.brandChip = function (b, cls) {
    var x = OIL.brand(b);
    return '<span class="oil-bc' + (cls ? ' ' + cls : '') + '" style="background:' +
      x.bg + ';color:' + x.fg + '" title="' + OIL.esc(b || '') + '">' + x.s + '</span>';
  };

  /* 찾아가기 - 카카오맵. API 키가 필요 없고 앱이 깔려 있으면 앱이 열린다. */
  OIL.mapUrl = function (s) {
    var name = String(s.n || '주유소').replace(/,/g, ' ');
    if (s.la && s.ln) {
      return 'https://map.kakao.com/link/to/' + encodeURIComponent(name) +
        ',' + s.la + ',' + s.ln;
    }
    return 'https://map.kakao.com/link/search/' + encodeURIComponent(name);
  };

  /* ── 광고 ────────────────────────────────────────────────── */
  OIL.adHtml = function () {
    if (!CFG.adClient || !CFG.adSlot) return '';
    return '<div class="oil-ad"><div class="oil-ad-label">광고</div>' +
      '<ins class="adsbygoogle" style="display:block"' +
      ' data-ad-client="' + CFG.adClient + '"' +
      ' data-ad-slot="' + CFG.adSlot + '"' +
      ' data-ad-format="auto" data-full-width-responsive="true"></ins></div>';
  };
  /* 광고 자리. 개발 중(ADS_ON=False)에도 자리는 남겨둬야 나중에 광고를 켤 때
     화면이 밀리지 않는다. 그래서 빈 상자를 같은 크기로 그려둔다. */
  OIL.adSlotHtml = function () {
    var ad = OIL.adHtml();
    if (ad) return ad;
    return '<div class="oil-ad is-empty"><span>광고 영역</span></div>';
  };

  /* 화면을 그린 뒤 호출한다. 아직 요청하지 않은 ins 만 채운다. */
  OIL.adFill = function () {
    try {
      var list = document.querySelectorAll('ins.adsbygoogle');
      for (var i = 0; i < list.length; i++) {
        if (list[i].getAttribute('data-adsbygoogle-status')) continue;
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      }
    } catch (e) { /* 광고 차단기 등 - 화면은 그대로 둔다 */ }
  };

  OIL.render = function (html) {
    var r = OIL.root();
    if (!r) return;
    r.innerHTML = html;
    OIL.adFill();
  };

  /* ── 동네 해설 (파이썬 build_area_pages 와 같은 규칙) ──────
     s = 지금 고른 유종의 통계 {n,lo,md,hi,sp,rk}
     손익분기 거리는 고른 차종의 연비·주유량으로 계산한다 - 차종에 따라 2배까지 달라진다 */
  OIL.verdict = function (r, meta, total, s, fuelName) {
    s = s || r.g || r;
    fuelName = fuelName || '휘발유';
    var big = (meta && meta.spreadBig) || 250;
    var small = (meta && meta.spreadSmall) || 60;
    var car = (OIL.prefs && OIL.prefs.car()) || { kmpl: 12, usual: 30 };
    var L = car.usual, kmpl = car.kmpl;
    var saved = s.sp * L;
    var head, body;

    if (s.sp >= big) {
      head = r.r + '는 주유소를 고를 가치가 큽니다';
      body = '같은 ' + OIL.esc(r.r) + ' 안에서 ' + fuelName + ' 최저 ' + OIL.won(s.lo) +
        '원, 최고 ' + OIL.won(s.hi) + '원으로 <b>' + OIL.won(s.sp) + '원</b> 차이가 납니다. ' +
        '한 번에 ' + L + 'L를 넣는다면 <b>' + OIL.won(saved) + '원</b>이 갈립니다. ' +
        '아무 데나 들어가면 손해를 보는 동네입니다.';
    } else if (s.sp < small) {
      var perKm = s.md / kmpl;
      var beKm = perKm > 0 ? saved / perKm : 0;
      head = r.r + '는 어디서 넣어도 비슷합니다';
      body = '동네 안에서 가장 싼 곳과 가장 비싼 곳의 차이가 <b>' + OIL.won(s.sp) +
        '원</b>뿐입니다. 제일 싼 집을 찾아가더라도 <b>' + beKm.toFixed(1) +
        'km</b>만 더 돌면 아낀 돈이 기름값으로 사라집니다. 가는 길에 보이는 곳에서 넣으시면 됩니다.';
    } else {
      head = r.r + '는 조금 따져볼 만합니다';
      body = '동네 안 ' + fuelName + ' 가격 차이가 <b>' + OIL.won(s.sp) + '원</b>입니다. ' +
        L + 'L면 ' + OIL.won(saved) + '원 차이라, 멀리 돌아갈 정도는 아니지만 ' +
        '가는 길에 싼 곳이 있다면 들를 만합니다.';
    }

    var natMed = meta ? ((OIL.prefs && OIL.prefs.get('fuel') === 'd')
      ? meta.diesel.median : meta.gas.median) : s.md;
    var diff = s.md - natMed;
    var nat;
    if (Math.abs(diff) < 5) {
      nat = '전국 중앙값과 거의 같은 수준입니다 (전국 ' + total + '개 시군구 중 ' + s.rk + '번째로 저렴).';
    } else if (diff < 0) {
      nat = '전국 중앙값보다 <b>' + OIL.won(-diff) + '원 저렴</b>한 동네입니다 (전국 ' +
        total + '개 시군구 중 ' + s.rk + '번째).';
    } else {
      nat = '전국 중앙값보다 <b>' + OIL.won(diff) + '원 비싼</b> 동네입니다 (전국 ' +
        total + '개 시군구 중 ' + s.rk + '번째로 저렴).';
    }
    return { head: head, body: body, nat: nat };
  };

  OIL.characterLine = function (r) {
    if (!r.ac) {
      return '이 동네에는 1년 내내 최저권을 지킨 주유소가 없습니다. ' +
        '오늘 싼 곳이 다음 달에도 싸다는 보장이 없으니, 넣기 전에 매번 확인하는 편이 낫습니다.';
    }
    if (r.ac === 1) {
      return '이 동네에서 1년 내내 최저권을 지킨 주유소는 <b>단 한 곳</b>입니다. ' +
        '오늘 하루 싼 집과 계속 싼 집은 다릅니다.';
    }
    return '1년 내내 최저권을 지킨 주유소가 <b>' + r.ac + '곳</b> 있습니다. ' +
      '반대로 1년 내내 비싼 축이었던 곳도 ' + r.ap + '곳입니다.';
  };

  OIL.chev = function (color) {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="' +
      (color || '#5B666A') + '" stroke-width="2.5" aria-hidden="true">' +
      '<path d="M9 6l6 6-6 6"></path></svg>';
  };
})();
