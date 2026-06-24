import React, { useId, useState, useEffect, useRef } from "react";
import * as d3 from "d3";
import { StaticMeshGradient } from "@paper-design/shaders-react";

// Config-driven output map. Form follows message PER VIEW, not once:
//  - "AI vs human": two balanced series => baseline-anchored stacked area (gentle curve + dots).
//  - "By AI tool": four very unequal series => four lines, so Codex and Devin stay visible
//    instead of being crushed into slivers. Lines also answer that view's real question:
//    which tools are growing.
// Switching the breakdown swaps the chart form, the scale, and the benchmark set.
// React owns state + layout; D3 owns the SVG drawing and the smooth benchmark transition.

const C = {
  bg: "#FFFCF7", ink: "#1A1A18", soft: "#6B6864", faint: "#A7A299", grid: "#ECE9E3",
  coral: "#EA5F3E", coralFill: "rgba(234,95,62,0.23)", humanFill: "rgba(67,38,43,0.20)", bench: "#9A958C",
  secondary: "#43262B", track: "#F4F1EC", tooltipMuted: "#D8D1C7", coralDark: "#C9543A"
};
const MESH_COLORS = ["#FFFCF7", "#C7BCBA", "#F8C5B6", "#FAD8D0"];

// --- shared time axis (numbers read off the screenshots) ---
const RAW = [
  { d: "2026-01-19", human: 340, ai: 450 }, { d: "2026-01-26", human: 290, ai: 370 },
  { d: "2026-02-02", human: 580, ai: 870 }, { d: "2026-02-09", human: 440, ai: 610 },
  { d: "2026-02-16", human: 720, ai: 1150 }, { d: "2026-02-23", human: 560, ai: 910 },
  { d: "2026-03-02", human: 540, ai: 880 }, { d: "2026-03-09", human: 620, ai: 1020 },
  { d: "2026-03-16", human: 510, ai: 860 }, { d: "2026-03-23", human: 520, ai: 910 },
  { d: "2026-03-30", human: 400, ai: 690 }, { d: "2026-04-06", human: 560, ai: 1000 },
  { d: "2026-04-13", human: 240, ai: 460 },
];
const parseDate = d3.utcParse("%Y-%m-%d");

// by-type per week (Feb 16 pinned: Feature 1147, Bug 311, KTLO 423), for the fixed bottom panel
const BYTYPE_WEEKS = {
  feature: [470, 400, 880, 640, 1147, 890, 860, 1010, 830, 870, 660, 950, 430],
  bug:     [130, 110, 240, 170, 311, 250, 240, 270, 230, 240, 180, 260, 120],
  ktlo:    [190, 150, 330, 240, 423, 330, 320, 360, 310, 320, 250, 350, 150],
};

const DATA = RAW.map((r, i) => {
  const total = r.human + r.ai;
  const feature = BYTYPE_WEEKS.feature[i];
  const bug = BYTYPE_WEEKS.bug[i];
  const ktlo = i === 4 ? 412 : BYTYPE_WEEKS.ktlo[i]; // Adjust slightly to match Feb 16 total exactly (1870)

  // Disperse total into platform, product, growth nicely
  const product = Math.round(total * 0.41);
  const platform = Math.round(total * 0.34);
  const growth = total - product - platform;

  return {
    date: parseDate(r.d),
    human: r.human,
    ai: r.ai,
    total,
    feature,
    bug,
    ktlo,
    product,
    platform,
    growth
  };
});

const firstShare = Math.round((DATA[0].ai / DATA[0].total) * 100);
const lastShare = Math.round((DATA[11].ai / DATA[11].total) * 100);

