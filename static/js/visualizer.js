'use strict';

// ===== State =====
const State = {
    mode: 'function',
    currentExpr: 'x**2',
    currentType: 'linear',
    params: {},
    xMin: -10,
    xMax: 10,
    lastGraphJson: null,
    geoShape: 'circle',
    geoParams: {},
    calcExpr: 'x**3 - 3*x',
    crosshairOn: false,
    annotateMode: false,
    annotations: [],
    panelOpen: true,
    showKeyPoints: true,
    analysis: null,
    layers: [],
    layerTraces: [],
    valuesStep: 1,
};

// ===== DOM helpers =====
const $ = id => document.getElementById(id);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ===== Equation configs =====
const EQ_CONFIGS = {
    linear: {
        expr: (p) => `${p.m || 1}*x + ${p.c || 0}`,
        params: [
            { name: 'm', label: 'Slope (m)', min: -5, max: 5, default: 1, step: 0.1 },
            { name: 'c', label: 'Y-intercept (c)', min: -10, max: 10, default: 0, step: 0.5 },
        ]
    },
    quadratic: {
        expr: (p) => `${p.a || 1}*x**2 + ${p.b || 0}*x + ${p.c || 0}`,
        params: [
            { name: 'a', label: 'a (x² coef)', min: -5, max: 5, default: 1, step: 0.1 },
            { name: 'b', label: 'b (x coef)', min: -10, max: 10, default: 0, step: 0.5 },
            { name: 'c', label: 'c (constant)', min: -10, max: 10, default: 0, step: 0.5 },
        ]
    },
    cubic: {
        expr: (p) => `${p.a || 1}*x**3 + ${p.b || 0}*x**2 + ${p.c || 0}*x + ${p.d || 0}`,
        params: [
            { name: 'a', label: 'a (x³ coef)', min: -3, max: 3, default: 1, step: 0.1 },
            { name: 'b', label: 'b (x² coef)', min: -5, max: 5, default: 0, step: 0.5 },
            { name: 'c', label: 'c (x coef)', min: -10, max: 10, default: -3, step: 0.5 },
            { name: 'd', label: 'd (constant)', min: -10, max: 10, default: 0, step: 0.5 },
        ]
    },
    trigonometric: {
        expr: (p) => `${p.A || 1}*sin(${p.B || 1}*x + ${p.C || 0})`,
        params: [
            { name: 'A', label: 'Amplitude (A)', min: 0.1, max: 5, default: 1, step: 0.1 },
            { name: 'B', label: 'Frequency (B)', min: 0.1, max: 5, default: 1, step: 0.1 },
            { name: 'C', label: 'Phase Shift (C)', min: -6.28, max: 6.28, default: 0, step: 0.1 },
        ]
    },
    custom: { expr: null, params: [] }
};

const GEO_CONFIGS = {
    circle: [
        { name: 'radius', label: 'Radius', min: 0.5, max: 10, default: 5, step: 0.5 },
        { name: 'cx', label: 'Center X', min: -5, max: 5, default: 0, step: 0.5 },
        { name: 'cy', label: 'Center Y', min: -5, max: 5, default: 0, step: 0.5 },
    ],
    ellipse: [
        { name: 'a', label: 'Semi-major (a)', min: 0.5, max: 10, default: 5, step: 0.5 },
        { name: 'b', label: 'Semi-minor (b)', min: 0.5, max: 10, default: 3, step: 0.5 },
    ],
    parabola: [
        { name: 'a', label: 'a (width)', min: -5, max: 5, default: 1, step: 0.1 },
        { name: 'h', label: 'h (vertex X)', min: -5, max: 5, default: 0, step: 0.5 },
        { name: 'k', label: 'k (vertex Y)', min: -5, max: 5, default: 0, step: 0.5 },
    ],
    polygon: [
        { name: 'sides', label: 'Sides', min: 3, max: 12, default: 6, step: 1 },
        { name: 'radius', label: 'Radius', min: 0.5, max: 10, default: 5, step: 0.5 },
    ],
};

// ===== Theme-aware palette =====
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const isDark = () => document.documentElement.dataset.theme === 'dark';
const CANON = ['#1f5fbf', '#b4430f', '#0f766e', '#946200', '#475569'];
const CANON_RGB = ['31,95,191', '180,67,15', '15,118,110', '148,98,0', '71,85,105'];
const SERIES = {
    light: ['#1f5fbf', '#b4430f', '#0f766e', '#946200', '#475569'],
    dark: ['#6aa6f8', '#f59a6b', '#4fd1c5', '#e5b94e', '#a3b1c2'],
};
const seriesColor = (i) => SERIES[isDark() ? 'dark' : 'light'][i % SERIES.light.length];
function hexToRgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function mapColor(c) {
    if (typeof c !== 'string') return c;
    const l = c.toLowerCase();
    const i = CANON.indexOf(l);
    if (i >= 0) return seriesColor(i);
    const m = l.replace(/\s/g, '').match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/);
    if (m) {
        const idx = CANON_RGB.indexOf(`${m[1]},${m[2]},${m[3]}`);
        if (idx >= 0) return hexToRgba(seriesColor(idx), m[4]);
    }
    return c;
}
function recolorTrace(t) {
    const out = { ...t };
    if (t.line) out.line = { ...t.line, color: mapColor(t.line.color) };
    if (t.marker) out.marker = { ...t.marker, color: mapColor(t.marker.color) };
    if (t.fillcolor) out.fillcolor = mapColor(t.fillcolor);
    return out;
}

