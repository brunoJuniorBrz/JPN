import type { ComponentProps } from "react";
import { cx } from "./cx";

/** Tecla ou atalho. Para combinações, passe `keys` (ex.: ["Ctrl", "K"]). */
export function Kbd({ keys, className, children, ...props }: ComponentProps<"kbd"> & { keys?: string[] }) {
  if (keys?.length) {
    return (
      <kbd className={cx("ui-kbd-combo", className)} {...props}>
        {keys.map((key, index) => <kbd key={`${key}-${index}`} className="ui-kbd">{key}</kbd>)}
      </kbd>
    );
  }
  return <kbd className={cx("ui-kbd", className)} {...props}>{children}</kbd>;
}
