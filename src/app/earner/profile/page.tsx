"use client";

import React, { useEffect, useState } from "react";
import { auth, db, storage } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import toast from "react-hot-toast";
import { ArrowLeft } from "lucide-react";
import { User, Mail, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function EarnerProfilePage() {
  const router = useRouter();
  const u = auth.currentUser;
  type Profile = {
    fullName?: string;
    email?: string;
    phone?: string;
    profilePic?: string;
  };
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "" });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!u) {
      router.push("/auth/sign-in");
      return;
    }
    const unsub = onSnapshot(doc(db, "earners", u.uid), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setProfile(d);
        setForm({ fullName: d.fullName || "", email: d.email || u.email || "", phone: d.phone || "" });
      }
      setLoading(false);
    });
    return () => unsub();
  }, [u, router]);

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !u) return;
    try {
      const refd = ref(storage, `earners/${u.uid}/avatar.${f.name.split(".").pop()}`);
      await uploadBytes(refd, f);
      const url = await getDownloadURL(refd);
      await updateDoc(doc(db, "earners", u.uid), { profilePic: url, updatedAt: serverTimestamp() });
      toast.success("Profile image updated");
    } catch (err) {
      console.error(err);
      toast.error("Upload failed");
    }
  };

  const saveProfile = async () => {
    if (!u) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "earners", u.uid), {
        fullName: form.fullName,
        phone: form.phone,
        email: form.email,
        updatedAt: serverTimestamp(),
      });
      toast.success("Profile saved");
      setEditing(false);
    } catch (err) {
      console.error(err);
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 flex justify-center items-center"><span className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full"></span></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300 flex items-center justify-center">
      <div className="w-full max-w-2xl mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => router.back()} className="mb-6 hover:bg-white/20">
          <ArrowLeft size={16} className="mr-2" /> Back
        </Button>
        <Card className="p-8 rounded-2xl shadow-xl bg-white/80 backdrop-blur">
          <div className="flex flex-col md:flex-row gap-8 items-center">
            <div className="flex flex-col items-center">
              <div className="w-32 h-32 rounded-full overflow-hidden bg-stone-100 border-4 border-amber-200 shadow">
                <Image 
                  src={profile?.profilePic || "/placeholders/avatar.png"} 
                  alt="avatar" 
                  width={120} 
                  height={120} 
                  className="w-full h-full object-cover" 
                />
              </div>
              <label className="mt-3 cursor-pointer">
                <input type="file" accept="image/*" hidden onChange={handleImage} />
                <Button variant="ghost" className="mt-2 text-amber-600">Change Photo</Button>
              </label>
            </div>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 mb-2">
                <User size={22} className="text-amber-500" />
                <span className="text-xl font-bold text-stone-800">{profile?.fullName || "Your name"}</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Mail size={18} className="text-amber-400" />
                <span className="text-stone-600">{profile?.email}</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Phone size={18} className="text-amber-400" />
                <span className="text-stone-600">{profile?.phone || form.phone}</span>
              </div>

              <div className="mt-4 space-y-3">
                <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} disabled={!editing} placeholder="Full Name" className="text-lg" />
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!editing} placeholder="Email" className="text-lg" />
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!editing} placeholder="Phone" className="text-lg" />
              </div>

              <div className="flex gap-3 mt-6">
                {editing ? (
                  <>
                    <Button onClick={saveProfile} disabled={saving} className="bg-amber-500 text-stone-900 font-semibold">
                      {saving ? "Saving..." : "Save"}
                    </Button>
                    <Button variant="outline" onClick={() => setEditing(false)} className="font-semibold">Cancel</Button>
                  </>
                ) : (
                  <Button onClick={() => setEditing(true)} className="bg-amber-500 text-stone-900 font-semibold">Edit Profile</Button>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
