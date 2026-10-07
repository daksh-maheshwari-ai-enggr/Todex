import type { ComponentType, SVGProps } from "react";
import {
  GraphIcon,
  MemoryIcon,
  PlugIcon,
  ShieldIcon,
  TerminalIcon,
  WrenchIcon,
} from "./Icons";
import { Reveal } from "./Reveal";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

interface Feature {
  icon: IconType;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: TerminalIcon,
    title: "A real agent loop",
    body: "Orient → plan → TODO → execute → verify → repair. Todex works a task end to end instead of handing you a suggestion to paste.",
  },
  {
    icon: GraphIcon,
    title: "Understands the codebase",
    body: "AST analysis, an import-dependency graph, impact analysis and semantic (RAG) search — so edits respect how your project actually fits together.",
  },
  {
    icon: WrenchIcon,
    title: "Real tools, real effects",
    body: "Filesystem, shell and git tools with surgical edits. Every change is verified with the build, tests or typecheck before it's called done.",
  },
  {
    icon: MemoryIcon,
    title: "Project memory",
    body: "Useful discoveries are persisted per project, so later sessions start informed instead of re-learning your conventions from scratch.",
  },
  {
    icon: ShieldIcon,
    title: "Sandboxed by default",
    body: "Todex asks for trust once per project before it reads or writes anything, and keeps its own metadata out of your git status.",
  },
  {
    icon: PlugIcon,
    title: "Bring your own model",
    body: "Ships with FreeLLMAPI and a provider registry built to grow — no lock-in, and no keys baked into your project.",
  },
];

export function Features() {
  return (
    <section className="section" id="features">
      <div className="container">
        <Reveal>
          <p className="eyebrow">Capabilities</p>
        </Reveal>
        <Reveal delay={60}>
          <h2 className="section__title">An agent, not an autocomplete</h2>
        </Reveal>
        <Reveal delay={110}>
          <p className="section__lead">
            Todex is built for the unglamorous part of shipping software:
            reading the code, making the change, and proving it works.
          </p>
        </Reveal>

        <div className="features">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Reveal
                key={feature.title}
                delay={index * 70}
                className="feature-cell"
              >
                <article className="feature">
                  <span className="feature__icon">
                    <Icon width={21} height={21} />
                  </span>
                  <h3 className="feature__title">{feature.title}</h3>
                  <p className="feature__body">{feature.body}</p>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
