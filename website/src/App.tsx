import { CTA } from "./components/CTA";
import { DocsPlaceholder } from "./components/DocsPlaceholder";
import { Features } from "./components/Features";
import { Footer } from "./components/Footer";
import { Hero } from "./components/Hero";
import { Navbar } from "./components/Navbar";
import { TerminalPreview } from "./components/TerminalPreview";
import { Workflow } from "./components/Workflow";

export default function App() {
  return (
    <div className="page">
      {/* Decorative animated backdrop. */}
      <div className="bg" aria-hidden="true">
        <div className="bg__grid" />
        <div className="bg__glow bg__glow--a" />
        <div className="bg__glow bg__glow--b" />
        <div className="bg__glow bg__glow--c" />
      </div>

      <Navbar />

      <main>
        <Hero />
        <Features />
        <TerminalPreview />
        <Workflow />
        <DocsPlaceholder />
        <CTA />
      </main>

      <Footer />
    </div>
  );
}
