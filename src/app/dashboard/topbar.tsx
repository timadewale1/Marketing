// import Image from "next/image"
// "use client"

// import { Bell, ChevronDown } from "lucide-react"
// import { useState } from "react"

// export default function Topbar() {
//   const [open, setOpen] = useState(false)

//   return (
//     <header className="flex items-center justify-between bg-stone-100 px-6 py-3 shadow-sm">
//       <h2 className="text-xl font-bold text-stone-800">Dashboard</h2>

//       <div className="flex items-center gap-6">
//         {/* Notifications */}
//         <button className="relative p-2 rounded-lg hover:bg-stone-200">
//           <Bell size={20} className="text-stone-600" />
//           <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-500"></span>
//         </button>

//         {/* User Dropdown */}
//         <div className="relative">
//           <button
//             onClick={() => setOpen(!open)}
//             className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg shadow-sm border hover:shadow-md"
//           >
//             <img
//               src="https://i.pravatar.cc/40"
//               alt="avatar"
//               className="w-8 h-8 rounded-full"
//             />
//             <span className="font-medium text-stone-700">John Doe</span>
//             <ChevronDown size={16} className="text-stone-500" />
//           </button>

//           {open && (
//             <div className="absolute right-0 mt-2 w-40 bg-white border rounded-lg shadow-lg">
//               <a className="block px-4 py-2 text-sm text-stone-700 hover:bg-stone-100" href="/profile">
//                 Profile
//               </a>
//               <a className="block px-4 py-2 text-sm text-stone-700 hover:bg-stone-100" href="/settings">
//                 Settings
//               </a>
//               <a className="block px-4 py-2 text-sm text-red-600 hover:bg-stone-100" href="/auth/sign-in">
//                 <Image
//                   src={user?.avatarUrl || "/default-avatar.png"}
//                   alt="Avatar"
//                   width={40}
//                   height={40}
//                   className="rounded-full object-cover border-2 border-primary"
//                 />
//       </div>
//     </header>
//   )
// }
