import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";

// CSS zoom helpers: getBoundingClientRect() returns visual pixels, but
// style.left/top and window.innerWidth/Height are in CSS pixel space.
type TooltipSide = "top" | "bottom" | "left" | "right";

const GAP = 8;
const EDGE_PAD = 8;
const ARROW_SIZE = 7;
const ARROW_PAD = 12;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function oppositeSide(side: TooltipSide): TooltipSide {
  if (side === "top") return "bottom";
  if (side === "bottom") return "top";
  if (side === "left") return "right";
  return "left";
}

function samePosition(
  current: { left: number; top: number; side: TooltipSide; arrowX: number; arrowY: number },
  next: { left: number; top: number; side: TooltipSide; arrowX: number; arrowY: number },
): boolean {
  return (
    current.side === next.side &&
    Math.abs(current.left - next.left) < 0.5 &&
    Math.abs(current.top - next.top) < 0.5 &&
    Math.abs(current.arrowX - next.arrowX) < 0.5 &&
    Math.abs(current.arrowY - next.arrowY) < 0.5
  );
}

export function Tooltip({
  label,
  children,
  side = "top",
  fill = false,
  block = false,
  disabled = false,
  className,
}: {
  label?: ReactNode;
  children: ReactNode;
  side?: TooltipSide;
  fill?: boolean;
  block?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const showTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, side, arrowX: 0, arrowY: 0 });
  const active = !disabled && label !== undefined && label !== null && label !== "";

  const clearTimer = () => {
    if (showTimerRef.current === null) return;
    window.clearTimeout(showTimerRef.current);
    showTimerRef.current = null;
  };

  const show = (delay = 180) => {
    if (!active) return;
    clearTimer();
    showTimerRef.current = window.setTimeout(() => setOpen(true), delay);
  };

  const hide = () => {
    clearTimer();
    setOpen(false);
  };

  const updatePosition = () => {
    const trigger = triggerRef.current;
    const tip = tooltipRef.current;
    if (!trigger || !tip) return;
    // CSS zoom on <html>: getBoundingClientRect() returns visual pixels;
    // style.left/top and window.innerWidth/Height are CSS pixels.
    // Convert visual → CSS by dividing by zoom factor.
    const z = parseFloat(document.documentElement?.style.zoom) || 1;
    const r = trigger.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    // Convert visual px to CSS px (r, t) and keep edge constants in CSS px.
    const rx = r.left / z, ry = r.top / z, rw = r.width / z, rh = r.height / z;
    const rb = ry + rh, rr = rx + rw;
    const tw = t.width / z, th = t.height / z;
    const gap  = GAP  / z;
    const edge = EDGE_PAD / z;
    const aSize = ARROW_SIZE / z;
    const aPad  = ARROW_PAD / z;

    const space = {
      top: ry - edge,
      bottom: window.innerHeight - rb - edge,
      left: rx - edge,
      right: window.innerWidth - rr - edge,
    };
    let actualSide = side;
    if ((side === "top" || side === "bottom") && space[side] < th + gap + aSize) {
      const opposite = oppositeSide(side);
      if (space[opposite] > space[side]) actualSide = opposite;
    } else if ((side === "left" || side === "right") && space[side] < tw + gap + aSize) {
      const opposite = oppositeSide(side);
      if (space[opposite] > space[side]) actualSide = opposite;
    }

    let left =
      actualSide === "left"
        ? rx - tw - gap - aSize
        : actualSide === "right"
          ? rr + gap + aSize
          : rx + rw / 2 - tw / 2;
    let top =
      actualSide === "top"
        ? ry - th - gap - aSize
        : actualSide === "bottom"
          ? rb + gap + aSize
          : ry + rh / 2 - th / 2;

    left = clamp(left, edge, window.innerWidth - tw - edge);
    top = clamp(top, edge, window.innerHeight - th - edge);
    // Arrow offset in CSS pixels.
    const arrowX = clamp(rx + rw / 2 - left, aPad, tw - aPad);
    const arrowY = clamp(ry + rh / 2 - top, aPad, th - aPad);

    const next = { left, top, side: actualSide, arrowX, arrowY };
    setPosition((current) => (samePosition(current, next) ? current : next));
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, label, side]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => () => clearTimer(), []);

  const triggerClass = `tooltip-trigger${fill ? " tooltip-trigger--fill" : ""}${block ? " tooltip-trigger--block" : ""}${className ? ` ${className}` : ""}`;
  const setTriggerRef = (node: HTMLElement | null) => {
    triggerRef.current = node;
  };
  const triggerProps = {
    className: triggerClass,
    "aria-describedby": open ? id : undefined,
    onMouseEnter: () => show(),
    onMouseLeave: hide,
    onPointerDownCapture: hide,
    onFocus: () => show(0),
    onBlur: hide,
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape" || event.key === "Enter" || event.key === " ") hide();
    },
  };

  return (
    <>
      {block ? <div ref={setTriggerRef} {...triggerProps}>{children}</div> : <span ref={setTriggerRef} {...triggerProps}>{children}</span>}
      {open &&
        active &&
        createPortal(
          <div
            id={id}
            ref={tooltipRef}
            className={`tooltip tooltip--${position.side}`}
            role="tooltip"
            style={{
              left: position.left,
              top: position.top,
              "--tooltip-arrow-x": `${position.arrowX}px`,
              "--tooltip-arrow-y": `${position.arrowY}px`,
            } as CSSProperties}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}
