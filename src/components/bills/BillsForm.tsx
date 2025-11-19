// "use client"

// import React, { useEffect, useMemo, useState } from 'react'
// import { Input } from '@/components/ui/input'
// import { Button } from '@/components/ui/button'
// import { Label } from '@/components/ui/label'
// import toast from 'react-hot-toast'
// import Image from 'next/image'

// type Props = { onSuccess?: (res: any) => void }

// type Category = { name: string; slug: string }
// type Service = { name: string; slug: string }
// type Variation = { name: string; slug: string; price?: number; provider?: string }

// const PROVIDER_LOGOS: Record<string, string> = {
//   mtn: '/providers/mtn.svg',
//   airtel: '/providers/airtel.svg',
//   glo: '/providers/glo.svg',
//   '9mobile': '/providers/9mobile.svg',
// }

// export default function BillsForm({ onSuccess }: Props) {
//   const [categories, setCategories] = useState<Category[]>([])
//   const [services, setServices] = useState<Service[]>([])
//   const [variations, setVariations] = useState<Variation[]>([])

//   const [category, setCategory] = useState<string>('')
//   const [service, setService] = useState<string>('')
//   const [variation, setVariation] = useState<string>('')
//   const [identifier, setIdentifier] = useState('')
//   const [amount, setAmount] = useState('')
//   const [loading, setLoading] = useState(false)
//   const [validBiller, setValidBiller] = useState<any>(null)

//   useEffect(() => {
//     // load categories
//     fetch('/api/dataway/get-service-categories')
//       .then((r) => r.json())
//       .then((j) => {
//         const data = j?.result?.body?.data || j?.result?.body || j?.result
//         if (Array.isArray(data)) setCategories(data)
//       })
//       .catch((e) => console.error('failed load categories', e))
//   }, [])

//   useEffect(() => {
//     if (!category) return
//     // load services for category
//     fetch(`/api/dataway/get-services?slug=${encodeURIComponent(category)}`)
//       .then((r) => r.json())
//       .then((j) => {
//         const data = j?.result?.body?.data || j?.result?.body || j?.result
//         if (Array.isArray(data)) setServices(data)
//         else setServices([])
//       })
//       .catch((e) => console.error('failed load services', e))
//   }, [category])

//   useEffect(() => {
//     if (!service) return
//     fetch(`/api/dataway/get-service-variations?service_slug=${encodeURIComponent(service)}`)
//       .then((r) => r.json())
//       .then((j) => {
//         const data = j?.result?.body?.data || j?.result?.body || j?.result
//         if (Array.isArray(data)) setVariations(data)
//         else setVariations([])
//       })
//       .catch((e) => console.error('failed load variations', e))
//   }, [service])

//   const identifierLabel = useMemo(() => {
//     if (!category) return 'Identifier'
//     if (category.toLowerCase().includes('power') || category.toLowerCase().includes('electric')) return 'Meter Number'
//     if (category.toLowerCase().includes('tv')) return 'Smartcard Number'
//     if (category.toLowerCase().includes('data') || category.toLowerCase().includes('airtime')) return 'Phone Number'
//     return 'Identifier'
//   }, [category])

//   const handleValidate = async () => {
//     if (!service || !identifier) return toast.error('Please choose a service and enter customer number')
//     setLoading(true)
//     try {
//       const res = await fetch('/api/dataway/validate-biller', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_slug: service, biller_identifier: identifier, variation_slug: variation }) })
//       const j = await res.json()
//       if (!res.ok || !j?.ok) {
//         toast.error('Validation failed: ' + (j?.message || JSON.stringify(j)))
//         setValidBiller(null)
//       } else {
//         setValidBiller(j.result?.body || j.result)
//         toast.success('Biller validated')
//       }
//     } catch (err) {
//       console.error(err)
//       toast.error('Validation error')
//     } finally { setLoading(false) }
//   }

//   const genRef = () => `ADJ-${Date.now()}-${Math.floor(Math.random()*9000)+1000}`

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault()
//     if (!service || !identifier || !amount) return toast.error('Please complete required fields')
//     setLoading(true)
//     const reference = genRef()
//     try {
//       const res = await fetch('/api/dataway/vend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_slug: service, biller_identifier: identifier, variation_slug: variation || undefined, amount, reference }) })
//       const data = await res.json()
//       if (!res.ok || !data?.ok) {
//         toast.error('Payment failed: ' + (data?.message || JSON.stringify(data)))
//       } else {
//         toast.success('Payment request sent. Reference: ' + reference)
//         onSuccess?.(data)
//       }
//     } catch (err) {
//       console.error(err)
//       toast.error('Network error')
//     } finally { setLoading(false) }
//   }

//   return (
//     <form onSubmit={handleSubmit} className="space-y-4">
//       <div>
//         <Label>Category</Label>
//         <select value={category} onChange={(e) => { setCategory(e.target.value); setService(''); setVariation(''); }} className="w-full p-2 border rounded">
//           <option value="">Choose category</option>
//           {categories.map((c) => (
//             <option key={c.slug} value={c.slug}>{c.name}</option>
//           ))}
//         </select>
//       </div>

//       <div>
//         <Label>Service</Label>
//         <select value={service} onChange={(e) => { setService(e.target.value); setVariation('') }} className="w-full p-2 border rounded">
//           <option value="">Choose service</option>
//           {services.map((s) => (
//             <option key={s.slug} value={s.slug}>{s.name}</option>
//           ))}
//         </select>
//       </div>

//       <div>
//         <Label>Plan / Variant</Label>
//         <div className="grid grid-cols-1 gap-2">
//           {variations.length === 0 && <p className="text-sm text-stone-500">No plans available for this service</p>}
//           {variations.map((v: any) => (
//             <label key={v.slug} className={`flex items-center gap-3 p-2 border rounded cursor-pointer ${variation === v.slug ? 'border-amber-500 bg-amber-50' : 'hover:bg-stone-50'}`}>
//               <input type="radio" name="variation" checked={variation === v.slug} onChange={() => setVariation(v.slug)} className="hidden" />
//               <div className="w-10 h-10 flex items-center justify-center bg-white border rounded">
//                 {PROVIDER_LOGOS[(v.provider || v.slug || '').toLowerCase()] ? (
//                   <Image src={PROVIDER_LOGOS[(v.provider || v.slug || '').toLowerCase()]} alt={v.name} width={36} height={36} />
//                 ) : (
//                   <div className="text-sm font-semibold text-stone-700">{(v.provider || v.slug || '').slice(0,3).toUpperCase()}</div>
//                 )}
//               </div>
//               <div className="flex-1">
//                 <div className="font-medium text-sm text-stone-800">{v.name}</div>
//                 {v.price ? <div className="text-xs text-stone-500">₦{Number(v.price).toLocaleString()}</div> : null}
//               </div>
//             </label>
//           ))}
//         </div>
//       </div>

//       <div>
//         <Label>{identifierLabel}</Label>
//         <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={identifierLabel} />
//       </div>

//       <div>
//         <Label>Amount (₦)</Label>
//         <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1000" />
//       </div>

//       <div className="flex gap-2 justify-end">
//         <Button type="button" variant="outline" onClick={handleValidate} disabled={loading}>Validate</Button>
//         <Button type="submit" className="bg-amber-500 text-stone-900" disabled={loading}>{loading ? 'Processing...' : 'Pay Bill'}</Button>
//       </div>
//     </form>
//   )
// }
