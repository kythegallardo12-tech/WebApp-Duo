# StockFlow Pro — MERN Enterprise eCommerce & Inventory System

An enterprise-grade eCommerce, Inventory Management, and Dispatch Control System developed with modern React, GSAP physics animations, Lenis smooth scrolling, and custom dark navy glassmorphism elevation.

## 🚀 Key Architectural Features

- **Navy Dark Glassmorphism Elevation**: Built with deep navy CSS custom properties (`#0a0e1a` to `#1a2236`), multi-tier backdrop blur, and luminescence glow effects.
- **GSAP & Lenis Smooth Motion**: Smooth inertia scrolling powered by Lenis; GSAP timeline choreographies for entrance staggers, modal spring physics, dynamic counters, and bar charts.
- **React Bits Inspired Micro-Components**:
  - `SpotlightCard`: Mouse-tracking radial glass spotlight.
  - `ShinyText`: Metallic luminescent sweep gradient animation.
- **Smart Tiered Loading Architecture**:
  - **< 1s**: Renders instantly without flashing spinners.
  - **1s - 10s**: Content-shaped skeleton loaders matching exact page typography and card structures.
  - **> 10s**: Progress bar with dynamic time remaining countdown.
- **Optimistic Updates ("Tap = Update First, Sync Later")**: Zero-wait local state mutations on taps with concurrent background synchronization and error rollback.
- **Modal vs. Sheet Heuristics**:
  - **Modal**: Focused, interruptive binary confirmations and destructive actions (e.g. Delete Product).
  - **Sheet**: Rich slide-out inspector panels for multi-attribute forms and editing (e.g. Add/Edit SKU, Invoice creation).
- **Persistent State**: Integrated with Zustand `persist` middleware backed by `localStorage` for cross-session data durability.

---

## 🧠 UX Laws & Human Factors Compliance Matrix

1. **Miller’s Law**: Primary menus and dashboard metric clusters strictly follow $7 \pm 2$ chunks to prevent cognitive fatigue.
2. **Hick’s Law**: Decision latency minimized through streamlined categories and sensible defaults.
3. **Fitts’ Law**: Action targets, quick-adjustment stock buttons (`+5`, `+20`), and primary action buttons have generous click areas ($44\text{px}+$ touch targets).
4. **Law of Similarity**: Unified glass card structures, chromatic status indicators, and typography scales across all sub-modules.
5. **Jakob’s Law**: Standard enterprise web layout conventions (collapsible navigation bar, sticky search header, tabular data views).
6. **Aesthetic-Usability Effect**: Navy glass surfaces and GSAP micro-animations promote user confidence and perceived usability.
7. **Occam’s Razor**: Extraneous telemetry eliminated; contextual details tucked cleanly into on-demand inspection Sheets.
8. **Peak-End Rule**: Highlights peak revenue milestones and celebrates order completion with positive feedback toasts.
9. **Simplicity, Consistency, Visual Hierarchy, Feedback**: Enforced via global toast system, cloud sync indicators, and typographic elevation.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: React 19 + Vite
- **Styling**: Tailwind CSS v4 + Glassmorphism UI
- **Animations**: GSAP (GreenSock Animation Platform) + Lenis
- **State Management**: Zustand (with Persistence)
- **Icons**: Lucide React
- **Routing**: React Router DOM v7

---

## 📦 Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/kythegallardo12-tech/WebApp-Duo.git

# Navigate to project folder
cd WebApp-Duo

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser to view the application.

---

## 📄 License

Academic / Enterprise Project License.
