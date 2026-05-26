'use client';

import React from 'react';
import { Globe, Home, LogOut, MessageSquare, Moon, PanelLeftClose, PanelLeftOpen, Settings, Shield, Sun, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import Logo from './Logo';

type HubView = 'home' | 'dms' | 'groups' | 'discover' | 'settings' | 'admin';

export default function Sidebar({
  onNavigate,
  currentView,
  currentChatId,
}: {
  onNavigate: (view: HubView) => void;
  onSelectChat: (id: string) => void;
  currentView: string;
  currentChatId?: string;
}) {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    if (currentChatId || currentView === 'settings' || currentView === 'admin') {
      // Auto-collapse after navigation so focused views get more room.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(true);
    }
  }, [currentChatId, currentView]);

  const menuItems: { icon: React.ElementType; label: string; id: HubView }[] = [
    { icon: Home, label: 'Home', id: 'home' },
    { icon: MessageSquare, label: 'DMs', id: 'dms' },
    { icon: Users, label: 'Groups', id: 'groups' },
    { icon: Globe, label: 'Discover', id: 'discover' },
  ];

  return (
    <aside
      className={`flex h-screen shrink-0 flex-col border-r border-[var(--border)] bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out ${
        collapsed ? 'w-20' : 'w-72'
      }`}
    >
      <div className={`flex shrink-0 items-center gap-3 p-4 ${collapsed ? 'flex-col' : 'justify-between'}`}>
        <div className={`flex min-w-0 items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <Logo className="h-11 w-11 shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-primary">Raigon</h1>
              <p className="text-xs text-muted">Chat Hub</p>
            </div>
          )}
        </div>
        <div className={`flex items-center gap-2 ${collapsed ? 'flex-col' : ''}`}>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="ui-button secondary h-9 w-9 p-0"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
          <button type="button" onClick={toggleTheme} aria-label="Toggle theme" className="ui-button secondary h-9 w-9 p-0">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {profile?.role === 'admin' && (
            <button type="button" onClick={() => onNavigate('admin')} aria-label="Platform admin" className="ui-button secondary h-9 w-9 p-0">
              <Shield className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 px-4 py-2">
        {menuItems.map((item) => {
          const selected = currentView === item.id && !currentChatId;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-label={item.label}
              title={collapsed ? item.label : undefined}
              className={`flex w-full items-center rounded-lg py-2.5 text-left text-sm font-semibold transition ${
                selected ? 'bg-[var(--accent)] text-white shadow-lg shadow-sky-950/20' : 'text-muted hover:bg-[var(--surface-elevated)] hover:text-primary'
              } ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'}`}
            >
              <item.icon className="h-5 w-5" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-[var(--border)] p-4">
        <div className={`mb-4 flex items-center gap-3 ${collapsed ? 'flex-col px-0' : 'px-2'}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)] font-bold uppercase text-white">
            {profile?.display_name?.[0] || profile?.username?.[0] || '?'}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-primary">{profile?.display_name || profile?.username}</p>
              <p className="truncate text-xs text-muted">{profile?.role}</p>
            </div>
          )}
          <button type="button" onClick={() => onNavigate('settings')} aria-label="Account settings" className="ui-button secondary h-9 w-9 p-0">
            <Settings className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={signOut}
          aria-label="Sign out"
          title={collapsed ? 'Sign out' : undefined}
          className={`flex w-full items-center rounded-lg py-2 text-muted transition hover:bg-[var(--danger-soft)] hover:text-red-500 ${
            collapsed ? 'justify-center px-0' : 'gap-3 px-3'
          }`}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="text-sm font-semibold">Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
