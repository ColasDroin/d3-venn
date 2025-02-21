import { binder, applier } from "./getSet.js";
import { pack, distribute, force } from "./packStrategies.js";
import {
  venn as vennLayout,
  normalizeSolution,
  scaleSolution,
} from "../venn.js/src/layout.js";
import {
  intersectionAreaPath,
  computeTextCentres,
} from "../venn.js/src/diagram.js";
import { distance } from "../venn.js/src/circleintersection.js";

// default set accessor
function setsAccessorFn(d) {
  return d.set || [];
}

// default setSize function
function setsSize(size) {
  return size;
}

// default value function
function valueFn(d) {
  return d.value;
}

export default function () {
  // The "options" object we bind via binder(...)
  const opts = {
    sets: null,
    setsAccessor: setsAccessorFn,
    setsSize: setsSize,
    packingStragegy: pack,
    packingConfig: {
      value: valueFn,
    },
    size: [1, 1],
    padding: 0,
    layoutFunction: vennLayout,
    orientation: Math.PI / 2,
    normalize: true,
  };

  let circles, nodes, packer, centres;

  binder(venn, opts);

  // main function
  function venn(data) {
    if (!arguments.length) return nodes;
    nodes = compute(data);
    return venn;
  }

  function compute(data) {
    const setsMap = extractSets(data);
    // store this Map in venn.sets
    venn.sets(setsMap);

    const setsValues = [...setsMap.values()];
    let solution = venn.layoutFunction()(setsValues);

    if (venn.normalize()) {
      solution = normalizeSolution(solution, venn.orientation());
    }

    const width = venn.size()[0],
      height = venn.size()[1];

    // scale solution
    const oldCircles = circles;
    circles = scaleSolution(solution, width, height, venn.padding());

    // preserve transitions
    for (let k in oldCircles) {
      if (circles[k]) {
        circles[k].previous = oldCircles[k];
      }
    }

    centres = computeTextCentres(circles, setsValues);

    // store intersectionAreaPath in sets
    for (const [k, set] of setsMap.entries()) {
      set.d = pathTween(set);
      set.center = centres[k];
      set.innerRadius = computeDistanceToCircles(set);
    }

    // run packing strategy
    packer = venn.packingStragegy()(venn, data);

    function computeDistanceToCircles(set) {
      const center = set.center;
      let candidate = Infinity;
      for (const cid in circles) {
        const circle = circles[cid];
        if (!circle) continue;
        const isInside = set.sets.indexOf(cid) > -1;
        const distToCenter = distance(center, circle);
        let dist;
        if (isInside) {
          dist = circle.radius - distToCenter;
        } else {
          // check if this circle overlaps any in set
          const overlapping = set.sets.some((sid) => {
            const c2 = circles[sid];
            return distance(c2, circle) < c2.radius;
          });
          dist = overlapping
            ? distToCenter - circle.radius
            : distToCenter + circle.radius;
        }
        if (dist < candidate) {
          candidate = dist;
        }
      }
      return candidate;
    }

    // The function that returns a function to handle path interpolation
    function pathTween(set) {
      return function (t) {
        const c = set.sets.map((sid) => {
          const circle = circles[sid];
          const start = circle?.previous || {
            x: width / 2,
            y: height / 2,
            radius: 1,
          };
          const end = circle || {
            x: width / 2,
            y: height / 2,
            radius: 1,
          };
          if (t === 1 && circle) {
            circle.previous = end;
          }
          return {
            x: start.x * (1 - t) + end.x * t,
            y: start.y * (1 - t) + end.y * t,
            radius: start.radius * (1 - t) + end.radius * t,
          };
        });
        return intersectionAreaPath(c);
      };
    }

    return data;
  }

  /**
   * Extract sets from data so that they comply with the benfred/venn.js layout
   * style:
   * e.g.
   *   [{ sets: ["A"], size: 1, nodes: [...] },
   *    { sets: ["B"], size: 1, nodes: [...] },
   *    { sets: ["A","B"], size: 2, nodes: [...]}]
   */
  function extractSets(data) {
    const setsMap = new Map();
    const individualSets = new Map();
    const accessor = venn.setsAccessor();
    const sizeFn = venn.setsSize();

    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const setArr = accessor(d);
      if (!setArr.length) continue;

      // Sort so that the key matches the benfred/venn format
      const key = setArr.slice().sort().join(",");
      // Add to the individual sets
      setArr.forEach((val) => {
        if (!individualSets.has(val)) {
          individualSets.set(val, {
            __key__: val,
            size: 1,
            sets: [val],
            nodes: [],
          });
        } else {
          const existing = individualSets.get(val);
          existing.size++;
        }
      });

      d.__setKey__ = key;
      if (setsMap.has(key)) {
        const existing = setsMap.get(key);
        existing.size++;
        existing.nodes.push(d);
      } else {
        setsMap.set(key, {
          __key__: key,
          sets: setArr,
          size: 1,
          nodes: [d],
        });
      }
    }

    // Add any single sets that might be missing
    for (const [k, v] of individualSets.entries()) {
      if (!setsMap.has(k)) {
        setsMap.set(k, v);
      }
    }

    // Adjust size with user function
    for (const [k, v] of setsMap.entries()) {
      v.size = sizeFn(v.size);
    }
    return setsMap;
  }

  venn.packingConfig = function (_) {
    const config = opts.packingConfig;
    if (!arguments.length) return config;
    for (const k in _) {
      config[k] = _[k];
    }
    if (packer) {
      applier(packer, _);
    }
    return venn;
  };

  venn.packer = function () {
    return packer;
  };

  venn.circles = function () {
    return circles;
  };

  venn.centres = function () {
    return centres;
  };

  venn.nodes = venn;

  return venn;
}

// Also re-export your packing strategies
export { pack, distribute, force };
