import Image from 'next/image';

type BrandMarkProps = {
  className?: string;
  /** Show wordmark text next to the logo (default true). */
  showWordmark?: boolean;
  /** Visual size for the mark image. */
  size?: 'sm' | 'md' | 'lg';
};

const sizes = {
  sm: 28,
  md: 40,
  lg: 56,
} as const;

export function BrandMark({
  className = '',
  showWordmark = true,
  size = 'md',
}: BrandMarkProps) {
  const px = sizes[size];

  return (
    <span className={`brand-mark ${className}`.trim()}>
      <Image
        src="/bayadrent-mark.jpg"
        alt=""
        width={px}
        height={px}
        className="brand-mark-logo"
        priority
      />
      {showWordmark ? (
        <span className="brand-mark-text">
          Bayad<span>Rent</span>
        </span>
      ) : (
        <span className="sr-only">BayadRent</span>
      )}
    </span>
  );
}
