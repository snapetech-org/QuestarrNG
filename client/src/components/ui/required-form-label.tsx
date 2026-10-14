import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { FormLabel } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { InterfaceText } from "@/components/InterfaceText";

type RequiredFormLabelProps = ComponentPropsWithoutRef<typeof FormLabel> & {
  children: ReactNode;
  required?: boolean;
  optional?: boolean;
};

export function RequiredFormLabel({
  children,
  required = false,
  optional = false,
  className,
  ...props
}: RequiredFormLabelProps) {
  return (
    <FormLabel className={cn("flex items-center gap-1.5", className)} {...props}>
      <span>{children}</span>
      {required ? (
        <>
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
          <span className="sr-only">
            <InterfaceText source={"required"} />
          </span>
        </>
      ) : optional ? (
        <span className="text-muted-foreground text-xs font-normal">
          <InterfaceText source={"(optional)"} />
        </span>
      ) : null}
    </FormLabel>
  );
}