// By AI tool, Output per engineer scale. Feb 16 pinned to the tooltip:
// Claude Code 43, Cursor 28, Codex 4.4, Devin 2.7.
const TOOLS = [
  { key: "claude", name: "Claude Code", color: "#EA5F3E", values: [16, 13.5, 31, 22, 43, 32, 30, 36, 28.5, 31.5, 23.5, 34, 15] },
  { key: "cursor", name: "Cursor",      color: "#43262B", values: [11, 9, 21, 14, 28, 21, 20, 23.5, 19, 20.5, 15.5, 22.5, 10] },
  { key: "codex",  name: "Codex",       color: "#A3908D", values: [1.8, 1.5, 3.2, 2.4, 4.4, 3.2, 3.2, 3.6, 2.8, 3.2, 2.4, 3.5, 1.8] },
  { key: "devin",  name: "Devin",       color: "#6FB7CE", values: [1.2, 1.0, 1.8, 1.6, 2.7, 1.8, 1.8, 1.9, 1.7, 1.8, 1.6, 2.0, 1.2] },
];

const SCALED_TOOLS = TOOLS.map(tool => {
  return {
    ...tool,
    values: tool.values.map((v, i) => {
      const sum = TOOLS.reduce((acc, t) => acc + t.values[i], 0);
      return Math.round((v / sum) * DATA[i].ai);
    })
  };
});

const VIEWS = {
  aivshuman: {
    form: "area", metric: "Total output",
    headline: "AI vs human output",
    subtitle: "Compare weekly engineering work done with AI assistance versus human-only output.",
    num: "1,243", percentile: "90th percentile",
    yMax: 2000, yTicks: [0, 500, 1000, 1500, 2000], yFmt: (v) => (v === 0 ? "0" : v >= 1000 ? v / 1000 + "k" : "" + v),
    bench: { median: { v: 780, label: "Median \u00b7 780" }, top10: { v: 1243, label: "Top 10% \u00b7 1.2k" }, top1: { v: 1640, label: "Top 1% \u00b7 1.6k" } },
    keys: ["ai", "human"],
    colors: {
      ai: C.coralFill,
      human: C.humanFill,
    },
    lineColors: {
      ai: C.coral,
      human: C.secondary,
    },
    labels: {
      ai: "AI-assisted",
      human: "Human",
    },
  },
  bytype: {
    form: "area", metric: "Total output",
    headline: "Work distribution by type",
    subtitle: "See how weekly engineering output breaks down across features, bugs, and KTLO.",
    num: "1,243", percentile: "90th percentile",
    yMax: 2000, yTicks: [0, 500, 1000, 1500, 2000], yFmt: (v) => (v === 0 ? "0" : v >= 1000 ? v / 1000 + "k" : "" + v),
    bench: { median: { v: 780, label: "Median \u00b7 780" }, top10: { v: 1243, label: "Top 10% \u00b7 1.2k" }, top1: { v: 1640, label: "Top 1% \u00b7 1.6k" } },
    keys: ["bug", "ktlo", "feature"],
    colors: {
      feature: C.coralFill,
      ktlo: C.humanFill,
      bug: "rgba(126, 138, 144, 0.16)",
    },
    lineColors: {
      feature: C.coral,
      ktlo: C.secondary,
      bug: "#7E8A90",
    },
    labels: {
      feature: "Feature",
      ktlo: "KTLO",
      bug: "Bug",
    },
  },
  byteam: {
    form: "area", metric: "Total output",
    headline: "Work distribution by team",
    subtitle: "See the volume of weekly engineering output delivered by each team.",
    num: "1,243", percentile: "90th percentile",
    yMax: 2000, yTicks: [0, 500, 1000, 1500, 2000], yFmt: (v) => (v === 0 ? "0" : v >= 1000 ? v / 1000 + "k" : "" + v),
    bench: { median: { v: 780, label: "Median \u00b7 780" }, top10: { v: 1243, label: "Top 10% \u00b7 1.2k" }, top1: { v: 1640, label: "Top 1% \u00b7 1.6k" } },
    keys: ["growth", "platform", "product"],
    colors: {
      product: C.humanFill,
      platform: C.coralFill,
      growth: "rgba(111, 183, 206, 0.16)",
    },
    lineColors: {
      product: C.secondary,
      platform: C.coral,
      growth: "#6FB7CE",
    },
    labels: {
      product: "Product",
      platform: "Platform",
      growth: "Growth",
    },
  },
  byaitool: {
    form: "lines", metric: "Total output",
    headline: "AI output breakdown by tool",
    subtitle: "See which AI tool is driving the most engineering work and output volume.",
    num: "1,243", percentile: "90th percentile",
    yMax: 1200, yTicks: [0, 300, 600, 900, 1200], yFmt: (v) => (v === 0 ? "0" : v >= 1000 ? v / 1000 + "k" : "" + v),
    bench: { median: { v: 780, label: "Median \u00b7 780" }, top10: { v: 1243, label: "Top 10% \u00b7 1.2k" }, top1: { v: 1640, label: "Top 1% \u00b7 1.6k" } },
    series: SCALED_TOOLS,
  },
};


