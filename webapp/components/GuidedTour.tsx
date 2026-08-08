"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export interface TourStep {
  title: string;
  body: React.ReactNode;
  target?: string; // data-tour selector to spotlight; omit for centered
  action?: () => void; // drives app state on entering the step
  pad?: number; // spotlight padding
}

interface Props {
  open: boolean;
  steps: TourStep[];
  onClose: () => void;
}

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;

export default function GuidedTour({ open, steps, onClose }: Props) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const step = steps[idx];

  // Find + measure the target element (polling, since app state/data loads async).
  const locate = useCallback((selector?: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!selector) {
      setRect(null);
      return;
    }
    let tries = 0;
    const tick = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }
      }
      if (++tries > 24) {
        setRect(null);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    };
    tick();
    pollRef.current = setInterval(tick, 150);
  }, []);

  // On entering a step: run its action, then locate the target.
  useEffect(() => {
    if (!open) return;
    step?.action?.();
    const t = setTimeout(() => locate(step?.target), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idx]);

  // Keep the spotlight aligned on resize/scroll.
  useEffect(() => {
    if (!open) return;
    const on = () => step?.target && locate(step.target);
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
    };
  }, [open, step, locate]);

  useEffect(() => {
    if (!open) setIdx(0);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx((v) => Math.min(steps.length - 1, v + 1));
      if (e.key === "ArrowLeft") setIdx((v) => Math.max(0, v - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, steps.length, onClose]);

  if (!open) return null;
  const last = idx === steps.length - 1;
  const pad = step?.pad ?? PAD;

  // Spotlight hole geometry.
  const hole = rect
    ? {
        top: Math.max(0, rect.top - pad),
        left: Math.max(0, rect.left - pad),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // Place the card near the hole (or centered).
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const CARD_W = 340;
  let cardStyle: React.CSSProperties = {
    left: vw / 2 - CARD_W / 2,
    top: vh / 2 - 120,
  };
  if (hole) {
    const spaceRight = vw - (hole.left + hole.width);
    const spaceLeft = hole.left;
    let left: number;
    let top = Math.min(Math.max(12, hole.top), vh - 240);
    if (spaceRight > CARD_W + 24) left = hole.left + hole.width + 16;
    else if (spaceLeft > CARD_W + 24) left = hole.left - CARD_W - 16;
    else {
      // place below or above, centered horizontally over the hole
      left = Math.min(Math.max(12, hole.left + hole.width / 2 - CARD_W / 2), vw - CARD_W - 12);
      top = hole.top + hole.height + 16 < vh - 220 ? hole.top + hole.height + 16 : Math.max(12, hole.top - 230);
    }
    cardStyle = { left, top };
  }

  // Four blurred panes around the hole (everything except the target is dimmed+blurred).
  const Pane = ({ s }: { s: React.CSSProperties }) => (
    <div className="fixed bg-slate-900/55 backdrop-blur-[3px] z-[140]" style={s} />
  );

  return (
    <>
      {hole ? (
        <>
          <Pane s={{ top: 0, left: 0, width: vw, height: hole.top }} />
          <Pane s={{ top: hole.top + hole.height, left: 0, width: vw, height: vh - (hole.top + hole.height) }} />
          <Pane s={{ top: hole.top, left: 0, width: hole.left, height: hole.height }} />
          <Pane s={{ top: hole.top, left: hole.left + hole.width, width: vw - (hole.left + hole.width), height: hole.height }} />
          <div
            className="fixed z-[142] rounded-lg ring-2 ring-blue-500 pointer-events-none"
            style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-[3px] z-[140]" />
      )}

      {/* Card */}
      <div
        className="fixed z-[150] bg-white rounded-xl shadow-2xl w-[340px] max-w-[calc(100vw-24px)]"
        style={cardStyle}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b">
          <span className="text-xs font-medium text-gray-400">
            Rondleiding · {idx + 1}/{steps.length}
          </span>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded" aria-label="Sluiten">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          <h2 className="text-base font-semibold mb-1.5">{step.title}</h2>
          <div className="text-sm text-gray-700 space-y-2">{step.body}</div>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5 border-t bg-gray-50">
          <button
            onClick={() => setIdx((v) => Math.max(0, v - 1))}
            disabled={idx === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 text-sm rounded-lg disabled:opacity-40 hover:bg-gray-200"
          >
            <ChevronLeft className="h-4 w-4" /> Vorige
          </button>
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === idx ? "bg-blue-600" : "bg-gray-300"}`} />
            ))}
          </div>
          {last ? (
            <button onClick={onClose} className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
              Klaar
            </button>
          ) : (
            <button
              onClick={() => setIdx((v) => Math.min(steps.length - 1, v + 1))}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Volgende <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
