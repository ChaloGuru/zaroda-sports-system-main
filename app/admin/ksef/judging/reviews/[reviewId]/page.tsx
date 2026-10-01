import { PanelErrorBoundary } from "@/components/error-boundary";
import { ReviewDetail } from "@/components/ksef/review-detail";

export default async function KsefAdminReviewPage(props: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await props.params;
  return (
    <PanelErrorBoundary fallbackTitle="Review failed to load">
      <ReviewDetail reviewId={reviewId} backHref="/admin/ksef/judging" />
    </PanelErrorBoundary>
  );
}
