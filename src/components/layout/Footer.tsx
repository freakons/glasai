import { siteConfig } from '@/config/site';

export function Footer() {
  return (
    <div className="footer-bar">
      <span className="fb-brand">{siteConfig.name}</span>
      <span>&copy; {new Date().getFullYear()} {siteConfig.name} &middot; AI Intelligence Terminal</span>
    </div>
  );
}