function baseLayout() {
    const dark = isDark();
    const text = cssVar('--text');
    const muted = cssVar('--text2');
    const grid = dark ? 'rgba(255,255,255,0.07)' : 'rgba(16,32,52,0.08)';
    const zero = dark ? 'rgba(255,255,255,0.45)' : 'rgba(16,32,52,0.55)';
    const axis = (title) => ({
        gridcolor: grid,
        zerolinecolor: zero,
        zerolinewidth: 1.5,
        title: { text: title, font: { color: muted, size: 12 } },
        tickfont: { color: muted, size: 11 },
        linecolor: grid,
        showspikes: State.crosshairOn,
        spikecolor: cssVar('--primary'),
        spikethickness: 1,
        spikedash: 'dot',
        spikemode: 'across',
    });
    return {
        paper_bgcolor: cssVar('--plot-bg'),
        plot_bgcolor: cssVar('--plot-bg'),
        font: { color: text, family: 'IBM Plex Sans, sans-serif', size: 12 },
        xaxis: axis('x'),
        yaxis: axis('f(x)'),
        margin: { l: 55, r: 20, t: 20, b: 50 },
        hovermode: 'closest',
        hoverlabel: {
            bgcolor: cssVar('--surface'),
            bordercolor: cssVar('--border2'),
            font: { color: text, family: 'IBM Plex Mono, monospace', size: 12 },
        },
        showlegend: false,
        autosize: true,
        modebar: { bgcolor: 'rgba(0,0,0,0)', color: cssVar('--text3'), activecolor: cssVar('--primary') },
        dragmode: 'zoom',
        annotations: [],
    };
}

const PLOTLY_CONFIG = {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d', 'sendDataToCloud'],
    modeBarButtonsToAdd: ['drawline', 'eraseshape'],
    toImageButtonOptions: { format: 'png', filename: 'mathviz_graph', scale: 2, width: 1200, height: 800 },
    scrollZoom: true,
    doubleClick: 'reset',
};

// ===== Init =====
function init() {
    setupModeTabs();
    setupEqTypeSelector();
    setupPresetButtons();
    setupExprInput();
    setupXRange();
    setupPanelToggle();
    setupGeoMode();
    setupCalcMode();
    setupToolbarButtons();
    setupSaveButton();
    setupCoordinateTracker();
    setupAnnotationMode();
    setupResizeObserver();
    setupInsights();
    setupLayers();
    setupThemeSync();

    updateSliders();
    fetchAndPlot();

    if (window.LOADED_EQ) {
        $('exprInput').value = window.LOADED_EQ.expression;
        State.currentExpr = window.LOADED_EQ.expression;
        State.currentType = window.LOADED_EQ.type || 'custom';
        $('eqType').value = State.currentType;
        updateSliders();
        fetchAndPlot();
        if ($('saveSection')) $('saveSection').style.display = 'block';
    }
}

// ===== Panel Toggle =====
function setupPanelToggle() {
    const panel = $('vizPanel');
    const toggle = $('sidebarToggle');
    const chart = $('mainChart');
    const isMobile = () => window.innerWidth <= 768;

    function updateToggleIcon() {
        toggle.textContent = State.panelOpen ? 'Hide controls' : 'Show controls';
    }

    function openPanel() {
        panel.classList.remove('collapsed');
        State.panelOpen = true;
        updateToggleIcon();
        setTimeout(() => Plotly.Plots.resize(chart), 310);
    }

    function closePanel() {
        panel.classList.add('collapsed');
        State.panelOpen = false;
        updateToggleIcon();
        setTimeout(() => Plotly.Plots.resize(chart), 310);
    }

    // On mobile, start with panel collapsed
    if (isMobile()) {
        panel.classList.add('collapsed');
        State.panelOpen = false;
    }
    updateToggleIcon();

    toggle.addEventListener('click', () => {
        if (State.panelOpen) closePanel(); else openPanel();
    });

    window.addEventListener('resize', debounce(() => {
        Plotly.Plots.resize(chart);
    }, 150));
}

// ===== Coordinate Tracker =====
function setupCoordinateTracker() {
    const chart = $('mainChart');
    const tracker = $('coordTracker');
    const xEl = $('coordX');
    const yEl = $('coordY');

    chart.addEventListener('mousemove', (e) => {
        if (!State.crosshairOn) return;
        try {
            const layout = chart._fullLayout;
            if (!layout) return;
            const rect = chart.getBoundingClientRect();
            const xaxis = layout.xaxis;
            const yaxis = layout.yaxis;
            if (!xaxis || !yaxis) return;
            const plotLeft = layout._offset.left;
            const plotTop = layout._offset.top;
            const plotW = xaxis._length;
            const plotH = yaxis._length;
            const px = e.clientX - rect.left - plotLeft;
            const py = e.clientY - rect.top - plotTop;
            if (px < 0 || px > plotW || py < 0 || py > plotH) return;
            const xVal = xaxis.l2r(px);
            const yVal = yaxis.l2r(py);
            xEl.textContent = `x: ${Number(xVal).toFixed(4)}`;
            yEl.textContent = `y: ${Number(yVal).toFixed(4)}`;
        } catch (_) {}
    });

    chart.addEventListener('mouseleave', () => {
        xEl.textContent = 'x: —';
        yEl.textContent = 'y: —';
    });
}

