/* ============================================================================
   READY-SET-BAG! — DASHBOARD CHART RENDERERS
   ----------------------------------------------------------------------------
   Hand-rolled charts for the admin + teacher dashboards. There is deliberately
   NO charting library in this project: a library's rounded corners, soft
   shadows, smooth curves and default fonts fight the retro/8-bit look of every
   other panel on these pages, and re-skinning one costs more than drawing the
   handful of shapes we actually need.

   Rule of thumb used here:
     - anything whose labels a user reads (bars, legends, axis ticks) is real
       HTML text, so it inherits the dashboard font sizes and stays crisp;
     - only the marks that HTML cannot draw (donut ring, scatter dots, trend
       lines) are SVG, sized in real pixels from the container so nothing is
       scaled and blurred.

   Every renderer takes an element (or element id) and re-renders it from
   scratch, so callers can just call it again whenever a filter changes.
   Exposes window.RSBCharts.
   ============================================================================ */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function node(target) {
    return typeof target === 'string' ? document.getElementById(target) : target;
  }

  function empty(host, text) {
    host.innerHTML = '<div class="chart-empty">' + esc(text || 'NO DATA YET') + '</div>';
  }

  // Charts inside a hidden page (.page without .active) measure 0 wide. Render
  // against a sane default instead of collapsing, and re-render on resize.
  function width(host, fallback) {
    var w = host.clientWidth;
    return w > 40 ? w : (fallback || 360);
  }

  function onResize(host, redraw) {
    if (typeof ResizeObserver !== 'function') return;
    if (host._rsbResizeObserver) host._rsbResizeObserver.disconnect();
    var last = host.clientWidth;
    var ro = new ResizeObserver(function () {
      var now = host.clientWidth;
      if (now <= 40 || Math.abs(now - last) <= 8) return;
      last = now;
      // Redrawing synchronously inside the callback resizes the observed
      // element again in the same frame, which browsers report as
      // "ResizeObserver loop completed with undelivered notifications" —
      // and the dashboards surface any window error as a toast. Deferring to
      // the next frame keeps the observation and the mutation apart.
      requestAnimationFrame(function () {
        // The observer may have been replaced by a fresh render in between.
        if (host._rsbResizeObserver === ro) redraw();
      });
    });
    ro.observe(host);
    host._rsbResizeObserver = ro;
  }

  /* ------------------------------------------------------------------------
     HORIZONTAL BARS
     opts: {
       rows: [{label, pct, display, color}],   // pct 0-100 drives bar width
       benchmark: {pct, label},                // optional dashed reference line
       axis: ['0','20',...],                   // optional tick labels under bars
       emptyText
     }
     ------------------------------------------------------------------------ */
  function hBars(target, opts) {
    var host = node(target);
    if (!host) return;
    opts = opts || {};
    var rows = opts.rows || [];
    if (!rows.length) return empty(host, opts.emptyText);

    // --bench is a 0-1 fraction: the CSS positions the line inside the BAR
    // column only, so it has to subtract the label/value columns itself.
    var bench = opts.benchmark;
    var benchHtml = bench
      ? '<div class="chart-benchmark" style="--bench:' + (Math.max(0, Math.min(100, bench.pct)) / 100) + '">' +
        '<span class="chart-benchmark-label">' + esc(bench.label || '') + '</span></div>'
      : '';

    var barsHtml = rows.map(function (r) {
      var pct = Math.max(0, Math.min(100, Number(r.pct) || 0));
      return '<div class="hbar-row">' +
        '<div class="hbar-label" title="' + esc(r.label) + '">' + esc(r.label) + '</div>' +
        '<div class="hbar-track">' +
          '<div class="hbar-fill" style="width:' + pct + '%;background:' + (r.color || 'var(--accent-blue)') + '"></div>' +
        '</div>' +
        '<div class="hbar-value">' + esc(r.display != null ? r.display : pct) + '</div>' +
      '</div>';
    }).join('');

    var axisHtml = opts.axis && opts.axis.length
      ? '<div class="hbar-axis">' + opts.axis.map(function (t) {
          return '<span>' + esc(t) + '</span>';
        }).join('') + '</div>'
      : '';

    // Bar labels are real text, so a chart with long category names needs a
    // wider label column rather than an ellipsis.
    var widthVar = opts.labelWidth ? ' style="--hbar-label-w:' + opts.labelWidth + 'px"' : '';
    host.innerHTML = '<div class="hbar-chart"' + widthVar + '><div class="hbar-plot">' + benchHtml + barsHtml +
      '</div>' + axisHtml + '</div>';
  }

  /* ------------------------------------------------------------------------
     DONUT
     opts: { segments: [{label, value, color}], centerValue, centerLabel }
     Drawn as SVG arcs so each slice keeps a hard edge against the panel.
     ------------------------------------------------------------------------ */
  function donut(target, opts) {
    var host = node(target);
    if (!host) return;
    opts = opts || {};
    var segs = (opts.segments || []).filter(function (s) { return Number(s.value) > 0; });
    var total = segs.reduce(function (a, s) { return a + Number(s.value); }, 0);

    function draw() {
      if (!total) return empty(host, opts.emptyText);
      var size = Math.max(120, Math.min(180, width(host, 180) - 8));
      var cx = size / 2, cy = size / 2;
      var stroke = Math.max(16, Math.round(size * 0.16));
      // The stroke straddles the radius, so half of it sits OUTSIDE r. Derive
      // r from the stroke rather than a fixed inset, or the ring's outer edge
      // runs past the viewBox and the sides of the donut are clipped off.
      var r = size / 2 - stroke / 2 - 1;
      var circumference = 2 * Math.PI * r;
      var offset = 0;

      // Rotated -90deg so the first slice starts at 12 o'clock.
      var arcs = segs.map(function (s) {
        var frac = Number(s.value) / total;
        var len = frac * circumference;
        var el = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" ' +
          'stroke="' + s.color + '" stroke-width="' + stroke + '" ' +
          'stroke-dasharray="' + len + ' ' + (circumference - len) + '" ' +
          'stroke-dashoffset="' + (-offset) + '"></circle>';
        offset += len;
        return el;
      }).join('');

      var center = '<div class="donut-center">' +
        '<div class="donut-center-val">' + esc(opts.centerValue == null ? '' : opts.centerValue) + '</div>' +
        '<div class="donut-center-label">' + esc(opts.centerLabel || '') + '</div>' +
      '</div>';

      var legend = (opts.segments || []).map(function (s) {
        return '<div class="chart-legend-row">' +
          '<span class="chart-swatch" style="background:' + s.color + '"></span>' +
          '<span class="chart-legend-text">' + esc(s.label) + '</span>' +
          '<span class="chart-legend-val">' + esc(s.value) + '</span>' +
        '</div>';
      }).join('');

      host.innerHTML = '<div class="donut-chart">' +
        '<div class="donut-ring" style="width:' + size + 'px;height:' + size + 'px">' +
          '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" ' +
            'style="transform:rotate(-90deg)">' + arcs + '</svg>' + center +
        '</div>' +
        '<div class="chart-legend">' + legend + '</div>' +
      '</div>';
    }

    draw();
    onResize(host, draw);
  }

  /* ------------------------------------------------------------------------
     GROUPED VERTICAL BARS
     opts: {
       groups: [{label, sub, bars: [{pct, display, color}]}],
       legend: [{label, color}],
       emptyText
     }
     ------------------------------------------------------------------------ */
  function groupedBars(target, opts) {
    var host = node(target);
    if (!host) return;
    opts = opts || {};
    var groups = opts.groups || [];
    if (!groups.length) return empty(host, opts.emptyText);

    var legend = (opts.legend || []).map(function (l) {
      return '<div class="chart-legend-row inline">' +
        '<span class="chart-swatch" style="background:' + l.color + '"></span>' +
        '<span class="chart-legend-text">' + esc(l.label) + '</span></div>';
    }).join('');

    var cols = groups.map(function (g) {
      var bars = (g.bars || []).map(function (b) {
        var pct = Math.max(0, Math.min(100, Number(b.pct) || 0));
        return '<div class="vbar" style="height:' + pct + '%;background:' + (b.color || 'var(--accent-blue)') + '">' +
          '<span class="vbar-value">' + esc(b.display) + '</span></div>';
      }).join('');
      return '<div class="vbar-group">' +
        '<div class="vbar-stack">' + bars + '</div>' +
        '<div class="vbar-label">' + esc(g.label) + '</div>' +
        (g.sub ? '<div class="vbar-sub">' + esc(g.sub) + '</div>' : '') +
      '</div>';
    }).join('');

    host.innerHTML = (legend ? '<div class="chart-legend row">' + legend + '</div>' : '') +
      '<div class="vbar-chart">' + cols + '</div>';
  }

  /* ------------------------------------------------------------------------
     SCATTER (speed vs score)
     opts: { points:[{x,y,color,label}], xMax, yMax, xTicks, yTicks,
             xAxisLabel, yAxisLabel, legend, emptyText }
     x grows right, y grows UP.
     ------------------------------------------------------------------------ */
  function scatter(target, opts) {
    var host = node(target);
    if (!host) return;
    opts = opts || {};
    var pts = opts.points || [];

    function draw() {
      if (!pts.length) return empty(host, opts.emptyText);
      var w = width(host, 380);
      var h = opts.height || 190;
      var padL = 44, padR = 10, padT = 10, padB = 26;
      var plotW = Math.max(40, w - padL - padR);
      var plotH = Math.max(40, h - padT - padB);
      var xMax = opts.xMax || 100, yMax = opts.yMax || 100;

      var xTicks = opts.xTicks || [0, xMax / 2, xMax];
      var yTicks = opts.yTicks || [0, yMax / 2, yMax];

      var grid = yTicks.map(function (t) {
        var y = padT + plotH - (t / yMax) * plotH;
        return '<line x1="' + padL + '" y1="' + y + '" x2="' + (padL + plotW) + '" y2="' + y +
          '" stroke="#3d3d3d" stroke-width="1"></line>' +
          '<text x="' + (padL - 6) + '" y="' + (y + 3) + '" class="chart-svg-tick" text-anchor="end">' + esc(Math.round(t)) + '</text>';
      }).join('');

      var xAxis = xTicks.map(function (t) {
        var x = padL + (t / xMax) * plotW;
        return '<line x1="' + x + '" y1="' + padT + '" x2="' + x + '" y2="' + (padT + plotH) +
          '" stroke="#2f2f2f" stroke-width="1"></line>' +
          '<text x="' + x + '" y="' + (padT + plotH + 15) + '" class="chart-svg-tick" text-anchor="middle">' +
          esc(opts.xTickLabel ? opts.xTickLabel(t) : Math.round(t)) + '</text>';
      }).join('');

      var dots = pts.map(function (p) {
        var x = padL + (Math.min(p.x, xMax) / xMax) * plotW;
        var y = padT + plotH - (Math.min(p.y, yMax) / yMax) * plotH;
        return '<circle cx="' + x + '" cy="' + y + '" r="5" fill="' + p.color + '" stroke="#111" stroke-width="1.5">' +
          '<title>' + esc(p.label || '') + '</title></circle>';
      }).join('');

      var legend = (opts.legend || []).map(function (l) {
        return '<div class="chart-legend-row inline">' +
          '<span class="chart-swatch" style="background:' + l.color + '"></span>' +
          '<span class="chart-legend-text">' + esc(l.label) + '</span></div>';
      }).join('');

      host.innerHTML = '<div class="svg-chart">' +
        '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
          xAxis + grid + dots +
        '</svg>' +
        (opts.xAxisLabel ? '<div class="chart-axis-caption">' + esc(opts.xAxisLabel) + '</div>' : '') +
        (legend ? '<div class="chart-legend row">' + legend + '</div>' : '') +
      '</div>';
    }

    draw();
    onResize(host, draw);
  }

  /* ------------------------------------------------------------------------
     MULTI-SERIES LINE (trend over time)
     opts: {
       labels: [..],
       series: [{name, color, values:[], max, dashed}],
       emptyText
     }
     Each series is scaled by its own max, so score (0-100) and time (seconds)
     can share one plot. That means the LINES are comparable in shape, not in
     height — the legend names the unit for each.
     ------------------------------------------------------------------------ */
  function lines(target, opts) {
    var host = node(target);
    if (!host) return;
    opts = opts || {};
    var labels = opts.labels || [];
    var series = opts.series || [];
    if (labels.length < 1 || !series.length) return empty(host, opts.emptyText);

    function draw() {
      var w = width(host, 380);
      var h = opts.height || 190;
      var padL = 34, padR = 34, padT = 12, padB = 28;
      var plotW = Math.max(40, w - padL - padR);
      var plotH = Math.max(40, h - padT - padB);
      var n = labels.length;
      var step = n > 1 ? plotW / (n - 1) : 0;

      var grid = [0, 0.25, 0.5, 0.75, 1].map(function (f) {
        var y = padT + plotH - f * plotH;
        return '<line x1="' + padL + '" y1="' + y + '" x2="' + (padL + plotW) + '" y2="' + y +
          '" stroke="#333" stroke-width="1"></line>';
      }).join('');

      var paths = series.map(function (s) {
        var max = s.max || Math.max.apply(null, s.values.concat([1]));
        var pointsAttr = s.values.map(function (v, i) {
          var x = padL + (n > 1 ? i * step : plotW / 2);
          var y = padT + plotH - (Math.min(v, max) / max) * plotH;
          return x + ',' + y;
        }).join(' ');
        var dots = s.values.map(function (v, i) {
          var x = padL + (n > 1 ? i * step : plotW / 2);
          var y = padT + plotH - (Math.min(v, max) / max) * plotH;
          return '<rect x="' + (x - 3) + '" y="' + (y - 3) + '" width="6" height="6" fill="' + s.color + '">' +
            '<title>' + esc(labels[i] + ': ' + (s.format ? s.format(v) : v)) + '</title></rect>';
        }).join('');
        return '<polyline points="' + pointsAttr + '" fill="none" stroke="' + s.color + '" stroke-width="2"' +
          (s.dashed ? ' stroke-dasharray="5 4"' : '') + '></polyline>' + dots;
      }).join('');

      // Only label the ends and middle when there are many buckets, so the
      // x-axis never turns into overlapping mush.
      var showEvery = Math.ceil(n / 6);
      var xLabels = labels.map(function (l, i) {
        if (i % showEvery !== 0 && i !== n - 1) return '';
        var x = padL + (n > 1 ? i * step : plotW / 2);
        return '<text x="' + x + '" y="' + (padT + plotH + 16) + '" class="chart-svg-tick" text-anchor="middle">' +
          esc(l) + '</text>';
      }).join('');

      var legend = series.map(function (s) {
        return '<div class="chart-legend-row inline">' +
          '<span class="chart-swatch" style="background:' + s.color + '"></span>' +
          '<span class="chart-legend-text">' + esc(s.name) + '</span></div>';
      }).join('');

      host.innerHTML = '<div class="svg-chart">' +
        '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
          grid + paths + xLabels +
        '</svg>' +
        '<div class="chart-legend row">' + legend + '</div>' +
      '</div>';
    }

    draw();
    onResize(host, draw);
  }

  window.RSBCharts = {
    hBars: hBars,
    donut: donut,
    groupedBars: groupedBars,
    scatter: scatter,
    lines: lines
  };
})();
