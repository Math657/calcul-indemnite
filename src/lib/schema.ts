const SITE = 'https://calcul-indemnite.fr';
const BRAND = 'CalculIndemnité';
const LANG = 'fr-FR';

export const organizationSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE}#organization`,
  name: BRAND,
  url: SITE,
  inLanguage: LANG,
});

export const websiteSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE}#website`,
  url: SITE,
  name: BRAND,
  inLanguage: LANG,
  publisher: { '@id': `${SITE}#organization` },
});

export const breadcrumbSchema = (items: { name: string; path: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, idx) => ({
    '@type': 'ListItem',
    position: idx + 1,
    name: item.name,
    item: `${SITE}${item.path}`,
  })),
});

// Used for /simulateur-* pages. applicationCategory is UtilitiesApplication
// (not FinanceApplication) — these are calculation tools, not investment
// vehicles. priceCurrency EUR. inLanguage fr-FR.
export const simulatorSchema = (params: {
  name: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified: string;
}) => ({
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: params.name,
  description: params.description,
  url: `${SITE}${params.path}`,
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Web',
  inLanguage: LANG,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  datePublished: params.datePublished,
  dateModified: params.dateModified,
});

export const faqSchema = (faqs: { question: string; answer: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.question,
    acceptedAnswer: { '@type': 'Answer', text: f.answer },
  })),
});
