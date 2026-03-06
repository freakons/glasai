interface BadgeProps {
  category: string;
  label?: string;
}

export function Badge({ category, label }: BadgeProps) {
  return (
    <span className={`badge ${category}`}>
      {label || category}
    </span>
  );
}
