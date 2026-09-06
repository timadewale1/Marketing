export const SERVICE_PROVIDER_FEE = 1000;
export const SERVICE_CONNECTION_FEE = 1000;
export const SERVICE_ADMIN_WHATSAPP = "+2347060629930";

export type ServiceAccountType = "provider" | "customer";

export type ServiceAccount = {
  id: string;
  accountType: ServiceAccountType;
  name: string;
  email: string;
  phone: string;
  location?: string;
  city?: string;
  state?: string;
  bio?: string;
  skills?: string[];
  categories?: string[];
  services?: string[];
  experience?: string;
  availability?: string;
  portfolio?: { url: string; type: "image" | "video"; caption?: string }[];
  whatsapp?: string;
  contactPreference?: string;
  activationPaid?: boolean;
  activationPaidAt?: unknown;
  onboardingComplete?: boolean;
  profileViews?: number;
  connectionCount?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export const SERVICE_CATEGORIES = [
  "IT & Digital",
  "Creative & Media",
  "Home & Technical",
  "Business & Professional",
  "Events & Personal Services",
];

export const SERVICE_SKILLS = [
  "Web Design & Development",
  "Mobile App Development",
  "Software Development",
  "UI/UX Design",
  "Graphic Design",
  "Digital Marketing",
  "Social Media Management",
  "SEO",
  "Data Entry",
  "Data Analysis",
  "Video Editing",
  "Animation",
  "Photography",
  "Videography",
  "Makeup",
  "Fashion Design",
  "Tailoring",
  "Hair Styling",
  "Barbing",
  "Writing",
  "Editing",
  "Plumbing",
  "Electrical Services",
  "Generator Repairs",
  "AC Repairs",
  "Carpentry",
  "Painting",
  "Tiling",
  "Welding",
  "Cleaning",
  "Furniture Making",
  "Accounting",
  "Bookkeeping",
  "Business Consulting",
  "Tutoring",
  "Training",
  "Coaching",
  "Catering",
  "Baking",
  "Event Planning",
  "Event Decoration",
  "DJ Services",
  "Laundry",
  "Fitness Training",
  "Other legitimate services",
];

export function normalizeServiceAccount(
  id: string,
  data: Record<string, unknown>,
): ServiceAccount {
  return {
    id,
    accountType: data.accountType === "customer" ? "customer" : "provider",
    name: String(data.name || ""),
    email: String(data.email || ""),
    phone: String(data.phone || ""),
    location: String(data.location || ""),
    city: String(data.city || ""),
    state: String(data.state || ""),
    bio: String(data.bio || ""),
    skills: Array.isArray(data.skills) ? data.skills.map(String) : [],
    categories: Array.isArray(data.categories)
      ? data.categories.map(String)
      : [],
    services: Array.isArray(data.services) ? data.services.map(String) : [],
    experience: String(data.experience || ""),
    availability: String(data.availability || ""),
    portfolio: Array.isArray(data.portfolio)
      ? (data.portfolio as ServiceAccount["portfolio"])
      : [],
    whatsapp: String(data.whatsapp || ""),
    contactPreference: String(data.contactPreference || ""),
    activationPaid: data.activationPaid === true,
    activationPaidAt: data.activationPaidAt,
    onboardingComplete: data.onboardingComplete === true,
    profileViews: Number(data.profileViews || 0),
    connectionCount: Number(data.connectionCount || 0),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}
