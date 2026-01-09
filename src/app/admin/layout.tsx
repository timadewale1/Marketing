"use client";

import { useState, useEffect, useLayoutEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  BarChart2,
  FileCheck,
  Wallet,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { Bell, Megaphone } from "lucide-react";
import toast from "react-hot-toast";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, orderBy, limit, Timestamp, updateDoc, doc, writeBatch } from "firebase/firestore";
import { useRef } from "react";
import { createPortal } from "react-dom";

// Admin password is stored in server environment (process.env.ADMIN_PASSWORD).
// This client layout uses server routes to authenticate and manage an httpOnly cookie session.

interface AdminLayoutProps {
  children: React.ReactNode;
}

interface AdminNotification {
  id: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: Timestamp;
}

const NAVIGATION = [
  {
    name: "Overview",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    name: "Users",
    href: "/admin/users",
    icon: Users,
  },
  {
    name: "Tasks",
    href: "/admin/campaigns",
    icon: BarChart2,
  },
  {
    name: "Notifications",
    href: "/admin/notifications",
    icon: Bell,
  },
  {
    name: "Direct Ads",
    href: "/admin/direct-ad-requests",
    icon: Megaphone,
  },
  {
    name: "Submissions",
    href: "/admin/submissions",
    icon: FileCheck,
  },
  {
    name: "Withdrawals",
    href: "/admin/withdrawals",
    icon: Wallet,
  },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [recentNotes, setRecentNotes] = useState<AdminNotification[]>([]);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);

  const handleLogin = async () => {
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "include",
      });
      if (res.ok) {
        setAuthenticated(true);
        setPassword("");
        toast.success("Admin access granted");
      } else {
        setAuthenticated(false);
        const data = await res.json().catch(() => ({}));
        toast.error((data && data.message) || "Incorrect password");
      }
    } catch (err) {
      console.error(err);
      toast.error("Login failed");
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/status", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setAuthenticated(!!data?.authenticated);
        } else {
          setAuthenticated(false);
        }
      } catch (err) {
        console.error(err);
        setAuthenticated(false);
      }
    })();
  }, []);

  // subscribe to unread admin notifications
  useEffect(() => {
    const unreadQ = query(collection(db, "adminNotifications"), where("read", "==", false));
    const unsubUnread = onSnapshot(unreadQ, (snap) => setUnreadCount(snap.size || 0), (err) => console.error('adminNotifications listen failed', err));

    // Also keep a small recent list for the bell dropdown
    const recentQ = query(collection(db, "adminNotifications"), orderBy("createdAt", "desc"), limit(6));
    const unsubRecent = onSnapshot(recentQ, (snap) => setRecentNotes(snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) } as AdminNotification))), (err) => console.error('adminNotifications recent listen failed', err));

    return () => { unsubUnread(); unsubRecent(); };
  }, []);

  // close dropdown on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // compute dropdown bounding rect when opened
  useLayoutEffect(() => {
    if (dropdownOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      setDropdownRect(rect);
    }
  }, [dropdownOpen]);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'adminNotifications', id), { read: true });
      setRecentNotes((prev) => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('markAsRead failed', err);
      toast.error('Could not mark notification as read');
    }
  };

  const markAllRead = async () => {
    try {
      const batch = writeBatch(db);
      let any = false;
      recentNotes.forEach(n => {
        if (!n.read) { batch.update(doc(db, 'adminNotifications', n.id), { read: true }); any = true; }
      });
      if (!any) return;
      await batch.commit();
      setRecentNotes(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('markAllRead failed', err);
      toast.error('Could not mark all as read');
    }
  };

  const handleNotificationClick = async (n: AdminNotification) => {
    try {
      if (!n.read) await markAsRead(n.id);
    } finally {
      if (n.link) window.location.href = n.link as string;
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900">
        <Card className="p-8 max-w-md mx-auto w-full">
          <h2 className="text-xl font-bold mb-4 text-stone-800">Admin Login</h2>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter admin password"
            className="mb-4"
          />
          <Button
            onClick={handleLogin}
            className="bg-amber-500 text-stone-900 font-semibold w-full"
          >
            Login
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-stone-100 via-amber-50 to-stone-200">
      {/* Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col">
        <div className="flex flex-col flex-grow pt-5 bg-white/70 backdrop-blur border-r border-stone-200">
          <div className="flex items-center flex-shrink-0 px-4 mb-5">
            <div className="flex items-center gap-2">
              <span className="bg-amber-500 text-stone-900 px-2 py-1 rounded text-sm font-bold">BT</span>
              <h1 className="text-lg font-semibold text-stone-900">Admin</h1>
            </div>
          </div>
          <div className="flex flex-col flex-1">
            <nav className="flex-1 px-2 pb-4 space-y-1">
              {NAVIGATION.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`group flex items-center px-4 py-3 text-sm font-medium rounded-lg ${
                      isActive
                        ? "bg-amber-100 text-amber-700"
                        : "text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    <item.icon
                      className={`mr-3 h-5 w-5 flex-shrink-0 ${
                        isActive ? "text-amber-600" : "text-stone-400"
                      }`}
                    />
                      <div className="flex items-center gap-2">
                        <span>{item.name}</span>
                        {item.href === "/admin/notifications" && unreadCount > 0 && (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500 text-white">{unreadCount}</span>
                        )}
                      </div>
                  </Link>
                );
              })}
            </nav>

            {/* Logout Button */}
            <div className="px-2 pb-4">
              <Button
                onClick={() => {
                  // call server logout to clear cookie
                  fetch("/api/admin/logout", { method: "POST", credentials: "include" })
                    .finally(() => {
                      setAuthenticated(false);
                      setPassword("");
                      toast.success("Logged out successfully");
                    });
                }}
                variant="ghost"
                className="w-full flex items-center justify-start px-4 py-3 text-sm font-medium text-stone-700 hover:bg-stone-100 rounded-lg"
              >
                <LogOut className="mr-3 h-5 w-5 text-stone-400" />
                Log Out
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1">
        <div className="flex items-center justify-between p-4 md:p-4 border-b border-stone-200 bg-white/60 backdrop-blur">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              className="md:hidden inline-flex items-center justify-center p-2 rounded-lg hover:bg-stone-100"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5 text-stone-700" />
            </button>
            <div className="hidden md:flex items-center gap-2">
              <span className="bg-amber-500 text-stone-900 px-2 py-1 rounded text-sm font-bold">BT</span>
              <h1 className="text-sm font-semibold text-stone-900">Admin</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
              <div className="relative" ref={dropdownRef}>
                <button onClick={(e) => { e.stopPropagation(); setDropdownOpen(!dropdownOpen); }} className="relative p-2 rounded-lg hover:bg-stone-100">
                  <Bell className="text-stone-700" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-xs px-1.5 py-0.5">{unreadCount}</span>
                  )}
                </button>
                {dropdownOpen && dropdownRect && createPortal(
                  <div style={{ position: 'fixed', top: dropdownRect.bottom + 8, right: Math.max(8, window.innerWidth - dropdownRect.right), width: 384 }} className="bg-white border rounded-md shadow-lg z-[99999]">
                    <div className="p-3 border-b">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Notifications</h4>
                        <div className="flex items-center gap-3">
                          <button onClick={markAllRead} className="text-sm text-stone-600 hover:text-stone-800">Mark all read</button>
                          <Link href="/admin/notifications" className="text-sm text-amber-600">View all</Link>
                        </div>
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {recentNotes.length === 0 ? (
                        <div className="p-4 text-sm text-stone-600">No notifications</div>
                      ) : (
                        recentNotes.map(n => (
                          <Link key={n.id} href={n.link || '#'} onClick={(e) => { e.preventDefault(); handleNotificationClick(n); }} className="block p-3 hover:bg-stone-50 border-b text-sm">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="font-medium">{n.title}</div>
                                <div className="text-xs text-stone-600 mt-1 truncate">{n.body}</div>
                              </div>
                              {!n.read && <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); markAsRead(n.id); }} className="ml-3 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500 text-white">Mark</button>}
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>, document.body)
                }
              </div>
            </div>
        </div>
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">{children}</main>

        {/* Mobile notification button (visible on small screens) */}
        <div className="md:hidden">
          <Link href="/admin/notifications">
            <button aria-label="Notifications" className="fixed bottom-4 right-4 z-50 bg-amber-500 text-white p-3 rounded-full shadow-lg relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-white text-amber-600 text-xs px-1.5 py-0.5 font-semibold">{unreadCount}</span>
              )}
            </button>
          </Link>
        </div>
        {/* Mobile Sidebar Overlay */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-white/95 backdrop-blur border-r border-stone-200 p-4 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="bg-amber-500 text-stone-900 px-2 py-1 rounded text-sm font-bold">BT</span>
                  <h1 className="text-lg font-semibold text-stone-900">Admin</h1>
                </div>
                <button onClick={() => setMobileOpen(false)} className="p-2 rounded-lg hover:bg-stone-100" aria-label="Close menu"><X className="w-5 h-5 text-stone-700" /></button>
              </div>

              <nav className="space-y-2">
                {NAVIGATION.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center px-3 py-3 text-sm rounded-lg ${isActive ? 'bg-amber-100 text-amber-700' : 'text-stone-700 hover:bg-stone-100'}`}
                    >
                      <item.icon className={`mr-3 h-5 w-5 ${isActive ? 'text-amber-600' : 'text-stone-400'}`} />
                      <span>{item.name}</span>
                      {item.href === "/admin/notifications" && unreadCount > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500 text-white">{unreadCount}</span>
                      )}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-6">
                <Button
                  onClick={() => {
                    fetch('/api/admin/logout', { method: 'POST', credentials: 'include' })
                      .finally(() => {
                        setAuthenticated(false);
                        setPassword('');
                        setMobileOpen(false);
                        toast.success('Logged out successfully');
                      });
                  }}
                  variant="ghost"
                  className="w-full flex items-center justify-start px-3 py-3 text-sm font-medium text-stone-700 hover:bg-stone-100 rounded-lg"
                >
                  <LogOut className="mr-3 h-5 w-5 text-stone-400" />
                  Log Out
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}