import React from "react";

type VaultProps = {
  children: React.ReactNode;
  open: boolean;
  labelledBy: string;
  describedBy?: string;
  className?: string;
  style?: React.CSSProperties;
};

const Vault = React.forwardRef<HTMLElement, VaultProps>(
  ({ children, open, labelledBy, describedBy, className, style }, ref) => {
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
      >
        {children}
      </section>
    );
  },
);

Vault.displayName = "Vault";

export default Vault;
