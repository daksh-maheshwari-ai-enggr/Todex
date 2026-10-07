import { TodexMark } from "./Icons";

interface LogoProps {
  /** Hide the wordmark and show only the mark. */
  markOnly?: boolean;
}

export function Logo({ markOnly = false }: LogoProps) {
  return (
    <a className="logo" href="#top" aria-label="Todex — back to top">
      <span className="logo__mark">
        <TodexMark width={28} height={28} />
      </span>
      {!markOnly && <span className="logo__word">todex</span>}
    </a>
  );
}
