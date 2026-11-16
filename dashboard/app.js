// Token Radar's dashboard. It reads window.RADAR — written to /output/data.js by main.ts — and paints
// the board, the filters, the model card and a detail drawer per protocol. No fetch, no framework and
// no network: every number on the page is in data.js, and every number in data.js came from the model
// in lib/model.ts.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', cat: 'all', chain: 'all', band: 'all', wl: false, tab: 'pre', sort: 'rank', dir: 1, selected: null };
  var BAND_LABEL = { all: 'Any value', b1: 'over $1B', b2: '$250M to $1B', b3: '$50M to $250M', b4: 'under $50M' };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function full(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function mult(n) { return '\u00d7' + n.toFixed(3); }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string' || typeof child === 'number') node.appendChild(document.createTextNode(String(child)));
      else node.appendChild(child);
    }
    return node;
  }
  function chip(label, extra) { return el('span', { class: 'chip' + (extra ? ' ' + extra : ''), text: label }); }

  // ------------------------------------------------------------ filters and order
  function visible() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.cat !== 'all' && (r.category || 'Unclassified') !== state.cat) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.band !== 'all' && r.band !== state.band) return false;
      if (state.wl && !r.watchlist) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, r.family, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  /** The protocols that already trade, filtered the same way but scored by nothing. */
  function liveVisible() {
    var q = state.q.trim().toLowerCase();
    return DATA.live.filter(function (r) {
      if (state.cat !== 'all' && (r.category || 'Unclassified') !== state.cat) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }

  function ordered(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -1e9 : a.change_7d; bv = b.change_7d === null ? -1e9 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'value') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else if (key === 'multiple') { av = a.value_multiple; bv = b.value_multiple; }
      else if (key === 'category') { av = a.category || 'Unclassified'; bv = b.category || 'Unclassified'; }
      else { return a.rank - b.rank; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.rank - b.rank;
    });
  }

  // ------------------------------------------------------------ hash
  function readHash() {
    var raw = window.location.hash.replace(/^#/, '');
    if (!raw) return;
    var p = new URLSearchParams(raw);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('cat')) state.cat = p.get('cat');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('band')) state.band = p.get('band');
    if (p.get('wl') === '1') state.wl = true;
    if (p.get('sort')) state.sort = p.get('sort');
    if (p.get('dir')) state.dir = Number(p.get('dir')) === 1 ? 1 : -1;
    if (p.get('p')) state.selected = p.get('p');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.cat !== 'all') p.set('cat', state.cat);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.band !== 'all') p.set('band', state.band);
    if (state.wl) p.set('wl', '1');
    if (state.sort !== 'rank') { p.set('sort', state.sort); p.set('dir', String(state.dir)); }
    if (state.selected) p.set('p', state.selected);
    var next = p.toString();
    try { window.history.replaceState(null, '', next ? '#' + next : window.location.pathname); } catch (e) { /* file:// may refuse */ }
  }

  // ------------------------------------------------------------ chrome
  function mark() {
    // Inline SVG: a radar sweep the page draws itself. No file, no request, no bitmap.
    var holder = document.createElement('span');
    holder.innerHTML = '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">' +
      '<circle cx="13" cy="13" r="10.5" fill="none" stroke="#2b3a2c" stroke-width="1.4"></circle>' +
      '<circle cx="13" cy="13" r="5.5" fill="none" stroke="#2b3a2c" stroke-width="1.4"></circle>' +
      '<path d="M13 13 L22.5 6.5 A10.5 10.5 0 0 0 13 2.5 Z" fill="#b6f04a" opacity="0.2"></path>' +
      '<line x1="13" y1="13" x2="22.5" y2="6.5" stroke="#b6f04a" stroke-width="1.7" stroke-linecap="round"></line>' +
      '<circle cx="13" cy="13" r="1.7" fill="#b6f04a"></circle></svg>';
    return holder.firstChild;
  }

  function topBar() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, mark(), el('b', { text: 'Token Radar' }), el('span', { text: 'pre-token protocols, ranked' })),
      el('div', { class: 'meta' },
        el('span', { class: 'pill', text: 'snapshot ' + DATA.as_of }),
        el('span', { class: 'pill', text: DATA.model_version }),
        el('span', { class: 'live', text: DATA.counts.board + ' rows scored' })
      )
    );
  }

  function hero() {
    return el('section', { class: 'hero' },
      el('div', null,
        el('div', { class: 'kicker', text: 'Implied value · farm plan · no token on record' }),
        el('h1', { text: DATA.counts.board + ' protocols that record no token, ranked by what a token would be worth' }),
        el('p', { class: 'method' },
          'One function scores every row: ', el('code', { text: 'tvl \u00d7 category multiple \u00d7 7d momentum (\u221230% to +25%) \u00d7 age discount' }),
          ', rounded to the dollar. The watchlist\u2019s ' + DATA.counts.watchlist + ' protocols are the floor; ' + DATA.counts.early + ' rows sit below its $' + Math.round(DATA.floor_usd / 1e6) + 'M line, found early. ',
          DATA.counts.set_aside + ' protocols whose token already trades sit in their own tab, with the market\u2019s numbers rather than the model\u2019s. An implied value is this radar\u2019s claim, not a forecast.'
        )
      ),
      el('div', { class: 'tiles' },
        el('div', { class: 'tile' }, el('span', { text: 'Watchlist' }), el('b', null, String(DATA.counts.watchlist), el('i', { text: ' / ' + DATA.counts.watchlist }))),
        el('div', { class: 'tile' }, el('span', { text: 'Below the floor' }), el('b', { text: String(DATA.counts.early) })),
        el('div', { class: 'tile' }, el('span', { text: 'Record no token' }), el('b', { text: String(DATA.counts.pre_token) })),
        el('div', { class: 'tile' }, el('span', { text: 'Already trading' }), el('b', { text: String(DATA.counts.set_aside) }))
      )
    );
  }

  function selectField(label, id, options, value, onChange) {
    var sel = el('select', { id: id }, options.map(function (o) {
      return el('option', { value: o.value, text: o.label, selected: o.value === value ? 'selected' : null });
    }));
    sel.addEventListener('change', function () { onChange(sel.value); });
    return el('div', { class: 'field' }, el('label', { for: id, text: label }), sel);
  }

  // The board's controls are built once; only the count, the filter chips and the table repaint, so a
  // search keeps its focus while the reader types.
  var countHost = el('span', { class: 'count' });
  var filterHost = el('div', { class: 'filterbar' });
  var tableHost = el('div');

  function filtering() {
    return state.q !== '' || state.cat !== 'all' || state.chain !== 'all' || state.band !== 'all' || state.wl;
  }
  function clearAll() {
    state.q = ''; state.cat = 'all'; state.chain = 'all'; state.band = 'all'; state.wl = false;
    writeHash();
    paint();
  }

  function controls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Unclassified'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (all, r) { return all.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', value: state.q, placeholder: 'Search protocol, chain, category', 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); renderBoard(); });
    var wlBox = el('input', { type: 'checkbox', id: 'wl', checked: state.wl ? 'checked' : null });
    wlBox.addEventListener('change', function () { state.wl = wlBox.checked; writeHash(); renderBoard(); });
    return el('div', null,
      el('div', { class: 'controls' },
        el('div', { class: 'field' }, el('label', { text: 'Board' }),
          el('div', { class: 'tabs' },
            el('button', { type: 'button', 'aria-pressed': state.tab === 'pre' ? 'true' : 'false', text: 'Pre-token ' + DATA.counts.board, onclick: function () { state.tab = 'pre'; renderBoard(); } }),
            el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Trading ' + DATA.counts.set_aside, onclick: function () { state.tab = 'live'; renderBoard(); } })
          )
        ),
        el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
        selectField('Category', 'cat', [{ value: 'all', label: 'Every category' }].concat(cats.map(function (c) { return { value: c, label: c }; })), state.cat, function (v) { state.cat = v; writeHash(); renderBoard(); }),
        selectField('Chain', 'chain', [{ value: 'all', label: 'Every chain' }].concat(chains.map(function (c) { return { value: c, label: c }; })), state.chain, function (v) { state.chain = v; writeHash(); renderBoard(); }),
        selectField('Value band', 'band', Object.keys(BAND_LABEL).map(function (k) { return { value: k, label: BAND_LABEL[k] }; }), state.band, function (v) { state.band = v; writeHash(); renderBoard(); }),
        el('label', { class: 'switch', 'data-on': state.wl ? 'true' : 'false', for: 'wl' }, wlBox, 'Watchlist only'),
        countHost
      ),
      filterHost
    );
  }

  /** The filters in force, each one removable on its own, so a reader can see why the board is short. */
  function renderFilters() {
    filterHost.textContent = '';
    if (!filtering()) return;
    var chips = [];
    if (state.q) chips.push(chipFor('search: ' + state.q, function () { state.q = ''; writeHash(); paint(); }));
    if (state.cat !== 'all') chips.push(chipFor('category: ' + state.cat, function () { state.cat = 'all'; writeHash(); paint(); }));
    if (state.chain !== 'all') chips.push(chipFor('chain: ' + state.chain, function () { state.chain = 'all'; writeHash(); paint(); }));
    if (state.band !== 'all') chips.push(chipFor('value: ' + BAND_LABEL[state.band], function () { state.band = 'all'; writeHash(); paint(); }));
    if (state.wl) chips.push(chipFor('watchlist only', function () { state.wl = false; writeHash(); paint(); }));
    filterHost.appendChild(el('span', { class: 'filterlabel', text: 'Filters' }));
    chips.forEach(function (c) { filterHost.appendChild(c); });
    filterHost.appendChild(el('button', { class: 'reset', type: 'button', text: 'Clear all', onclick: clearAll }));
  }

  function chipFor(label, clear) {
    return el('button', { class: 'fchip', type: 'button', onclick: clear }, label, el('span', { class: 'x', text: '\u00d7' }));
  }

  function sortTh(key, label, extraClass) {
    var active = state.sort === key;
    return el('th', { class: extraClass || null, scope: 'col', 'aria-sort': active ? (state.dir === 1 ? 'ascending' : 'descending') : null },
      el('button', { type: 'button', onclick: function () {
        if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' || key === 'category' ? 1 : -1; }
        writeHash(); paint();
      } }, label, active ? el('span', { class: 'arrow', text: state.dir === 1 ? '\u25b2' : '\u25bc' }) : null)
    );
  }

  function boardTable() {
    var list = ordered(visible());
    if (!list.length) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches those filters' }),
        el('p', { text: 'The board holds ' + DATA.rows.length + ' pre-token protocols. Clear the search, or widen the category, chain or value band.' }),
        el('button', { class: 'btn', type: 'button', text: 'Clear filters', onclick: function () {
          state.q = ''; state.cat = 'all'; state.chain = 'all'; state.band = 'all'; state.wl = false; writeHash(); paint();
        } })
      ));
    }
    var max = 1e-9;
    list.forEach(function (r) { if (r.value_multiple > max) max = r.value_multiple; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var chainsOut = (r.chains || []).slice(0, 2).map(function (c) { return chip(c); });
      if ((r.chains || []).length > 2) chainsOut.push(chip('+' + (r.chains.length - 2), 'more'));
      tbody.appendChild(el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { open(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r.slug); } }
      },
        el('td', { class: 'num' }, el('span', { class: 'rank' + (r.rank <= 3 ? ' top' : ''), text: String(r.rank) })),
        el('td', null, el('div', { class: 'who' },
          el('b', null, r.name, r.watchlist ? el('span', { class: 'star', text: '\u25c6 watchlist' }) : null),
          el('span', { class: 'slug', text: r.slug })
        )),
        el('td', null, el('span', { class: 'cat', text: r.category || 'Unclassified' })),
        el('td', null, el('div', { class: 'chains' }, chainsOut)),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num' }, el('span', { class: 'delta ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) })),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num' }, el('div', { class: 'value' },
          el('div', { class: 'vline' },
            el('b', { text: fmtUsd(r.implied_value_usd) }),
            el('span', { class: 'mult', text: mult(r.value_multiple) })
          ),
          el('div', { class: 'mbar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(4, Math.round((r.value_multiple / max) * 100)) + '%' }))
        )),
        el('td', { class: 'plan' }, el('b', { text: r.farm_steps.length + ' steps' }), ' to farm')
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', style: 'caption-side:top;text-align:left;padding:10px 12px;border-bottom:1px solid #222c26;color:#8b9a90' },
            'Pre-token protocols, strongest implied value first. Select any row for its numbers and its farm plan.'),
          el('thead', null, el('tr', null,
            sortTh('rank', '#', 'num'),
            sortTh('name', 'Protocol'),
            sortTh('category', 'Category'),
            el('th', { scope: 'col', text: 'Chains' }),
            sortTh('tvl', 'TVL', 'num'),
            sortTh('growth', '7d', 'num'),
            sortTh('age', 'Tracked', 'num'),
            sortTh('value', 'Implied value', 'num'),
            el('th', { scope: 'col', text: 'Farm plan' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var list = liveVisible();
    if (!list.length) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No traded protocol matches those filters' }),
        el('p', { text: 'These are the protocols whose token already trades. Their market cap is a fact, so they are never scored.' })
      ));
    }
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', style: 'caption-side:top;text-align:left;padding:10px 12px;border-bottom:1px solid #222c26;color:#8b9a90' },
            'The largest ' + DATA.live.length + ' of ' + DATA.counts.set_aside + ' protocols whose token already trades. Shown with the market\u2019s own numbers, set aside from the ranking rather than mixed into it.'),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Chains' }),
            el('th', { scope: 'col', class: 'num', text: 'TVL' }),
            el('th', { scope: 'col', class: 'num', text: '7d' }),
            el('th', { scope: 'col', class: 'num', text: 'Market cap' }),
            el('th', { scope: 'col', text: 'Symbol' })
          )),
          el('tbody', null, list.map(function (r) {
            return el('tr', null,
              el('td', null, el('div', { class: 'who' }, el('b', { text: r.name }), el('span', { class: 'slug', text: r.slug }))),
              el('td', null, el('span', { class: 'cat', text: r.category || 'Unclassified' })),
              el('td', null, el('div', { class: 'chains' }, (r.chains || []).slice(0, 2).map(function (c) { return chip(c); }))),
              el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
              el('td', { class: 'num' }, el('span', { class: 'delta ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) })),
              el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
              el('td', null, el('span', { class: 'sub', text: r.symbol || 'trades' }))
            );
          }))
        )
      )
    );
  }

  // ------------------------------------------------------------ detail drawer
  var drawer = el('dialog', { class: 'drawer', 'aria-labelledby': 'detail-title' });
  drawer.addEventListener('close', function () { state.selected = null; writeHash(); renderBoard(); });

  function splitStep(text) {
    var at = text.indexOf(' Cost: ');
    if (at < 0) return { action: text, cost: '', time: '' };
    var action = text.slice(0, at);
    var tail = text.slice(at + ' Cost: '.length);
    var t = tail.indexOf(' Time: ');
    if (t < 0) return { action: action, cost: tail.replace(/\.$/, ''), time: '' };
    return { action: action, cost: tail.slice(0, t).replace(/\.$/, ''), time: tail.slice(t + ' Time: '.length).replace(/\.$/, '') };
  }

  function open(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    renderBoard();
    var list = ordered(visible());
    var at = list.findIndex(function (r) { return r.slug === slug; });
    var prev = at > 0 ? list[at - 1] : null;
    var next = at >= 0 && at < list.length - 1 ? list[at + 1] : null;
    var family = DATA.families.filter(function (f) { return f.key === row.family; })[0];
    var calc = Math.round(row.tvl_usd * row.cat_multiple * row.momentum * row.age_discount);

    drawer.textContent = '';
    drawer.appendChild(el('div', { class: 'drawer-head' },
      el('button', { class: 'close', type: 'button', text: 'Close esc', onclick: function () { drawer.close(); } }),
      el('div', { class: 'rankline', text: 'Rank ' + row.rank + ' of ' + DATA.counts.board + (row.watchlist ? ' \u00b7 watchlist' : ' \u00b7 below the floor, found early') }),
      el('h2', { id: 'detail-title', text: row.name }),
      el('p', { class: 'where', text: (row.category || 'Unclassified') + ' \u00b7 ' + family.label + ' \u00b7 tracked ' + fmtAge(row.age_days) + (row.listed_at ? ' from ' + row.listed_at : '') }),
      el('div', { class: 'chips' }, (row.chains || []).map(function (c) { return chip(c); }).concat([chip(row.slug)]))
    ));

    var body = el('div', { class: 'drawer-body' },
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', { class: 'stat' }, el('span', { text: '7-day growth' }), el('b', { class: 'delta ' + (row.change_7d === null ? '' : row.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(row.change_7d) })),
        el('div', { class: 'stat' }, el('span', { text: 'No token for' }), el('b', { text: fmtAge(row.age_days) })),
        el('div', { class: 'stat hero-stat' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) }))
      ),

      el('div', { class: 'section' },
        el('h3', { text: 'How the number is built' }),
        el('div', { class: 'breakdown' },
          el('div', { class: 'brow' }, el('span', { text: 'TVL in the snapshot' }), el('em', { text: 'whole dollars' }), el('b', { text: full(row.tvl_usd) })),
          el('div', { class: 'brow' }, el('span', { text: 'Category multiple \u00b7 ' + (row.category || 'unclassified') }), el('em', { text: 'band ' + family.band_lo.toFixed(1) + '\u2013' + family.band_hi.toFixed(1) + '\u00d7' }), el('b', { text: mult(row.cat_multiple) })),
          el('div', { class: 'brow' }, el('span', { text: 'Momentum \u00b7 ' + fmtPct(row.change_7d) + ' over seven days' }), el('em', { text: 'clamped to \u221230% / +25%' }), el('b', { text: mult(row.momentum) })),
          el('div', { class: 'brow' }, el('span', { text: 'Age discount \u00b7 ' + fmtAge(row.age_days) + ' with no token' }), el('em', { text: 'older asks less' }), el('b', { text: mult(row.age_discount) })),
          el('div', { class: 'brow total' }, el('span', { text: 'Implied value' }), el('em', { text: calc === row.implied_value_usd ? 'page recomputes the same number' : 'recomputed ' + full(calc) }), el('b', { text: full(row.implied_value_usd) }))
        ),
        el('div', { class: 'gauge' },
          el('div', { class: 'track' }, el('i', { style: 'width:' + Math.min(100, (row.value_multiple / DATA.model.value_multiple_cap) * 100).toFixed(1) + '%' }), el('span', { class: 'tick', style: 'left:' + Math.min(100, (1 / DATA.model.value_multiple_cap) * 100).toFixed(1) + '%' })),
          el('div', { class: 'legend' }, el('span', { text: mult(row.value_multiple) + ' of TVL' }), el('span', { text: '1.0\u00d7 tick \u00b7 scale ' + DATA.model.value_multiple_cap + '\u00d7' }))
        )
      ),

      el('div', { class: 'section' },
        el('h3', { text: 'Farm it before a token exists' }),
        el('ol', { class: 'steps' }, row.farm_steps.map(function (text, i) {
          var s = splitStep(text);
          return el('li', null,
            el('span', { class: 'n', text: String(i + 1) }),
            el('p', { class: 'act' }, s.action + ' ',
              el('span', { class: 'meta' }, 'Cost: ' + s.cost + '. Time: ' + s.time + '.')
            )
          );
        }))
      ),

      el('div', { class: 'section' },
        el('p', { class: 'sub', text: 'The snapshot records no token for ' + row.name + ': no market cap, no CoinGecko id and no symbol. That is a record, not a guarantee — a protocol on this board may still have a token the record does not carry. The plan above is generic farming hygiene sized to this protocol\u2019s own TVL, age and chains; it is not an offer, and nothing here asks you to sign anything you cannot read.' })
      ),

      el('div', { class: 'drawer-foot' },
        prev ? el('button', { class: 'navbtn', type: 'button', onclick: function () { open(prev.slug); } }, '\u2190 ' + prev.rank + ' ', el('b', { text: prev.name })) : el('span', { class: 'navbtn', text: '\u2190 top of the board' }),
        next ? el('button', { class: 'navbtn next', type: 'button', onclick: function () { open(next.slug); } }, next.rank + ' ', el('b', { text: next.name }), ' \u2192') : el('span', { class: 'navbtn next', text: 'end of the board \u2192' })
      )
    );
    drawer.appendChild(body);
    if (typeof drawer.showModal === 'function') { if (!drawer.open) drawer.showModal(); }
    else drawer.setAttribute('open', '');
    body.scrollTop = 0;
  }

  // ------------------------------------------------------------ paint
  function renderBoard() {
    var pre = state.tab === 'pre';
    var list = pre ? visible() : liveVisible();
    renderFilters();
    countHost.textContent = '';
    countHost.appendChild(el('b', { text: String(list.length) }));
    countHost.appendChild(document.createTextNode(pre
      ? ' of ' + DATA.rows.length + ' ranked rows' + (filtering() ? ' \u00b7 filtered' : '')
      : ' of ' + DATA.counts.set_aside + ' traded protocols' + (filtering() ? ' \u00b7 filtered' : '')));
    tableHost.textContent = '';
    tableHost.appendChild(pre ? boardTable() : liveTable());
  }
  function paint() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(topBar());
    shell.appendChild(hero());
    shell.appendChild(controls());
    shell.appendChild(tableHost);
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    renderBoard();
    if (!drawer.isConnected) document.body.appendChild(drawer);
    if (state.selected) open(state.selected);
  }

  readHash();
  paint();
  window.addEventListener('hashchange', function () {
    // A pasted link carries the filters and the open protocol; honour it without a reload.
    readHash();
    paint();
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer.open) drawer.close();
  });
})();
