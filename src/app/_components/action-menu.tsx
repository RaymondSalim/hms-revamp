"use client";

import { useState, useRef, useEffect } from "react";

export interface ActionItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger" | "success" | "warning" | "info";
}

interface ActionMenuProps {
  items: ActionItem[];
  maxInline?: number;
}

const variantStyles: Record<string, { color: string; bg: string; hoverBg: string }> = {
  default: {
    color: "var(--color-accent)",
    bg: "var(--color-accent-light)",
    hoverBg: "var(--color-accent)",
  },
  danger: {
    color: "#DC2626",
    bg: "#FEF2F2",
    hoverBg: "#DC2626",
  },
  success: {
    color: "#059669",
    bg: "#D1FAE5",
    hoverBg: "#059669",
  },
  warning: {
    color: "#D97706",
    bg: "#FEF3C7",
    hoverBg: "#D97706",
  },
  info: {
    color: "#2563EB",
    bg: "#DBEAFE",
    hoverBg: "#2563EB",
  },
};

function IconButton({ item }: { item: ActionItem }) {
  const style = variantStyles[item.variant ?? "default"];
  return (
    <button
      onClick={item.onClick}
      title={item.label}
      className="p-1.5 rounded-lg transition-colors duration-150"
      style={{ color: style.color, backgroundColor: style.bg }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = style.hoverBg;
        e.currentTarget.style.color = "white";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = style.bg;
        e.currentTarget.style.color = style.color;
      }}
    >
      {item.icon}
    </button>
  );
}

export function ActionMenu({ items, maxInline = 2 }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (items.length === 0) return null;

  if (items.length <= maxInline) {
    return (
      <div className="flex items-center gap-1">
        {items.map((item, i) => (
          <IconButton key={i} item={item} />
        ))}
      </div>
    );
  }

  const inlineItems = items.slice(0, maxInline);
  const overflowItems = items.slice(maxInline);

  return (
    <div className="flex items-center gap-1" ref={menuRef}>
      {inlineItems.map((item, i) => (
        <IconButton key={i} item={item} />
      ))}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          title="Lainnya"
          className="p-1.5 rounded-lg transition-colors duration-150"
          style={{
            color: "var(--color-text-secondary)",
            backgroundColor: open ? "var(--color-accent-light)" : "transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-accent-light)";
          }}
          onMouseLeave={(e) => {
            if (!open) e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
        {open && (
          <div
            className="absolute right-0 top-full mt-1 w-40 rounded-lg border py-1 z-50"
            style={{
              backgroundColor: "var(--color-bg-card)",
              borderColor: "var(--color-border)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            {overflowItems.map((item, i) => {
              const style = variantStyles[item.variant ?? "default"];
              return (
                <button
                  key={i}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors duration-100"
                  style={{ color: style.color }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = style.bg;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export const Icons = {
  edit: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
    </svg>
  ),
  delete: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  ),
  checkIn: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  ),
  checkOut: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
    </svg>
  ),
  endBooking: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
    </svg>
  ),
  detail: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
    </svg>
  ),
  addItem: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
    </svg>
  ),
  status: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
  money: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
      <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
    </svg>
  ),
};
