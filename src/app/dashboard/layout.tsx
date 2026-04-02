"use client"

import { ReactNode, useState } from "react"
import Sidebar from "./sidebar"
import Topbar from './topbar'
import { motion } from "framer-motion"


export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Sidebar */}
      <motion.div
        initial={{ width: 240 }}
        animate={{ width: collapsed ? 80 : 240 }}
        transition={{ duration: 0.3 }}
        className="h-full shrink-0 bg-stone-900 text-white shadow-lg"
      >
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      </motion.div>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col bg-stone-50">
        <Topbar />
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
