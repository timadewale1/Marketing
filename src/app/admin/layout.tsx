"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import toast from "react-hot-toast";

// Admin password is stored in server environment (process.env.ADMIN_PASSWORD).
// This client layout uses server routes to authenticate and manage an httpOnly cookie session.

interface AdminLayoutProps {
  children: React.ReactNode;
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
                    {item.name}
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
        <main className="flex-1 p-8 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}