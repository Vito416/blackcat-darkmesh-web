import React from "react";

type VaultProps = React.HTMLAttributes<HTMLElement> & {
  children: React.ReactNode;
  open: boolean;
  labelledBy: string;
  describedBy?: string;
};

const Vault = React.forwardRef<HTMLElement, VaultProps>(
  ({ children, open, labelledBy, describedBy, className, style, ...rest }, ref) => {
    const mergedStyle = open ? style : { ...(style ?? {}), display: "none" };

    return (
      <section
        ref={ref}
        className={className}
        role="region"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        style={mergedStyle}
        {...rest}
      >
        {children}
      </section>
    );
  },
);

Vault.displayName = "Vault";

export default Vault;
