import {
  SMALL,
  containedInCircles,
  distance,
} from "../venn.js/src/circleintersection.js";
import { binder, applier } from "./getSet.js";

import * as d3 from "d3";

/**
 * Return true if point is outside all circles
 */
function outOfCircles(point, circles) {
  for (let i = 0; i < circles.length; i++) {
    if (distance(point, circles[i]) < circles[i].radius + SMALL) {
      return false;
    }
  }
  return true;
}

/**
 * PACK STRATEGY
 *
 * For each Venn set, we use d3.pack on the set's children.
 * We create a hierarchy root with those children, call pack, then
 * shift each child’s x,y back to the correct center.
 */
export function pack(layout) {
  const sets = layout.sets();
  // sets() might be a Map or your custom structure.
  for (const [key, set] of sets.entries()) {
    const innerRadius = set.innerRadius;
    const center = set.center;
    const children = set.nodes || [];

    // Create a root for d3.pack
    const root = d3.hierarchy({ children }).sum(() => 1); // or use your custom "value" if you like

    // Create the pack layout
    const config = layout.packingConfig();
    let packLayout = d3
      .pack()
      .size([innerRadius * 2, innerRadius * 2])
      .padding(config.padding || 0);

    // If there's anything in config we can apply:
    packLayout = applier(packLayout, config);

    // Run the pack
    packLayout(root);

    // Shift each leaf’s x,y so that (0,0) is at (center.x - innerRadius)
    const offsetX = center.x - innerRadius;
    const offsetY = center.y - innerRadius;

    root.leaves().forEach((leaf) => {
      // leaf.x, leaf.y are the pack’s positions
      // leaf.data is the actual node
      leaf.data.x = leaf.x + offsetX;
      leaf.data.y = leaf.y + offsetY;
    });
  }
}

/**
 * DISTRIBUTE STRATEGY
 * Randomly place child nodes inside the set area.
 */
export function distribute(layout) {
  const sets = layout.sets();
  const circles = layout.circles();
  for (const [key, set] of sets.entries()) {
    const inCircles = [];
    const outCircles = [];
    const center = set.center;
    const innerRadius = set.innerRadius;
    const children = set.nodes || [];

    // Separate circles that belong to this set vs. outside
    for (const [ckey, circle] of Object.entries(circles)) {
      if (set.sets.indexOf(ckey) > -1) {
        inCircles.push(circle);
      } else {
        outCircles.push(circle);
      }
    }

    const queue = [];
    const maxAttempt = 500;

    children.forEach((n, i) => {
      if (i === 0) {
        // First node in center
        n.x = center.x;
        n.y = center.y;
        queue.push(n);
      } else {
        let attempt = 0;
        let candidate = null;

        while (!candidate && attempt < maxAttempt) {
          let randIdx = Math.floor(Math.random() * queue.length);
          let s = queue[randIdx];
          let a = 2 * Math.PI * Math.random();
          let r = Math.sqrt(
            Math.random() * (innerRadius * innerRadius + 10 * 10)
          );
          let p = {
            x: s.x + r * Math.cos(a),
            y: s.y + r * Math.sin(a),
          };
          attempt++;
          if (containedInCircles(p, inCircles) && outOfCircles(p, outCircles)) {
            candidate = p;
            queue.push(p);
          }
        }

        if (!candidate) {
          // fallback
          candidate = { x: center.x, y: center.y };
        }
        n.x = candidate.x;
        n.y = candidate.y;
      }
    });
  }
}

/**
 * FORCE STRATEGY
 * We create a forceSimulation with zero or low gravity, zero charge, and we
 * manually add a collision. We then “pull” each node toward the set center.
 *
 * The old code had .on('start'), .on('tick') etc. We'll replicate "start" with
 * an immediate init function, or pass a callback. There's no "start" event in d3 v7.
 */
export function force(layout, data) {
  // Reuse or create a new simulation
  let simulation = layout.packer();
  if (!simulation) {
    simulation = d3.forceSimulation();
    binder(simulation, {
      padding: 3,
      maxRadius: 8,
      collider: true,
      ticker: null,
      ender: null,
      starter: null,
    });
  }

  const packingConfig = layout.packingConfig();
  const size = layout.size();
  const sets = layout.sets();

  // Example: typical modern D3 force:
  simulation
    .nodes(data)
    .force("center", null) // we do our own "gravity" below
    .force("charge", d3.forceManyBody().strength(0))
    .force(
      "collision",
      d3.forceCollide().radius((d) => d.r + (simulation.padding() || 3))
    )
    .on("tick", tick)
    .on("end", () => {
      if (simulation.ender()) {
        simulation.ender()(layout);
      }
    });

  // The old code: we replicate a "start" callback:
  init();
  if (simulation.starter()) {
    simulation.starter()(layout);
  }

  // Provide user with a "ticker" if needed
  function tick() {
    // Move nodes toward cluster focus
    data.forEach((d) => {
      const setData = sets.get(d.__setKey__);
      if (!setData) return;
      const center = setData.center;
      const alpha = 0.2 * simulation.alpha(); // emulate old alpha usage
      d.x += (center.x - d.x) * alpha;
      d.y += (center.y - d.y) * alpha;
    });

    // Custom user ticker
    if (simulation.ticker()) {
      simulation.ticker()(layout);
    }
  }

  function init() {
    // we can do initialization of positions here
    data.forEach((d) => {
      const setData = sets.get(d.__setKey__);
      if (setData) {
        d.x = d.x || setData.center.x;
        d.y = d.y || setData.center.y;
      }
    });
  }

  // Return the simulation to store it
  return simulation;
}
