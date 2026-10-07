import { Reveal } from "./Reveal";

interface Step {
  index: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    index: "01",
    title: "Install once",
    body: "One curl command drops Todex on your PATH and links the full-screen TUI. No config files, no project scaffolding.",
  },
  {
    index: "02",
    title: "Run it where you work",
    body: "cd into any project and type todex. It asks for trust once, then operates on that directory with your existing git history intact.",
  },
  {
    index: "03",
    title: "Ship verified changes",
    body: "Describe the task and let the loop run — plan, edit, test, repair. Review the diff, commit, and keep moving.",
  },
];

export function Workflow() {
  return (
    <section className="section" id="workflow">
      <div className="container">
        <Reveal>
          <p className="eyebrow">How it works</p>
        </Reveal>
        <Reveal delay={60}>
          <h2 className="section__title">Three steps to a working agent</h2>
        </Reveal>

        <div className="steps">
          {STEPS.map((step, index) => (
            <Reveal key={step.index} delay={index * 90} className="steps__cell">
              <article className="step">
                <span className="step__index">{step.index}</span>
                <h3 className="step__title">{step.title}</h3>
                <p className="step__body">{step.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
