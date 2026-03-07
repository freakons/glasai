import { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'cta-primary',
  secondary: 'cta-secondary',
  ghost: 'tb-btn',
};

/**
 * Button — three variants matching the intelligence workstation style.
 *
 * - primary: gradient indigo→cyan, filled, prominent CTA
 * - secondary: glass surface, subtle border
 * - ghost: minimal, toolbar-style
 */
export function Button({ variant = 'primary', children, className = '', ...props }: ButtonProps) {
  return (
    <button className={`${variantClass[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
