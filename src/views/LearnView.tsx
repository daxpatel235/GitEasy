import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookIcon,
  ChangesIcon,
  CheckIcon,
  SearchIcon,
  TerminalIcon,
  WarningIcon,
} from "@/components/Icons";
import { GLOSSARY_GROUPS, TERMS, type TermKey } from "@/copy/terms";

/**
 * The glossary, and the argument for using real Git words everywhere else.
 *
 * Every term the app shows is defined here, in the same words the tooltips
 * use, with the command GitEasy runs on the user's behalf. Someone who reads
 * this screen once can follow any Git tutorial on the internet — which is the
 * whole point of not inventing our own vocabulary.
 */
export function LearnView() {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return GLOSSARY_GROUPS;

    return GLOSSARY_GROUPS.map((group) => ({
      ...group,
      keys: group.keys.filter((key) => {
        const entry = TERMS[key];
        return `${entry.label} ${entry.plain} ${entry.detail} ${entry.command}`
          .toLowerCase()
          .includes(needle);
      }),
    })).filter((group) => group.keys.length > 0);
  }, [query]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Learn Git"
        subtitle="GitEasy uses the same words your colleagues and every tutorial on the internet use, so nothing you learn here is wasted. This is what all of them mean."
      >
        <div className="relative w-full max-w-[280px]">
          <SearchIcon className="pointer-events-none absolute left-[10px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the glossary"
            aria-label="Search the glossary"
            className="w-full rounded-md border border-line bg-ground py-[7px] pl-[30px] pr-3 text-[13px] placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </div>
      </PageHeader>

      {!query && <MentalModel />}

      {groups.length === 0 ? (
        <EmptyState
          icon={<BookIcon className="h-6 w-6" />}
          title="No match"
          body={`Nothing in the glossary mentions “${query}”.`}
        />
      ) : (
        groups.map((group) => (
          <section key={group.title} className="flex flex-col gap-3">
            <div>
              <h2 className="display text-[17px] font-semibold">{group.title}</h2>
              <p className="mt-[3px] text-[13px] text-muted">{group.blurb}</p>
            </div>

            <div className="flex flex-col gap-[6px]">
              {group.keys.map((key) => (
                <TermCard key={key} termKey={key} />
              ))}
            </div>
          </section>
        ))
      )}

      {!query && <Habits />}
    </div>
  );
}

/**
 * The one diagram worth drawing.
 *
 * Three places a file can be, and the verbs that move it between them. Almost
 * every beginner confusion is a missing piece of this picture.
 */
