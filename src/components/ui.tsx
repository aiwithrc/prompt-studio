"use client";
// Small UI primitives shared by all screens. Pills, cards, inputs and chips follow PRD §12.3.
import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

export const inputCls =
  "touch w-full rounded-[10px] border border-border bg-surface-deep px-3 py-2.5 text-[15px] text-text placeholder:text-faint focus:border-accent focus:outline-none";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const base =
    "touch inline-flex items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50";
  const styles = {
    primary: "bg-white text-header font-extrabold hover:bg-white/90",
    secondary: "bg-btn-secondary text-white hover:brightness-110",
    ghost: "border border-border-strong text-text hover:bg-white/5",
    danger: "border border-danger-border text-danger hover:bg-danger/10",
  }[variant];
  return <button {...props} className={`${base} ${styles} ${className}`} />;
}

export function Chip({
  active,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...props}
      className={`touch inline-flex items-center rounded-full border px-3.5 text-[12px] font-bold transition ${
        active ? "border-accent bg-accent text-[#1b0b33]" : "border-border bg-surface text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-surface p-5 ${className}`}>{children}</div>;
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[12px] font-semibold text-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[12px] text-faint">{hint}</p> : null}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} min-h-[84px] resize-y ${props.className ?? ""}`} />;
}

/** Password input with show/hide toggle (AUTH-08). */
export function PasswordInput({
  id,
  name,
  placeholder,
  autoComplete,
  defaultValue,
  required,
  minLength,
  onChange,
}: {
  id: string;
  name: string;
  placeholder?: string;
  autoComplete?: string;
  defaultValue?: string;
  required?: boolean;
  minLength?: number;
  onChange?: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required={required}
        minLength={minLength}
        onChange={(e) => onChange?.(e.target.value)}
        className={`${inputCls} pr-20`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-[12px] font-bold text-lilac hover:bg-white/5"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

/** Polite live region for status messages (A11Y). */
export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: ReactNode }) {
  if (!children) return null;
  const cls = {
    info: "border-border-strong text-text",
    error: "border-danger-border text-danger",
    success: "border-cyan/40 text-cyan",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} aria-live="polite" className={`rounded-xl border bg-surface-deep px-4 py-3 text-sm ${cls}`}>
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">— {children}</p>;
}
