"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-amber-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.28),_transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.95),rgba(255,251,235,0.88))] p-6 shadow-[0_20px_60px_-40px_rgba(120,53,15,0.6)] md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-700/80">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
            {title}
          </h1>
          {description ? (
            <p className="max-w-3xl text-sm leading-6 text-stone-600">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "amber",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: "amber" | "emerald" | "blue" | "rose";
}) {
  const toneStyles = {
    amber:
      "from-amber-100 via-white to-orange-50 text-amber-700 ring-amber-200/70",
    emerald:
      "from-emerald-100 via-white to-lime-50 text-emerald-700 ring-emerald-200/70",
    blue: "from-sky-100 via-white to-cyan-50 text-sky-700 ring-sky-200/70",
    rose: "from-rose-100 via-white to-pink-50 text-rose-700 ring-rose-200/70",
  } as const;

  return (
    <motion.div layout whileHover={{ y: -4 }} transition={{ duration: 0.18 }}>
      <Card
        className={cn(
          "rounded-3xl border-0 bg-gradient-to-br p-5 shadow-[0_18px_50px_-36px_rgba(28,25,23,0.65)] ring-1",
          toneStyles[tone]
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-500">
              {label}
            </p>
            <p className="text-3xl font-semibold text-stone-900">{value}</p>
            {hint ? <p className="text-sm text-stone-600">{hint}</p> : null}
          </div>
          <div className="rounded-2xl bg-white/80 p-3 shadow-sm">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone?: "green" | "amber" | "red" | "blue" | "stone";
}) {
  const className =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "red"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : tone === "blue"
            ? "border-sky-200 bg-sky-50 text-sky-700"
            : "border-stone-200 bg-stone-50 text-stone-700";

  return <Badge className={className}>{label}</Badge>;
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("rounded-3xl border border-stone-200/80 bg-white/90 p-6 shadow-[0_18px_45px_-40px_rgba(28,25,23,0.8)]", className)}>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
          {description ? (
            <p className="text-sm leading-6 text-stone-600">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  href,
  cta,
}: {
  title: string;
  description: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50/80 px-6 py-10 text-center">
      <p className="text-base font-semibold text-stone-900">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-stone-600">
        {description}
      </p>
      {href && cta ? (
        <Button asChild variant="outline" className="mt-5 rounded-full">
          <Link href={href}>
            {cta}
            <ArrowRight />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

export function PaginatedCardList<T>({
  items,
  renderItem,
  itemsPerPage = 3,
  empty,
}: {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  itemsPerPage?: number;
  empty?: React.ReactNode;
}) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [items.length]);

  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
  const safePage = Math.min(page, totalPages);
  const currentItems = useMemo(
    () => items.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage),
    [items, itemsPerPage, safePage]
  );

  if (items.length === 0) {
    return empty ?? null;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {currentItems.map((item, index) => renderItem(item, index))}
      </div>
      {totalPages > 1 ? (
        <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm">
          <p className="text-stone-600">
            Showing {(safePage - 1) * itemsPerPage + 1}-
            {Math.min(safePage * itemsPerPage, items.length)} of {items.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={safePage === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Prev
            </Button>
            <span className="text-stone-500">
              {safePage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={safePage === totalPages}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
