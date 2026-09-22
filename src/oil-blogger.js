/* 주유소찾기 - 블로그스팟 화면 분기
   주소를 보고 어떤 화면을 그릴지 정한다.
     /                        찾기 (장소 검색 / 내 주변)  ← 첫 화면
     /p/area.html?la=&ln=     그 지점 주변 주유소
     /p/area.html?r=...       동네 상세
     /p/area.html             동네 목록 + 오늘 전국 현황
     /p/calc.html             계산기
     그 외                     일반 블로그 글

   블로그스팟은 페이지를 사람이 하나씩 만들어야 해서, 한 페이지에 물음표 뒤 값으로
   여러 화면을 태운다. 페이지를 새로 만들 필요가 없다.
*/
(function () {
  'use strict';

  var cfg = window.OIL_CONFIG || {};
  var html = document.documentElement;
  var path = location.pathname.replace(/\/+$/, '') || '/';
  var qs = new URLSearchParams(location.search);

  var areaPath = (cfg.areaPageUrl || '/p/area.html').replace(/\/+$/, '');
  var calcPath = (cfg.calcPageUrl || '/p/calc.html').replace(/\/+$/, '');

  var mode = 'blog';
  if (path === '/' || path === '/index.html') mode = 'find';
  else if (path === areaPath) {
    if (qs.get('dla') && qs.get('dln')) mode = 'dest';   /* 목적지까지 가는 길 */
    else if (qs.get('la') && qs.get('ln')) mode = 'near';
    else if (qs.get('r')) mode = 'area';
    else mode = 'browse';
  } else if (path === calcPath) mode = 'calc';

  html.classList.add('oil-mode-' + mode);
  window.OIL_MODE = mode;

  /* 탭 표시 */
  var tabs = [
    ['주유소 찾기', cfg.listPageUrl || '/'],
    ['우리 동네', cfg.areaPageUrl || '/p/area.html'],
    ['계산기', cfg.calcPageUrl || '/p/calc.html'],
    ['기름값 이야기', (cfg.reportLabelUrl || '/search/label/기름값리포트')]
  ];
  var ACTIVE = { find: 0, near: 0, dest: 0, area: 1, browse: 1, calc: 2, blog: 3 };
  var nav = document.getElementById('oil-tabs');
  if (nav) {
    var active = ACTIVE[mode];
    nav.innerHTML = '<ul>' + tabs.map(function (t, i) {
      return '<li><a class="' + (i === active ? 'active' : '') + '" href="' + t[1] + '">' +
        t[0] + '</a></li>';
    }).join('') + '</ul>';
  }

  /* 앱 화면이 아니면 본문 자리를 비워 공간을 차지하지 않게 한다 */
  if (mode === 'blog') {
    var root = document.getElementById('oil-root');
    if (root) root.style.display = 'none';
  }
})();
