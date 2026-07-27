type BrandMarkProps = {
  className: 'brand-mark' | 'empty-mark';
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <span aria-hidden="true" className={className}>
      <svg viewBox="0 0 1024 1024" role="presentation">
        <g
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="82"
        >
          <path d="M330 292c-22 132-12 307 43 407 31 57 81 31 129-69" />
          <path d="M587 347c82 80 119 181 127 303" />
        </g>
      </svg>
    </span>
  );
}
