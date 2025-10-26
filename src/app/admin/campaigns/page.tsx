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
import toast from "react-hot-toast";
import { ExternalLink } from "lucide-react";

interface Campaign {
  id: string;
  title: string;
  advertiserName: string;
  category: string;
  status: string;
  earnerPrice: number;
  budget: number;
  generatedLeads: number;
  targetLeads: number;
  createdAt: { seconds: number };
  description: string;
  proofInstructions: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "campaigns"), orderBy("createdAt", "desc"));

    const unsubCampaigns = onSnapshot(q, (snap) => {
      const campaignsData = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title || "",
          advertiserName: data.advertiserName || "",
          category: data.category || "",
          status: data.status || "",
          earnerPrice: data.earnerPrice || 0,
          budget: data.budget || 0,
          generatedLeads: data.generatedLeads || 0,
          targetLeads: data.targetLeads || 0,
          createdAt: data.createdAt || { seconds: Date.now() / 1000 },
          description: data.description || "",
          proofInstructions: data.proofInstructions || "",
        };
      });
      setCampaigns(campaignsData);
      setLoading(false);
    });

    return () => unsubCampaigns();
  }, []);

  const updateCampaignStatus = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, "campaigns", id), { status });
      toast.success(`Campaign ${status === "Active" ? "activated" : status.toLowerCase()}`);
    } catch (error) {
      console.error("Error updating campaign status:", error);
      toast.error("Failed to update campaign status");
    }
  };

  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
    const matchesCategory =
      categoryFilter === "all" || campaign.category === categoryFilter;
    const matchesSearch =
      search === "" ||
      campaign.title.toLowerCase().includes(search.toLowerCase()) ||
      campaign.advertiserName.toLowerCase().includes(search.toLowerCase()) ||
      campaign.description.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesCategory && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // Get unique categories for filter
  const categories = Array.from(
    new Set(campaigns.map((campaign) => campaign.category))
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-800">Campaigns</h1>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search campaigns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Paused">Paused</SelectItem>
              <SelectItem value="Stopped">Stopped</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Campaigns Table */}
      <Card className="p-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Campaign</TableHead>
              <TableHead>Advertiser</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCampaigns.map((campaign) => (
              <TableRow key={campaign.id}>
                <TableCell>
                  <div>
                    <div className="font-medium text-stone-900">
                      <a href={`/admin/campaigns/${campaign.id}`} className="hover:underline">
                        {campaign.title}
                      </a>
                    </div>
                    <div className="text-sm text-stone-600">{campaign.category}</div>
                  </div>
                </TableCell>
                <TableCell>{campaign.advertiserName}</TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="text-sm text-stone-600">
                      {campaign.generatedLeads} of {campaign.targetLeads} leads
                    </div>
                    <div className="h-2 w-24 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            (campaign.generatedLeads / campaign.targetLeads) * 100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">
                      ₦{campaign.budget.toLocaleString()}
                    </div>
                    <div className="text-sm text-stone-600">
                      ₦{campaign.earnerPrice.toLocaleString()} per lead
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      campaign.status === "Active"
                        ? "bg-green-100 text-green-700"
                        : campaign.status === "Paused"
                        ? "bg-amber-100 text-amber-700"
                        : campaign.status === "Completed"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {campaign.status}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {campaign.status !== "Active" && (
                      <Button
                        onClick={() => updateCampaignStatus(campaign.id, "Active")}
                        variant="outline"
                        size="sm"
                        className="text-green-700"
                      >
                        Activate
                      </Button>
                    )}
                    {campaign.status === "Active" && (
                      <Button
                        onClick={() => updateCampaignStatus(campaign.id, "Paused")}
                        variant="outline"
                        size="sm"
                        className="text-amber-700"
                      >
                        Pause
                      </Button>
                    )}
                    {campaign.status !== "Stopped" && (
                      <Button
                        onClick={() => updateCampaignStatus(campaign.id, "Stopped")}
                        variant="outline"
                        size="sm"
                        className="text-red-700"
                      >
                        Stop
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredCampaigns.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-4">
                  No campaigns found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}