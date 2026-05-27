import { Navbar } from './Navbar';

export function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white bg-grid bg-grid-size font-inter">
      <Navbar />
      <main className="pt-16">{children}</main>
    </div>
  );
}
