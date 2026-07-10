import { motion } from "motion/react";
import { Navbar } from "../components/layout/Navbar";
import { Link } from "react-router-dom";
import { Utensils, QrCode, LineChart, Users } from "lucide-react";

const features = [
  {
    name: "QR Ordering & Payments",
    description: "Customers scan a QR code at their table, view your dynamic menu, and pay directly via Card, UPI, or Cash.",
    icon: QrCode,
  },
  {
    name: "Live Kitchen Display",
    description: "Orders instantly appear in the kitchen with table numbers and special instructions. No more paper tickets.",
    icon: Utensils,
  },
  {
    name: "Staff & Table Management",
    description: "Monitor table occupancy in real-time. Free up tables instantly and track staff performance.",
    icon: Users,
  },
  {
    name: "Revenue Analytics",
    description: "Deep insights into your best-selling items, daily revenue trends, and inventory tracking.",
    icon: LineChart,
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans">
      <Navbar />
      <main>
        {/* Hero Section */}
        <div className="relative isolate px-6 pt-14 lg:px-8">
          <div className="mx-auto max-w-4xl py-32 sm:py-48 lg:py-56 text-center">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-balance text-5xl font-bold tracking-tight text-zinc-900 sm:text-7xl"
            >
              The complete OS for modern restaurants
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mt-8 text-pretty text-lg font-medium text-zinc-500 sm:text-xl/8 max-w-2xl mx-auto"
            >
              From QR table ordering to live kitchen displays and deep analytics, CraveCraft gives you everything you need to run your outlets seamlessly from anywhere.
            </motion.p>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-10 flex items-center justify-center gap-x-6"
            >
              <Link
                to="/pricing"
                className="rounded-full bg-orange-600 px-8 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 transition-all"
              >
                Get Started
              </Link>
              <a href="#features" className="text-sm/6 font-semibold text-zinc-900">
                View Features <span aria-hidden="true">→</span>
              </a>
            </motion.div>
          </div>
        </div>

        {/* Features Section */}
        <div id="features" className="bg-white py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl lg:text-center">
              <h2 className="text-base/7 font-semibold text-orange-600">Everything you need</h2>
              <p className="mt-2 text-pretty text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl lg:text-balance">
                Manage your operations on autopilot
              </p>
            </div>
            <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-4xl">
              <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-10 lg:max-w-none lg:grid-cols-2 lg:gap-y-16">
                {features.map((feature) => (
                  <div key={feature.name} className="relative pl-16">
                    <dt className="text-base/7 font-semibold text-zinc-900">
                      <div className="absolute left-0 top-0 flex size-10 items-center justify-center rounded-lg bg-orange-600">
                        <feature.icon aria-hidden="true" className="size-6 text-white" />
                      </div>
                      {feature.name}
                    </dt>
                    <dd className="mt-2 text-base/7 text-zinc-600">{feature.description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
