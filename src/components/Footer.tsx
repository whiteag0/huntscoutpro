import Link from "next/link";
import { Crosshair } from "lucide-react";

const productLinks = [
  { href: "/states", label: "Draw Odds Explorer" },
  { href: "/compare", label: "Unit Comparison" },
  { href: "/trends", label: "Point Creep Trends" },
  { href: "/planner", label: "Hunt Planner" },
  { href: "/turkey", label: "Turkey Intelligence" },
  { href: "/calendar", label: "Season Calendar" },
];

const stateLinks = [
  { href: "/states/colorado", label: "Colorado" },
  { href: "/states/montana", label: "Montana" },
  { href: "/states/wyoming", label: "Wyoming" },
  { href: "/states/arizona", label: "Arizona" },
  { href: "/states/nevada", label: "Nevada" },
  { href: "/states/new-mexico", label: "New Mexico" },
  { href: "/states/idaho", label: "Idaho" },
  { href: "/states/utah", label: "Utah" },
];

const resourceLinks = [
  { href: "/#faq", label: "FAQ" },
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact Us" },
  { href: "/about", label: "About" },
];

const legalLinks = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund", label: "Refund Policy" },
];

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
        {title}
      </h3>
      <ul className="space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-white/60 hover:text-white transition-colors duration-200"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="bg-primary text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main footer */}
        <div className="py-16 grid grid-cols-2 md:grid-cols-4 gap-10">
          <FooterColumn title="Product" links={productLinks} />
          <FooterColumn title="Popular States" links={stateLinks} />
          <FooterColumn title="Resources" links={resourceLinks} />
          <FooterColumn title="Legal" links={legalLinks} />
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-gold" />
            <span className="text-sm font-semibold">HuntScout Pro</span>
          </div>
          <p className="text-sm text-white/50 text-center">
            Made for hunters, by hunters.
          </p>
          <p className="text-sm text-white/40">
            &copy; {new Date().getFullYear()} HuntScout Pro. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