// ===== Annotation Mode =====
function setupAnnotationMode() {
    const chart = $('mainChart');
    const clearBtn = $('clearAnnotBtn');

    chart.addEventListener('click', (e) => {
        if (!State.annotateMode) return;
        try {
            const layout = chart._fullLayout;
            if (!layout) return;
            const rect = chart.getBoundingClientRect();
            const xaxis = layout.xaxis;
            const yaxis = layout.yaxis;
            const plotLeft = layout._offset.left;
            const plotTop = layout._offset.top;
            const px = e.clientX - rect.left - plotLeft;
            const py = e.clientY - rect.top - plotTop;
            const xVal = Number(xaxis.l2r(px)).toFixed(3);
            const yVal = Number(yaxis.l2r(py)).toFixed(3);

            const annotation = {
                x: parseFloat(xVal),
                y: parseFloat(yVal),
                xref: 'x', yref: 'y',
                text: `(${xVal}, ${yVal})`,
                showarrow: true,
                arrowhead: 2,
                arrowsize: 1,
                arrowwidth: 1.5,
                arrowcolor: cssVar('--gold'),
                font: { color: cssVar('--text'), size: 11, family: 'IBM Plex Mono, monospace' },
                bgcolor: cssVar('--surface'),
                bordercolor: cssVar('--gold'),
                borderwidth: 1,
                borderpad: 4,
                ay: -40,
            };
            State.annotations.push(annotation);
            Plotly.relayout(chart, { annotations: [...State.annotations] });
            if (clearBtn) clearBtn.style.display = 'inline-flex';
        } catch (_) {}
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            State.annotations = [];
            Plotly.relayout(chart, { annotations: [] });
            clearBtn.style.display = 'none';
        });
    }
}

// ===== Responsive resize =====
function setupResizeObserver() {
    const chart = $('mainChart');
    const ro = new ResizeObserver(debounce(() => {
        if (chart.data) Plotly.Plots.resize(chart);
    }, 100));
    ro.observe(chart);
}

// ===== Mode Tabs =====
function setupModeTabs() {
    document.querySelectorAll('.mode-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            State.mode = btn.dataset.mode;
            document.querySelectorAll('.mode-content').forEach(el => el.style.display = 'none');
            $(`mode-${State.mode}`).style.display = 'block';
            if (State.mode === 'geometry') drawGeoShape();
            else if (State.mode === 'calculus') fetchCalcPlot();
        });
    });
}

// ===== Equation Type =====
function setupEqTypeSelector() {
    $('eqType').addEventListener('change', (e) => {
        State.currentType = e.target.value;
        updateSliders();
        buildExprFromSliders();
        fetchAndPlot();
    });
}

// ===== Sliders =====
function updateSliders() {
    const type = State.currentType;
    const config = EQ_CONFIGS[type];
    const container = $('slidersContainer');
    const section = $('paramSliders');

    if (!config || !config.params || config.params.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';
    container.innerHTML = '';
    State.params = {};

    config.params.forEach(p => {
        State.params[p.name] = p.default;
        const row = document.createElement('div');
        row.className = 'slider-row';
        row.innerHTML = `
            <div class="slider-label-row">
                <span class="slider-name">${p.name}</span>
                <span class="slider-value" id="val_${p.name}">${p.default}</span>
            </div>
            <input type="range" id="slider_${p.name}"
                   min="${p.min}" max="${p.max}" value="${p.default}" step="${p.step}">
            <div style="display:flex;justify-content:space-between;font-size:.7rem;color:var(--text3);margin-top:2px">
                <span>${p.min}</span><span style="color:var(--text2);font-size:.72rem">${p.label}</span><span>${p.max}</span>
            </div>`;
        container.appendChild(row);

        const slider = row.querySelector('input[type="range"]');
        const valDisplay = row.querySelector(`#val_${p.name}`);
        slider.addEventListener('input', () => {
            const v = parseFloat(slider.value);
            State.params[p.name] = v;
            valDisplay.textContent = v.toFixed(2);
            buildExprFromSliders();
            debouncedFetch();
        });
    });
}

function buildExprFromSliders() {
    const type = State.currentType;
    const config = EQ_CONFIGS[type];
    if (!config || !config.expr) return;
    const expr = config.expr(State.params);
    State.currentExpr = expr;
    $('exprInput').value = expr;
    updateGraphTitle(expr);
}

const debouncedFetch = debounce(() => fetchAndPlot(), 80);

// ===== Preset Buttons =====
function setupPresetButtons() {
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const expr = btn.dataset.expr;
            State.currentExpr = expr;
            State.currentType = 'custom';
            $('eqType').value = 'custom';
            $('exprInput').value = expr;
            $('paramSliders').style.display = 'none';
            updateGraphTitle(expr);
            fetchAndPlot();
        });
    });
}

