import { Metadata } from "next";
import { PropsWithChildren } from "react";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "Admin dashboard for managing submissions and withdrawals",
};

export default function AdminLayout({ children }: PropsWithChildren) {
  return <>{children}</>;
}