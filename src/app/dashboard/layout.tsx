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
        className="h-full bg-stone-900 text-white shadow-lg"
      >
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      </motion.div>

      {/* Main Content */}
      <div className="flex flex-col flex-1 bg-stone-50">
        <Topbar />
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