// ===== Expression Input =====
function setupExprInput() {
    const input = $('exprInput');
    const plotBtn = $('plotBtn');

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            State.currentExpr = input.value.trim();
            updateGraphTitle(State.currentExpr);
            fetchAndPlot();
        }
    });
    input.addEventListener('input', () => {
        State.currentExpr = input.value.trim();
        updateGraphTitle(State.currentExpr);
        debouncedFetch();
    });
    plotBtn.addEventListener('click', () => {
        State.currentExpr = input.value.trim();
        updateGraphTitle(State.currentExpr);
        fetchAndPlot();
    });
}

// ===== X Range =====
function setupXRange() {
    [$('xMin'), $('xMax')].forEach(el => {
        el.addEventListener('change', () => {
            State.xMin = parseFloat($('xMin').value) || -10;
            State.xMax = parseFloat($('xMax').value) || 10;
            fetchAndPlot();
        });
    });
}

// ===== Fetch & Plot =====
function showLoading(show) {
    $('loadingOverlay').style.display = show ? 'flex' : 'none';
}

async function fetchAndPlot() {
    if (!State.currentExpr) return;
    const params = JSON.stringify(State.params);
    const url = `/api/plot/?expr=${encodeURIComponent(State.currentExpr)}&type=${State.currentType}&params=${encodeURIComponent(params)}&x_min=${State.xMin}&x_max=${State.xMax}`;

    showLoading(true);
    try {
        const resp = await fetch(url);
        const data = await resp.json();
        if (!data.success) { showError(data.error); return; }

        State.lastGraphJson = data.graph;
        await loadLayers();
        renderPlot(data.graph);
        updateMathInfo(data);
        refreshInsights();
        if ($('saveSection')) $('saveSection').style.display = 'block';
    } catch (err) {
        showError('Network error: ' + err.message);
    } finally {
        showLoading(false);
    }
}

const THEME_KEYS = ['paper_bgcolor', 'plot_bgcolor', 'font', 'template', 'modebar', 'hoverlabel', 'shapes'];
const AXIS_KEYS = ['gridcolor', 'zerolinecolor', 'zerolinewidth', 'linecolor', 'tickfont', 'title_font', 'spikecolor'];

function cleanLayout(extra = {}) {
    const out = { ...extra };
    THEME_KEYS.forEach(k => delete out[k]);
    ['xaxis', 'yaxis'].forEach(ax => {
        if (!out[ax]) return;
        const a = { ...out[ax] };
        AXIS_KEYS.forEach(k => delete a[k]);
        if (typeof a.title === 'string') a.title = { text: a.title };
        if (a.title) delete a.title.font;
        out[ax] = a;
    });
    return out;
}

function getLayout(extraIn = {}) {
    const base = baseLayout();
    const extra = cleanLayout(extraIn);
    const merge = (ax) => {
        const e = extra[ax] || {};
        const title = e.title ? { ...base[ax].title, ...e.title } : base[ax].title;
        return { ...base[ax], ...e, title };
    };
    return {
        ...base,
        ...extra,
        annotations: [...State.annotations, ...(extra.annotations || [])],
        xaxis: merge('xaxis'),
        yaxis: merge('yaxis'),
    };
}

function renderPlot(graphJson) {
    const el = $('mainChart');
    const traces = graphJson.data.map(t => recolorTrace({
        ...t,
        hovertemplate: 'x: <b>%{x:.4f}</b><br>y: <b>%{y:.4f}</b><extra></extra>',
        line: { ...(t.line || {}), width: t.line?.width || 2.5 },
    }));
    State.layerTraces.forEach(t => traces.push(t));
    keyPointTraces().forEach(t => traces.push(t));
    Plotly.react(el, traces, getLayout(graphJson.layout), PLOTLY_CONFIG);
}

function updateMathInfo(data) {
    const panel = $('mathInfoPanel');
    panel.style.display = 'flex';
    $('insightPanel').style.display = 'block';
    $('infoExpr').textContent = `f(x) = ${State.currentExpr}`;

    if (data.derivative_latex) {
        $('infoDerivative').innerHTML = `\\(${data.derivative_latex}\\)`;
    } else {
        $('infoDerivative').textContent = data.derivative || '';
    }
    if (data.integral_latex) {
        $('infoIntegral').innerHTML = `\\(${data.integral_latex}\\)`;
    } else {
        $('infoIntegral').textContent = data.integral || '';
    }
    if (window.MathJax) MathJax.typesetPromise([panel]);
}

function updateGraphTitle(expr) {
    $('graphTitle').textContent = `f(x) = ${expr}`;
}

function showError(msg) {
    console.warn('Plot error:', msg);
    Plotly.react($('mainChart'), [], {
        ...getLayout(),
        annotations: [{
            text: `⚠ ${msg}`,
            x: 0.5, y: 0.5, xref: 'paper', yref: 'paper',
            showarrow: false, font: { size: 14, color: cssVar('--danger') }
        }]
    }, PLOTLY_CONFIG);
}

