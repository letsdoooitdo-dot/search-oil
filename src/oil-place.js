/* 주유소찾기 - 장소 검색과 저장

   검색은 카카오맵을 쓴다. 키가 없거나 카카오가 답이 없으면 우리 데이터로 찾는다
   (읍·면·동 2,722곳 + 시·군·구 230곳). 둘 다 좌표를 돌려주므로 뒤 계산은 같다.

   저장은 브라우저가 한다. 로그인도 서버도 없다.
   기기마다 따로 남고 사용기록을 지우면 같이 날아간다 - 없어도 서비스는 돌아가야 한다.

   장소 하나는 { n: 이름, a: 주소, la: 위도, ln: 경도 } 로만 다룬다.
*/
(function () {
  'use strict';

  var OIL = window.OIL;
  if (!OIL) return;

  var KEY = 'oil.places';
  var MAX_RECENT = 8;

  function read() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY));
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }   /* 시크릿 모드 등 - 빈 걸로 간다 */
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* 못 담아도 동작은 한다 */ }
  }

  var store = read();
  if (!Array.isArray(store.recent)) store.recent = [];

  var PL = OIL.place = {};

  /* ── 저장 ──────────────────────────────────────────────────
     최근 검색만 남긴다. 집·회사 지정은 넣었다가 뺐다 -
     자주 가는 곳은 어차피 최근 검색 맨 위에 올라와서 따로 둘 이유가 없었다. */
  PL.recent = function () { return store.recent; };

  /* 같은 곳인지는 좌표로 본다. 검색 화면은 주소까지 담고 결과 화면은 못 담아서,
     이름·주소로 비교하면 같은 곳이 두 번 쌓인다. */
  function samePlace(a, b) {
    return Math.abs(a.la - b.la) < 0.0005 && Math.abs(a.ln - b.ln) < 0.0005;
  }

  PL.remember = function (p) {
    if (!p || p.la == null) return;
    var old = null;
    store.recent = store.recent.filter(function (x) {
      if (!samePlace(x, p)) return true;
      old = x; return false;
    });
    /* 주소는 있는 쪽을 살린다 */
    if (old && !p.a && old.a) p = { n: p.n || old.n, a: old.a, la: p.la, ln: p.ln };
    store.recent.unshift(p);
    store.recent = store.recent.slice(0, MAX_RECENT);
    save();
  };
  PL.forget = function (i) { store.recent.splice(i, 1); save(); };
  PL.clearRecent = function () { store.recent = []; save(); };

  /* 고른 곳을 목적지로 넘긴다. from 을 주면 출발지도 함께 넘긴다
     (위치 권한을 거부해 출발지를 직접 고른 경우). */
  PL.destUrl = function (p, from) {
    var u = (OIL.cfg.areaPageUrl || '/p/area.html') +
      '?dla=' + p.la.toFixed(5) + '&dln=' + p.ln.toFixed(5) +
      '&dq=' + encodeURIComponent(p.n);
    if (from) {
      u += '&ola=' + from.la.toFixed(5) + '&oln=' + from.ln.toFixed(5) +
           '&oq=' + encodeURIComponent(from.n);
    }
    return u;
  };

  /* 어떤 지점 '주변'을 볼 때 (내 주변 찾기) */
  PL.nearUrl = function (p) {
    return (OIL.cfg.areaPageUrl || '/p/area.html') +
      '?la=' + p.la.toFixed(5) + '&ln=' + p.ln.toFixed(5) +
      '&q=' + encodeURIComponent(p.n);
  };

  /* ── 카카오 SDK ──────────────────────────────────────────────
     검색창을 실제로 쓸 때 그때 부른다. 안 쓰는 사람은 내려받지 않는다. */
  var sdk = null;
  function loadSdk() {
    if (sdk) return sdk;
    var key = OIL.cfg.kakaoKey;
    if (!key) {
      sdk = Promise.reject(new Error('kakaoKey 없음'));
      return sdk;
    }
    sdk = new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' +
        encodeURIComponent(key) + '&libraries=services&autoload=false';
      s.onload = function () {
        try { window.kakao.maps.load(function () { ok(window.kakao); }); }
        catch (e) { no(e); }
      };
      s.onerror = function () { no(new Error('SDK 로드 실패')); };
      document.head.appendChild(s);
    });
    return sdk;
  }

  PL.hasKakao = function () { return !!OIL.cfg.kakaoKey; };
  PL.sdk = loadSdk;     /* 지도를 그릴 때도 같은 SDK 를 쓴다 - 한 번만 받는다 */

  /* ── 검색 ────────────────────────────────────────────────── */
  function fromKakao(q) {
    return loadSdk().then(function (kakao) {
      return new Promise(function (ok) {
        new kakao.maps.services.Places().keywordSearch(q, function (data, status) {
          if (status !== kakao.maps.services.Status.OK || !data || !data.length) {
            ok([]);
            return;
          }
          ok(data.slice(0, 15).map(function (d) {
            return {
              n: d.place_name,
              a: d.road_address_name || d.address_name || '',
              la: parseFloat(d.y), ln: parseFloat(d.x)
            };
          }));
        });
      });
    });
  }

  /* 카카오가 없을 때. 동네 이름만 찾을 수 있다. */
  PL.searchLocal = function (q) {
    return Promise.all([OIL.regions(), OIL.load('geo.json')]).then(function (a) {
      var regions = a[0].items, geo = a[1].items, out = [];
      for (var i = 0; i < regions.length && out.length < 15; i++) {
        var r = regions[i];
        if (r.la != null && r.r.indexOf(q) >= 0) {
          out.push({ n: r.r, a: '시·군·구', la: r.la, ln: r.ln });
        }
      }
      for (var j = 0; j < geo.length && out.length < 15; j++) {
        var g = geo[j];
        if (g.d.indexOf(q) >= 0) out.push({ n: g.d, a: g.r, la: g.la, ln: g.ln });
      }
      return out;
    }).catch(function () { return []; });
  };

  PL.search = function (q) {
    q = String(q || '').trim();
    if (q.length < 1) return Promise.resolve([]);
    if (!PL.hasKakao()) return PL.searchLocal(q);
    return fromKakao(q)
      .then(function (list) { return list.length ? list : PL.searchLocal(q); })
      .catch(function () { return PL.searchLocal(q); });
  };
})();
