"use client";

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
  query,
  orderBy,
  where,
  getDocs,
} from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import toast from "react-hot-toast";
import { Ban, CheckCircle, User } from "lucide-react";

interface User {
  id: string;
  email: string;
  name: string;
  type: "earner" | "advertiser";
  status: "active" | "suspended" | "pending";
  createdAt: { seconds: number };
  balance: number;
  leadsPaidFor?: number;
  campaignsCreated?: number;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => {
    setLoading(true);

    // Fetch all users (both earners and advertisers)
    const fetchAllUsers = async () => {
      try {
        const [earnersSnap, advertisersSnap] = await Promise.all([
          getDocs(query(collection(db, "earners"), orderBy("createdAt", "desc"))),
          getDocs(
            query(collection(db, "advertisers"), orderBy("createdAt", "desc"))
          ),
        ]);

        const earners = earnersSnap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            email: data.email || "",
            name: data.name || "",
            type: "earner" as const,
            status: data.status || "active",
            createdAt: data.createdAt || { seconds: Date.now() / 1000 },
            balance: data.balance || 0,
            leadsPaidFor: data.leadsPaidFor || 0,
          };
        });

        const advertisers = await Promise.all(advertisersSnap.docs.map(async (doc) => {
          const data = doc.data();
          // Get actual campaigns count for this advertiser
          const campaignsQuery = query(collection(db, "campaigns"), where("advertiserId", "==", doc.id));
          const campaignsSnap = await getDocs(campaignsQuery);
          
          return {
            id: doc.id,
            email: data.email || "",
            name: data.name || "",
            type: "advertiser" as const,
            status: data.status || "active",
            createdAt: data.createdAt || { seconds: Date.now() / 1000 },
            balance: data.walletBalance || 0, // Use walletBalance instead of balance
            campaignsCreated: campaignsSnap.size, // Get actual campaign count
          };
        }));

        setUsers([...earners, ...advertisers]);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching users:", error);
        toast.error("Failed to load users");
      }
    };

    fetchAllUsers();
  }, []);

  const updateUserStatus = async (userId: string, userType: string, status: string) => {
    try {
      const collectionName = userType === "earner" ? "earners" : "advertisers";
      await updateDoc(doc(db, collectionName, userId), { status });
      toast.success(`User ${status === "active" ? "activated" : status}`);
    } catch (error) {
      console.error("Error updating user status:", error);
      toast.error("Failed to update user status");
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesType = typeFilter === "all" || user.type === typeFilter;
    const matchesStatus = statusFilter === "all" || user.status === statusFilter;
    const matchesSearch =
      search === "" ||
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesStatus && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-800">Users</h1>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="earner">Earners</SelectItem>
              <SelectItem value="advertiser">Advertisers</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Users Table */}
      <Card className="p-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">User</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Stats</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <User className="w-8 h-8 text-stone-400" />
                    <div>
                      <a href={`/admin/${user.type === "earner" ? "earners" : "advertisers"}/${user.id}`} className="font-medium hover:underline">
                        {user.name}
                      </a>
                      <div className="text-sm text-stone-500">
                        <a href={`/admin/${user.type === "earner" ? "earners" : "advertisers"}/${user.id}`} className="hover:underline">
                          {user.email}
                        </a>
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.type === "earner"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {user.type.charAt(0).toUpperCase() + user.type.slice(1)}
                  </span>
                </TableCell>
                <TableCell>₦{user.balance.toLocaleString()}</TableCell>
                <TableCell>
                  {user.type === "earner"
                    ? `${user.leadsPaidFor} leads completed`
                    : `${user.campaignsCreated} campaigns created`}
                </TableCell>
                <TableCell>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.status === "active"
                        ? "bg-green-100 text-green-700"
                        : user.status === "suspended"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                  </span>
                </TableCell>
                <TableCell>
                  {new Date(user.createdAt.seconds * 1000).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        onClick={() => setSelectedUser(user)}
                        variant="outline"
                        size="sm"
                      >
                        Manage
                      </Button>
                    </DialogTrigger>
                    {selectedUser && (
                      <DialogContent className="bg-stone-50 border-stone-200">
                        <DialogHeader>
                          <DialogTitle className="text-xl">Manage User Account</DialogTitle>
                          <DialogDescription className="text-stone-600">
                            Update the status of {selectedUser.name}&apos;s account
                          </DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-4 mt-4">
                          <Button
                            onClick={() =>
                              updateUserStatus(
                                selectedUser.id,
                                selectedUser.type,
                                "active"
                              )
                            }
                            variant="outline"
                            className="bg-stone-50 hover:bg-green-50 text-green-700 border-green-200"
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Activate Account
                          </Button>
                          <Button
                            onClick={() =>
                              updateUserStatus(
                                selectedUser.id,
                                selectedUser.type,
                                "suspended"
                              )
                            }
                            variant="outline"
                            className="bg-stone-50 hover:bg-red-50 text-red-700 border-red-200"
                          >
                            <Ban className="w-4 h-4 mr-2" />
                            Suspend Account
                          </Button>
                        </div>
                      </DialogContent>
                    )}
                  </Dialog>
                </TableCell>
              </TableRow>
            ))}
            {filteredUsers.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-4">
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}