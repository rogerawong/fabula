import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEWPORT,
  MAX_SCALE,
  MIN_SCALE,
  canvasToScreen,
  clampScale,
  clampToContentOrigin,
  fitToBounds,
  panBy,
  rubberBandPastOrigin,
  screenToCanvas,
  snapScale,
  zoomAt,
} from "../transform";

describe("coordinate round-trips", () => {
  it("screenToCanvas inverts canvasToScreen", () => {
    const v = { x: 120, y: -40, scale: 0.75 };
    const p = { x: 333, y: 77 };
    const round = screenToCanvas(v, canvasToScreen(v, p));
    expect(round.x).toBeCloseTo(p.x);
    expect(round.y).toBeCloseTo(p.y);
  });
});

describe("zoomAt", () => {
  it("keeps the anchor point stationary on screen", () => {
    const v = { x: 50, y: 20, scale: 1 };
    const anchor = { x: 400, y: 300 };
    const canvasBefore = screenToCanvas(v, anchor);

    const zoomed = zoomAt(v, anchor, 1.5);
    const canvasAfter = screenToCanvas(zoomed, anchor);

    expect(canvasAfter.x).toBeCloseTo(canvasBefore.x);
    expect(canvasAfter.y).toBeCloseTo(canvasBefore.y);
    expect(zoomed.scale).toBe(1.5);
  });

  it("clamps scale to [MIN, MAX]", () => {
    const v = DEFAULT_VIEWPORT;
    expect(zoomAt(v, { x: 0, y: 0 }, 99).scale).toBe(MAX_SCALE);
    expect(zoomAt(v, { x: 0, y: 0 }, 0.001).scale).toBe(MIN_SCALE);
  });
});

describe("scale helpers", () => {
  it("snapScale snaps to 10% steps within bounds", () => {
    expect(snapScale(0.97)).toBe(1);
    expect(snapScale(0.44)).toBeCloseTo(0.4);
    expect(snapScale(5)).toBe(MAX_SCALE);
    expect(clampScale(0)).toBe(MIN_SCALE);
  });
});

describe("panBy", () => {
  it("offsets without touching scale", () => {
    const v = panBy({ x: 10, y: 10, scale: 0.5 }, -5, 15);
    expect(v).toEqual({ x: 5, y: 25, scale: 0.5 });
  });
});

describe("clampToContentOrigin", () => {
  it("blocks viewing past the top-left corner (x/y capped at 0)", () => {
    expect(clampToContentOrigin({ x: 120, y: 80, scale: 1 })).toEqual({
      x: 0,
      y: 0,
      scale: 1,
    });
    // the window top-left in canvas coords is now exactly the origin
    const clamped = clampToContentOrigin({ x: 50, y: 50, scale: 0.5 });
    const origin = screenToCanvas(clamped, { x: 0, y: 0 });
    expect(Math.abs(origin.x)).toBe(0);
    expect(Math.abs(origin.y)).toBe(0);
  });

  it("leaves rightward/downward viewing untouched", () => {
    expect(clampToContentOrigin({ x: -300, y: -140, scale: 2 })).toEqual({
      x: -300,
      y: -140,
      scale: 2,
    });
  });
});

describe("rubberBandPastOrigin", () => {
  it("passes in-bounds values through unchanged", () => {
    expect(rubberBandPastOrigin({ x: -50, y: 0, scale: 1 })).toEqual({
      x: -50,
      y: 0,
      scale: 1,
    });
  });

  it("resists overshoot monotonically and never exceeds the give", () => {
    const give = 96;
    const at = (x: number) => rubberBandPastOrigin({ x, y: 0, scale: 1 }, give).x;
    expect(at(50)).toBeLessThan(50); // resisted
    expect(at(50)).toBeGreaterThan(0); // but still visibly past the edge
    expect(at(200)).toBeGreaterThan(at(50)); // monotone
    expect(at(100_000)).toBeLessThan(give); // asymptotic cap
  });

  it("the give is in SCREEN px — identical at every zoom level", () => {
    // same screen-space overshoot resists identically regardless of scale
    expect(rubberBandPastOrigin({ x: 200, y: 0, scale: 0.2 }).x).toBe(
      rubberBandPastOrigin({ x: 200, y: 0, scale: 2 }).x,
    );
  });
});

describe("fitToBounds", () => {
  it("fits large content by scaling down, anchored top-left (inside the pan bound)", () => {
    const v = fitToBounds({ width: 2000, height: 1000 }, { width: 1000, height: 800 }, 0);
    expect(v.scale).toBeCloseTo(0.5);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it("never zooms in past 100% for small content; stays at the origin", () => {
    const v = fitToBounds({ width: 200, height: 100 }, { width: 1000, height: 800 });
    expect(v.scale).toBe(1);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it("degenerate content falls back to the default viewport", () => {
    expect(fitToBounds({ width: 0, height: 0 }, { width: 800, height: 600 })).toEqual(
      DEFAULT_VIEWPORT,
    );
  });
});
