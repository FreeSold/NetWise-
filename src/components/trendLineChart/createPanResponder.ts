import type { MutableRefObject } from "react";
import { Animated, PanResponder } from "react-native";
import type { TrendPoint } from "../../storage/assetHistoryDb";
import { DISPLAY_POINT_CAP, LINE_X_INSET, PAN_PX_PER_STEP } from "./constants";

type LatestComputed = {
  plotW: number;
  axisFreezeStart: number | null;
  panJ0: number;
  panJFirstMax: number;
};

export function createTrendLineChartPanResponder(input: {
  dragX: Animated.Value;
  windowStartRef: MutableRefObject<number>;
  pointsRef: MutableRefObject<TrendPoint[]>;
  latestComputedRef: MutableRefObject<LatestComputed>;
  dragOriginWindowRef: MutableRefObject<number>;
  userPannedRef: MutableRefObject<boolean>;
  setSelectedDate: (v: string | null) => void;
  setAxisFreezeStart: (v: number | null) => void;
  setWindowStart: (v: number | ((prev: number) => number)) => void;
}): ReturnType<typeof PanResponder.create> {
  const {
    dragX,
    windowStartRef,
    pointsRef,
    latestComputedRef,
    dragOriginWindowRef,
    userPannedRef,
    setSelectedDate,
    setAxisFreezeStart,
    setWindowStart
  } = input;

  return PanResponder.create({
    onPanResponderGrant: () => {
      setSelectedDate(null);
      dragX.stopAnimation();
      const w0 = windowStartRef.current;
      dragOriginWindowRef.current = w0;
      const len = pointsRef.current.length;
      const maxS = Math.max(0, len - DISPLAY_POINT_CAP);
      if (maxS > 0) {
        setAxisFreezeStart(w0);
      }
    },
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.05,
    onPanResponderMove: (_, g) => {
      const len = pointsRef.current.length;
      const maxS = Math.max(0, len - DISPLAY_POINT_CAP);
      if (maxS === 0) {
        return;
      }
      const freezeW = latestComputedRef.current.axisFreezeStart;
      if (freezeW === null) {
        return;
      }
      const { plotW, panJ0, panJFirstMax } = latestComputedRef.current;
      const denom = Math.max(1, DISPLAY_POINT_CAP - 1);
      const plotStep = Math.max(1, plotW - 2 * LINE_X_INSET) / denom;
      const T0 = -panJ0 * plotStep;
      const TMin = -panJFirstMax * plotStep;
      const TMax = 0;
      const dx = g.dx;
      let T = T0 + dx;
      if (T > TMax) {
        T = TMax + (T - TMax) * 0.28;
      }
      if (T < TMin) {
        T = TMin + (T - TMin) * 0.28;
      }
      dragX.setValue(T);
    },
    onPanResponderRelease: (_, g) => {
      const len = pointsRef.current.length;
      const maxS = Math.max(0, len - DISPLAY_POINT_CAP);
      if (maxS === 0) {
        Animated.spring(dragX, {
          toValue: 0,
          useNativeDriver: false,
          friction: 8,
          tension: 160
        }).start();
        return;
      }
      const w0 = dragOriginWindowRef.current;
      const delta = Math.round(-g.dx / PAN_PX_PER_STEP);
      if (delta !== 0) {
        userPannedRef.current = true;
      }
      const finalWin = Math.max(0, Math.min(maxS, w0 + delta));
      dragX.stopAnimation();
      dragX.setValue(0);
      setWindowStart(finalWin);
      setAxisFreezeStart(null);
    },
    onPanResponderTerminate: (_, g) => {
      const len = pointsRef.current.length;
      const maxS = Math.max(0, len - DISPLAY_POINT_CAP);
      dragX.stopAnimation();
      dragX.setValue(0);
      if (maxS > 0) {
        const w0 = dragOriginWindowRef.current;
        const delta = Math.round(-(g?.dx ?? 0) / PAN_PX_PER_STEP);
        if (delta !== 0) {
          userPannedRef.current = true;
        }
        const finalWin = Math.max(0, Math.min(maxS, w0 + delta));
        setWindowStart(finalWin);
        setAxisFreezeStart(null);
      }
    }
  });
}
