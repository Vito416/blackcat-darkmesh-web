import React from "react";

type WizardProps = {
  children: React.ReactNode;
  open: boolean;
  labelledBy: string;
  describedBy?: string;
  className?: string;
  style?: React.CSSProperties;
};

const Wizard = React.forwardRef<HTMLElement, WizardProps>(
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

Wizard.displayName = "Wizard";

export default Wizard;
