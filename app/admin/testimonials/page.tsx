import { PanelErrorBoundary } from "@/components/error-boundary";
import { TestimonialsManager } from "@/components/admin/testimonials-manager";

// Unedited testimonials submitted by organizers and officials from their
// dashboards. Featuring one (only possible when the author agreed to public
// use) puts it on the public landing page.
export default function AdminTestimonialsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Testimonials</h1>
        <p className="text-muted">
          Exactly what users wrote about Zaroda Sports. Featured testimonials appear on the public homepage.
        </p>
      </div>
      <PanelErrorBoundary fallbackTitle="Testimonials failed to load">
        <TestimonialsManager />
      </PanelErrorBoundary>
    </div>
  );
}
