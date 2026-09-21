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

  /* ── 광고 ────────────────────────────────────────────────── */
  OIL.adHtml = function () {
    if (!CFG.adClient || !CFG.adSlot) return '';
    return '<div class="oil-ad"><div class="oil-ad-label">광고</div>' +
      '<ins class="adsbygoogle" style="display:block"' +
      ' data-ad-client="' + CFG.adClient + '"' +
      ' data-ad-slot="' + CFG.adSlot + '"' +
      ' data-ad-format="auto" data-full-width-responsive="true"></ins></div>';
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

  /* ── 동네 해설 (파이썬 build_area_pages 와 같은 규칙) ────── */
  OIL.verdict = function (r, meta, total) {
    var big = (meta && meta.spreadBig) || 250;
    var small = (meta && meta.spreadSmall) || 60;
    var won50 = r.sp * 50;
    var head, body;

    if (r.sp >= big) {
      head = r.r + '는 주유소를 고를 가치가 큽니다';
      body = '같은 ' + OIL.esc(r.r) + ' 안에서 최저 ' + OIL.won(r.lo) + '원, 최고 ' +
        OIL.won(r.hi) + '원으로 <b>' + OIL.won(r.sp) + '원</b> 차이가 납니다. ' +
        '50L를 넣는다면 한 번 주유에 <b>' + OIL.won(won50) + '원</b>이 갈립니다. ' +
        '아무 데나 들어가면 손해를 보는 동네입니다.';
    } else if (r.sp < small) {
      /* 제일 싼 곳까지 몇 km 더 가면 본전인지 (연비 12km/L, 50L 기준) */
      var perKm = r.md / 12;
      var beKm = perKm > 0 ? (r.sp * 50) / perKm : 0;
      head = r.r + '는 어디서 넣어도 비슷합니다';
      body = '동네 안에서 가장 싼 곳과 가장 비싼 곳의 차이가 <b>' + OIL.won(r.sp) +
        '원</b>뿐입니다. 제일 싼 집을 찾아가더라도 <b>' + beKm.toFixed(1) +
        'km</b>만 더 돌면 아낀 돈이 기름값으로 사라집니다. 가는 길에 보이는 곳에서 넣으시면 됩니다.';
    } else {
      head = r.r + '는 조금 따져볼 만합니다';
      body = '동네 안 가격 차이가 <b>' + OIL.won(r.sp) + '원</b>입니다. 50L면 ' +
        OIL.won(won50) + '원 차이라, 멀리 돌아갈 정도는 아니지만 가는 길에 싼 곳이 있다면 들를 만합니다.';
    }

    var diff = r.md - (meta ? meta.gas.median : r.md);
    var nat;
    if (Math.abs(diff) < 5) {
      nat = '전국 중앙값과 거의 같은 수준입니다 (전국 ' + total + '개 시군구 중 ' + r.rk + '번째로 저렴).';
    } else if (diff < 0) {
      nat = '전국 중앙값보다 <b>' + OIL.won(-diff) + '원 저렴</b>한 동네입니다 (전국 ' +
        total + '개 시군구 중 ' + r.rk + '번째).';
    } else {
      nat = '전국 중앙값보다 <b>' + OIL.won(diff) + '원 비싼</b> 동네입니다 (전국 ' +
        total + '개 시군구 중 ' + r.rk + '번째로 저렴).';
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
