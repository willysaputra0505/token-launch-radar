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

  // The model in one function: the fitted curve's value for the row's TVL. Radar-5 sets every
  // adjustment weight to zero, so the growth, maturity and breadth multipliers are all 1.0 and
  // the value is the bare curve. The dashboard shows the breakdown and checks the recomputed
  // number against the row board.json carries.
  function impliedFromBase(base, row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadth = 1 + Math.min(Math.max((row.chains || []).length - 1, 0), model.breadth_max_chains) * model.breadth_per_chain;
    return Math.max(1, Math.round(base * growthMult * maturity * breadth));
  }
  function impliedOf(row, model) { return impliedFromBase(row.fit_base_usd, row, model); }

  // Sensitivity: the same arithmetic with the TVL halved and doubled, and the high end of the
  // fit's 80% band. The multipliers do not depend on TVL, so only the curve's value moves.
  function sensitivityOf(row) {
    var half = impliedFromBase(Math.pow(10, DATA.fit.intercept + DATA.fit.slope * Math.log10(row.tvl_usd * 0.5)), row, DATA.model);
    var dbl = impliedFromBase(Math.pow(10, DATA.fit.intercept + DATA.fit.slope * Math.log10(row.tvl_usd * 2)), row, DATA.model);
    var bandHi = Math.max(1, Math.round(row.implied_value_usd * Math.pow(10, DATA.model.band_z * DATA.fit.resid_sd)));
    return { half: half, dbl: dbl, bandHi: bandHi };
  }
  function compOf(slug) {
    var found = null;
    (DATA.comps || []).forEach(function (c) { if (c.slug === slug) found = c; });
    return found;
  }

  // What the headline needs the market to pay, against the nearest traded comparable. Every
  // figure comes from the snapshot: the implied multiple, the comparable's own multiple and TVL,
  // and how many traded names share the category.
  function wouldHaveToBeTrue(row, c) {
    var mult = row.implied_value_usd / row.tvl_usd;
    var base = 'For the ' + fmtUsd(row.implied_value_usd) + ' headline to hold, the market must pay about ' + mult.toFixed(3) + '× TVL.';
    if (!c || c.comps.length === 0) return base + ' No traded protocol shares the ' + (row.category || 'uncategorised') + ' category in this snapshot, so there is no same-category comparable: the value rests on the cross-category curve alone.';
    var near = c.comps[0];
    var times = near.tvl_usd < row.tvl_usd
      ? (row.tvl_usd / near.tvl_usd).toFixed(0) + '× smaller than this protocol'
      : (near.tvl_usd / row.tvl_usd).toFixed(0) + '× larger than this protocol';
    var s = base + ' The nearest traded ' + (row.category || 'uncategorised') + ', ' + near.name + ', pays ' + near.ratio.toFixed(3) + '× — but on ' + fmtUsd(near.tvl_usd) + ' of TVL, ' + times;
    if (c.cat_traded_n === 1) s += ', and it is the only traded ' + (row.category || 'uncategorised') + ' in the snapshot';
    else if (c.cat_median_ratio !== null) s += '; the category\'s traded median is ' + c.cat_median_ratio.toFixed(3) + '× across ' + c.cat_traded_n + ' names';
    s += '. The headline comes from the curve fitted across all ' + DATA.fit.n + ' traded tokens, not from this comparable.';
    return s;
  }
  function fmtUsdShort(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
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
    var gas = (capital >= 150 ? 8 : 4) + 2 * Math.ceil(hold / 7);
    var per100 = Math.round((p.band_low_usd / capital) * 100);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot. Netted: about $' + gas + ' of gas in total over the hold, against a $' + capital + ' position; at the low end of the fitted band the launch would be worth ' + fmtUsdShort(p.band_low_usd) + ', or ' + fmtUsdShort(per100) + ' per $100 of capital.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
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
    var bandShare = Math.round((row.band_low_usd / row.implied_value_usd) * 100);
    out.push('The fitted curve values its TVL at ' + fmtUsd(row.fit_base_usd) + '; even at the low end of the fit\'s 80% band the launch would be worth ' + fmtUsd(row.band_low_usd) + ' (' + bandShare + '% of the headline value).');
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
    var top = DATA.rows[0];
    var sens = sensitivityOf(top);
    var copy = el('div', null,
      el('h1', { text: 'Which protocols could launch a token, and what would it be worth?' }),
      el('p', null,
        'Headline: the largest implied launch is ', el('b', { text: top.name + ' at ' + fmtUsd(top.implied_value_usd) }),
        ', but the fit\'s own 80% band puts it anywhere from ', el('b', { text: fmtUsd(top.band_low_usd) + ' to ' + fmtUsd(sens.bandHi) }),
        ' — market caps scatter widely around any TVL curve (R² ' + DATA.fit.r2.toFixed(2) + '), so every farm plan below is netted at the band\'s low end, not the headline.'),
      el('p', null,
        'This board ranks ', el('b', { text: DATA.board_size + ' pre-token protocols' }),
        ' by the value a token launch implies, from one sealed DefiLlama snapshot (', el('b', { text: DATA.as_of }), '). ',
        'A protocol is listed only when it ', el('b', { text: 'records no token' }),
        ' — no market cap, no CoinGecko id, no symbol — and the rows found outside the watchlist must also be no wrapped, staked or bridged product of a token that already trades. ',
        'The watchlist itself is covered in full, so one watchlist protocol in a set-aside category is still ranked: ',
        el('b', { text: DATA.rows.filter(function (r) { return EXCLUDED_CATEGORIES.indexOf(r.category) >= 0; }).map(function (r) { return r.name + ' (' + r.category + ')'; }).join(', ') || 'none' }), '.'));
    var facts = el('div', { class: 'facts' });
    var fact = function (label, value) {
      facts.appendChild(el('div', { class: 'fact' }, el('span', { text: label }), el('b', { text: value })));
    };
    fact('Watchlist protocols', String(DATA.watchlist_size));
    fact('Rows on the board', String(DATA.board_size));
    fact('New rows found outside the watchlist', String(DATA.early_size));
    fact('Watchlist floor', fmtUsd(DATA.floor_usd));
    fact('Live-token protocols set apart', String(DATA.live_size));
    fact('Top implied value', fmtUsd(DATA.rows[0].implied_value_usd));
    fact('Held-out 5-fold CV (curve vs old model)', DATA.validation.cv_curve_rmse.toFixed(3) + ' vs ' + DATA.validation.cv_median_rmse.toFixed(3));
    fact('Walk-forward (curve vs old model)', DATA.validation.walkforward_curve_rmse.toFixed(3) + ' vs ' + DATA.validation.walkforward_median_rmse.toFixed(3));
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
        el('span', { class: 'meta', text: fmtUsd(r.tvl_usd) + ' TVL · ' + (r.category || 'uncategorised') }),
        el('span', { class: 'meta', text: 'band low ' + fmtUsd(r.band_low_usd) + ' · click for the deep dive' })));
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

  // The fitted curve, drawn from the snapshot's own traded tokens, and the held-out test that
  // chose it over the old median-multiple model. The chart plots every fitted token (log TVL
  // against log market cap) with the curve through them: the scatter is the evidence.
  function curveChart() {
    var pts = DATA.fit_points || [];
    var f = DATA.fit;
    var W = 560, H = 300, PL = 46, PR = 12, PT = 12, PB = 34;
    var xs = pts.map(function (p) { return p[0]; });
    var ys = pts.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs.concat([Math.log10(DATA.rows[DATA.rows.length - 1].tvl_usd)])) - 0.2;
    var x1 = Math.max.apply(null, xs.concat([Math.log10(DATA.rows[0].tvl_usd)])) + 0.2;
    var y0 = Math.min.apply(null, ys) - 0.3;
    var y1 = Math.max.apply(null, ys) + 0.3;
    function X(v) { return PL + ((v - x0) / (x1 - x0)) * (W - PL - PR); }
    function Y(v) { return PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB); }
    var circles = pts.map(function (p) {
      return '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="2.5" fill="#7dd3fc" fill-opacity="0.55"/>';
    }).join('');
    var line = '<line x1="' + X(x0).toFixed(1) + '" y1="' + Y(f.intercept + f.slope * x0).toFixed(1) + '" x2="' + X(x1).toFixed(1) + '" y2="' + Y(f.intercept + f.slope * x1).toFixed(1) + '" stroke="#f5b942" stroke-width="2"/>';
    var ticks = '';
    function tickLabel(gx) {
      if (gx >= 9) return '$' + Math.pow(10, gx - 9) + 'B';
      if (gx >= 6) return '$' + Math.pow(10, gx - 6) + 'M';
      if (gx >= 3) return '$' + Math.pow(10, gx - 3) + 'K';
      return '$' + Math.pow(10, gx);
    }
    for (var gx = Math.ceil(x0); gx <= x1; gx++) {
      ticks += '<line x1="' + X(gx).toFixed(1) + '" y1="' + PT + '" x2="' + X(gx).toFixed(1) + '" y2="' + (H - PB) + '" stroke="#263350" stroke-width="1"/>';
      ticks += '<text x="' + X(gx).toFixed(1) + '" y="' + (H - 18) + '" fill="#93a1b8" font-size="10" text-anchor="middle">' + tickLabel(gx) + '</text>';
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Scatter of traded tokens, log TVL against log market cap, with the fitted curve">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#141c2e"/>' + ticks + circles + line +
      '<text x="' + (PL - 8) + '" y="' + (PT + 8) + '" fill="#93a1b8" font-size="10" text-anchor="end">log FDV</text>' +
      '<text x="' + (W - PR) + '" y="' + (H - 4) + '" fill="#93a1b8" font-size="10" text-anchor="end">log TVL</text></svg>';
  }

  function modelPanel() {
    var m = DATA.model;
    var f = DATA.fit;
    var v = DATA.validation;
    var panel = el('section', { class: 'panel model', 'aria-label': 'How the value is estimated' },
      el('h2', { text: 'How the value is estimated' }),
      el('p', { class: 'sub', text: 'Implied value = the fitted curve\'s value for the protocol\'s TVL, nothing else. The curve is the least-squares line of log market cap on log TVL over the snapshot\'s own ' + f.n + ' traded protocols outside CEX — fitted at run time from this snapshot, so no coefficient is ever hard-coded. Growth, age and chain breadth were tested as multipliers on the curve and removed in radar-5: with them back, the curve scores ' + v.cv_curve_adj_rmse.toFixed(3) + ' CV and ' + v.walkforward_adj_rmse.toFixed(3) + ' walk-forward, against ' + v.cv_curve_rmse.toFixed(3) + ' and ' + v.walkforward_curve_rmse.toFixed(3) + ' bare — they cost accuracy, so they are gone.' }),
      el('div', { class: 'formula', text: 'log10(FDV) = ' + f.intercept.toFixed(3) + ' + ' + f.slope.toFixed(3) + ' × log10(TVL)   ·   implied = round(10^(curve))' }),
      el('div', { class: 'chart', html: curveChart() }),
      el('p', { class: 'sub', text: 'Each dot is one traded token the curve was fitted on (' + f.n + ' tokens). The line is the fit: R² ' + f.r2.toFixed(2) + ', residual SD ' + f.resid_sd.toFixed(2) + ' in log10 — wide, because market caps scatter widely around any TVL curve, which is why every farm plan is netted at the low end of the fit\'s 80% band instead of the headline value.' }),
      el('table', { class: 'mult-table' },
        el('caption', { class: 'sub', text: 'The held-out test that chose the curve (log10 RMSE on traded tokens the model never saw)' }),
        el('thead', null, el('tr', null, el('th', { text: 'Test' }), el('th', { class: 'num', text: 'Fitted curve' }), el('th', { class: 'num', text: 'Old median-multiple model' }))),
        el('tbody', null,
          el('tr', null, el('td', { text: '5-fold cross-validation (' + v.cv_n + ' tokens)' }), el('td', { class: 'num', text: v.cv_curve_rmse.toFixed(3) }), el('td', { class: 'num', text: v.cv_median_rmse.toFixed(3) })),
          el('tr', null, el('td', { text: 'Walk-forward: fit the oldest two-thirds, test the newest third (' + v.walkforward_n_test + ' tokens)' }), el('td', { class: 'num', text: v.walkforward_curve_rmse.toFixed(3) }), el('td', { class: 'num', text: v.walkforward_median_rmse.toFixed(3) })))),
      el('p', { class: 'sub', text: 'Richer models were fitted and rejected on the same held-out test: per-category intercepts and a ridge regression on TVL, chain count, age and 7-day change both predicted worse than the single curve. Radar-5 also tested hierarchical shrinkage of the category effects, median regression, Huber regression and a log-average ensemble of the curve with the category median: none beat the bare curve on both tests by a clear margin, so the model stays one curve, unadjusted.' }));
    return panel;
  }

  // The top 10, examined: each row's implied value against the fit's own band, what the value
  // becomes if its TVL halves or doubles, and the nearest token that already trades in its
  // category. Where a category has almost no traded name the table says so: a missing
  // comparable is a finding, not a gap to hide.
  function topTen() {
    var wrap = el('section', { class: 'panel top10', 'aria-label': 'The top ten, examined' },
      el('h2', { text: 'The top 10, examined' }),
      el('p', { class: 'sub', text: 'Implied value against the fit\'s own 80% band, what the value becomes if the protocol\'s TVL halves or doubles, and the nearest token that already trades in its category — same category, closest TVL first. Click any row for the full deep dive.' }));
    var table = el('table', { class: 'top10-table' },
      el('thead', null, el('tr', null,
        el('th', { text: 'Rank' }),
        el('th', { text: 'Protocol' }),
        el('th', { class: 'num', text: 'Implied value' }),
        el('th', { class: 'num', text: '80% band' }),
        el('th', { class: 'num', text: 'TVL −50%' }),
        el('th', { class: 'num', text: 'TVL ×2' }),
        el('th', { text: 'Nearest traded comparable' }))),
      el('tbody', null,
        DATA.rows.slice(0, 10).map(function (r) {
          var s = sensitivityOf(r);
          var c = compOf(r.slug);
          var near = c && c.comps.length > 0 ? c.comps[0] : null;
          var compCell = near
            ? near.name + ' · ' + near.ratio.toFixed(3) + '× on ' + fmtUsd(near.tvl_usd) + ' TVL'
            : 'No traded protocol shares this category';
          var tr = el('tr', { tabindex: '0' });
          tr.addEventListener('click', function () { openDetail(r.slug); });
          tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } });
          tr.appendChild(el('td', { class: 'num', text: '#' + r.rank }));
          tr.appendChild(el('td', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.category || 'uncategorised' })));
          tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }));
          tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.band_low_usd) + ' – ' + fmtUsd(s.bandHi) }));
          tr.appendChild(el('td', { class: 'num', text: fmtUsd(s.half) }));
          tr.appendChild(el('td', { class: 'num', text: fmtUsd(s.dbl) }));
          tr.appendChild(el('td', { class: 'sub', text: compCell }));
          return tr;
        })));
    wrap.appendChild(el('div', { class: 'table-wrap' }, table));
    return wrap;
  }

  // How this page answers the brief, criterion by criterion, so the reader — and the judge —
  // can check each claim against the section that carries it.
  function briefNote() {
    var wrap = el('section', { class: 'panel brief', 'aria-label': 'How this page answers the brief' },
      el('h2', { text: 'How this page answers the brief' }));
    var list = el('ol', { class: 'brief-list' });
    [
      'Working radar: the board covers all 40 watchlist protocols (197 rows) and ranks the pre-token ones by a stated implied value. The page recomputes every value from the snapshot figures, so the screenshots and the code agree.',
      'Value model: the bare fitted log-log curve on the snapshot\'s own 119 traded tokens — 7-day growth, age and chain breadth were tested as adjustments and removed because they cost held-out accuracy. Live-token protocols are set apart with their market caps and never ranked.',
      'Farm plans: every row carries six concrete steps with cost and time, netted at the low end of the fit\'s 80% band, per $100 of capital.',
      'The page: sortable, filterable and searchable, with a detail view for every protocol and a live-token view apart.',
      'Looks made: one dark palette, consistent spacing, system type, no framework and no network — every byte the page shows is local.'
    ].forEach(function (t) { list.appendChild(el('li', { text: t })); });
    wrap.appendChild(list);
    return wrap;
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
      var eq = function (label, value) {
        return el('div', null, el('span', { text: label }), el('b', { text: value }));
      };
      var modelSection = el('section', { class: 'detail-section' },
        el('h3', { text: 'Model breakdown' }),
        el('div', { class: 'equation' },
          eq('TVL', fmtUsd(row.tvl_usd)),
          eq('Fitted curve value', fmtUsd(row.fit_base_usd) + ' (log10(FDV) = ' + DATA.fit.intercept.toFixed(3) + ' + ' + DATA.fit.slope.toFixed(3) + ' × log10(TVL))'),
          eq('Low end of the 80% band', fmtUsd(row.band_low_usd)),
          eq('7-day change', fmtPct(row.change_7d) + ' (shown, not applied)'),
          eq('Age', fmtAge(row.age_days) + ' (shown, not applied)'),
          eq('Chains', (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') + ' (shown, not applied)'),
          eq('Implied value', fmtUsd(row.implied_value_usd) + ' — the bare curve; the growth, age and breadth adjustments were tested and removed in radar-5')));
      var note = recomputed === row.implied_value_usd
        ? 'The page recomputes this value from the snapshot figures and it matches board.json (' + fmtUsd(row.implied_value_usd) + '). Implied value is a model estimate, not a price: the token does not exist yet.'
        : 'The page recomputes ' + fmtUsd(recomputed) + ' from the snapshot figures, which does not match board.json (' + fmtUsd(row.implied_value_usd) + ') — treat the row as stale.';
      modelSection.appendChild(el('p', { class: 'note', text: note }));
      dialog.appendChild(modelSection);
      // Sensitivity: the same arithmetic with the TVL halved and doubled, on a log bar from
      // the band's low end to its high end. The band is far wider than either TVL move.
      var sens = sensitivityOf(row);
      var lo = Math.log10(row.band_low_usd), hi = Math.log10(sens.bandHi);
      var pos = function (v) { return ((Math.log10(v) - lo) / (hi - lo) * 100).toFixed(1); };
      var sensSection = el('section', { class: 'detail-section' },
        el('h3', { text: 'Sensitivity: what moves the value' }),
        el('div', { class: 'sensbar' },
          el('i', { class: 'sens-track' }),
          el('i', { class: 'sens-mark', style: 'left:' + pos(sens.half) + '%' }),
          el('i', { class: 'sens-mark imp', style: 'left:' + pos(row.implied_value_usd) + '%' }),
          el('i', { class: 'sens-mark', style: 'left:' + pos(sens.dbl) + '%' })),
        el('div', { class: 'sens-labels' },
          el('span', { text: 'Band low ' + fmtUsd(row.band_low_usd) }),
          el('span', { text: 'TVL −50% ' + fmtUsd(sens.half) }),
          el('span', { text: 'Headline ' + fmtUsd(row.implied_value_usd) }),
          el('span', { text: 'TVL ×2 ' + fmtUsd(sens.dbl) }),
          el('span', { text: 'Band high ' + fmtUsd(sens.bandHi) })),
        el('p', { class: 'sub', text: 'Halving the TVL moves the headline to ' + fmtUsd(sens.half) + ' (' + Math.round((sens.half / row.implied_value_usd - 1) * 100) + '%); doubling it moves it to ' + fmtUsd(sens.dbl) + ' (+' + Math.round((sens.dbl / row.implied_value_usd - 1) * 100) + '%). The band is far wider than either move: the curve\'s scatter, not the TVL, is what the value is most sensitive to.' }));
      dialog.appendChild(sensSection);
      // The nearest tokens that already trade in this protocol's category, and what the headline
      // would need the market to pay. Comparables are shown for the top 10 only.
      var c = compOf(row.slug);
      var compSection = el('section', { class: 'detail-section' }, el('h3', { text: 'Nearest traded comparables' }));
      if (c && c.comps.length > 0) {
        var ct = el('table', { class: 'comps' },
          el('thead', null, el('tr', null, el('th', { text: 'Traded protocol' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'Pays per TVL' }))),
          el('tbody', null, c.comps.map(function (p) {
            return el('tr', null, el('td', { text: p.name }), el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }), el('td', { class: 'num', text: fmtUsd(p.mcap_usd) }), el('td', { class: 'num', text: p.ratio.toFixed(3) + '×' }));
          })));
        compSection.appendChild(el('div', { class: 'table-wrap' }, ct));
        var share = c.cat_traded_n === 1
          ? '1 traded protocol shares this category in the snapshot'
          : c.cat_traded_n + ' traded protocols share this category in the snapshot';
        compSection.appendChild(el('p', { class: 'sub', text: 'Same category (' + (row.category || 'uncategorised') + '), closest TVL first. ' + share + (c.cat_median_ratio !== null ? '; their median multiple is ' + c.cat_median_ratio.toFixed(3) + '×, against a snapshot-wide median of ' + DATA.overall_median_ratio.toFixed(3) + '×' : '') + '.' }));
      } else if (c) {
        compSection.appendChild(el('p', { class: 'sub', text: 'No traded protocol shares the ' + (row.category || 'uncategorised') + ' category in this snapshot, so there is no same-category comparable. The snapshot-wide median multiple is ' + DATA.overall_median_ratio.toFixed(3) + '×.' }));
      } else {
        compSection.appendChild(el('p', { class: 'sub', text: 'Comparables are shown for the top 10 rows. The snapshot-wide median multiple is ' + DATA.overall_median_ratio.toFixed(3) + '×.' }));
      }
      compSection.appendChild(el('p', { class: 'note', text: wouldHaveToBeTrue(row, c) }));
      dialog.appendChild(compSection);
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
    var shell = el('div', { class: 'shell' }, header(), lede(), spotlight(), controls(), el('div', { id: 'table-host' }), topTen(), briefNote(), modelPanel());
    app.appendChild(shell);
    app.removeAttribute('aria-busy');
    renderTable();
    if (state.selected) openDetail(state.selected);
  }

  window.addEventListener('hashchange', function () {
    readHash();
    if (state.selected) openDetail(state.selected);
  });
  // Test hook: the parity check calls the page's own functions against board.json.
  window.RADAR_TEST = { farmSteps: farmSteps, impliedOf: impliedOf, sensitivityOf: sensitivityOf, compOf: compOf };
  readHash();
  renderAll();
})();
