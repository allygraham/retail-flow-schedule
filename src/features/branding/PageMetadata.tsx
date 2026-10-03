import { useEffect } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useBranding } from './BrandingProvider';

export function PageMetadata() {
  const { business } = useAuth();
  const { savedTheme } = useBranding();
  const companyName = business
    ? savedTheme.displayName?.trim() || business.name.trim()
    : '';

  useEffect(() => {
    const title = companyName ? `${companyName} | Lavoro` : 'Staff scheduling | Lavoro';
    const description = companyName
      ? `Manage staff rotas, shifts and leave for ${companyName} with Lavoro.`
      : 'Manage staff rotas, shifts and leave with Lavoro.';
    document.title = title;

    const entries = [
      ['name', 'description', description],
      ['name', 'author', companyName || 'Lavoro'],
      ['property', 'og:title', title],
      ['property', 'og:description', description],
      ['property', 'og:site_name', companyName || 'Lavoro'],
      ['name', 'twitter:title', title],
      ['name', 'twitter:description', description],
    ];
    for (const [attribute, key, content] of entries) {
      let meta = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attribute, key);
        document.head.appendChild(meta);
      }
      meta.content = content;
    }
  }, [companyName]);

  return null;
}
