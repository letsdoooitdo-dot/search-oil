/* 주유소찾기 - 실제 도로거리

   직선거리를 쓰면 답이 틀린다. 평택에서 재보니 직선 대비 도로 배율이
   1.13~2.41 로 제각각이었고, 직선으로 더 가까운 집이 도로로는 더 먼 경우도 있었다.
   그래서 화면에 보이는 거리·손익분기·순서는 전부 카카오 길찾기의 실제 도로거리로 낸다.

   직선거리는 '후보를 고를 때'만 쓴다. 도로거리는 직선거리보다 항상 기니까,
   직선 R 안에서 후보를 뽑으면 도로 R 안의 주유소는 하나도 빠지지 않는다.

   API 제약 (직접 시험해 확인한 값)
     /v1/destinations/directions  출발지1 -> 목적지 여러 곳. 최대 30곳, 반경 최대 10km
     /v1/directions               단건. 거리 제한 없음. 경로 좌표도 준다
     /v1/waypoints/directions     들렀다 가기. 진짜 우회거리를 낼 때 쓴다

   키 주의: REST 키는 도메인 제한을 걸 수 없다. 개발 중에만 브라우저에서 직접 쓰고,
   공개 전에는 naviProxy(중계 서버) 를 반드시 채워 키를 숨겨야 한다.
*/
(function () {
  'use strict';

  var OIL = window.OIL;
  if (!OIL) return;

  var CFG = OIL.cfg || {};
  var HOST = 'https://apis-navi.kakaomobility.com';
  var MAX_DEST = 30;        /* 한 번에 물어볼 수 있는 목적지 수 */
  var MAX_RADIUS_M = 10000; /* 다중 목적지는 반경 10km 를 넘을 수 없다 */
  var GUESS = 1.57;         /* 길찾기가 안 될 때 직선에 곱하는 값 (평택 실측 평균) */

  var R = OIL.road = {};

  R.MAX_DEST = MAX_DEST;
  R.MAX_RADIUS_M = MAX_RADIUS_M;
  R.GUESS = GUESS;
  R.ready = function () { return !!(CFG.naviProxy || CFG.naviKey); };

  function url(path) {
    return (CFG.naviProxy ? CFG.naviProxy.replace(/\/+$/, '') : HOST) + path;
  }
  function headers() {
    var h = { 'Content-Type': 'application/json' };
    /* 중계 서버를 쓰면 키는 서버가 붙인다 - 브라우저에 담지 않는다 */
    if (!CFG.naviProxy && CFG.naviKey) h.Authorization = 'KakaoAK ' + CFG.naviKey;
    return h;
  }

  function post(path, body) {
    return fetch(url(path), {
      method: 'POST', headers: headers(), body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return r.json();
    });
  }

  /* ── 거리 보관 ────────────────────────────────────────────
     차종이나 편도/왕복을 바꿔도 거리는 그대로다. 다시 묻지 않는다. */
  var cache = {};
  function key(a, b) {
    return a.la.toFixed(5) + ',' + a.ln.toFixed(5) + '>' +
           b.la.toFixed(5) + ',' + b.ln.toFixed(5);
  }

  function chunk(list, n) {
    var out = [];
    for (var i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
    return out;
  }

  /* 출발지 한 곳에서 여러 곳까지의 도로거리.
     결과는 points 와 같은 순서의 배열. 각 항목은 { km, real } 이고
     real=false 면 길찾기가 안 돼 직선으로 어림한 값이다. */
  R.matrix = function (origin, points) {
    var out = new Array(points.length);
    var todo = [];

    points.forEach(function (p, i) {
      var k = key(origin, p);
      if (cache[k]) { out[i] = cache[k]; return; }
      var straight = OIL.distKm(origin.la, origin.ln, p.la, p.ln);
      /* 반경 10km 를 넘으면 물어볼 수가 없다 - 어림값으로 채운다 */
      if (straight * 1000 >= MAX_RADIUS_M) {
        out[i] = cache[k] = { km: straight * GUESS, real: false };
        return;
      }
      todo.push({ i: i, p: p, k: k, straight: straight });
    });

    if (!todo.length || !R.ready()) {
      todo.forEach(function (t) {
        out[t.i] = cache[t.k] = { km: t.straight * GUESS, real: false };
      });
      return Promise.resolve(out);
    }

    return Promise.all(chunk(todo, MAX_DEST).map(function (group) {
      return post('/v1/destinations/directions', {
        origin: { x: origin.ln, y: origin.la },
        destinations: group.map(function (t, j) {
          return { x: t.p.ln, y: t.p.la, key: String(j) };
        }),
        radius: MAX_RADIUS_M
      }).then(function (res) {
        var by = {};
        (res.routes || []).forEach(function (r) { by[r.key] = r; });
        group.forEach(function (t, j) {
          var r = by[String(j)];
          out[t.i] = cache[t.k] = (r && r.result_code === 0)
            ? { km: r.summary.distance / 1000, real: true }
            : { km: t.straight * GUESS, real: false };
        });
      }).catch(function () {
        group.forEach(function (t) {
          out[t.i] = cache[t.k] = { km: t.straight * GUESS, real: false };
        });
      });
    })).then(function () { return out; });
  };

  /* 단건 길찾기. 거리 제한이 없고 경로 좌표(vertexes)도 준다.
     경로 좌표는 목적지 모드에서 '가는 길 근처'를 고르는 데 쓴다. */
  R.route = function (from, to) {
    if (!R.ready()) return Promise.reject(new Error('길찾기 설정 없음'));
    return fetch(url('/v1/directions') +
        '?origin=' + from.ln + ',' + from.la +
        '&destination=' + to.ln + ',' + to.la +
        '&priority=RECOMMEND', { headers: headers() })
      .then(function (r) {
        if (!r.ok) throw new Error('directions ' + r.status);
        return r.json();
      })
      .then(function (d) {
        var r = (d.routes || [])[0];
        if (!r || r.result_code !== 0) throw new Error(r ? r.result_msg : '경로 없음');
        var path = [];
        (r.sections || []).forEach(function (sec) {
          (sec.roads || []).forEach(function (rd) {
            var v = rd.vertexes || [];
            for (var i = 0; i + 1 < v.length; i += 2) path.push({ ln: v[i], la: v[i + 1] });
          });
        });
        return { km: r.summary.distance / 1000, min: r.summary.duration / 60, path: path };
      });
  };

  /* 들렀다 가면 얼마나 더 가는가. 이게 진짜 우회거리다. */
  R.detour = function (from, via, to, baseKm) {
    return post('/v1/waypoints/directions', {
      origin: { x: from.ln, y: from.la },
      destination: { x: to.ln, y: to.la },
      waypoints: [{ x: via.ln, y: via.la, name: '주유소' }],
      priority: 'RECOMMEND'
    }).then(function (d) {
      var r = (d.routes || [])[0];
      if (!r || r.result_code !== 0) return null;
      var total = r.summary.distance / 1000;
      return { total: total, extra: Math.max(0, total - baseKm), real: true };
    }).catch(function () { return null; });
  };
})();
