type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = '' }: BrandMarkProps) {
  return (
    <p className={`brand-mark ${className}`.trim()}>
      Bayad<span>Rent</span>
    </p>
  );
}
