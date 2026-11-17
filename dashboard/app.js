// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail view with the model's own
// inputs and the protocol's farm plan, and a live-token view set apart. No network: every byte it
// shows is in data.js.
//
// The page recomputes each row from the snapshot figures with the same functions main.ts used, so
// the number on screen is visibly the same arithmetic board.json carries.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  // Categories the early radar sets aside, mirroring lib/model.ts. A watchlist protocol in one of
  // these is still ranked: the watchlist is the floor and must be covered in full.
  var EXCLUDED_CATEGORIES = ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaking', 'Restaked BTC', 'CEX'];

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function: TVL x the category multiple the snapshot's live-token protocols
  // produced, x growth, x maturity, x chain breadth. The dashboard shows the breakdown and checks
  // the recomputed number against the row board.json carries.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadth = 1 + Math.min(Math.max((row.chains || []).length - 1, 0), model.breadth_max_chains) * model.breadth_per_chain;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * breadth));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and
  // age decide the action, the capital, the hold, the caution and every cost and time. No name is
  // special-cased, and the page's steps are the board's steps, word for word.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function cautionFor(p) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return "Check " + name + "'s health factor every week: a sharp price move can liquidate a borrow, so keep collateral well above the minimum.";
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return "Watch the pool's price range: if the pair drifts out of range, the position stops earning and impermanent loss grows.";
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Watch funding: a position held across many funding intervals pays it every few hours, so close it if funding stays against you.';
    if (c.indexOf('bridge') >= 0) return "Bridge only from the app's own page and only the amount you will use: a bridge transfer cannot be recalled once it is sent.";
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Check the unbonding time before you stake: some receipt tokens lock for days, so you cannot exit at once.';
    if (c.indexOf('prediction') >= 0) return 'A market position can go to zero if the outcome lands the other way, so size it as money you can lose.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return "Read the vault's fee and withdrawal queue first: a vault can charge on entry and delay exits for days.";
    if (c.indexOf('stable') >= 0) return 'Check what backs the stable asset and whether it has ever depegged: a thin peg is the risk, not the yield.';
    if (c.indexOf('rwa') >= 0) return 'Check who holds the underlying asset and how it is audited: the yield is only as good as the issuer behind it.';
    if (c.indexOf('insurance') >= 0) return 'Read what the cover actually pays for: most policies exclude the exact failure a farmer worries about.';
    return "Check the protocol's own status page weekly: an exploit or a paused contract is the risk no yield covers.";
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: cautionFor(p), cost: 'nothing but the check', time: '10 minutes a week' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, then write the wallet, the dates and every transaction in a farm log.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' }
    ].map(stepText);
  }

  // What stands out about one row, computed from its own figures: TVL rank on the board, growth,
  // age, chain count and how its category's multiple compares with the snapshot median.
  function standouts(row) {
    var out = [];
    var tvlRank = DATA.rows.filter(function (r) { return r.tvl_usd > row.tvl_usd; }).length + 1;
    out.push('TVL rank ' + tvlRank + ' of ' + DATA.rows.length + ' on this board (' + fmtUsd(row.tvl_usd) + ').');
    if (row.change_7d !== null && row.change_7d >= 20) out.push('Growing fast: TVL up ' + fmtPct(row.change_7d) + ' in the last 7 days.');
    else if (row.change_7d !== null && row.change_7d <= -20) out.push('TVL fell ' + fmtPct(row.change_7d) + ' in the last 7 days — check why before farming.');
    if ((row.chains || []).length >= 3) out.push('Live on ' + row.chains.length + ' chains: ' + row.chains.join(', ') + '.');
    if (row.age_days !== null && row.age_days < 180) out.push('Young protocol: tracked for under 6 months, so the record is short.');
    else if (row.age_days !== null && row.age_days >= 1095) out.push('Running 3+ years with no token on record: staying power, not a new launch.');
    if (row.category_multiple > DATA.overall_multiple * 1.25) out.push('Its category trades at ' + row.category_multiple.toFixed(2) + 'x TVL, above the snapshot median of ' + DATA.overall_multiple.toFixed(2) + 'x.');
    else if (row.category_multiple < DATA.overall_multiple * 0.75) out.push('Its category trades at ' + row.category_multiple.toFixed(2) + 'x TVL, below the snapshot median of ' + DATA.overall_multiple.toFixed(2) + 'x.');
    return out;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // ---------- the page ----------

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows
      .filter(function (r) { return !q || r.name.toLowerCase().indexOf(q) >= 0 || r.slug.toLowerCase().indexOf(q) >= 0; })
      .filter(function (r) { return state.category === 'all' || r.category === state.category; })
      .filter(function (r) { return state.chain === 'all' || (r.chains || []).indexOf(state.chain) >= 0; })
      .sort(function (a, b) {
        var key = state.sort;
        var av = key === 'implied' ? a.implied_value_usd : key === 'tvl' ? a.tvl_usd : key === 'growth' ? (a.change_7d || 0) : key === 'age' ? (a.age_days || 0) : a.name;
        var bv = key === 'implied' ? b.implied_value_usd : key === 'tvl' ? b.tvl_usd : key === 'growth' ? (b.change_7d || 0) : key === 'age' ? (b.age_days || 0) : b.name;
        if (typeof av === 'string') return av.localeCompare(bv) * state.dir;
        return (av - bv) * state.dir;
      });
  }

  function header() {
    var top = el('header', { class: 'top' });
    var brand = el('div', { class: 'brand' }, el('span', { class: 'mark', 'aria-hidden': 'true' }), el('span', { class: 'brand-name', text: 'Token Radar' }));
    var meta = el('div', { class: 'top-meta' },
      el('span', { text: 'Snapshot ' + DATA.as_of }),
      el('span', { text: 'Source: DefiLlama' }),
      el('span', { text: 'Model ' + DATA.model_version }));
    top.appendChild(brand);
    top.appendChild(meta);
    return top;
  }

  function lede() {
    var wrap = el('section', { class: 'lede' });
    var copy = el('div', null,
      el('h1', { text: 'Which protocols could launch a token, and what would it be worth?' }),
      el('p', null,
        'This board ranks ', el('b', { text: DATA.board_size + ' pre-token protocols' }),
        ' by the value a token launch implies, from one sealed DefiLlama snapshot (', el('b', { text: DATA.as_of }), '). ',
        'A protocol is listed only when it ', el('b', { text: 'records no token' }),
        ' — no market cap, no CoinGecko id, no symbol — and the rows found below the watchlist floor are also required to be no wrapped, staked or bridged product of a token that already trades. ',
        'Wrapped, staked and bridged products are set aside because they already have a token; they cannot launch one. ',
        'The watchlist itself is covered in full, so one watchlist protocol in a set-aside category is still ranked: ',
        el('b', { text: DATA.rows.filter(function (r) { return EXCLUDED_CATEGORIES.indexOf(r.category) >= 0; }).map(function (r) { return r.name + ' (' + r.category + ')'; }).join(', ') || 'none' }), '.'));
    var facts = el('div', { class: 'facts' });
    var fact = function (label, value) {
      facts.appendChild(el('div', { class: 'fact' }, el('span', { text: label }), el('b', { text: value })));
    };
    fact('Watchlist protocols', String(DATA.watchlist_size));
    fact('Rows on the board', String(DATA.board_size));
    fact('New rows found below the floor', String(DATA.early_size));
    fact('Watchlist floor', fmtUsd(DATA.floor_usd));
    fact('Live-token protocols set apart', String(DATA.live_size));
    fact('Top implied value', fmtUsd(DATA.rows[0].implied_value_usd));
    wrap.appendChild(copy);
    wrap.appendChild(facts);
    return wrap;
  }

  function spotlight() {
    var wrap = el('section', { class: 'spot', 'aria-label': 'Top five protocols by implied value' });
    DATA.rows.slice(0, 5).forEach(function (r) {
      wrap.appendChild(el('button', { class: 'card', type: 'button', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'rank', text: '#' + r.rank }),
        el('b', { text: r.name }),
        el('span', { class: 'val num', text: fmtUsd(r.implied_value_usd) }),
        el('span', { class: 'meta', text: fmtUsd(r.tvl_usd) + ' TVL · ' + (r.category || 'uncategorised') })));
    });
    return wrap;
  }

  function controls() {
    var wrap = el('section', { class: 'controls' });
    var searchField = el('div', { class: 'field' },
      el('label', { for: 'q', text: 'Search name or slug' }),
      el('input', { id: 'q', type: 'search', placeholder: 'e.g. ember', value: state.q }));
    searchField.querySelector('input').addEventListener('input', function (e) { state.q = e.target.value; writeHash(); renderTable(); });
    var categories = [];
    DATA.rows.forEach(function (r) { if (r.category && categories.indexOf(r.category) < 0) categories.push(r.category); });
    categories.sort();
    var catField = el('div', { class: 'field' },
      el('label', { for: 'category', text: 'Category' }),
      el('select', { id: 'category' },
        el('option', { value: 'all', text: 'All categories' }),
        categories.map(function (c) { return el('option', { value: c, text: c, selected: state.category === c ? 'selected' : null }); })));
    catField.querySelector('select').addEventListener('change', function (e) { state.category = e.target.value; writeHash(); renderTable(); });
    var chains = [];
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
    chains.sort();
    var chainField = el('div', { class: 'field' },
      el('label', { for: 'chain', text: 'Chain' }),
      el('select', { id: 'chain' },
        el('option', { value: 'all', text: 'All chains' }),
        chains.map(function (c) { return el('option', { value: c, text: c, selected: state.chain === c ? 'selected' : null }); })));
    chainField.querySelector('select').addEventListener('change', function (e) { state.chain = e.target.value; writeHash(); renderTable(); });
    var tabs = el('div', { class: 'tabs', role: 'group', 'aria-label': 'Choose the set to show' },
      el('button', { type: 'button', 'aria-pressed': String(state.tab === 'pre-token'), onclick: function () { state.tab = 'pre-token'; writeHash(); renderTable(); }, text: 'Pre-token board' }),
      el('button', { type: 'button', 'aria-pressed': String(state.tab === 'live'), onclick: function () { state.tab = 'live'; writeHash(); renderTable(); }, text: 'Already has a token' }));
    var count = el('span', { class: 'count', id: 'count' });
    wrap.appendChild(searchField);
    wrap.appendChild(catField);
    wrap.appendChild(chainField);
    wrap.appendChild(tabs);
    wrap.appendChild(count);
    return wrap;
  }

  function sortableHeader(label, key) {
    var th = el('th', { class: key === 'implied' || key === 'tvl' || key === 'growth' || key === 'age' ? 'num' : '' });
    var arrow = state.sort === key ? (state.dir === -1 ? ' ↓' : ' ↑') : '';
    var button = el('button', { type: 'button', onclick: function () { state.sort = key; state.dir = state.sort === key && state.dir === -1 ? 1 : -1; renderTable(); }, text: label + arrow });
    th.appendChild(button);
    return th;
  }

  function boardTable() {
    var rows = filteredRows();
    var max = DATA.rows[0] ? DATA.rows[0].implied_value_usd : 1;
    var table = el('table', null,
      el('caption', { class: 'sub', text: 'Ranked by implied launch value, strongest first. Click a row for the model breakdown and farm plan. Implied value is a model estimate, not a market price.' }),
      el('thead', null,
        el('tr', null,
          el('th', { text: 'Rank' }),
          sortableHeader('Protocol', 'name'),
          sortableHeader('Implied value', 'implied'),
          sortableHeader('TVL', 'tvl'),
          sortableHeader('7d change', 'growth'),
          sortableHeader('Age', 'age'),
          el('th', { text: 'Category' }),
          el('th', { text: 'Chains' }))),
      el('tbody', null,
        rows.map(function (r) {
          var tr = el('tr', { 'data-selected': state.selected === r.slug ? 'true' : null, tabindex: '0' });
          tr.addEventListener('click', function () { openDetail(r.slug); });
          tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } });
          var change = r.change_7d === null ? el('span', { class: 'sub', text: 'n/a' }) : el('span', { class: r.change_7d >= 0 ? 'pos' : 'neg', text: fmtPct(r.change_7d) });
          var bar = el('span', { class: 'bar' }, el('i', { style: 'width:' + Math.max(2, Math.round((r.implied_value_usd / max) * 100)) + '%' }));
          var implied = el('div', { class: 'implied' }, el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }), bar);
          tr.appendChild(el('td', { class: 'num', text: '#' + r.rank }));
          tr.appendChild(el('td', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug })));
          tr.appendChild(el('td', null, implied));
          tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
          tr.appendChild(el('td', { class: 'num' }, change));
          tr.appendChild(el('td', { class: 'num', text: fmtAge(r.age_days) }));
          tr.appendChild(el('td', null, el('span', { class: 'status', text: r.category || 'uncategorised' })));
          tr.appendChild(el('td', { class: 'sub', text: (r.chains || []).slice(0, 2).join(', ') + ((r.chains || []).length > 2 ? ' +' + ((r.chains || []).length - 2) : '') }));
          return tr;
        })));
    if (rows.length === 0) {
      return el('div', { class: 'empty' },
        el('h2', { text: 'No protocols match' }),
        el('p', { class: 'sub', text: 'Clear the search or widen the filters.' }),
        el('p', null, el('button', { class: 'button ghost', type: 'button', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); renderAll(); }, text: 'Clear filters' })));
    }
    return table;
  }

  function liveTable() {
    var live = DATA.live.slice();
    var table = el('table', null,
      el('caption', { class: 'sub', text: 'These protocols already trade, so they are not ranked for a launch. Their value is the market cap the market itself gives, not a model estimate. Click a row for the detail.' }),
      el('thead', null, el('tr', null,
        el('th', { text: 'Protocol' }),
        el('th', { class: 'num', text: 'Market cap' }),
        el('th', { class: 'num', text: 'TVL' }),
        el('th', { class: 'num', text: '7d change' }),
        el('th', { text: 'Category' }))),
      el('tbody', null,
        live.map(function (r) {
          var tr = el('tr', { tabindex: '0' });
          tr.addEventListener('click', function () { openDetail(r.slug); });
          tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } });
          var change = r.change_7d === null ? el('span', { class: 'sub', text: 'n/a' }) : el('span', { class: r.change_7d >= 0 ? 'pos' : 'neg', text: fmtPct(r.change_7d) });
          tr.appendChild(el('td', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug })));
          tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }));
          tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
          tr.appendChild(el('td', { class: 'num' }, change));
          tr.appendChild(el('td', null, el('span', { class: 'status live', text: r.category || 'uncategorised' })));
          return tr;
        })));
    return table;
  }

  function modelPanel() {
    var m = DATA.model;
    var panel = el('section', { class: 'panel model', 'aria-label': 'How the value is estimated' },
      el('h2', { text: 'How the value is estimated' }),
      el('p', { class: 'sub', text: 'Implied value = TVL × category multiple × growth multiplier × maturity multiplier × chain multiplier. The category multiple is the median market cap / TVL of the snapshot\'s own live-token protocols in that category; categories with fewer than 3 live peers use the snapshot median.' }),
      el('div', { class: 'formula', text: 'implied = round(TVL × catMultiple × (1 + clamp(7d%, ' + m.growth_floor + ', ' + m.growth_cap + ') ÷ 100 × ' + m.growth_weight + ') × (0.6 + min(age, ' + m.maturity_days + ') ÷ ' + m.maturity_days + ' × 0.4) × (1 + 0.03 × min(chains − 1, ' + m.breadth_max_chains + ')))' }),
      el('table', { class: 'mult-table' },
        el('caption', { class: 'sub', text: 'Category multiples, computed from this snapshot' }),
        el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Multiple (FDV / TVL)' }), el('th', { class: 'num', text: 'Live peers' }))),
        el('tbody', null,
          DATA.category_multiples.map(function (cm) {
            return el('tr', null, el('td', { text: cm.category }), el('td', { class: 'num', text: cm.multiple.toFixed(3) + 'x' }), el('td', { class: 'num', text: String(cm.peers) }));
          }),
          el('tr', null, el('td', { text: 'All categories (fallback)' }), el('td', { class: 'num', text: DATA.overall_multiple.toFixed(3) + 'x' }), el('td', { class: 'num', text: 'median' })))));
    return panel;
  }

  function renderTable() {
    var host = document.getElementById('table-host');
    if (!host) return;
    host.replaceChildren();
    if (state.tab === 'live') {
      host.appendChild(el('div', { class: 'table-wrap' }, liveTable()));
      var liveCount = document.getElementById('count');
      if (liveCount) liveCount.textContent = DATA.live.length + ' live-token protocols';
    } else {
      var rows = filteredRows();
      host.appendChild(el('div', { class: 'table-wrap' }, boardTable()));
      var count = document.getElementById('count');
      if (count) count.textContent = rows.length + ' of ' + DATA.board_size + ' rows';
    }
  }

  function detailDialog() {
    var dialog = document.getElementById('detail');
    if (dialog) return dialog;
    dialog = el('dialog', { class: 'detail', id: 'detail' });
    dialog.addEventListener('close', function () {
      state.selected = null;
      writeHash();
      renderTable();
    });
    document.body.appendChild(dialog);
    return dialog;
  }

  function openDetail(slug) {
    var row = DATA.rows.find(function (r) { return r.slug === slug; });
    var live = !row ? DATA.live.find(function (r) { return r.slug === slug; }) : null;
    if (!row && !live) return;
    var dialog = detailDialog();
    dialog.replaceChildren();
    var title = row ? row.name : live.name;
    var sub = row
      ? '#' + row.rank + ' · ' + (row.category || 'uncategorised') + ' · tracked ' + fmtAge(row.age_days)
      : (live.category || 'uncategorised') + ' · already has a token';
    var head = el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: row ? 'PRE-TOKEN · IMPLIED VALUE' : 'LIVE TOKEN · MARKET VALUE' }),
        el('h2', { text: title }),
        el('p', { class: 'sub', text: sub })),
      el('button', { class: 'close', type: 'button', onclick: function () { dialog.close(); }, text: 'Close ✕' }));
    dialog.appendChild(head);
    if (row) {
      var recomputed = impliedOf(row, DATA.model);
      var growth = Math.min(DATA.model.growth_cap, Math.max(DATA.model.growth_floor, row.change_7d === null ? 0 : row.change_7d));
      var age = row.age_days === null ? DATA.model.unknown_age_days : row.age_days;
      var maturity = DATA.model.maturity_floor + (Math.min(Math.max(age, 0), DATA.model.maturity_days) / DATA.model.maturity_days) * DATA.model.maturity_range;
      var breadth = 1 + Math.min(Math.max((row.chains || []).length - 1, 0), DATA.model.breadth_max_chains) * DATA.model.breadth_per_chain;
      var eq = function (label, value) {
        return el('div', null, el('span', { text: label }), el('b', { text: value }));
      };
      var modelSection = el('section', { class: 'detail-section' },
        el('h3', { text: 'Model breakdown' }),
        el('div', { class: 'equation' },
          eq('TVL', fmtUsd(row.tvl_usd)),
          eq('Category multiple', row.category_multiple.toFixed(3) + 'x' + (row.category_peers >= 3 ? ' (' + row.category_peers + ' peers)' : ' (snapshot median)')),
          eq('7-day growth', fmtPct(row.change_7d) + ' → ×' + (1 + (growth / 100) * DATA.model.growth_weight).toFixed(3)),
          eq('Maturity', fmtAge(row.age_days) + ' → ×' + maturity.toFixed(3)),
          eq('Chain breadth', (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') + ' → ×' + breadth.toFixed(3)),
          eq('Implied value', fmtUsd(row.implied_value_usd))));
      var note = recomputed === row.implied_value_usd
        ? 'The page recomputes this value from the snapshot figures and it matches board.json (' + fmtUsd(row.implied_value_usd) + '). Implied value is a model estimate, not a price: the token does not exist yet.'
        : 'The page recomputes ' + fmtUsd(recomputed) + ' from the snapshot figures, which does not match board.json (' + fmtUsd(row.implied_value_usd) + ') — treat the row as stale.';
      modelSection.appendChild(el('p', { class: 'note', text: note }));
      dialog.appendChild(modelSection);
      var stand = standouts(row);
      var why = el('section', { class: 'detail-section' }, el('h3', { text: 'Why this rank' }));
      var list = el('ul', { class: 'standouts' });
      stand.forEach(function (s) { list.appendChild(el('li', { text: s })); });
      why.appendChild(list);
      dialog.appendChild(why);
      var steps = farmSteps(row);
      var plan = el('section', { class: 'detail-section' },
        el('h3', { text: 'Farm plan' }),
        el('p', { class: 'sub', text: 'Concrete steps with cost and time. This is a plan for positioning, not a promise: a launch is not guaranteed, and the token does not exist yet.' }));
      var ol = el('ol', { class: 'steps' });
      steps.forEach(function (s) {
        var idx = s.indexOf(' Cost: ');
        var body = idx >= 0 ? s.slice(0, idx) : s;
        var cost = idx >= 0 ? s.slice(idx + 1) : '';
        ol.appendChild(el('li', null, el('b', { text: body }), el('span', { class: 'cost', text: cost })));
      });
      plan.appendChild(ol);
      dialog.appendChild(plan);
      var honest = el('section', { class: 'detail-section' },
        el('h3', { text: 'What this is, and what it is not' }),
        el('p', { class: 'sub', text: 'This protocol records no token on DefiLlama: no market cap, no CoinGecko id, no symbol. That is not proof it will launch one, and implied value is not a price. The farm plan is how to position if it does; the fifth step is the category\'s own caution, because the risk is part of the plan.' + (EXCLUDED_CATEGORIES.indexOf(row.category) >= 0 ? ' This protocol is ranked because it is on the watchlist, even though its category (' + row.category + ') is one the early radar sets aside — a restaked, wrapped or bridged product of a token that already trades.' : '') }));
      dialog.appendChild(honest);
    } else {
      var liveSection = el('section', { class: 'detail-section' },
        el('h3', { text: 'Already has a token' }),
        el('p', { class: 'sub', text: live.name + ' already trades, so it cannot launch a token. Its value is the market\'s own market cap (' + fmtUsd(live.mcap_usd) + ' on ' + fmtUsd(live.tvl_usd) + ' of TVL), not a model estimate. It is shown here so the board\'s separation is checkable: live-token protocols are never ranked for a launch.' }));
      dialog.appendChild(liveSection);
    }
    state.selected = slug;
    writeHash();
    dialog.showModal();
    renderTable();
  }

  function renderAll() {
    app.replaceChildren();
    var shell = el('div', { class: 'shell' }, header(), lede(), spotlight(), controls(), el('div', { id: 'table-host' }), modelPanel());
    app.appendChild(shell);
    app.removeAttribute('aria-busy');
    renderTable();
    if (state.selected) openDetail(state.selected);
  }

  window.addEventListener('hashchange', function () {
    readHash();
    if (state.selected) openDetail(state.selected);
  });
  readHash();
  renderAll();
})();