// ===== Geometry Mode =====
function setupGeoMode() {
    buildGeoParams('circle');
    $('shapeType').addEventListener('change', (e) => {
        State.geoShape = e.target.value;
        buildGeoParams(e.target.value);
        drawGeoShape();
    });
    $('geoPlotBtn').addEventListener('click', drawGeoShape);
}

function buildGeoParams(shape) {
    const container = $('geoParamsContainer');
    container.innerHTML = '';
    State.geoParams = {};
    const params = GEO_CONFIGS[shape] || [];

    params.forEach(p => {
        State.geoParams[p.name] = p.default;
        const row = document.createElement('div');
        row.className = 'geo-param-row slider-row';
        row.innerHTML = `
            <div class="slider-label-row">
                <label>${p.label}</label>
                <span class="slider-value" id="geo_val_${p.name}">${p.default}</span>
            </div>
            <input type="range" min="${p.min}" max="${p.max}" value="${p.default}" step="${p.step}" id="geo_${p.name}">`;
        container.appendChild(row);

        row.querySelector('input').addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            State.geoParams[p.name] = v;
            document.getElementById(`geo_val_${p.name}`).textContent = v.toFixed(p.step < 1 ? 1 : 0);
            debouncedGeo();
        });
    });
}

const debouncedGeo = debounce(() => drawGeoShape(), 100);

async function drawGeoShape() {
    const url = `/api/geometry/?shape=${State.geoShape}&params=${encodeURIComponent(JSON.stringify(State.geoParams))}`;
    showLoading(true);
    try {
        const resp = await fetch(url);
        const data = await resp.json();
        if (!data.success) { showError(data.error); return; }

        State.lastGraphJson = data.graph;
        const traces = data.graph.data.map(t => ({
            ...t,
            hovertemplate: 'x: <b>%{x:.3f}</b><br>y: <b>%{y:.3f}</b><extra></extra>',
        }));
        const layout = getLayout({ ...data.graph.layout, yaxis: { ...baseLayout().yaxis, scaleanchor: 'x' } });
        Plotly.react($('mainChart'), traces, layout, PLOTLY_CONFIG);

        const geoInfo = $('geoInfo');
        if (data.info) { geoInfo.style.display = 'block'; geoInfo.textContent = data.info; }
        $('graphTitle').textContent = `Geometry: ${State.geoShape}`;
        $('insightPanel').style.display = 'none';
    } catch (err) {
        showError('Network error: ' + err.message);
    } finally {
        showLoading(false);
    }
}

// ===== Calculus Mode =====
function setupCalcMode() {
    $('calcPlotBtn').addEventListener('click', fetchCalcPlot);
    $('calcExprInput').addEventListener('input', debounce(fetchCalcPlot, 400));
    ['showDerivative', 'showIntegral'].forEach(id => $(id).addEventListener('change', fetchCalcPlot));
    [$('intA'), $('intB')].forEach(el => el.addEventListener('change', fetchCalcPlot));
}

async function fetchCalcPlot() {
    const expr = $('calcExprInput').value.trim();
    if (!expr) return;
    State.calcExpr = expr;

    const url = `/api/plot/?expr=${encodeURIComponent(expr)}&type=calculus&params={}&x_min=${State.xMin}&x_max=${State.xMax}`;
    showLoading(true);
    try {
        const resp = await fetch(url);
        const data = await resp.json();
        if (!data.success) { showError(data.error); return; }

        const baseTrace = {
            ...data.graph.data[0],
            name: 'f(x)',
            line: { color: seriesColor(0), width: 2.5 },
            hovertemplate: 'f(x): <b>%{y:.4f}</b><extra>f(x)</extra>',
        };
        const traces = [baseTrace];
        const fetches = [];

        if ($('showDerivative').checked && data.derivative) {
            fetches.push(
                fetch(`/api/plot/?expr=${encodeURIComponent(data.derivative)}&x_min=${State.xMin}&x_max=${State.xMax}&params={}`)
                    .then(r => r.json())
                    .then(dd => {
                        if (dd.success && dd.graph.data[0]) {
                            traces.push({
                                ...dd.graph.data[0],
                                name: "f'(x)",
                                line: { color: seriesColor(1), width: 2, dash: 'dash' },
                                hovertemplate: "f'(x): <b>%{y:.4f}</b><extra>f'(x)</extra>",
                            });
                        }
                    })
            );
        }

        if ($('showIntegral').checked && data.integral) {
            fetches.push(
                fetch(`/api/plot/?expr=${encodeURIComponent(data.integral)}&x_min=${State.xMin}&x_max=${State.xMax}&params={}`)
                    .then(r => r.json())
                    .then(id2 => {
                        if (id2.success && id2.graph.data[0]) {
                            traces.push({
                                ...id2.graph.data[0],
                                name: '∫f(x)dx',
                                line: { color: seriesColor(2), width: 2, dash: 'dot' },
                                hovertemplate: '∫f(x)dx: <b>%{y:.4f}</b><extra>∫f(x)dx</extra>',
                            });
                        }
                    })
            );
        }

        await Promise.all(fetches);

        // Area under curve
        const intA = parseFloat($('intA').value);
        const intB = parseFloat($('intB').value);
        if (!isNaN(intA) && !isNaN(intB) && intA < intB) {
            const orig = data.graph.data[0];
            if (orig && orig.x) {
                const x = orig.x.filter(v => v >= intA && v <= intB);
                const y = orig.y.filter((_, i) => orig.x[i] >= intA && orig.x[i] <= intB);
                traces.push({
                    x: [intA, ...x, intB, intA],
                    y: [0, ...y, 0, 0],
                    type: 'scatter', fill: 'toself', mode: 'none',
                    fillcolor: hexToRgba(seriesColor(0), 0.15),
                    name: `Area [${intA}, ${intB}]`,
                    hoverinfo: 'skip',
                });
            }
        }

        const layout = getLayout({
            ...data.graph.layout,
            showlegend: true,
            legend: {
                font: { color: cssVar('--text2'), size: 11 },
                bgcolor: cssVar('--surface'),
                bordercolor: cssVar('--border'),
                borderwidth: 1,
            },
        });
        keyPointTraces().forEach(t => traces.push(t));
        Plotly.react($('mainChart'), traces, layout, PLOTLY_CONFIG);
        updateMathInfo(data);
        refreshInsights();
        $('graphTitle').textContent = `Calculus: f(x) = ${expr}`;
    } catch (err) {
        showError('Error: ' + err.message);
    } finally {
        showLoading(false);
    }
}

