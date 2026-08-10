"use client"

import { useEffect, useState } from "react"
import { Star } from "lucide-react"

type ReviewItem = {
  id: string
  authorName?: string
  role?: string
  rating?: number
  comment?: string
  targetName?: string
  sourceLabel?: string
}

export default function HomepageReviews() {
  const [reviews, setReviews] = useState<ReviewItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadReviews = async () => {
      try {
        const response = await fetch("/api/reviews?mode=feed&limit=6")
        const data = await response.json().catch(() => ({}))
        if (response.ok && data?.reviews) {
          setReviews(data.reviews as ReviewItem[])
        }
      } catch (error) {
        console.error("Failed to load homepage reviews", error)
      } finally {
        setLoading(false)
      }
    }

    void loadReviews()
  }, [])

  return (
    <section className="section reviews-bg" id="reviews">
      <div className="section-inner">
        <div className="section-header center">
          <div className="section-label">What People Say</div>
          <h2 className="section-title">Trusted by earners, advertisers, vendors, and customers</h2>
          <p className="section-sub">Real feedback from people using Pamba to earn, advertise, and pay bills.</p>
        </div>

        {loading ? (
          <div className="reviews-loading">Loading reviews...</div>
        ) : (
          <div className="reviews-grid">
            {reviews.length ? (
              reviews.map((review) => (
                <article key={review.id} className="review-card">
                  <div className="review-rating" aria-label={`${review.rating || 0} out of 5 stars`}>
                    {Array.from({ length: Math.max(1, Math.min(5, Number(review.rating || 0))) }).map((_, index) => (
                      <Star key={index} className="review-star" />
                    ))}
                  </div>
                  <p className="review-comment">{review.comment || "Great experience."}</p>
                  <div className="review-meta">
                    <span className="review-author">{review.authorName || "Pamba user"}</span>
                    <span className="review-role">{String(review.role || "user").toUpperCase()}</span>
                  </div>
                  <div className="review-target">{review.targetName || review.sourceLabel || "Pamba"}</div>
                </article>
              ))
            ) : (
              <div className="reviews-empty">No reviews are available right now.</div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
