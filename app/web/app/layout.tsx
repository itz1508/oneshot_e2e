import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'OneShot — Workspace', description: 'Research, review, and build in your selected workspace.' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