// ===== Toolbar Buttons =====
function setupToolbarButtons() {
    // Download PNG
    $('downloadBtn').addEventListener('click', () => {
        Plotly.downloadImage($('mainChart'), { format: 'png', filename: 'mathviz', scale: 2 });
    });

    // Reset zoom
    $('resetZoomBtn').addEventListener('click', () => {
        Plotly.relayout($('mainChart'), { 'xaxis.autorange': true, 'yaxis.autorange': true });
    });

    // Zoom in / out
    $('zoomInBtn').addEventListener('click', () => {
        const el = $('mainChart');
        const layout = el._fullLayout;
        if (!layout) return;
        const xa = layout.xaxis, ya = layout.yaxis;
        const xc = (xa.range[0] + xa.range[1]) / 2, xh = (xa.range[1] - xa.range[0]) / 4;
        const yc = (ya.range[0] + ya.range[1]) / 2, yh = (ya.range[1] - ya.range[0]) / 4;
        Plotly.relayout(el, {
            'xaxis.range': [xc - xh, xc + xh],
            'yaxis.range': [yc - yh, yc + yh],
        });
    });
    $('zoomOutBtn').addEventListener('click', () => {
        const el = $('mainChart');
        const layout = el._fullLayout;
        if (!layout) return;
        const xa = layout.xaxis, ya = layout.yaxis;
        const xc = (xa.range[0] + xa.range[1]) / 2, xh = (xa.range[1] - xa.range[0]);
        const yc = (ya.range[0] + ya.range[1]) / 2, yh = (ya.range[1] - ya.range[0]);
        Plotly.relayout(el, {
            'xaxis.range': [xc - xh, xc + xh],
            'yaxis.range': [yc - yh, yc + yh],
        });
    });

    // Crosshair toggle
    const crosshairBtn = $('crosshairBtn');
    const tracker = $('coordTracker');
    crosshairBtn.addEventListener('click', () => {
        State.crosshairOn = !State.crosshairOn;
        crosshairBtn.classList.toggle('active', State.crosshairOn);
        tracker.style.display = State.crosshairOn ? 'flex' : 'none';
        // Enable Plotly spikelines
        Plotly.relayout($('mainChart'), {
            'xaxis.showspikes': State.crosshairOn,
            'yaxis.showspikes': State.crosshairOn,
        });
    });

    // Key points toggle
    const kpBtn = $('keyPointsBtn');
    kpBtn.addEventListener('click', () => {
        State.showKeyPoints = !State.showKeyPoints;
        kpBtn.classList.toggle('active', State.showKeyPoints);
        rerender();
    });

    // Annotate toggle
    const annotateBtn = $('annotateBtn');
    const chart = $('mainChart');
    annotateBtn.addEventListener('click', () => {
        State.annotateMode = !State.annotateMode;
        annotateBtn.classList.toggle('active', State.annotateMode);
        chart.style.cursor = State.annotateMode ? 'crosshair' : '';
        if (State.annotateMode) {
            Plotly.relayout(chart, { dragmode: 'pan' });
        } else {
            Plotly.relayout(chart, { dragmode: 'zoom' });
        }
    });

    // Export JSON (teacher only)
    const exportBtn = $('exportJsonBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (!State.lastGraphJson) return;
            const blob = new Blob([JSON.stringify(State.lastGraphJson, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'mathviz_graph.json';
            a.click();
        });
    }
}

// ===== Save Button =====
function setupSaveButton() {
    const saveBtn = $('saveBtn');
    if (!saveBtn) return;

    saveBtn.addEventListener('click', async () => {
        const title = $('saveTitle').value.trim() || 'Untitled';
        const desc = $('saveDesc') ? $('saveDesc').value.trim() : '';
        const isPublic = $('savePublic') ? $('savePublic').checked : false;
        const classIdEl = $('saveClassId');
        const classroomId = classIdEl ? classIdEl.value || null : null;
        const expr = State.mode === 'calculus' ? State.calcExpr : State.currentExpr;
        const eqType = State.mode === 'geometry' ? State.geoShape : State.currentType;
        const msg = $('saveMsg');

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        try {
            const resp = await fetch('/api/save-equation/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
                body: JSON.stringify({
                    title, description: desc, expression: expr,
                    equation_type: eqType, is_public: isPublic,
                    classroom_id: classroomId,
                }),
            });
            const data = await resp.json();
            if (data.success) {
                msg.className = 'save-msg success';
                msg.textContent = data.class_name ? `✓ Saved to "${data.class_name}"!` : '✓ Saved to personal collection!';
                $('saveTitle').value = '';
            } else {
                msg.className = 'save-msg error';
                msg.textContent = data.error || 'Error saving';
            }
        } catch (err) {
            msg.className = 'save-msg error';
            msg.textContent = 'Network error';
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Save Equation';
            setTimeout(() => { msg.textContent = ''; }, 4000);
        }
    });
}