function MentalModel() {
  const stages = [
    {
      icon: <ChangesIcon className="h-[18px] w-[18px]" />,
      title: "Your folder",
      body: "The files you are editing right now. Git sees them change but does nothing until you say so.",
    },
    {
      icon: <CheckIcon className="h-[18px] w-[18px]" />,
      title: "This computer",
      body: "Committed snapshots. Private, permanent, and reversible. Commit early and often — it costs nothing.",
    },
    {
      icon: <ArrowUpIcon className="h-[18px] w-[18px]" />,
      title: "GitHub",
      body: "The shared copy. Once work is pushed here, other people have it — which is why this step gets a confirmation.",
    },
  ];

  return (
    <section className="flex flex-col gap-4 rounded-card border border-accent/30 bg-surface/50 p-5">
      <div>
        <h2 className="display text-[17px] font-semibold">Where your work lives</h2>
        <p className="mt-[3px] max-w-[68ch] text-[13px] leading-relaxed text-muted">
          Almost everything confusing about Git comes from not knowing which of these three
          places a file is in. Work moves left to right when you commit and push, and right to
          left when you pull.
        </p>
      </div>

      <div className="grid gap-[6px] sm:grid-cols-3">
        {stages.map((stage, index) => (
          <div
            key={stage.title}
            className="relative flex flex-col gap-2 rounded-lg border border-line-soft bg-surface-alt/40 p-4"
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/12 text-accent">
              {stage.icon}
            </span>
            <span className="text-[14px] font-semibold">{stage.title}</span>
            <span className="text-[12.5px] leading-relaxed text-muted">{stage.body}</span>

            {index < stages.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute -right-[13px] top-[30px] z-10 hidden h-6 w-6 place-items-center rounded-full border border-line bg-surface text-faint sm:grid"
              >
                →
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line-soft pt-3 text-[12.5px] text-muted">
        <span className="inline-flex items-center gap-[6px]">
          <ArrowUpIcon className="h-[14px] w-[14px] text-added" />
          <strong className="text-content">Commit</strong> then <strong className="text-content">Push</strong> moves work right
        </span>
        <span className="inline-flex items-center gap-[6px]">
          <ArrowDownIcon className="h-[14px] w-[14px] text-modified" />
          <strong className="text-content">Pull</strong> moves other people&rsquo;s work left
        </span>
      </div>
    </section>
  );
}

function TermCard({ termKey }: { termKey: TermKey }) {
  const [open, setOpen] = useState(false);
  const entry = TERMS[termKey];

  return (
    <div className="overflow-hidden rounded-card border border-line/70 bg-surface/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-alt"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold">{entry.label}</span>
            {!entry.reversible && (
              <Badge tone="warn" icon={<WarningIcon className="h-[10px] w-[10px]" />}>
                Hard to undo
              </Badge>
            )}
          </span>
          <span className="mt-[2px] block text-[13px] text-muted">{entry.plain}</span>
        </span>

        <span className="flex-none text-[18px] leading-none text-faint">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="border-t border-line-soft bg-ground/40 px-4 py-3">
          <p className="max-w-[74ch] text-[13px] leading-relaxed text-muted">{entry.detail}</p>

          <div className="mt-3 flex items-center gap-[8px] rounded-[6px] border border-line-soft bg-surface px-3 py-[7px]">
            <TerminalIcon className="h-[14px] w-[14px] flex-none text-faint" />
            <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-muted">
              {entry.command}
            </code>
            <span className="flex-none text-2xs text-faint">what GitEasy runs</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Advice that would otherwise take a year of mistakes to acquire. */
function Habits() {
  const habits = [
    {
      title: "Pull before you start, pull before you push",
      body: "Almost every conflict people hit is one they could have avoided by spending three seconds getting the latest work first.",
    },
    {
      title: "Commit small and often",
      body: "A commit that changes one thing is easy to describe, easy to review and easy to undo. One that changes forty is none of those.",
    },
    {
      title: "Write the message for the person reading it in six months",
      body: "That person is usually you. “fix bug” tells them nothing; “fix: tax applied before discount on checkout” tells them everything.",
    },
    {
      title: "Never commit secrets",
      body: "API keys and passwords stay in history forever, even after you delete the file. Put them in a .env file and list it in .gitignore before the first commit.",
    },
    {
      title: "Branch per task",
      body: "Keeping unrelated work on separate branches means you can ship one thing without waiting for the other to be finished.",
    },
    {
      title: "Prefer revert to deleting history",
      body: "Reverting adds a commit that undoes a mistake, leaving a record. Rewriting history breaks everyone else's copy of the project.",
    },
  ];

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="display text-[17px] font-semibold">Habits worth having</h2>
        <p className="mt-[3px] text-[13px] text-muted">
          Six rules that prevent most of the trouble people get into.
        </p>
      </div>

      <div className="grid gap-[6px] sm:grid-cols-2">
        {habits.map((habit) => (
          <div
            key={habit.title}
            className="flex flex-col gap-[5px] rounded-card border border-line/70 bg-surface/50 p-4"
          >
            <span className="text-[13.5px] font-semibold">{habit.title}</span>
            <span className="text-[12.5px] leading-relaxed text-muted">{habit.body}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
