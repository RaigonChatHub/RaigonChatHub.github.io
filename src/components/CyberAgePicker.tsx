'use client';

import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

export default function CyberAgePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [viewDate, setViewDate] = useState(new Date());
  const selectedDate = useMemo(() => value ? new Date(value) : null, [value]);

  const daysInMonth = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    
    return { days, firstDay };
  }, [viewDate]);

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  const changeMonth = (offset: number) => {
    const next = new Date(viewDate);
    next.setMonth(next.getMonth() + offset);
    setViewDate(next);
  };

  const changeYear = (offset: number) => {
    const next = new Date(viewDate);
    next.setFullYear(next.getFullYear() + offset);
    setViewDate(next);
  };

  return (
    <div className="p-4 bg-[var(--surface-elevated)] rounded-2xl border border-[var(--border)] shadow-xl animate-in zoom-in-95 duration-200">
      <header className="flex items-center justify-between mb-4 px-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => changeYear(-1)} className="p-1 hover:bg-white/5 rounded text-muted transition"><ChevronLeft className="h-3 w-3" /></button>
          <span className="text-xs font-bold uppercase tracking-widest text-primary">{viewDate.getFullYear()}</span>
          <button type="button" onClick={() => changeYear(1)} className="p-1 hover:bg-white/5 rounded text-muted transition"><ChevronRight className="h-3 w-3" /></button>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => changeMonth(-1)} className="p-1 hover:bg-white/5 rounded text-muted transition"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-xs font-bold uppercase tracking-wider text-primary w-20 text-center">{months[viewDate.getMonth()]}</span>
          <button type="button" onClick={() => changeMonth(1)} className="p-1 hover:bg-white/5 rounded text-muted transition"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-1 text-center mb-2">
        {["S","M","T","W","T","F","S"].map(d => <span key={d} className="text-[10px] font-bold text-muted/50 uppercase">{d}</span>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: daysInMonth.firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
        {Array.from({ length: daysInMonth.days }).map((_, i) => {
          const day = i + 1;
          const isSelected = selectedDate?.getDate() === day && selectedDate?.getMonth() === viewDate.getMonth() && selectedDate?.getFullYear() === viewDate.getFullYear();
          const isToday = new Date().getDate() === day && new Date().getMonth() === viewDate.getMonth() && new Date().getFullYear() === viewDate.getFullYear();

          return (
            <button
              key={day}
              type="button"
              onClick={() => {
                const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
                onChange(d.toISOString().split('T')[0]);
              }}
              className={`h-8 w-8 rounded-lg text-xs font-semibold transition-all flex items-center justify-center ${
                isSelected ? 'bg-[var(--accent)] text-white shadow-lg scale-110' : 
                isToday ? 'border border-[var(--accent)] text-sky-500' :
                'text-muted hover:bg-white/5 hover:text-primary'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