const YH = 320, W = 760, ML = 38, MR = 92, MT = 30, MB = 30;
const PW = W - ML - MR, PH = YH - MT - MB;
const x = d3.scaleUtc().domain(d3.extent(DATA, (d) => d.date)).range([ML, ML + PW]);
const CURVE = d3.curveMonotoneX;
const bisectDate = d3.bisector((d) => d.date).center;
const fmt = d3.utcFormat("%b %-d");
const fmtNum = (v) => (v % 1 === 0 ? v.toLocaleString() : v.toFixed(1));
const reduced = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const yScale = (yMax) => d3.scaleLinear().domain([0, yMax]).range([MT + PH, MT]);
const motionDuration = (rm, ms) => (rm ? 0 : ms);
const EASE_OUT = d3.easeCubicOut;
const BENCH_EASE_OUT = d3.easeCubicInOut;

function drawPath(path, rm, duration = 450, delay = 0) {
  if (rm) return;
  const node = path.node();
  if (!node || typeof node.getTotalLength !== "function") return;
  const length = node.getTotalLength();
  path
    .attr("stroke-dasharray", `${length} ${length}`)
    .attr("stroke-dashoffset", length)
    .transition()
    .delay(delay)
    .duration(duration)
    .ease(EASE_OUT)
    .attr("stroke-dashoffset", 0);
}

