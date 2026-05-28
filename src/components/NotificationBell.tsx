'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, Check, ExternalLink, Loader2, MessageSquare, ShieldAlert, X, GripVertical } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatDistanceToNow } from 'date-fns';

type Notification = {
  id: string;
  title: string | null;
  content: string;
  type: 'system' | 'mention' | 'reply' | 'moderation';
  link: string | null;
  is_read: boolean;
  created_at: string;
};

export default function NotificationBell() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Dragging state
  const [position, setPosition] = useState({ x: 24, y: 24 }); // Initial top-right offset
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const fetchNotifications = async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20);
    
    setNotifications((data ?? []) as Notification[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchNotifications();
    if (!profile) return;

    const channel = supabase
      .channel(`notifs:${profile.id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications', 
        filter: `user_id=eq.${profile.id}` 
      }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, supabase]);

  // Dragging Logic
  const onMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      // Calculate position from right and top (sticky)
      const newX = window.innerWidth - e.clientX - (48 - dragOffset.x);
      const newY = e.clientY - dragOffset.y;
      setPosition({ x: Math.max(0, newX), y: Math.max(0, newY) });
    };

    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const markRead = async (id: string) => {
     await supabase.from('notifications').update({ is_read: true }).eq('id', id);
     fetchNotifications();
  };

  const markAllRead = async () => {
     if (!profile) return;
     await supabase.from('notifications').update({ is_read: true }).eq('user_id', profile.id);
     fetchNotifications();
  };

  const deleteNotif = async (id: string) => {
     await supabase.from('notifications').delete().eq('id', id);
     fetchNotifications();
  };

  return (
    <div 
      className="fixed z-40 transition-shadow duration-200" 
      style={{ right: `${position.x}px`, top: `${position.y}px` }}
    >
      <div className={`relative flex items-center gap-1 p-1 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xl ${isDragging ? 'shadow-2xl scale-105' : ''}`}>
        <button 
          onMouseDown={onMouseDown}
          className="p-2 text-muted hover:text-primary cursor-move shrink-0"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button 
          onClick={() => setOpen(!open)}
          className={`relative p-3 rounded-xl transition-all ${unreadCount > 0 ? 'bg-[var(--accent)] text-white shadow-lg' : 'bg-[var(--surface-elevated)] text-muted hover:text-primary'}`}
        >
          <Bell className={`h-5 w-5 ${unreadCount > 0 ? 'animate-bounce' : ''}`} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-background shadow-sm">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-4 w-80 max-h-[500px] overflow-hidden flex flex-col surface-card shadow-2xl z-50 animate-in fade-in slide-in-from-top-4 duration-200 border border-[var(--border)] rounded-2xl">
            <header className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-elevated)]">
               <h3 className="text-[10px] font-bold uppercase tracking-widest text-primary">Notifications</h3>
               {unreadCount > 0 && (
                 <button onClick={markAllRead} className="text-[10px] font-bold text-sky-500 hover:text-sky-400 uppercase tracking-tighter">Mark all read</button>
               )}
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
               {loading && notifications.length === 0 ? (
                 <div className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted/20" /></div>
               ) : notifications.length === 0 ? (
                 <div className="p-10 text-center space-y-3">
                    <BellOff className="h-8 w-8 text-muted/10 mx-auto" />
                    <p className="text-xs text-muted font-bold uppercase tracking-wider">Quiet in here...</p>
                 </div>
               ) : (
                 notifications.map(n => (
                   <div key={n.id} className={`p-4 border-b border-[var(--border)] relative group transition-colors ${!n.is_read ? 'bg-[var(--accent-soft)]/30' : 'hover:bg-[var(--surface-elevated)]'}`}>
                      <div className="flex gap-3">
                         <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                            n.type === 'moderation' ? 'bg-red-500/10 text-red-500' :
                            n.type === 'system' ? 'bg-sky-500/10 text-sky-500' :
                            'bg-amber-500/10 text-amber-500'
                         }`}>
                            {n.type === 'moderation' ? <ShieldAlert className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                         </div>
                         <div className="min-w-0 flex-1">
                            {n.title && <p className="text-xs font-bold text-primary truncate">{n.title}</p>}
                            <p className="text-xs text-muted mt-0.5 leading-relaxed">{n.content}</p>
                            <p className="text-[9px] text-muted mt-2 font-bold uppercase">{formatDistanceToNow(new Date(n.created_at))} ago</p>
                         </div>
                      </div>
                      
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         {!n.is_read && <button onClick={() => markRead(n.id)} className="p-1 hover:bg-emerald-500/10 text-emerald-500 rounded transition"><Check className="h-3 w-3" /></button>}
                         <button onClick={() => deleteNotif(n.id)} className="p-1 hover:bg-red-500/10 text-red-500 rounded transition"><X className="h-3 w-3" /></button>
                      </div>

                      {n.link && (
                         <a href={n.link} className="absolute inset-0 z-10" onClick={() => { markRead(n.id); setOpen(false); }} />
                      )}
                   </div>
                 ))
               )}
            </div>

            <footer className="p-3 bg-[var(--surface-elevated)] border-t border-[var(--border)] text-center">
               <button className="text-[10px] font-bold text-muted uppercase tracking-widest hover:text-primary transition">View history</button>
            </footer>
          </div>
        </>
      )}
    </div>
  );
}
