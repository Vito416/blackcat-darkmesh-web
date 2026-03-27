import React from "react";

type WizardProps = React.HTMLAttributes<HTMLElement> & {
  children: React.ReactNode;
  open: boolean;
  labelledBy: string;
  describedBy?: string;
};

const Wizard = React.forwardRef<HTMLElement, WizardProps>(
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

Wizard.displayName = "Wizard";

export default Wizard;
