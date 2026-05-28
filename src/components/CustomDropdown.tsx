'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

type Option = {
  v: string;
  l: string;
};

export default function CustomDropdown({ 
  label, 
  value, 
  onChange, 
  options,
  className = ""
}: { 
  label: string; 
  value: string; 
  onChange: (v: string) => void; 
  options: Option[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find(o => o.v === value)?.l || value;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`space-y-1.5 relative ${className}`} ref={containerRef}>
      <label className="text-[10px] font-semibold uppercase text-muted tracking-wider px-1">{label}</label>
      
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full min-h-[44px] min-w-[140px] items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-2.5 text-sm font-semibold text-primary transition hover:border-[var(--accent)]/50 focus:border-[var(--accent)] shadow-sm"
      >
        <span className="truncate pr-2">{selectedLabel}</span>
        <ChevronDown className={`h-4 w-4 text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[100] mt-2 w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="max-h-60 overflow-y-auto custom-scrollbar p-1.5">
            {options.map((option) => (
              <button
                key={option.v}
                type="button"
                onClick={() => {
                  onChange(option.v);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${
                  value === option.v 
                    ? 'bg-[var(--accent)] text-white' 
                    : 'text-muted hover:bg-[var(--surface-elevated)] hover:text-primary'
                }`}
              >
                <span className="truncate">{option.l}</span>
                {value === option.v && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
