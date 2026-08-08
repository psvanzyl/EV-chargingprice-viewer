"use client";

import { useState, useRef, useLayoutEffect, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

interface Props {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

// Small "?" info icon that shows a portal popover (so it never clips inside
// scrollable panels). Opens on hover and on click (touch-friendly).
export default function InfoTip({ title, children, className }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const WIDTH = 270;

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    let left = r.left + r.width / 2 - WIDTH / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - WIDTH - 8));
    setPos({ top: r.bottom + 6, left });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={title || "Uitleg"}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        className={`inline-flex items-center justify-center align-middle text-gray-400 hover:text-blue-600 ${className ?? ""}`}
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, width: WIDTH }}
            className="z-[200] bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 leading-relaxed"
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            {title && <div className="font-semibold mb-1">{title}</div>}
            <div className="text-gray-200 space-y-1">{children}</div>
          </div>,
          document.body,
        )}
    </>
  );
}
