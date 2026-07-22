const SVG_NS = "http://www.w3.org/2000/svg";
const WIDTH = 720;
const HEIGHT = 260;
const PADDING = Object.freeze({ bottom: 34, left: 58, right: 20, top: 18 });

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function niceMaximum(value) {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function renderSpeedChart(svg, samples) {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const maxSeconds = Math.max((samples.at(-1)?.elapsedMs ?? 0) / 1000, 1);
  const maxMbps = niceMaximum(Math.max(...samples.map((sample) => sample.mbps), 0));

  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4;
    const y = PADDING.top + plotHeight * ratio;
    const label = maxMbps * (1 - ratio);
    svg.append(
      svgElement("line", {
        class: "chart-grid",
        x1: PADDING.left,
        x2: WIDTH - PADDING.right,
        y1: y,
        y2: y,
      })
    );
    const text = svgElement("text", {
      class: "chart-label",
      x: PADDING.left - 10,
      y: y + 4,
    });
    text.textContent = label >= 100 ? label.toFixed(0) : label.toFixed(1);
    svg.append(text);
  }

  const axisLabel = svgElement("text", {
    class: "chart-axis-title",
    x: PADDING.left,
    y: HEIGHT - 8,
  });
  axisLabel.textContent = `0 – ${maxSeconds.toFixed(1)} 秒`;
  svg.append(axisLabel);

  if (samples.length === 0) return;

  const points = samples
    .map((sample) => {
      const x = PADDING.left + (sample.elapsedMs / 1000 / maxSeconds) * plotWidth;
      const y = PADDING.top + (1 - sample.mbps / maxMbps) * plotHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  svg.append(
    svgElement("polyline", {
      class: "chart-line",
      fill: "none",
      points,
    })
  );
}
