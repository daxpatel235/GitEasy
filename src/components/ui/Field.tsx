import type { ReactNode } from "react";

const INPUT =
  "w-full rounded-md border border-line bg-ground px-3 py-[9px] text-[14px] text-content placeholder:text-faint transition-colors focus:border-accent focus:outline-none";

/** Labelled text input. `hint` is where the plain-English explanation goes. */
export function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  mono = false,
  autoFocus = false,
  disabled = false,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="text-[13px] font-medium text-content">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        data-autofocus={autoFocus || undefined}
        className={`${INPUT} ${mono ? "font-mono text-[13px]" : ""} disabled:opacity-50`}
      />
      {hint && <span className="text-[12.5px] leading-relaxed text-muted">{hint}</span>}
    </label>
  );
}

export function TextArea({
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="text-[13px] font-medium text-content">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`${INPUT} resize-y leading-relaxed`}
      />
      {hint && <span className="text-[12.5px] leading-relaxed text-muted">{hint}</span>}
    </label>
  );
}

/** Native select styled to match. Used for branch pickers and merge strategy. */
export function SelectField({
  label,
  hint,
  value,
  onChange,
  options,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="text-[13px] font-medium text-content">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT} cursor-pointer`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && <span className="text-[12.5px] leading-relaxed text-muted">{hint}</span>}
    </label>
  );
}
