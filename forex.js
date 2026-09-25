// ============================================================
// forex.js – Forex rates + historical date lookup (AD & BS)
//            + currency converter + BS/AD date converter
// Depends on: data.js (window.DATA)
// ============================================================

(function () {
    'use strict';

    // ----- CONFIG -----
    const BASE = 'https://www.nrb.org.np/api/forex/v1';
    const REFRESH_MS = 5 * 60 * 1000;
    const MAX_LOOKBACK_DAYS = 7;
    const MIN_DATE = '2010-01-01';

    const DEFAULT_FROM = 'USD';
    const DEFAULT_TO   = 'NPR';

    // ----- STATE -----
    let forexRates = [];
    let currentDate = startOfDay(new Date());
    let lastPublishedDate = null;
    let pickerMode = 'AD';
    let bsPickerSyncFn = null;

    // ----- CURRENCY ORDER & FLAG MAP -----
    const order = [
        'USD', 'EUR', 'INR', 'GBP', 'AUD', 'JPY', 'CNY', 'SAR', 'AED',
        'CAD', 'SGD', 'CHF', 'QAR', 'THB', 'MYR', 'KRW', 'SEK', 'DKK',
        'HKD', 'KWD', 'BHD', 'OMR'
    ];

    const flagMap = {
        USD: 'usa.png', EUR: 'eu.png', GBP: 'gb.png', JPY: 'jp.png',
        AUD: 'au.png', CAD: 'ca.png', CHF: 'ch.png', CNY: 'cn.png',
        INR: 'in.png', SGD: 'sg.png', SAR: 'sa.png', AED: 'ae.png',
        QAR: 'qa.png', THB: 'th.png', MYR: 'my.png', KRW: 'kr.png',
        SEK: 'se.png', DKK: 'dk.png', HKD: 'hk.png', KWD: 'kw.png',
        BHD: 'bh.png', OMR: 'om.png', NPR: 'np.png'
    };

    // Flags are decorative because the currency code is always visible.
    function flagImgHtml(code, cls) {
        const file = flagMap[code];
        if (!file) return '';
        return `<img src="assets/flags/${file}" alt="" aria-hidden="true" class="${cls}"
                     onerror="this.style.display='none'">`;
    }

    // ----- DATE HELPERS -----
    function startOfDay(d) {
        const x = new Date(d);
        x.setHours(0, 0, 0, 0);
        return x;
    }
    function toISO(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function todayISO() { return toISO(new Date()); }
    function addDays(d, n) {
        const x = new Date(d);
        x.setDate(x.getDate() + n);
        return x;
    }
    function isSameDay(a, b) {
        return a.getFullYear() === b.getFullYear()
            && a.getMonth() === b.getMonth()
            && a.getDate() === b.getDate();
    }

    // ----- BS/AD CONVERSION -----
    function getNepaliMonths() {
        return window.DATA?.nepaliMonths
            || ['बैशाख','जेठ','असार','साउन','भदौ','असोज','कार्तिक','मंसिर','पौष','माघ','फागुन','चैत्र'];
    }
    function getNepaliWeekdays() {
        return window.DATA?.nepaliWeekdaysFull
            || ['आइतवार','सोमवार','मंगलवार','बुधवार','बिहीवार','शुक्रवार','शनिबार'];
    }
    function getAvailableYears() {
        if (!window.DATA?.bsData) return [];
        return Object.keys(window.DATA.bsData).map(Number).sort((a, b) => a - b);
    }
    function daysInBsYear(y) {
        return window.DATA.bsData[y].reduce((a, b) => a + b, 0);
    }
    function epochDate() { return new Date(1943, 3, 14); }

    function bsToAd(bsYear, bsMonth, bsDay) {
        const years = getAvailableYears();
        if (!years.includes(bsYear)) return null;
        const monthsInYear = window.DATA.bsData[bsYear];
        if (!monthsInYear || bsMonth < 0 || bsMonth > 11) return null;
        const maxDay = monthsInYear[bsMonth];
        if (bsDay < 1 || bsDay > maxDay) return null;

        let offset = 0;
        for (const y of years) {
            if (y >= bsYear) break;
            offset += daysInBsYear(y);
        }
        for (let i = 0; i < bsMonth; i++) offset += monthsInYear[i];
        offset += bsDay - 1;

        const result = new Date(epochDate());
        result.setDate(result.getDate() + offset);
        return result;
    }

    function adToBs(adYear, adMonth, adDay) {
        const years = getAvailableYears();
        if (!years.length) return { y: 2083, m: 4, d: 2 };

        const input = new Date(adYear, adMonth - 1, adDay);
        const diff = Math.floor((input - epochDate()) / 86400000);

        if (diff < 0) return { y: years[0], m: 0, d: 1, outOfRange: true };

        let remaining = diff;
        let foundYear = years[0];
        let foundMonth = 0;

        outer:
        for (const Y of years) {
            const months = window.DATA.bsData[Y];
            for (let mi = 0; mi < 12; mi++) {
                const len = months[mi] || 30;
                if (remaining < len) {
                    foundYear = Y;
                    foundMonth = mi;
                    break outer;
                }
                remaining -= len;
            }
        }

        const lastYear = years[years.length - 1];
        const maxDay = window.DATA.bsData[foundYear]?.[foundMonth] || 30;
        const day = remaining + 1;

        return {
            y: foundYear,
            m: foundMonth,
            d: day,
            outOfRange: foundYear === lastYear && day > maxDay
        };
    }

    function formatBsDate(isoString) {
        if (!isoString) return '--';
        const d = new Date(isoString);
        if (isNaN(d)) return '--';
        const bs = adToBs(d.getFullYear(), d.getMonth() + 1, d.getDate());
        if (bs.outOfRange) return '--';
        const months = getNepaliMonths();
        return `${String(bs.d).padStart(2, '0')} ${months[bs.m]} ${bs.y}`;
    }

    // ============================================================
    // WHEEL SCROLL PREVENTION
    // ============================================================
    function preventWheelScroll() {
        const inputs = document.querySelectorAll(
            'input[type="number"], input[type="date"], select.forex-date-select'
        );
        inputs.forEach(input => {
            input.addEventListener('wheel', (e) => {
                e.preventDefault();
                input.blur();
            }, { passive: false });
        });
    }

    // ============================================================
    // BS/AD DATE PICKER
    // ============================================================
    function initBsPicker() {
        const yearSel  = document.getElementById('bs-picker-year');
        const monthSel = document.getElementById('bs-picker-month');
        const daySel   = document.getElementById('bs-picker-day');
        const toggle   = document.getElementById('picker-mode-toggle');
        const adInput  = document.getElementById('forex-date');
        const bsPicker = document.getElementById('forex-bs-picker');
        if (!yearSel || !monthSel || !daySel || !toggle || !adInput || !bsPicker) return;

        const today    = startOfDay(new Date());
        const minDate  = new Date(MIN_DATE + 'T00:00:00');

        const years = getAvailableYears();
        const validYears = years.filter(y => {
            const firstDayAd = bsToAd(y, 0, 1);
            const lastMonth = 11;
            const lastDayBs = window.DATA.bsData[y][lastMonth];
            const lastDayAd = bsToAd(y, lastMonth, lastDayBs);
            if (!firstDayAd || !lastDayAd) return false;
            return lastDayAd >= minDate && firstDayAd <= today;
        });
        yearSel.innerHTML = validYears
            .map(y => `<option value="${y}">${y}</option>`)
            .join('');

        const months = getNepaliMonths();
        monthSel.innerHTML = months
            .map((m, i) => `<option value="${i}">${m}</option>`)
            .join('');

        function populateDays() {
            const y = parseInt(yearSel.value, 10);
            const m = parseInt(monthSel.value, 10);
            const dim = window.DATA?.bsData?.[y]?.[m] || 30;
            const prev = parseInt(daySel.value, 10) || 1;
            daySel.innerHTML = Array.from({ length: dim }, (_, i) =>
                `<option value="${i + 1}">${i + 1}</option>`
            ).join('');
            daySel.value = Math.min(prev, dim);
        }

        function syncFromAd(dateObj) {
            const bs = adToBs(dateObj.getFullYear(), dateObj.getMonth() + 1, dateObj.getDate());
            if (bs.outOfRange) return;
            if (!Array.from(yearSel.options).some(o => parseInt(o.value, 10) === bs.y)) return;
            yearSel.value = bs.y;
            monthSel.value = bs.m;
            populateDays();
            daySel.value = bs.d;
        }

        function syncFromBs() {
            const y = parseInt(yearSel.value, 10);
            const m = parseInt(monthSel.value, 10);
            const d = parseInt(daySel.value, 10);
            const ad = bsToAd(y, m, d);
            if (!ad) return;

            let safe = startOfDay(ad);
            let clamped = false;
            if (safe > today) { safe = today; clamped = true; }
            if (safe < minDate) { safe = minDate; clamped = true; }

            if (clamped) {
                const bs = adToBs(safe.getFullYear(), safe.getMonth() + 1, safe.getDate());
                if (!bs.outOfRange) {
                    yearSel.value = bs.y;
                    monthSel.value = bs.m;
                    populateDays();
                    daySel.value = bs.d;
                }
            }
            goToDate(safe);
        }

        yearSel.addEventListener('change', () => { populateDays(); syncFromBs(); });
        monthSel.addEventListener('change', () => { populateDays(); syncFromBs(); });
        daySel.addEventListener('change', () => syncFromBs());

        toggle.addEventListener('click', () => {
            pickerMode = (pickerMode === 'AD') ? 'BS' : 'AD';
            const showBs = pickerMode === 'BS';
            toggle.textContent = showBs ? 'AD' : 'BS';
            toggle.title = showBs ? 'Switch to AD date' : 'Switch to BS date';
            toggle.setAttribute('aria-label', toggle.title);
            adInput.hidden = showBs;
            bsPicker.hidden = !showBs;
            if (showBs) syncFromAd(currentDate);
        });

        populateDays();
        syncFromAd(currentDate);

        bsPickerSyncFn = syncFromAd;
    }

    // ============================================================
    // API FETCH
    // ============================================================
    async function fetchRatesForDate(dateObj, opts = {}) {
        const silent = !!opts.silent;
        const loading = document.getElementById('loading');
        if (!silent) loading?.classList.remove('hidden');

        const dateStr = toISO(dateObj);
        let payload = null;
        let actualDate = dateStr;

        try {
            payload = await tryFetch(dateStr, dateStr);

            if (!payload) {
                const from = addDays(dateObj, -MAX_LOOKBACK_DAYS);
                const fromStr = toISO(from);
                const payloads = await tryFetchAll(fromStr, dateStr);
                if (payloads.length) {
                    payloads.sort((a, b) => new Date(b.date) - new Date(a.date));
                    payload = payloads[0];
                    actualDate = payload.date;
                }
            }

            if (!payload) throw new Error('No rates available for selected date');

            forexRates = payload.rates || [];
            lastPublishedDate = payload.date;

            updateRateDateBadge(dateStr, actualDate);
            updateTimestamp(payload.published_on || payload.date);
            updateConverterNote(actualDate);
            updateTodayButtonVisibility(dateObj);
            renderRates();
            renderPopularRates();
            populateCurrencySelects();
            convertCurrency();
        } catch {
            useFallbackRates();
            updateRateDateBadge(dateStr, null);
            updateConverterNote(null);
            updateTodayButtonVisibility(dateObj);
        } finally {
            if (!silent) loading?.classList.add('hidden');
        }
    }

    async function tryFetch(from, to) {
        try {
            const res = await fetch(`${BASE}/rates?page=1&per_page=100&from=${from}&to=${to}`);
            if (!res.ok) return null;
            const data = await res.json();
            return data?.data?.payload?.[0] || null;
        } catch { return null; }
    }

    async function tryFetchAll(from, to) {
        try {
            const res = await fetch(`${BASE}/rates?page=1&per_page=100&from=${from}&to=${to}`);
            if (!res.ok) return [];
            const data = await res.json();
            return data?.data?.payload || [];
        } catch { return []; }
    }

    function useFallbackRates() {
        forexRates = [
            { currency: { iso3: 'USD', name: 'U.S. Dollar',        unit: 1   }, buy: '153.76', sell: '154.36' },
            { currency: { iso3: 'EUR', name: 'European Euro',      unit: 1   }, buy: '175.85', sell: '176.53' },
            { currency: { iso3: 'GBP', name: 'UK Pound Sterling',  unit: 1   }, buy: '206.60', sell: '207.41' },
            { currency: { iso3: 'INR', name: 'Indian Rupee',       unit: 100 }, buy: '160.00', sell: '160.15' },
            { currency: { iso3: 'AUD', name: 'Australian Dollar',  unit: 1   }, buy: '100.10', sell: '100.55' },
            { currency: { iso3: 'JPY', name: 'Japanese Yen',       unit: 10  }, buy: '10.05',  sell: '10.10'  },
            { currency: { iso3: 'CNY', name: 'Chinese Yuan',       unit: 1   }, buy: '21.30',  sell: '21.42'  },
            { currency: { iso3: 'SAR', name: 'Saudi Riyal',        unit: 1   }, buy: '41.00',  sell: '41.15'  },
            { currency: { iso3: 'AED', name: 'UAE Dirham',         unit: 1   }, buy: '41.86',  sell: '42.01'  },
            { currency: { iso3: 'QAR', name: 'Qatari Riyal',       unit: 1   }, buy: '42.20',  sell: '42.35'  }
        ];
        const el = document.getElementById('updatedTime');
        if (el) el.textContent = 'Offline (fallback)';
        renderRates();
        renderPopularRates();
        populateCurrencySelects();
        convertCurrency();
    }

    // ============================================================
    // UI UPDATE HELPERS
    // ============================================================
    function updateRateDateBadge(requestedISO, actualISO) {
        const badge = document.getElementById('rateDateBadge');
        if (!badge) return;
        const requestedDate = new Date(requestedISO);
        const today = startOfDay(new Date());

        if (isSameDay(requestedDate, today)) {
            badge.textContent = 'Today';
            badge.style.display = '';
            return;
        }

        const reqLabel = requestedDate.toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric'
        });

        if (actualISO && actualISO !== requestedISO) {
            const act = new Date(actualISO);
            const actLabel = act.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            badge.textContent = `Showing ${actLabel} (no rates on ${reqLabel})`;
        } else {
            badge.textContent = reqLabel;
        }
        badge.style.display = '';
    }

    function updateTimestamp(isoDateTime) {
        const el = document.getElementById('updatedTime');
        if (!el) return;
        const d = new Date(isoDateTime);
        const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        el.textContent = `Updated ${dateStr} · ${timeStr}`;
    }

    function updateConverterNote(actualISO) {
        const el = document.getElementById('converterRateDate');
        if (!el) return;
        if (!actualISO) { el.textContent = 'unavailable date'; return; }
        el.textContent = formatBsDate(actualISO) || '--';
    }

    function updateTodayButtonVisibility(dateObj) {
        const todayBtn = document.getElementById('today-btn');
        const nextBtn  = document.getElementById('next-day');
        const dateInput = document.getElementById('forex-date');
        const today = startOfDay(new Date());

        const onToday = isSameDay(dateObj, today);
        if (todayBtn) todayBtn.hidden = onToday;
        if (nextBtn) nextBtn.disabled = onToday;

        if (dateInput) {
            dateInput.max = todayISO();
            dateInput.min = MIN_DATE;
            const iso = toISO(dateObj);
            if (dateInput.value !== iso) dateInput.value = iso;
        }
        if (bsPickerSyncFn) bsPickerSyncFn(dateObj);
    }

    // ============================================================
    // RENDER
    // ============================================================
    function renderRates() {
        const tbody = document.getElementById('ratesBody');
        if (!tbody) return;

        if (!forexRates.length) {
            tbody.innerHTML = `<tr><td colspan="4">
                <div class="empty-state">
                    <i class="far fa-calendar-times" aria-hidden="true"></i>
                    <p>No forex rates published for this date.</p>
                </div>
            </td></tr>`;
            return;
        }

        const ordered = [];
        order.forEach(code => {
            const r = forexRates.find(x => x.currency.iso3 === code);
            if (r) ordered.push(r);
        });
        forexRates.forEach(r => {
            if (!ordered.some(o => o.currency.iso3 === r.currency.iso3)) ordered.push(r);
        });

        tbody.innerHTML = ordered.map(r => {
            const c = r.currency;
            const flag = flagImgHtml(c.iso3, 'flag-img');
            return `
                <tr>
                    <td>
                        <div class="currency-cell">
                            ${flag}
                            <div class="currency-info">
                                <div class="code">${c.iso3}</div>
                                <div class="name">${c.name}</div>
                            </div>
                        </div>
                    </td>
                    <td class="unit-cell">${c.unit}</td>
                    <td><span class="rate-value">${parseFloat(r.buy).toFixed(2)}</span></td>
                    <td><span class="rate-value">${parseFloat(r.sell).toFixed(2)}</span></td>
                </tr>
            `;
        }).join('');
    }

    function renderPopularRates() {
        const tbody = document.getElementById('popularRatesBody');
        if (!tbody) return;

        if (!forexRates.length) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#999;font-size:0.8rem;padding:20px;">No data</td></tr>`;
            return;
        }

        const popular = [];
        for (const code of order) {
            if (popular.length >= 5) break;
            const r = forexRates.find(x => x.currency.iso3 === code);
            if (r) popular.push(r);
        }
        for (const r of forexRates) {
            if (popular.length >= 5) break;
            if (!popular.some(p => p.currency.iso3 === r.currency.iso3)) popular.push(r);
        }

        tbody.innerHTML = popular.map(r => {
            const c = r.currency;
            const flag = flagImgHtml(c.iso3, 'flag-img');
            return `
                <tr>
                    <td>${flag}<span class="curr-code">${c.iso3}</span></td>
                    <td>${c.unit}</td>
                    <td class="rate-val">${parseFloat(r.buy).toFixed(2)}</td>
                    <td class="rate-val">${parseFloat(r.sell).toFixed(2)}</td>
                </tr>
            `;
        }).join('');
    }

    // ============================================================
    // CURRENCY CONVERTER
    // ============================================================
    function populateCurrencySelects() {
        const fromSelect = document.getElementById('currency-from');
        const toSelect = document.getElementById('currency-to');
        if (!fromSelect || !toSelect) return;

        const prevFrom = fromSelect.value || DEFAULT_FROM;
        const prevTo   = toSelect.value   || DEFAULT_TO;

        const currencies = [
            { code: 'NPR', name: 'Nepalese Rupee' },
            ...forexRates.map(r => ({ code: r.currency.iso3, name: r.currency.name }))
        ];

        if (!currencies.some(c => c.code === 'USD')) {
            currencies.splice(1, 0, { code: 'USD', name: 'U.S. Dollar' });
        }

        const opts = currencies.map(c => `<option value="${c.code}">${c.code}</option>`).join('');
        fromSelect.innerHTML = opts;
        toSelect.innerHTML = opts;

        fromSelect.value = currencies.some(c => c.code === prevFrom) ? prevFrom : DEFAULT_FROM;
        toSelect.value   = currencies.some(c => c.code === prevTo)   ? prevTo   : DEFAULT_TO;
    }

    function getRateObj(code) {
        if (code === 'NPR') return { currency: { iso3: 'NPR', unit: 1 }, buy: '1', sell: '1' };
        return forexRates.find(x => x.currency.iso3 === code);
    }

    function convertCurrency() {
        const amountEl = document.getElementById('currency-amount');
        const resultEl = document.getElementById('currency-result');
        const fromCode = document.getElementById('currency-from')?.value;
        const toCode = document.getElementById('currency-to')?.value;
        if (!amountEl || !resultEl || !fromCode || !toCode) return;

        const amt = parseFloat(amountEl.value) || 0;
        let result = amt;

        const fromRate = getRateObj(fromCode);
        const toRate = getRateObj(toCode);
        if (!fromRate || !toRate) {
            resultEl.textContent = `${amt} ${fromCode} = -- ${toCode}`;
            return;
        }

        if (fromCode === toCode) {
            result = amt;
        } else if (fromCode === 'NPR') {
            result = amt / (parseFloat(toRate.sell) / toRate.currency.unit);
        } else if (toCode === 'NPR') {
            result = amt * (parseFloat(fromRate.buy) / fromRate.currency.unit);
        } else {
            const npr = amt * (parseFloat(fromRate.buy) / fromRate.currency.unit);
            result = npr / (parseFloat(toRate.sell) / toRate.currency.unit);
        }

        const formatted = result.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        resultEl.textContent = `${amt} ${fromCode} = ${formatted} ${toCode}`;
    }

    // ============================================================
    // DATE CONVERTER (sidebar widget)
    // ============================================================
    function populateDateDropdowns() {
        const months = getNepaliMonths();
        const bsMonth = document.getElementById('bs-month-compact');
        if (bsMonth) {
            bsMonth.innerHTML = months.map((m, i) => `<option value="${i}">${m}</option>`).join('');
        }
        const adMonth = document.getElementById('ad-month-compact');
        if (adMonth) {
            const adMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            adMonth.innerHTML = adMonths.map((m, i) => `<option value="${i}">${m}</option>`).join('');
        }
    }

    function initDateConverter() {
        document.getElementById('convert-bs-compact-btn')?.addEventListener('click', () => {
            const year  = parseInt(document.getElementById('bs-year-compact').value, 10);
            const month = parseInt(document.getElementById('bs-month-compact').value, 10);
            const day   = parseInt(document.getElementById('bs-day-compact').value, 10);
            const resultEl = document.getElementById('bs-to-ad-compact-result');
            if (!year || isNaN(month) || !day) {
                resultEl.textContent = 'कृपया सही मिति प्रविष्ट गर्नुहोस्';
                return;
            }
            const ad = bsToAd(year, month, day);
            if (!ad) { resultEl.textContent = 'अमान्य मिति'; return; }
            resultEl.textContent = ad.toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric'
            });
        });

        document.getElementById('convert-ad-compact-btn')?.addEventListener('click', () => {
            const year  = parseInt(document.getElementById('ad-year-compact').value, 10);
            const month = parseInt(document.getElementById('ad-month-compact').value, 10);
            const day   = parseInt(document.getElementById('ad-day-compact').value, 10);
            const resultEl = document.getElementById('ad-to-bs-compact-result');
            if (!year || isNaN(month) || !day) {
                resultEl.textContent = 'कृपया सही मिति प्रविष्ट गर्नुहोस्';
                return;
            }
            const bs = adToBs(year, month, day);
            if (bs.outOfRange) { resultEl.textContent = 'अमान्य मिति वा दायरा बाहिर'; return; }
            const months = getNepaliMonths();
            resultEl.textContent = `${months[bs.m]} ${bs.d}, ${bs.y}`;
        });

        document.querySelectorAll('.converter-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.converter-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.converter-form-compact').forEach(f => f.classList.remove('active'));
                document.getElementById(tab.dataset.mode + '-compact').classList.add('active');
            });
        });
    }

    // ============================================================
    // HERO DATE
    // ============================================================
    function updateHeroDate() {
        const now = new Date();
        const bs = adToBs(now.getFullYear(), now.getMonth() + 1, now.getDate());
        const months = getNepaliMonths();
        const weekdays = getNepaliWeekdays();

        const nepaliDateEl = document.getElementById('nepaliDate');
        const nepaliDayEl  = document.getElementById('nepaliDay');
        const engDateEl    = document.getElementById('engDate');
        const engDayEl     = document.getElementById('engDay');
        if (!nepaliDateEl) return;

        if (bs.outOfRange) {
            nepaliDateEl.textContent = '--';
            nepaliDayEl.textContent  = '--';
        } else {
            nepaliDateEl.textContent = `${String(bs.d).padStart(2, '0')} ${months[bs.m]} ${bs.y}`;
            nepaliDayEl.textContent  = weekdays[now.getDay()];
        }
        if (engDateEl) engDateEl.textContent = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        if (engDayEl)  engDayEl.textContent  = now.toLocaleDateString('en-US', { weekday: 'long' });
    }

    // ============================================================
    // DATE NAVIGATION
    // ============================================================
    function initDateNavigation() {
        const dateInput = document.getElementById('forex-date');
        const prevBtn   = document.getElementById('prev-day');
        const nextBtn   = document.getElementById('next-day');
        const todayBtn  = document.getElementById('today-btn');

        if (dateInput) {
            dateInput.value = toISO(currentDate);
            dateInput.max   = todayISO();
            dateInput.min   = MIN_DATE;

            dateInput.addEventListener('change', () => {
                if (!dateInput.value) return;
                const picked = new Date(dateInput.value + 'T00:00:00');
                if (isNaN(picked)) return;
                if (picked > startOfDay(new Date())) {
                    dateInput.value = toISO(currentDate);
                    return;
                }
                goToDate(picked);
            });
        }

        prevBtn?.addEventListener('click', () => {
            const next = addDays(currentDate, -1);
            const minD = new Date(MIN_DATE + 'T00:00:00');
            if (next < minD) return;
            goToDate(next);
        });

        nextBtn?.addEventListener('click', () => {
            const next = addDays(currentDate, 1);
            if (next > startOfDay(new Date())) return;
            goToDate(next);
        });

        todayBtn?.addEventListener('click', () => {
            goToDate(startOfDay(new Date()));
        });
    }

    function goToDate(dateObj) {
        currentDate = startOfDay(dateObj);
        fetchRatesForDate(currentDate);
    }

    // ============================================================
    // MOBILE MENU
    // ============================================================
    function initMobileMenu() {
        const toggle = document.getElementById('mobile-menu-toggle');
        const menu = document.getElementById('nav-menu');
        if (!toggle || !menu) return;
        toggle.addEventListener('click', () => {
            const isOpen = toggle.classList.toggle('active');
            menu.classList.toggle('active');
            toggle.setAttribute('aria-expanded', String(isOpen));
        });
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                toggle.classList.remove('active');
                menu.classList.remove('active');
                toggle.setAttribute('aria-expanded', 'false');
            });
        });
    }

    // ============================================================
    // INIT
    // ============================================================
    function init() {
        populateDateDropdowns();
        initDateConverter();
        updateHeroDate();
        initMobileMenu();
        initDateNavigation();
        initBsPicker();
        preventWheelScroll();

        const yearEl = document.getElementById('current-year');
        if (yearEl) yearEl.textContent = new Date().getFullYear();

        const amountEl = document.getElementById('currency-amount');
        if (amountEl && !amountEl.value) amountEl.value = '1';

        document.getElementById('currency-convert-btn')?.addEventListener('click', convertCurrency);
        document.getElementById('currency-amount')?.addEventListener('input', convertCurrency);
        document.getElementById('currency-from')?.addEventListener('change', convertCurrency);
        document.getElementById('currency-to')?.addEventListener('change', convertCurrency);

        populateCurrencySelects();
        convertCurrency();

        currentDate = startOfDay(new Date());
        fetchRatesForDate(currentDate);

        setInterval(() => {
            if (isSameDay(currentDate, startOfDay(new Date()))) {
                fetchRatesForDate(currentDate, { silent: true });
            }
        }, REFRESH_MS);

        scheduleMidnightRefresh();
    }

    function scheduleMidnightRefresh() {
        const now = new Date();
        const next = new Date(now);
        next.setDate(now.getDate() + 1);
        next.setHours(0, 0, 5, 0);
        setTimeout(() => {
            updateHeroDate();
            const wasOnOldToday = isSameDay(currentDate, addDays(startOfDay(new Date()), -1));
            if (wasOnOldToday) {
                goToDate(startOfDay(new Date()));
            } else {
                updateTodayButtonVisibility(currentDate);
            }
            scheduleMidnightRefresh();
        }, next - now);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();