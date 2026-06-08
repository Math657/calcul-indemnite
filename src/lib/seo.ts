const SITE = 'https://calcul-indemnite.fr';
const DEFAULT_OG_PATH = '/og/default.png';

export interface SeoProps {
  title: string;
  description: string;
  path: string;
  /** Absolute URL or site-relative path. Site-relative paths get prefixed with the canonical origin. */
  ogImage?: string;
  noindex?: boolean;
}

export interface ResolvedSeo {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  ogImage: string;
}

function absolutize(image: string): string {
  if (image.startsWith('http://') || image.startsWith('https://')) return image;
  return `${SITE}${image.startsWith('/') ? image : '/' + image}`;
}

export function buildSeo(input: SeoProps): ResolvedSeo {
  const cleanPath = input.path === '/' ? '/' : input.path.replace(/\/+$/, '');
  const canonical = cleanPath === '/' ? SITE : `${SITE}${cleanPath}`;

  if (import.meta.env.DEV) {
    if (input.title.length > 65 || input.title.length < 30) {
      console.warn(`[seo] title length ${input.title.length} outside 30-65 for ${cleanPath}`);
    }
    if (input.description.length > 170 || input.description.length < 120) {
      console.warn(`[seo] description length ${input.description.length} outside 120-170 for ${cleanPath}`);
    }
  }

  return {
    title: input.title,
    description: input.description,
    canonical,
    robots: input.noindex
      ? 'noindex, follow'
      : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
    ogImage: absolutize(input.ogImage ?? DEFAULT_OG_PATH),
  };
}
