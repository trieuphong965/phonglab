/** Default mark (same drawing as public/logo.svg), in the current text color. */
export function Logo() {
  return (
    <svg viewBox="0 0 120 160" aria-hidden="true">
      <defs>
        <clipPath id="logo-r"><rect width="120" height="160" rx="5" /></clipPath>
        <path id="logo-b" d="M67 0H120V93.75L82 65.25V18Q82 15 79 15H73Q67 15 67 9Z" />
      </defs>
      <g clipPath="url(#logo-r)" fill="currentColor">
        <path d="M0 0H53V9Q53 15 47 15H41Q38 15 38 18V39.75L120 101.25V160H67V151Q67 145 73 145H79Q82 145 82 142V120.25L0 58.75Z" />
        <use href="#logo-b" />
        <use href="#logo-b" transform="rotate(180 60 80)" />
      </g>
    </svg>
  );
}
