import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { getCssZoom } from "../lib/dpiScale";

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
    // CSS zoom on <html> changes getBoundingClientRect() (visual pixels)
    // but NOT window.innerWidth/innerHeight (CSS pixels).  Convert gBCR
    // values to CSS pixel space so they are comparable with innerWidth/Height.
    // Gap/pad constants are also divided by zoom so the visual distance
    // (gap between trigger and tooltip) stays the same at any zoom level.
    const z = getCssZoom();
    const r = trigger.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const rect   = { left: r.left / z, top: r.top / z, width: r.width / z, height: r.height / z, right: r.right / z, bottom: r.bottom / z };
    const tipRect = { width: t.width / z, height: t.height / z };
    const gap = GAP / z;
    const arrow = ARROW_SIZE / z;
    const edgePad = EDGE_PAD / z;
    const arrowPad = ARROW_PAD / z;
    const space = {
      top: rect.top - edgePad,
      bottom: window.innerHeight - rect.bottom - edgePad,
      left: rect.left - edgePad,
      right: window.innerWidth - rect.right - edgePad,
    };
    let actualSide = side;
    if ((side === "top" || side === "bottom") && space[side] < tipRect.height + gap + arrow) {
      const opposite = oppositeSide(side);
      if (space[opposite] > space[side]) actualSide = opposite;
    } else if ((side === "left" || side === "right") && space[side] < tipRect.width + gap + arrow) {
      const opposite = oppositeSide(side);
      if (space[opposite] > space[side]) actualSide = opposite;
    }

    let left =
      actualSide === "left"
        ? rect.left - tipRect.width - gap - arrow
        : actualSide === "right"
          ? rect.right + gap + arrow
          : rect.left + rect.width / 2 - tipRect.width / 2;
    let top =
      actualSide === "top"
        ? rect.top - tipRect.height - gap - arrow
        : actualSide === "bottom"
          ? rect.bottom + gap + arrow
          : rect.top + rect.height / 2 - tipRect.height / 2;

    left = clamp(left, edgePad, window.innerWidth - tipRect.width - edgePad);
    top = clamp(top, edgePad, window.innerHeight - tipRect.height - edgePad);
    // Arrow offset: trigger center (CSS px) - tooltip left (CSS px).
    const arrowX = clamp((r.left + r.width / 2) / z - left, arrowPad, t.width / z - arrowPad);
    const arrowY = clamp((r.top + r.height / 2) / z - top, arrowPad, t.height / z - arrowPad);

    const next = {
      left,
      top,
      side: actualSide,
      arrowX,
      arrowY,
    };
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
