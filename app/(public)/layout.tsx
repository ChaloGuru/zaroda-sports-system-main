// The menu ribbon and footer come from the root layout (app/layout.tsx).
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <main className="flex-1">{children}</main>;
}