function getCsrf() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) return meta.getAttribute('content');
    const c = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='));
    return c ? c.trim().split('=')[1] : '';
}

// ===== Boot =====
// ===== Re-render current mode =====
function rerender() {
    if (State.mode === 'calculus') fetchCalcPlot();
    else if (State.mode === 'geometry') drawGeoShape();
    else fetchAndPlot();
}

function setupThemeSync() {
    window.addEventListener('themechange', () => {
        State.layers.forEach((l, i) => { l.color = seriesColor(i + 1); });
        renderLayerList();
        rerender();
    });
}

// ===== Analysis (key points, table of values) =====
function activeExpr() {
    return State.mode === 'calculus' ? State.calcExpr : State.currentExpr;
}

function keyPointTraces() {
    const a = State.analysis;
    if (!State.showKeyPoints || !a || State.mode === 'geometry') return [];
    const mk = (pts, name, color, symbol) => pts.length ? [{
        x: pts.map(p => p.x), y: pts.map(p => p.y),
        type: 'scatter', mode: 'markers', name,
        marker: { color, size: 9, symbol, line: { color: cssVar('--plot-bg'), width: 1.5 } },
        hovertemplate: `${name}<br>x: <b>%{x:.4f}</b><br>y: <b>%{y:.4f}</b><extra></extra>`,
    }] : [];
    const maxima = a.extrema.filter(p => p.kind === 'maximum');
    const minima = a.extrema.filter(p => p.kind !== 'maximum');
    return [
        ...mk(a.roots, 'Root', seriesColor(2), 'circle'),
        ...mk(maxima, 'Local maximum', seriesColor(1), 'triangle-up'),
        ...mk(minima, 'Local minimum', seriesColor(1), 'triangle-down'),
        ...mk(a.inflections, 'Inflection', seriesColor(3), 'square'),
        ...mk(a.y_intercept !== null && a.y_intercept !== undefined ? [{ x: 0, y: a.y_intercept }] : [], 'y-intercept', seriesColor(0), 'diamond'),
    ];
}

const fmt = (v) => (Math.abs(v) < 1e-9 ? 0 : Number(v.toFixed(4)));

function renderKeyPoints() {
    const a = State.analysis;
    const el = $('paneKeyPoints');
    if (!a) { el.innerHTML = '<div class="kp-none">Plot a function to see its key points.</div>'; return; }
    const group = (title, color, items) => `
        <div class="kp-group"><h4>${title}</h4>
        ${items.length ? items.map(t => `<div class="kp-item"><span class="kp-dot" style="background:${color}"></span>${t}</div>`).join('') : '<div class="kp-none">None in range</div>'}
        </div>`;
    const maxima = a.extrema.filter(p => p.kind === 'maximum').map(p => `max at (${fmt(p.x)}, ${fmt(p.y)})`);
    const minima = a.extrema.filter(p => p.kind !== 'maximum').map(p => `${p.kind === 'critical' ? 'critical' : 'min'} at (${fmt(p.x)}, ${fmt(p.y)})`);
    el.innerHTML = `<div class="kp-grid">
        ${group('Roots (f(x) = 0)', seriesColor(2), a.roots.map(p => `x = ${fmt(p.x)}`))}
        ${group('Y-intercept', seriesColor(0), a.y_intercept !== null && a.y_intercept !== undefined ? [`(0, ${fmt(a.y_intercept)})`] : [])}
        ${group('Extrema', seriesColor(1), [...maxima, ...minima])}
        ${group('Inflection points', seriesColor(3), a.inflections.map(p => `(${fmt(p.x)}, ${fmt(p.y)})`))}
    </div>
    <div class="kp-note">Range on [${State.xMin}, ${State.xMax}]: ${a.y_min !== null ? `${fmt(a.y_min)} ≤ f(x) ≤ ${fmt(a.y_max)}` : 'undefined'}</div>`;
}

