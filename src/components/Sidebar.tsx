'use client';

import React, { useState, useEffect } from 'react';
import {
  Bot,
  Bug,
  ChevronRight,
  Database,
  Flag,
  Globe,
  Home,
  Lock,
  LockOpen,
  LogOut,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shield,
  Sun,
  Users
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import Logo from './Logo';

export type HubView =
  | 'home'
  | 'dms'
  | 'groups'
  | 'discover'
  | 'settings'
  | 'admin'
  | 'bug_report'
  | 'bot_workspace'
  | 'admin_users'
  | 'admin_chats'
  | 'admin_bots'
  | 'admin_reports'
  | 'admin_updates'
  | 'admin_settings';

export default function Sidebar({
  onNavigate,
  onSelectChat,
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
  const [collapsed, setCollapsed] = useState(false);
  const [locked, setLocked] = useState(false);

  const isAdminView = currentView.startsWith('admin');
  const canOpenAdmin = profile?.role === 'admin' || profile?.role === 'owner';

  useEffect(() => {
    if (!locked && (currentChatId || currentView === 'settings')) {
      setCollapsed(true);
    } else if (!locked && !currentChatId && currentView !== 'settings') {
      setCollapsed(false);
    }
  }, [currentChatId, currentView, locked]);

  const menuItems: { icon: React.ElementType; label: string; id: HubView }[] = isAdminView
    ? [
        { icon: Users, label: 'Manage Users', id: 'admin_users' },
        { icon: MessageSquare, label: 'Manage Chats', id: 'admin_chats' },
        { icon: Bot, label: 'Bot Requests', id: 'admin_bots' },
        { icon: Flag, label: 'Reports & Bugs', id: 'admin_reports' },
        { icon: Database, label: 'Update Logs', id: 'admin_updates' },
        { icon: Settings, label: 'Admin Settings', id: 'admin_settings' },
      ]
    : [
        { icon: Home, label: 'Home', id: 'home' },
        { icon: MessageSquare, label: 'DMs', id: 'dms' },
        { icon: Users, label: 'Groups', id: 'groups' },
        { icon: Globe, label: 'Discover', id: 'discover' },
        { icon: Bot, label: 'Bots', id: 'bot_workspace' },
        { icon: Bug, label: 'Report Bug', id: 'bug_report' },
      ];

  const visibleItems = menuItems;

  return (
    <aside
      className={`flex h-screen shrink-0 flex-col border-r border-[var(--border)] bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out ${
        collapsed ? 'w-20' : 'w-72'
      } ${isAdminView ? 'border-red-500/20' : ''}`}
    >
      <div className={`flex shrink-0 items-center gap-2 ${collapsed ? 'flex-col p-2' : 'justify-between p-3'}`}>
        <button
          type="button"
          onClick={() => onNavigate('home')}
          aria-label="Go to home"
          title="Home"
          className={`flex min-w-0 items-center gap-3 rounded-xl transition hover:bg-[var(--surface-elevated)] ${collapsed ? 'justify-center p-1' : 'p-1 pr-3'}`}
        >
          <Logo className={`${collapsed ? 'h-8 w-8' : 'h-11 w-11'} shrink-0`} />
          {!collapsed && (
            <div className="min-w-0 text-left">
              <h1 className="truncate text-lg font-semibold text-primary">{isAdminView ? 'Admin Hub' : 'Raigon'}</h1>
              <p className="text-xs text-muted font-medium">{isAdminView ? 'System Controls' : 'Chat Hub'}</p>
            </div>
          )}
        </button>
        <div className={`flex items-center gap-2 ${collapsed ? 'flex-col' : ''}`}>
          {!collapsed && (
            <button
              type="button"
              onClick={() => setLocked(!locked)}
              aria-label={locked ? 'Unlock sidebar' : 'Lock sidebar'}
              className={`ui-button secondary sidebar-icon-button h-9 w-9 p-0 ${locked ? 'text-yellow-500 dark:text-sky-400' : 'text-muted'}`}
              title={locked ? "Unlock Sidebar" : "Lock Sidebar"}
            >
              {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`ui-button secondary sidebar-icon-button p-0 ${collapsed ? 'h-8 w-8' : 'h-9 w-9'}`}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <nav className={`min-h-0 flex-1 space-y-1 px-3 py-1 ${collapsed ? 'overflow-hidden' : 'overflow-y-auto custom-scrollbar'}`}>
        {visibleItems.map((item) => {
          const selected = currentView === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-label={item.label}
              title={collapsed ? item.label : undefined}
              className={`flex w-full items-center rounded-lg text-left text-sm font-semibold transition ${
                selected ? (isAdminView ? 'bg-red-600 text-white shadow-lg' : 'bg-[var(--accent)] text-white shadow-lg') : 'text-muted hover:bg-[var(--surface-elevated)] hover:text-primary'
              } ${collapsed ? 'h-8 justify-center px-0' : 'gap-3 px-3 py-2.5'}`}
            >
              <item.icon className={collapsed ? 'h-5 w-5' : 'h-5 w-5'} />
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && selected && <ChevronRight className="ml-auto h-3 w-3 opacity-50" />}
            </button>
          );
        })}
      </nav>

      <div className={`shrink-0 border-t border-[var(--border)] space-y-2 ${collapsed ? 'p-2' : 'p-3'}`}>
        <div className={`items-center gap-2.5 ${collapsed ? 'hidden' : 'flex px-1'}`}>
          <div className="relative shrink-0">
            <div className={`${collapsed ? 'h-9 w-9 text-sm' : 'h-10 w-10 text-base'} flex items-center justify-center rounded-lg bg-[var(--accent)] font-semibold uppercase text-white`}>
              {profile?.display_name?.[0] || profile?.username?.[0] || '?'}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-emerald-500" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-primary">{profile?.display_name || profile?.username}</p>
              <p className="truncate text-xs text-muted">{profile?.role}</p>
            </div>
          )}
          {!isAdminView && canOpenAdmin && (
             <button onClick={() => onNavigate('admin_users')} className="ui-button secondary sidebar-icon-button h-9 w-9 p-0 text-red-400 shrink-0" aria-label="Admin dashboard" title="Admin dashboard">
               <Shield className="h-4 w-4" />
             </button>
          )}
        </div>

        <div className={`grid gap-1.5 ${collapsed ? 'grid-cols-1' : 'grid-cols-3'}`}>
          <button onClick={toggleTheme} className={`ui-button secondary sidebar-icon-button p-0 ${collapsed ? 'h-8' : 'h-9'}`} title="Toggle Theme" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button onClick={() => onNavigate('settings')} className={`ui-button secondary sidebar-icon-button p-0 ${collapsed ? 'h-8' : 'h-9'}`} title="Settings" aria-label="Settings">
            <Settings className="h-4 w-4" />
          </button>
          <button onClick={signOut} className={`ui-button secondary sidebar-icon-button p-0 text-red-500 hover:bg-red-500/10 ${collapsed ? 'h-8' : 'h-9'}`} title="Sign Out" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
