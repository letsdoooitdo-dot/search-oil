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
  /* 가격 기준 - "2026년 9월 28일 13:04". 하루 5번 받으므로 시각까지 밝힌다. */
  OIL.asOf = function (m) {
    return OIL.dateKo(m && m.date) + (m && m.at ? ' ' + m.at : '');
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
  /* opt = { L, kmpl } - 계산기처럼 사용자가 숫자를 직접 넣을 때. 식은 하나만 둔다 -
     계산기와 결과 화면이 다른 답을 내면 어느 쪽도 못 믿게 된다. */
  OIL.calcTrip = function (price, base, km, baseKm, round, opt) {
    var car = (OIL.prefs && OIL.prefs.car()) || { kmpl: 12, usual: 30, label: '일반 승용차' };
    var L = (OIL.prefs && OIL.prefs.liters()) || car.usual, kmpl = car.kmpl;
    if (opt) { L = opt.L; kmpl = opt.kmpl; car = { kmpl: kmpl, usual: L, label: '직접 입력' }; }
    var mult = round ? 2 : 1;
    /* 기준보다 더 가는 도로거리. 가는 길 모드는 기준이 '처음 나오는 곳'이라
       기준보다 덜 돌아가는 곳도 있다 - 그때는 음수로 두어 덜 달린 만큼 쳐준다. */
    var extra = km - (baseKm || 0);
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
  /* ── 판정 문구 ───────────────────────────────────────────────
     ★ 원칙: 금액에는 늘 '무엇보다'를 붙인다. "1,350원 아낍니다"만 쓰면
       무엇에 비해서인지 몰라 믿을 근거가 없다(2026-09-27 사용자 지적).
       비교 기준은 사용자가 아무것도 안 따졌으면 들렀을 곳이다.
         내 주변 - 제일 가까운 주유소
         가는 길 - 가는 길에 처음 나오는 (거의 안 돌아가는) 주유소 */
  var won = function (n) { return OIL.won(n); };
  function km1(n) { return Math.abs(n).toFixed(1) + 'km'; }
  function perL(t) { return t.L ? t.gain / t.L : 0; }     /* 기준보다 리터당 싼 금액 */
  function signed(v) {
    var r = Math.round(v);
    return (r > 0 ? '+' : r < 0 ? '−' : '') + won(Math.abs(r)) + '원';
  }
  function tone(v) { v = Math.round(v); return v > 0 ? 'is-gain' : v < 0 ? 'is-cost' : ''; }

  /* 카드 한 줄. baseShort = '제일 가까운 곳' 같은 비교 기준 이름 */
  OIL.tripLine = function (t, isBase, kind, baseShort) {
    var off = (kind === 'detour');
    var more = off ? '더 돌아가는' : '더 가는';
    var ref = baseShort || (off ? '처음 나오는 곳' : '제일 가까운 곳');
    function sub(s) { return '<span class="oil-st-sub">' + s + '</span>'; }
    var d = perL(t);

    if (isBase) {
      return { cls: 'is-base',
               text: '<b>비교 기준</b> · ' + ref +
                     sub('그냥 여기서 넣었을 때와 비교해 다른 곳의 이득을 셉니다') };
    }
    if (Math.round(t.net) > 0) {
      var why = Math.abs(t.drive) < 0.15
        ? '거리는 거의 같은데 리터당 ' + won(d) + '원 쌉니다'
        : t.drive < 0
          ? '리터당 ' + won(d) + '원 싸고, ' + km1(t.drive) + ' 덜 돌아갑니다'
          : '리터당 ' + won(d) + '원 싸게 넣고, ' + km1(t.drive) + ' ' + more +
            ' 기름값 ' + won(t.cost) + '원을 뺐습니다';
      return { cls: 'is-good',
               text: ref + '보다 <b>' + won(t.net) + '원 남습니다</b>' + sub(why) };
    }
    var bad = d < 0
      ? '리터당 ' + won(-d) + '원 더 비쌉니다' +
        (t.drive >= 0.15 ? ' · ' + km1(t.drive) + ' 더 가야 합니다' : '')
      : d === 0
        ? '가격이 같은데 ' + km1(t.drive) + ' ' + (off ? '더 돌아가야' : '더 가야') + ' 합니다'
        : '리터당 ' + won(d) + '원 싸지만, ' + km1(t.drive) + ' ' + more +
          ' 기름값 ' + won(t.cost) + '원이 더 큽니다';
    return { cls: 'is-bad',
             text: ref + '보다 ' + (Math.round(t.net) === 0 ? '<b>남는 돈 없음</b>'
                                                           : '<b>' + won(-t.net) + '원 손해</b>') +
                   sub(bad) };
  };

  /* 사용자가 직접 따라 셀 수 있는 계산 줄 (싸게 넣은 돈 − 더 가는 기름값 = 남는 돈).
     숫자 하나하나에 식을 붙인다. 식이 없으면 결과를 믿을 근거가 없다. */
  OIL.tripRows = function (t, price, kind) {
    var off = (kind === 'detour');
    var d = perL(t), rows = [];
    function row(k, f, v, cls) {
      return '<div class="oil-cr' + (cls ? ' ' + cls : '') + '"><span class="oil-cr-k">' + k +
        (f ? '<i>' + f + '</i>' : '') + '</span><b class="' + tone(v) + '">' + signed(v) + '</b></div>';
    }
    rows.push(d > 0 ? row('싸게 넣어 아끼는 돈', '리터당 ' + won(d) + '원 × ' + t.L + 'L', t.gain)
            : d < 0 ? row('비싸게 넣어 더 내는 돈', '리터당 ' + won(-d) + '원 × ' + t.L + 'L', t.gain)
            : row('기름값 차이', '리터당 가격이 같습니다', 0));
    if (Math.abs(t.drive) < 0.05) {
      rows.push(row(off ? '더 돌아가는 기름값' : '더 가는 기름값', '더 가는 거리가 없습니다', 0));
    } else {
      var dist = t.round ? km1(t.extra) + ' × 2(왕복)' : km1(t.drive);
      rows.push(row(t.drive < 0 ? '덜 돌아가서 아끼는 기름값' : (off ? '더 돌아가는 기름값' : '더 가는 기름값'),
                    dist + ' ÷ 연비 ' + t.kmpl + 'km/L × ' + won(price) + '원', -t.cost));
    }
    rows.push(row(Math.round(t.net) < 0 ? '결과 (손해)' : '실제로 남는 돈', '', t.net, 'is-sum'));
    return '<div class="oil-crs">' + rows.join('') + '</div>';
  };

  /* 시간은 돈 계산에 넣지 않는다(사람마다 값이 달라서). 대신 판단하라고 보여준다. */
  OIL.timeNote = function (min) {
    if (min == null || isNaN(min)) return '';
    var m = Math.round(min);
    return '<p class="oil-cr-note">' +
      (m >= 1 ? '시간은 약 <b>' + m + '분</b> 더 걸립니다'
              : m <= -1 ? '시간은 약 <b>' + (-m) + '분</b> 덜 걸립니다'
                        : '시간 차이는 거의 없습니다') +
      ' · 시간은 돈 계산에 넣지 않았습니다</p>';
  };

  /* ── 1위 고르기 ─────────────────────────────────────────────
     기본은 남는 돈이 가장 큰 곳이다. 단, 차이가 TIE 원 미만이면 먼저 닿는 곳
     (내 주변: 더 가까운 곳 / 가는 길: 먼저 나오는 곳)을 1위로 올린다.
     몇십 원 더 남기자고 더 멀리 가거나 길을 벗어날 사람은 없고, 그 정도 차이는
     길찾기 경로가 조금만 달라져도 뒤집힌다. 올렸을 때는 화면에 이유를 밝힌다.
     reach(s) = 먼저 닿는 정도 (작을수록 먼저) */
  OIL.TIE = 100;
  OIL.rankTrips = function (all, reach, base) {
    var list = all.slice().sort(function (a, b) {
      if (b._trip.net !== a._trip.net) return b._trip.net - a._trip.net;
      return reach(a) - reach(b);
    });
    var top = list[0], floor = Math.max(0, top._trip.net - OIL.TIE), first = top;
    list.forEach(function (s) {
      if (s._trip.net >= floor && reach(s) < reach(first)) first = s;
    });
    /* 남는 돈이 없으면 기준 주유소가 답이다 - 다른 곳을 1위로 두면 결론 문장과 어긋난다 */
    if (Math.round(first._trip.net) <= 0 && base) first = base;
    if (first === top) return { list: list, tie: null };
    list.splice(list.indexOf(first), 1);
    list.unshift(first);
    return { list: list,
             tie: Math.round(top._trip.net) > Math.round(first._trip.net) ? top : null };
  };

  /* ── 결론 상자: "왜 여기가 1위인가" ──────────────────────────
     o = { best, base, list, all, tie, kind, price(s), reach(s), reachText(s, ref),
           baseName, baseShort, scope, checked, cond }
     사용자가 확인하고 싶은 것은 네 가지다.
       1) 무엇에 비해 얼마가 남나 - 계산 줄로 직접 셀 수 있게
       2) 2위보다는 얼마나 낫나
       3) 제일 싼 곳은 왜 아닌가 - 지도에서 더 싼 가격을 보면 누구나 묻는다
       4) 몇 곳이나 비교했나, 어떤 조건으로 계산했나 */
  OIL.whyHtml = function (o) {
    var esc = OIL.esc, best = o.best, base = o.base, p = o.price;
    var isBase = best === base || Math.round(best._trip.net) <= 0;
    var h = '<section class="oil-why">';
    h += '<div class="oil-why-k">왜 여기를 추천하나요</div>';

    if (isBase) {
      h += '<p class="oil-why-t"><b>' + esc(base.n) + '</b>(' + esc(o.baseShort) + ')에서 ' +
        '넣는 게 제일 낫습니다</p>' +
        '<p class="oil-why-s">' + won(p(base)) + '원 · ' + o.reachText(base) + '</p>';
    } else {
      h += '<p class="oil-why-t"><b>' + esc(best.n) + '</b>에서 넣으면 ' + esc(o.baseShort) +
        '(' + esc(base.n) + ')보다 <b class="is-gain">' + won(best._trip.net) + '원</b> 남습니다</p>' +
        '<p class="oil-why-s">' + won(p(best)) + '원 · ' + o.reachText(best) +
        ' — 비교 기준 ' + esc(base.n) + ' ' + won(p(base)) + '원 · ' + o.reachText(base) + '</p>';
      h += OIL.tripRows(best._trip, p(best), o.kind) + OIL.timeNote(best._tmin);
    }

    var li = [];
    /* 제일 싼 곳 - 1위가 아니면 왜 아닌지 숫자로 보여준다 */
    var cheap = o.all.reduce(function (a, b) {
      return p(b) < p(a) || (p(b) === p(a) && o.reach(b) < o.reach(a)) ? b : a;
    });
    if (o.tie) {
      li.push('<b>' + esc(o.tie.n) + '</b>가 ' + won(o.tie._trip.net - best._trip.net) +
        '원 더 남지만, 차이가 ' + OIL.TIE + '원도 안 돼서 ' +
        (o.kind === 'detour' ? '먼저 나오는' : '더 가까운') + ' 이곳을 골랐습니다');
    } else if (o.list[1] && !(o.list[1] === cheap && p(cheap) < p(best))) {
      /* 2위가 제일 싼 곳이면 아래 줄에서 같이 말한다 - 같은 곳을 두 번 말하지 않는다 */
      var gap = best._trip.net - o.list[1]._trip.net;
      li.push('2위 ' + esc(o.list[1].n) + '보다 ' +
        (Math.round(gap) >= 1 ? '<b>' + won(gap) + '원</b> 더 남습니다' : '남는 돈이 같아서 먼저 닿는 곳을 골랐습니다'));
    }
    if (cheap !== best && p(cheap) < p(best)) {
      var ct = cheap._trip;
      li.push('제일 싼 <b>' + esc(cheap.n) + '</b>(' + won(p(cheap)) + '원)는 ' + o.reachText(cheap) +
        (Math.round(ct.net) > 0
          ? '라 ' + esc(o.baseShort) + '보다 ' + won(ct.net) + '원 남는 데 그칩니다 (1위보다 ' +
            won(best._trip.net - ct.net) + '원 적음)'
          : '라, 싸게 넣어 ' + won(ct.gain) + '원 아껴도 ' +
            (o.kind === 'detour' ? '돌아가는' : '가는') + ' 기름값 ' + won(ct.cost) + '원 때문에 ' +
            (Math.round(ct.net) < 0 ? '<b class="is-cost">' + won(-ct.net) + '원 손해</b>입니다'
                                    : '남는 돈이 없습니다')));
    } else if (cheap === best) {
      li.push('비교한 곳 중 리터당 가격도 제일 쌉니다');
    }
    li.push(o.checked);

    h += '<ul class="oil-why-list">' + li.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>';
    h += '<p class="oil-why-cond"><b>계산 조건</b> ' + o.cond + '</p>';
    return h + '</section>';
  };

  /* ── 카드 목록 고르기 ──────────────────────────────────────
     위에서 n곳 + 비교 기준. 기준이 n위 안에 없으면 맨 끝에 붙인다 - 다른 카드의
     "○○보다 N원 남습니다"가 무엇과 비교한 값인지 눈으로 확인할 수 있어야 한다
     (2026-09-27 사용자 요청). */
  OIL.showList = function (list, base, n) {
    var top = list.slice(0, n);
    return top.indexOf(base) < 0 ? top.concat([base]) : top;
  };
  /* 한도를 넘은 거리. 5.04km 를 5.0km 로 쓰면 "5.0km라 5km를 넘어"가 되어 틀려 보인다 */
  OIL.overKm = function (v, lim) {
    return (v > lim && v.toFixed(1) === lim.toFixed(1) ? v.toFixed(2) : v.toFixed(1)) + 'km';
  };
  /* 순위 띠 옆 한마디 */
  OIL.rankTag = function (i, isBase) {
    if (i === 0) return '<span class="oil-st-why1">추천 · 이유는 위 상자에</span>';
    if (isBase) return '<span class="oil-st-why1 is-base">비교 기준 · 다른 곳 금액은 여기와 비교한 값</span>';
    return '';
  };

  /* ── 비교한 나머지 보기 ──────────────────────────────────────
     카드는 5곳만 보여준다(고르기엔 충분하고 더 늘리면 안 읽는다). 대신 계산에 들어간
     나머지를 접어서 전부 보여준다 - "내가 아는 저 주유소는 왜 없지?"에 답하려고.
     (2026-09-27 사용자가 길가의 같은 가격 주유소를 지나치고 물은 게 이 기능의 출발점)
     o = { rest, rankOf(s), price(s), sub(s), detail(s, why), groups: [{ title, items, sub(s), tag(s), why(s) }] }
       rest   - 순위 안에 든 나머지 (실측값, 기준보다 얼마인지 보여준다)
       groups - 순위에서 빠진 곳과 그 이유 (반경·우회 초과, 1위를 못 이겨 안 잰 곳) */
  OIL.restHtml = function (o) {
    var esc = OIL.esc, p = o.price;
    var groups = (o.groups || []).filter(function (g) { return g.items.length; });
    var total = o.rest.length + groups.reduce(function (n, g) { return n + g.items.length; }, 0);
    if (!total) return '';

    /* 누르면 그 자리에서 상세가 펼쳐진다. 목록을 훑다가 잘못 눌러 지도 앱으로
       넘어가지 않게 길찾기는 연결하지 않는다(2026-09-27 사용자 요청). */
    function row(no, s, sub, tag, det) {
      return '<details class="oil-rest-item"><summary class="oil-rest-row">' +
        '<span class="oil-rest-no">' + no + '</span>' +
        '<span class="oil-rest-name">' + esc(s.n) + '<i>' + sub + '</i></span>' +
        '<span class="oil-rest-fig"><b>' + won(p(s)) + '원</b>' + tag + '</span>' +
        '</summary><div class="oil-rest-det">' + det + '</div></details>';
    }

    var rows = o.rest.map(function (s) {
      var t = s._trip;
      return row(o.rankOf(s), s, o.sub(s),
        s._isBase ? '<em>비교 기준</em>' : '<em class="' + tone(t.net) + '">' + signed(t.net) + '</em>',
        o.detail(s));
    }).join('');

    /* 순위에서 빠진 곳도 한 줄씩 - 운전 중 "지금 지나가는 저 주유소"를 순서대로 찾을 수
       있게. 손익은 순위 밖이라 매기지 않고, 누르면 빠진 이유를 숫자로 보여준다.
       수십 곳이라 묶음째 한 번 더 접어 개수와 이유만 먼저 보인다. */
    var more = groups.map(function (g) {
      return '<details class="oil-rest-g"><summary>' + g.title + ' <b>' + g.items.length + '곳</b></summary>' +
        '<div class="oil-rest-list">' + g.items.map(function (s) {
          return row('', s, g.sub(s), '<em>' + g.tag(s) + '</em>', o.detail(s, g.why(s)));
        }).join('') + '</div></details>';
    }).join('');

    return '<details class="oil-rest"><summary>비교한 나머지 <b>' + total + '곳</b> 보기</summary>' +
      (rows ? '<p class="oil-rest-h">금액은 ' + esc(o.baseShort) + '보다 남는 돈입니다 · 누르면 상세보기</p>' +
              '<div class="oil-rest-list">' + rows + '</div>' : '') +
      more + '</details>';
  };

  /* 계산 조건 한 줄. 사용자가 고른 값이 그대로 들어갔는지 눈으로 확인하게 한다. */
  OIL.condText = function (kind, meta) {
    var P = OIL.prefs, car = P.car();
    var move = kind === 'detour'
      ? '들렀다 가느라 더 달리는 거리(카카오 길찾기 실측)'
      : (P.isRound() ? '왕복 — 갔다가 돌아오는 거리까지' : '편도 — 주유소까지 가는 거리만');
    return P.fuelName() + ' · ' + car.label + ' 연비 ' + car.kmpl + 'km/L · 주유 ' + P.liters() + 'L · ' +
      move + ' · 가격은 ' + OIL.asOf(meta) + ' 오피넷 판매가 · 시간·통행료·카드 할인은 넣지 않았습니다';
  };

  /* ── 받을 동네 고르기 ───────────────────────────────────────
     동네 파일마다 주유소가 실제로 퍼져 있는 범위(bb: 남·서·북·동)가 있다.
     그 범위가 찾는 곳(점들 + km 여유)과 겹치는 동네는 전부 받는다.
     전에는 동네 중심 거리로 몇 곳만 받아서, 경계 건너편 주유소가 통째로 빠졌다
     (2026-09-27 실측: 서울→인천 경로의 길가 주유소 30곳이 전부 빠졌다). */
  OIL.regionsHit = function (items, pts, km) {
    var dla = km / 110.57;
    var hit = items.filter(function (r) {
      var b = r.bb;
      if (!b) return false;
      var dln = km / (111.32 * Math.cos(r.la * Math.PI / 180));
      for (var i = 0; i < pts.length; i++) {
        var q = pts[i];
        if (q.la >= b[0] - dla && q.la <= b[2] + dla && q.ln >= b[1] - dln && q.ln <= b[3] + dln) return true;
      }
      return false;
    });
    if (hit.length || items.some(function (r) { return r.bb; })) return hit;
    /* 범위 정보가 없는 옛 데이터 - 가까운 동네 순으로 넉넉히 받는다 */
    return items.filter(function (r) { return r.la != null; }).map(function (r) {
      var d = Infinity;
      pts.forEach(function (q) { d = Math.min(d, OIL.distKm(q.la, q.ln, r.la, r.ln)); });
      return { r: r, d: d };
    }).filter(function (x) { return x.d <= km + 15; })
      .sort(function (a, b) { return a.d - b.d; }).slice(0, 12)
      .map(function (x) { return x.r; });
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

  /* ── 어디서 열렸나 · 위치가 왜 막혔나 ──────────────────────
     '내 주변'과 '가는 길' 둘 다 위치로 시작한다. 실패했을 때 하는 말이
     화면마다 다르면 같은 상황에서 다른 안내를 보게 된다 - 여기 한 곳에
     모아두고 두 화면이 같이 쓴다. 대신 '무엇으로 대신할지'(동네로 찾기 /
     출발지 정하기)는 화면마다 달라서 부르는 쪽이 붙인다. */
  var ENV = OIL.env = {};

  /* 남의 사이트 안에 끼워져 있는가(iframe). 끼워진 화면에는 브라우저가
     위치를 아예 안 내준다 - 바깥 사이트가 allow="geolocation" 을
     붙여주지 않으면 거부로 떨어진다. window.top 을 읽다 막혀도 남의 집이다. */
  ENV.inFrame = function () {
    try { return window.top !== window.self; } catch (e) { return true; }
  };

  /* 앱이 품고 있는 브라우저(인앱 브라우저)인가.
     ★ 안드로이드 스레드의 UA 는 'Threads' 가 아니라 'Barcelona' 다
       (스레드의 개발 시절 이름). 이것 때문에 스레드 유입을 놓쳤었다. */
  ENV.app = function () {
    var ua = navigator.userAgent || '';
    if (/Barcelona|Threads/i.test(ua)) return '스레드';
    if (/Instagram/i.test(ua)) return '인스타그램';
    if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return '페이스북';
    if (/KAKAOTALK/i.test(ua)) return '카카오톡';
    if (/NAVER\(inapp|NAVER\//i.test(ua)) return '네이버 앱';
    if (/Line\//i.test(ua)) return '라인';
    if (/DaumApps/i.test(ua)) return '다음 앱';
    if (/everytimeApp|BAND|TwitterAndroid|Snapchat/i.test(ua)) return '앱 안 브라우저';
    return '';
  };

  /* 휴대폰 '설정 → 애플리케이션' 목록에 적혀 있는 이름.
     우리는 읽기 좋으라고 '인스타그램'이라 부르지만 설정에는 'Instagram' 으로
     뜬다 - 안내대로 따라갔는데 그 이름이 없으면 거기서 멈춘다. */
  var SYSNAME = {
    '스레드': 'Threads', '인스타그램': 'Instagram', '페이스북': 'Facebook',
    '라인': 'LINE', '다음 앱': 'Daum'
  };
  ENV.appSysName = function () {
    var a = ENV.app();
    /* 어느 앱인지 못 알아본 경우(에브리타임·밴드 등 뭉뚱그린 이름)에는
       설정에서 찾을 이름이 없다. "애플리케이션 → 앱 안 브라우저" 를 찾으라고
       하면 그런 앱이 없어서 거기서 멈춘다. 사람 말로 바꿔준다. */
    if (!a || a === '앱 안 브라우저') return '지금 쓰고 계신 앱';
    return SYSNAME[a] || a;
  };

  /* 안내 제목에 쓸 이름. '앱 안 브라우저 앱에 …' 처럼 겹쳐 읽히지 않게 한다.
     ★ 권한은 앱마다 따로다. 인스타를 켜줬다고 스레드가 되지는 않는다 -
       안드로이드·아이폰 둘 다 설치된 앱 단위로 권한을 준다. 그래서 여기서
       고른 이름이 곧 사용자가 설정에서 찾아야 할 앱이다. */
  ENV.appLabel = function () {
    var a = ENV.app();
    return (!a || a === '앱 안 브라우저') ? '지금 쓰는 앱' : a + ' 앱';
  };

  ENV.isAndroid = function () { return /Android/i.test(navigator.userAgent || ''); };
  ENV.isIOS = function () { return /iPhone|iPad|iPod/i.test(navigator.userAgent || ''); };

  /* ── 앱 안 브라우저를 빠져나와 크롬으로 ─────────────────────
     두 운영체제가 방법이 다르다.

     안드로이드 intent:// - 확실하다. 크롬이 없으면 S.browser_fallback_url
       덕에 기본 브라우저로라도 열린다. 그냥 <a href> 면 끝.

     아이폰 googlechromes:// - 크롬 iOS 가 가진 자기 주소다. https 를
       googlechromes 로, http 를 googlechrome 으로 바꿔 넣으면 크롬이 뜬다.
       ★ 다만 안드로이드와 달리 보장이 없다. (1) 크롬이 안 깔려 있으면
         아무 일도 안 일어나고, (2) 앱마다 이런 주소를 막아두기도 한다.
         실패해도 알려주지 않아서 버튼이 먹통처럼 보인다 - 그래서 눌러보고
         1.2초 안에 화면이 안 바뀌면 손으로 하는 법을 대신 띄운다
         (ENV.wireIosChrome). */
  ENV.chromeIntent = function () {
    var bare = location.href.replace(/^https?:\/\//, '');
    return 'intent://' + bare + '#Intent;scheme=https;package=com.android.chrome;' +
      'S.browser_fallback_url=' + encodeURIComponent(location.href) + ';end';
  };

  ENV.iosChromeUrl = function () {
    return location.href.replace(/^https:/, 'googlechromes:')
                        .replace(/^http:/, 'googlechrome:');
  };

  /* 아이폰용 [크롬으로 열기] 버튼을 살린다.
     성공하면 우리 화면은 뒤로 물러나므로 visibilitychange/pagehide 가 온다.
     아무 일도 없으면 실패다 - 그때만 손으로 하는 법을 보여준다.
     ★ 시계도 같이 본다. 크롬으로 넘어가면 이 화면이 멈춰 setTimeout 이
       한참 뒤에야 깨는데, 그때 안내를 띄우면 돌아왔을 때 실패한 것처럼 뜬다. */
  ENV.wireIosChrome = function (btnId, tipId) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', function () {
      var t0 = Date.now(), left = false;
      function gone() { left = true; }
      document.addEventListener('visibilitychange', gone);
      window.addEventListener('pagehide', gone);
      try { location.href = ENV.iosChromeUrl(); } catch (e) { left = false; }
      setTimeout(function () {
        document.removeEventListener('visibilitychange', gone);
        window.removeEventListener('pagehide', gone);
        if (left || document.visibilityState !== 'visible') return;
        if (Date.now() - t0 > 2500) return;      /* 화면이 멈췄다 돌아온 것 */
        var tip = document.getElementById(tipId);
        if (tip) tip.hidden = false;
        btn.disabled = true;
      }, 1200);
    });
  };

  ENV.allowHint = function () {
    if (ENV.isIOS()) {
      return '아이폰은 <b>설정 → 개인정보 보호 및 보안 → 위치 서비스</b>를 켜고, ' +
             '그 안에서 <b>Safari 웹사이트</b>(크롬을 쓰시면 <b>Chrome</b>)를 ' +
             '<b>앱을 사용하는 동안</b>으로 바꿔주세요. 그다음 이 화면을 새로고침하시면 됩니다.';
    }
    return '주소창 왼쪽 <b>자물쇠</b>를 누르고 <b>위치</b>(안드로이드는 <b>권한 → 위치</b>)를 ' +
           '<b>허용</b>으로 바꾼 뒤 다시 눌러주세요.';
  };

  /* 앱 안에서 빠져나가는 버튼. 이제는 '유일한 길'이 아니라 '곁다리 길'이라
     흐린 단추로 둔다 - 앱 권한만 켜면 앱 안에서도 되기 때문이다. */
  function chromeBtn(solid) {
    var c = 'oil-locate' + (solid ? '' : ' is-ghost');
    return ENV.isAndroid()
      ? '<a class="' + c + '" href="' + ENV.chromeIntent() + '">크롬으로 열기</a>'
      : '<button type="button" class="' + c + '" id="oil-loc-chrome">' +
          '크롬으로 열기</button>' +
        '<div class="oil-locate-tip" id="oil-loc-tip" hidden>' +
          '크롬이 열리지 않았습니다. 오른쪽 위 <b>⋯</b>(또는 <b>⋮</b>)를 눌러 ' +
          '<b>브라우저로 열기</b>를 골라주세요.</div>';
  }

  /* 크롬에 담아두는 길. 안드로이드는 오른쪽 위, 아이폰 크롬은 오른쪽 아래에
     있지만 둘 다 '점 세 개' 메뉴다 - 자리를 말하면 한쪽이 틀리므로 이름만 쓴다.
     ★ '⋮' 글자를 그대로 쓰면 글꼴에 없을 때 쌍점(:)처럼 보인다. 말로 적는다. */
  function homeAddPath() {
    return '크롬에서 <b>점 세 개</b> 메뉴 → <b>홈 화면에 추가</b>';
  }

  /* ★★ 위치를 아예 안 내주는 게 확인된 앱 (2026-09-24 스레드/안드로이드 실측).
     휴대폰에서 스레드에 위치 권한을 켜줘도 **권한 창조차 안 뜬다** - 막는 자리가
     OS 가 아니라 그 앱의 브라우저다.
     ★ 그래서 실패 이유가 무엇으로 오든(거부·못구함·시간초과) 안내는 하나여야
       한다. 처음엔 '1.5초 안에 거부되면'이라는 시간으로만 갈랐는데, 앱이 조금
       늦게 답하면 다른 갈래로 새서 **권한을 켜보라는 문구가 다시 나왔다.**
       이미 켜본 사람에게 또 켜라는 말이라 혼란만 준다 - 앱 이름으로 확실히 잡는다.
     아이폰 스레드는 아직 못 재봤지만, 여기 오는 건 이미 실패한 뒤이고
     '크롬으로 열기'는 어느 쪽이든 맞는 답이라 같이 넣는다. */
  var NO_GEO = { '스레드': 1 };
  ENV.appBlocksGeo = function () { return !!NO_GEO[ENV.app()]; };

  /* 그 앱에서 보여줄 안내. 권한 얘기는 한 글자도 넣지 않는다.
     ★ 내 주변·가는 길이 같은 이 함수를 쓰므로 두 화면 문구가 저절로 같아진다. */
  function chromeOnlyWhy(app) {
    var an = (!app || app === '앱 안 브라우저') ? '이 앱' : app;
    return {
      head: an + ' 안에서는 위치를 쓸 수 없습니다',
      why: '<b>' + OIL.esc(an) + '</b>가 위치를 안 내줍니다 — 권한 창도 뜨지 않고, ' +
           '<b>휴대폰 설정을 바꿔도 달라지지 않습니다.</b><br>' +
           '아래 <b>[크롬으로 열기]</b>를 누르면 바로 됩니다.<br>' +
           '<b>자주 쓰실 거면</b> ' + homeAddPath() + '까지 해두세요. ' +
           '다음부터는 아이콘 한 번이면 되고, 위치도 다시 묻지 않습니다.',
      extra: chromeBtn(true), solid: true, noRetry: true
    };
  }

  /* 휴대폰 설정에서 그 앱의 위치 권한을 켜는 길. 세 군데에서 쓴다.
     ★ 앱마다 따로 준다 - 인스타를 켜줬다고 스레드가 되지 않는다. */
  function appPermPath() {
    var sys = OIL.esc(ENV.appSysName());
    return ENV.isIOS()
      ? '<b>설정 → 개인정보 보호 및 보안 → 위치 서비스 → ' + sys + '</b>을 ' +
        '<b>앱을 사용하는 동안</b>으로'
      : '<b>설정 → 애플리케이션 → ' + sys + ' → 권한 → 위치</b>를 ' +
        '<b>앱 사용 중에만 허용</b>으로';
  }

  /* kind: 'deny' 권한 거부 / 'appperm' 앱에 위치 권한 없음 /
           'unavail' 위치를 못 구함 / 'slow' 시간 초과 / 'none' 위치 기능 없음
     돌려주는 것: { head 제목, why 설명, extra 추가 버튼 HTML, solid 추가버튼이 주버튼인가 } */
  ENV.locateWhy = function (kind) {
    var app = ENV.app();
    var esc = OIL.esc;

    if (ENV.inFrame()) {
      return {
        head: '이 화면은 다른 사이트 안에 들어 있습니다',
        why: '끼워 넣어진 화면에는 브라우저가 위치를 내주지 않습니다. ' +
             '아래 <b>새 창에서 열기</b>를 누르면 바로 됩니다.',
        extra: '<button type="button" class="oil-locate" id="oil-loc-newwin">' +
               '새 창에서 열기</button>',
        solid: true
      };
    }

    /* ★★ 위치를 아예 안 내주는 앱(스레드)은 실패 이유를 가리지 않고 여기서 끝낸다.
       거부가 1.5초 안에 오면 autodeny, 늦게 오면 deny, 아예 답이 없으면 slow 로
       갈라지는데 **어느 쪽이든 답은 크롬 하나**다. 시간으로만 갈랐더니 조금 늦게
       답하는 날엔 아래 갈래로 새서 '권한을 켜세요'가 다시 떴고, 이미 켜본 분께
       또 켜라는 말이라 혼란만 줬다. 그래서 앱 이름으로 먼저 잡는다. */
    if (ENV.appBlocksGeo()) return chromeOnlyWhy(app);

    /* ★ 앱 자체에 위치 권한이 없는 경우 (2026-09-24 인스타그램/안드로이드 실측).
       사이트에는 [허용]을 눌러줬는데도 code 2 로 0.0초에 즉시 실패하고, 메시지가
       'application does not have sufficient geolocation permissions' 였다.
       앱이 휴대폰에서 위치 권한을 못 받아 우리에게 건네줄 게 없는 것이다.
       ★ 이건 사용자가 고칠 수 있고 한 번 켜면 계속 된다 - 같은 기기에서 권한을
         켜고 다시 재니 6.9초에 100m 정확도로 잡혔다. 그래서 '크롬으로 열기'보다
         이쪽을 먼저 안내한다. 앱을 나갈 필요가 없다. */
    if (kind === 'appperm') {
      var nm = ENV.appLabel();
      return {
        head: nm + '에 위치 권한이 없습니다',
        why: '<b>' + esc(nm) + '</b> 자체가 휴대폰에서 위치 권한을 받지 못해, ' +
             '이 화면에 넘겨줄 위치가 없습니다.<br>' +
             appPermPath() + ' 바꿔주세요.' +
             '<br><b>한 번만 켜두면 그다음부터는 계속 됩니다.</b> ' +
             '켜신 뒤 아래 <b>[위치 다시 시도]</b>를 눌러주세요.',
        extra: chromeBtn()
      };
    }

    /* ★ 앱이 묻지도 않고 거절한 경우 (2026-09-24 스레드에서 확인).
       인스타그램은 권한 창을 띄워주는데 스레드는 **창 자체가 안 뜨고** 바로
       거부로 끝난다. 휴대폰 설정에서 스레드 위치 권한을 켜도 마찬가지다 -
       막는 자리가 OS 가 아니라 그 앱의 브라우저라서 설정으로는 안 풀린다.
       ★ 그래서 여기서는 '앱 권한을 켜세요'를 주버튼으로 두면 안 된다.
         켜봐야 창이 안 뜬다. 크롬으로 나가는 게 유일하게 확실한 길이라
         이때만 [크롬으로 열기]를 진한 버튼으로 올린다.
       다만 아이폰은 앱 권한이 없을 때도 이렇게 보일 수 있어서, 아직 안
       켜보신 분을 위해 설정 경로도 한 줄 남겨둔다. */
    if (kind === 'autodeny') {
      var an = (app === '앱 안 브라우저' ? '이 앱' : app);
      /* ★ 안드로이드에서는 '설정을 켜보세요'를 아예 빼고 [위치 다시 시도]도 없앤다.
         안드로이드에서 앱 권한이 없는 경우는 code 2 + 영어 메시지로 따로 오는 걸
         확인했다(인스타). 즉 여기 온 건 **권한 문제가 아니라 앱이 거부하는 것**이다.
         헛걸음을 시키면 안 된다 - 설정을 이미 켜둔 사람에게 또 켜라고 하는 셈이다.
         아이폰은 앱 권한 없는 경우도 이렇게 보일 수 있어 그쪽만 남겨둔다. */
      if (ENV.isAndroid()) return chromeOnlyWhy(app);
      return {
        head: an + ' 안에서는 위치를 물어보지도 않습니다',
        why: '권한 창이 <b>뜨지도 않고 바로 거절</b>됐습니다. ' +
             '아래 <b>[크롬으로 열기]</b>가 확실한 길이고, ' +
             '<b>자주 쓰실 거면</b> 크롬에서 <b>홈 화면에 추가</b>까지 해두시면 ' +
             '다음부터 아이콘 한 번입니다.<br>' +
             '<span style="opacity:.8">아직 안 해보셨다면 ' + appPermPath() +
             ' 바꾸고 <b>[위치 다시 시도]</b>도 한 번은 해볼 만합니다.</span>',
        extra: chromeBtn(true),
        solid: true
      };
    }

    /* ★ 앱 안에서 실패하면 이유를 콕 집을 수가 없다 (2026-09-24 실측).
       위 'appperm' 판정은 안드로이드 웹뷰가 주는 영어 메시지에 기대는데,
       **앱마다 답이 다르다.** 같은 안드로이드인데도
         인스타그램 - code 2 + 그 메시지        -> 위에서 정확히 잡힌다
         스레드     - code 1 (그냥 '거부')        -> 못 잡는다
       아이폰(WKWebView)도 마찬가지로 '거부'로만 알려준다.
       ★ 처음엔 이 안내를 아이폰에만 달아뒀는데, 그래서 스레드에서 들어온
         사람은 "권한이 꺼져 있습니다"만 보고 **앱 권한을 켜는 법을 못 봤다.**
         운영체제가 아니라 '앱 안인가'로 갈라야 한다.
       한쪽만 찍어 말했다가 틀리면 맞는 해결책을 아예 못 보게 되므로 둘 다 적는다. */
    if (app && (kind === 'deny' || kind === 'unavail')) {
      return {
        head: (app === '앱 안 브라우저' ? '앱' : app) + ' 안에서 위치를 못 받았습니다',
        why: '둘 중 하나입니다.<br>' +
             '<b>①</b> <b>' + esc(ENV.appLabel()) + '</b> 자체에 위치 권한이 없는 경우 — ' +
             appPermPath() + ' 바꾸고 아래 <b>[위치 다시 시도]</b>. ' +
             '<b>한 번만 켜두면 계속 됩니다.</b><br>' +
             '<b>②</b> 방금 창에서 <b>[차단]</b>을 누르신 경우 — 앱 안 브라우저는 ' +
             '되돌릴 자리가 없어서, 아래에서 크롬으로 열어 다시 하셔야 합니다.',
        extra: chromeBtn()
      };
    }

    if (kind === 'none') {
      return { head: '이 브라우저는 위치 기능을 쓸 수 없습니다',
               why: '아래에서 동네나 장소 이름으로 찾아주세요.', extra: '' };
    }
    /* 여기부터는 앱 안이 아닌 경우다 (앱 안 + deny/unavail 은 위에서 끝났다) */
    if (kind === 'deny') {
      return { head: '위치 권한이 꺼져 있습니다', why: ENV.allowHint(), extra: '' };
    }
    if (kind === 'unavail') {
      return {
        head: '위치를 찾지 못했습니다',
        why: (ENV.isAndroid() || ENV.isIOS())
          ? '기기가 위치를 내주지 못했습니다. <b>휴대폰 설정에서 위치(GPS)</b>가 ' +
            '꺼져 있지 않은지 보시고, 그래도 안 되면 아래에서 동네 이름으로 찾아주세요.'
          : '<b>컴퓨터는 위치 장치가 없어</b> 인터넷 주소로 어림잡는데, 그게 자주 ' +
            '실패합니다. 기다린다고 되지는 않습니다 — 휴대폰에서는 대개 잡히고, ' +
            '지금은 아래에서 <b>동네 이름으로 찾으시면 결과는 똑같습니다.</b>',
        extra: '' };
    }
    /* 시간 초과. 앱 안이라면 '앱이 답을 안 준 것'일 수도 있으니 그 길도 알려준다 -
       실내·지하 탓만 하면 정작 고칠 수 있는 사람이 못 고친다. */
    return { head: '위치 확인이 오래 걸립니다',
             why: 'GPS로 한 번 더 해봤는데도 시간이 넘었습니다. ' +
                  '실내나 지하에서 자주 그렇습니다.' +
                  (app
                    ? '<br><b>' + esc(ENV.appLabel()) + '</b> 자체에 위치 권한이 없어도 ' +
                      '이렇게 됩니다 — ' + appPermPath() + ' 바꿔보세요. ' +
                      '<b>한 번만 켜두면 계속 됩니다.</b>'
                    : ' 다시 시도하거나, 동네 이름으로 바로 찾으셔도 됩니다.'),
             extra: app ? chromeBtn() : '' };
  };

  /* 위 extra 에 들어간 버튼들을 살린다 - 어느 쪽이든 없으면 그냥 넘어간다 */
  ENV.wireWhy = function () {
    var w = document.getElementById('oil-loc-newwin');
    if (w) {
      w.addEventListener('click', function () {
        window.open(location.href, '_blank', 'noopener');
      });
    }
    ENV.wireIosChrome('oil-loc-chrome', 'oil-loc-tip');
  };

  /* ── 자주 쓰는 사람에게만 - 홈 화면에 추가 권유 ─────────────
     앱 안 브라우저는 '이 사이트에 위치를 허용' 을 기억하지 않는다. 그래서
     들어올 때마다 팝업을 본다. 우리가 고칠 수 있는 자리가 아니다 - 웹페이지에는
     "이 허용을 기억해줘"라고 부탁할 방법이 아예 없다. 크롬·사파리는 기억하므로,
     자주 쓸 사람에게는 그쪽으로 옮겨 홈 화면에 담아두시라고 권한다.

     ★ 아무에게나 띄우면 안 된다. 방문자 대부분은 한 번 보고 간다 - 그분들에게는
       그냥 성가신 광고다. **자주 쓴다는 증거가 있는 사람에게만** 띄운다.
         (1) 3번째 방문부터          - 다시 찾아온 사람
         (2) 한 방문에 위치를 두 번  - 팝업을 두 번 본, 불편을 직접 겪은 사람
       (2) 가 필요한 이유: 앱 안 브라우저는 저장소를 지우는 경우가 있어 방문
       횟수가 안 쌓인다. 그러면 정작 제일 불편한 사람에게 안 뜬다.
     ★ 한 번 닫으면 영구히 안 뜬다. 두 번 권하면 그때부터는 방해물이다. */
  var TIPKEY = 'oil.hometip', LOCKEY = 'oil.loccount';

  ENV.noteLocated = function () {
    try {
      var n = (parseInt(sessionStorage.getItem(LOCKEY), 10) || 0) + 1;
      sessionStorage.setItem(LOCKEY, String(n));
    } catch (e) { }
  };

  function tipEarned() {
    try { if (localStorage.getItem(TIPKEY) === 'x') return false; } catch (e) { }
    var visits = (OIL.prefs && OIL.prefs.get('visits')) || 0;
    if (visits >= 3) return true;
    try { return (parseInt(sessionStorage.getItem(LOCKEY), 10) || 0) >= 2; } catch (e) { }
    return false;
  }

  ENV.homeTipHtml = function () {
    if (!tipEarned()) return '';
    var app = ENV.app();
    var head, body, act = '';

    if (app) {
      head = '매번 위치를 물어보죠?';
      body = '<b>' + OIL.esc(app) + '</b>은 위치 허용을 기억하지 않습니다. ' +
             '<b>크롬으로 열어 홈 화면에 추가</b>해두면 다음부터 아이콘 한 번으로 ' +
             '열리고, 위치도 다시 묻지 않습니다.';
      act = ENV.isAndroid()
        ? '<a class="oil-hometip-go" href="' + ENV.chromeIntent() + '">크롬으로 열기</a>'
        : '<button type="button" class="oil-hometip-go" id="oil-tip-chrome">' +
            '크롬으로 열기</button>' +
          '<div class="oil-locate-tip" id="oil-tip-chrome-t" hidden>' +
            '크롬이 열리지 않았습니다. 오른쪽 위 <b>⋯</b> → <b>브라우저로 열기</b></div>';
    } else {
      head = '자주 쓰시네요';
      /* ★ 아이콘 글자는 믿지 말 것. '⋮' 는 글꼴에 없으면 쌍점(:)처럼 보여서
         "오른쪽 위 : 를 누르세요"가 된다(2026-09-24 실제로 그렇게 나왔다).
         무엇을 누르는지는 **말로** 적고, 아이콘은 곁들이기만 한다. */
      body = '<b>홈 화면에 추가</b>해두면 앱처럼 한 번에 열립니다.<br>' +
             (ENV.isIOS()
               ? '아래 <b>공유</b> <span class="oil-hometip-k">↑</span> → ' +
                 '<b>홈 화면에 추가</b>'
               : '오른쪽 위 <b>점 세 개</b> <span class="oil-hometip-k">⋮</span> → ' +
                 '<b>홈 화면에 추가</b>');
    }

    return '<div class="oil-hometip" id="oil-hometip">' +
      '<button type="button" class="oil-hometip-x" id="oil-hometip-x" ' +
        'aria-label="다시 보지 않기">✕</button>' +
      '<b class="oil-hometip-h">' + head + '</b>' +
      '<p class="oil-hometip-p">' + body + '</p>' + act + '</div>';
  };

  ENV.wireHomeTip = function () {
    ENV.wireIosChrome('oil-tip-chrome', 'oil-tip-chrome-t');
    var x = document.getElementById('oil-hometip-x');
    if (!x) return;
    x.addEventListener('click', function () {
      var box = document.getElementById('oil-hometip');
      if (box) box.parentNode.removeChild(box);
      try { localStorage.setItem(TIPKEY, 'x'); } catch (e) { }
    });
  };

  /* ── 앱 안이라고 미리 알려주던 띠는 뺐다 (2026-09-24) ────────
     "OO 안에서 보고 계십니다. 내 주변 찾기는 브라우저에서 열어야 됩니다" 라는
     띠를 화면 맨 위에 띄웠었다. 그 전제가 실측으로 깨졌다 - 앱 안에서도
     위치는 된다(인스타그램/안드로이드, 6.9초, 오차 100m). 앱에 위치 권한을
     준 사람에게 "여기선 안 됩니다"라고 말하는 셈이라 거짓말이 된다.
     ★ 이제는 미리 겁주지 않고, 실패했을 때 그 이유를 정확히 짚어준다.
       앱 권한이 없는 경우는 0.0초에 판정되므로 기다리게 하지도 않는다.
     되살리려면 git 에서 이 커밋 이전의 ENV.bannerHtml / .oil-inapp 을 본다. */

  /* ── 위치 받기 (모든 화면이 같이 쓴다) ──────────────────────
     onFail(kind) 로 'deny'|'appperm'|'unavail'|'slow'|'none' 을 돌려준다.

     ★★ 기다릴 시간은 '권한 창이 떠 있을지'로 정한다 (2026-09-24 실측).
       타이머는 권한 창이 떠 있는 동안에도 계속 흐른다. 짧게 잡으면 사용자가
       [허용]을 누르기도 전에 우리가 요청을 죽인다. 인스타그램 안에서 재보니
       성공까지 6.9초가 걸렸는데 그 대부분이 창을 읽고 누르는 시간이었다 -
       예전의 '앱 안이면 5초 컷'이 바로 이 사고였다. 될 사람을 끊고 있었다.
       앱 안이라고 짧게 끊지 않는다. 앱 안에서도 위치는 된다.

     ★ 앱 안 브라우저가 못 준다는 건 틀린 전제였다. 인스타그램은 위치 요청을
       제대로 구현해뒀고 권한 창도 띄운다. 막히는 건 한 겹 아래 - 인스타 앱
       자체가 휴대폰에서 위치 권한을 못 받았을 때다(아래 'appperm'). */
  var WAIT = {
    prompt:  30000,   /* 창을 읽고 누를 시간까지 준다 */
    granted: 8000,    /* 이미 허락했으니 바로 와야 한다 */
    gps:     15000    /* 2차 - 위성을 잡는 시간 */
  };

  /* 실패 이유를 가른다.
     ★ code 2 인데 메시지에 'sufficient geolocation permissions' 가 있으면
       브라우저가 위치를 못 구한 게 아니라 **앱 자체에 위치 권한이 없는** 것이다.
       인스타그램/안드로이드에서 실제로 이 메시지를 받았다(2026-09-24).
       사이트에는 [허용]을 눌러줬는데도 0.0초에 즉시 실패한다 - 기다린다고
       되지 않고, 휴대폰 설정에서 그 앱의 권한을 켜야 한다. */
  /* ★ 앱 안에서 '거부'가 눈 깜짝할 새에 오면, 사용자가 [차단]을 누른 게 아니다.
     창이 뜨고 그걸 읽고 손가락이 닿기까지 1.5초는 절대 안 걸린다.
     **앱이 묻지도 않고 대신 거절한 것**이다 (2026-09-24 스레드에서 확인 -
     인스타는 창이 뜨는데 스레드는 아예 안 뜨고 바로 실패한다).
     이때는 휴대폰 설정을 아무리 만져도 창이 안 뜨므로, 안내가 달라야 한다. */
  var INSTANT = 1500;

  function failKind(err, ms) {
    var code = err ? err.code : 0;
    var msg = (err && err.message) || '';
    if (code === 2 && /sufficient\s+geolocation\s+permissions/i.test(msg)) return 'appperm';
    if (code === 1 && ENV.app() && ms < INSTANT) return 'autodeny';
    return code === 1 ? 'deny' : code === 2 ? 'unavail' : 'slow';
  }

  ENV.locate = function (onOk, onFail, onStep) {
    if (!navigator.geolocation) { onFail('none'); return; }

    function attempt(gps, ms) {
      /* 30초를 말없이 기다리면 멈춘 화면처럼 보인다. 중간에 한 번 말을 건다 -
         권한 창이 다른 화면에 가려 안 보이는 경우도 이 말로 알아챈다. */
      var t0 = Date.now();
      var nudge = null;
      if (onStep && ms >= 20000) {
        nudge = setTimeout(function () {
          onStep('아직 기다리는 중입니다. 위치 창이 떠 있으면 [허용]을 눌러주세요.');
        }, 8000);
      }
      function stop() { if (nudge) { clearTimeout(nudge); nudge = null; } }

      navigator.geolocation.getCurrentPosition(function (pos) {
        stop();
        ENV.noteLocated();   /* 한 방문에 두 번이면 '자주 쓰는 사람'으로 본다 */
        onOk(pos);
      }, function (err) {
        stop();
        var kind = failKind(err, Date.now() - t0);
        /* 시간 초과일 때만 GPS 로 한 번 더. 나머지는 다시 해도 같은 답이다. */
        if (!gps && kind === 'slow') {
          if (onStep) onStep('GPS로 한 번 더 잡아보는 중... (최대 15초)');
          attempt(true, WAIT.gps);
          return;
        }
        onFail(kind);
      }, { enableHighAccuracy: !!gps, timeout: ms, maximumAge: gps ? 0 : 300000 });
    }

    /* 권한 상태를 모를 때 가는 길. 창이 뜬다고 보고 넉넉히 기다린다. */
    function askFresh() {
      if (onStep) onStep('위치를 물어보는 창이 뜹니다. [허용]을 눌러주세요.');
      attempt(false, WAIT.prompt);
    }

    /* ★ 사파리(아이폰)는 Permissions API 가 있어도 'geolocation' 은 모른다.
       거절된 약속으로 오는 게 보통이지만, 그 자리에서 예외를 던지는 구현도 있다.
       그러면 여기서 통째로 죽어 버튼이 영영 '확인 중'으로 멈춘다 - try 로 감싼다.
       결국 아이폰은 늘 이 길로 온다(상태를 알 수 없으니 넉넉히 기다린다). */
    var q = null;
    try {
      if (navigator.permissions && navigator.permissions.query) {
        q = navigator.permissions.query({ name: 'geolocation' });
      }
    } catch (e) { q = null; }

    if (q && q.then) {
      q.then(function (st) {
        if (st.state === 'denied') { onFail('deny'); return; }
        if (st.state === 'granted') { attempt(false, WAIT.granted); return; }
        askFresh();
      }).catch(askFresh);
    } else {
      askFresh();
    }
  };

  /* ── 광고 ──────────────────────────────────────────────────
     자리마다 광고 단위 번호를 나눈다.
       kind='top'  화면 맨 위      (adSlotTop)
       그 외        내용 중간       (adSlot)
     모양 때문이 아니다 - 둘 다 format=auto 라 애드센스가 폭을 보고 알아서
     고른다. 나누는 실익은 수익 보고서에서 어느 자리가 돈이 되는지
     갈라 보는 것이다. */
  OIL.adHtml = function (kind) {
    var slot = (kind === 'top' && CFG.adSlotTop) ? CFG.adSlotTop : CFG.adSlot;
    if (!CFG.adClient || !slot) return '';
    return '<div class="oil-ad"><div class="oil-ad-label">광고</div>' +
      '<ins class="adsbygoogle" style="display:block"' +
      ' data-ad-client="' + CFG.adClient + '"' +
      ' data-ad-slot="' + slot + '"' +
      ' data-ad-format="auto" data-full-width-responsive="true"></ins></div>';
  };
  /* 광고 자리. 개발 중(ADS_ON=False)에도 자리는 남겨둬야 나중에 광고를 켤 때
     화면이 밀리지 않는다. 그래서 빈 상자를 같은 크기로 그려둔다. */
  OIL.adSlotHtml = function (kind) {
    var ad = OIL.adHtml(kind);
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

  OIL.chev = function (color) {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="' +
      (color || '#5B666A') + '" stroke-width="2.5" aria-hidden="true">' +
      '<path d="M9 6l6 6-6 6"></path></svg>';
  };
})();
