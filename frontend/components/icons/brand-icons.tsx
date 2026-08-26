// Inweb brand symbols — traced from the official slide deck (Шаблон слайдів
// презентації Inweb, 2026, "Фірмові символи та логотипи" slide), geometry built
// on the logo's diagonal-cut motif. Drop-in replacements for the equivalent
// lucide-react icons (same props: className, width/height via className,
// fill="currentColor" so text-color utilities work as usual).

interface BrandIconProps {
  className?: string;
}

export function BrandCheck({ className }: BrandIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M2.75 6.96 L1.10 11.91 L3.30 14.11 L3.66 14.11 L5.13 9.16 Z M19.60 3.85 L19.24 3.85 L9.53 13.37 L6.96 11.18 L5.50 16.12 L9.34 19.97 L9.71 19.97 L22.72 7.15 Z" />
    </svg>
  );
}

export function BrandPlus({ className }: BrandIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M1.30 9.67 L1.30 10.42 L3.16 14.14 L6.51 14.14 L4.28 9.67 Z M9.86 1.12 L9.86 9.49 L6.70 9.86 L8.93 14.14 L9.86 14.33 L9.86 22.70 L14.33 22.70 L14.33 14.33 L22.51 14.14 L22.51 9.67 L14.51 9.67 L14.33 1.12 Z" />
    </svg>
  );
}

export function BrandClose({ className }: BrandIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.07 1.30 L12.00 8.19 L9.40 5.77 L9.02 5.95 L7.53 10.79 L8.09 12.09 L1.21 18.98 L1.21 19.35 L4.56 22.70 L4.93 22.70 L11.81 15.81 L18.70 22.51 L22.42 18.98 L15.72 12.09 L15.72 11.72 L22.60 5.02 Z M4.37 1.12 L2.70 6.51 L5.49 9.12 L7.16 3.53 L4.74 1.12 Z" />
    </svg>
  );
}

export function BrandArrowRight({ className }: BrandIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M15.16 6.33 L9.02 8.19 L11.81 11.16 L4.19 18.60 L8.09 22.70 L19.81 11.16 L19.81 10.79 Z M12.74 4.09 L9.95 1.12 L4.00 2.98 L6.79 5.95 Z" />
    </svg>
  );
}

export function BrandArrowLeft({ className }: BrandIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8.65 6.33 L4.00 10.79 L4.00 11.16 L15.72 22.70 L19.44 18.98 L19.44 18.60 L12.00 11.16 L14.60 8.19 Z M11.07 4.09 L17.02 5.95 L19.81 2.98 L13.86 1.12 Z" />
    </svg>
  );
}
