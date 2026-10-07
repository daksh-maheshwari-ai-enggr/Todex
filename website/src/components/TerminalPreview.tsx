import { Reveal } from "./Reveal";

/** A lightly-styled mock of the Todex TUI, used as a product screenshot. */
function TerminalWindow() {
  return (
    <div className="termwin" aria-hidden="true">
      <div className="termwin__bar">
        <span className="termwin__dot termwin__dot--red" />
        <span className="termwin__dot termwin__dot--amber" />
        <span className="termwin__dot termwin__dot--green" />
        <span className="termwin__title">todex — ~/code/my-project</span>
      </div>

      <div className="termwin__body">
        <div className="termline">
          <span className="t-brand">◈ todex</span>
          <span className="t-dim"> · AI coding agent</span>
          <span className="t-right t-dim">1. FreeLLMAPI — auto</span>
        </div>
        <div className="termline">
          <span className="t-text">~/code/my-project</span>
          <span className="t-dim"> · </span>
          <span className="t-magenta">⑂ main</span>
          <span className="t-dim"> · ±2 changed</span>
        </div>
        <div className="termline">
          <span className="t-dim">──────────────────────────────────────────</span>
        </div>

        <div className="termline termline--gap">
          <span className="t-prompt">❯ </span>
          <span className="t-text">add request validation to the API</span>
        </div>

        <div className="termline">
          <span className="t-indent" />
          <span className="t-gray">✻ </span>
          <span className="t-tool">think_tool</span>
          <span className="t-dim"> planning the change…</span>
        </div>
        <div className="termline">
          <span className="t-indent" />
          <span className="t-cyan">→ </span>
          <span className="t-tool">read_file</span>
          <span className="t-dim"> src/routes/api.ts</span>
        </div>
        <div className="termline">
          <span className="t-indent" />
          <span className="t-green">✎ </span>
          <span className="t-tool">edit_file</span>
          <span className="t-dim"> src/routes/api.ts</span>
        </div>
        <div className="termline">
          <span className="t-indent" />
          <span className="t-magenta">$ </span>
          <span className="t-tool">bash</span>
          <span className="t-dim"> npm test</span>
        </div>
        <div className="termline">
          <span className="t-indent" />
          <span className="t-green">✓ </span>
          <span className="t-text">42 passed</span>
          <span className="t-dim"> · 0.8s</span>
        </div>

        <div className="termline termline--gap">
          <span className="t-green">● ready</span>
          <span className="t-right t-dim">3 msgs · ctrl+c</span>
        </div>
      </div>
    </div>
  );
}

export function TerminalPreview() {
  return (
    <section className="section section--tight">
      <div className="container term">
        <Reveal className="term__copy">
          <p className="eyebrow">Watch it work</p>
          <h2 className="section__title">From request to verified change</h2>
          <p className="section__lead">
            Ask in plain language and Todex drives the whole loop — exploring
            the code, making surgical edits and proving the result.
          </p>
          <ul className="checklist">
            <li>Streams model tokens and tool calls live as they happen</li>
            <li>Every edit is followed by a build, test or typecheck</li>
            <li>Failures feed straight back into the plan until it's green</li>
          </ul>
        </Reveal>

        <Reveal delay={120} className="term__window-wrap">
          <TerminalWindow />
        </Reveal>
      </div>
    </section>
  );
}