export default function WeaveOutputRevamp() {
  const [view, setView] = useState("aivshuman");
  const [bench, setBench] = useState("top10");
  const chartRef = useRef(null);
  const tipRef = useRef(null);
  const chartTitleId = useId();
  const chartDescId = useId();

  const [activeTooltip, setActiveTooltip] = useState(null);
  const [warmup, setWarmup] = useState(false);
  const hoverTimeoutRef = useRef(null);
  const cooldownTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (cooldownTimeoutRef.current) clearTimeout(cooldownTimeoutRef.current);
    };
  }, []);

  const handleMouseEnter = (key) => {
    if (cooldownTimeoutRef.current) {
      clearTimeout(cooldownTimeoutRef.current);
      cooldownTimeoutRef.current = null;
    }
    if (warmup) {
      setActiveTooltip(key);
    } else {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = setTimeout(() => {
        setActiveTooltip(key);
        setWarmup(true);
      }, 400);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setActiveTooltip(null);
    if (cooldownTimeoutRef.current) clearTimeout(cooldownTimeoutRef.current);
    cooldownTimeoutRef.current = setTimeout(() => {
      setWarmup(false);
      cooldownTimeoutRef.current = null;
    }, 300);
  };

  // build the main chart whenever the breakdown changes
  useEffect(() => {
    const svg = d3.select(chartRef.current);
    svg.selectAll("*").remove();
    const cfg = VIEWS[view];
    const y = yScale(cfg.yMax);
    const rm = reduced();
    const tip = tipRef.current;
    svg.attr("role", "img").attr("aria-labelledby", `${chartTitleId} ${chartDescId}`);
    svg.append("title").attr("id", chartTitleId).text(cfg.headline);
    svg.append("desc").attr("id", chartDescId).text(cfg.subtitle);
    const showTip = () => {
      if (!tip) return;
      tip.style.opacity = 1;
      tip.style.transform = "translate(-50%, 0) scale(1)";
    };
    const hideTip = () => {
      if (!tip) return;
      tip.style.opacity = 0;
      tip.style.transform = "translate(-50%, 4px) scale(0.96)";
    };

    // gridlines + y labels
    const grid = svg.append("g");
    grid.selectAll("line").data(cfg.yTicks).join("line")
      .attr("x1", ML).attr("x2", ML + PW).attr("y1", (d) => y(d)).attr("y2", (d) => y(d)).attr("stroke", C.grid);
    grid.selectAll("text").data(cfg.yTicks).join("text")
      .attr("x", ML - 8).attr("y", (d) => y(d) + 3.5).attr("text-anchor", "end")
      .attr("font-size", 10.5).attr("fill", C.faint).text(cfg.yFmt);

    // x labels (shared)
    svg.append("g").selectAll("text").data(DATA).join("text")
      .attr("x", (d) => x(d.date)).attr("y", YH - 8).attr("text-anchor", "middle")
      .attr("font-size", 9.5).attr("fill", C.faint).attr("data-i", (d, i) => i).text((d) => fmt(d.date));

    const focus = svg.append("g").style("display", "none");
    focus.append("line").attr("class", "fl").attr("y1", MT).attr("y2", MT + PH)
      .attr("stroke", C.faint).attr("stroke-width", 1).attr("stroke-dasharray", "3 3");

    if (cfg.form === "area") {
      const AREA = d3.area().x((d) => x(d.data.date)).y0((d) => y(d[0])).y1((d) => y(d[1])).curve(CURVE);
      const LINE = d3.line().x((d) => x(d.date)).y((d) => y(d.total)).curve(CURVE);
      const series = d3.stack().keys(cfg.keys)(DATA);
      const clipId = `area-reveal-${view}`;
      const clip = svg.append("clipPath").attr("id", clipId);
      clip.append("rect")
        .attr("x", ML).attr("y", MT).attr("width", rm ? PW : 0).attr("height", PH + MB)
        .transition().duration(motionDuration(rm, 450)).ease(EASE_OUT).attr("width", PW);

      svg.append("g").attr("clip-path", `url(#${clipId})`).selectAll("path").data(series).join("path")
        .attr("fill", (s) => cfg.colors[s.key]).attr("d", AREA)
        .attr("opacity", rm ? 1 : 0).transition().duration(motionDuration(rm, 400)).ease(EASE_OUT).attr("opacity", 1);
      const totalLine = svg.append("path").datum(DATA).attr("fill", "none").attr("stroke", C.coralDark).attr("stroke-width", 2.5)
        .attr("stroke-linejoin", "round").attr("stroke-linecap", "round").attr("d", LINE)
        .attr("opacity", 1);
      drawPath(totalLine, rm, 450, 60);
      svg.append("g").selectAll("circle").data(DATA).join("circle")
        .attr("cx", (d) => x(d.date)).attr("cy", (d) => y(d.total)).attr("fill", C.bg).attr("stroke", C.coralDark)
        .attr("stroke-width", 1.5).attr("r", rm ? 2.8 : 0)
        .transition().delay((d, i) => motionDuration(rm, 150 + i * 12)).duration(motionDuration(rm, 200)).ease(EASE_OUT).attr("r", 2.8);

      const last = DATA[DATA.length - 1];
      let cumulativeLabel = 0;
      cfg.keys.forEach((key) => {
        const val = last[key];
        const midpoint = cumulativeLabel + val / 2;
        cumulativeLabel += val;

        svg.append("text").attr("x", ML + PW + 8).attr("y", y(midpoint) + 4).attr("font-size", 11.5)
          .attr("font-weight", 600).attr("fill", cfg.lineColors[key]).text(cfg.labels[key]);
      });



      const dots = cfg.keys.map((key) => {
        return focus.append("circle").attr("r", 4).attr("fill", C.bg).attr("stroke", cfg.lineColors[key]).attr("stroke-width", 2.2);
      });

      svg.append("rect").attr("x", ML).attr("y", MT).attr("width", PW).attr("height", PH).attr("fill", "transparent")
        .on("mousemove", (event) => {
          const i = bisectDate(DATA, x.invert(d3.pointer(event, svg.node())[0]));
          const d = DATA[i];
          focus.style("display", null);
          focus.select(".fl").attr("x1", x(d.date)).attr("x2", x(d.date));

          let cumulativeVal = 0;
          cfg.keys.forEach((key, kIndex) => {
            const val = d[key];
            cumulativeVal += val;
            dots[kIndex].attr("cx", x(d.date)).attr("cy", y(cumulativeVal));
          });

          svg.selectAll("text[data-i]").attr("fill", (dd, j) => (j === i ? C.ink : C.faint)).attr("font-weight", (dd, j) => (j === i ? 600 : 400));
          if (tip) {
            showTip(); tip.style.left = `clamp(82px, ${(x(d.date) / W) * 100}%, calc(100% - 82px))`;
            
            let rowsHtml = `<div style="font-weight:600;margin-bottom:4px">${fmt(d.date)}</div>`;
            rowsHtml += `<div style="display:flex;justify-content:space-between;gap:14px"><span style="color:${C.tooltipMuted}">Total</span><b style="font-variant-numeric:tabular-nums">${d.total.toLocaleString()}</b></div>`;
            
            const reversedKeys = [...cfg.keys].reverse();
            reversedKeys.forEach((key) => {
              const val = d[key];
              const percentage = Math.round((val / d.total) * 100);
              const labelName = cfg.labels[key];
              rowsHtml += `<div style="display:flex;justify-content:space-between;gap:14px"><span style="color:${C.tooltipMuted}">${labelName}</span><b style="font-variant-numeric:tabular-nums">${val.toLocaleString()} \u00b7 ${percentage}%</b></div>`;
            });
            tip.innerHTML = rowsHtml;
          }
        })
        .on("mouseleave", () => { focus.style("display", "none"); svg.selectAll("text[data-i]").attr("fill", C.faint).attr("font-weight", 400); hideTip(); });
    } else {
      // four-line view
      const LINE = d3.line().x((d) => x(d.date)).y((d) => y(d.v)).curve(CURVE);
      cfg.series.forEach((s, si) => {
        const pts = s.values.map((v, i) => ({ date: DATA[i].date, v }));
        const seriesLine = svg.append("path").datum(pts).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2)
          .attr("stroke-linejoin", "round").attr("stroke-linecap", "round").attr("d", LINE)
          .attr("opacity", 1);
        drawPath(seriesLine, rm, 450, si * 45);
        svg.append("g").selectAll("circle").data(pts).join("circle")
          .attr("cx", (d) => x(d.date)).attr("cy", (d) => y(d.v)).attr("fill", C.bg).attr("stroke", s.color).attr("stroke-width", 1.5).attr("r", rm ? 2.8 : 0)
          .transition().delay((d, i) => motionDuration(rm, 120 + si * 40 + i * 8)).duration(motionDuration(rm, 180)).ease(EASE_OUT).attr("r", 2.8);
      });

      // Align right-side legend labels next to the end of their lines
      const labelData = cfg.series.map((s) => {
        const lastVal = s.values[s.values.length - 1];
        return {
          name: s.name,
          color: s.color,
          y: y(lastVal),
        };
      }).sort((a, b) => a.y - b.y);

      // Resolve label overlaps (minimum gap of 13px)
      const minGap = 13;
      for (let iter = 0; iter < 10; iter++) {
        for (let j = 0; j < labelData.length - 1; j++) {
          if (labelData[j + 1].y - labelData[j].y < minGap) {
            const overlap = minGap - (labelData[j + 1].y - labelData[j].y);
            labelData[j].y -= overlap / 2;
            labelData[j + 1].y += overlap / 2;
          }
        }
      }

      labelData.forEach((ld) => {
        svg.append("text")
          .attr("x", ML + PW + 8)
          .attr("y", ld.y + 4)
          .attr("font-size", 11.5)
          .attr("font-weight", 600)
          .attr("fill", ld.color)
          .text(ld.name);
      });
      const dots = cfg.series.map((s) => focus.append("circle").attr("r", 4).attr("fill", C.bg).attr("stroke", s.color).attr("stroke-width", 2.2));
      svg.append("rect").attr("x", ML).attr("y", MT).attr("width", PW).attr("height", PH).attr("fill", "transparent")
        .on("mousemove", (event) => {
          const i = bisectDate(DATA, x.invert(d3.pointer(event, svg.node())[0]));
          const d = DATA[i];
          focus.style("display", null);
          focus.select(".fl").attr("x1", x(d.date)).attr("x2", x(d.date));
          cfg.series.forEach((s, k) => dots[k].attr("cx", x(d.date)).attr("cy", y(s.values[i])));
          svg.selectAll("text[data-i]").attr("fill", (dd, j) => (j === i ? C.ink : C.faint)).attr("font-weight", (dd, j) => (j === i ? 600 : 400));
          if (tip) {
            showTip(); tip.style.left = `clamp(92px, ${(x(d.date) / W) * 100}%, calc(100% - 92px))`;
            const rows = cfg.series.slice().sort((a, b) => b.values[i] - a.values[i]).map((s) =>
              `<div style="display:flex;align-items:center;gap:8px;margin-top:2px"><span style="width:8px;height:8px;border-radius:2px;background:${s.color};display:inline-block"></span><span style="color:${C.tooltipMuted};min-width:82px">${s.name}</span><b style="font-variant-numeric:tabular-nums;margin-left:auto">${fmtNum(s.values[i])}</b></div>`).join("");
            tip.innerHTML = `<div style="font-weight:600;margin-bottom:4px">${fmt(d.date)}</div>${rows}`;
          }
        })
        .on("mouseleave", () => { focus.style("display", "none"); svg.selectAll("text[data-i]").attr("fill", C.faint).attr("font-weight", 400); hideTip(); });
    }

    // benchmark line + label (class hooks for the transition effect)
    const b0 = cfg.bench[bench];
    svg.append("line").attr("class", "benchLine").attr("x1", ML).attr("x2", ML + PW)
      .attr("y1", y(b0.v)).attr("y2", y(b0.v)).attr("stroke", C.bench).attr("stroke-width", 1.5).attr("stroke-dasharray", "5 4");
    svg.append("text").attr("class", "benchLabel").attr("x", ML + PW).attr("y", y(b0.v) - 6).attr("text-anchor", "end")
      .attr("font-size", 11).attr("font-weight", 600).attr("fill", C.soft).text(b0.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // smoothly move the benchmark line when the comparison or view changes
  useEffect(() => {
    const svg = d3.select(chartRef.current);
    const cfg = VIEWS[view];
    const y = yScale(cfg.yMax);
    const b = cfg.bench[bench];
    const dur = motionDuration(reduced(), 500);
    svg.select(".benchLine").interrupt().transition().duration(dur).ease(BENCH_EASE_OUT).attr("y1", y(b.v)).attr("y2", y(b.v));
    svg.select(".benchLabel").interrupt().transition().duration(dur).ease(BENCH_EASE_OUT).attr("y", y(b.v) - 6).text(b.label);
  }, [view, bench]);



  const cfg = VIEWS[view];
  const TOOLTIPS = {
    aivshuman: "AI vs human output ratio",
    byaitool: "Breakdown of work by AI assistant",
    bytype: "Output split by task category",
    byteam: "Output split by engineering team",
  };

  const tabBtn = (key, label, wired) => {
    const active = view === key;
    const isTooltipOpen = activeTooltip === key;
    return (
      <button key={label} onClick={wired ? () => setView(key) : undefined}
        className={`weave-tab ${active ? "is-active" : ""}`}
        disabled={!wired}
        id={`weave-tab-${key}`}
        role="tab"
        aria-controls="weave-chart-panel"
        aria-disabled={!wired}
        aria-selected={wired ? active : false}
        onMouseEnter={() => handleMouseEnter(key)}
        onMouseLeave={handleMouseLeave}>
        {label}
        {TOOLTIPS[key] && (
          <span className={`weave-tab-tooltip ${isTooltipOpen ? "is-visible" : ""}`}
            style={warmup ? { transitionDuration: "0ms" } : undefined}
            aria-hidden="true">
            {TOOLTIPS[key]}
          </span>
        )}
      </button>
    );
  };
  const cmpBtn = (key, label) => {
    const on = bench === key;
    return (
      <button key={key} onClick={() => setBench(key)}
        className={`weave-compare ${on ? "is-active grain-effect" : ""}`}
        aria-label={`Compare with ${label}`}
        aria-pressed={on}>
        {label}
      </button>
    );
  };

  return (
    <main className="weave-shell" style={{ "--coral": C.coral, "--ink": C.ink, "--soft": C.soft, "--faint": C.faint, "--grid": C.grid }}>
      <div className="weave-background" aria-hidden="true">
        <StaticMeshGradient
          width="100%"
          height="100%"
          colors={MESH_COLORS}
          positions={2}
          waveX={1}
          waveXShift={0.6}
          waveY={1}
          waveYShift={0.21}
          mixing={0.93}
          grainMixer={0}
          grainOverlay={0.22}
          scale={1}
          rotation={270}
          offsetX={0}
          offsetY={0}
          fit="cover"
          minPixelRatio={1}
          maxPixelCount={1600000}
        />
      </div>
      {/* Main Card */}
      <section className="weave-card grain-effect" aria-label="Engineering output benchmark chart">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div key={`copy-${view}`} className="weave-copy">
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: C.faint, fontWeight: 600, letterSpacing: ".02em" }}>
              {cfg.metric}
              <svg width="8" height="6" viewBox="0 0 8 6" fill="none" style={{ marginTop: 1 }} aria-hidden="true" focusable="false">
                <path d="M1 1.5L4 4.5L7 1.5" stroke={C.faint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ fontFamily: "'Civane Norm', Georgia, serif", fontSize: 20, fontWeight: 400, marginTop: 4 }}>{cfg.headline}</div>
            <div style={{ fontSize: 13, color: C.soft, marginTop: 5, maxWidth: 460, lineHeight: 1.4 }}>{cfg.subtitle}</div>
          </div>
          <div key={`kpi-${view}`} className="weave-kpi" style={{ textAlign: "right" }}>
            <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: 0, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {cfg.num}<span style={{ fontSize: 15, fontWeight: 500, color: C.soft }}> /wk</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 7, fontSize: 13, color: C.soft }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: C.coral, display: "inline-block" }} />{cfg.percentile}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "20px 0 6px" }}>
          <div className="weave-segment grain-effect" role="tablist" aria-label="Output breakdown">
            {tabBtn("aivshuman", "AI vs human", true)}
            {tabBtn("byaitool", "By AI tool", true)}
            {tabBtn("bytype", "By type", true)}
            {tabBtn("byteam", "By team", true)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: C.faint }}>Compare</span>
            <div className="weave-compare-group grain-effect" role="group" aria-label="Compare benchmark">
              {cmpBtn("median", "Median")}{cmpBtn("top10", "Top 10%")}{cmpBtn("top1", "Top 1%")}
            </div>
          </div>
        </div>

        <div id="weave-chart-panel" className="weave-chart-wrap" role="tabpanel" aria-labelledby={`weave-tab-${view}`} aria-live="polite">
          <svg ref={chartRef} viewBox={`0 0 ${W} ${YH}`} style={{ width: "100%", height: "auto", display: "block" }} />
          <div ref={tipRef} className="weave-tip" style={{ position: "absolute", top: 0, pointerEvents: "none",
            background: C.ink, color: C.bg, borderRadius: 9, padding: "8px 11px", fontSize: 11.5, whiteSpace: "nowrap",
            boxShadow: "0 6px 18px rgba(0,0,0,0.18)", opacity: 0, minWidth: 150 }} />
        </div>

      </section>
    </main>
  );
}
