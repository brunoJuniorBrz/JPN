"use client";
import { cloneElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactElement<InputHTMLAttributes<HTMLInputElement>> }) {
  const id = useId();
  const description = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ");
  return <div className="field"><label className="field-label" htmlFor={id}>{label}</label>{cloneElement(children, { id, "aria-describedby": description || undefined })}{hint && <span id={`${id}-hint`} className="field-hint">{hint}</span>}{error && <span id={`${id}-error`} className="field-error" role="alert">{error}</span>}</div>;
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`input ${props.className ?? ""}`} />; }
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={`input ${props.className ?? ""}`} />; }
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea rows={4} {...props} className={`input ${props.className ?? ""}`} />; }
export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div>{action}</div>;
}
export function Status({ value }: { value: string }) { return <span className={`status ${value === "Finalizado" ? "status-done" : value === "Em elaboração" ? "status-active" : ""}`}><span aria-hidden="true" />{value}</span>; }
