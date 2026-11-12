// Displayed 180-240px wide (styles.css), so serve right-sized files instead of
// the 600px original. `lazy` is for copies far below the fold (the footer).
export function BrandLogo({ lazy = false }: { lazy?: boolean }) {
  return (
    <img
      className="agn-brand-logo"
      src="/img/logo.webp"
      srcSet="/img/logo-240.webp 240w, /img/logo-360.webp 360w, /img/logo-480.webp 480w, /img/logo.webp 600w"
      sizes="(min-width: 1264px) 240px, (min-width: 948px) 19vw, 180px"
      alt="LotVanta"
      width={600}
      height={200}
      loading={lazy ? 'lazy' : undefined}
      decoding={lazy ? 'async' : undefined}
    />
  );
}