function renderValues() {
    const a = State.analysis;
    const el = $('valuesBody');
    if (!a) { el.innerHTML = ''; return; }
    const cell = (v) => (v === null ? '—' : fmt(v));
    el.innerHTML = `<table class="values-table"><thead><tr><th>x</th><th>f(x)</th><th>f'(x)</th></tr></thead><tbody>
        ${a.table.map(r => `<tr><td>${fmt(r.x)}</td><td>${cell(r.y)}</td><td>${cell(r.dy)}</td></tr>`).join('')}
    </tbody></table>`;
    $('valuesRange').textContent = `${a.table.length} rows`;
}

let analysisSeq = 0;
async function refreshInsights() {
    if (State.mode === 'geometry') return;
    const expr = activeExpr();
    if (!expr) return;
    const seq = ++analysisSeq;
    const params = State.mode === 'calculus' ? '{}' : JSON.stringify(State.params);
    const url = `/api/analyze/?expr=${encodeURIComponent(expr)}&params=${encodeURIComponent(params)}&x_min=${State.xMin}&x_max=${State.xMax}&step=${State.valuesStep}`;
    try {
        const resp = await fetch(url);
        const data = await resp.json();
        if (seq !== analysisSeq) return;
        State.analysis = data.success ? data : null;
    } catch (_) {
        State.analysis = null;
    }
    renderKeyPoints();
    renderValues();
    // add markers without refetching the curve
    const chart = $('mainChart');
    if (chart.data && State.showKeyPoints) {
        const base = chart.data.filter(t => t.mode !== 'markers' || !['Root', 'Local maximum', 'Local minimum', 'Inflection', 'y-intercept'].includes(t.name));
        Plotly.react(chart, [...base, ...keyPointTraces()], chart.layout, PLOTLY_CONFIG);
    }
}

function setupInsights() {
    const panel = $('insightPanel');
    document.querySelectorAll('.insight-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.insight-tab').forEach(t => t.classList.toggle('active', t === tab));
            document.querySelectorAll('.insight-pane').forEach(p => p.classList.toggle('active', p.id === tab.dataset.pane));
            panel.classList.remove('collapsed');
            setTimeout(() => Plotly.Plots.resize($('mainChart')), 50);
        });
    });
    $('insightCollapse').addEventListener('click', () => {
        panel.classList.toggle('collapsed');
        $('insightCollapse').textContent = panel.classList.contains('collapsed') ? 'Expand' : 'Collapse';
        setTimeout(() => Plotly.Plots.resize($('mainChart')), 50);
    });
    $('valuesStep').addEventListener('change', (e) => {
        const v = parseFloat(e.target.value);
        State.valuesStep = v > 0 ? v : 1;
        refreshInsights();
    });
}

// ===== Overlay layers =====
const MAX_LAYERS = 4;

function renderLayerList() {
    const list = $('layerList');
    $('layerEmpty').style.display = State.layers.length ? 'none' : 'block';
    list.innerHTML = '';
    State.layers.forEach((l, i) => {
        const row = document.createElement('div');
        row.className = 'layer-chip' + (l.visible ? '' : ' hidden-layer');
        const sw = document.createElement('span');
        sw.className = 'layer-swatch';
        sw.style.background = seriesColor(i + 1);
        const label = document.createElement('span');
        label.className = 'layer-expr';
        label.textContent = l.expr;
        label.title = 'Click to show or hide';
        label.addEventListener('click', () => { l.visible = !l.visible; renderLayerList(); rerender(); });
        const del = document.createElement('button');
        del.className = 'layer-btn';
        del.type = 'button';
        del.textContent = '×';
        del.title = 'Remove overlay';
        del.addEventListener('click', () => { State.layers.splice(i, 1); renderLayerList(); rerender(); });
        row.append(sw, label, del);
        list.appendChild(row);
    });
}

async function loadLayers() {
    State.layerTraces = [];
    const active = State.layers.map((l, i) => ({ l, i })).filter(({ l }) => l.visible);
    const results = await Promise.all(active.map(({ l }) =>
        fetch(`/api/plot/?expr=${encodeURIComponent(l.expr)}&type=custom&params=${encodeURIComponent(JSON.stringify(l.params))}&x_min=${State.xMin}&x_max=${State.xMax}`)
            .then(r => r.json()).catch(() => null)));
    results.forEach((d, k) => {
        if (!d || !d.success || !d.graph.data[0]) return;
        const { l, i } = active[k];
        State.layerTraces.push({
            ...d.graph.data[0],
            name: l.expr,
            line: { color: seriesColor(i + 1), width: 2, dash: 'dash' },
            hovertemplate: `${l.expr}<br>x: <b>%{x:.4f}</b><br>y: <b>%{y:.4f}</b><extra></extra>`,
        });
    });
    const chart = $('mainChart');
    return State.layerTraces;
}

function setupLayers() {
    const btn = $('pinLayerBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        if (State.layers.length >= MAX_LAYERS) return;
        const expr = State.currentExpr;
        if (!expr || State.layers.some(l => l.expr === expr && JSON.stringify(l.params) === JSON.stringify(State.params))) return;
        State.layers.push({ expr, params: { ...State.params }, visible: true });
        renderLayerList();
        rerender();
    });
    renderLayerList();
}

document.addEventListener('DOMContentLoaded', init);
