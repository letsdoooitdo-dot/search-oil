/* 주유소찾기 - 블로그 글 보조
   글 본문은 블로그스팟 편집기에 붙여넣는 것이라 <script> 를 쓸 수 없다.
   그래서 본문에는 '표시'만 남기고 실제 일은 여기서 한다.

     <div class="oil-ad-here"></div>      -> 그 자리에 광고를 끼워 넣는다
     <span data-oil="selfGap"></span>     -> 오늘 데이터 값으로 채운다

   덕분에 글을 다시 쓰지 않아도 숫자가 매일 최신이 된다.
*/
(function () {
  'use strict';

  var OIL = window.OIL;
  if (!OIL || window.OIL_MODE !== 'blog') return;

  var won = OIL.won;

  /* 본문에서 쓸 수 있는 값들 */
  var FIELD = {
    date: function (m) { return OIL.dateKo(m.date); },
    phase: function (m) { return m.phase; },
    gasN: function (m) { return won(m.gas.n); },
    gasMedian: function (m) { return won(m.gas.median); },
    gasLow: function (m) { return won(m.gas.low); },
    gasHigh: function (m) { return won(m.gas.high); },
    dieselMedian: function (m) { return won(m.diesel.median); },
    selfMedian: function (m) { return won(m['self']); },
    fullMedian: function (m) { return won(m.full); },
    selfGap: function (m) { return won(m.selfGap); },
    weekdayGap: function (m) { return m.weekdayGap.toFixed(1); },
    spreadMedian: function (m) { return won(m.spreadMedian); },
    topSpreadName: function (m) { return m.topSpread.r; },
    topSpreadValue: function (m) { return won(m.topSpread.sp); },
    cheapName: function (m) { return m.regionCheap.r; },
    cheapValue: function (m) { return won(m.regionCheap.md); },
    priceyName: function (m) { return m.regionPricey.r; },
    priceyValue: function (m) { return won(m.regionPricey.md); }
  };

  function fillNumbers(meta) {
    var nodes = document.querySelectorAll('.post-body [data-oil]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-oil');
      var fn = FIELD[key];
      if (!fn) continue;
      try { nodes[i].textContent = fn(meta); } catch (e) { /* 값이 없으면 그대로 둔다 */ }
    }
  }

  function fillAds() {
    var spots = document.querySelectorAll('.post-body .oil-ad-here');
    if (!spots.length) return;
    var html = OIL.adHtml();
    if (!html) return;
    for (var i = 0; i < spots.length; i++) {
      if (spots[i].getAttribute('data-done')) continue;
      spots[i].innerHTML = html;
      spots[i].setAttribute('data-done', '1');
    }
    OIL.adFill();
  }

  /* ── 위젯이 없을 때를 위한 대비 ───────────────────────────
     블로그스팟이 테마를 받을 때 '블로그 게시물' 위젯을 빠뜨리는 일이 있다.
     그러면 글이 통째로 안 보이므로, 블로거 피드에서 직접 가져와 그린다.
     위젯이 정상이면 이 코드는 아무 일도 하지 않는다. */
  function feedUrl() {
    var path = location.pathname;
    var m = path.match(/^\/search\/label\/(.+?)\/?$/);
    if (m) {
      return '/feeds/posts/default/-/' + m[1] + '?alt=json&max-results=25';
    }
    if (/\.html$/.test(path)) {
      return '/feeds/posts/default?alt=json&max-results=1&path=' + encodeURIComponent(path);
    }
    return '/feeds/posts/default?alt=json&max-results=25';
  }

  function entryUrl(e) {
    var links = e.link || [];
    for (var i = 0; i < links.length; i++) {
      if (links[i].rel === 'alternate') return links[i].href;
    }
    return '#';
  }

  /* 목록에 보여줄 한 줄 요약.
     태그만 지우면 <style> 안의 CSS 가 글자로 남아 목록에
     "@media (prefers-color-scheme: dark) { .cw-dark-text {" 이 찍힌다.
     실제로 그렇게 나왔다 - style·script 는 내용까지 통째로 들어낸다.
     그다음 가장 긴 문단을 고른다. 글 맨 앞은 제목·홍보 상자·버튼이라
     앞에서부터 자르면 정작 무슨 글인지가 안 나온다. */
  function summarize(html) {
    var clean = String(html).replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ');
    var best = '', m, re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
    while ((m = re.exec(clean))) {
      var t = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (t.length > best.length) best = t;
    }
    if (!best) best = clean.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return best.slice(0, 95);
  }

  function renderFeed(entries, single) {
    var wrap = document.querySelector('.oil-blog-wrap');
    if (!wrap) return;
    if (!entries.length) {
      wrap.innerHTML = '<div class="oil-error">글이 없습니다.</div>';
      return;
    }
    wrap.innerHTML = entries.map(function (e) {
      var title = (e.title && e.title.$t) || '';
      var body = (e.content && e.content.$t) || (e.summary && e.summary.$t) || '';
      if (single) {
        return '<div class="post"><h1 class="post-title">' + OIL.esc(title) + '</h1>' +
          '<div class="post-body">' + body + '</div></div>';
      }
      var text = summarize(body);
      return '<a class="post" href="' + entryUrl(e) + '" style="display:block;">' +
        '<div class="post-title" style="margin-bottom:8px;">' + OIL.esc(title) + '</div>' +
        '<div style="font-size:13px;line-height:1.7;color:#5B666A;">' + OIL.esc(text) + '...</div></a>';
    }).join('');
  }

  /* 글 맨 위 광고. 본문에 <div class="oil-ad-here"> 를 안 넣은 글에도
     빠짐없이 들어가도록 여기서 끼운다 - 글마다 손으로 넣지 않아도 된다.
     광고를 꺼둔 동안에도 같은 크기의 빈 상자가 자리를 잡아,
     나중에 켤 때 글이 아래로 밀리지 않는다. */
  function topAd() {
    var wrap = document.querySelector('.oil-blog-wrap');
    if (!wrap || wrap.querySelector('.oil-ad-top')) return;
    var box = document.createElement('div');
    box.className = 'oil-ad-top';
    box.innerHTML = OIL.adSlotHtml();
    wrap.insertBefore(box, wrap.firstChild);
    OIL.adFill();
  }

  function loadFromFeed() {
    var single = /\.html$/.test(location.pathname) &&
                 !/^\/search\//.test(location.pathname);
    fetch(feedUrl(), { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (js) {
        renderFeed((js.feed && js.feed.entry) || [], single);
        topAd();        /* 피드로 그렸을 때도 맨 위에 붙인다 */
        fillAds();
        return OIL.meta().then(fillNumbers);
      })
      .catch(function (e) { if (window.console) console.error(e); });
  }

  function run() {
    /* 위젯이 글을 그렸는지 확인 */
    if (!document.querySelector('.post-body')) {
      loadFromFeed();
      return;
    }
    topAd();
    fillAds();
    if (!document.querySelector('.post-body [data-oil]')) return;
    OIL.meta().then(fillNumbers).catch(function () { /* 숫자는 못 채워도 글은 읽힌다 */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
